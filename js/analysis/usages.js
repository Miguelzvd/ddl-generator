/**
 * Onde cada entity é usada no projeto: linhas que citam o nome da classe
 * (repositórios, services, tipos, outras entities…), fora imports e comentários.
 *
 * @typedef {{ file: string, line: number, text: string }} Usage
 */
(function (DDL) {
  'use strict';

  const escapeRe = (s) => s.replace(/[$]/g, '\\$');

  /**
   * @param {import('../io/files.js').SourceFile[]} sources  todos os arquivos lidos
   * @param {{ className: string, file: string }[]} entities  o próprio arquivo da entity não conta como uso
   * @returns {Map<string, Usage[]>}  nome da classe → usos
   */
  function findUsages(sources, entities) {
    const index = new Map();
    const ownFiles = new Map();
    for (const e of entities) {
      if (!ownFiles.has(e.className)) ownFiles.set(e.className, new Set());
      ownFiles.get(e.className).add(e.file);
      index.set(e.className, []);
    }
    if (!index.size) return index;

    const names = [...index.keys()].sort((a, b) => b.length - a.length).map(escapeRe);
    const re = new RegExp(`(?<![\\w$])(${names.join('|')})(?![\\w$])`, 'g');

    for (const src of sources) {
      let inImport = false;
      src.text.split(/\r?\n/).forEach((raw, i) => {
        const text = raw.trim();
        // Imports (inclusive os de várias linhas) e reexports só repetem o nome.
        if (inImport) {
          if (/\bfrom\s*['"]/.test(text)) inImport = false;
          return;
        }
        if (/^import\b/.test(text)) {
          if (!/\bfrom\s*['"]|^import\s*['"]|;\s*$/.test(text)) inImport = true;
          return;
        }
        if (/^export\b.*\bfrom\s*['"]/.test(text) || /^(\/\/|\/\*|\*)/.test(text)) return;

        const seen = new Set();
        for (const m of text.matchAll(re)) {
          const name = m[1];
          if (seen.has(name) || ownFiles.get(name).has(src.path)) continue;
          seen.add(name);
          index.get(name).push({ file: src.path, line: i + 1, text });
        }
      });
    }
    return index;
  }

  DDL.usages = { findUsages };
})((globalThis.DDL = globalThis.DDL || {}));
