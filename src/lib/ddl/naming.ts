/**
 * Nomes e chaves: ids de entity, registro de classes e nomes de constraint.
 *
 * O registro guarda cada entity por nome da classe (a primeira encontrada) e
 * por `arquivo-sem-extensão::Classe`, para resolver classes com o mesmo nome.
 */
import type { ColumnModel, EntityModel, GenerateOptions, RelationModel } from '../model';

export type Registry = Map<string, EntityModel>;

export const fileKey = (file: string, className: string) => `${file.replace(/\\/g, '/').replace(/\.(ts|js)$/, '')}::${className}`;

/** Id estável da entity: `arquivo#Classe`. */
export const entityId = (e: { file: string; className: string }) => `${e.file}#${e.className}`;

/** Acha a entity alvo de uma relação, preferindo a classe importada pelo arquivo. */
export function lookupTarget(rel: RelationModel, registry: Registry) {
  if (rel.targetFile) {
    const byFile = registry.get(`${rel.targetFile}::${rel.targetClass}`) ?? registry.get(`${rel.targetFile}/index::${rel.targetClass}`);
    if (byFile) return byFile;
  }
  return registry.get(rel.targetClass);
}

export const qualified = (schema: string | undefined, table: string) => (schema ? `${schema}.${table}` : table);

/** Maiúsculas, só caracteres válidos e no máximo 128 (ou 30 no Oracle 11g). */
export function constraintName(raw: string, opts: GenerateOptions) {
  const max = opts.oracle11g ? 30 : 128;
  const clean = raw.toUpperCase().replace(/[^A-Z0-9_$#]/g, '_');
  return clean.length > max ? clean.slice(0, max) : clean;
}

/** Nome da coluna no banco (ou o da propriedade, se não informado). */
export const columnName = (c: ColumnModel) => c.name ?? c.property;

/** Coluna pelo nome no banco ou, se não achar, pelo nome da propriedade. */
export function findColumn(e: EntityModel, ref: string) {
  return e.columns.find((c) => columnName(c) === ref) ?? e.columns.find((c) => c.property === ref);
}
