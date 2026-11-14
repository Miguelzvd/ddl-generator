/**
 * Ajudantes de DOM: `h()` para criar elementos e `icon()` para os ícones SVG.
 */
(function (DDL) {
  'use strict';

  /**
   * Cria um elemento: `h('button', { class: 'btn', onclick: fn }, 'Texto')`.
   * Atributos `false`/`null`/`undefined` são ignorados; `true` vira atributo vazio.
   * @param {string} tag
   * @param {Record<string, any>} [attrs]
   * @param {...any} children
   * @returns {HTMLElement}
   */
  function h(tag, attrs = {}, ...children) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      el.append(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }

  const ICONS = {
    folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
    chevron: 'M9 6l6 6-6 6',
    back: 'M15 6l-6 6 6 6',
    copy: 'M9 9h10v10H9zM5 15V5h10',
    download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
    sun: 'M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
    x: 'M6 6l12 12M18 6 6 18',
    check: 'M5 12l5 5 9-10',
    upload: 'M12 16V5M7 10l5-5 5 5M5 20h14',
  };

  /** Ícone SVG em traço, na cor do texto. */
  function icon(name, size = 16) {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    const attrs = { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' };
    for (const [k, v] of Object.entries(attrs)) svg.setAttribute(k, String(v));
    svg.classList.add('icon');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', ICONS[name] ?? '');
    svg.append(path);
    return svg;
  }

  /** Bolinha colorida do status. */
  const dot = (status) => h('span', { class: `dot dot-${status}`, 'aria-hidden': 'true' });

  /** Id seguro para o DOM a partir de qualquer texto. */
  const safeId = (s) => s.replace(/[^\w-]/g, '_');

  DDL.ui = DDL.ui || {};
  DDL.ui.dom = { h, icon, dot, safeId };
})((globalThis.DDL = globalThis.DDL || {}));
