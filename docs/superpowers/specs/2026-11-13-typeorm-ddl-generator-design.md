# Gerador de DDL a partir de entities TypeORM — Design

Data: 2026-11-13

## Intenção e porquê

Gerar scripts DDL Oracle (`CREATE TABLE`, PKs, FKs) a partir das entities TypeORM de um
projeto TypeORM com Oracle, **sem conexão com o banco** (não há acesso para usar
`typeorm schema:log` / `migration:generate`). A ferramenta precisa ser fácil de passar
para outras pessoas usarem — por isso roda inteira no navegador, sem servidor e sem
instalação.

## Objetivos

1. **Varrer um projeto**: o usuário seleciona uma pasta (ex.: `src/entity` ou a raiz do
   projeto); a ferramenta encontra os arquivos `.ts` que contêm `@Entity`/`@ViewEntity` e
   lista as entities encontradas.
2. **Upload de múltiplos arquivos**: alternativa à varredura — selecionar/arrastar vários
   `.ts` de entity.
3. **Gerar o DDL** das entities, incluindo relacionamentos (FKs) entre elas.
4. **SQL comentado**: cada tabela, coluna e FK com comentário explicando o que é e de
   onde veio (arquivo/classe/propriedade).

## Não-objetivos

- Outros ORMs (JPA, Prisma, Sequelize…). Só TypeORM.
- Outros bancos além de Oracle.
- Gerar o DDL real de views (o SELECT da view não existe no código da entity).
- Conectar a banco, comparar com schema existente, gerar `ALTER`/migrations incrementais.
- Executar o projeto ou o TypeORM.

## Anti-objetivos (seria fracasso mesmo "funcionando")

- SQL que falha no Oracle sem o usuário ter sido avisado no próprio script do motivo.
- Inventar informação silenciosamente (tamanhos, tipos, FKs) — todo valor presumido
  deve vir marcado com comentário `-- ATENÇÃO:`.
- Exigir que outros usuários instalem Node, pnpm ou qualquer coisa para usar.

## Restrições

- Roda 100% no navegador; distribuído como **um único arquivo `index.html`** que abre com
  duplo clique (sem servidor).
- Entities TypeORM 0.3.x: ver "Padrões a suportar".
- Nenhum código do usuário é enviado para fora da máquina.

## Abordagens consideradas

| | Abordagem | Trade-off |
|---|---|---|
| A | App local Node/Express + página; varredura por caminho digitado | Varredura "de verdade" e re-varredura com um clique; mas exige Node/servidor rodando → pior para distribuir |
| **B** | **Página 100% no navegador** (escolhida) | Fácil de portar para outros usuários (um arquivo); "varrer" vira "selecionar pasta", sem re-varredura automática; bundle maior (~10 MB pelo compilador TS) |
| — | Leitura por regex | Descartada: quebra com decorators multilinha, opções aninhadas, código comentado e relações entre arquivos |

**Escolhida: B**, pelo usuário, porque facilita portar a ferramenta para outros usuários.

## Como funciona

### Entrada
- Botão **"Selecionar pasta do projeto"** (`<input type="file" webkitdirectory>`):
  lê todos os arquivos, ignora `node_modules`, `dist`, `.git`, e mantém só `.ts` cujo
  texto contém `@Entity(` ou `@ViewEntity(` (filtro rápido antes do parse).
- Área **"Arrastar/selecionar arquivos"** (`<input type="file" multiple accept=".ts">` +
  drag & drop). Uploads somam ao conjunto atual; há botão "Limpar".

### Listagem (etapa obrigatória antes de processar)
O fluxo é sempre **1. Carregar → 2. Listar → 3. Gerar**. Depois de carregar (pasta ou
arquivos), a ferramenta **sempre** mostra a lista de todas as entities encontradas antes
de qualquer geração; o botão **"Gerar script"** só existe nessa tela.

Cada linha tem uma **bolinha de status** (cor + texto, para não depender só da cor) e o
motivo:

| Bolinha | Status | Quando |
|---|---|---|
| 🟢 verde | **Pode gerar** | `@Entity` ativo, com colunas e tudo que o DDL precisa |
| 🟡 amarelo | **Pode gerar, com suposições** | gera, mas usa valor presumido (ex.: `VARCHAR2` sem tamanho, FK para destino ausente/view que sairá comentada). Lista as suposições |
| ⚪ cinza | **Comentado** | o `@Entity`/`@ViewEntity` está comentado no código (`// @Entity(...)` ou dentro de `/* */`) |
| 🔴 vermelho | **Não é possível gerar** | dados insuficientes: é view (`@ViewEntity`, sem o SELECT), não tem nenhuma coluna, não tem nome de tabela resolvível, ou erro de leitura do arquivo. Mostra o motivo |

