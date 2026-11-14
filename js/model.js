/**
 * Tipos compartilhados (só documentação JSDoc) e rótulos de status.
 *
 * Todos os módulos se registram em `window.DDL` (ou `globalThis.DDL` no Node),
 * e são carregados em ordem pelo index.html — assim funciona abrindo o arquivo
 * direto do disco, sem servidor e sem build.
 *
 * @typedef {'table' | 'view'} EntityKind
 * @typedef {'ManyToOne' | 'OneToOne' | 'OneToMany' | 'ManyToMany'} RelationKind
 * @typedef {'ok' | 'assumptions' | 'revised' | 'commented' | 'impossible'} Status
 * @typedef {'varchar-length' | 'type' | 'column-name' | 'table-name' | 'fk-type' | 'other'} AssumptionKind
 *
 * @typedef {object} ColumnModel
 * @property {string} property        nome da propriedade na classe
 * @property {string} [decorator]     Column, PrimaryColumn, … (para montar o trecho corrigido)
 * @property {string} [name]          nome no banco (`name` do decorator)
 * @property {string} [type]
 * @property {string} [tsType]        tipo TypeScript, sem `| null`
 * @property {number} [length]
 * @property {number} [precision]
 * @property {number} [scale]
 * @property {boolean} nullable
 * @property {boolean} primary
 * @property {boolean} generated
 * @property {boolean} unique
 * @property {string} [default]       já em SQL (ex.: `SYSDATE`, `'A'`, `0`)
 * @property {number} [line]          linha da propriedade (do primeiro decorator) no arquivo
 *
 * @typedef {{ name?: string, referencedColumnName?: string }} JoinColumnModel
 *
 * @typedef {object} RelationModel
 * @property {string} property
 * @property {RelationKind} kind
 * @property {string} targetClass
 * @property {string} [targetFile]    arquivo de onde a classe alvo foi importada (sem extensão)
 * @property {JoinColumnModel[]} joinColumns
 * @property {{ name?: string, joinColumn?: JoinColumnModel, inverseJoinColumn?: JoinColumnModel }} [joinTable]
 *
 * @typedef {{ name?: string, columns: string[], unique: boolean }} IndexModel
 *
 * @typedef {object} EntityModel
 * @property {string} className
 * @property {string} tableName
 * @property {boolean} tableNameDerived  true quando o nome veio do nome da classe
 * @property {string} [schema]
 * @property {EntityKind} kind
 * @property {string} file
 * @property {ColumnModel[]} columns
 * @property {RelationModel[]} relations
 * @property {IndexModel[]} indices
 * @property {string} [unresolved]       motivo quando o decorator não pôde ser lido
 * @property {number} [line]             linha da declaração `class` no arquivo
 *
 * @typedef {{ file: string, className?: string, tableName?: string, schema?: string, kind: EntityKind }} CommentedEntity
 * @typedef {{ file: string, entities: EntityModel[], commented: CommentedEntity[], error?: string }} ParsedFile
 *
 * @typedef {object} Assumption      valor presumido, que o usuário pode corrigir ou aceitar
 * @property {string} key
 * @property {AssumptionKind} kind
 * @property {string} text
 * @property {string} [column]       propriedade da coluna
 * @property {string} [label]        nome da coluna no banco
 * @property {string} [fkColumn]     coluna da FK, para `fk-type`
 * @property {boolean} resolved
 * @property {string} [note]         decisão tomada (vira `-- Revisado:` no SQL)
 * @property {string} [snippet]      decorator corrigido, pronto para colar
 * @property {string} [current]      valor efetivo atual, para preencher o campo
 *
 * @typedef {{ length?: number, type?: string, name?: string }} ColumnOverride
 * @typedef {{ tableName?: string, columns: Record<string, ColumnOverride>, fks: Record<string, 'adopt' | 'keep'>, accepted: string[] }} EntityOverride
 * @typedef {Record<string, EntityOverride>} Overrides   correções por entity (`arquivo#Classe`)
 *
 * @typedef {object} EntityReport
 * @property {string} id
 * @property {Status} status
 * @property {string} className
 * @property {string} tableName
 * @property {string} [schema]
 * @property {EntityKind} kind
 * @property {string} file
 * @property {number} columnCount
 * @property {number} relationCount
 * @property {string[]} reasons
 * @property {Assumption[]} assumptions
 * @property {EntityModel} [entity]
 *
 * @typedef {{ oracle11g: boolean, overrides?: Overrides }} GenerateOptions
 */
(function (DDL) {
  'use strict';

  /** @type {Record<Status, string>} */
  const STATUS_LABEL = {
    ok: 'Pode gerar',
    assumptions: 'Pode gerar, com suposições',
    revised: 'Revisado',
    commented: 'Comentado',
    impossible: 'Não é possível gerar',
  };

  DDL.model = { STATUS_LABEL };
})((globalThis.DDL = globalThis.DDL || {}));
