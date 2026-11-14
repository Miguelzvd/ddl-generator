import { describe, expect, it } from 'vitest';
import { highlightSql } from '../src/ui/sqlHighlight';

describe('highlightSql', () => {
  it('escapa HTML', () => {
    const html = highlightSql("COMMENT ON TABLE T IS '<script>x</script> & y';");
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&amp;');
  });
  it('marca comentários, ATENÇÃO, palavras-chave e strings', () => {
    const html = highlightSql("-- ATENÇÃO: x\nCREATE TABLE T (A NUMBER);\nCOMMENT ON TABLE T IS 'oi';");
    expect(html).toContain('class="tok-warn"');
    expect(html).toContain('<span class="tok-kw">CREATE</span>');
    expect(html).toContain('<span class="tok-str">&#39;oi&#39;</span>');
  });
  it('gera uma linha por linha do SQL, com id para navegação', () => {
    const html = highlightSql('A\nB\nC');
    expect(html.match(/class="ln"/g)).toHaveLength(3);
    expect(html).toContain('id="sql-l3"');
  });
});
