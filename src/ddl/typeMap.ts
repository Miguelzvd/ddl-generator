import type { ColumnModel } from '../model';

export interface MappedType {
  sql: string;
  warning?: string;
  /** Qual o problema, quando há aviso. */
  issue?: 'length' | 'type';
}

const DEFAULT_VARCHAR = 255;

/** Converte o tipo TypeORM/TS de uma coluna para o tipo Oracle. */
export function mapColumnType(col: ColumnModel): MappedType {
  const explicit = col.type?.trim().toLowerCase();
  const t = explicit ?? fromTsType(col.tsType);

  if (!t) {
    return { sql: `VARCHAR2(${DEFAULT_VARCHAR})`, warning: 'tipo não definido na entity; usado VARCHAR2(255)', issue: 'type' };
  }

  switch (t) {
    case 'varchar2':
    case 'varchar':
    case 'nvarchar2':
    case 'string':
    case 'character varying': {
      const base = t === 'nvarchar2' ? 'NVARCHAR2' : 'VARCHAR2';
      if (col.length) return { sql: `${base}(${col.length})` };
      return { sql: `${base}(${DEFAULT_VARCHAR})`, warning: `tamanho não definido na entity; usado ${base}(${DEFAULT_VARCHAR})`, issue: 'length' };
    }
    case 'char':
    case 'nchar':
    case 'character':
      return { sql: `${t === 'nchar' ? 'NCHAR' : 'CHAR'}(${col.length ?? 1})` };
    case 'number':
    case 'numeric':
    case 'decimal':
    case 'dec':
      if (col.precision !== undefined) {
        return { sql: col.scale !== undefined ? `NUMBER(${col.precision},${col.scale})` : `NUMBER(${col.precision})` };
      }
      return { sql: 'NUMBER' };
    case 'int':
    case 'integer':
    case 'smallint':
    case 'bigint':
      return { sql: col.precision !== undefined ? `NUMBER(${col.precision})` : 'NUMBER' };
    case 'float':
    case 'double precision':
    case 'real':
      return { sql: t === 'float' ? 'FLOAT' : t.toUpperCase() };
    case 'date':
      return { sql: 'DATE' };
    case 'timestamp':
    case 'datetime':
    case 'timestamp with time zone':
    case 'timestamp with local time zone':
      return { sql: t === 'datetime' ? 'TIMESTAMP' : t.toUpperCase() };
    case 'clob':
    case 'text':
    case 'long':
      return { sql: 'CLOB' };
    case 'nclob':
      return { sql: 'NCLOB' };
    case 'blob':
    case 'raw':
    case 'long raw':
      return t === 'raw' ? { sql: `RAW(${col.length ?? 2000})` } : { sql: 'BLOB' };
    case 'boolean':
    case 'bool':
      return { sql: 'NUMBER(1)' };
    default:
      return { sql: t.toUpperCase(), warning: `tipo "${col.type ?? col.tsType}" não reconhecido; usado como está`, issue: 'type' };
  }
}

function fromTsType(tsType?: string): string | undefined {
  switch (tsType) {
    case 'number':
      return 'number';
    case 'string':
      return 'varchar2';
    case 'Date':
      return 'timestamp';
    case 'boolean':
      return 'boolean';
    default:
      return undefined;
  }
}

/** Parte do tipo antes do parêntese — usada para checar compatibilidade de FK. */
export function baseType(sql: string): string {
  return sql.replace(/\(.*$/, '').trim();
}
