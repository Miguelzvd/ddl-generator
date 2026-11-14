import type {
  Assumption,
  ColumnModel,
  ColumnOverride,
  EntityModel,
  EntityOverride,
  GenerateOptions,
  JoinColumnModel,
  RelationModel,
} from '../model';
import { isReserved } from './ident';
import { baseType, mapColumnType } from './typeMap';

export interface PlannedColumn {
  name: string;
  property: string;
  sql: string;
  nullable: boolean;
  default?: string;
  identity: boolean;
  /** Suposições não resolvidas (viram `-- ATENÇÃO:`). */
  warnings: string[];
  /** Decisões do usuário (viram `-- Revisado:`). */
  notes: string[];
  fromRelation?: boolean;
}

export interface PlannedFk {
  name: string;
  table: string;
  columns: string[];
  refTable: string;
  refColumns: string[];
  active: boolean;
  /** Motivo de a FK sair comentada. */
  reason?: string;
  /** Decisão do usuário sobre esta FK. */
  note?: string;
  description: string;
}

export interface PlannedIndex {
  name: string;
  table: string;
  columns: string[];
  unique: boolean;
}

export interface JoinTablePlan {
  qualifiedName: string;
  tableName: string;
  description: string;
  columns: PlannedColumn[];
  pk: string[];
  pkName: string;
  fks: PlannedFk[];
}

export interface TablePlan {
  entity: EntityModel;
  tableName: string;
  qualifiedName: string;
  columns: PlannedColumn[];
  pk: string[];
  pkName: string;
  sequenceName?: string;
  fks: PlannedFk[];
  indices: PlannedIndex[];
  joinTables: JoinTablePlan[];
  /** Relações sem FK neste lado (OneToMany, lado inverso). */
  inverseRelations: string[];
  /** Todas as suposições, resolvidas ou não. */
  assumptions: Assumption[];
  /** Suposições não resolvidas, em texto para o usuário. */
  warnings: string[];
  /** Decisões que valem para a tabela toda (nome, junções…). */
  tableNotes: string[];
}

/** Chaves: nome da classe (primeira encontrada) e `arquivo-sem-extensão::Classe`. */
export type Registry = Map<string, EntityModel>;

export function fileKey(file: string, className: string): string {
  return `${file.replace(/\\/g, '/').replace(/\.(ts|js)$/, '')}::${className}`;
}

export function entityId(e: { file: string; className: string }): string {
  return `${e.file}#${e.className}`;
}

/** Acha a entity alvo de uma relação, preferindo a classe importada pelo arquivo. */
export function lookupTarget(rel: RelationModel, registry: Registry): EntityModel | undefined {
  if (rel.targetFile) {
    const byFile = registry.get(`${rel.targetFile}::${rel.targetClass}`) ?? registry.get(`${rel.targetFile}/index::${rel.targetClass}`);
    if (byFile) return byFile;
  }
  return registry.get(rel.targetClass);
}

export function qualified(schema: string | undefined, table: string): string {
  return schema ? `${schema}.${table}` : table;
}

