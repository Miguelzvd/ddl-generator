/**
 * Etapa 3 — Script: SQL destacado, painel de avisos, opção 11g, copiar e baixar.
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
    const code = h('code', {});
    const pre = h('pre', { class: 'sql', tabindex: '0', 'aria-label': 'Script SQL gerado' }, code);
    const warnList = h('ul', { class: 'warn-list' });
    const stats = h('p', { class: 'muted' });

    const paint = () => {
      const sql = state.sql;
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

    const toggle11g = h('input', { type: 'checkbox', id: 'opt-11g', checked: state.opts.oracle11g });
    toggle11g.addEventListener('change', () => {
      state.opts.oracle11g = toggle11g.checked;
      state.sql = ctx.buildSql();
      paint();
      ctx.announce(toggle11g.checked ? 'Script refeito com SEQUENCE (Oracle 11g).' : 'Script refeito com IDENTITY (Oracle 12c+).');
    });

    const toggleBlock = h('input', { type: 'checkbox', id: 'opt-block', checked: !!state.opts.singleBlock });
    toggleBlock.addEventListener('change', () => {
      state.opts.singleBlock = toggleBlock.checked;
      state.sql = ctx.buildSql();
      paint();
      ctx.announce(toggleBlock.checked ? 'Script refeito como um único bloco PL/SQL.' : 'Script refeito com comandos separados.');
    });

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
        h('div', {}, h('h2', {}, 'Script gerado'), stats),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => ctx.go(2) }, icon('back'), 'Voltar para a lista'), copyBtn, dlBtn),
      ),
      h('label', { class: 'option', for: 'opt-11g' }, toggle11g, h('span', {}, h('strong', {}, 'Oracle 11g'), ' — usar SEQUENCE no lugar de IDENTITY e limitar nomes a 30 caracteres')),
      h('label', { class: 'option', for: 'opt-block' }, toggleBlock, h('span', {}, h('strong', {}, 'Bloco PL/SQL único'), ' — tudo num só comando (BEGIN … END;), que pula o que já existe e pode rodar de novo')),
      h('div', { class: 'script-grid' }, pre, h('aside', { class: 'warn-panel', 'aria-labelledby': 'warn-title' }, h('h3', { id: 'warn-title' }, 'Avisos no script'), warnList)),
    );
  }

  DDL.ui.scriptStep = { renderScript, collectWarnings };
})((globalThis.DDL = globalThis.DDL || {}));
