/** Exibição do SQL gerado: destaque de sintaxe e lista de avisos. */

const KEYWORDS = new Set(
  `CREATE TABLE ALTER ADD CONSTRAINT PRIMARY KEY FOREIGN REFERENCES NOT NULL DEFAULT COMMENT ON IS COLUMN
   INDEX UNIQUE SEQUENCE START WITH INCREMENT BY NOCACHE GENERATED AS IDENTITY
   SET DECLARE PROCEDURE BEGIN END EXCEPTION WHEN OTHERS THEN IF ELSE RAISE EXECUTE IMMEDIATE IN`.trim().split(/\s+/),
);
const TYPES = /^(VARCHAR2|NVARCHAR2|CHAR|NCHAR|NUMBER|FLOAT|DATE|TIMESTAMP|CLOB|NCLOB|BLOB|RAW)$/;

export const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function highlightCode(code: string) {
  let out = '';
  // q'[ e ]' do bloco PL/SQL são só a moldura do comando: não abrem string.
  const re = /(\bq'[[{<(!#]|[\]}>)!#]'(?=\)))|('(?:[^']|'')*')|([A-Za-z_][A-Za-z0-9_$#]*)|(\s+)|(.)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    if (m[1]) out += `<span class="tok-com">${escapeHtml(m[1])}</span>`;
    else if (m[2]) out += `<span class="tok-str">${escapeHtml(m[2])}</span>`;
    else if (m[3]) {
      const w = m[3];
      if (KEYWORDS.has(w)) out += `<span class="tok-kw">${w}</span>`;
      else if (TYPES.test(w)) out += `<span class="tok-type">${w}</span>`;
      else out += escapeHtml(w);
    } else out += escapeHtml(m[4] ?? m[5] ?? '');
  }
  return out;
}

function highlightLine(line: string) {
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
export function highlightSql(sql: string) {
  return sql
    .replace(/\n$/, '')
    .split('\n')
    .map((line, i) => `<span class="ln" id="sql-l${i + 1}">${highlightLine(line) || ' '}</span>`)
    .join('');
}

export interface ScriptWarning {
  line: number;
  text: string;
  where: string;
}

/**
 * Avisos do script (`-- ATENÇÃO:` e `-- MOTIVO:`), com a linha e onde ocorrem.
 * Avisos de coluna ficam logo acima da linha da coluna: mostra TABELA.COLUNA.
 */
export function collectWarnings(sql: string): ScriptWarning[] {
  const lines = sql.split('\n');
  const warns: ScriptWarning[] = [];
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
