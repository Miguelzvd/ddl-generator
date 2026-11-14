/**
 * Plano de uma tabela: colunas já em tipos Oracle, PK, FKs, índices, tabelas
 * de junção e as suposições (o que foi presumido e se o usuário resolveu).
 */
import type { Assumption, ColumnModel, ColumnOverride, EntityModel, EntityOverride, GenerateOptions, JoinColumnModel, RelationModel } from '../model';
import { isReserved } from './ident';
import { planJoinTable, type JoinTablePlan } from './joinTable';
import { columnName, constraintName, entityId, findColumn, lookupTarget, qualified, type Registry } from './naming';
import { columnSnippet } from './snippet';
import { baseType, mapColumnType } from './typeMap';

export interface PlannedColumn {
  name: string;
  property: string;
  sql: string;
  nullable: boolean;
  default?: string;
  identity: boolean;
  /** Suposições abertas (viram `-- ATENÇÃO:`). */
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
  /** Por que a FK sai comentada. */
  reason?: string;
  /** Decisão do usuário sobre a FK. */
  note?: string;
  description: string;
}

export interface PlannedIndex {
  name: string;
  table: string;
  columns: string[];
  unique: boolean;
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
  /** Relações sem FK deste lado. */
  inverseRelations: string[];
  assumptions: Assumption[];
  /** Suposições abertas, em texto. */
  warnings: string[];
  /** Decisões que valem para a tabela toda. */
  tableNotes: string[];
}

/** Correção efetiva de uma coluna: a do usuário ou o tipo adotado da PK de destino (`viaFk`). */
type EffectiveOverride = ColumnOverride & { precision?: number; scale?: number; viaFk?: string };

/** Registra suposições, marcando como resolvidas as corrigidas ou aceitas. */
export class Collector {
  list: Assumption[] = [];
  constructor(private accepted: Set<string>) {}

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

/** O que o planTable compartilha com as FKs e as tabelas de junção. */
export interface PlanCtx {
  e: EntityModel;
  tableName: string;
  qn: string;
  columns: PlannedColumn[];
  ov?: EntityOverride;
  effOv: Record<string, EffectiveOverride>;
  registry: Registry;
  opts: GenerateOptions;
  col: Collector;
  tableNotes: string[];
}

/** Coluna com a correção do usuário aplicada. */
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

