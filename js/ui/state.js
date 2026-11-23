/**
 * Estado da tela e as operações sobre ele (sem DOM).
 *
 * @typedef {object} AppState
 * @property {1 | 2 | 3} step
 * @property {import('../model.js').ParsedFile[]} files
 * @property {{ reports: import('../model.js').EntityReport[], registry: Map<string, any> }} analysis
 * @property {import('../model.js').Overrides} overrides
 * @property {Set<string>} selected     ids incluídos no script
 * @property {Set<string>} expanded     linhas abertas
 * @property {Set<string>} statusFilter
 * @property {string} schemaFilter
 * @property {string} query
 * @property {import('../model.js').GenerateOptions} opts
 * @property {string} source            de onde vieram os arquivos (para o cabeçalho)
 * @property {string} sql               script mostrado (o gerado ou o editado pelo usuário)
 * @property {string} generatedSql      último script gerado, para reverter edições
 * @property {boolean} sqlEdited        o usuário mexeu no SQL da etapa 3
 * @property {import('../io/files.js').SourceFile[]} sources  todos os .ts lidos (para a busca de usos)
 * @property {Map<string, import('../analysis/usages.js').Usage[]>} usages  classe → onde é usada
 * @property {{ done: number, total: number }} [loading]
 */
(function (DDL) {
  'use strict';

  const { buildReports } = DDL.classify;
  const { findUsages } = DDL.usages;
  const { loadOverrides } = DDL.ui.storage;

  /** Status que podem entrar no script. */
  const SELECTABLE = ['ok', 'revised', 'assumptions'];
  const STATUS_ORDER = ['ok', 'revised', 'assumptions', 'commented', 'impossible'];
  const NO_SCHEMA = '(sem schema)';

  /** @returns {AppState} */
  function initialState() {
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
      opts: { oracle11g: false, singleBlock: false, useOwner: true },
      source: '',
      sql: '',
      generatedSql: '',
      sqlEdited: false,
      sources: [],
      usages: new Map(),
    };
  }

  const isSelectable = (r) => SELECTABLE.includes(r.status);

  /** Recalcula status e suposições depois de uma correção. */
  function reanalyze(state) {
    state.analysis = buildReports(state.files, state.overrides);
  }

  /**
   * Soma novos arquivos (o mesmo caminho substitui o anterior) e recalcula.
   * `read` são todos os .ts lidos, usados para achar onde cada entity é usada.
   */
  function addFiles(state, parsed, sourceLabel, read = []) {
    const previous = new Set(state.analysis.reports.map((r) => r.id));
    const byPath = new Map(state.files.map((f) => [f.file, f]));
    for (const p of parsed) byPath.set(p.file, p);
    state.files = [...byPath.values()];
    const srcByPath = new Map(state.sources.map((s) => [s.path, s]));
    for (const s of read) srcByPath.set(s.path, s);
    state.sources = [...srcByPath.values()];
    state.usages = findUsages(state.sources, state.files.flatMap((f) => f.entities));
    reanalyze(state);
    state.source = state.source && state.source !== sourceLabel ? `${state.source} + ${sourceLabel}` : sourceLabel;
    const ids = new Set(state.analysis.reports.map((r) => r.id));
    for (const id of [...state.selected]) if (!ids.has(id)) state.selected.delete(id);
    // Novas entities que podem gerar entram marcadas; as que o usuário desmarcou continuam desmarcadas.
    for (const r of state.analysis.reports) if (isSelectable(r) && !previous.has(r.id)) state.selected.add(r.id);
  }

  /** Limpa a sessão; as correções salvas continuam guardadas. */
  function clearAll(state) {
    Object.assign(state, initialState());
  }

  function filteredReports(state) {
    const q = state.query.trim().toLowerCase();
    const schema = state.schemaFilter === NO_SCHEMA ? '' : state.schemaFilter;
    return state.analysis.reports
      .filter((r) => state.statusFilter.size === 0 || state.statusFilter.has(r.status))
      .filter((r) => !state.schemaFilter || (r.schema ?? '') === schema)
      .filter((r) => !q || [r.className, r.tableName, r.file].some((s) => s.toLowerCase().includes(q)));
  }

  /** Ordem por status, calculada ao abrir a lista (não muda enquanto o usuário edita). */
  function statusOrder(state) {
    const sorted = [...state.analysis.reports].sort(
      (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.tableName.localeCompare(b.tableName),
    );
    return new Map(sorted.map((r, i) => [r.id, i]));
  }

  function countByStatus(state) {
    const c = { ok: 0, revised: 0, assumptions: 0, commented: 0, impossible: 0 };
    for (const r of state.analysis.reports) c[r.status]++;
    return c;
  }

  /** Quantas entities marcadas podem entrar no script. */
  const selectedCount = (state) => state.analysis.reports.filter((r) => isSelectable(r) && state.selected.has(r.id)).length;

  DDL.ui.state = { initialState, isSelectable, reanalyze, addFiles, clearAll, filteredReports, statusOrder, countByStatus, selectedCount, STATUS_ORDER, NO_SCHEMA };
})((globalThis.DDL = globalThis.DDL || {}));
