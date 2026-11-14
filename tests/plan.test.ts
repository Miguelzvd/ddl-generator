import { describe, expect, it } from 'vitest';
import { buildReports } from '../src/analysis/classify';
import { mapColumnType } from '../src/ddl/typeMap';
import { planTable } from '../src/ddl/plan';
import type { ColumnModel } from '../src/model';
import { parseFile } from '../src/parser/parseFile';
import { parseFixture } from './helpers';

const col = (over: Partial<ColumnModel>): ColumnModel => ({
  property: 'p',
  nullable: true,
  primary: false,
  generated: false,
  unique: false,
  ...over,
});

describe('mapColumnType', () => {
  it('VARCHAR2 sem tamanho usa 255 e avisa', () => {
    const r = mapColumnType(col({ type: 'varchar2' }));
    expect(r.sql).toBe('VARCHAR2(255)');
    expect(r.warning).toMatch(/tamanho não definido/);
  });
  it('mapeia tipos conhecidos', () => {
    expect(mapColumnType(col({ type: 'varchar2', length: 10 }))).toEqual({ sql: 'VARCHAR2(10)' });
    expect(mapColumnType(col({ type: 'timestamp' })).sql).toBe('TIMESTAMP');
    expect(mapColumnType(col({ type: 'date' })).sql).toBe('DATE');
    expect(mapColumnType(col({ type: 'number', precision: 3 })).sql).toBe('NUMBER(3)');
    expect(mapColumnType(col({ type: 'number', precision: 10, scale: 2 })).sql).toBe('NUMBER(10,2)');
    expect(mapColumnType(col({ type: 'boolean' })).sql).toBe('NUMBER(1)');
    expect(mapColumnType(col({ type: 'clob' })).sql).toBe('CLOB');
  });
  it('sem tipo usa o tipo TypeScript', () => {
    expect(mapColumnType(col({ tsType: 'number' })).sql).toBe('NUMBER');
    expect(mapColumnType(col({ tsType: 'Date' })).sql).toBe('TIMESTAMP');
  });
  it('tipo desconhecido passa como está e avisa', () => {
    const r = mapColumnType(col({ type: 'xpto' }));
    expect(r.sql).toBe('XPTO');
    expect(r.warning).toMatch(/não reconhecido/);
  });
});

const catalogo = () => [
  parseFixture('Produto'),
  parseFixture('Categoria'),
  parseFixture('Marca'),
];

