# DDL Generator

Gera scripts DDL Oracle (`CREATE TABLE`, PKs, FKs, índices, `COMMENT ON`) a partir das
entities TypeORM de um projeto — **direto no navegador, sem banco, sem servidor e sem instalar nada**.
Nada sai do seu computador.

## Usar

Baixe (ou clone) a pasta e abra o `index.html` com dois cliques. Depois, siga as 3 etapas:

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
   A opção *OWNER.TABELA* (ligada por padrão) usa o `schema` declarado na entity
   como owner de tabelas, FKs, sequences e índices; a própria opção lista as
   tabelas sem `schema`, que ficam sem owner (usuário conectado).

No script, `-- ATENÇÃO:` marca todo valor presumido, `-- Revisado:` o que você decidiu, e FKs
que o Oracle recusaria (destino é view, não carregado ou tipo diferente — ORA-02267) saem
comentadas com `-- MOTIVO:`.

## Como é feito

HTML, CSS e JavaScript puros: sem dependências, sem build, sem framework.

```
index.html        carrega os CSS e os scripts, nesta ordem
css/              base (cores e tema), layout e um arquivo por etapa
js/model.js       tipos (JSDoc) e rótulos de status
js/parser/        lê o código: tokens → valores → entities
js/ddl/           tipos Oracle, nomes, plano de cada tabela e geração do SQL
js/analysis/      status de cada entity, correções do usuário e onde cada entity é usada
js/io/            leitura dos arquivos escolhidos
js/ui/            interface: uma etapa por arquivo
tests/            testes (node --test) e entities fictícias de exemplo
```

Os scripts são clássicos (sem `type="module"`, que o navegador bloqueia ao abrir do disco)
e cada um se registra em `window.DDL`. Por isso a **ordem no `index.html` importa**: um
arquivo novo entra depois dos que ele usa. Os testes carregam a mesma lista.

## Testar

Requer Node 18+ (só para os testes; quem usa a ferramenta não precisa):

```bash
npm test        # ou: node --test
```

## Licença

[MIT](LICENSE) © 2026 Miguelzvd
