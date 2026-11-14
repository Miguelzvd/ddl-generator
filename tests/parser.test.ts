import { describe, expect, it } from 'vitest';
import { parseFile } from '../src/parser/parseFile';
import { parseFixture } from './helpers';

describe('parseFile', () => {
  it('lê @Entity com objeto de opções (Cliente)', () => {
    const { entities, error } = parseFixture('Cliente');
    expect(error).toBeUndefined();
    expect(entities).toHaveLength(1);
    const e = entities[0];
    expect(e).toMatchObject({ className: 'Cliente', tableName: 'CLIENTE', schema: 'LOJA', kind: 'table' });
    const nome = e.columns.find((c) => c.name === 'NOME')!;
    expect(nome).toMatchObject({ type: 'varchar2', length: 255, nullable: true });
    expect(e.columns.find((c) => c.name === 'ID_CLIENTE')!.primary).toBe(true);
    expect(e.columns.find((c) => c.name === 'DATA_CADASTRO')!.default).toBe('SYSDATE');
    expect(e.columns.find((c) => c.name === 'ATIVO')!.nullable).toBe(false);
  });

  it('lê colunas, PK gerada e relações (Produto)', () => {
    const e = parseFixture('Produto').entities[0];
    expect(e.tableName).toBe('PRODUTO');
    expect(e.schema).toBeUndefined();
    expect(e.columns).toHaveLength(15);
    expect(e.columns.find((c) => c.name === 'ID_PRODUTO')).toMatchObject({ primary: true, generated: true });
    const status = e.columns.find((c) => c.name === 'STATUS')!;
    expect(status.type).toBeUndefined();
    expect(status.tsType).toBe('number');
    expect(e.relations).toHaveLength(2);
    expect(e.relations[0]).toMatchObject({
      kind: 'OneToOne',
      targetClass: 'Categoria',
      joinColumns: [{ name: 'ID_CATEGORIA' }],
    });
  });

  it('marca @ViewEntity como view (ClienteResumoV)', () => {
    const e = parseFixture('ClienteResumoV').entities[0];
    expect(e.kind).toBe('view');
    expect(e.tableName).toBe('CLIENTE_RESUMO_V');
    expect(e.columns).toHaveLength(9);
    expect(e.relations[0]).toMatchObject({ kind: 'OneToMany', targetClass: 'PedidoV' });
  });

  it('detecta entity comentada (LogAcesso)', () => {
    const r = parseFixture('LogAcesso');
    expect(r.entities).toEqual([]);
    expect(r.commented).toEqual([
      { file: 'loja/LogAcesso.ts', className: 'LogAcesso', tableName: 'LOG_ACESSO', schema: 'LOJA', kind: 'table' },
    ]);
  });

  it('separa schema do nome "SCHEMA.TABELA"', () => {
    const e = parseFile('x.ts', `@Entity("LOJA.CUSTO") export class Custo { @Column() a: string }`).entities[0];
    expect(e).toMatchObject({ schema: 'LOJA', tableName: 'CUSTO' });
  });

  it('deriva o nome da tabela da classe quando @Entity() não tem nome', () => {
    const e = parseFile('x.ts', `@Entity() export class NotaFiscal { @Column() a: string }`).entities[0];
    expect(e).toMatchObject({ tableName: 'NOTA_FISCAL', tableNameDerived: true });
  });

  it('não confunde @Entity em string com entity comentada', () => {
    const r = parseFile('x.ts', `const s = "// @Entity('X')"; export class A {}`);
    expect(r.entities).toEqual([]);
    expect(r.commented).toEqual([]);
  });

  it('arquivo sem entity retorna listas vazias e sem erro', () => {
    const r = parseFile('x.ts', `export const a = 1;`);
    expect(r).toMatchObject({ entities: [], commented: [] });
    expect(r.error).toBeUndefined();
  });

  it('nome de tabela não literal fica como não resolvido', () => {
    const e = parseFile('x.ts', `@Entity(NOME) export class A { @Column() a: string }`).entities[0];
    expect(e.unresolved).toMatch(/não é um texto fixo/);
  });
});
