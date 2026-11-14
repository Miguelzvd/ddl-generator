/**
 * Tabela de junção de uma relação ManyToMany com @JoinTable.
 */
(function (DDL) {
  'use strict';

  const { mapColumnType } = DDL.typeMap;
  const { lookupTarget, qualified, constraintName, columnName } = DDL.naming;

  /**
   * @param {object} ctx  contexto do planTable (entity, nomes, coletor de suposições…)
   * @param {import('../model.js').RelationModel} rel
   * @param {(e: object, ref: string) => object | undefined} findColumn
   */
  function planJoinTable(ctx, rel, findColumn) {
    const { e, tableName: ownerTableName, registry, opts, col, tableNotes } = ctx;
    const jt = rel.joinTable;
    const target = lookupTarget(rel, registry);
    const targetTable = target?.tableName ?? rel.targetClass.toUpperCase();
    let tableName = jt.name;
    if (!tableName) {
      tableName = `${ownerTableName}_${rel.property}_${targetTable}`.toUpperCase();
      const a = col.add({ key: `jt:${rel.property}:name`, kind: 'other', text: `${rel.property}: nome da tabela de junção não informado; usado ${tableName}` });
      if (a.resolved) tableNotes.push(a.note);
    }
    const qn = qualified(e.schema, tableName);

    /** Uma das duas colunas da junção, com a FK para o seu lado. */
    const side = (owner, ownerTable, jc, label) => {
      const pkCol = owner?.columns.find((c) => (jc?.referencedColumnName ? findColumn(owner, jc.referencedColumnName) === c : c.primary));
      const refName = pkCol ? columnName(pkCol) : jc?.referencedColumnName ?? 'ID';
      const name = jc?.name ?? `${ownerTable}_${refName}`.toUpperCase();
      let reason;
      if (!owner) reason = `a entity de destino "${rel.targetClass}" não foi carregada`;
      else if (owner.kind === 'view') reason = 'o destino é uma view; o Oracle não aceita FK para view';
      else if (!pkCol) reason = `${owner.className} não tem chave primária para ser referenciada`;
      const note = reason ? col.add({ key: `jt:${name}:target`, kind: 'other', text: `FK ${name} da tabela de junção sai comentada: ${reason}` }).note : undefined;
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

  DDL.joinTable = { planJoinTable };
})((globalThis.DDL = globalThis.DDL || {}));
