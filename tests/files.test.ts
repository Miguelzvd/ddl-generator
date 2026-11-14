import { describe, expect, it } from 'vitest';
import { isCandidatePath, looksLikeEntity } from '../src/io/files';

describe('isCandidatePath', () => {
  it('aceita .ts comuns', () => {
    expect(isCandidatePath('projeto/src/entity/loja/ClienteResumoV.ts')).toBe(true);
  });
  it.each([
    'projeto/node_modules/typeorm/index.ts',
    'projeto/dist/entity/ClienteResumoV.ts',
    'projeto/.git/x.ts',
    'projeto/src/types.d.ts',
    'projeto/src/ClienteResumoV.js',
    'projeto/src/README.md',
  ])('rejeita %s', (p) => expect(isCandidatePath(p)).toBe(false));
  it('aceita barras invertidas do Windows', () => {
    expect(isCandidatePath('projeto\\src\\entity\\A.ts')).toBe(true);
    expect(isCandidatePath('projeto\\node_modules\\A.ts')).toBe(false);
  });
});

describe('looksLikeEntity', () => {
  it('detecta @Entity e @ViewEntity, inclusive comentados', () => {
    expect(looksLikeEntity('@Entity("X") class X {}')).toBe(true);
    expect(looksLikeEntity('@ViewEntity("X") class X {}')).toBe(true);
    expect(looksLikeEntity('// @Entity({ name: "X" })')).toBe(true);
    expect(looksLikeEntity('@Entity ( "X" )')).toBe(true);
  });
  it('ignora arquivos sem entity', () => {
    expect(looksLikeEntity('export class Service {}')).toBe(false);
    expect(looksLikeEntity('import { Entity } from "typeorm"')).toBe(false);
  });
});
