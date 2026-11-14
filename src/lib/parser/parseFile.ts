/**
 * Lê um arquivo .ts e extrai as entities TypeORM (ativas e comentadas).
 */
import type { ColumnModel, CommentedEntity, EntityKind, EntityModel, IndexModel, JoinColumnModel, ParsedFile, RelationKind, RelationModel } from '../model';
import { tokenize, type Comment, type Token } from './lexer';
import { Reader, isFn, isIdent, isRecord, readValue, type Lit, type LitRecord } from './literal';

interface Decorator {
  name: string;
  args: Lit[];
}

interface Member {
  property: string;
  tsType?: string;
  decos: Decorator[];
  /** Posição no texto onde o membro começa (primeiro decorator ou o nome). */
  at: number;
}

/** Devolve a função posição no texto → número da linha (a partir de 1). */
function lineIndex(text: string) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return (offset: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

const COLUMN_DECORATORS = new Set([
  'Column',
  'PrimaryColumn',
  'PrimaryGeneratedColumn',
  'ViewColumn',
  'CreateDateColumn',
  'UpdateDateColumn',
  'DeleteDateColumn',
  'VersionColumn',
]);
const RELATION_DECORATORS = new Set(['ManyToOne', 'OneToOne', 'OneToMany', 'ManyToMany']);
/** Palavras que podem vir entre o decorator e `class`. */
const CLASS_MODIFIERS = new Set(['export', 'default', 'abstract', 'declare']);
const MEMBER_MODIFIERS = new Set(['public', 'private', 'protected', 'readonly', 'static', 'declare', 'override', 'abstract', 'accessor', 'async', 'get', 'set']);
const ENTITY_IN_COMMENT = /@(Entity|ViewEntity)\s*\(/;

export function parseFile(file: string, text: string): ParsedFile {
  try {
    const { tokens, comments } = tokenize(text);
    return {
      file,
      entities: extractEntities(file, text, tokens),
      commented: findCommentedEntities(file, text, comments),
    };
  } catch (err) {
    return { file, entities: [], commented: [], error: err instanceof Error ? err.message : String(err) };
  }
}

function extractEntities(file: string, text: string, tokens = tokenize(text).tokens): EntityModel[] {
  const imports = relativeImports(tokens, file);
  const lineAt = lineIndex(text);
  const r = new Reader(tokens, text);
  const out: EntityModel[] = [];
  let pending: Decorator[] = [];
  while (!r.done()) {
    if (r.is('@')) {
      pending.push(readDecorator(r));
    } else if (isClassKeyword(r)) {
      const line = lineAt(r.peek()!.s);
      const e = readClass(r, pending, file, lineAt);
      pending = [];
      if (e) {
        for (const rel of e.relations) rel.targetFile = imports.get(rel.targetClass);
        out.push({ ...e, line });
      }
    } else {
      const t = r.next();
      if (!(t.t === 'id' && CLASS_MODIFIERS.has(t.v))) pending = [];
    }
  }
  return out;
}

/** `class` como palavra-chave (e não como chave de objeto, `{ class: … }`). */
function isClassKeyword(r: Reader) {
  if (!r.is('class') || r.tokens[r.i - 1]?.v === '.') return false;
  const n = r.peek(1);
  return !!n && (n.t === 'id' || n.v === '{');
}

/** Mapa nome importado → caminho do arquivo (sem extensão), para imports relativos. */
function relativeImports(tokens: Token[], file: string) {
  const map = new Map<string, string>();
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].t !== 'id' || tokens[i].v !== 'import' || tokens[i + 1]?.v === '(' || tokens[i - 1]?.v === '.') continue;
    // Tokens até o `from 'caminho'`, separados em grupos por vírgula.
    let j = i + 1;
    const groups: string[][] = [[]];
    for (; j < tokens.length && tokens[j].t !== 'str'; j++) {
      const t = tokens[j];
      if (t.v === ',') groups.push([]);
      else if (t.t === 'id' && !['type', 'as', 'from'].includes(t.v)) groups[groups.length - 1].push(t.v);
    }
    const spec = tokens[j];
    i = j;
    if (!spec || !spec.v.startsWith('.')) continue;
    // Em cada grupo, o nome local é o último: `A`, `A as B`, `type A`, `* as ns`.
    const target = joinPath(file, spec.v);
    for (const g of groups) if (g.length) map.set(g[g.length - 1], target);
  }
  return map;
}

export function joinPath(fromFile: string, spec: string) {
  const parts = fromFile.replace(/\\/g, '/').split('/');
  parts.pop();
  for (const seg of spec.split('/')) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/').replace(/\.(ts|js)$/, '');
}

