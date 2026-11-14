/**
 * Decorator TypeORM equivalente a uma coluna, para o usuário colar na entity.
 */
(function (DDL) {
  'use strict';

  /** Default (já em SQL) como valor de decorator: `'A'`, `0` ou `() => "SYSDATE"`. */
  function defaultForDecorator(sql) {
    if (/^'.*'$/s.test(sql)) return `'${sql.slice(1, -1).replace(/''/g, "'").replace(/'/g, "\\'")}'`;
    if (/^-?\d+(\.\d+)?$/.test(sql)) return sql;
    return `() => "${sql.replace(/"/g, '\\"')}"`;
  }

  /** @param {import('../model.js').ColumnModel} c */
  function columnSnippet(c) {
    const dec = c.decorator ?? 'Column';
    const parts = [];
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

  DDL.snippet = { columnSnippet };
})((globalThis.DDL = globalThis.DDL || {}));
