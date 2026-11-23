/** Tabela de junção de uma relação ManyToMany com @JoinTable. */
import type { EntityModel, JoinColumnModel, RelationModel } from '../model';
import { columnName, constraintName, findColumn, lookupTarget, ownerFor, qualified } from './naming';
import type { PlanCtx, PlannedColumn, PlannedFk } from './plan';
import { mapColumnType } from './typeMap';

export interface JoinTablePlan {
  qualifiedName: string;
  tableName: string;
  description: string;
  columns: PlannedColumn[];
  pk: string[];
  pkName: string;
  fks: PlannedFk[];
}

export function planJoinTable(ctx: PlanCtx, rel: RelationModel): JoinTablePlan {
  const { e, tableName: ownerTableName, registry, opts, col, tableNotes } = ctx;
  const jt = rel.joinTable!;
  const target = lookupTarget(rel, registry);
  const targetTable = target?.tableName ?? rel.targetClass.toUpperCase();
  let tableName = jt.name;
  if (!tableName) {
    tableName = `${ownerTableName}_${rel.property}_${targetTable}`.toUpperCase();
    const a = col.add({ key: `jt:${rel.property}:name`, kind: 'other', text: `${rel.property}: nome da tabela de junção não informado; usado ${tableName}` });
    if (a.resolved && a.note) tableNotes.push(a.note);
  }
  const qn = qualified(ownerFor(e.schema, opts), tableName);

  /** Uma das duas colunas da junção, com a FK para o seu lado. */
  const side = (owner: EntityModel | undefined, ownerTable: string, jc: JoinColumnModel | undefined, label: string) => {
    const pkCol = owner?.columns.find((c) => (jc?.referencedColumnName ? findColumn(owner, jc.referencedColumnName) === c : c.primary));
    const refName = pkCol ? columnName(pkCol) : (jc?.referencedColumnName ?? 'ID');
    const name = jc?.name ?? `${ownerTable}_${refName}`.toUpperCase();
    let reason: string | undefined;
    if (!owner) reason = `a entity de destino "${rel.targetClass}" não foi carregada`;
    else if (owner.kind === 'view') reason = 'o destino é uma view; o Oracle não aceita FK para view';
    else if (!pkCol) reason = `${owner.className} não tem chave primária para ser referenciada`;
    const note = reason ? col.add({ key: `jt:${name}:target`, kind: 'other', text: `FK ${name} da tabela de junção sai comentada: ${reason}` }).note : undefined;
    const column: PlannedColumn = {
      name,
      property: label,
      sql: pkCol ? mapColumnType(pkCol).sql : 'NUMBER',
      nullable: false,
      identity: false,
      warnings: pkCol ? [] : ['tipo presumido NUMBER'],
      notes: [],
    };
    const fk: PlannedFk = {
      name: constraintName(`FK_${tableName}_${name}`, opts),
      table: qn,
      columns: [name],
      refTable: owner ? qualified(ownerFor(owner.schema, opts), owner.tableName) : rel.targetClass,
      refColumns: [refName],
      active: !reason,
      reason,
      note,
      description: `junção ${e.className}.${rel.property} ↔ ${rel.targetClass}`,
    };
    return { column, fk };
  };

  const a = side(e, ownerTableName, jt.joinColumn, e.className);
  const b = side(target, targetTable, jt.inverseJoinColumn, rel.targetClass);

  return {
    qualifiedName: qn,
    tableName,
    description: `Tabela de junção ManyToMany entre ${e.className} e ${rel.targetClass}`,
    columns: [a.column, b.column],
    pk: [a.column.name, b.column.name],
    pkName: constraintName(`PK_${tableName}`, opts),
    fks: [a.fk, b.fk],
  };
}