/** `@Nome(args)`, `@Nome` ou `@ns.Nome(args)`. */
function readDecorator(r: Reader): Decorator {
  r.next(); // @
  let name = '';
  if (r.peek()?.t === 'id') name = r.next().v;
  while (r.is('.') && r.peek(1)?.t === 'id') {
    r.next();
    name = r.next().v;
  }
  const args: Lit[] = [];
  if (r.eat('(')) {
    while (!r.done() && !r.is(')')) {
      args.push(readValue(r));
      if (!r.eat(',') && !r.is(')')) r.skipExpression();
      if (r.is(']') || r.is('}')) r.next(); // fechador perdido: segue em frente
    }
    r.eat(')');
  }
  return { name, args };
}

function readClass(r: Reader, decos: Decorator[], file: string, lineAt: (offset: number) => number): EntityModel | undefined {
  r.next(); // class
  const head = r.peek();
  const className = head?.t === 'id' && !['extends', 'implements'].includes(head.v) ? r.next().v : '(classe anônima)';
  while (!r.done() && !r.is('{')) {
    if (r.is('(')) r.skipBalanced();
    else r.next();
  }
  const entityDeco = decos.find((d) => d.name === 'Entity' || d.name === 'ViewEntity');
  if (!entityDeco) {
    r.skipBalanced();
    return undefined;
  }
  r.next(); // {

  const kind: EntityKind = entityDeco.name === 'ViewEntity' ? 'view' : 'table';
  let rawName: string | undefined;
  let schema: string | undefined;
  let unresolved: string | undefined;
  const [a0, a1] = entityDeco.args;
  if (typeof a0 === 'string') {
    rawName = a0;
    if (isRecord(a1) && typeof a1.schema === 'string') schema = a1.schema;
  } else if (isRecord(a0)) {
    if (typeof a0.name === 'string') rawName = a0.name;
    else if (a0.name !== undefined) unresolved = 'O nome da tabela não é um texto fixo no código.';
    if (typeof a0.schema === 'string') schema = a0.schema;
  } else if (a0 !== undefined) {
    unresolved = 'O nome da tabela não é um texto fixo no código.';
  }
  if (rawName && rawName.includes('.')) {
    const idx = rawName.lastIndexOf('.');
    schema = schema ?? rawName.slice(0, idx);
    rawName = rawName.slice(idx + 1);
  }

  const columns: ColumnModel[] = [];
  const relations: RelationModel[] = [];
  const indices: IndexModel[] = [];
  for (const d of decos.filter((x) => x.name === 'Index')) {
    const idx = readIndex(d.args);
    if (idx) indices.push(idx);
  }

  for (const m of readMembers(r)) {
    const colDeco = m.decos.find((d) => COLUMN_DECORATORS.has(d.name));
    if (colDeco) columns.push({ ...readColumn(colDeco, m.property, m.tsType), line: lineAt(m.at) });
    const relDeco = m.decos.find((d) => RELATION_DECORATORS.has(d.name));
    if (relDeco) relations.push(readRelation(relDeco, m.decos, m.property));
    const idxDeco = m.decos.find((d) => d.name === 'Index');
    if (idxDeco) {
      const opts = idxDeco.args.find(isRecord);
      const name = idxDeco.args.find((a): a is string => typeof a === 'string');
      indices.push({ name, columns: [m.property], unique: opts?.unique === true });
    }
  }

  return {
    className,
    tableName: rawName ?? deriveTableName(className),
    tableNameDerived: !rawName,
    schema,
    kind,
    file,
    columns,
    relations,
    indices,
    unresolved,
  };
}

/** Lê as propriedades do corpo da classe (até o `}` final). Métodos e construtores são pulados. */
function readMembers(r: Reader): Member[] {
  const members: Member[] = [];
  let decos: Decorator[] = [];
  let at = -1; // início do membro atual
  while (!r.done() && !r.is('}')) {
    if (r.eat(';') || r.eat(',')) continue;
    if (at < 0) at = r.peek()!.s;
    if (r.is('@')) {
      decos.push(readDecorator(r));
      continue;
    }
    const t = r.peek()!;
    const n = r.peek(1);
    if (t.t === 'id' && MEMBER_MODIFIERS.has(t.v) && n && !n.nl && (n.t === 'id' || n.t === 'str' || n.v === '[' || n.v === '*')) {
      r.next();
      continue;
    }
    if (r.eat('*')) continue;

    const memberAt = at;
    at = -1;
    let property: string;
    if (r.is('[')) {
      const start = r.i;
      r.skipBalanced();
      property = r.textFrom(start);
    } else if (r.is('{') || r.is('(')) {
      r.skipBalanced(); // bloco estático ou algo inesperado
      decos = [];
      continue;
    } else {
      property = r.next().v;
    }
    if (!r.eat('?')) r.eat('!');

    if (r.is('(') || r.is('<')) {
      skipMethod(r);
      decos = [];
      continue;
    }
    const tsType = r.eat(':') ? readType(r) : undefined;
    if (r.eat('=')) skipInitializer(r);
    members.push({ property, tsType, decos, at: memberAt });
    decos = [];
  }
  r.eat('}');
  return members;
}