Demais colunas: classe, nome da tabela, schema, tipo (Tabela/View), nº de colunas,
nº de relações, arquivo de origem. Resumo no topo com a contagem por status e filtro
por status.

Checkbox por linha para incluir/excluir da geração: verdes e amarelos marcados por
padrão; cinzas e vermelhos desabilitados (aparecem só para informação — vermelhos de
view ainda entram na seção "Views encontradas (sem DDL)" do script). Erros de leitura de
um arquivo aparecem como linha vermelha, sem interromper os demais.

### Leitura (parser)
Usa o compilador `typescript` (`ts.createSourceFile`, só AST, sem type-checker) para cada
arquivo. Extrai para um modelo intermediário:

```
Entity { className, tableName, schema?, kind: 'table'|'view', file,
         columns: Column[], relations: Relation[], indices: Index[] }
Column { property, name, type?, length?, precision?, scale?, nullable,
         primary, generated, unique, default? }
Relation { property, kind: ManyToOne|OneToOne|OneToMany|ManyToMany,
           targetClass, joinColumns?: {name, referencedColumnName?}[],
           joinTable?: {...} }
```

Resolução de relações é por **nome de classe** entre todos os arquivos carregados
(`() => ClienteResumoV` / `(type) => Marca` → classe `ClienteResumoV`).

### Padrões a suportar
- `@Entity("TABELA")`, `@Entity("SCHEMA.TABELA")`, `@Entity({ schema, name, ... })`.
- `@ViewEntity(...)` + `@ViewColumn(...)` → kind `view`.
- `@Column("tipo", { name, nullable, length, precision, scale, primary, default, unique })`
  e `@Column({ type: "tipo", ... })`; sem `name` → nome da propriedade.
- `@PrimaryColumn(...)`, `@PrimaryGeneratedColumn(...)`.
- `@ManyToOne`, `@OneToOne`, `@OneToMany`, `@ManyToMany`, `@JoinColumn`, `@JoinTable`,
  `@Index`.
- Decorators comentados: o AST não os enxerga como código, então o parser também
  examina os comentários do arquivo (`ts.getLeadingCommentRanges` / varredura dos
  trechos comentados) procurando `@Entity(`/`@ViewEntity(`. Se o arquivo tem entity
  comentada, ela entra na lista com status **Comentado** (o nome da tabela é extraído do
  texto comentado quando possível).

### Mapeamento de tipos (Oracle)
| TypeORM / TS | Oracle |
|---|---|
| `varchar2`/`varchar`/`string` com `length` | `VARCHAR2(n)` |
| idem sem `length` | `VARCHAR2(255)` + `-- ATENÇÃO: tamanho não definido na entity` |
| `number` com precision/scale | `NUMBER(p[,s])` |
| `number`, `int`, `integer`, TS `number` sem tipo | `NUMBER` |
| `date` | `DATE` |
| `timestamp` / TS `Date` sem tipo | `TIMESTAMP` |
| `clob`, `text` | `CLOB` |
| `blob` | `BLOB` |
| `boolean` | `NUMBER(1)` |
| `char` | `CHAR(n)` (padrão 1) |
| desconhecido | passado como está + `-- ATENÇÃO: tipo não reconhecido` |

Sem tipo explícito no decorator, infere do tipo TS da propriedade.

### Geração do DDL
Ordem do script:
1. Cabeçalho: data, origem (pasta/arquivos), contagem, legenda dos avisos.
2. Por schema (seções), cada **tabela**:
   - `CREATE TABLE SCHEMA.TABELA (...)` com colunas, `NOT NULL` quando `nullable` não é
     `true` (padrão TypeORM), `DEFAULT` quando simples, e `CONSTRAINT PK_<TABELA>
     PRIMARY KEY (...)`.
   - `@PrimaryGeneratedColumn` → por padrão `GENERATED BY DEFAULT AS IDENTITY`
     (Oracle 12c+). Opção na tela de geração: **"Oracle 11g (usar SEQUENCE)"**, que troca
     por `CREATE SEQUENCE SQ_<TABELA>` + comentário de uso (sem trigger).
   - `COMMENT ON TABLE` / `COMMENT ON COLUMN` com classe/propriedade/arquivo de origem.
   - Comentários `--` acima de cada tabela explicando a entity.
