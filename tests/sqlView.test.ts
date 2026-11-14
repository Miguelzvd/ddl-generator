import { describe, it } from 'vitest';
import { assert } from './helpers';
import { highlightSql } from '../src/lib/sqlView';
import { collectWarnings } from '../src/lib/sqlView';


describe('highlightSql', () => {
  it('escapa HTML', () => {
    const html = highlightSql("COMMENT ON TABLE T IS '<script>x</script> & y';");
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(html.includes('&amp;'));
  });
  it('marca comentários, ATENÇÃO, palavras-chave e strings', () => {
    const html = highlightSql("-- ATENÇÃO: x\nCREATE TABLE T (A NUMBER);\nCOMMENT ON TABLE T IS 'oi';");
    assert.ok(html.includes('class="tok-warn"'));
    assert.ok(html.includes('<span class="tok-kw">CREATE</span>'));
    assert.ok(html.includes('<span class="tok-str">&#39;oi&#39;</span>'));
  });
  it('gera uma linha por linha do SQL, com id para navegação', () => {
    const html = highlightSql('A\nB\nC');
    assert.equal(html.match(/class="ln"/g).length, 3);
    assert.ok(html.includes('id="sql-l3"'));
  });
});

describe('collectWarnings', () => {
  it('aponta TABELA.COLUNA, chave estrangeira e a linha', () => {
    const sql = [
      '-- Tabela LOJA.T',
      'CREATE TABLE LOJA.T (',
      '  -- ATENÇÃO: tamanho não definido',
      '  NOME VARCHAR2(255),',
      '  -- ATENÇÃO: entity sem chave primária declarada',
      ');',
      '-- MOTIVO: tipos diferentes',
      '-- ALTER TABLE ...',
    ].join('\n');
    assert.deepEqual(collectWarnings(sql), [
      { line: 3, text: 'tamanho não definido', where: 'LOJA.T.NOME' },
      { line: 5, text: 'entity sem chave primária declarada', where: 'LOJA.T' },
      { line: 7, text: 'tipos diferentes', where: 'Chave estrangeira' },
    ]);
  });
});
