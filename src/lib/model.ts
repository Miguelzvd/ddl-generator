export type EntityKind = 'table' | 'view';

export interface ColumnModel {
  property: string;
  /** Decorator usado (Column, PrimaryColumn, …), para montar o trecho corrigido. */
  decorator?: string;
  /** Nome no banco (`name` do decorator) ou undefined quando não informado. */
  name?: string;
  type?: string;
  /** Tipo TypeScript da propriedade, sem `| null`. */
  tsType?: string;
  length?: number;
  precision?: number;
  scale?: number;
  nullable: boolean;
  primary: boolean;
  generated: boolean;
  unique: boolean;
  /** Default já em SQL (ex.: `SYSDATE`, `'A'`, `0`). */
  default?: string;
  /** Linha da propriedade (do primeiro decorator) no arquivo. */
  line?: number;
}

export interface JoinColumnModel {
  name?: string;
  referencedColumnName?: string;
}

export type RelationKind = 'ManyToOne' | 'OneToOne' | 'OneToMany' | 'ManyToMany';

export interface RelationModel {
  property: string;
  kind: RelationKind;
  targetClass: string;
  /** Arquivo de onde a classe alvo foi importada (sem extensão), quando relativo. */
  targetFile?: string;
  joinColumns: JoinColumnModel[];
  joinTable?: {
    name?: string;
    joinColumn?: JoinColumnModel;
    inverseJoinColumn?: JoinColumnModel;
  };
}

export interface IndexModel {
  name?: string;
  /** Nomes de propriedades ou colunas. */
  columns: string[];
  unique: boolean;
}

export interface EntityModel {
  className: string;
  tableName: string;
  /** true quando o nome foi derivado do nome da classe. */
  tableNameDerived: boolean;
  schema?: string;
  kind: EntityKind;
  file: string;
  columns: ColumnModel[];
  relations: RelationModel[];
  indices: IndexModel[];
  /** Motivo quando o decorator não pôde ser lido (ex.: nome não literal). */
  unresolved?: string;
  /** Linha da declaração `class` no arquivo. */
  line?: number;
}

export interface CommentedEntity {
  file: string;
  className?: string;
  tableName?: string;
  schema?: string;
  kind: EntityKind;
}

export interface ParsedFile {
  file: string;
  entities: EntityModel[];
  commented: CommentedEntity[];
  error?: string;
}

export type Status = 'ok' | 'assumptions' | 'revised' | 'commented' | 'impossible';

export type AssumptionKind = 'varchar-length' | 'type' | 'column-name' | 'table-name' | 'fk-type' | 'other';

/** Um valor presumido pela ferramenta, que o usuário pode corrigir ou aceitar. */
export interface Assumption {
  key: string;
  kind: AssumptionKind;
  text: string;
  /** Propriedade da coluna, quando a suposição é de uma coluna. */
  column?: string;
  /** Nome da coluna no banco, para exibir junto do texto. */
  label?: string;
  /** Nome da coluna de FK, para `fk-type`. */
  fkColumn?: string;
  resolved: boolean;
  /** O que foi decidido (vira `-- Revisado:` no SQL). */
  note?: string;
  /** Decorator corrigido, pronto para colar na entity. */
  snippet?: string;
  /** Valor atual efetivo (ex.: tamanho 255), para preencher o campo. */
  current?: string;
}

export interface ColumnOverride {
  length?: number;
  type?: string;
  name?: string;
}

export interface EntityOverride {
  tableName?: string;
  columns: Record<string, ColumnOverride>;
  fks: Record<string, 'adopt' | 'keep'>;
  accepted: string[];
}

/** Correções por entity (`arquivo#Classe`). */
export type Overrides = Record<string, EntityOverride>;

export interface EntityReport {
  id: string;
  status: Status;
  className: string;
  tableName: string;
  schema?: string;
  kind: EntityKind;
  file: string;
  columnCount: number;
  relationCount: number;
  reasons: string[];
  /** Todas as suposições (resolvidas ou não). */
  assumptions: Assumption[];
  entity?: EntityModel;
}

export interface GenerateOptions {
  oracle11g: boolean;
  overrides?: Overrides;
}

export const STATUS_LABEL: Record<Status, string> = {
  ok: 'Pode gerar',
  assumptions: 'Pode gerar, com suposições',
  revised: 'Revisado',
  commented: 'Comentado',
  impossible: 'Não é possível gerar',
};
