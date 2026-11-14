// Carrega os scripts na mesma ordem do index.html e expõe o objeto DDL para os testes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]).filter((s) => s !== 'js/main.js');
for (const s of scripts) require(path.join(root, s));

const DDL = globalThis.DDL;

function fixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', `${name}.ts`), 'utf8');
}

function parseFixture(name) {
  return DDL.parser.parseFile(`loja/${name}.ts`, fixture(name));
}

/** Confere só as chaves de `expected` (como um toMatchObject). */
function like(actual, expected, where = 'valor') {
  if (expected === null || typeof expected !== 'object') return assert.deepEqual(actual, expected, where);
  assert.ok(actual !== null && typeof actual === 'object', `${where}: esperado objeto, veio ${actual}`);
  for (const [k, v] of Object.entries(expected)) like(actual[k], v, `${where}.${k}`);
}

module.exports = { DDL, fixture, parseFixture, like, assert };
