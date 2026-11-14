/**
 * Leitor de tokens e conversão de expressões em valores JS, sem executar código.
 *
 * `{ name: 'X', length: 10 }` vira um objeto; `() => Classe` vira
 * `{ kind: 'fn', returnsIdentifier: 'Classe' }`; o que não for literal vira
 * `{ kind: 'fn', bodyText }` com o texto original.
 *
 * @typedef {{ kind: 'fn', bodyText: string, returnsIdentifier?: string, returnsString?: string }} FnLit
 * @typedef {{ kind: 'ident', name: string }} IdentLit
 * @typedef {string | number | boolean | null | undefined | FnLit | IdentLit | any[] | Record<string, any>} Lit
 */
(function (DDL) {
  'use strict';

  const OPENERS = { '(': ')', '[': ']', '{': '}' };
  const CLOSERS = new Set([')', ']', '}']);

  /** Cursor sobre a lista de tokens. */
  class Reader {
    /** @param {import('./lexer.js').Token[]} tokens @param {string} text */
    constructor(tokens, text) {
      this.tokens = tokens;
      this.text = text;
      this.i = 0;
    }
    peek(n = 0) {
      return this.tokens[this.i + n];
    }
    next() {
      return this.tokens[this.i++];
    }
    done() {
      return this.i >= this.tokens.length;
    }
    /** O token atual é a pontuação/palavra `v`? */
    is(v, n = 0) {
      const t = this.peek(n);
      return !!t && (t.t === 'punc' || t.t === 'id') && t.v === v;
    }
    eat(v) {
      if (!this.is(v)) return false;
      this.i++;
      return true;
    }
    /** Texto original do token `from` até o último token lido. */
    textFrom(from) {
      if (this.i <= from) return '';
      return this.text.slice(this.tokens[from].s, this.tokens[this.i - 1].e);
    }
    /** No abridor `(`/`[`/`{`: pula até depois do fechador correspondente. */
    skipBalanced() {
      const close = OPENERS[this.peek()?.v];
      if (!close) return void this.next();
      let depth = 0;
      while (!this.done()) {
        const t = this.next();
        if (t.t !== 'punc') continue;
        if (OPENERS[t.v]) depth++;
        else if (CLOSERS.has(t.v) && --depth === 0) return;
      }
    }
    /** Pula até `,` ou um fechador no mesmo nível (sem consumi-los). */
    skipExpression() {
      while (!this.done()) {
        const t = this.peek();
        if (t.t === 'punc' && (t.v === ',' || CLOSERS.has(t.v))) return;
        if (t.t === 'punc' && OPENERS[t.v]) this.skipBalanced();
        else this.next();
      }
    }
    /** O valor terminou (próximo é `,`, um fechador ou o fim)? */
    atValueEnd() {
      const t = this.peek();
      return !t || (t.t === 'punc' && (t.v === ',' || CLOSERS.has(t.v)));
    }
  }

  const isFn = (v) => typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'fn';
  const isIdent = (v) => typeof v === 'object' && v !== null && !Array.isArray(v) && v.kind === 'ident';
  const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v) && !isFn(v) && !isIdent(v);

  /** Lê um valor; expressões compostas voltam como `{ kind: 'fn', bodyText }`. */
  function readValue(r) {
    const start = r.i;
    const v = readPrimary(r);
    if (r.is('as') || r.is('satisfies')) {
      r.skipExpression();
      return v;
    }
    if (r.atValueEnd()) return v;
    r.i = start;
    r.skipExpression();
    return { kind: 'fn', bodyText: r.textFrom(start) };
  }

  function readPrimary(r) {
    const t = r.peek();
    if (!t) return undefined;
    if (t.t === 'str') return r.next().v;
    if (t.t === 'tmpl') {
      r.next();
      return t.expr ? { kind: 'fn', bodyText: r.text.slice(t.s, t.e) } : t.v;
    }
    if (t.t === 'num') return Number(r.next().v.replace(/_/g, '').replace(/n$/, ''));
    if (r.is('-') && r.peek(1)?.t === 'num') {
      r.next();
      return -Number(r.next().v.replace(/_/g, ''));
    }
    if (isArrowStart(r)) return readArrow(r);
    if (t.t === 'id') {
      if (t.v === 'function') return readFunction(r);
      r.next();
      if (t.v === 'true') return true;
      if (t.v === 'false') return false;
      if (t.v === 'null') return null;
      if (t.v === 'undefined') return undefined;
      return { kind: 'ident', name: t.v };
    }
    if (r.is('(')) {
      r.next();
      const v = readValue(r);
      r.eat(')');
      return v;
    }
    if (r.is('[')) return readArray(r);
    if (r.is('{')) return readObject(r);
    return undefined;
  }

  function readArray(r) {
    r.next(); // [
    const out = [];
    while (!r.done() && !r.is(']')) {
      if (r.eat(',')) continue;
      if (r.eat('...')) r.skipExpression();
      else out.push(readValue(r));
      if (!r.eat(',') && !r.is(']')) r.skipExpression();
    }
    r.eat(']');
    return out;
  }

  function readObject(r) {
    r.next(); // {
    const out = {};
    while (!r.done() && !r.is('}')) {
      if (r.eat(',')) continue;
      if (r.eat('...')) {
        r.skipExpression();
        continue;
      }
      let key;
      const k = r.peek();
      if (r.is('[')) r.skipBalanced();
      else if (k.t === 'id' || k.t === 'str' || k.t === 'num') key = r.next().v;
      else r.next();

      if (r.eat(':')) {
        const v = readValue(r);
        if (key !== undefined) out[key] = v;
      } else if (r.is('(')) {
        r.skipBalanced(); // método: name() { … }
        if (r.is('{')) r.skipBalanced();
      } else if (key !== undefined && k.t === 'id' && r.atValueEnd()) {
        out[key] = { kind: 'ident', name: key }; // { nome }
      } else {
        r.skipExpression();
      }
    }
    r.eat('}');
    return out;
  }

  /** `(…) =>`, `x =>` ou `async (…) =>`. */
  function isArrowStart(r) {
    let n = r.is('async') && (r.is('(', 1) || r.peek(1)?.t === 'id') ? 1 : 0;
    const t = r.peek(n);
    if (!t) return false;
    if (t.t === 'id' && r.is('=>', n + 1)) return true;
    if (!r.is('(', n)) return false;
    const save = r.i;
    r.i += n;
    r.skipBalanced();
    const ok = r.is('=>');
    r.i = save;
    return ok;
  }

  function readArrow(r) {
    if (r.is('async')) r.next();
    if (r.is('(')) r.skipBalanced();
    else r.next();
    r.eat('=>');
    return readBody(r);
  }

  function readFunction(r) {
    r.next(); // function
    if (r.peek()?.t === 'id') r.next();
    if (r.is('(')) r.skipBalanced();
    return readBody(r);
  }

  /** Corpo de função: guarda o texto e o que ela retorna, se for simples. */
  function readBody(r) {
    const start = r.i;
    /** @type {FnLit} */
    const fn = { kind: 'fn', bodyText: '' };
    let retAt = start;
    if (r.is('{')) {
      r.skipBalanced();
      const end = r.i;
      retAt = -1;
      for (let j = start + 1; j < end; j++) if (r.tokens[j].t === 'id' && r.tokens[j].v === 'return') { retAt = j + 1; break; }
      r.i = end;
    } else {
      r.skipExpression();
    }
    fn.bodyText = r.textFrom(start);
    if (retAt >= 0) Object.assign(fn, simpleReturn(r.tokens, retAt));
    return fn;
  }

  /** `Classe`, `ns.Classe`, `(Classe)` ou `'texto'` → o que a função retorna. */
  function simpleReturn(tokens, j) {
    let open = 0;
    while (tokens[j]?.t === 'punc' && tokens[j].v === '(') { j++; open++; }
    const first = tokens[j];
    if (!first) return {};
    let k = j + 1;
    let name = first.t === 'id' ? first.v : undefined;
    while (name && tokens[k]?.v === '.' && tokens[k + 1]?.t === 'id') {
      name = tokens[k + 1].v;
      k += 2;
    }
    for (let c = 0; c < open && tokens[k]?.v === ')'; c++) k++;
    const after = tokens[k];
    const ends = !after || after.nl || (after.t === 'punc' && [',', ')', ']', '}', ';'].includes(after.v));
    if (!ends) return {};
    if (name) return { returnsIdentifier: name };
    if (first.t === 'str' || (first.t === 'tmpl' && !first.expr)) return { returnsString: first.v };
    return {};
  }

  DDL.literal = { Reader, readValue, isFn, isIdent, isRecord };
})((globalThis.DDL = globalThis.DDL || {}));