export function constraintName(raw: string, opts: GenerateOptions): string {
  const max = opts.oracle11g ? 30 : 128;
  const clean = raw.toUpperCase().replace(/[^A-Z0-9_$#]/g, '_');
  return clean.length > max ? clean.slice(0, max) : clean;
}

export function columnName(c: ColumnModel): string {
  return c.name ?? c.property;
}

/** Registra suposições, marcando como resolvidas as corrigidas ou aceitas. */
class Collector {
  readonly list: Assumption[] = [];
  constructor(private readonly accepted: Set<string>) {}

  add(a: Omit<Assumption, 'resolved'>, fix?: { note: string; snippet?: string }): Assumption {
    const accepted = this.accepted.has(a.key);
    const full: Assumption = {
      ...a,
      resolved: !!fix || accepted,
      note: fix ? fix.note : accepted ? `suposição aceita — ${a.text}` : undefined,
      snippet: fix?.snippet,
    };
    this.list.push(full);
    return full;
  }
}

/** Formata o default (já em SQL) como valor de decorator TypeORM. */
function defaultForDecorator(sql: string): string {
  if (/^'.*'$/s.test(sql)) return `'${sql.slice(1, -1).replace(/''/g, "'").replace(/'/g, "\\'")}'`;
  if (/^-?\d+(\.\d+)?$/.test(sql)) return sql;
  return `() => "${sql.replace(/"/g, '\\"')}"`;
}

/** Decorator TypeORM equivalente à coluna, para o usuário colar na entity. */
export function columnSnippet(c: ColumnModel): string {
  const dec = c.decorator ?? 'Column';
  const parts: string[] = [];
  if (c.name) parts.push(`name: '${c.name}'`);
  if (dec === 'PrimaryGeneratedColumn') return `@PrimaryGeneratedColumn({ ${parts.join(', ')} })`;
  if (c.length !== undefined) parts.push(`length: ${c.length}`);
  if (c.precision !== undefined) parts.push(`precision: ${c.precision}`);
  if (c.scale !== undefined) parts.push(`scale: ${c.scale}`);
  if (c.nullable && !c.primary && dec !== 'ViewColumn') parts.push('nullable: true');
  if (c.primary && dec === 'Column') parts.push('primary: true');
  if (c.unique) parts.push('unique: true');
  if (c.default !== undefined) parts.push(`default: ${defaultForDecorator(c.default)}`);
  const typeArg = c.type ? `'${c.type}', ` : '';
  return `@${dec}(${typeArg}{ ${parts.join(', ')} })`;
}

interface EffectiveOverride extends ColumnOverride {
  precision?: number;
  scale?: number;
  /** Tipo veio da decisão "usar o tipo da PK de destino" desta FK. */
  viaFk?: string;
}

function applyOverride(c: ColumnModel, ov: EffectiveOverride | undefined): ColumnModel {
  if (!ov) return c;
  return {
    ...c,
    name: ov.name ?? c.name,
    type: ov.type ?? c.type,
    length: ov.length ?? (ov.viaFk ? undefined : c.length),
    precision: ov.viaFk ? ov.precision : c.precision,
    scale: ov.viaFk ? ov.scale : c.scale,
  };
}

function planColumn(c: ColumnModel, opts: GenerateOptions, ov: EffectiveOverride | undefined, col: Collector): PlannedColumn {
  const eff = applyOverride(c, ov);
  const m0 = mapColumnType(c);
  const mf = mapColumnType(eff);
  const p = c.property;
  const label = columnName(eff);
  const snippet = ov ? columnSnippet(eff) : undefined;
  const mine: Assumption[] = [];
  const push = (a: Assumption) => mine.push(a);

  if (!c.name) {
    push(
      col.add(
        { key: `col:${p}:name`, kind: 'column-name', column: p, label, text: `nome da coluna não informado; usado o nome da propriedade "${p}"`, current: label },
        ov?.name ? { note: `nome da coluna definido manualmente (${ov.name})`, snippet } : undefined,
      ),
    );
  }
  if (m0.issue === 'type' || mf.issue === 'type') {
    push(
      col.add(
        { key: `col:${p}:type`, kind: 'type', column: p, label, text: (m0.issue === 'type' ? m0.warning : mf.warning)!, current: eff.type ?? mf.sql.toLowerCase() },
        ov?.type && mf.issue !== 'type' ? { note: `tipo definido manualmente (${mf.sql})`, snippet } : undefined,
      ),
    );
  }
  if (m0.issue === 'length' || mf.issue === 'length') {
    const note = ov?.viaFk
      ? `tipo de ${label} ajustado ao da PK de destino (${mf.sql})`
      : ov?.length
        ? `tamanho definido manualmente (${mf.sql})`
        : `coluna definida manualmente como ${mf.sql}`;
    push(
      col.add(
        { key: `col:${p}:length`, kind: 'varchar-length', column: p, label, text: (m0.issue === 'length' ? m0.warning : mf.warning)!, current: String(eff.length ?? 255) },
        mf.issue !== 'length' ? { note, snippet } : undefined,
      ),
    );
  }
  if (isReserved(label)) {
    push(col.add({ key: `col:${p}:reserved`, kind: 'other', column: p, label, text: `"${label.toUpperCase()}" é palavra reservada do Oracle; o nome vai entre aspas` }));
  }

  return {
    name: label,
    property: p,
    sql: mf.sql,
    nullable: c.nullable,
    default: c.default,
    identity: c.generated && !opts.oracle11g,
    warnings: mine.filter((a) => !a.resolved).map((a) => a.text),
    notes: mine.filter((a) => a.resolved && !(a.kind === 'varchar-length' && ov?.viaFk)).map((a) => a.note!),
  };
}

function findColumn(e: EntityModel, ref: string): ColumnModel | undefined {
  return e.columns.find((c) => columnName(c) === ref) ?? e.columns.find((c) => c.property === ref);
}

/** Resolve o destino da FK: coluna referenciada (ou PK) da entity alvo. */
function resolveTarget(
  rel: RelationModel,
  jc: JoinColumnModel | undefined,
  registry: Registry,
): { target?: EntityModel; refCol?: ColumnModel; reason?: string } {
  const target = lookupTarget(rel, registry);
  if (!target) return { reason: `a entity de destino "${rel.targetClass}" não foi carregada` };
  if (target.kind === 'view') {
    return { target, reason: `o destino "${qualified(target.schema, target.tableName)}" é uma view; o Oracle não aceita FK para view` };
  }
  if (jc?.referencedColumnName) {
    const refCol = findColumn(target, jc.referencedColumnName);
    if (!refCol) return { target, reason: `a coluna referenciada "${jc.referencedColumnName}" não existe em ${target.className}` };
    return { target, refCol };
  }
  const pks = target.columns.filter((c) => c.primary);
  if (pks.length === 0) return { target, reason: `${target.className} não tem chave primária para ser referenciada` };
  if (pks.length > 1) return { target, reason: `${target.className} tem chave primária composta; informe referencedColumnName` };
  return { target, refCol: pks[0] };
}

const isOwning = (rel: RelationModel) => rel.kind === 'ManyToOne' || (rel.kind === 'OneToOne' && rel.joinColumns.length > 0);

/** Overrides efetivos por propriedade: os do usuário + tipos adotados por FK. */
function effectiveOverrides(e: EntityModel, ov: EntityOverride | undefined, registry: Registry): Record<string, EffectiveOverride> {
  const out: Record<string, EffectiveOverride> = { ...(ov?.columns ?? {}) };
  for (const rel of e.relations) {
    const jc = rel.joinColumns[0];
    if (!isOwning(rel) || !jc?.name || ov?.fks[jc.name] !== 'adopt') continue;
    const { refCol } = resolveTarget(rel, jc, registry);
    const col = e.columns.find((c) => columnName(c) === jc.name);
    if (!refCol || !col) continue;
    out[col.property] = {
      ...out[col.property],
      type: refCol.type ?? baseType(mapColumnType(refCol).sql).toLowerCase(),
      length: refCol.length,
      precision: refCol.precision,
      scale: refCol.scale,
      viaFk: jc.name,
    };
  }
  return out;
}

export function planTable(e: EntityModel, registry: Registry, opts: GenerateOptions): TablePlan {
  const id = entityId(e);
  const ov = opts.overrides?.[id];
  const col = new Collector(new Set(ov?.accepted ?? []));
  const tableNotes: string[] = [];

  const tableName = ov?.tableName || e.tableName;
  const qn = qualified(e.schema, tableName);
  if (e.tableNameDerived) {
    const a = col.add(
      { key: 'table:name', kind: 'table-name', text: `nome da tabela não informado; derivado da classe: ${e.tableName}`, current: tableName },
      ov?.tableName ? { note: `nome da tabela definido manualmente (${ov.tableName})`, snippet: `@Entity('${qualified(e.schema, ov.tableName)}')` } : undefined,
    );
    if (a.resolved) tableNotes.push(a.note!);
  }

  const effOv = effectiveOverrides(e, ov, registry);
  const columns = e.columns.map((c) => planColumn(c, opts, effOv[c.property], col));
  const pk = columns.filter((_, i) => e.columns[i].primary).map((c) => c.name);
  const fks: PlannedFk[] = [];
  const joinTables: JoinTablePlan[] = [];
  const inverseRelations: string[] = [];

  for (const rel of e.relations) {
    if (rel.kind === 'ManyToMany') {
      if (rel.joinTable) joinTables.push(planJoinTable(e, tableName, rel, registry, opts, col, tableNotes));
      else inverseRelations.push(`${rel.property}: ManyToMany com ${rel.targetClass} (lado inverso; a tabela de junção fica do outro lado)`);
      continue;
    }
    if (!isOwning(rel)) {
      inverseRelations.push(`${rel.property}: ${rel.kind} com ${rel.targetClass} (lado inverso; a FK fica na outra tabela)`);
      continue;
    }

    const jc = rel.joinColumns[0];
    const { target, refCol, reason } = resolveTarget(rel, jc, registry);
    const refName = refCol ? columnName(refCol) : jc?.referencedColumnName ?? 'ID';
    let fkColName = jc?.name;
    if (!fkColName) {
      fkColName = `${rel.property}_${refName}`.toUpperCase();
      const a = col.add({ key: `fk:${rel.property}:colname`, kind: 'other', text: `${rel.property}: nome da coluna da FK não informado; usado ${fkColName}` });
      if (a.resolved) tableNotes.push(a.note!);
    }

    let fkCol = columns.find((c) => c.name === fkColName);
    if (!fkCol) {
      const refSql = refCol ? mapColumnType(refCol).sql : undefined;
      fkCol = {
        name: fkColName,
        property: rel.property,
        sql: refSql ?? 'NUMBER',
        nullable: true,
        identity: false,
        warnings: [`coluna criada a partir da relação ${rel.kind} "${rel.property}"${refSql ? '' : '; tipo presumido NUMBER'}`],
        notes: [],
        fromRelation: true,
      };
      columns.push(fkCol);
    }

    let active = !reason;
    let fkReason = reason;
    let note: string | undefined;
    if (reason) {
      const a = col.add({ key: `fk:${fkColName}:target`, kind: 'other', text: `FK ${fkColName} sai comentada: ${reason}` });
      note = a.note;
    } else if (refCol) {
      const refSql = mapColumnType(refCol).sql;
      const original = e.columns.find((c) => columnName(c) === fkColName);
      const originalSql = original ? mapColumnType(original).sql : fkCol.sql;
      if (baseType(refSql) !== baseType(originalSql)) {
        const choice = ov?.fks[fkColName];
        const mismatch = `tipo da coluna ${fkColName} (${originalSql}) é diferente da coluna referenciada ${refName} (${refSql}); o Oracle recusaria a FK (ORA-02267)`;
        const fixedCol = original && choice === 'adopt' ? applyOverride(original, effOv[original.property]) : undefined;
        const a = col.add(
          { key: `fk:${fkColName}:type`, kind: 'fk-type', fkColumn: fkColName, label: fkColName, text: `FK ${fkColName} sai comentada: ${mismatch}` },
          choice === 'adopt'
            ? { note: `tipo de ${fkColName} ajustado ao da PK de destino (${refSql})`, snippet: fixedCol ? columnSnippet(fixedCol) : undefined }
            : choice === 'keep'
              ? { note: `FK ${fkColName} mantida comentada por decisão manual` }
              : undefined,
        );
        note = a.note;
        if (choice !== 'adopt') {
          active = false;
          fkReason = mismatch;
        }
      }
    }

    const refTable = target ? qualified(target.schema, target.tableName) : rel.targetClass;
    fks.push({
      name: constraintName(`FK_${tableName}_${fkColName}`, opts),
      table: qn,
      columns: [fkColName],
      refTable,
      refColumns: [refName],
      active,
      reason: active ? undefined : fkReason,
      note,
      description: `${rel.kind} ${e.className}.${rel.property} → ${rel.targetClass}`,
    });
  }

  const indices: PlannedIndex[] = e.indices.map((ix) => {
    const cols = ix.columns.map((p) => {
      const c = findColumn(e, p);
      return c ? columnName(applyOverride(c, effOv[c.property])) : p;
    });
    return {
      name: constraintName(ix.name ?? `IX_${tableName}_${cols.join('_')}`, opts),
      table: qn,
      columns: cols,
      unique: ix.unique,
    };
  });

  const warnings = col.list.filter((a) => !a.resolved).map((a) => (a.label && a.kind !== 'fk-type' ? `${a.label}: ${a.text}` : a.text));
  const hasGenerated = e.columns.some((c) => c.generated);
  return {
    entity: e,
    tableName,
    qualifiedName: qn,
    columns,
    pk,
    pkName: constraintName(`PK_${tableName}`, opts),
    sequenceName: hasGenerated && opts.oracle11g ? qualified(e.schema, constraintName(`SQ_${tableName}`, opts)) : undefined,
    fks,
    indices,
    joinTables,
    inverseRelations,
    assumptions: col.list,
    warnings,
    tableNotes,
  };
}

function planJoinTable(
  e: EntityModel,
  ownerTableName: string,
  rel: RelationModel,
  registry: Registry,
  opts: GenerateOptions,
  col: Collector,
  tableNotes: string[],
): JoinTablePlan {
  const jt = rel.joinTable!;
  const target = lookupTarget(rel, registry);
  const targetTable = target?.tableName ?? rel.targetClass.toUpperCase();
  let tableName = jt.name;
  if (!tableName) {
    tableName = `${ownerTableName}_${rel.property}_${targetTable}`.toUpperCase();
    const a = col.add({ key: `jt:${rel.property}:name`, kind: 'other', text: `${rel.property}: nome da tabela de junção não informado; usado ${tableName}` });
    if (a.resolved) tableNotes.push(a.note!);
  }
  const qn = qualified(e.schema, tableName);

  const side = (
    owner: EntityModel | undefined,
    ownerTable: string,
    jc: JoinColumnModel | undefined,
    label: string,
  ): { col: PlannedColumn; fk: PlannedFk } => {
    const pkCol = owner?.columns.find((c) => (jc?.referencedColumnName ? findColumn(owner, jc.referencedColumnName) === c : c.primary));
    const refName = pkCol ? columnName(pkCol) : jc?.referencedColumnName ?? 'ID';
    const name = jc?.name ?? `${ownerTable}_${refName}`.toUpperCase();
    let reason: string | undefined;
    if (!owner) reason = `a entity de destino "${rel.targetClass}" não foi carregada`;
    else if (owner.kind === 'view') reason = `o destino é uma view; o Oracle não aceita FK para view`;
    else if (!pkCol) reason = `${owner.className} não tem chave primária para ser referenciada`;
    let note: string | undefined;
    if (reason) note = col.add({ key: `jt:${name}:target`, kind: 'other', text: `FK ${name} da tabela de junção sai comentada: ${reason}` }).note;
    return {
      col: {
        name,
        property: label,
        sql: pkCol ? mapColumnType(pkCol).sql : 'NUMBER',
        nullable: false,
        identity: false,
        warnings: pkCol ? [] : ['tipo presumido NUMBER'],
        notes: [],
      },
      fk: {
        name: constraintName(`FK_${tableName}_${name}`, opts),
        table: qn,
        columns: [name],
        refTable: owner ? qualified(owner.schema, owner.tableName) : rel.targetClass,
        refColumns: [refName],
        active: !reason,
        reason,
        note,
        description: `junção ${e.className}.${rel.property} ↔ ${rel.targetClass}`,
      },
    };
  };

  const a = side(e, ownerTableName, jt.joinColumn, e.className);
  const b = side(target, targetTable, jt.inverseJoinColumn, rel.targetClass);

  return {
    qualifiedName: qn,
    tableName,
    description: `Tabela de junção ManyToMany entre ${e.className} e ${rel.targetClass}`,
    columns: [a.col, b.col],
    pk: [a.col.name, b.col.name],
    pkName: constraintName(`PK_${tableName}`, opts),
    fks: [a.fk, b.fk],
  };
}
