/**
 * Correções do usuário sobre as suposições, guardadas por entity (`arquivo#Classe`).
 * Todas as funções alteram o objeto `ovs` recebido.
 */
import type { AssumptionKind, ColumnOverride, EntityOverride, EntityReport, Overrides } from '../model';

function ensure(ovs: Overrides, id: string): EntityOverride {
  return (ovs[id] ??= { columns: {}, fks: {}, accepted: [] });
}

/** Remove a entrada da entity quando ela não guarda mais nada. */
function prune(ovs: Overrides, id: string) {
  const o = ovs[id];
  if (!o) return;
  for (const [k, v] of Object.entries(o.columns)) if (!Object.keys(v).length) delete o.columns[k];
  if (!o.tableName && !Object.keys(o.columns).length && !Object.keys(o.fks).length && !o.accepted.length) delete ovs[id];
}

/** Mescla a correção na coluna; valores vazios removem o campo. */
export function setColumn(ovs: Overrides, id: string, property: string, patch: ColumnOverride) {
  const o = ensure(ovs, id);
  const cur: Record<string, unknown> = { ...o.columns[property] };
  for (const [k, v] of Object.entries(patch)) {
    const empty = v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v));
    if (empty) delete cur[k];
    else cur[k] = v;
  }
  o.columns[property] = cur as ColumnOverride;
  prune(ovs, id);
}

export function setFk(ovs: Overrides, id: string, fkColumn: string, choice: 'adopt' | 'keep' | undefined) {
  const o = ensure(ovs, id);
  if (choice) o.fks[fkColumn] = choice;
  else delete o.fks[fkColumn];
  prune(ovs, id);
}

export function setTableName(ovs: Overrides, id: string, name: string | undefined) {
  const o = ensure(ovs, id);
  const clean = name?.trim();
  if (clean) o.tableName = clean;
  else delete o.tableName;
  prune(ovs, id);
}

export function setAccepted(ovs: Overrides, id: string, key: string, on: boolean) {
  const o = ensure(ovs, id);
  o.accepted = o.accepted.filter((k) => k !== key);
  if (on) o.accepted.push(key);
  prune(ovs, id);
}

/** Aceita como estão todas as suposições ainda abertas da entity. */
export function acceptRemaining(ovs: Overrides, report: EntityReport) {
  for (const a of report.assumptions) if (!a.resolved) setAccepted(ovs, report.id, a.key, true);
}

/** Aplica um tamanho a todos os VARCHAR2 sem tamanho (ainda abertos) da entity. */
export function applyLengthToEntity(ovs: Overrides, report: EntityReport, length: number) {
  let n = 0;
  for (const a of report.assumptions) {
    if (a.kind === 'varchar-length' && !a.resolved && a.column) {
      setColumn(ovs, report.id, a.column, { length });
      n++;
    }
  }
  return n;
}

export const applyLengthToAll = (ovs: Overrides, reports: EntityReport[], length: number) => reports.reduce((n, r) => n + applyLengthToEntity(ovs, r, length), 0);

export function clearEntity(ovs: Overrides, id: string) {
  delete ovs[id];
}

/** Quantas suposições abertas de um tipo existem na lista. */
export const countOpen = (reports: EntityReport[], kind: AssumptionKind) => reports.reduce((n, r) => n + r.assumptions.filter((a) => a.kind === kind && !a.resolved).length, 0);
