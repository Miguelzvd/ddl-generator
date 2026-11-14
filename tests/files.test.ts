import { describe, it } from 'vitest';
import { assert } from './helpers';
import { isCandidatePath, looksLikeEntity } from '../src/lib/io/files';


describe('isCandidatePath', () => {
  it('aceita .ts comuns', () => {
    assert.equal(isCandidatePath('projeto/src/entity/loja/ClienteResumoV.ts'), true);
  });
  for (const p of [
    'projeto/node_modules/typeorm/index.ts',
    'projeto/dist/entity/ClienteResumoV.ts',
    'projeto/.git/x.ts',
    'projeto/src/types.d.ts',
    'projeto/src/ClienteResumoV.js',
    'projeto/src/README.md',
  ]) {
    it(`rejeita ${p}`, () => assert.equal(isCandidatePath(p), false));
  }
  it('aceita barras invertidas do Windows', () => {
    assert.equal(isCandidatePath('projeto\\src\\entity\\A.ts'), true);
    assert.equal(isCandidatePath('projeto\\node_modules\\A.ts'), false);
  });
});

describe('looksLikeEntity', () => {
  it('detecta @Entity e @ViewEntity, inclusive comentados', () => {
    assert.ok(looksLikeEntity('@Entity("X") class X {}'));
    assert.ok(looksLikeEntity('@ViewEntity("X") class X {}'));
    assert.ok(looksLikeEntity('// @Entity({ name: "X" })'));
    assert.ok(looksLikeEntity('@Entity ( "X" )'));
  });
  it('ignora arquivos sem entity', () => {
    assert.ok(!looksLikeEntity('export class Service {}'));
    assert.ok(!looksLikeEntity('import { Entity } from "typeorm"'));
  });
});
