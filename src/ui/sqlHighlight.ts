const KEYWORDS = new Set(
  `CREATE TABLE ALTER ADD CONSTRAINT PRIMARY KEY FOREIGN REFERENCES NOT NULL DEFAULT COMMENT ON IS COLUMN
   INDEX UNIQUE SEQUENCE START WITH INCREMENT BY NOCACHE GENERATED AS IDENTITY`.split(/\s+/),
);
const TYPES = /^(VARCHAR2|NVARCHAR2|CHAR|NCHAR|NUMBER|FLOAT|DATE|TIMESTAMP|CLOB|NCLOB|BLOB|RAW)$/;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function highlightCode(code: string): string {
  let out = '';
  const re = /('(?:[^']|'')*')|([A-Za-z_][A-Za-z0-9_$#]*)|(\s+)|(.)/g;
  let m: RegExpExecArray | null;
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

function highlightLine(line: string): string {
  const idx = line.indexOf('--');
  const before = idx >= 0 && !/'[^']*$/.test(line.slice(0, idx)) ? line.slice(0, idx) : line;
  const comment = before === line ? '' : line.slice(idx);
  let html = highlightCode(before);
  if (comment) {
    const cls = /^--\s*(ATENÇÃO|MOTIVO):/.test(comment.trim()) ? 'tok-warn' : /^--\s*ALTER TABLE/.test(comment.trim()) ? 'tok-off' : 'tok-com';
    html += `<span class="${cls}">${escapeHtml(comment)}</span>`;
  }
  return html;
}

/** SQL → HTML com uma `<span class="ln">` por linha (ids `sql-l<n>`). */
export function highlightSql(sql: string): string {
  return sql
    .replace(/\n$/, '')
    .split('\n')
    .map((line, i) => `<span class="ln" id="sql-l${i + 1}">${highlightLine(line) || ' '}</span>`)
    .join('');
}