3. Tabelas de junção de `@ManyToMany` com `@JoinTable`.
4. `ALTER TABLE ... ADD CONSTRAINT FK_<TAB>_<COL> FOREIGN KEY (...) REFERENCES ...`
   no fim (independe da ordem de criação). Só o lado dono (`ManyToOne`, `OneToOne` com
   `@JoinColumn`); `OneToMany` vira só comentário (lado inverso).
   - Se a coluna de FK não está declarada como `@Column`, ela é criada na tabela com o
     tipo da PK referenciada.
   - Coluna referenciada: `referencedColumnName` ou a PK do destino.
   - **Destino é view ou não foi carregado** → FK emitida **comentada** com o motivo.
5. `CREATE INDEX` para `@Index`.
6. Seção final **"Views encontradas (sem DDL)"**: lista de cada view com suas colunas
   em comentário.

Nomes de constraint truncados a 128 caracteres (limite Oracle 12.2+).

### Saída
Painel com o SQL (realce de sintaxe opcional), botões **Copiar** e **Baixar `.sql`**.
Painel de avisos agrupados (tamanho presumido, FK para view, destino ausente, tipo
desconhecido) com link para a entity.

## Interface

Modo **Operate** (ferramenta de tarefa): a ferramenta deve sumir na tarefa. Clareza,
consistência e padrões conhecidos acima de expressão; acabamento nos detalhes.
Base: skills `ui-craft` (`operate.md`, `craft-floor.md`, `layout.md`) e
`web-design-guidelines` (Vercel).

### Estrutura: uma página, três etapas visíveis
Sem rotas nem modais. Um indicador de etapas no topo (**1 Carregar · 2 Revisar · 3 Script**)
mostra onde o usuário está; cada etapa ocupa a área principal e o usuário pode voltar
sem perder o que fez.

```
┌───────────────────────────────────────────────────────────────┐
│ TypeORM → DDL Oracle          ① Carregar  ② Revisar  ③ Script │
├───────────────────────────────────────────────────────────────┤
│  [ Selecionar pasta do projeto ]   ou arraste arquivos .ts aqui│
│                                                               │
│  71 entities em 68 arquivos  ● 12 Pode gerar  ● 6 Suposições  │
│                              ● 1 Comentado   ● 52 Não é possível│
│  [Buscar…]  [Status ▾]  [Schema ▾]                            │
│  ☑ ● Pode gerar      Marca   LOJA  3 col  │
│  ☑ ● Suposições      AppNoticias  ▸ 3 VARCHAR2 sem tamanho     │
│  ☐ ● Comentado       LogAcesso     ▸ @Entity comentado          │
│  ☐ ● Não é possível  AnexoPedido ▸ view, sem SELECT        │
│                                   18 selecionadas [Gerar script]│
└───────────────────────────────────────────────────────────────┘
```

### Etapa 1 — Carregar
- Estado vazio que **ensina**: uma frase dizendo o que a ferramenta faz e as duas formas
  de entrada (pasta ou arquivos), com o drop zone ocupando a área. Nada de "nenhum dado".
- Drop zone com realce ao arrastar por cima; aceita soltar pasta ou arquivos.
- Durante a leitura: barra de progresso fina com contagem ("Lendo 34 de 68 arquivos…"),
  linhas-esqueleto da lista em vez de spinner no meio da tela. Ao terminar, vai sozinho
  para a etapa 2.

