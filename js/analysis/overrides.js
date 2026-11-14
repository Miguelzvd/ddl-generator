/**
 * Correções do usuário sobre as suposições, guardadas por entity (`arquivo#Classe`).
 * Todas as funções alteram o objeto `ovs` recebido.
 */
(function (DDL) {
  'use strict';

  /** @returns {import('../model.js').EntityOverride} */
  function ensure(ovs, id) {
    return (ovs[id] ??= { columns: {}, fks: {}, accepted: [] });
  }

  /** Remove a entrada da entity quando ela não guarda mais nada. */
  function prune(ovs, id) {
    const o = ovs[id];
    if (!o) return;
    for (const [k, v] of Object.entries(o.columns)) if (!Object.keys(v).length) delete o.columns[k];
    if (!o.tableName && !Object.keys(o.columns).length && !Object.keys(o.fks).length && !o.accepted.length) delete ovs[id];
  }

  /** Mescla a correção na coluna; valores vazios removem o campo. */
  function setColumn(ovs, id, property, patch) {
    const o = ensure(ovs, id);
    const cur = { ...o.columns[property] };
    for (const [k, v] of Object.entries(patch)) {
      const empty = v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v));
      if (empty) delete cur[k];
      else cur[k] = v;
    }
    o.columns[property] = cur;
    prune(ovs, id);
  }

  /** @param {'adopt' | 'keep' | undefined} choice */
  function setFk(ovs, id, fkColumn, choice) {
    const o = ensure(ovs, id);
    if (choice) o.fks[fkColumn] = choice;
    else delete o.fks[fkColumn];
    prune(ovs, id);
  }

  function setTableName(ovs, id, name) {
    const o = ensure(ovs, id);
    const clean = name?.trim();
    if (clean) o.tableName = clean;
    else delete o.tableName;
    prune(ovs, id);
  }

  function setAccepted(ovs, id, key, on) {
    const o = ensure(ovs, id);
    o.accepted = o.accepted.filter((k) => k !== key);
    if (on) o.accepted.push(key);
    prune(ovs, id);
  }

  /** Aceita como estão todas as suposições ainda abertas da entity. */
  function acceptRemaining(ovs, report) {
    for (const a of report.assumptions) if (!a.resolved) setAccepted(ovs, report.id, a.key, true);
  }

  /** Aplica um tamanho a todos os VARCHAR2 sem tamanho (ainda abertos) da entity. */
  function applyLengthToEntity(ovs, report, length) {
    let n = 0;
    for (const a of report.assumptions) {
      if (a.kind === 'varchar-length' && !a.resolved && a.column) {
        setColumn(ovs, report.id, a.column, { length });
        n++;
      }
    }
    return n;
  }

  const applyLengthToAll = (ovs, reports, length) => reports.reduce((n, r) => n + applyLengthToEntity(ovs, r, length), 0);

  function clearEntity(ovs, id) {
    delete ovs[id];
  }

  /** Quantas suposições abertas de um tipo existem na lista. */
  const countOpen = (reports, kind) => reports.reduce((n, r) => n + r.assumptions.filter((a) => a.kind === kind && !a.resolved).length, 0);

  DDL.overrides = { setColumn, setFk, setTableName, setAccepted, acceptRemaining, applyLengthToEntity, applyLengthToAll, clearEntity, countOpen };
})((globalThis.DDL = globalThis.DDL || {}));
