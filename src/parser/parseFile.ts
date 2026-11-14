import ts from 'typescript';
import type {
  ColumnModel,
  CommentedEntity,
  EntityKind,
  EntityModel,
  IndexModel,
  JoinColumnModel,
  ParsedFile,
  RelationKind,
  RelationModel,
} from '../model';
import { isFn, isIdent, isRecord, literal, type Lit } from './literal';

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
const RELATION_DECORATORS = new Set<RelationKind>(['ManyToOne', 'OneToOne', 'OneToMany', 'ManyToMany']);
const ENTITY_IN_COMMENT = /@(Entity|ViewEntity)\s*\(/;

interface Deco {
  name: string;
  args: Lit[];
}

/** Lê um arquivo .ts e extrai as entities TypeORM (ativas e comentadas). */
export function parseFile(file: string, text: string): ParsedFile {
  try {
    const entities = extractEntities(file, text);
    const commented = findCommentedEntities(file, text);
    return { file, entities, commented };
  } catch (err) {
    return { file, entities: [], commented: [], error: err instanceof Error ? err.message : String(err) };
  }
}

function extractEntities(file: string, text: string): EntityModel[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports = relativeImports(sf, file);
  const out: EntityModel[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isClassDeclaration(node)) {
      const e = readClass(node, sf, file);
      if (e) {
        for (const r of e.relations) r.targetFile = imports.get(r.targetClass);
        out.push(e);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/** Mapa nome importado → caminho do arquivo (sem extensão), para imports relativos. */
function relativeImports(sf: ts.SourceFile, file: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    const spec = st.moduleSpecifier.text;
    if (!spec.startsWith('.')) continue;
    const target = joinPath(file, spec);
    const named = st.importClause?.namedBindings;
    if (named && ts.isNamedImports(named)) {
      for (const el of named.elements) map.set(el.name.text, target);
    }
    if (st.importClause?.name) map.set(st.importClause.name.text, target);
  }
  return map;
}

export function joinPath(fromFile: string, spec: string): string {
  const parts = fromFile.replace(/\\/g, '/').split('/');
  parts.pop();
  for (const seg of spec.split('/')) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/').replace(/\.(ts|js)$/, '');
}

function decoratorsOf(node: ts.Node, sf: ts.SourceFile): Deco[] {
  if (!ts.canHaveDecorators(node)) return [];
  return (ts.getDecorators(node) ?? []).flatMap((d) => {
    const expr = d.expression;
    if (ts.isCallExpression(expr)) {
      const name = calleeName(expr.expression);
      return name ? [{ name, args: expr.arguments.map((a) => literal(a, sf)) }] : [];
    }
    const name = calleeName(expr);
    return name ? [{ name, args: [] }] : [];
  });
}

function calleeName(expr: ts.Expression): string | undefined {
  if (ts.isIdentifier(expr)) return expr.text;
  if (ts.isPropertyAccessExpression(expr)) return expr.name.text;
  return undefined;
}

function readClass(node: ts.ClassDeclaration, sf: ts.SourceFile, file: string): EntityModel | undefined {
  const decos = decoratorsOf(node, sf);
  const entityDeco = decos.find((d) => d.name === 'Entity' || d.name === 'ViewEntity');
  if (!entityDeco) return undefined;

  const className = node.name?.text ?? '(classe anônima)';
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

  for (const d of decos.filter((d) => d.name === 'Index')) {
    const idx = readIndex(d.args);
    if (idx) indices.push(idx);
  }

  for (const member of node.members) {
    if (!ts.isPropertyDeclaration(member)) continue;
    const property = member.name.getText(sf);
    const tsType = member.type ? cleanTsType(member.type.getText(sf)) : undefined;
    const mdecos = decoratorsOf(member, sf);

    const colDeco = mdecos.find((d) => COLUMN_DECORATORS.has(d.name));
    if (colDeco) columns.push(readColumn(colDeco, property, tsType));

    const relDeco = mdecos.find((d) => RELATION_DECORATORS.has(d.name as RelationKind));
    if (relDeco) relations.push(readRelation(relDeco, mdecos, property));

    const idxDeco = mdecos.find((d) => d.name === 'Index');
    if (idxDeco) {
      const opts = idxDeco.args.find(isRecord);
      const name = idxDeco.args.find((a): a is string => typeof a === 'string');
      indices.push({ name, columns: [property], unique: opts?.unique === true });
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

function cleanTsType(t: string): string {
  return t
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s && s !== 'null' && s !== 'undefined')
    .join(' | ');
}

export function deriveTableName(className: string): string {
  return className
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toUpperCase();
}

function num(v: Lit): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
  return undefined;
}

function sqlDefault(v: Lit): string | undefined {
  if (v === undefined) return undefined;
  if (v === null) return 'NULL';
  if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (isFn(v)) return v.returnsString ?? v.bodyText;
  return undefined;
}

function readColumn(d: Deco, property: string, tsType: string | undefined): ColumnModel {
  let type: string | undefined;
  let opts: { [k: string]: Lit } = {};
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

function readRelation(d: Deco, all: Deco[], property: string): RelationModel {
  const target = d.args[0];
  let targetClass = '?';
  if (isFn(target) && target.returnsIdentifier) targetClass = target.returnsIdentifier;
  else if (typeof target === 'string') targetClass = target;
  else if (isIdent(target)) targetClass = target.name;

  const joinColumns: JoinColumnModel[] = [];
  const jc = all.find((x) => x.name === 'JoinColumn');
  if (jc) {
    const a = jc.args[0];
    if (Array.isArray(a)) a.forEach((x) => { const j = joinCol(x); if (j) joinColumns.push(j); });
    else joinColumns.push(joinCol(a) ?? {});
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

/** Procura @Entity/@ViewEntity dentro de comentários do arquivo. */
function findCommentedEntities(file: string, text: string): CommentedEntity[] {
  if (!ENTITY_IN_COMMENT.test(text)) return [];
  const blocks = commentBlocks(text);
  const out: CommentedEntity[] = [];
  for (const block of blocks) {
    if (!ENTITY_IN_COMMENT.test(block)) continue;
    const found = extractEntities(file, block);
    if (found.length) {
      for (const e of found) {
        out.push({ file, className: e.className, tableName: e.tableName, schema: e.schema, kind: e.kind });
      }
    } else {
      const m = /@(Entity|ViewEntity)\s*\(\s*(?:\{[^}]*?name\s*:\s*)?['"`]([^'"`]+)['"`]/.exec(block);
      const cls = /class\s+([A-Za-z_$][\w$]*)/.exec(block);
      let tableName = m?.[2];
      let schema: string | undefined;
      if (tableName?.includes('.')) [schema, tableName] = [tableName.slice(0, tableName.lastIndexOf('.')), tableName.slice(tableName.lastIndexOf('.') + 1)];
      out.push({ file, className: cls?.[1], tableName, schema, kind: m?.[1] === 'ViewEntity' ? 'view' : 'table' });
    }
  }
  return out;
}

/** Junta comentários consecutivos e devolve o texto "descomentado" de cada bloco. */
function commentBlocks(text: string): string[] {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, text);
  const blocks: string[] = [];
  let current: string[] = [];
  let lastEnd = -1;
  const flush = () => {
    if (current.length) blocks.push(current.join('\n'));
    current = [];
  };
  for (let tok = scanner.scan(); tok !== ts.SyntaxKind.EndOfFileToken; tok = scanner.scan()) {
    if (tok === ts.SyntaxKind.SingleLineCommentTrivia) {
      const start = scanner.getTokenStart();
      if (lastEnd >= 0 && text.slice(lastEnd, start).trim() !== '') flush();
      current.push(scanner.getTokenText().replace(/^\/\/\s?/, ''));
      lastEnd = scanner.getTokenEnd();
    } else if (tok === ts.SyntaxKind.MultiLineCommentTrivia) {
      flush();
      const body = scanner
        .getTokenText()
        .replace(/^\/\*+/, '')
        .replace(/\*+\/$/, '')
        .split('\n')
        .map((l) => l.replace(/^\s*\*\s?/, ''))
        .join('\n');
      blocks.push(body);
      lastEnd = -1;
    } else if (
      tok !== ts.SyntaxKind.WhitespaceTrivia &&
      tok !== ts.SyntaxKind.NewLineTrivia
    ) {
      flush();
      lastEnd = -1;
    }
  }
  flush();
  return blocks;
}
