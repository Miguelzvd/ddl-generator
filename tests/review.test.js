const { describe, it } = require('node:test');
const { DDL, parseFixture, like, assert } = require('./helpers');

const { buildReports } = DDL.classify;
const { generateDdl } = DDL.generate;
const { parseFile } = DDL.parser;
const { acceptRemaining, applyLengthToAll, applyLengthToEntity, clearEntity, setColumn, setFk, setTableName } = DDL.overrides;

const CAT = 'loja/Categoria.ts#Categoria';
const PROD = 'loja/Produto.ts#Produto';

const catalogo = () => [parseFixture('Produto'), parseFixture('Categoria'), parseFixture('Marca')];
const report = (ovs, id) => buildReports(catalogo(), ovs).reports.find((r) => r.id === id);
const sqlFor = (files, ovs, id) => {
  const { reports, registry } = buildReports(files, ovs);
  return generateDdl(reports.filter((r) => r.id === id), registry, { oracle11g: false, overrides: ovs }, { source: 't' });
};

describe('revisão das suposições', () => {
  it('lista as suposições com chave, tipo e coluna', () => {
    const r = report({}, CAT);
    assert.equal(r.assumptions.length, 1);
    like(r.assumptions[0], { key: 'col:nomeCategoria:length', kind: 'varchar-length', column: 'nomeCategoria', resolved: false });
  });

  it('corrigir o tamanho resolve e muda o status para revisado', () => {
    const ovs = {};
    setColumn(ovs, CAT, 'nomeCategoria', { length: 100 });
    const r = report(ovs, CAT);
    assert.equal(r.status, 'revised');
    like(r.assumptions[0], { resolved: true, note: 'tamanho definido manualmente (VARCHAR2(100))' });
    assert.equal(r.assumptions[0].snippet, "@Column('varchar2', { name: 'NOME_CATEGORIA', length: 100 })");
  });

  it('enquanto faltar alguma, continua com suposições e conta as resolvidas', () => {
    const ovs = {};
    setColumn(ovs, PROD, 'nome', { length: 120 });
    const r = report(ovs, PROD);
    assert.equal(r.status, 'assumptions');
    assert.equal(r.assumptions.filter((a) => a.resolved).length, 1);
    assert.ok(!r.reasons.some((x) => x.startsWith('NOME:')));
  });

  it('FK com tipo diferente: usar o tipo da PK ativa a FK e ajusta a coluna', () => {
    const ovs = {};
    setFk(ovs, PROD, 'ID_CATEGORIA', 'adopt');
    const r = report(ovs, PROD);
    const a = r.assumptions.find((x) => x.key === 'fk:ID_CATEGORIA:type');
    like(a, { kind: 'fk-type', resolved: true });
    assert.equal(a.snippet, "@Column('number', { name: 'ID_CATEGORIA' })");
    assert.equal(r.assumptions.find((x) => x.key === 'col:idCategoria:length').resolved, true);
    const sql = sqlFor(catalogo(), ovs, PROD);
    assert.match(sql, /\n\s+ID_CATEGORIA\s+NUMBER NOT NULL,/);
    assert.match(sql, /^ALTER TABLE PRODUTO ADD CONSTRAINT FK_PRODUTO_ID_CATEGORIA FOREIGN KEY \(ID_CATEGORIA\)/m);
    assert.ok(sql.includes('-- Revisado: tipo de ID_CATEGORIA ajustado ao da PK de destino (NUMBER)'));
  });

  it('FK mantida comentada também conta como resolvida', () => {
    const ovs = {};
    setFk(ovs, PROD, 'ID_MARCA', 'keep');
    like(report(ovs, PROD).assumptions.find((x) => x.key === 'fk:ID_MARCA:type'), { resolved: true, note: 'FK ID_MARCA mantida comentada por decisão manual' });
  });

  it('aceitar as demais resolve tudo (inclusive FK para entity não carregada)', () => {
    const ovs = {};
    const files = [parseFixture('Produto')];
    acceptRemaining(ovs, buildReports(files, ovs).reports[0]);
    const r = buildReports(files, ovs).reports[0];
    assert.equal(r.status, 'revised');
    assert.ok(r.assumptions.every((a) => a.resolved));
  });

  it('aplicar tamanho em lote: por entity e em todas', () => {
    const ovs = {};
    applyLengthToEntity(ovs, report(ovs, PROD), 80);
    assert.equal(ovs[PROD].columns.nome.length, 80);
    assert.equal(ovs[PROD].columns.status, undefined);
    applyLengthToAll(ovs, buildReports(catalogo(), ovs).reports, 60);
    assert.equal(ovs[CAT].columns.nomeCategoria.length, 60);
    assert.equal(ovs[PROD].columns.nome.length, 80);
  });

  it('desfazer revisão volta ao estado original', () => {
    const ovs = {};
    setColumn(ovs, CAT, 'nomeCategoria', { length: 100 });
    clearEntity(ovs, CAT);
    assert.equal(report(ovs, CAT).status, 'assumptions');
  });

  it('tipo e nome de coluna/tabela editáveis', () => {
    const files = [parseFile('x.ts', `@Entity() export class NotaFiscal { @PrimaryColumn() id: number  @Column() obs: xpto }`)];
    const id = 'x.ts#NotaFiscal';
    const ovs = {};
    const r0 = buildReports(files, ovs).reports[0];
    assert.deepEqual(r0.assumptions.map((a) => a.key).sort(), ['col:id:name', 'col:obs:name', 'col:obs:type', 'table:name'].sort());
    setTableName(ovs, id, 'NF');
    setColumn(ovs, id, 'id', { name: 'ID' });
    setColumn(ovs, id, 'obs', { name: 'OBS', type: 'clob' });
    const r = buildReports(files, ovs).reports[0];
    assert.equal(r.status, 'revised');
    assert.equal(r.tableName, 'NF');
    const sql = sqlFor(files, ovs, id);
    assert.ok(sql.includes('CREATE TABLE NF ('));
    assert.match(sql, /\n\s+OBS\s+CLOB NOT NULL,/);
    assert.equal(r.assumptions.find((a) => a.key === 'col:obs:type').snippet, "@Column('clob', { name: 'OBS' })");
  });

  it('SQL marca o que foi revisado', () => {
    const ovs = {};
    setColumn(ovs, CAT, 'nomeCategoria', { length: 100 });
    const sql = sqlFor(catalogo(), ovs, CAT);
    assert.ok(sql.includes('-- Revisado: tamanho definido manualmente (VARCHAR2(100))'));
    assert.match(sql, /\n\s+NOME_CATEGORIA\s+VARCHAR2\(100\) NOT NULL,/);
  });
});
