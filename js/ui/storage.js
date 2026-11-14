/**
 * O que fica guardado neste navegador: correções das suposições e o tema.
 * Sem storage disponível (aba anônima, bloqueio), tudo vale só até fechar a aba.
 */
(function (DDL) {
  'use strict';

  const OVERRIDES_KEY = 'ddl-overrides-v1';
  const THEME_KEY = 'ddl-theme';

  function read(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* sem storage */
    }
  }

  /** @returns {import('../model.js').Overrides} */
  function loadOverrides() {
    try {
      const parsed = JSON.parse(read(OVERRIDES_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  const saveOverrides = (o) => write(OVERRIDES_KEY, JSON.stringify(o));
  const loadTheme = () => read(THEME_KEY);
  const saveTheme = (t) => write(THEME_KEY, t);

  DDL.ui = DDL.ui || {};
  DDL.ui.storage = { loadOverrides, saveOverrides, loadTheme, saveTheme };
})((globalThis.DDL = globalThis.DDL || {}));
