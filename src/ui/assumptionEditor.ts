import { acceptRemaining, applyLengthToEntity, clearEntity, setAccepted, setColumn, setFk, setTableName } from '../analysis/overrides';
import type { Assumption, EntityReport, Overrides } from '../model';
import { h, icon } from './dom';

export const TYPEORM_TYPES = ['varchar2', 'nvarchar2', 'char', 'number', 'date', 'timestamp', 'clob', 'nclob', 'blob', 'boolean', 'float', 'raw'];

export interface EditorCtx {
  overrides: Overrides;
  /** Chamado depois de cada correção, com a mensagem para leitores de tela. */
  changed: (msg: string) => void;
  copy: (text: string) => Promise<void>;
}

const uid = (r: EntityReport, a: Assumption, part: string) => `ed-${r.id}-${a.key}-${part}`.replace(/[^\w-]/g, '_');

function field(id: string, label: string, input: HTMLElement): HTMLElement {
  return h('label', { class: 'field', for: id }, h('span', { class: 'field-label' }, label), input);
}

function control(r: EntityReport, a: Assumption, ctx: EditorCtx): HTMLElement | null {
  const ov = ctx.overrides[r.id];
  const colOv = a.column ? ov?.columns[a.column] : undefined;

  switch (a.kind) {
    case 'varchar-length': {
      const id = uid(r, a, 'len');
      const input = h('input', {
        id,
        type: 'number',
        class: 'input input-sm',
        min: '1',
        max: '32767',
        inputmode: 'numeric',
        value: colOv?.length ?? '',
        placeholder: a.current ?? '255',
        autocomplete: 'off',
      });
      input.addEventListener('change', () => {
        const n = input.value === '' ? undefined : Math.trunc(Number(input.value));
        setColumn(ctx.overrides, r.id, a.column!, { length: n && n > 0 ? n : undefined });
        ctx.changed(n ? `Tamanho de ${a.label} definido como ${n}.` : `Tamanho de ${a.label} voltou ao presumido.`);
      });
      return field(id, 'Tamanho', input);
    }
    case 'type': {
      const id = uid(r, a, 'type');
      const listId = `${id}-list`;
      const input = h('input', { id, class: 'input input-sm mono', list: listId, value: colOv?.type ?? '', placeholder: 'ex.: varchar2…', autocomplete: 'off', spellcheck: 'false' });
      input.addEventListener('change', () => {
        setColumn(ctx.overrides, r.id, a.column!, { type: input.value.trim().toLowerCase() || undefined });
        ctx.changed(`Tipo de ${a.label} atualizado.`);
      });
      return h('div', {}, field(id, 'Tipo (TypeORM)', input), h('datalist', { id: listId }, ...TYPEORM_TYPES.map((t) => h('option', { value: t }))));
    }
    case 'column-name': {
      const id = uid(r, a, 'name');
      const input = h('input', { id, class: 'input input-sm mono', value: colOv?.name ?? '', placeholder: a.current ?? '', autocomplete: 'off', spellcheck: 'false' });
      input.addEventListener('change', () => {
        setColumn(ctx.overrides, r.id, a.column!, { name: input.value.trim().toUpperCase() || undefined });
        ctx.changed(`Nome da coluna atualizado.`);
      });
      return field(id, 'Nome da coluna', input);
    }
    case 'table-name': {
      const id = uid(r, a, 'table');
      const input = h('input', { id, class: 'input input-sm mono', value: ov?.tableName ?? '', placeholder: a.current ?? '', autocomplete: 'off', spellcheck: 'false' });
      input.addEventListener('change', () => {
        setTableName(ctx.overrides, r.id, input.value.trim().toUpperCase() || undefined);
        ctx.changed(`Nome da tabela atualizado.`);
      });
      return field(id, 'Nome da tabela', input);
    }
    case 'fk-type': {
      const name = uid(r, a, 'fk');
      const cur = ov?.fks[a.fkColumn!];
      const radio = (value: 'adopt' | 'keep', text: string) => {
        const id = `${name}-${value}`;
        const input = h('input', { type: 'radio', id, name, value, checked: cur === value });
        input.addEventListener('change', () => {
          setFk(ctx.overrides, r.id, a.fkColumn!, value);
          ctx.changed(value === 'adopt' ? `FK ${a.fkColumn} vai usar o tipo da PK de destino.` : `FK ${a.fkColumn} fica comentada.`);
        });
        return h('label', { class: 'radio', for: id }, input, h('span', {}, text));
      };
      const clear = cur
        ? h('button', { type: 'button', class: 'link', onclick: () => { setFk(ctx.overrides, r.id, a.fkColumn!, undefined); ctx.changed('Decisão da FK desfeita.'); } }, 'desfazer')
        : null;
      return h('div', { class: 'radios', role: 'radiogroup', 'aria-label': `Decisão sobre a FK ${a.fkColumn}` }, radio('adopt', 'Usar o tipo da PK de destino'), radio('keep', 'Manter comentada'), clear);
    }
    default:
      return null;
  }
}

