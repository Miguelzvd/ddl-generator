/**
 * Etapa 1 — Carregar: escolher pasta/arquivos ou arrastar, com barra de progresso.
 *
 * @typedef {object} AppCtx
 * @property {import('./state.js').AppState} state
 * @property {(step: 1 | 2 | 3) => void} go
 * @property {() => void} render
 * @property {(msg: string) => void} announce
 * @property {(text: string) => Promise<void>} copyText
 * @property {() => string} buildSql
 */
(function (DDL) {
  'use strict';

  const { h, icon } = DDL.ui.dom;
  const { readFileList, filesFromDataTransfer } = DDL.files;
  const { parseFile } = DDL.parser;
  const { addFiles, clearAll } = DDL.ui.state;

  /** Lê, interpreta e soma os arquivos; vai para a revisão se achou entities. */
  async function ingest(ctx, files, label) {
    const { state } = ctx;
    if (!files.length) return;
    state.loading = { done: 0, total: files.length };
    ctx.render();
    const { sources, failures } = await readFileList(files, (done, total) => {
      state.loading = { done, total };
      updateProgress(state);
    });
    const parsed = sources.map((s) => parseFile(s.path, s.text));
    for (const f of failures) parsed.push({ file: f.path, entities: [], commented: [], error: f.error });
    state.loading = undefined;
    addFiles(state, parsed, label);
    const n = state.analysis.reports.length;
    if (n === 0) {
      ctx.render();
      ctx.announce('Nenhuma entity TypeORM encontrada nos arquivos selecionados.');
      return;
    }
    ctx.announce(`${n} entities encontradas em ${parsed.length} arquivos.`);
    ctx.go(2);
  }

  function updateProgress(state) {
    const el = document.getElementById('load-progress');
    if (!el || !state.loading) return;
    const { done, total } = state.loading;
    el.querySelector('.progress-fill').style.transform = `scaleX(${total ? done / total : 0})`;
    el.querySelector('.progress-label').textContent = `Lendo ${done} de ${total} arquivos…`;
  }

  function dropZone(ctx) {
    const hidden = { type: 'file', class: 'sr-only', multiple: true, tabindex: '-1', 'aria-hidden': 'true' };
    const folderInput = h('input', { ...hidden, webkitdirectory: true });
    const filesInput = h('input', { ...hidden, accept: '.ts' });
    folderInput.addEventListener('change', () => {
      const list = [...(folderInput.files ?? [])];
      const top = list[0]?.webkitRelativePath?.split('/')[0] ?? 'pasta';
      void ingest(ctx, list, `pasta ${top}`);
    });
    filesInput.addEventListener('change', () => {
      const list = [...(filesInput.files ?? [])];
      void ingest(ctx, list, `${list.length} arquivo(s)`);
    });

    const drop = h(
      'section',
      { class: 'drop', 'aria-labelledby': 'drop-title' },
      h('div', { class: 'drop-icon' }, icon('upload', 28)),
      h('h2', { id: 'drop-title' }, 'Carregue as entities do seu projeto'),
      h(
        'p',
        { class: 'muted measure' },
        'Selecione a pasta do projeto (ou só a pasta das entities) e a ferramenta encontra sozinha os arquivos com @Entity e @ViewEntity. Se preferir, arraste arquivos .ts para cá. Nada sai do seu computador.',
      ),
      h(
        'div',
        { class: 'drop-actions' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => folderInput.click() }, icon('folder', 18), 'Selecionar pasta do projeto'),
        h('button', { type: 'button', class: 'btn', onclick: () => filesInput.click() }, icon('file', 18), 'Selecionar arquivos'),
      ),
      h('p', { class: 'hint' }, 'Ignorados automaticamente: node_modules, dist, build, .git e arquivos .d.ts.'),
      folderInput,
      filesInput,
    );

    // dragenter/dragleave disparam também nos filhos: conta a profundidade.
    let depth = 0;
    drop.addEventListener('dragenter', (e) => {
      e.preventDefault();
      depth++;
      drop.classList.add('is-over');
    });
    drop.addEventListener('dragover', (e) => e.preventDefault());
    drop.addEventListener('dragleave', () => {
      if (--depth <= 0) drop.classList.remove('is-over');
    });
    drop.addEventListener('drop', async (e) => {
      e.preventDefault();
      depth = 0;
      drop.classList.remove('is-over');
      if (!e.dataTransfer) return;
      const files = await filesFromDataTransfer(e.dataTransfer);
      void ingest(ctx, files, `${files.length} arquivo(s) arrastado(s)`);
    });
    return drop;
  }

  function progress() {
    return h(
      'div',
      { id: 'load-progress', class: 'progress', role: 'progressbar', 'aria-label': 'Lendo arquivos' },
      h('div', { class: 'progress-track' }, h('div', { class: 'progress-fill' })),
      h('p', { class: 'progress-label' }, 'Lendo arquivos…'),
    );
  }

  const skeleton = () => h('div', { class: 'skeleton', 'aria-hidden': 'true' }, ...Array.from({ length: 6 }, () => h('div', { class: 'skeleton-row' })));

  function loadedSummary(ctx) {
    const { state } = ctx;
    const clear = () => {
      clearAll(state);
      ctx.render();
      ctx.announce('Lista limpa.');
    };
    return h(
      'div',
      { class: 'loaded' },
      h('p', {}, h('strong', { class: 'num' }, String(state.analysis.reports.length)), ` entities carregadas de ${state.source}. Novos arquivos são somados a elas.`),
      h(
        'div',
        { class: 'row' },
        h('button', { type: 'button', class: 'btn btn-primary', onclick: () => ctx.go(2) }, 'Revisar lista'),
        h('button', { type: 'button', class: 'btn btn-ghost', onclick: clear }, icon('x'), 'Limpar tudo'),
      ),
    );
  }

  /** @param {AppCtx} ctx */
  function renderLoad(ctx) {
    const { state } = ctx;
    const drop = dropZone(ctx);
    const wrap = h('div', { class: 'stack' }, drop);
    if (state.loading) {
      drop.classList.add('is-busy');
      wrap.append(progress(), skeleton());
      queueMicrotask(() => updateProgress(state));
    } else if (state.analysis.reports.length) {
      wrap.append(loadedSummary(ctx));
    } else if (state.files.length) {
      wrap.append(h('p', { class: 'notice', role: 'alert' }, 'Nenhuma entity TypeORM foi encontrada nos arquivos selecionados. Confira se a pasta contém classes com @Entity ou @ViewEntity.'));
    }
    return wrap;
  }

  DDL.ui.loadStep = { renderLoad };
})((globalThis.DDL = globalThis.DDL || {}));
