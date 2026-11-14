# DDL Generator

Gera scripts DDL Oracle (`CREATE TABLE`, PKs, FKs, índices, `COMMENT ON`) a partir das
entities TypeORM de um projeto — **direto no navegador, sem banco e sem servidor**.
Nada sai do seu computador.

## Usar

Abra `dist/index.html` (duplo clique) e siga as 3 etapas:

1. **Carregar** — selecione a pasta do projeto (ou arraste arquivos `.ts`).
   `node_modules`, `dist`, `build`, `.git` e `.d.ts` são ignorados.
2. **Revisar** — toda entity encontrada aparece com um status:
   - 🟢 **Pode gerar** — tem tudo que o DDL precisa
   - 🟡 **Pode gerar, com suposições** — gera, mas presume algo (ex.: `VARCHAR2` sem tamanho → 255)
   - ⚪ **Comentado** — o `@Entity` está comentado no código
   - 🔴 **Não é possível gerar** — view (sem o SELECT), sem colunas ou erro de leitura
3. **Script** — copie ou baixe o `.sql`. A opção *Oracle 11g* troca `IDENTITY` por
   `SEQUENCE` e limita nomes a 30 caracteres.

No script, `-- ATENÇÃO:` marca todo valor presumido e FKs que o Oracle recusaria
(destino é view, não carregado ou tipo diferente — ORA-02267) saem comentadas com `-- MOTIVO:`.

## Desenvolver

```bash
pnpm install
pnpm dev      # http://localhost:5173
pnpm test     # testes (Vitest)
pnpm build    # gera dist/index.html (arquivo único, pronto para distribuir)
```

Estrutura: `src/parser` (lê o AST com o compilador TypeScript) → `src/analysis`
(status de cada entity) → `src/ddl` (plano e geração do SQL) → `src/ui` (interface).
