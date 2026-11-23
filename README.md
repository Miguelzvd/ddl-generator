# DDL Generator

Gera scripts DDL Oracle (`CREATE TABLE`, PKs, FKs, índices, `COMMENT ON`) a partir das
entities TypeORM de um projeto — **direto no navegador, sem banco de dados**.
Os arquivos são lidos no próprio navegador: nada sai do seu computador.

## Usar

Abra a página e siga as 3 etapas:

1. **Carregar** — selecione a pasta do projeto (ou arraste arquivos `.ts`).
   `node_modules`, `dist`, `build`, `.git` e `.d.ts` são ignorados.
2. **Revisar** — toda entity encontrada aparece com um status:
   - 🟢 **Pode gerar** — tem tudo que o DDL precisa
   - 🟡 **Pode gerar, com suposições** — gera, mas presume algo (ex.: `VARCHAR2` sem tamanho → 255)
   - 🔵 **Revisado** — as suposições foram corrigidas ou aceitas por você
   - ⚪ **Comentado** — o `@Entity` está comentado no código
   - 🔴 **Não é possível gerar** — view (sem o SELECT), sem colunas ou erro de leitura

   Abra uma linha para corrigir cada suposição (tamanho, tipo, nome de coluna/tabela, FK),
   aplicar um tamanho em lote ou copiar o decorator corrigido para colar na entity.
   Os detalhes mostram a linha de cada coluna e onde a entity é usada no projeto
   (`arquivo:linha`, que copia ao clicar).
   As correções ficam salvas neste navegador.
3. **Script** — copie ou baixe o `.sql`. A opção *Oracle 11g* troca `IDENTITY` por
   `SEQUENCE` e limita nomes a 30 caracteres. A opção *Bloco PL/SQL único* junta
   tudo num `BEGIN … END;` que roda de uma vez só (F5 ou `@arquivo.sql`) e pula
   os objetos que já existem, então dá para rodar de novo sem erro.

No script, `-- ATENÇÃO:` marca todo valor presumido, `-- Revisado:` o que você decidiu, e FKs
que o Oracle recusaria (destino é view, não carregado ou tipo diferente — ORA-02267) saem
comentadas com `-- MOTIVO:`.

## Desenvolver

Requer Node 20.19+ e pnpm.

```bash
pnpm install
pnpm dev       # http://localhost:5173
pnpm test      # testes (Vitest)
pnpm build     # typecheck + build em dist/
pnpm preview   # serve o dist/ localmente
```

## Publicar

`pnpm build` gera um site estático em `dist/` (HTML, JS e CSS). Basta servir essa pasta em
qualquer servidor web (Nginx, Apache, Vercel, Netlify, GitHub Pages…); não há backend.

## Estrutura

Projeto Vite + React + TypeScript (template `react-ts`):

```
index.html             página base do Vite (#root)
src/main.tsx           monta o <App />
src/App.tsx            topo, etapas e tema
src/components/        uma etapa por componente (LoadStep, ReviewStep, ScriptStep),
                       detalhes da entity e editor de suposições (só .tsx)
src/hooks/             useSession (arquivos, correções, seleção, script) e useTheme
src/styles/            todo o CSS: index.css importa os demais na ordem
                       (base → layout → uma folha por etapa)
src/lib/               lógica pura, sem React:
  parser/              lê o código: tokens → valores → entities
  ddl/                 tipos Oracle, nomes, plano de cada tabela e geração do SQL
  analysis/            status de cada entity e correções do usuário
  io/                  leitura dos arquivos escolhidos
  usages.ts            onde cada entity é usada no projeto
tests/                 testes da lógica e entities fictícias de exemplo
```

A versão em HTML + CSS + JS puros (sem build, abre com dois cliques) está guardada na
branch `js-vanilla`.

## Licença

[MIT](LICENSE) © 2026 Miguelzvd
