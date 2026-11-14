import { describe, it } from 'vitest';
import { findUsages } from '../src/lib/usages';
import { assert, fixture, parseFixture } from './helpers';

describe('linhas no arquivo', () => {
  it('guarda a linha da classe e de cada coluna (Cliente)', () => {
    const e = parseFixture('Cliente').entities[0];
    assert.equal(e.line, 4);
    assert.equal(e.columns.find((c) => c.name === 'ID_CLIENTE')?.line, 6);
    assert.equal(e.columns.find((c) => c.name === 'NOME')?.line, 12);
  });
});

describe('findUsages', () => {
  const entities = [
    { className: 'Categoria', file: 'loja/Categoria.ts' },
    { className: 'Produto', file: 'loja/Produto.ts' },
  ];

  it('acha usos em outras entities, fora imports e o próprio arquivo', () => {
    const sources = ['Categoria', 'Produto'].map((n) => ({ path: `loja/${n}.ts`, text: fixture(n) }));
    const idx = findUsages(sources, entities);
    assert.deepEqual(
      idx.get('Categoria')!.map((u) => `${u.file}:${u.line}`),
      ['loja/Produto.ts:53', 'loja/Produto.ts:55'],
    );
    assert.equal(idx.get('Produto')!.length, 0);
  });

  it('acha usos em services e ignora imports de várias linhas e comentários', () => {
    const text = [
      'import {',
      '  Categoria,',
      "} from '../loja/Categoria';",
      '// Categoria antiga',
      '@Injectable()',
      'export class CategoriaService {',
      '  constructor(@InjectRepository(Categoria) private repo: Repository<Categoria>) {}',
      '  listar(): Promise<Categoria[]> {',
      '    return this.repo.find();',
      '  }',
      '}',
    ].join('\n');
    const idx = findUsages([{ path: 'svc/categoria.service.ts', text }], entities);
    assert.deepEqual(
      idx.get('Categoria')!.map((u) => u.line),
      [7, 8],
    );
    assert.equal(idx.get('Categoria')![1].text, 'listar(): Promise<Categoria[]> {');
  });
});
