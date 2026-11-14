const { describe, it } = require('node:test');
const { DDL, parseFixture, like, assert } = require('./helpers');

const { parseFile } = DDL.parser;
const col = (e, name) => e.columns.find((c) => c.name === name);

describe('parseFile', () => {
  it('lê @Entity com objeto de opções (Cliente)', () => {
    const { entities, error } = parseFixture('Cliente');
    assert.equal(error, undefined);
    assert.equal(entities.length, 1);
    const e = entities[0];
    like(e, { className: 'Cliente', tableName: 'CLIENTE', schema: 'LOJA', kind: 'table' });
    like(col(e, 'NOME'), { type: 'varchar2', length: 255, nullable: true });
    assert.equal(col(e, 'ID_CLIENTE').primary, true);
    assert.equal(col(e, 'DATA_CADASTRO').default, 'SYSDATE');
    assert.equal(col(e, 'ATIVO').nullable, false);
  });

  it('lê colunas, PK gerada e relações (Produto)', () => {
    const e = parseFixture('Produto').entities[0];
    assert.equal(e.tableName, 'PRODUTO');
    assert.equal(e.schema, undefined);
    assert.equal(e.columns.length, 15);
    like(col(e, 'ID_PRODUTO'), { primary: true, generated: true });
    const status = col(e, 'STATUS');
    assert.equal(status.type, undefined);
    assert.equal(status.tsType, 'number');
    assert.equal(e.relations.length, 2);
    like(e.relations[0], { kind: 'OneToOne', targetClass: 'Categoria', targetFile: 'loja/Categoria', joinColumns: [{ name: 'ID_CATEGORIA' }] });
  });

  it('marca @ViewEntity como view (ClienteResumoV)', () => {
    const e = parseFixture('ClienteResumoV').entities[0];
    assert.equal(e.kind, 'view');
    assert.equal(e.tableName, 'CLIENTE_RESUMO_V');
    assert.equal(e.columns.length, 9);
    like(e.relations[0], { kind: 'OneToMany', targetClass: 'PedidoV' });
    assert.equal(col(e, 'DT_NASCIMENTO').tsType, 'string');
  });

  it('detecta entity comentada (LogAcesso)', () => {
    const r = parseFixture('LogAcesso');
    assert.deepEqual(r.entities, []);
    assert.deepEqual(r.commented, [{ file: 'loja/LogAcesso.ts', className: 'LogAcesso', tableName: 'LOG_ACESSO', schema: 'LOJA', kind: 'table' }]);
  });

  it('separa schema do nome "SCHEMA.TABELA"', () => {
    const e = parseFile('x.ts', `@Entity("LOJA.CUSTO") export class Custo { @Column() a: string }`).entities[0];
    like(e, { schema: 'LOJA', tableName: 'CUSTO' });
  });

  it('deriva o nome da tabela da classe quando @Entity() não tem nome', () => {
    const e = parseFile('x.ts', `@Entity() export class NotaFiscal { @Column() a: string }`).entities[0];
    like(e, { tableName: 'NOTA_FISCAL', tableNameDerived: true });
  });

  it('não confunde @Entity em string com entity comentada', () => {
    const r = parseFile('x.ts', `const s = "// @Entity('X')"; export class A {}`);
    assert.deepEqual(r.entities, []);
    assert.deepEqual(r.commented, []);
  });

  it('arquivo sem entity retorna listas vazias e sem erro', () => {
    const r = parseFile('x.ts', `export const a = 1;`);
    like(r, { entities: [], commented: [] });
    assert.equal(r.error, undefined);
  });

  it('nome de tabela não literal fica como não resolvido', () => {
    const e = parseFile('x.ts', `@Entity(NOME) export class A { @Column() a: string }`).entities[0];
    assert.match(e.unresolved, /não é um texto fixo/);
  });
});

