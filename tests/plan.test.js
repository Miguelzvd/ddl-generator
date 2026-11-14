const { describe, it } = require('node:test');
const { DDL, parseFixture, like, assert } = require('./helpers');

const { mapColumnType } = DDL.typeMap;
const { planTable } = DDL.plan;
const { buildReports } = DDL.classify;
const { parseFile } = DDL.parser;

const col = (over) => ({ property: 'p', nullable: true, primary: false, generated: false, unique: false, ...over });
const catalogo = () => [parseFixture('Produto'), parseFixture('Categoria'), parseFixture('Marca')];
const plan = (files, cls) => {
  const { registry } = buildReports(files);
  return planTable(registry.get(cls), registry, { oracle11g: false });
};

describe('mapColumnType', () => {
  it('VARCHAR2 sem tamanho usa 255 e avisa', () => {
    const r = mapColumnType(col({ type: 'varchar2' }));
    assert.equal(r.sql, 'VARCHAR2(255)');
    assert.match(r.warning, /tamanho não definido/);
  });
  it('mapeia tipos conhecidos', () => {
    assert.deepEqual(mapColumnType(col({ type: 'varchar2', length: 10 })), { sql: 'VARCHAR2(10)' });
    assert.equal(mapColumnType(col({ type: 'timestamp' })).sql, 'TIMESTAMP');
    assert.equal(mapColumnType(col({ type: 'date' })).sql, 'DATE');
    assert.equal(mapColumnType(col({ type: 'number', precision: 3 })).sql, 'NUMBER(3)');
    assert.equal(mapColumnType(col({ type: 'number', precision: 10, scale: 2 })).sql, 'NUMBER(10,2)');
    assert.equal(mapColumnType(col({ type: 'boolean' })).sql, 'NUMBER(1)');
    assert.equal(mapColumnType(col({ type: 'clob' })).sql, 'CLOB');
  });
  it('sem tipo usa o tipo TypeScript', () => {
    assert.equal(mapColumnType(col({ tsType: 'number' })).sql, 'NUMBER');
    assert.equal(mapColumnType(col({ tsType: 'Date' })).sql, 'TIMESTAMP');
  });
  it('tipo desconhecido passa como está e avisa', () => {
    const r = mapColumnType(col({ type: 'xpto' }));
    assert.equal(r.sql, 'XPTO');
    assert.match(r.warning, /não reconhecido/);
  });
});

