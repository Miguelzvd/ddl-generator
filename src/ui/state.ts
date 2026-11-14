import type { Analysis } from '../analysis/classify';
import { buildReports } from '../analysis/classify';
import type { GenerateOptions, Overrides, ParsedFile, Status } from '../model';
import { loadOverrides } from './storage';

export type Step = 1 | 2 | 3;

export interface AppState {
  step: Step;
  files: ParsedFile[];
  analysis: Analysis;
  overrides: Overrides;
  selected: Set<string>;
  expanded: Set<string>;
  statusFilter: Set<Status>;
  schemaFilter: string;
  query: string;
  opts: GenerateOptions;
  source: string;
  loading?: { done: number; total: number };
}

export function initialState(): AppState {
  return {
    step: 1,
    files: [],
    analysis: { reports: [], registry: new Map() },
    overrides: loadOverrides(),
    selected: new Set(),
    expanded: new Set(),
    statusFilter: new Set(),
    schemaFilter: '',
    query: '',
    opts: { oracle11g: false },
    source: '',
  };
}

export const SELECTABLE: Status[] = ['ok', 'revised', 'assumptions'];

/** Recalcula status e suposições depois de uma correção. */
export function reanalyze(state: AppState): void {
  state.analysis = buildReports(state.files, state.overrides);
}

/** Soma novos arquivos (o mesmo caminho substitui o anterior) e recalcula a análise. */
export function addFiles(state: AppState, parsed: ParsedFile[], sourceLabel: string): void {
  const previous = new Set(state.analysis.reports.map((r) => r.id));
  const byPath = new Map(state.files.map((f) => [f.file, f]));
  for (const p of parsed) byPath.set(p.file, p);
  state.files = [...byPath.values()];
  reanalyze(state);
  state.source = state.source && state.source !== sourceLabel ? `${state.source} + ${sourceLabel}` : sourceLabel;
  const ids = new Set(state.analysis.reports.map((r) => r.id));
  for (const id of [...state.selected]) if (!ids.has(id)) state.selected.delete(id);
  // Novas entities que podem gerar entram marcadas; as que o usuário desmarcou continuam desmarcadas.
  for (const r of state.analysis.reports) if (SELECTABLE.includes(r.status) && !previous.has(r.id)) state.selected.add(r.id);
}

/** Limpa a sessão; as correções salvas continuam guardadas. */
export function clearAll(state: AppState): void {
  Object.assign(state, initialState());
}

export const STATUS_ORDER: Status[] = ['ok', 'revised', 'assumptions', 'commented', 'impossible'];

export function filteredReports(state: AppState) {
  const q = state.query.trim().toLowerCase();
  return state.analysis.reports
    .filter((r) => state.statusFilter.size === 0 || state.statusFilter.has(r.status))
    .filter((r) => !state.schemaFilter || (r.schema ?? '') === (state.schemaFilter === '(sem schema)' ? '' : state.schemaFilter))
    .filter((r) => !q || r.className.toLowerCase().includes(q) || r.tableName.toLowerCase().includes(q) || r.file.toLowerCase().includes(q));
}

/** Ordem por status, calculada ao abrir a lista (não muda enquanto o usuário edita). */
export function statusOrder(state: AppState): Map<string, number> {
  const sorted = [...state.analysis.reports].sort(
    (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.tableName.localeCompare(b.tableName),
  );
  return new Map(sorted.map((r, i) => [r.id, i]));
}

export function countByStatus(state: AppState): Record<Status, number> {
  const c: Record<Status, number> = { ok: 0, revised: 0, assumptions: 0, commented: 0, impossible: 0 };
  for (const r of state.analysis.reports) c[r.status]++;
  return c;
}