describe('planTable', () => {
  it('FK com tipo diferente da PK de destino sai inativa (ORA-02267)', () => {
    const { registry } = buildReports(catalogo());
    const plan = planTable(registry.get('Produto')!, registry, { oracle11g: false });
    const fk = plan.fks.find((f) => f.columns[0] === 'ID_CATEGORIA')!;
    expect(fk.active).toBe(false);
    expect(fk.reason).toMatch(/ORA-02267/);
    expect(fk.refColumns).toEqual(['ID_CATEGORIA']);
  });

  it('FK para entity não carregada sai inativa', () => {
    const { registry } = buildReports([parseFixture('Produto')]);
    const plan = planTable(registry.get('Produto')!, registry, { oracle11g: false });
    expect(plan.fks.every((f) => !f.active)).toBe(true);
    expect(plan.fks[0].reason).toMatch(/não foi carregada/);
  });

  it('FK compatível fica ativa', () => {
    const files = [
      parseFile('a.ts', `@Entity('PAI') class Pai { @PrimaryGeneratedColumn({name:'ID'}) id: number }`),
      parseFile('b.ts', `@Entity('FILHO') class Filho {
        @PrimaryGeneratedColumn({name:'ID'}) id: number
        @Column('number', {name:'PAI_ID'}) paiId: number
        @ManyToOne(() => Pai) @JoinColumn({name:'PAI_ID'}) pai: Pai }`),
    ];
    const { registry } = buildReports(files);
    const plan = planTable(registry.get('Filho')!, registry, { oracle11g: false });
    expect(plan.fks).toEqual([
      expect.objectContaining({ name: 'FK_FILHO_PAI_ID', columns: ['PAI_ID'], refTable: 'PAI', refColumns: ['ID'], active: true }),
    ]);
  });

  it('classes com o mesmo nome: usa a importada pelo arquivo', () => {
    const files = [
      parseFile('vendas/ClienteResumoV.ts', `@Entity('VENDAS.CLIENTE_RESUMO_V') export class ClienteResumoV { @PrimaryColumn('number',{name:'SEQ'}) seq: number }`),
      parseFile('loja/ClienteResumoV.ts', `@ViewEntity('CLIENTE_RESUMO_V') export class ClienteResumoV { @ViewColumn({name:'SEQ'}) seq: number }`),
      parseFile('loja/Esp.ts', `import { ClienteResumoV } from "./ClienteResumoV";
        @Entity('ESP') export class Esp { @PrimaryColumn('number',{name:'SEQ'}) seq: number
        @ManyToOne(() => ClienteResumoV) @JoinColumn({name:'SEQ'}) login: ClienteResumoV }`),
    ];
    const { registry } = buildReports(files);
    const plan = planTable(registry.get('Esp')!, registry, { oracle11g: false });
    expect(plan.fks[0].active).toBe(false);
    expect(plan.fks[0].reason).toMatch(/view/);
  });

  it('cria a coluna da FK quando ela não está declarada', () => {
    const files = [
      parseFile('a.ts', `@Entity('PAI') class Pai { @PrimaryColumn('number', {name:'ID', precision: 5}) id: number }`),
      parseFile('b.ts', `@Entity('FILHO') class Filho {
        @PrimaryGeneratedColumn({name:'ID'}) id: number
        @ManyToOne(() => Pai) @JoinColumn({name:'PAI_ID'}) pai: Pai }`),
    ];
    const { registry } = buildReports(files);
    const plan = planTable(registry.get('Filho')!, registry, { oracle11g: false });
    expect(plan.columns.find((c) => c.name === 'PAI_ID')).toMatchObject({ sql: 'NUMBER(5)', fromRelation: true });
    expect(plan.fks[0].active).toBe(true);
  });
});

describe('buildReports', () => {
  it('classifica as entities reais', () => {
    const { reports } = buildReports([
      ...catalogo(),
      parseFixture('Cliente'),
      parseFixture('PedidoV'),
      parseFixture('LogAcesso'),
    ]);
    const byClass = Object.fromEntries(reports.map((r) => [r.className, r]));
    expect(byClass.Produto.status).toBe('assumptions');
    expect(byClass.Categoria.status).toBe('assumptions');
    expect(byClass.Cliente.status).toBe('ok');
    expect(byClass.Cliente.reasons).toEqual([]);
    expect(byClass.PedidoV.status).toBe('impossible');
    expect(byClass.PedidoV.reasons[0]).toMatch(/view/);
    expect(byClass.LogAcesso).toMatchObject({ status: 'commented', tableName: 'LOG_ACESSO', schema: 'LOJA' });
  });

  it('arquivo com erro vira linha "não é possível" com o motivo', () => {
    const { reports } = buildReports([{ file: 'x.ts', entities: [], commented: [], error: 'boom' }]);
    expect(reports).toHaveLength(1);
    expect(reports[0].status).toBe('impossible');
    expect(reports[0].reasons[0]).toContain('boom');
  });

  it('entity sem colunas não é possível', () => {
    const { reports } = buildReports([parseFile('x.ts', `@Entity('VAZIA') class Vazia {}`)]);
    expect(reports[0].status).toBe('impossible');
    expect(reports[0].reasons[0]).toMatch(/Nenhuma coluna/);
  });

  it('duas entities na mesma tabela: a segunda avisa', () => {
    const { reports } = buildReports([
      parseFile('a.ts', `@Entity('T') class A { @PrimaryColumn('number',{name:'ID'}) id: number }`),
      parseFile('b.ts', `@Entity('T') class B { @PrimaryColumn('number',{name:'ID'}) id: number }`),
    ]);
    expect(reports[0].status).toBe('ok');
    expect(reports[1].status).toBe('assumptions');
    expect(reports[1].reasons[0]).toMatch(/mesma tabela/);
  });
});
