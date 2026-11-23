/**
 * Etapa 2 — Revisar: lista de entities com status, filtros, detalhes e correções.
 */
(function (DDL) {
  'use strict';

  const { h, icon, dot, safeId } = DDL.ui.dom;
  const { STATUS_LABEL } = DDL.model;
  const { columnName } = DDL.naming;
  const { mapColumnType } = DDL.typeMap;
  const { applyLengthToAll, countOpen } = DDL.overrides;
  const { assumptionEditor } = DDL.ui.assumptionEditor;
  const { saveOverrides } = DDL.ui.storage;
  const S = DDL.ui.state;

  const COLS = 8;

  /** @param {import('./loadStep.js').AppCtx} ctx */
  function renderReview(ctx) {
    const { state } = ctx;
    const order = S.statusOrder(state);
    const tbody = h('tbody');
    const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filtrar por status' });
    const bulkBar = h('div', { class: 'bulkbar' });
    const countEl = h('span', { class: 'num' });
    const genHint = h('span', { class: 'hint' });
    const genBtn = h('button', { type: 'button', class: 'btn btn-primary' }, 'Gerar script');

    /** Depois de uma correção: salva, recalcula e devolve o foco para onde estava. */
    const changed = (msg) => {
      const focusId = document.activeElement?.id;
      saveOverrides(state.overrides);
      S.reanalyze(state);
      refresh();
      if (focusId) document.getElementById(focusId)?.focus();
      ctx.announce(msg);
    };
    const editorCtx = { overrides: state.overrides, changed, copy: ctx.copyText };

    function refresh() {
      const rows = S.filteredReports(state).sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
      tbody.replaceChildren(...(rows.length ? rows.flatMap((r) => renderRow(r)) : [emptyRow()]));
      const n = S.selectedCount(state);
      countEl.textContent = String(n);
      genBtn.toggleAttribute('disabled', n === 0);
      genHint.textContent = n === 0 ? 'Marque ao menos uma entity para gerar.' : '';
      renderChips();
      renderBulk();
    }

    function renderChips() {
      const counts = S.countByStatus(state);
      const toggle = (s) => {
        if (state.statusFilter.has(s)) state.statusFilter.delete(s);
        else state.statusFilter.add(s);
        refresh();
      };
      chips.replaceChildren(
        ...S.STATUS_ORDER.filter((s) => s !== 'revised' || counts.revised > 0).map((s) =>
          h('button', { type: 'button', class: 'chip', 'aria-pressed': String(state.statusFilter.has(s)), onclick: () => toggle(s) }, dot(s), h('span', { class: 'num' }, String(counts[s])), h('span', {}, STATUS_LABEL[s])),
        ),
      );
    }

    /** Barra "N VARCHAR2 sem tamanho": aplica um tamanho em todas as entities. */
    function renderBulk() {
      const open = countOpen(state.analysis.reports, 'varchar-length');
      bulkBar.hidden = !open;
      if (!open) return bulkBar.replaceChildren();
      const entities = state.analysis.reports.filter((r) => r.assumptions.some((a) => a.kind === 'varchar-length' && !a.resolved)).length;
      const input = h('input', { id: 'bulk-all', type: 'number', class: 'input input-sm', min: '1', max: '32767', value: '255', inputmode: 'numeric' });
      const apply = () => {
        const n = Math.trunc(Number(input.value));
        if (!(n > 0)) return input.focus();
        const done = applyLengthToAll(state.overrides, state.analysis.reports, n);
        changed(`${done} colunas receberam tamanho ${n}.`);
      };
      bulkBar.replaceChildren(
        dot('assumptions'),
        h('label', { for: 'bulk-all' }, h('strong', { class: 'num' }, String(open)), ` VARCHAR2 sem tamanho em ${entities} entities. Tamanho para todos:`),
        input,
        h('button', { type: 'button', class: 'btn btn-sm', onclick: apply }, 'Aplicar em todas'),
      );
    }

    function emptyRow() {
      const clear = () => {
        state.statusFilter.clear();
        state.query = '';
        state.schemaFilter = '';
        ctx.render();
      };
      return h('tr', {}, h('td', { colspan: String(COLS), class: 'empty' }, 'Nenhuma entity corresponde aos filtros. ', h('button', { type: 'button', class: 'link', onclick: clear }, 'Limpar filtros')));
    }

    function renderRow(r) {
      const selectable = S.isSelectable(r);
      const open = state.expanded.has(r.id);
      const expId = safeId(`exp-${r.id}`);
      const cb = h('input', { type: 'checkbox', id: safeId(`cb-${r.id}`), checked: selectable && state.selected.has(r.id), disabled: !selectable, 'aria-label': `Incluir ${r.className} no script` });
      cb.addEventListener('change', () => {
        if (cb.checked) state.selected.add(r.id);
        else state.selected.delete(r.id);
        refresh();
      });
      const toggle = h(
        'button',
        {
          type: 'button',
          id: expId,
          class: 'btn-expand',
          'aria-expanded': String(open),
          'aria-controls': safeId(`det-${r.id}`),
          'aria-label': `${open ? 'Ocultar' : 'Ver'} detalhes de ${r.className}`,
          onclick: () => {
            if (open) state.expanded.delete(r.id);
            else state.expanded.add(r.id);
            refresh();
            document.getElementById(expId)?.focus();
          },
        },
        icon('chevron'),
      );
      const done = r.assumptions.filter((a) => a.resolved).length;
      const progress = r.status === 'assumptions' && done > 0 ? `${done} de ${r.assumptions.length} resolvidas · ` : '';
      const reason = r.reasons[0] ? h('span', { class: 'reason' }, progress + r.reasons[0] + (r.reasons.length > 1 ? ` (+${r.reasons.length - 1})` : '')) : null;
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
      return [row, h('tr', { class: 'details', id: safeId(`det-${r.id}`) }, h('td', { colspan: String(COLS) }, renderDetails(r, editorCtx, state)))];
    }

    function toolbar() {
      const search = h('input', { type: 'search', class: 'input', placeholder: 'Buscar classe, tabela ou arquivo…', 'aria-label': 'Buscar', value: state.query, autocomplete: 'off', spellcheck: 'false' });
      search.addEventListener('input', () => {
        state.query = search.value;
        refresh();
      });
      const schemas = [...new Set(state.analysis.reports.map((r) => r.schema ?? S.NO_SCHEMA))].sort();
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
      const mark = (on) => () => {
        for (const r of S.filteredReports(state)) {
          if (on && S.isSelectable(r)) state.selected.add(r.id);
          if (!on) state.selected.delete(r.id);
        }
        refresh();
      };
      return h(
        'div',
        { class: 'toolbar' },
        h('label', { class: 'search' }, icon('search'), search),
        schemaSel,
        h('div', { class: 'spacer' }),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: mark(true) }, 'Marcar visíveis'),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: mark(false) }, 'Desmarcar visíveis'),
      );
    }

    const th = (text, cls) => h('th', cls ? { class: cls } : {}, text);
    const table = h(
      'div',
      { class: 'table-wrap' },
      h(
        'table',
        { class: 'table' },
        h('thead', {}, h('tr', {}, th(h('span', { class: 'sr-only' }, 'Incluir'), 'c-check'), th(h('span', { class: 'sr-only' }, 'Detalhes'), 'c-exp'), th('Status'), th('Classe'), th('Tabela'), th('Schema'), th('Col.', 'right'), th('Arquivo'))),
        tbody,
      ),
    );

    genBtn.addEventListener('click', () => {
      ctx.regenerate();
      ctx.announce('Script gerado.');
      ctx.go(3);
    });

    refresh();
    return h(
      'div',
      { class: 'stack review' },
      h(
        'div',
        { class: 'review-head' },
        h('div', {}, h('h2', {}, 'Revise as entities encontradas'), h('p', { class: 'muted' }, `${state.analysis.reports.length} entities em ${state.files.length} arquivos · ${state.source}`)),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => ctx.go(1) }, icon('upload'), 'Adicionar arquivos'),
      ),
      chips,
      bulkBar,
      toolbar(),
      table,
      h('div', { class: 'actionbar' }, h('p', {}, countEl, ' selecionadas para o script'), genHint, h('div', { class: 'spacer' }), genBtn),
    );
  }

  const USAGES_SHOWN = 20;

  /** `arquivo:linha` que copia a referência ao clicar (para colar no Ctrl+P do editor). */
  function sourceRef(file, line, copy, label) {
    const ref = `${DDL.files.editorPath(file)}:${line}`;
    return h('button', { type: 'button', class: 'source-ref mono', title: `Copiar ${ref}`, 'aria-label': `Copiar ${ref}`, onclick: () => void copy(ref) }, h('span', {}, label ?? ref), icon('copy', 12));
  }

  /** "Usada em": linhas do projeto que citam a classe, com as 20 primeiras visíveis. */
  function usagesBlock(e, usages, sharedName, copy) {
    const out = [h('h3', {}, `Usada em (${usages.length})`)];
    if (sharedName) out.push(h('p', { class: 'hint' }, `Há outra entity chamada ${e.className}: os usos abaixo podem ser de qualquer uma delas.`));
    if (!usages.length) {
      out.push(h('p', { class: 'hint' }, `Nenhum uso de ${e.className} encontrado nos arquivos carregados (fora a própria entity).`));
      return out;
    }
    const list = h('ul', { class: 'usages' });
    const fill = (all) =>
      list.replaceChildren(
        ...(all ? usages : usages.slice(0, USAGES_SHOWN)).map((u) =>
          h('li', {}, sourceRef(u.file, u.line, copy), h('code', { class: 'mono usage-code', title: u.text }, u.text)),
        ),
      );
    fill(false);
    out.push(list);
    if (usages.length > USAGES_SHOWN) {
      let all = false;
      const more = h('button', { type: 'button', class: 'link' }, `Mostrar todos (+${usages.length - USAGES_SHOWN})`);
      more.addEventListener('click', () => {
        all = !all;
        fill(all);
        more.textContent = all ? 'Mostrar menos' : `Mostrar todos (+${usages.length - USAGES_SHOWN})`;
      });
      out.push(more);
    }
    return out;
  }

  /** Linha aberta: suposições (editáveis) ou motivo, colunas, relações e onde a entity é usada. */
  function renderDetails(r, editorCtx, state) {
    const copy = editorCtx.copy;
    const box = h('div', { class: 'detail' });
    if (r.assumptions.length) box.append(assumptionEditor(r, editorCtx));
    else if (r.reasons.length) box.append(h('h3', {}, 'Motivo'), h('ul', { class: 'reasons' }, ...r.reasons.map((x) => h('li', {}, x))));
    const e = r.entity;
    if (e?.columns.length) {
      const isView = e.kind === 'view';
      box.append(
        h('h3', {}, 'Colunas'),
        h(
          'table',
          { class: 'mini' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Propriedade'), h('th', {}, 'Coluna'), h('th', {}, isView ? 'Tipo TS' : 'Tipo Oracle'), h('th', {}, 'Nulo'), h('th', {}, 'PK'), h('th', {}, 'Linha'))),
          h(
            'tbody',
            {},
            ...e.columns.map((c) =>
              h(
                'tr',
                {},
                h('td', { class: 'mono' }, c.property),
                h('td', { class: 'mono' }, columnName(c)),
                h('td', { class: 'mono' }, isView ? c.tsType ?? '—' : mapColumnType(c).sql),
                h('td', {}, c.nullable ? 'sim' : 'não'),
                h('td', {}, c.primary ? (c.generated ? 'gerada' : 'sim') : ''),
                h('td', {}, c.line ? sourceRef(r.file, c.line, copy, String(c.line)) : ''),
              ),
            ),
          ),
        ),
      );
    }
    if (e?.relations.length) {
      const rel = (x) => h('li', {}, h('span', { class: 'mono' }, x.property), ` — ${x.kind} → ${x.targetClass}${x.joinColumns[0]?.name ? ` (coluna ${x.joinColumns[0].name})` : ''}`);
      box.append(h('h3', {}, 'Relações'), h('ul', { class: 'reasons' }, ...e.relations.map(rel)));
    }
    if (e) {
      const sharedName = state.analysis.reports.filter((x) => x.entity && x.className === e.className).length > 1;
      box.append(...usagesBlock(e, state.usages.get(e.className) ?? [], sharedName, copy));
    }
    box.append(h('p', { class: 'hint' }, 'Arquivo: ', e?.line ? sourceRef(r.file, e.line, copy) : h('span', { class: 'mono' }, r.file)));
    return box;
  }

  DDL.ui.reviewStep = { renderReview };
})((globalThis.DDL = globalThis.DDL || {}));