### Etapa 2 — Revisar (lista)
- Resumo por status no topo funciona como **filtro clicável** (clicar em "52 Não é
  possível" filtra a lista).
- Busca por classe/tabela, filtro por schema. Ordenação padrão: 🟢, 🟡, ⚪, 🔴.
- Linha expansível (▸) mostra os detalhes: colunas mapeadas (nome → tipo Oracle),
  relações e cada suposição/motivo. Sem modal.
- **Bolinha de status**: círculo desenhado em CSS (não emoji) + texto do status; a cor
  nunca é a única informação. Cores com contraste ≥ 3:1 contra o fundo em claro e escuro.
- Barra de ação fixa no rodapé: "N selecionadas" + **Gerar script** (botão primário, o
  único destaque de cor da tela). Desabilitado com explicação quando nada está marcado.
- Selecionar todos / nenhum por status.

### Etapa 3 — Script
- Opção "Oracle 11g (usar SEQUENCE)" junto ao script; alterar regenera na hora.
- SQL em fonte monoespaçada (aqui o mono é legítimo: é código), com realce leve de
  sintaxe e números de linha.
- Painel lateral de avisos agrupados; clicar num aviso rola o SQL até o trecho.
- **Copiar** (feedback "Copiado" por 2 s, anunciado via `aria-live`) e **Baixar .sql**
  (nome `ddl-<schema-ou-projeto>-<data>.sql`).

### Visual
- Uma família sans (system-ui) para toda a UI; mono só no SQL e em nomes de tabela/coluna.
- Escala tipográfica contida (razão ~1.2, em rem); `tabular-nums` nas contagens.
- Cor contida: neutros + um acento para ação primária e seleção; as quatro cores de
  status são o único outro uso de cor. Sem gradientes, sem glass, sem cards aninhados.
- Tema claro/escuro seguindo o sistema (`prefers-color-scheme`), com alternância manual
  lembrada em `localStorage`.
- Escala de espaçamento base 4 px; grupos próximos, separações generosas.
- Movimento só para estado (expandir linha, trocar de etapa, realce do drop zone):
  150–250 ms, ease-out; respeita `prefers-reduced-motion`.

### Acessibilidade e detalhes
- Tudo operável por teclado; foco visível (`:focus-visible`) em todos os controles.
- Elementos semânticos (`<button>`, `<table>`, `<label>`), checkboxes com área de clique
  no rótulo inteiro.
- Mensagens assíncronas (leitura concluída, copiado, erros) em região `aria-live`.
- Erros dizem o problema e o que fazer ("Arquivo X não pôde ser lido: sintaxe inválida
  na linha 12. Os demais foram carregados.").
- Seleção de texto, scrollbars e anel de foco tematizados pela paleta.
- Funciona a partir de 1024 px de largura (uso em desktop); abaixo disso a lista vira
  linhas empilhadas.

## Stack (decisões do implementador, revisáveis)
- Vite + TypeScript, sem framework de UI (página pequena) — ou Preact se a listagem
  crescer.
- `typescript` como dependência de runtime para o parser.
- `vite-plugin-singlefile` para gerar um único `index.html` que abre via `file://`.
- Testes: Vitest para parser e gerador, com fixtures com entities fictícias de exemplo
  (domínio de loja: Produto, Categoria, Marca, Cliente…).
- Projeto independente: `typeorm-ddl-generator`. Funciona com qualquer projeto TypeORM;
  nada no código depende de um projeto específico.

## Deixado para o implementador
- Layout visual exato da página.
- Formatação/indentação do SQL.
- Estratégia de nomes quando duas entities apontam para a mesma tabela (avisar e
  gerar só uma).

## Decisões tomadas por mim (Claude), para revisão
- `VARCHAR2(255)` como tamanho padrão quando não informado.
- `GENERATED BY DEFAULT AS IDENTITY` como padrão (usuário acredita ser Oracle 12c+), com
  opção na tela para `SEQUENCE` — barato e cobre outros usuários em bancos antigos.
- Status 🟡 "com suposições" acrescentado aos três pedidos pelo usuário (🟢/⚪/🔴).
- Um único arquivo `.sql`, dividido por schema em seções comentadas.
- FKs inválidas (para views/ausentes) saem comentadas em vez de omitidas.
- Views aparecem só como comentário listando colunas.

## Adendo (2026-11-13): revisão das suposições

Pedido do usuário: liberar a correção individual das suposições; entity com tudo
resolvido muda para o status **Revisado**.

- Novo status 🔵 **Revisado** (azul, com texto): todas as suposições da entity foram
  corrigidas ou aceitas. Enquanto faltar alguma, continua 🟡 com "N de M resolvidas".
  Revisado conta como selecionável para o script.
- Na linha expandida, cada suposição vira um controle:
  - `VARCHAR2` sem tamanho → campo numérico;
  - tipo não definido/não reconhecido → campo de tipo Oracle;
  - nome de coluna não informado → campo de texto;
  - FK com tipo diferente (ORA-02267) → "usar o tipo da PK de destino" ou "manter comentada";
  - demais (destino não carregado, view, tabela duplicada, nome derivado…) → só **Aceitar**.
  Toda suposição também pode ser simplesmente **aceita** como está.
- **Aplicar em lote**: "aplicar N a todos os VARCHAR2 sem tamanho" por entity e para todas
  as entities; "aceitar as demais suposições" por entity; "desfazer revisão" por entity.
- **Corrigir no código**: para cada valor corrigido, o trecho do decorator pronto para colar
  (ex.: `@Column('varchar2', { name: 'NOME_CAR', length: 100 })`), com botão copiar.
- No SQL: `-- Revisado: <o que foi decidido>` no lugar do `-- ATENÇÃO:` resolvido.
- Persistência (decisão do Claude, usuário não escolheu): correções salvas no `localStorage`
  por `arquivo#Classe`; voltam ao carregar a mesma pasta. Sem storage, valem até fechar a aba.