  if (!c.name) {
    mine.push(
      col.add(
        { key: `col:${p}:name`, kind: 'column-name', column: p, label, text: `nome da coluna não informado; usado o nome da propriedade "${p}"`, current: label },
        ov?.name ? { note: `nome da coluna definido manualmente (${ov.name})`, snippet } : undefined,
      ),
    );
  }
  if (m0.issue === 'type' || mf.issue === 'type') {
    mine.push(
      col.add(
        { key: `col:${p}:type`, kind: 'type', column: p, label, text: (m0.issue === 'type' ? m0.warning : mf.warning) ?? '', current: eff.type ?? mf.sql.toLowerCase() },
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
    mine.push(
      col.add(
        { key: `col:${p}:length`, kind: 'varchar-length', column: p, label, text: (m0.issue === 'length' ? m0.warning : mf.warning) ?? '', current: String(eff.length ?? 255) },
        mf.issue !== 'length' ? { note, snippet } : undefined,
      ),
    );
  }
  if (isReserved(label)) {
    mine.push(col.add({ key: `col:${p}:reserved`, kind: 'other', column: p, label, text: `"${label.toUpperCase()}" é palavra reservada do Oracle; o nome vai entre aspas` }));
  }

  return {
    name: label,
    property: p,
    sql: mf.sql,
    nullable: c.nullable,
    default: c.default,
    identity: c.generated && !opts.oracle11g,
    warnings: mine.filter((a) => !a.resolved).map((a) => a.text),
    // A nota do ajuste via FK sai junto da FK, não repetida na coluna.
    notes: mine.filter((a) => a.resolved && !(a.kind === 'varchar-length' && ov?.viaFk)).map((a) => a.note ?? ''),
  };
}

/** Destino da FK: coluna referenciada (ou a PK) da entity alvo, ou o motivo de não haver. */
function resolveTarget(rel: RelationModel, jc: JoinColumnModel | undefined, registry: Registry): { target?: EntityModel; refCol?: ColumnModel; reason?: string } {
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

/** Relação que guarda a FK nesta tabela. */
const isOwning = (rel: RelationModel) => rel.kind === 'ManyToOne' || (rel.kind === 'OneToOne' && rel.joinColumns.length > 0);

/** Correções por propriedade: as do usuário + os tipos adotados da PK de destino. */
function effectiveOverrides(e: EntityModel, ov: EntityOverride | undefined, registry: Registry) {
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

/** FK de uma relação ManyToOne/OneToOne; cria a coluna se ela não foi declarada. */
function planFk(ctx: PlanCtx, rel: RelationModel): PlannedFk {
  const { e, tableName, qn, columns, ov, effOv, registry, opts, col, tableNotes } = ctx;
  const jc = rel.joinColumns[0];
  const { target, refCol, reason } = resolveTarget(rel, jc, registry);
  const refName = refCol ? columnName(refCol) : (jc?.referencedColumnName ?? 'ID');
  let fkColName = jc?.name;
  if (!fkColName) {
    fkColName = `${rel.property}_${refName}`.toUpperCase();
    const a = col.add({ key: `fk:${rel.property}:colname`, kind: 'other', text: `${rel.property}: nome da coluna da FK não informado; usado ${fkColName}` });
    if (a.resolved && a.note) tableNotes.push(a.note);
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
    note = col.add({ key: `fk:${fkColName}:target`, kind: 'other', text: `FK ${fkColName} sai comentada: ${reason}` }).note;
  } else if (refCol) {
    const refSql = mapColumnType(refCol).sql;
    const original = e.columns.find((c) => columnName(c) === fkColName);
    const originalSql = original ? mapColumnType(original).sql : fkCol.sql;
    if (baseType(refSql) !== baseType(originalSql)) {
      const choice = ov?.fks[fkColName];
      const mismatch = `tipo da coluna ${fkColName} (${originalSql}) é diferente da coluna referenciada ${refName} (${refSql}); o Oracle recusaria a FK (ORA-02267)`;
      const fixedCol = original && choice === 'adopt' ? applyOverride(original, effOv[original.property]) : undefined;
      const fix =
        choice === 'adopt'
          ? { note: `tipo de ${fkColName} ajustado ao da PK de destino (${refSql})`, snippet: fixedCol ? columnSnippet(fixedCol) : undefined }
          : choice === 'keep'
            ? { note: `FK ${fkColName} mantida comentada por decisão manual` }
            : undefined;
      note = col.add({ key: `fk:${fkColName}:type`, kind: 'fk-type', fkColumn: fkColName, label: fkColName, text: `FK ${fkColName} sai comentada: ${mismatch}` }, fix).note;
      if (choice !== 'adopt') {
        active = false;
        fkReason = mismatch;
      }
    }
  }

  return {
    name: constraintName(`FK_${tableName}_${fkColName}`, opts),
    table: qn,
    columns: [fkColName],
    refTable: target ? qualified(target.schema, target.tableName) : rel.targetClass,
    refColumns: [refName],
    active,
    reason: active ? undefined : fkReason,
    note,
    description: `${rel.kind} ${e.className}.${rel.property} → ${rel.targetClass}`,
  };
}

export function planTable(e: EntityModel, registry: Registry, opts: GenerateOptions): TablePlan {
  const ov = opts.overrides?.[entityId(e)];
  const col = new Collector(new Set(ov?.accepted ?? []));
  const tableNotes: string[] = [];

  const tableName = ov?.tableName || e.tableName;
  const qn = qualified(e.schema, tableName);
  if (e.tableNameDerived) {
    const a = col.add(
      { key: 'table:name', kind: 'table-name', text: `nome da tabela não informado; derivado da classe: ${e.tableName}`, current: tableName },
      ov?.tableName ? { note: `nome da tabela definido manualmente (${ov.tableName})`, snippet: `@Entity('${qualified(e.schema, ov.tableName)}')` } : undefined,
    );
    if (a.resolved && a.note) tableNotes.push(a.note);
  }

  const effOv = effectiveOverrides(e, ov, registry);
  const columns = e.columns.map((c) => planColumn(c, opts, effOv[c.property], col));
  const pk = columns.filter((_, i) => e.columns[i].primary).map((c) => c.name);
  const fks: PlannedFk[] = [];
  const joinTables: JoinTablePlan[] = [];
  const inverseRelations: string[] = [];
  const ctx: PlanCtx = { e, tableName, qn, columns, ov, effOv, registry, opts, col, tableNotes };

  for (const rel of e.relations) {
    if (rel.kind === 'ManyToMany') {
      if (rel.joinTable) joinTables.push(planJoinTable(ctx, rel));
      else inverseRelations.push(`${rel.property}: ManyToMany com ${rel.targetClass} (lado inverso; a tabela de junção fica do outro lado)`);
    } else if (!isOwning(rel)) {
      inverseRelations.push(`${rel.property}: ${rel.kind} com ${rel.targetClass} (lado inverso; a FK fica na outra tabela)`);
    } else {
      fks.push(planFk(ctx, rel));
    }
  }

  const indices = e.indices.map((ix) => {
    const cols = ix.columns.map((p) => {
      const c = findColumn(e, p);
      return c ? columnName(applyOverride(c, effOv[c.property])) : p;
    });
    return { name: constraintName(ix.name ?? `IX_${tableName}_${cols.join('_')}`, opts), table: qn, columns: cols, unique: ix.unique };
  });

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
    warnings: col.list.filter((a) => !a.resolved).map((a) => (a.label && a.kind !== 'fk-type' ? `${a.label}: ${a.text}` : a.text)),
    tableNotes,
  };
}
