/** Decorator TypeORM equivalente a uma coluna, para o usuário colar na entity. */
import type { ColumnModel } from '../model';

/** Default (já em SQL) como valor de decorator: `'A'`, `0` ou `() => "SYSDATE"`. */
function defaultForDecorator(sql: string) {
  if (/^'.*'$/s.test(sql)) return `'${sql.slice(1, -1).replace(/''/g, "'").replace(/'/g, "\\'")}'`;
  if (/^-?\d+(\.\d+)?$/.test(sql)) return sql;
  return `() => "${sql.replace(/"/g, '\\"')}"`;
}

export function columnSnippet(c: ColumnModel) {
  const dec = c.decorator ?? 'Column';
  const parts: string[] = [];
  if (c.name) parts.push(`name: '${c.name}'`);
  if (dec === 'PrimaryGeneratedColumn') return `@PrimaryGeneratedColumn({ ${parts.join(', ')} })`;
  if (c.length !== undefined) parts.push(`length: ${c.length}`);
  if (c.precision !== undefined) parts.push(`precision: ${c.precision}`);
  if (c.scale !== undefined) parts.push(`scale: ${c.scale}`);
  if (c.nullable && !c.primary && dec !== 'ViewColumn') parts.push('nullable: true');
  if (c.primary && dec === 'Column') parts.push('primary: true');
  if (c.unique) parts.push('unique: true');
  if (c.default !== undefined) parts.push(`default: ${defaultForDecorator(c.default)}`);
  const typeArg = c.type ? `'${c.type}', ` : '';
  return `@${dec}(${typeArg}{ ${parts.join(', ')} })`;
}
