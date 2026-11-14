import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseFile } from '../src/parser/parseFile';

export function fixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}.ts`, import.meta.url)), 'utf8');
}

export function parseFixture(name: string) {
  return parseFile(`loja/${name}.ts`, fixture(name));
}
