import { describe, expect, it } from 'vitest';
import { buildReports } from '../src/analysis/classify';
import { acceptRemaining, applyLengthToAll, applyLengthToEntity, clearEntity, setColumn, setFk, setTableName } from '../src/analysis/overrides';
import { generateDdl } from '../src/ddl/generate';
import type { Overrides, ParsedFile } from '../src/model';
import { parseFile } from '../src/parser/parseFile';
import { parseFixture } from './helpers';

const CAT = 'loja/Categoria.ts#Categoria';
const DIR = 'loja/Produto.ts#Produto';

const catalogo = (): ParsedFile[] => [
  parseFixture('Produto'),
  parseFixture('Categoria'),
  parseFixture('Marca'),
];
const report = (ovs: Overrides, id: string) => buildReports(catalogo(), ovs).reports.find((r) => r.id === id)!;

describe('revisão das suposições', () => {
  it('lista as suposições com chave, tipo e coluna', () => {
    const r = report({}, CAT);
    expect(r.assumptions).toEqual([
      expect.objectContaining({ key: 'col:nomeCategoria:length', kind: 'varchar-length', column: 'nomeCategoria', resolved: false }),
    ]);
  });

  it('corrigir o tamanho resolve e muda o status para revisado', () => {
    const ovs: Overrides = {};
    setColumn(ovs, CAT, 'nomeCategoria', { length: 100 });
    const r = report(ovs, CAT);
    expect(r.status).toBe('revised');
    expect(r.assumptions[0]).toMatchObject({ resolved: true, note: 'tamanho definido manualmente (VARCHAR2(100))' });
    expect(r.assumptions[0].snippet).toBe("@Column('varchar2', { name: 'NOME_CATEGORIA', length: 100 })");
  });

  it('enquanto faltar alguma, continua com suposições e conta as resolvidas', () => {
    const ovs: Overrides = {};
    setColumn(ovs, DIR, 'nome', { length: 120 });
    const r = report(ovs, DIR);
    expect(r.status).toBe('assumptions');
    expect(r.assumptions.filter((a) => a.resolved)).toHaveLength(1);
    expect(r.reasons.some((x) => x.startsWith('NOME:'))).toBe(false);
  });

  it('FK com tipo diferente: usar o tipo da PK ativa a FK e ajusta a coluna', () => {
    const ovs: Overrides = {};
    setFk(ovs, DIR, 'ID_CATEGORIA', 'adopt');
    const r = report(ovs, DIR);
    const a = r.assumptions.find((x) => x.key === 'fk:ID_CATEGORIA:type')!;
    expect(a).toMatchObject({ kind: 'fk-type', resolved: true });
    expect(a.snippet).toBe("@Column('number', { name: 'ID_CATEGORIA' })");
    expect(r.assumptions.find((x) => x.key === 'col:idCategoria:length')!.resolved).toBe(true);
    const { reports, registry } = buildReports(catalogo(), ovs);
    const sql = generateDdl(reports.filter((x) => x.id === DIR), registry, { oracle11g: false, overrides: ovs }, { source: 't' });
    expect(sql).toMatch(/\n\s+ID_CATEGORIA\s+NUMBER NOT NULL,/);
    expect(sql).toMatch(/^ALTER TABLE PRODUTO ADD CONSTRAINT FK_PRODUTO_ID_CATEGORIA FOREIGN KEY \(ID_CATEGORIA\)/m);
    expect(sql).toContain('-- Revisado: tipo de ID_CATEGORIA ajustado ao da PK de destino (NUMBER)');
  });

  it('FK mantida comentada também conta como resolvida', () => {
    const ovs: Overrides = {};
    setFk(ovs, DIR, 'ID_MARCA', 'keep');
    const a = report(ovs, DIR).assumptions.find((x) => x.key === 'fk:ID_MARCA:type')!;
    expect(a).toMatchObject({ resolved: true, note: 'FK ID_MARCA mantida comentada por decisão manual' });
  });

  it('aceitar as demais resolve tudo (inclusive FK para entity não carregada)', () => {
    const ovs: Overrides = {};
    const files = [parseFixture('Produto')];
    const r0 = buildReports(files, ovs).reports[0];
    acceptRemaining(ovs, r0);
    const r = buildReports(files, ovs).reports[0];
    expect(r.status).toBe('revised');
    expect(r.assumptions.every((a) => a.resolved)).toBe(true);
  });

  it('aplicar tamanho em lote: por entity e em todas', () => {
    const ovs: Overrides = {};
    applyLengthToEntity(ovs, report(ovs, DIR), 80);
    expect(ovs[DIR].columns.nome.length).toBe(80);
    expect(ovs[DIR].columns.status).toBeUndefined();
    applyLengthToAll(ovs, buildReports(catalogo(), ovs).reports, 60);
    expect(ovs[CAT].columns.nomeCategoria.length).toBe(60);
    expect(ovs[DIR].columns.nome.length).toBe(80);
  });

  it('desfazer revisão volta ao estado original', () => {
    const ovs: Overrides = {};
    setColumn(ovs, CAT, 'nomeCategoria', { length: 100 });
    clearEntity(ovs, CAT);
    expect(report(ovs, CAT).status).toBe('assumptions');
  });

  it('tipo e nome de coluna/tabela editáveis', () => {
    const files = [parseFile('x.ts', `@Entity() export class NotaFiscal { @PrimaryColumn() id: number  @Column() obs: xpto }`)];
    const id = 'x.ts#NotaFiscal';
    const ovs: Overrides = {};
    const r0 = buildReports(files, ovs).reports[0];
    expect(r0.assumptions.map((a) => a.key).sort()).toEqual(
      ['col:id:name', 'col:obs:name', 'col:obs:type', 'table:name'].sort(),
    );
    setTableName(ovs, id, 'NF');
    setColumn(ovs, id, 'id', { name: 'ID' });
    setColumn(ovs, id, 'obs', { name: 'OBS', type: 'clob' });
    const r = buildReports(files, ovs).reports[0];
    expect(r.status).toBe('revised');
    expect(r.tableName).toBe('NF');
    const sql = generateDdl([r], buildReports(files, ovs).registry, { oracle11g: false, overrides: ovs }, { source: 't' });
    expect(sql).toContain('CREATE TABLE NF (');
    expect(sql).toMatch(/\n\s+OBS\s+CLOB NOT NULL,/);
    expect(r.assumptions.find((a) => a.key === 'col:obs:type')!.snippet).toBe("@Column('clob', { name: 'OBS' })");
  });

  it('SQL marca o que foi revisado', () => {
    const ovs: Overrides = {};
    setColumn(ovs, CAT, 'nomeCategoria', { length: 100 });
    const { reports, registry } = buildReports(catalogo(), ovs);
    const sql = generateDdl(reports.filter((r) => r.id === CAT), registry, { oracle11g: false, overrides: ovs }, { source: 't' });
    expect(sql).toContain('-- Revisado: tamanho definido manualmente (VARCHAR2(100))');
    expect(sql).toMatch(/\n\s+NOME_CATEGORIA\s+VARCHAR2\(100\) NOT NULL,/);
  });
});
