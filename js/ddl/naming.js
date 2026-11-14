/**
 * Nomes e chaves: ids de entity, registro de classes e nomes de constraint.
 *
 * O registro guarda cada entity por nome da classe (a primeira encontrada) e
 * por `arquivo-sem-extensão::Classe`, para resolver classes com o mesmo nome.
 *
 * @typedef {Map<string, import('../model.js').EntityModel>} Registry
 */
(function (DDL) {
  'use strict';

  const fileKey = (file, className) => `${file.replace(/\\/g, '/').replace(/\.(ts|js)$/, '')}::${className}`;

  /** Id estável da entity: `arquivo#Classe`. */
  const entityId = (e) => `${e.file}#${e.className}`;

  /** Acha a entity alvo de uma relação, preferindo a classe importada pelo arquivo. */
  function lookupTarget(rel, registry) {
    if (rel.targetFile) {
      const byFile = registry.get(`${rel.targetFile}::${rel.targetClass}`) ?? registry.get(`${rel.targetFile}/index::${rel.targetClass}`);
      if (byFile) return byFile;
    }
    return registry.get(rel.targetClass);
  }

  const qualified = (schema, table) => (schema ? `${schema}.${table}` : table);

  /** Maiúsculas, só caracteres válidos e no máximo 128 (ou 30 no Oracle 11g). */
  function constraintName(raw, opts) {
    const max = opts.oracle11g ? 30 : 128;
    const clean = raw.toUpperCase().replace(/[^A-Z0-9_$#]/g, '_');
    return clean.length > max ? clean.slice(0, max) : clean;
  }

  /** Nome da coluna no banco (ou o da propriedade, se não informado). */
  const columnName = (c) => c.name ?? c.property;

  DDL.naming = { fileKey, entityId, lookupTarget, qualified, constraintName, columnName };
})((globalThis.DDL = globalThis.DDL || {}));