function assumptionItem(r: EntityReport, a: Assumption, ctx: EditorCtx): HTMLElement {
  const accepted = ctx.overrides[r.id]?.accepted.includes(a.key) ?? false;
  const ctl = control(r, a, ctx);
  let acceptBox: HTMLElement | null = null;
  if (a.kind !== 'fk-type') {
    const id = uid(r, a, 'ok');
    const cb = h('input', { type: 'checkbox', id, checked: accepted });
    cb.addEventListener('change', () => {
      setAccepted(ctx.overrides, r.id, a.key, cb.checked);
      ctx.changed(cb.checked ? 'Suposição aceita.' : 'Suposição reaberta.');
    });
    acceptBox = h('label', { class: 'check', for: id }, cb, h('span', {}, 'Aceitar como está'));
  }

  const snippet = a.snippet
    ? h(
        'div',
        { class: 'snippet' },
        h('span', { class: 'snippet-label' }, 'Corrigir no código'),
        h('code', { class: 'mono' }, a.snippet),
        h('button', { type: 'button', class: 'btn btn-ghost btn-sm', 'aria-label': 'Copiar trecho', onclick: () => void ctx.copy(a.snippet!) }, icon('copy', 14)),
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
    ctl || acceptBox ? h('div', { class: 'asm-controls' }, ctl, acceptBox) : null,
    a.resolved && a.note ? h('p', { class: 'asm-note' }, h('strong', {}, 'Revisado: '), a.note) : null,
    snippet,
  );
}

/** Lista editável das suposições de uma entity, com ações em lote. */
export function assumptionEditor(r: EntityReport, ctx: EditorCtx): HTMLElement {
  const open = r.assumptions.filter((a) => !a.resolved);
  const openLengths = open.filter((a) => a.kind === 'varchar-length').length;
  const hasOv = !!ctx.overrides[r.id];
  const resolved = r.assumptions.length - open.length;

  const actions = h('div', { class: 'asm-actions' });
  if (openLengths > 0) {
    const id = `bulk-${r.id}`.replace(/[^\w-]/g, '_');
    const input = h('input', { id, type: 'number', class: 'input input-sm', min: '1', max: '32767', value: '255', inputmode: 'numeric' });
    actions.append(
      h(
        'div',
        { class: 'bulk' },
        h('label', { for: id }, `Tamanho para os ${openLengths} VARCHAR2 sem tamanho desta entity:`),
        input,
        h('button', {
          type: 'button',
          class: 'btn btn-sm',
          onclick: () => {
            const n = Math.trunc(Number(input.value));
            if (!(n > 0)) return input.focus();
            const done = applyLengthToEntity(ctx.overrides, r, n);
            ctx.changed(`${done} colunas receberam tamanho ${n}.`);
          },
        }, 'Aplicar'),
      ),
    );
  }
  const buttons = h('div', { class: 'row' });
  if (open.length) buttons.append(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { acceptRemaining(ctx.overrides, r); ctx.changed('Demais suposições aceitas.'); } }, icon('check', 14), `Aceitar as ${open.length} restantes`));
  if (hasOv) buttons.append(h('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: () => { clearEntity(ctx.overrides, r.id); ctx.changed('Revisão desfeita.'); } }, icon('x', 14), 'Desfazer revisão'));
  if (buttons.childNodes.length) actions.append(buttons);

  const snippets = r.assumptions.filter((a) => a.snippet).map((a) => a.snippet!);
  const uniqueSnippets = [...new Set(snippets)];
  const code = uniqueSnippets.length
    ? h(
        'div',
        { class: 'code-fix' },
        h('div', { class: 'code-fix-head' }, h('h3', {}, 'Corrigir no código'), h('button', { type: 'button', class: 'btn btn-sm', onclick: () => void ctx.copy(uniqueSnippets.join('\n')) }, icon('copy', 14), 'Copiar trechos')),
        h('p', { class: 'hint' }, `Substitua os decorators em ${r.file} para que a próxima varredura já venha certa.`),
        h('pre', { class: 'code-block mono' }, uniqueSnippets.join('\n')),
      )
    : null;

  return h(
    'div',
    { class: 'editor' },
    h('div', { class: 'editor-head' }, h('h3', {}, 'Suposições'), h('span', { class: 'progress-pill num' }, `${resolved} de ${r.assumptions.length} resolvidas`)),
    actions,
    h('ul', { class: 'asm-list' }, ...r.assumptions.map((a) => assumptionItem(r, a, ctx))),
    code,
  );
}