/** Lê o texto de um tipo até `;`, `=`, `}`, `@` ou uma quebra de linha. */
function readType(r: Reader) {
  const start = r.i;
  let depth = 0;
  while (!r.done()) {
    const t = r.peek()!;
    if (depth === 0 && r.i > start) {
      if (t.t === 'punc' && [';', '=', '}', '@', ','].includes(t.v)) break;
      if (t.nl && t.v !== '|' && t.v !== '&') break;
    }
    if (t.t === 'punc' && '([{<'.includes(t.v)) depth++;
    else if (t.t === 'punc' && ')]}>'.includes(t.v)) {
      if (depth === 0) break;
      depth--;
    }
    r.next();
  }
  return cleanTsType(r.textFrom(start));
}

function skipInitializer(r: Reader) {
  const start = r.i;
  while (!r.done()) {
    const t = r.peek()!;
    if (t.t === 'punc' && (t.v === ';' || t.v === '}')) return;
    if (t.nl && r.i > start) return;
    if (t.t === 'punc' && '([{'.includes(t.v)) r.skipBalanced();
    else r.next();
  }
}

function skipMethod(r: Reader) {
  while (!r.done() && !r.is('(')) r.next(); // genéricos <T>
  r.skipBalanced();
  let depth = 0;
  while (!r.done()) {
    const t = r.peek()!;
    if (depth === 0 && t.t === 'punc' && (t.v === '{' || t.v === ';' || t.v === '}')) break;
    if (t.t === 'punc' && '(<['.includes(t.v)) depth++;
    else if (t.t === 'punc' && ')>]'.includes(t.v)) depth--;
    r.next();
  }
  if (r.is('{')) r.skipBalanced();
}

function cleanTsType(t: string) {
  return t
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s && s !== 'null' && s !== 'undefined')
    .join(' | ');
}

/** `NotaFiscal` → `NOTA_FISCAL`. */
export function deriveTableName(className: string) {
  return className
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toUpperCase();
}

function num(v: Lit) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
  return undefined;
}

function sqlDefault(v: Lit) {
  if (v === undefined) return undefined;
  if (v === null) return 'NULL';
  if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (isFn(v)) return v.returnsString ?? v.bodyText;
  return undefined;
}

function readColumn(d: Decorator, property: string, tsType: string | undefined): ColumnModel {
  let type: string | undefined;
  let opts: LitRecord = {};
  let generated = false;

  if (d.name === 'PrimaryGeneratedColumn') {
    const strategy = typeof d.args[0] === 'string' ? d.args[0] : 'increment';
    opts = d.args.find(isRecord) ?? {};
    if (strategy === 'uuid') {
      type = 'varchar2';
      opts = { length: 36, ...opts };
    } else {
      generated = true;
      type = 'number';
    }
  } else {
    for (const a of d.args) {
      if (typeof a === 'string' && type === undefined) type = a;
      else if (isRecord(a)) opts = a;
    }
  }
  if (typeof opts.type === 'string') type = opts.type;
  if (isIdent(opts.type)) type = opts.type.name;

  const isPrimary = d.name === 'PrimaryColumn' || d.name === 'PrimaryGeneratedColumn' || opts.primary === true;
  let def = sqlDefault(opts.default);
  if (d.name === 'CreateDateColumn' || d.name === 'UpdateDateColumn') {
    type = type ?? 'timestamp';
    def = def ?? 'CURRENT_TIMESTAMP';
  }
  if (d.name === 'DeleteDateColumn') type = type ?? 'timestamp';
  if (d.name === 'VersionColumn') type = type ?? 'number';

  return {
    property,
    decorator: d.name,
    name: typeof opts.name === 'string' ? opts.name : undefined,
    type,
    tsType,
    length: num(opts.length),
    precision: num(opts.precision),
    scale: num(opts.scale),
    nullable: d.name === 'ViewColumn' || d.name === 'DeleteDateColumn' ? true : opts.nullable === true && !isPrimary,
    primary: isPrimary,
    generated,
    unique: opts.unique === true,
    default: def,
  };
}