describe('planTable', () => {
  it('FK com tipo diferente da PK de destino sai inativa (ORA-02267)', () => {
    const fk = plan(catalogo(), 'Produto').fks.find((f) => f.columns[0] === 'ID_CATEGORIA');
    assert.equal(fk.active, false);
    assert.match(fk.reason, /ORA-02267/);
    assert.deepEqual(fk.refColumns, ['ID_CATEGORIA']);
  });

  it('FK para entity não carregada sai inativa', () => {
    const p = plan([parseFixture('Produto')], 'Produto');
    assert.ok(p.fks.every((f) => !f.active));
    assert.match(p.fks[0].reason, /não foi carregada/);
  });

  it('FK compatível fica ativa', () => {
    const p = plan(
      [
        parseFile('a.ts', `@Entity('PAI') class Pai { @PrimaryGeneratedColumn({name:'ID'}) id: number }`),
        parseFile('b.ts', `@Entity('FILHO') class Filho {
          @PrimaryGeneratedColumn({name:'ID'}) id: number
          @Column('number', {name:'PAI_ID'}) paiId: number
          @ManyToOne(() => Pai) @JoinColumn({name:'PAI_ID'}) pai: Pai }`),
      ],
      'Filho',
    );
    assert.equal(p.fks.length, 1);
    like(p.fks[0], { name: 'FK_FILHO_PAI_ID', columns: ['PAI_ID'], refTable: 'PAI', refColumns: ['ID'], active: true });
  });

  it('classes com o mesmo nome: usa a importada pelo arquivo', () => {
    const p = plan(
      [
        parseFile('vendas/ClienteResumoV.ts', `@Entity('VENDAS.CLIENTE_RESUMO_V') export class ClienteResumoV { @PrimaryColumn('number',{name:'SEQ'}) seq: number }`),
        parseFile('loja/ClienteResumoV.ts', `@ViewEntity('CLIENTE_RESUMO_V') export class ClienteResumoV { @ViewColumn({name:'SEQ'}) seq: number }`),
        parseFile('loja/Esp.ts', `import { ClienteResumoV } from "./ClienteResumoV";
          @Entity('ESP') export class Esp { @PrimaryColumn('number',{name:'SEQ'}) seq: number
          @ManyToOne(() => ClienteResumoV) @JoinColumn({name:'SEQ'}) login: ClienteResumoV }`),
      ],
      'Esp',
    );
    assert.equal(p.fks[0].active, false);
    assert.match(p.fks[0].reason, /view/);
  });

  it('cria a coluna da FK quando ela não está declarada', () => {
    const p = plan(
      [
        parseFile('a.ts', `@Entity('PAI') class Pai { @PrimaryColumn('number', {name:'ID', precision: 5}) id: number }`),
        parseFile('b.ts', `@Entity('FILHO') class Filho {
          @PrimaryGeneratedColumn({name:'ID'}) id: number
          @ManyToOne(() => Pai) @JoinColumn({name:'PAI_ID'}) pai: Pai }`),
      ],
      'Filho',
    );
    like(p.columns.find((c) => c.name === 'PAI_ID'), { sql: 'NUMBER(5)', fromRelation: true });
    assert.equal(p.fks[0].active, true);
  });

  it('ManyToMany com @JoinTable gera a tabela de junção', () => {
    const p = plan(
      [
        parseFile('a.ts', `@Entity('TAG') class Tag { @PrimaryColumn('number', {name:'ID'}) id: number }`),
        parseFile('b.ts', `@Entity('POST') class Post { @PrimaryColumn('number', {name:'ID'}) id: number
          @ManyToMany(() => Tag) @JoinTable({ name: 'POST_TAG', joinColumn: { name: 'POST_ID' }, inverseJoinColumn: { name: 'TAG_ID' } }) tags: Tag[] }`),
      ],
      'Post',
    );
    like(p.joinTables[0], { tableName: 'POST_TAG', pk: ['POST_ID', 'TAG_ID'] });
    assert.deepEqual(p.joinTables[0].fks.map((f) => [f.refTable, f.active]), [['POST', true], ['TAG', true]]);
  });
});

describe('buildReports', () => {
  it('classifica as entities', () => {
    const { reports } = buildReports([...catalogo(), parseFixture('Cliente'), parseFixture('PedidoV'), parseFixture('LogAcesso')]);
    const byClass = Object.fromEntries(reports.map((r) => [r.className, r]));
    assert.equal(byClass.Produto.status, 'assumptions');
    assert.equal(byClass.Categoria.status, 'assumptions');
    assert.equal(byClass.Cliente.status, 'ok');
    assert.deepEqual(byClass.Cliente.reasons, []);
    assert.equal(byClass.PedidoV.status, 'impossible');
    assert.match(byClass.PedidoV.reasons[0], /view/);
    like(byClass.LogAcesso, { status: 'commented', tableName: 'LOG_ACESSO', schema: 'LOJA' });
  });

  it('arquivo com erro vira linha "não é possível" com o motivo', () => {
    const { reports } = buildReports([{ file: 'x.ts', entities: [], commented: [], error: 'boom' }]);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].status, 'impossible');
    assert.ok(reports[0].reasons[0].includes('boom'));
  });

  it('entity sem colunas não é possível', () => {
    const { reports } = buildReports([parseFile('x.ts', `@Entity('VAZIA') class Vazia {}`)]);
    assert.equal(reports[0].status, 'impossible');
    assert.match(reports[0].reasons[0], /Nenhuma coluna/);
  });

  it('duas entities na mesma tabela: a segunda avisa', () => {
    const { reports } = buildReports([
      parseFile('a.ts', `@Entity('T') class A { @PrimaryColumn('number',{name:'ID'}) id: number }`),
      parseFile('b.ts', `@Entity('T') class B { @PrimaryColumn('number',{name:'ID'}) id: number }`),
    ]);
    assert.equal(reports[0].status, 'ok');
    assert.equal(reports[1].status, 'assumptions');
    assert.match(reports[1].reasons[0], /mesma tabela/);
  });
});
