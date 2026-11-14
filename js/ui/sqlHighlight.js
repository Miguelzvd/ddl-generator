/**
 * Destaque de sintaxe do SQL gerado (HTML escapado, uma linha por <span>).
 */
(function (DDL) {
  'use strict';

  const KEYWORDS = new Set(
    `CREATE TABLE ALTER ADD CONSTRAINT PRIMARY KEY FOREIGN REFERENCES NOT NULL DEFAULT COMMENT ON IS COLUMN
     INDEX UNIQUE SEQUENCE START WITH INCREMENT BY NOCACHE GENERATED AS IDENTITY`.trim().split(/\s+/),
  );
  const TYPES = /^(VARCHAR2|NVARCHAR2|CHAR|NCHAR|NUMBER|FLOAT|DATE|TIMESTAMP|CLOB|NCLOB|BLOB|RAW)$/;

  const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function highlightCode(code) {
    let out = '';
    const re = /('(?:[^']|'')*')|([A-Za-z_][A-Za-z0-9_$#]*)|(\s+)|(.)/g;
    let m;
    while ((m = re.exec(code))) {
      if (m[1]) out += `<span class="tok-str">${escapeHtml(m[1])}</span>`;
      else if (m[2]) {
        const w = m[2];
        if (KEYWORDS.has(w)) out += `<span class="tok-kw">${w}</span>`;
        else if (TYPES.test(w)) out += `<span class="tok-type">${w}</span>`;
        else out += escapeHtml(w);
      } else out += escapeHtml(m[3] ?? m[4] ?? '');
    }
    return out;
  }

  function highlightLine(line) {
    const idx = line.indexOf('--');
    // `--` dentro de uma string não é comentário.
    const before = idx >= 0 && !/'[^']*$/.test(line.slice(0, idx)) ? line.slice(0, idx) : line;
    const comment = before === line ? '' : line.slice(idx);
    let html = highlightCode(before);
    if (comment) {
      const c = comment.trim();
      const cls = /^--\s*(ATENÇÃO|MOTIVO):/.test(c) ? 'tok-warn' : /^--\s*ALTER TABLE/.test(c) ? 'tok-off' : 'tok-com';
      html += `<span class="${cls}">${escapeHtml(comment)}</span>`;
    }
    return html;
  }

  /** SQL → HTML com uma `<span class="ln">` por linha (ids `sql-l<n>`). */
  function highlightSql(sql) {
    return sql
      .replace(/\n$/, '')
      .split('\n')
      .map((line, i) => `<span class="ln" id="sql-l${i + 1}">${highlightLine(line) || ' '}</span>`)
      .join('');
  }

  DDL.ui = DDL.ui || {};
  DDL.ui.sqlHighlight = { escapeHtml, highlightSql };
})((globalThis.DDL = globalThis.DDL || {}));