describe('parseFile — sintaxes variadas', () => {
  const one = (code) => parseFile('x.ts', code).entities[0];

  it('ignora métodos, construtor, getters e inicializadores', () => {
    const e = one(`
      @Entity('T')
      export class T extends Base<T> implements X {
        constructor(private readonly svc: Service) { super(); if (a) { b() } }
        @PrimaryColumn('number', { name: 'ID' }) id!: number;
        @Column({ name: 'QTD', default: 0 }) public qtd?: number = 0;
        get total(): number { return this.qtd * 2 }
        static criar(dados: Partial<T>): T { return Object.assign(new T(), dados) }
        @Column('varchar2', { name: 'OBS', length: 10 })
        readonly obs: string | null
        async salvar() { await this.repo.save({ a: 1 }) }
      }`);
    assert.deepEqual(e.columns.map((c) => c.name), ['ID', 'QTD', 'OBS']);
    like(e.columns[1], { default: '0', tsType: 'number' });
    like(e.columns[2], { tsType: 'string', length: 10 });
  });

  it('lê decorators com namespace, regex e template', () => {
    const e = one(`
      import * as orm from 'typeorm';
      @orm.Entity({ name: \`CONTA\`, schema: 'FIN' })
      export class Conta {
        @orm.PrimaryGeneratedColumn('uuid', { name: 'ID' }) id: string
        @Matches(/^[a-z]+\\/x$/i) @orm.Column({ name: 'COD', length: 20, comment: \`código \${'x'}\` }) cod: string
        @orm.Column({ name: 'VALOR', type: 'number', precision: 10, scale: 2, transformer: { to: (v) => v, from: (v) => Number(v) } })
        valor: number
      }`);
    like(e, { tableName: 'CONTA', schema: 'FIN' });
    like(e.columns[0], { name: 'ID', type: 'varchar2', length: 36, generated: false });
    like(e.columns[1], { name: 'COD', length: 20 });
    like(e.columns[2], { name: 'VALOR', precision: 10, scale: 2 });
  });

  it('relações com função de bloco, string e JoinColumn em lista', () => {
    const e = one(`
      import { Pai as Mae } from '../outro/Pai';
      @Entity('FILHO') class Filho {
        @PrimaryColumn() id: number
        @ManyToOne(function () { return Mae }, (m) => m.filhos, { onDelete: 'CASCADE' })
        @JoinColumn([{ name: 'MAE_ID', referencedColumnName: 'id' }])
        mae: Mae
        @ManyToOne('Tio') @JoinColumn({ name: 'TIO_ID' }) tio: any
        @ManyToMany(() => Tag) @JoinTable({ name: 'FILHO_TAG', joinColumn: { name: 'FILHO_ID' } }) tags: Tag[]
      }`);
    like(e.relations[0], { kind: 'ManyToOne', targetClass: 'Mae', targetFile: 'outro/Pai', joinColumns: [{ name: 'MAE_ID', referencedColumnName: 'id' }] });
    like(e.relations[1], { targetClass: 'Tio', joinColumns: [{ name: 'TIO_ID' }] });
    like(e.relations[2], { kind: 'ManyToMany', targetClass: 'Tag', joinTable: { name: 'FILHO_TAG', joinColumn: { name: 'FILHO_ID' } } });
  });

  it('lê índices da classe e da propriedade', () => {
    const e = one(`
      @Entity('T') @Index('IX_T_AB', ['a', 'b'], { unique: true })
      export class T { @PrimaryColumn() id: number  @Index() @Column() a: string  @Column() b: string }`);
    assert.deepEqual(e.indices, [
      { name: 'IX_T_AB', columns: ['a', 'b'], unique: true },
      { name: undefined, columns: ['a'], unique: false },
    ]);
  });

  it('acha várias entities e ignora classes sem decorator', () => {
    const r = parseFile('x.ts', `
      class Util { @Column() x: string }
      @Entity('A') export class A { @Column() a: string }
      export default @Entity('B') class B { @Column() b: string }
      const obj = { class: 'x' };`);
    assert.deepEqual(r.entities.map((e) => e.tableName), ['A', 'B']);
  });

  it('entity comentada em bloco /* */', () => {
    const r = parseFile('x.ts', `/*\n * @Entity('VELHA')\n * export class Velha { @Column() a: string }\n */\nexport {}`);
    like(r.commented, [{ className: 'Velha', tableName: 'VELHA', kind: 'table' }]);
  });
});
