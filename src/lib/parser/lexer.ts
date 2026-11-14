/**
 * Quebra o código TypeScript em tokens: identificadores, textos, números e
 * pontuação. Comentários saem numa lista à parte, para achar entities comentadas.
 *
 * Não é um compilador: basta para ler decorators, objetos de opções e tipos.
 */

export interface Token {
  t: 'id' | 'str' | 'tmpl' | 'num' | 'punc' | 'regex';
  /** Valor (texto já sem aspas, para 'str' e 'tmpl'). */
  v: string;
  /** Início no texto. */
  s: number;
  /** Fim no texto. */
  e: number;
  /** Havia quebra de linha antes do token. */
  nl: boolean;
  /** Template com `${…}`. */
  expr?: boolean;
}

export interface Comment {
  kind: 'line' | 'block';
  s: number;
  e: number;
  text: string;
}

const ID_START = /[A-Za-z_$#À-￿]/;
const ID_PART = /[\w$À-￿]/;
const NUMBER = /^(?:0[xXbBoO][\da-fA-F_]+|\d[\d_]*(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+)n?/;
const MULTI = ['=>', '...', '?.'];
/** Depois destas palavras, `/` começa uma regex (e não uma divisão). */
const REGEX_AFTER = new Set(['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await']);
const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };
const BLANKS = new Set([' ', '\t', '\r', '\f', '\v', '﻿', ' ']);

/** Lê uma string entre aspas a partir de `i` (na aspa). */
function readString(text: string, i: number) {
  const quote = text[i];
  let value = '';
  let j = i + 1;
  while (j < text.length && text[j] !== quote) {
    if (text[j] === '\\') {
      const c = text[j + 1];
      value += ESCAPES[c] ?? c;
      j += 2;
    } else if (text[j] === '\n') {
      break; // string não fechada: para na linha
    } else {
      value += text[j++];
    }
  }
  return { value, end: j + 1 };
}

/** Lê um template literal; `${…}` é pulado contando chaves. */
function readTemplate(text: string, i: number) {
  let value = '';
  let expr = false;
  let j = i + 1;
  while (j < text.length && text[j] !== '`') {
    if (text[j] === '\\') {
      value += ESCAPES[text[j + 1]] ?? text[j + 1];
      j += 2;
    } else if (text[j] === '$' && text[j + 1] === '{') {
      expr = true;
      j = skipBraces(text, j + 1);
    } else {
      value += text[j++];
    }
  }
  return { value, expr, end: j + 1 };
}

/** A partir de `{`, devolve a posição logo após o `}` correspondente. */
function skipBraces(text: string, i: number): number {
  let depth = 0;
  let j = i;
  while (j < text.length) {
    const c = text[j];
    if (c === '"' || c === "'") j = readString(text, j).end;
    else if (c === '`') j = readTemplate(text, j).end;
    else {
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) return j + 1;
      j++;
    }
  }
  return j;
}

function readRegex(text: string, i: number) {
  let j = i + 1;
  let inClass = false;
  while (j < text.length && text[j] !== '\n') {
    const c = text[j];
    if (c === '\\') j++;
    else if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) break;
    j++;
  }
  j++;
  while (j < text.length && ID_PART.test(text[j])) j++; // flags
  return j;
}

function regexAllowed(prev: Token | undefined) {
  if (!prev) return true;
  if (prev.t === 'punc') return !')]}'.includes(prev.v);
  if (prev.t === 'id') return REGEX_AFTER.has(prev.v);
  return false;
}

export function tokenize(text: string): { tokens: Token[]; comments: Comment[] } {
  const tokens: Token[] = [];
  const comments: Comment[] = [];
  let i = 0;
  let nl = false;
  const push = (t: Token['t'], v: string, s: number, e: number, extra?: Partial<Token>) => {
    tokens.push({ t, v, s, e, nl, ...extra });
    nl = false;
  };

  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '\n') {
      nl = true;
      i++;
    } else if (BLANKS.has(c)) {
      i++;
    } else if (c === '/' && next === '/') {
      const end = text.indexOf('\n', i);
      const e = end < 0 ? text.length : end;
      comments.push({ kind: 'line', s: i, e, text: text.slice(i, e) });
      i = e;
    } else if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const e = end < 0 ? text.length : end + 2;
      comments.push({ kind: 'block', s: i, e, text: text.slice(i, e) });
      if (text.slice(i, e).includes('\n')) nl = true;
      i = e;
    } else if (c === '"' || c === "'") {
      const r = readString(text, i);
      push('str', r.value, i, r.end);
      i = r.end;
    } else if (c === '`') {
      const r = readTemplate(text, i);
      push('tmpl', r.value, i, r.end, { expr: r.expr });
      i = r.end;
    } else if (c === '/' && regexAllowed(tokens[tokens.length - 1])) {
      const end = readRegex(text, i);
      push('regex', text.slice(i, end), i, end);
      i = end;
    } else if (ID_START.test(c)) {
      let j = i + 1;
      while (j < text.length && ID_PART.test(text[j])) j++;
      push('id', text.slice(i, j), i, j);
      i = j;
    } else if (/\d/.test(c) || (c === '.' && /\d/.test(next))) {
      const m = NUMBER.exec(text.slice(i, i + 64));
      const len = m ? m[0].length : 1;
      push('num', text.slice(i, i + len), i, i + len);
      i += len;
    } else {
      const multi = MULTI.find((p) => text.startsWith(p, i));
      const len = multi ? multi.length : 1;
      push('punc', text.slice(i, i + len), i, i + len);
      i += len;
    }
  }
  return { tokens, comments };
}
