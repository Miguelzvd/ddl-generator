import { generateDdl } from '../ddl/generate';
import { columnName } from '../ddl/plan';
import { mapColumnType } from '../ddl/typeMap';
import { filesFromDataTransfer, readFileList } from '../io/files';
import { STATUS_LABEL, type EntityReport, type Status } from '../model';
import { parseFile } from '../parser/parseFile';
import { h, icon } from './dom';
import { highlightSql } from './sqlHighlight';
import { addFiles, clearAll, countByStatus, filteredReports, initialState, reanalyze, SELECTABLE, STATUS_ORDER, statusOrder, type Step } from './state';
import { applyLengthToAll, countOpen } from '../analysis/overrides';
import { assumptionEditor } from './assumptionEditor';
import { saveOverrides } from './storage';

const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Carregar' },
  { n: 2, label: 'Revisar' },
  { n: 3, label: 'Script' },
];

export function mountApp(root: HTMLElement): void {
  const state = initialState();
  let currentSql = '';
  const live = h('div', { class: 'sr-only', 'aria-live': 'polite', role: 'status' });
  const main = h('main', { id: 'main', class: 'main', tabindex: '-1' });
  const stepper = h('ol', { class: 'stepper', 'aria-label': 'Etapas' });
  const themeBtn = h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': 'Alternar tema claro/escuro' });

  const announce = (msg: string) => {
    live.textContent = '';
    requestAnimationFrame(() => (live.textContent = msg));
  };

  // ---------- tema ----------
  const applyTheme = (t: string | null) => {
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
    const dark = t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    themeBtn.replaceChildren(icon(dark ? 'sun' : 'moon', 18));
    themeBtn.title = dark ? 'Usar tema claro' : 'Usar tema escuro';
  };
  let savedTheme: string | null = null;
  try {
    savedTheme = localStorage.getItem('ddl-theme');
  } catch {
    /* sem storage */
  }
  applyTheme(savedTheme);
  themeBtn.addEventListener('click', () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    const next = dark ? 'light' : 'dark';
    try {
      localStorage.setItem('ddl-theme', next);
    } catch {
      /* sem storage */
    }
    applyTheme(next);
  });

  root.append(
    h('a', { class: 'skip', href: '#main' }, 'Pular para o conteúdo'),
    h(
      'header',
      { class: 'topbar' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), h('h1', {}, 'TypeORM → DDL Oracle')),
      stepper,
      themeBtn,
    ),
    main,
    live,
  );

  const go = (step: Step) => {
    state.step = step;
    render();
    main.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  };

  function renderStepper() {
    stepper.replaceChildren(
      ...STEPS.map(({ n, label }) => {
        const enabled = n === 1 || (n === 2 && state.analysis.reports.length > 0) || (n === 3 && currentSql !== '');
        const btn = h(
          'button',
          {
            type: 'button',
            class: 'step',
            'aria-current': state.step === n ? 'step' : null,
            disabled: !enabled,
            onclick: () => go(n),
          },
          h('span', { class: 'step-n' }, String(n)),
          h('span', {}, label),
        );
        return h('li', {}, btn);
      }),
    );
  }

  function render() {
    renderStepper();
    if (state.step === 1) main.replaceChildren(renderLoad());
    else if (state.step === 2) main.replaceChildren(renderReview());
    else main.replaceChildren(renderScript());
  }

  // ---------- Etapa 1: Carregar ----------
  async function ingest(files: File[], label: string) {
    if (!files.length) return;
    state.loading = { done: 0, total: files.length };
    render();
    const { sources, failures } = await readFileList(files, (done, total) => {
      state.loading = { done, total };
      updateProgress();
    });
    const parsed = sources.map((s) => parseFile(s.path, s.text));
    for (const f of failures) parsed.push({ file: f.path, entities: [], commented: [], error: f.error });
    state.loading = undefined;
    addFiles(state, parsed, label);
    const n = state.analysis.reports.length;
    if (n === 0) {
      render();
      announce('Nenhuma entity TypeORM encontrada nos arquivos selecionados.');
      return;
    }
    announce(`${n} entities encontradas em ${parsed.length} arquivos.`);
    go(2);
  }

  let progressEl: HTMLElement | null = null;
  function updateProgress() {
    if (!progressEl || !state.loading) return;
    const { done, total } = state.loading;
    progressEl.querySelector<HTMLElement>('.progress-fill')!.style.transform = `scaleX(${total ? done / total : 0})`;
    progressEl.querySelector('.progress-label')!.textContent = `Lendo ${done} de ${total} arquivos…`;
  }

  function renderLoad(): HTMLElement {
    const folderInput = h('input', { type: 'file', class: 'sr-only', webkitdirectory: true, multiple: true, tabindex: '-1', 'aria-hidden': 'true' });
    const filesInput = h('input', { type: 'file', class: 'sr-only', multiple: true, accept: '.ts', tabindex: '-1', 'aria-hidden': 'true' });
    folderInput.addEventListener('change', () => {
      const list = [...(folderInput.files ?? [])];
      const top = (list[0] as File & { webkitRelativePath?: string })?.webkitRelativePath?.split('/')[0] ?? 'pasta';
      void ingest(list, `pasta ${top}`);
    });
    filesInput.addEventListener('change', () => {
      const list = [...(filesInput.files ?? [])];
      void ingest(list, `${list.length} arquivo(s)`);
    });

    const drop = h(
      'section',
      { class: 'drop', 'aria-labelledby': 'drop-title' },
      h('div', { class: 'drop-icon' }, icon('upload', 28)),
      h('h2', { id: 'drop-title' }, 'Carregue as entities do seu projeto'),
      h(
        'p',
        { class: 'muted measure' },
        'Selecione a pasta do projeto (ou só a pasta das entities) e a ferramenta encontra sozinha os arquivos com @Entity e @ViewEntity. Se preferir, arraste arquivos .ts para cá. Nada sai do seu computador.',
      ),
      h(
        'div',
        { class: 'drop-actions' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => folderInput.click() }, icon('folder', 18), 'Selecionar pasta do projeto'),
        h('button', { type: 'button', class: 'btn', onclick: () => filesInput.click() }, icon('file', 18), 'Selecionar arquivos'),
      ),
      h('p', { class: 'hint' }, 'Ignorados automaticamente: node_modules, dist, build, .git e arquivos .d.ts.'),
      folderInput,
      filesInput,
    );

    let depth = 0;
    drop.addEventListener('dragenter', (e) => {
      e.preventDefault();
      depth++;
      drop.classList.add('is-over');
    });
    drop.addEventListener('dragover', (e) => e.preventDefault());
    drop.addEventListener('dragleave', () => {
      if (--depth <= 0) drop.classList.remove('is-over');
    });
    drop.addEventListener('drop', async (e) => {
      e.preventDefault();
      depth = 0;
      drop.classList.remove('is-over');
      if (!e.dataTransfer) return;
      const files = await filesFromDataTransfer(e.dataTransfer);
      void ingest(files, `${files.length} arquivo(s) arrastado(s)`);
    });

    const wrap = h('div', { class: 'stack' }, drop);

    if (state.loading) {
      drop.classList.add('is-busy');
      progressEl = h(
        'div',
        { class: 'progress', role: 'progressbar', 'aria-label': 'Lendo arquivos' },
        h('div', { class: 'progress-track' }, h('div', { class: 'progress-fill' })),
        h('p', { class: 'progress-label' }, 'Lendo arquivos…'),
      );
      wrap.append(progressEl, skeleton());
      updateProgress();
    } else if (state.analysis.reports.length) {
      wrap.append(
        h(
          'div',
          { class: 'loaded' },
          h('p', {}, h('strong', { class: 'num' }, String(state.analysis.reports.length)), ` entities carregadas de ${state.source}. Novos arquivos são somados a elas.`),
          h(
            'div',
            { class: 'row' },
            h('button', { type: 'button', class: 'btn btn-primary', onclick: () => go(2) }, 'Revisar lista'),
            h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { clearAll(state); currentSql = ''; render(); announce('Lista limpa.'); } }, icon('x'), 'Limpar tudo'),
          ),
        ),
      );
    } else if (state.files.length) {
      wrap.append(h('p', { class: 'notice', role: 'alert' }, 'Nenhuma entity TypeORM foi encontrada nos arquivos selecionados. Confira se a pasta contém classes com @Entity ou @ViewEntity.'));
    }
    return wrap;
  }

  function skeleton(): HTMLElement {
    return h('div', { class: 'skeleton', 'aria-hidden': 'true' }, ...Array.from({ length: 6 }, () => h('div', { class: 'skeleton-row' })));
  }

  // ---------- Etapa 2: Revisar ----------
  function dot(status: Status) {
    return h('span', { class: `dot dot-${status}`, 'aria-hidden': 'true' });
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = h('textarea', {}, text);
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    announce('Copiado para a área de transferência.');
  }

  function renderReview(): HTMLElement {
    const tbody = h('tbody');
    const countEl = h('span', { class: 'num' });
    const genBtn = h('button', { type: 'button', class: 'btn btn-primary' }, 'Gerar script');
    const genHint = h('span', { class: 'hint' });
    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar por status' });
    const bulkBar = h('div', { class: 'bulkbar' });
    const order = statusOrder(state);

    /** Recalcula depois de uma correção, salva e mantém o foco onde estava. */
    const changed = (msg: string) => {
      const focusId = (document.activeElement as HTMLElement | null)?.id;
      saveOverrides(state.overrides);
      reanalyze(state);
      refresh();
      if (focusId) document.getElementById(focusId)?.focus();
      announce(msg);
    };
    const editorCtx = { overrides: state.overrides, changed, copy: copyText };

    const refresh = () => {
      const counts = countByStatus(state);
      const rows = filteredReports(state).sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
      tbody.replaceChildren(...(rows.length ? rows.flatMap(renderRow) : [emptyRow()]));
      const n = [...state.selected].filter((id) => state.analysis.reports.some((r) => r.id === id && SELECTABLE.includes(r.status))).length;
      countEl.textContent = String(n);
      genBtn.toggleAttribute('disabled', n === 0);
      genHint.textContent = n === 0 ? 'Marque ao menos uma entity para gerar.' : '';
      chips.replaceChildren(
        ...STATUS_ORDER.filter((s) => s !== 'revised' || counts.revised > 0).map((s) =>
          h(
            'button',
            {
              type: 'button',
              class: 'chip',
              'aria-pressed': String(state.statusFilter.has(s)),
              onclick: () => {
                state.statusFilter.has(s) ? state.statusFilter.delete(s) : state.statusFilter.add(s);
                refresh();
              },
            },
            dot(s),
            h('span', { class: 'num' }, String(counts[s])),
            h('span', {}, STATUS_LABEL[s]),
          ),
        ),
      );
      renderBulk();
    };

    function renderBulk() {
      const open = countOpen(state.analysis.reports, 'varchar-length');
      if (!open) {
        bulkBar.replaceChildren();
        bulkBar.hidden = true;
        return;
      }
      bulkBar.hidden = false;
      const entities = state.analysis.reports.filter((r) => r.assumptions.some((a) => a.kind === 'varchar-length' && !a.resolved)).length;
      const input = h('input', { id: 'bulk-all', type: 'number', class: 'input input-sm', min: '1', max: '32767', value: '255', inputmode: 'numeric' });
      bulkBar.replaceChildren(
        h('span', { class: 'dot dot-assumptions', 'aria-hidden': 'true' }),
        h('label', { for: 'bulk-all' }, h('strong', { class: 'num' }, String(open)), ` VARCHAR2 sem tamanho em ${entities} entities. Tamanho para todos:`),
        input,
        h('button', {
          type: 'button',
          class: 'btn btn-sm',
          onclick: () => {
            const n = Math.trunc(Number(input.value));
            if (!(n > 0)) return input.focus();
            const done = applyLengthToAll(state.overrides, state.analysis.reports, n);
            changed(`${done} colunas receberam tamanho ${n}.`);
          },
        }, 'Aplicar em todas'),
      );
    }

    const emptyRow = () =>
      h('tr', {}, h('td', { colspan: '8', class: 'empty' }, 'Nenhuma entity corresponde aos filtros. ', h('button', { type: 'button', class: 'link', onclick: () => { state.statusFilter.clear(); state.query = ''; state.schemaFilter = ''; render(); } }, 'Limpar filtros')));

    function renderRow(r: EntityReport): HTMLElement[] {
      const selectable = SELECTABLE.includes(r.status);
      const open = state.expanded.has(r.id);
      const cb = h('input', {
        type: 'checkbox',
        id: `cb-${r.id}`,
        checked: selectable && state.selected.has(r.id),
        disabled: !selectable,
        'aria-label': `Incluir ${r.className} no script`,
      });
      cb.addEventListener('change', () => {
        cb.checked ? state.selected.add(r.id) : state.selected.delete(r.id);
        refresh();
      });
      const toggle = h(
        'button',
        {
          type: 'button',
          id: `exp-${r.id}`.replace(/[^\w-]/g, '_'),
          class: 'btn-expand',
          'aria-expanded': String(open),
          'aria-controls': `det-${r.id}`,
          'aria-label': `${open ? 'Ocultar' : 'Ver'} detalhes de ${r.className}`,
          onclick: () => {
            open ? state.expanded.delete(r.id) : state.expanded.add(r.id);
            const id = `exp-${r.id}`.replace(/[^\w-]/g, '_');
            refresh();
            document.getElementById(id)?.focus();
          },
        },
        icon('chevron'),
      );
      const total = r.assumptions.length;
      const done = r.assumptions.filter((a) => a.resolved).length;
      const progress = r.status === 'assumptions' && done > 0 ? `${done} de ${total} resolvidas · ` : '';
      const first = r.reasons[0];
      const reason = first
        ? h('span', { class: 'reason' }, progress + first + (r.reasons.length > 1 ? ` (+${r.reasons.length - 1})` : ''))
        : null;
      const row = h(
        'tr',
        { class: `row-${r.status}${open ? ' is-open' : ''}` },
        h('td', { class: 'c-check' }, cb),
        h('td', { class: 'c-exp' }, toggle),
        h('td', { class: 'c-status' }, h('span', { class: 'status' }, dot(r.status), STATUS_LABEL[r.status])),
        h('td', {}, h('div', { class: 'cls' }, r.className), reason),
        h('td', { class: 'mono' }, r.tableName),
        h('td', { class: 'mono muted' }, r.schema ?? '—'),
        h('td', { class: 'num right' }, r.entity ? String(r.columnCount) : '—'),
        h('td', { class: 'file muted', title: r.file }, r.file),
      );
      if (!open) return [row];
      return [row, h('tr', { class: 'details', id: `det-${r.id}` }, h('td', { colspan: '8' }, renderDetails(r, editorCtx)))];
    }

    const schemas = [...new Set(state.analysis.reports.map((r) => r.schema ?? '(sem schema)'))].sort();
    const search = h('input', {
      type: 'search',
      class: 'input',
      placeholder: 'Buscar classe, tabela ou arquivo…',
      'aria-label': 'Buscar',
      value: state.query,
      autocomplete: 'off',
      spellcheck: 'false',
    });
    search.addEventListener('input', () => {
      state.query = search.value;
      refresh();
    });
    const schemaSel = h(
      'select',
      { class: 'input select', 'aria-label': 'Filtrar por schema' },
      h('option', { value: '' }, 'Todos os schemas'),
      ...schemas.map((s) => h('option', { value: s, selected: state.schemaFilter === s }, s)),
    );
    schemaSel.addEventListener('change', () => {
      state.schemaFilter = schemaSel.value;
      refresh();
    });

    const selectAll = () => {
      for (const r of filteredReports(state)) if (SELECTABLE.includes(r.status)) state.selected.add(r.id);
      refresh();
    };
    const selectNone = () => {
      for (const r of filteredReports(state)) state.selected.delete(r.id);
      refresh();
    };

    genBtn.addEventListener('click', () => {
      currentSql = buildSql();
      announce('Script gerado.');
      go(3);
    });

    refresh();
    return h(
      'div',
      { class: 'stack review' },
      h(
        'div',
        { class: 'review-head' },
        h('div', {}, h('h2', {}, 'Revise as entities encontradas'), h('p', { class: 'muted' }, `${state.analysis.reports.length} entities em ${state.files.length} arquivos · ${state.source}`)),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => go(1) }, icon('upload'), 'Adicionar arquivos'),
      ),
      chips,
      bulkBar,
      h('div', { class: 'toolbar' }, h('label', { class: 'search' }, icon('search'), search), schemaSel, h('div', { class: 'spacer' }), h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: selectAll }, 'Marcar visíveis'), h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: selectNone }, 'Desmarcar visíveis')),
      h(
        'div',
        { class: 'table-wrap' },
        h(
          'table',
          { class: 'table' },
          h(
            'thead',
            {},
            h('tr', {}, h('th', { class: 'c-check' }, h('span', { class: 'sr-only' }, 'Incluir')), h('th', { class: 'c-exp' }, h('span', { class: 'sr-only' }, 'Detalhes')), h('th', {}, 'Status'), h('th', {}, 'Classe'), h('th', {}, 'Tabela'), h('th', {}, 'Schema'), h('th', { class: 'right' }, 'Col.'), h('th', {}, 'Arquivo')),
          ),
          tbody,
        ),
      ),
      h('div', { class: 'actionbar' }, h('p', {}, countEl, ' selecionadas para o script'), genHint, h('div', { class: 'spacer' }), genBtn),
    );
  }

  function renderDetails(r: EntityReport, editorCtx: Parameters<typeof assumptionEditor>[1]): HTMLElement {
    const box = h('div', { class: 'detail' });
    if (r.assumptions.length) box.append(assumptionEditor(r, editorCtx));
    else if (r.reasons.length) box.append(h('h3', {}, 'Motivo'), h('ul', { class: 'reasons' }, ...r.reasons.map((x) => h('li', {}, x))));
    const e = r.entity;
    if (e && e.columns.length) {
      box.append(
        h('h3', {}, 'Colunas'),
        h(
          'table',
          { class: 'mini' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Propriedade'), h('th', {}, 'Coluna'), h('th', {}, e.kind === 'view' ? 'Tipo TS' : 'Tipo Oracle'), h('th', {}, 'Nulo'), h('th', {}, 'PK'))),
          h(
            'tbody',
            {},
            ...e.columns.map((c) =>
              h('tr', {}, h('td', { class: 'mono' }, c.property), h('td', { class: 'mono' }, columnName(c)), h('td', { class: 'mono' }, e.kind === 'view' ? c.tsType ?? '—' : mapColumnType(c).sql), h('td', {}, c.nullable ? 'sim' : 'não'), h('td', {}, c.primary ? (c.generated ? 'gerada' : 'sim') : '')),
            ),
          ),
        ),
      );
    }
    if (e && e.relations.length) {
      box.append(h('h3', {}, 'Relações'), h('ul', { class: 'reasons' }, ...e.relations.map((rel) => h('li', {}, h('span', { class: 'mono' }, rel.property), ` — ${rel.kind} → ${rel.targetClass}${rel.joinColumns[0]?.name ? ` (coluna ${rel.joinColumns[0].name})` : ''}`))));
    }
    box.append(h('p', { class: 'hint' }, 'Arquivo: ', h('span', { class: 'mono' }, r.file)));
    return box;
  }

  // ---------- Etapa 3: Script ----------
  function buildSql(): string {
    const chosen = state.analysis.reports.filter((r) => (SELECTABLE.includes(r.status) && state.selected.has(r.id)) || r.kind === 'view');
    return generateDdl(chosen, state.analysis.registry, { ...state.opts, overrides: state.overrides }, { source: state.source });
  }

  function fileName(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const schemas = new Set(state.analysis.reports.filter((r) => state.selected.has(r.id)).map((r) => r.schema).filter(Boolean));
    const base = schemas.size === 1 ? [...schemas][0]!.toLowerCase() : 'projeto';
    return `ddl-${base}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.sql`;
  }

  function renderScript(): HTMLElement {
    const pre = h('pre', { class: 'sql', tabindex: '0', 'aria-label': 'Script SQL gerado' });
    const code = h('code', {});
    pre.append(code);
    const warnList = h('ul', { class: 'warn-list' });
    const stats = h('p', { class: 'muted' });

    const paint = () => {
      code.innerHTML = highlightSql(currentSql);
      const lines = currentSql.split('\n');
      const warns: { line: number; text: string; table: string }[] = [];
      let table = '';
      lines.forEach((l, i) => {
        const t = /^-- Tabela (.+)$/.exec(l);
        if (t) table = t[1];
        if (/^\s*-- (ATENÇÃO|MOTIVO):/.test(l)) {
          // Avisos de coluna ficam logo acima da linha da coluna: mostra TABELA.COLUNA.
          const next = lines.slice(i + 1).find((x) => !/^\s*--/.test(x)) ?? '';
          const col = /^\s{2}([A-Za-z_][\w$#]*)\s/.exec(next)?.[1];
          const where = /MOTIVO/.test(l) ? 'Chave estrangeira' : col && col !== 'CONSTRAINT' ? `${table}.${col}` : table;
          warns.push({ line: i + 1, text: l.replace(/^\s*-- (ATENÇÃO|MOTIVO):\s*/, ''), table: where });
        }
      });
      const tables = (currentSql.match(/^CREATE TABLE /gm) ?? []).length;
      const fkOn = (currentSql.match(/^ALTER TABLE /gm) ?? []).length;
      const fkOff = (currentSql.match(/^-- ALTER TABLE /gm) ?? []).length;
      stats.textContent = `${tables} tabelas · ${fkOn} FKs ativas · ${fkOff} FKs comentadas · ${lines.length} linhas`;
      warnList.replaceChildren(
        ...(warns.length
          ? warns.map((w) =>
              h(
                'li',
                {},
                h(
                  'button',
                  {
                    type: 'button',
                    class: 'warn-item',
                    onclick: () => {
                      const el = document.getElementById(`sql-l${w.line}`);
                      el?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
                      el?.classList.remove('flash');
                      void el?.offsetWidth;
                      el?.classList.add('flash');
                    },
                  },
                  h('span', { class: 'warn-table mono' }, w.table || 'Geral'),
                  h('span', {}, w.text),
                  h('span', { class: 'warn-line num' }, `linha ${w.line}`),
                ),
              ),
            )
          : [h('li', { class: 'muted' }, 'Nenhuma suposição: o script saiu exato.')]),
      );
    };

    const toggle11g = h('input', { type: 'checkbox', id: 'opt-11g', checked: state.opts.oracle11g });
    toggle11g.addEventListener('change', () => {
      state.opts.oracle11g = toggle11g.checked;
      currentSql = buildSql();
      paint();
      announce(toggle11g.checked ? 'Script refeito com SEQUENCE (Oracle 11g).' : 'Script refeito com IDENTITY (Oracle 12c+).');
    });

    const copyBtn = h('button', { type: 'button', class: 'btn' }, icon('copy'), h('span', {}, 'Copiar'));
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(currentSql);
      } catch {
        const ta = h('textarea', {}, currentSql);
        document.body.append(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      copyBtn.replaceChildren(icon('check'), h('span', {}, 'Copiado'));
      announce('Script copiado para a área de transferência.');
      setTimeout(() => copyBtn.replaceChildren(icon('copy'), h('span', {}, 'Copiar')), 2000);
    });

    const dlBtn = h('button', { type: 'button', class: 'btn btn-primary' }, icon('download'), 'Baixar .sql');
    dlBtn.addEventListener('click', () => {
      const url = URL.createObjectURL(new Blob([currentSql], { type: 'text/plain;charset=utf-8' }));
      const a = h('a', { href: url, download: fileName() });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      announce(`Arquivo ${fileName()} baixado.`);
    });

    paint();
    return h(
      'div',
      { class: 'stack' },
      h(
        'div',
        { class: 'review-head' },
        h('div', {}, h('h2', {}, 'Script gerado'), stats),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => go(2) }, icon('back'), 'Voltar para a lista'), copyBtn, dlBtn),
      ),
      h('label', { class: 'option', for: 'opt-11g' }, toggle11g, h('span', {}, h('strong', {}, 'Oracle 11g'), ' — usar SEQUENCE no lugar de IDENTITY e limitar nomes a 30 caracteres')),
      h('div', { class: 'script-grid' }, pre, h('aside', { class: 'warn-panel', 'aria-labelledby': 'warn-title' }, h('h3', { id: 'warn-title' }, 'Avisos no script'), warnList)),
    );
  }

  render();
}
