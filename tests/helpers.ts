import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseFile } from '../src/lib/parser/parseFile';

export { assert };

export const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}.ts`, import.meta.url), 'utf8');

export const parseFixture = (name: string) => parseFile(`loja/${name}.ts`, fixture(name));

/** Confere só as chaves de `expected` (como um toMatchObject). */
export function like(actual: any, expected: any, where = 'valor'): void {
  if (expected === null || typeof expected !== 'object') return assert.deepEqual(actual, expected, where);
  assert.ok(actual !== null && typeof actual === 'object', `${where}: esperado objeto, veio ${actual}`);
  for (const [k, v] of Object.entries(expected)) like(actual[k], v, `${where}.${k}`);
}
