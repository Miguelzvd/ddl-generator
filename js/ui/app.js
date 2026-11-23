/**
 * Moldura da tela: topo com etapas e tema, área principal e avisos para leitor de tela.
 */
(function (DDL) {
  'use strict';

  const { h, icon } = DDL.ui.dom;
  const { generateDdl } = DDL.generate;
  const { loadTheme, saveTheme } = DDL.ui.storage;
  const S = DDL.ui.state;

  const STEPS = [
    { n: 1, label: 'Carregar', render: (ctx) => DDL.ui.loadStep.renderLoad(ctx) },
    { n: 2, label: 'Revisar', render: (ctx) => DDL.ui.reviewStep.renderReview(ctx) },
    { n: 3, label: 'Script', render: (ctx) => DDL.ui.scriptStep.renderScript(ctx) },
  ];

  /** Botão de tema: alterna claro/escuro e lembra a escolha. */
  function themeButton() {
    const btn = h('button', { class: 'btn btn-ghost btn-icon', type: 'button', 'aria-label': 'Alternar tema claro/escuro' });
    const root = document.documentElement;
    const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
    const apply = (t) => {
      if (t === 'light' || t === 'dark') root.dataset.theme = t;
      else delete root.dataset.theme;
      btn.replaceChildren(icon(isDark() ? 'sun' : 'moon', 18));
      btn.title = isDark() ? 'Usar tema claro' : 'Usar tema escuro';
    };
    apply(loadTheme());
    btn.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      saveTheme(next);
      apply(next);
    });
    return btn;
  }

  async function copyText(text, announce) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Sem permissão de clipboard (ex.: file:// em alguns navegadores): usa o jeito antigo.
      const ta = h('textarea', {}, text);
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    announce('Copiado para a área de transferência.');
  }

  /** @param {HTMLElement} root */
  function mountApp(root) {
    const state = S.initialState();
    const live = h('div', { class: 'sr-only', 'aria-live': 'polite', role: 'status' });
    const main = h('main', { id: 'main', class: 'main', tabindex: '-1' });
    const stepper = h('ol', { class: 'stepper', 'aria-label': 'Etapas' });

    /**
     * Se o SQL foi editado, pergunta antes de descartar. Resolve true quando pode
     * seguir (sem edição ou o usuário aceitou descartar; aí o SQL volta ao gerado).
     * @returns {Promise<boolean>}
     */
    function confirmDiscard() {
      if (!state.sqlEdited) return Promise.resolve(true);
      return new Promise((resolve) => {
        const keep = h('button', { type: 'button', class: 'btn' }, 'Continuar editando');
        const discard = h('button', { type: 'button', class: 'btn btn-danger' }, 'Descartar alterações');
        const dlg = h(
          'dialog',
          { class: 'dialog', 'aria-labelledby': 'discard-title', 'aria-describedby': 'discard-desc' },
          h('h2', { id: 'discard-title' }, 'Descartar as alterações no script?'),
          h('p', { id: 'discard-desc', class: 'muted' }, 'Você editou o SQL. Se continuar, o script volta a ser o gerado e as alterações que você fez serão desfeitas.'),
          h('div', { class: 'row dialog-actions' }, keep, discard),
        );
        const close = (ok) => {
          dlg.close();
          dlg.remove();
          if (ok) {
            state.sql = state.generatedSql;
            state.sqlEdited = false;
          }
          resolve(ok);
        };
        keep.addEventListener('click', () => close(false));
        discard.addEventListener('click', () => close(true));
        dlg.addEventListener('cancel', (e) => {
          e.preventDefault();
          close(false);
        });
        document.body.append(dlg);
        dlg.showModal();
        keep.focus();
      });
    }

    // Fechar ou recarregar a aba com SQL editado também perde as alterações.
    window.addEventListener('beforeunload', (e) => {
      if (state.sqlEdited) e.preventDefault();
    });

    /** @type {import('./loadStep.js').AppCtx} */
    const ctx = {
      state,
      render,
      confirmDiscard,
      async go(step) {
        if (state.step === 3 && step !== 3 && !(await confirmDiscard())) return;
        state.step = step;
        render();
        main.focus({ preventScroll: true });
        window.scrollTo({ top: 0 });
      },
      regenerate() {
        state.sql = state.generatedSql = ctx.buildSql();
        state.sqlEdited = false;
      },
      announce(msg) {
        live.textContent = '';
        requestAnimationFrame(() => (live.textContent = msg));
      },
      copyText: (text) => copyText(text, ctx.announce),
      buildSql() {
        const chosen = state.analysis.reports.filter((r) => (S.isSelectable(r) && state.selected.has(r.id)) || r.kind === 'view');
        return generateDdl(chosen, state.analysis.registry, { ...state.opts, overrides: state.overrides }, { source: state.source });
      },
    };

    function renderStepper() {
      const enabled = (n) => n === 1 || (n === 2 && state.analysis.reports.length > 0) || (n === 3 && state.sql !== '');
      stepper.replaceChildren(
        ...STEPS.map(({ n, label }) =>
          h(
            'li',
            {},
            h('button', { type: 'button', class: 'step', 'aria-current': state.step === n ? 'step' : null, disabled: !enabled(n), onclick: () => ctx.go(n) }, h('span', { class: 'step-n' }, String(n)), h('span', {}, label)),
          ),
        ),
      );
    }

    function render() {
      renderStepper();
      main.replaceChildren(STEPS[state.step - 1].render(ctx));
    }

    root.append(
      h('a', { class: 'skip', href: '#main' }, 'Pular para o conteúdo'),
      h('header', { class: 'topbar' }, h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }), h('h1', {}, 'DDL Generator')), stepper, themeButton()),
      main,
      live,
    );
    render();
  }

  DDL.ui.app = { mountApp };
})((globalThis.DDL = globalThis.DDL || {}));
