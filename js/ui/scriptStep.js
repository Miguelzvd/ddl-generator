/**
 * Etapa 3 — Script: SQL destacado e editável, painel de avisos, opções, copiar e baixar.
 */
(function (DDL) {
  'use strict';

  const { h, icon } = DDL.ui.dom;
  const { highlightSql } = DDL.ui.sqlHighlight;

  /**
   * Avisos do script (`-- ATENÇÃO:` e `-- MOTIVO:`), com a linha e onde ocorrem.
   * Avisos de coluna ficam logo acima da linha da coluna: mostra TABELA.COLUNA.
   * @param {string} sql
   * @returns {{ line: number, text: string, where: string }[]}
   */
  function collectWarnings(sql) {
    const lines = sql.split('\n');
    const warns = [];
    let table = '';
    lines.forEach((l, i) => {
      const t = /^\s*-- Tabela (.+)$/.exec(l);
      if (t) table = t[1];
      if (!/^\s*-- (ATENÇÃO|MOTIVO):/.test(l)) return;
      const next = lines.slice(i + 1).find((x) => !/^\s*--/.test(x)) ?? '';
      const col = /^\s{2}("?[A-Za-z_][\w$#]*"?)\s/.exec(next)?.[1];
      const where = /MOTIVO/.test(l) ? 'Chave estrangeira' : col && col !== 'CONSTRAINT' ? `${table}.${col}` : table;
      warns.push({ line: i + 1, text: l.replace(/^\s*-- (ATENÇÃO|MOTIVO):\s*/, ''), where });
    });
    return warns;
  }

  /** `ddl-<schema>-AAAAMMDD.sql` quando só há um schema; senão `ddl-projeto-…`. */
  function fileName(state) {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const schemas = new Set(state.analysis.reports.filter((r) => state.selected.has(r.id)).map((r) => r.schema).filter(Boolean));
    const base = schemas.size === 1 ? [...schemas][0].toLowerCase() : 'projeto';
    return `ddl-${base}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.sql`;
  }

  function jumpTo(line) {
    const el = document.getElementById(`sql-l${line}`);
    if (!el) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    el.classList.remove('flash');
    void el.offsetWidth; // reinicia a animação
    el.classList.add('flash');
  }

  function download(text, name) {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = h('a', { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /** @param {import('./loadStep.js').AppCtx} ctx */
  function renderScript(ctx) {
    const { state } = ctx;
    // Editor: textarea transparente por cima do SQL destacado (mesma fonte e linhas).
    const code = h('code', {});
    const pre = h('pre', { 'aria-hidden': 'true' }, code);
    const editor = h('textarea', {
      class: 'sql-input',
      'aria-label': 'Script SQL (editável)',
      spellcheck: 'false',
      autocomplete: 'off',
      autocapitalize: 'off',
      wrap: 'off',
    });
    const box = h('div', { class: 'sql' }, h('div', { class: 'sql-inner' }, pre, editor));
    const warnList = h('ul', { class: 'warn-list' });
    const stats = h('p', { class: 'muted' });

    const revertBtn = h('button', { type: 'button', class: 'btn btn-sm' }, icon('undo', 14), 'Reverter');
    const editedTag = h('span', { class: 'edited', role: 'status' }, h('span', { class: 'edited-dot', 'aria-hidden': 'true' }), 'Editado', revertBtn);
    revertBtn.addEventListener('click', () => {
      state.sql = state.generatedSql;
      state.sqlEdited = false;
      paint();
      editor.focus();
      ctx.announce('Alterações desfeitas: o script voltou ao gerado.');
    });

    /** @param {boolean} [fromEditor]  true quando quem mudou foi a digitação (não mexe no textarea) */
    const paint = (fromEditor = false) => {
      const sql = state.sql;
      if (!fromEditor) editor.value = sql;
      editedTag.hidden = !state.sqlEdited;
      code.innerHTML = highlightSql(sql);
      // No bloco PL/SQL os comandos vêm como `  run(q'[CREATE ...`.
      const count = (re) => (sql.match(re) ?? []).length;
      const tables = count(/^(?:\s*run\(q'.)?CREATE TABLE /gm);
      const fkOn = count(/^(?:\s*run\(q'.)?ALTER TABLE /gm);
      const fkOff = count(/^\s*-- ALTER TABLE /gm);
      stats.textContent = `${tables} tabelas · ${fkOn} FKs ativas · ${fkOff} FKs comentadas · ${sql.split('\n').length} linhas`;
      const warns = collectWarnings(sql);
      warnList.replaceChildren(
        ...(warns.length
          ? warns.map((w) =>
              h(
                'li',
                {},
                h(
                  'button',
                  { type: 'button', class: 'warn-item', onclick: () => jumpTo(w.line) },
                  h('span', { class: 'warn-table mono' }, w.where || 'Geral'),
                  h('span', {}, w.text),
                  h('span', { class: 'warn-line num' }, `linha ${w.line}`),
                ),
              ),
            )
          : [h('li', { class: 'muted' }, 'Nenhuma suposição: o script saiu exato.')]),
      );
    };

    let pending = 0;
    editor.addEventListener('input', () => {
      const was = state.sqlEdited;
      state.sql = editor.value;
      state.sqlEdited = state.sql !== state.generatedSql;
      if (state.sqlEdited && !was) ctx.announce('Script editado. Use Reverter para voltar ao gerado.');
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => paint(true));
    });
    // Tab insere recuo em vez de sair do campo; Esc libera o Tab para navegar.
    let tabTraps = true;
    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') tabTraps = false;
      if (e.key !== 'Tab' || e.shiftKey || !tabTraps) return;
      e.preventDefault();
      document.execCommand('insertText', false, '  ');
    });
    editor.addEventListener('blur', () => (tabTraps = true));

    /** Opção que refaz o script: com SQL editado, pede para descartar antes. */
    const option = (id, checked, apply, msg) => {
      const input = h('input', { type: 'checkbox', id, checked });
      input.addEventListener('change', async () => {
        const want = input.checked;
        if (state.sqlEdited) {
          input.checked = !want;
          if (!(await ctx.confirmDiscard())) return;
          input.checked = want;
        }
        apply(want);
        ctx.regenerate();
        paint();
        ctx.announce(msg(want));
      });
      return input;
    };

    const toggle11g = option(
      'opt-11g',
      state.opts.oracle11g,
      (on) => (state.opts.oracle11g = on),
      (on) => (on ? 'Script refeito com SEQUENCE (Oracle 11g).' : 'Script refeito com IDENTITY (Oracle 12c+).'),
    );
    const toggleOwner = option(
      'opt-owner',
      state.opts.useOwner !== false,
      (on) => (state.opts.useOwner = on),
      (on) => (on ? 'Script refeito com OWNER.TABELA a partir do schema das entities.' : 'Script refeito sem owner nos nomes.'),
    );

    // Tabelas marcadas cuja entity não declara schema: ficam sem owner mesmo com a opção ligada.
    const tables = state.analysis.reports.filter((r) => r.kind !== 'view' && state.selected.has(r.id));
    const unmapped = tables.filter((r) => !r.schema).map((r) => r.tableName);
    const SHOW = 8;
    const ownerNote = unmapped.length
      ? h(
          'span',
          { class: 'option-note warn' },
          `${unmapped.length} de ${tables.length} tabelas sem schema na entity ficam sem owner: `,
          h('span', { class: 'mono' }, unmapped.slice(0, SHOW).join(', ')),
          unmapped.length > SHOW ? ` e mais ${unmapped.length - SHOW}` : '',
          '.',
        )
      : h('span', { class: 'option-note' }, `Todas as ${tables.length} tabelas marcadas têm schema na entity.`);

    const toggleBlock = option(
      'opt-block',
      !!state.opts.singleBlock,
      (on) => (state.opts.singleBlock = on),
      (on) => (on ? 'Script refeito como um único bloco PL/SQL.' : 'Script refeito com comandos separados.'),
    );

    const copyLabel = (done) => [icon(done ? 'check' : 'copy'), h('span', {}, done ? 'Copiado' : 'Copiar')];
    const copyBtn = h('button', { type: 'button', class: 'btn' }, ...copyLabel(false));
    copyBtn.addEventListener('click', async () => {
      await ctx.copyText(state.sql);
      copyBtn.replaceChildren(...copyLabel(true));
      setTimeout(() => copyBtn.replaceChildren(...copyLabel(false)), 2000);
    });

    const dlBtn = h('button', { type: 'button', class: 'btn btn-primary' }, icon('download'), 'Baixar .sql');
    dlBtn.addEventListener('click', () => {
      const name = fileName(state);
      download(state.sql, name);
      ctx.announce(`Arquivo ${name} baixado.`);
    });

    paint();
    return h(
      'div',
      { class: 'stack' },
      h(
        'div',
        { class: 'review-head' },
        h('div', {}, h('div', { class: 'title-row' }, h('h2', {}, 'Script gerado'), editedTag), stats),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => ctx.go(2) }, icon('back'), 'Voltar para a lista'), copyBtn, dlBtn),
      ),
      h('label', { class: 'option', for: 'opt-11g' }, toggle11g, h('span', {}, h('strong', {}, 'Oracle 11g'), ' — usar SEQUENCE no lugar de IDENTITY e limitar nomes a 30 caracteres')),
      h(
        'label',
        { class: 'option', for: 'opt-owner' },
        toggleOwner,
        h('span', {}, h('strong', {}, 'OWNER.TABELA'), ' — usar o schema declarado na entity (ex.: schema: \'APP\') como owner de tabelas, FKs, sequences e índices', ownerNote),
      ),
      h('label', { class: 'option', for: 'opt-block' }, toggleBlock, h('span', {}, h('strong', {}, 'Bloco PL/SQL único'), ' — tudo num só comando (BEGIN … END;), que pula o que já existe e pode rodar de novo')),
      h('p', { class: 'hint' }, 'Dá para editar o SQL direto abaixo; copiar e baixar levam a versão editada.'),
      h('div', { class: 'script-grid' }, box, h('aside', { class: 'warn-panel', 'aria-labelledby': 'warn-title' }, h('h3', { id: 'warn-title' }, 'Avisos no script'), warnList)),
    );
  }

  DDL.ui.scriptStep = { renderScript, collectWarnings };
})((globalThis.DDL = globalThis.DDL || {}));