function joinCol(v: Lit): JoinColumnModel | undefined {
  if (!isRecord(v)) return undefined;
  return {
    name: typeof v.name === 'string' ? v.name : undefined,
    referencedColumnName: typeof v.referencedColumnName === 'string' ? v.referencedColumnName : undefined,
  };
}

function readRelation(d: Decorator, all: Decorator[], property: string): RelationModel {
  const target = d.args[0];
  let targetClass = '?';
  if (isFn(target) && target.returnsIdentifier) targetClass = target.returnsIdentifier;
  else if (typeof target === 'string') targetClass = target;
  else if (isIdent(target)) targetClass = target.name;

  const joinColumns: JoinColumnModel[] = [];
  const jc = all.find((x) => x.name === 'JoinColumn');
  if (jc) {
    const a = jc.args[0];
    if (Array.isArray(a)) {
      for (const x of a) {
        const j = joinCol(x);
        if (j) joinColumns.push(j);
      }
    } else {
      joinColumns.push(joinCol(a) ?? {});
    }
  }

  const rel: RelationModel = { property, kind: d.name as RelationKind, targetClass, joinColumns };
  const jt = all.find((x) => x.name === 'JoinTable');
  if (jt) {
    const o = isRecord(jt.args[0]) ? jt.args[0] : {};
    rel.joinTable = {
      name: typeof o.name === 'string' ? o.name : undefined,
      joinColumn: joinCol(o.joinColumn),
      inverseJoinColumn: joinCol(o.inverseJoinColumn),
    };
  }
  return rel;
}

function readIndex(args: Lit[]): IndexModel | undefined {
  let name: string | undefined;
  let columns: string[] = [];
  let unique = false;
  for (const a of args) {
    if (typeof a === 'string') name = a;
    else if (Array.isArray(a)) columns = a.filter((x): x is string => typeof x === 'string');
    else if (isRecord(a)) unique = a.unique === true;
  }
  return columns.length ? { name, columns, unique } : undefined;
}

/** Procura @Entity/@ViewEntity dentro dos comentários do arquivo. */
function findCommentedEntities(file: string, text: string, comments: Comment[]): CommentedEntity[] {
  if (!ENTITY_IN_COMMENT.test(text)) return [];
  const out: CommentedEntity[] = [];
  for (const block of commentBlocks(text, comments)) {
    if (!ENTITY_IN_COMMENT.test(block)) continue;
    const found = extractEntities(file, block);
    if (found.length) {
      for (const e of found) out.push({ file, className: e.className, tableName: e.tableName, schema: e.schema, kind: e.kind });
      continue;
    }
    // O código comentado não fecha (ex.: só o decorator): tenta no texto.
    const m = /@(Entity|ViewEntity)\s*\(\s*(?:\{[^}]*?name\s*:\s*)?['"`]([^'"`]+)['"`]/.exec(block);
    const cls = /class\s+([A-Za-z_$][\w$]*)/.exec(block);
    let tableName = m?.[2];
    let schema: string | undefined;
    if (tableName?.includes('.')) {
      const idx = tableName.lastIndexOf('.');
      schema = tableName.slice(0, idx);
      tableName = tableName.slice(idx + 1);
    }
    out.push({ file, className: cls?.[1], tableName, schema, kind: m?.[1] === 'ViewEntity' ? 'view' : 'table' });
  }
  return out;
}

/** Junta comentários `//` consecutivos e devolve o texto "descomentado" de cada bloco. */
function commentBlocks(text: string, comments: Comment[]) {
  const blocks: string[] = [];
  let current: string[] = [];
  let lastEnd = -1;
  const flush = () => {
    if (current.length) blocks.push(current.join('\n'));
    current = [];
  };
  for (const c of comments) {
    if (c.kind === 'line') {
      if (lastEnd >= 0 && text.slice(lastEnd, c.s).trim() !== '') flush();
      current.push(c.text.replace(/^\/\/\s?/, ''));
      lastEnd = c.e;
    } else {
      flush();
      blocks.push(
        c.text
          .replace(/^\/\*+/, '')
          .replace(/\*+\/$/, '')
          .split('\n')
          .map((l) => l.replace(/^\s*\*\s?/, ''))
          .join('\n'),
      );
      lastEnd = -1;
    }
  }
  flush();
  return blocks;
}
