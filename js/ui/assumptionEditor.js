/**
 * Lista editável das suposições de uma entity: um campo por suposição,
 * "aceitar como está", ações em lote e os trechos para corrigir no código.
 *
 * @typedef {object} EditorCtx
 * @property {import('../model.js').Overrides} overrides
 * @property {(msg: string) => void} changed   chamado depois de cada correção
 * @property {(text: string) => Promise<void>} copy
 */
(function (DDL) {
  'use strict';

  const { h, icon, safeId } = DDL.ui.dom;
  const ov = DDL.overrides;

  const TYPEORM_TYPES = ['varchar2', 'nvarchar2', 'char', 'number', 'date', 'timestamp', 'clob', 'nclob', 'blob', 'boolean', 'float', 'raw'];

  const uid = (r, a, part) => safeId(`ed-${r.id}-${a.key}-${part}`);
  const field = (id, label, input) => h('label', { class: 'field', for: id }, h('span', { class: 'field-label' }, label), input);
  const textInput = (id, value, placeholder) => h('input', { id, class: 'input input-sm mono', value, placeholder, autocomplete: 'off', spellcheck: 'false' });
  const numberInput = (id, value, placeholder) => h('input', { id, type: 'number', class: 'input input-sm', min: '1', max: '32767', inputmode: 'numeric', value, placeholder, autocomplete: 'off' });

  /** Campo de correção conforme o tipo da suposição. */
  function control(r, a, ctx) {
    const eo = ctx.overrides[r.id];
    const colOv = a.column ? eo?.columns[a.column] : undefined;

    switch (a.kind) {
      case 'varchar-length': {
        const input = numberInput(uid(r, a, 'len'), colOv?.length ?? '', a.current ?? '255');
        input.addEventListener('change', () => {
          const n = input.value === '' ? undefined : Math.trunc(Number(input.value));
          ov.setColumn(ctx.overrides, r.id, a.column, { length: n && n > 0 ? n : undefined });
          ctx.changed(n ? `Tamanho de ${a.label} definido como ${n}.` : `Tamanho de ${a.label} voltou ao presumido.`);
        });
        return field(input.id, 'Tamanho', input);
      }
      case 'type': {
        const input = textInput(uid(r, a, 'type'), colOv?.type ?? '', 'ex.: varchar2…');
        const listId = `${input.id}-list`;
        input.setAttribute('list', listId);
        input.addEventListener('change', () => {
          ov.setColumn(ctx.overrides, r.id, a.column, { type: input.value.trim().toLowerCase() || undefined });
          ctx.changed(`Tipo de ${a.label} atualizado.`);
        });
        return h('div', {}, field(input.id, 'Tipo (TypeORM)', input), h('datalist', { id: listId }, ...TYPEORM_TYPES.map((t) => h('option', { value: t }))));
      }
      case 'column-name': {
        const input = textInput(uid(r, a, 'name'), colOv?.name ?? '', a.current ?? '');
        input.addEventListener('change', () => {
          ov.setColumn(ctx.overrides, r.id, a.column, { name: input.value.trim().toUpperCase() || undefined });
          ctx.changed('Nome da coluna atualizado.');
        });
        return field(input.id, 'Nome da coluna', input);
      }
      case 'table-name': {
        const input = textInput(uid(r, a, 'table'), eo?.tableName ?? '', a.current ?? '');
        input.addEventListener('change', () => {
          ov.setTableName(ctx.overrides, r.id, input.value.trim().toUpperCase() || undefined);
          ctx.changed('Nome da tabela atualizado.');
        });
        return field(input.id, 'Nome da tabela', input);
      }
      case 'fk-type':
        return fkChoice(r, a, ctx, eo?.fks[a.fkColumn]);
      default:
        return null;
    }
  }

  /** FK com tipo diferente da PK: usar o tipo da PK ou manter comentada. */
  function fkChoice(r, a, ctx, current) {
    const name = uid(r, a, 'fk');
    const radio = (value, text) => {
      const id = `${name}-${value}`;
      const input = h('input', { type: 'radio', id, name, value, checked: current === value });
      input.addEventListener('change', () => {
        ov.setFk(ctx.overrides, r.id, a.fkColumn, value);
        ctx.changed(value === 'adopt' ? `FK ${a.fkColumn} vai usar o tipo da PK de destino.` : `FK ${a.fkColumn} fica comentada.`);
      });
      return h('label', { class: 'radio', for: id }, input, h('span', {}, text));
    };
    const undo = current
      ? h('button', { type: 'button', class: 'link', onclick: () => { ov.setFk(ctx.overrides, r.id, a.fkColumn, undefined); ctx.changed('Decisão da FK desfeita.'); } }, 'desfazer')
      : null;
    return h('div', { class: 'radios', role: 'radiogroup', 'aria-label': `Decisão sobre a FK ${a.fkColumn}` }, radio('adopt', 'Usar o tipo da PK de destino'), radio('keep', 'Manter comentada'), undo);
  }

  function acceptBox(r, a, ctx) {
    if (a.kind === 'fk-type') return null;
    const id = uid(r, a, 'ok');
    const cb = h('input', { type: 'checkbox', id, checked: ctx.overrides[r.id]?.accepted.includes(a.key) ?? false });
    cb.addEventListener('change', () => {
      ov.setAccepted(ctx.overrides, r.id, a.key, cb.checked);
      ctx.changed(cb.checked ? 'Suposição aceita.' : 'Suposição reaberta.');
    });
    return h('label', { class: 'check', for: id }, cb, h('span', {}, 'Aceitar como está'));
  }

  function assumptionItem(r, a, ctx) {
    const ctl = control(r, a, ctx);
    const accept = acceptBox(r, a, ctx);
    const snippet = a.snippet
      ? h(
          'div',
          { class: 'snippet' },
          h('span', { class: 'snippet-label' }, 'Corrigir no código'),
          h('code', { class: 'mono' }, a.snippet),
          h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': 'Copiar trecho', onclick: () => void ctx.copy(a.snippet) }, icon('copy', 14)),
        )
      : null;

    return h(
      'li',
      { class: `asm${a.resolved ? ' is-resolved' : ''}` },
      h(
        'div',
        { class: 'asm-head' },
        h('span', { class: `asm-mark ${a.resolved ? 'ok' : 'open'}`, 'aria-hidden': 'true' }, a.resolved ? icon('check', 12) : ''),
        h('span', { class: 'sr-only' }, a.resolved ? 'Resolvida: ' : 'Aberta: '),
        a.label ? h('span', { class: 'mono asm-label' }, a.label) : null,
        h('span', {}, a.text),
      ),
      ctl || accept ? h('div', { class: 'asm-controls' }, ctl, accept) : null,
      a.resolved && a.note ? h('p', { class: 'asm-note' }, h('strong', {}, 'Revisado: '), a.note) : null,
      snippet,
    );
  }

  /** Tamanho em lote, "aceitar as restantes" e "desfazer revisão". */
  function bulkActions(r, open, ctx) {
    const actions = h('div', { class: 'asm-actions' });
    const openLengths = open.filter((a) => a.kind === 'varchar-length').length;
    if (openLengths > 0) {
      const input = numberInput(safeId(`bulk-${r.id}`), '255');
      const apply = () => {
        const n = Math.trunc(Number(input.value));
        if (!(n > 0)) return input.focus();
        const done = ov.applyLengthToEntity(ctx.overrides, r, n);
        ctx.changed(`${done} colunas receberam tamanho ${n}.`);
      };
      actions.append(
        h(
          'div',
          { class: 'bulk' },
          h('label', { for: input.id }, `Tamanho para os ${openLengths} VARCHAR2 sem tamanho desta entity:`),
          input,
          h('button', { type: 'button', class: 'btn btn-sm', onclick: apply }, 'Aplicar'),
        ),
      );
    }
    const buttons = h('div', { class: 'row' });
    if (open.length) {
      buttons.append(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { ov.acceptRemaining(ctx.overrides, r); ctx.changed('Demais suposições aceitas.'); } }, icon('check', 14), `Aceitar as ${open.length} restantes`));
    }
    if (ctx.overrides[r.id]) {
      buttons.append(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { ov.clearEntity(ctx.overrides, r.id); ctx.changed('Revisão desfeita.'); } }, icon('x', 14), 'Desfazer revisão'));
    }
    if (buttons.childNodes.length) actions.append(buttons);
    return actions;
  }

  /** Todos os trechos corrigidos da entity, para copiar de uma vez. */
  function codeFix(r, ctx) {
    const snippets = [...new Set(r.assumptions.filter((a) => a.snippet).map((a) => a.snippet))];
    if (!snippets.length) return null;
    const text = snippets.join('\n');
    return h(
      'div',
      { class: 'code-fix' },
      h('div', { class: 'code-fix-head' }, h('h3', {}, 'Corrigir no código'), h('button', { type: 'button', class: 'btn btn-sm', onclick: () => void ctx.copy(text) }, icon('copy', 14), 'Copiar trechos')),
      h('p', { class: 'hint' }, `Substitua os decorators em ${r.file} para que a próxima varredura já venha certa.`),
      h('pre', { class: 'code-block mono' }, text),
    );
  }

  /**
   * @param {import('../model.js').EntityReport} r
   * @param {EditorCtx} ctx
   */
  function assumptionEditor(r, ctx) {
    const open = r.assumptions.filter((a) => !a.resolved);
    const resolved = r.assumptions.length - open.length;
    return h(
      'div',
      { class: 'editor' },
      h('div', { class: 'editor-head' }, h('h3', {}, 'Suposições'), h('span', { class: 'progress-pill num' }, `${resolved} de ${r.assumptions.length} resolvidas`)),
      bulkActions(r, open, ctx),
      h('ul', { class: 'asm-list' }, ...r.assumptions.map((a) => assumptionItem(r, a, ctx))),
      codeFix(r, ctx),
    );
  }

  DDL.ui.assumptionEditor = { assumptionEditor };
})((globalThis.DDL = globalThis.DDL || {}));
