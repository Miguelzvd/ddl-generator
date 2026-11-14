import ts from 'typescript';

/** Função (arrow/function) encontrada num argumento de decorator. */
export interface FnLit {
  kind: 'fn';
  bodyText: string;
  /** `() => Classe` */
  returnsIdentifier?: string;
  /** `() => 'SYSDATE'` */
  returnsString?: string;
}

/** Identificador solto (ex.: uma constante). */
export interface IdentLit {
  kind: 'ident';
  name: string;
}

export type Lit =
  | string
  | number
  | boolean
  | null
  | undefined
  | FnLit
  | IdentLit
  | Lit[]
  | { [key: string]: Lit };

export function isFn(v: Lit): v is FnLit {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && (v as FnLit).kind === 'fn';
}

export function isIdent(v: Lit): v is IdentLit {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && (v as IdentLit).kind === 'ident';
}

export function isRecord(v: Lit): v is { [key: string]: Lit } {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !isFn(v) && !isIdent(v);
}

/** Converte um nó de expressão em valor JS, sem avaliar código. */
export function literal(node: ts.Expression, sf: ts.SourceFile): Lit {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(node.operand)) {
    return -Number(node.operand.text);
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isIdentifier(node)) return node.text === 'undefined' ? undefined : { kind: 'ident', name: node.text };
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return literal(node.expression, sf);
  if (ts.isArrayLiteralExpression(node)) return node.elements.map((el) => literal(el as ts.Expression, sf));
  if (ts.isObjectLiteralExpression(node)) {
    const out: { [key: string]: Lit } = {};
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const key = propName(prop.name);
        if (key !== undefined) out[key] = literal(prop.initializer, sf);
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        out[prop.name.text] = { kind: 'ident', name: prop.name.text };
      }
    }
    return out;
  }
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
    const fn: FnLit = { kind: 'fn', bodyText: node.body.getText(sf) };
    let ret: ts.Node | undefined = node.body;
    if (ts.isBlock(node.body)) {
      const r = node.body.statements.find(ts.isReturnStatement);
      ret = r?.expression;
    }
    while (ret && ts.isParenthesizedExpression(ret)) ret = ret.expression;
    if (ret && ts.isIdentifier(ret)) fn.returnsIdentifier = ret.text;
    if (ret && (ts.isStringLiteral(ret) || ts.isNoSubstitutionTemplateLiteral(ret))) fn.returnsString = ret.text;
    if (ret && ts.isPropertyAccessExpression(ret)) fn.returnsIdentifier = ret.name.text;
    return fn;
  }
  return { kind: 'fn', bodyText: node.getText(sf) };
}

function propName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
}
