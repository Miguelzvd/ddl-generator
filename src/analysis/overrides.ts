import type { ColumnOverride, EntityOverride, EntityReport, Overrides } from '../model';

export function ensure(ovs: Overrides, id: string): EntityOverride {
  return (ovs[id] ??= { columns: {}, fks: {}, accepted: [] });
}

/** Remove a entrada da entity quando ela não guarda mais nada. */
function prune(ovs: Overrides, id: string): void {
  const o = ovs[id];
  if (!o) return;
  for (const [k, v] of Object.entries(o.columns)) if (!Object.keys(v).length) delete o.columns[k];
  if (!o.tableName && !Object.keys(o.columns).length && !Object.keys(o.fks).length && !o.accepted.length) delete ovs[id];
}

/** Mescla a correção na coluna; valores vazios removem o campo. */
export function setColumn(ovs: Overrides, id: string, property: string, patch: ColumnOverride): void {
  const o = ensure(ovs, id);
  const cur: ColumnOverride = { ...o.columns[property] };
  for (const [k, v] of Object.entries(patch) as [keyof ColumnOverride, unknown][]) {
    const empty = v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v));
    if (empty) delete cur[k];
    else (cur as Record<string, unknown>)[k] = v;
  }
  o.columns[property] = cur;
  prune(ovs, id);
}

export function setFk(ovs: Overrides, id: string, fkColumn: string, choice: 'adopt' | 'keep' | undefined): void {
  const o = ensure(ovs, id);
  if (choice) o.fks[fkColumn] = choice;
  else delete o.fks[fkColumn];
  prune(ovs, id);
}

export function setTableName(ovs: Overrides, id: string, name: string | undefined): void {
  const o = ensure(ovs, id);
  const clean = name?.trim();
  if (clean) o.tableName = clean;
  else delete o.tableName;
  prune(ovs, id);
}

export function setAccepted(ovs: Overrides, id: string, key: string, on: boolean): void {
  const o = ensure(ovs, id);
  o.accepted = o.accepted.filter((k) => k !== key);
  if (on) o.accepted.push(key);
  prune(ovs, id);
}

/** Aceita como estão todas as suposições ainda abertas da entity. */
export function acceptRemaining(ovs: Overrides, report: EntityReport): void {
  for (const a of report.assumptions) if (!a.resolved) setAccepted(ovs, report.id, a.key, true);
}

/** Aplica um tamanho a todos os VARCHAR2 sem tamanho (ainda abertos) da entity. */
export function applyLengthToEntity(ovs: Overrides, report: EntityReport, length: number): number {
  let n = 0;
  for (const a of report.assumptions) {
    if (a.kind === 'varchar-length' && !a.resolved && a.column) {
      setColumn(ovs, report.id, a.column, { length });
      n++;
    }
  }
  return n;
}

export function applyLengthToAll(ovs: Overrides, reports: EntityReport[], length: number): number {
  return reports.reduce((n, r) => n + applyLengthToEntity(ovs, r, length), 0);
}

export function clearEntity(ovs: Overrides, id: string): void {
  delete ovs[id];
}

export function countOpen(reports: EntityReport[], kind: string): number {
  return reports.reduce((n, r) => n + r.assumptions.filter((a) => a.kind === kind && !a.resolved).length, 0);
}
