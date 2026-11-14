/**
 * Leitura dos arquivos escolhidos pelo usuário (pasta, arquivos ou arrastar e soltar).
 *
 * @typedef {{ path: string, text: string }} SourceFile
 */
(function (DDL) {
  'use strict';

  const IGNORED_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '.next', 'out']);

  /** O caminho é um .ts que vale a pena ler? */
  function isCandidatePath(path) {
    const parts = path.replace(/\\/g, '/').split('/');
    const name = parts[parts.length - 1];
    if (!name.endsWith('.ts') || name.endsWith('.d.ts')) return false;
    return !parts.slice(0, -1).some((p) => IGNORED_DIRS.has(p));
  }

  /** Filtro rápido antes de ler: só arquivos que mencionam @Entity( ou @ViewEntity(. */
  const looksLikeEntity = (text) => /@(Entity|ViewEntity)\s*\(/.test(text);

  /** @param {File} f */
  const filePath = (f) => f.webkitRelativePath || f.name;

  /**
   * Lê os arquivos candidatos. `onProgress(lidos, total)` é chamado a cada arquivo;
   * de 10 em 10 cede a vez ao navegador para a barra de progresso andar.
   *
   * @param {File[]} files
   * @param {(done: number, total: number) => void} [onProgress]
   * @returns {Promise<{ sources: SourceFile[], failures: { path: string, error: string }[] }>}
   */
  async function readFileList(files, onProgress) {
    const candidates = files.filter((f) => isCandidatePath(filePath(f)));
    const sources = [];
    const failures = [];
    let done = 0;
    for (const f of candidates) {
      const path = filePath(f);
      try {
        const text = await f.text();
        if (looksLikeEntity(text)) sources.push({ path, text });
      } catch (err) {
        failures.push({ path, error: err instanceof Error ? err.message : String(err) });
      }
      done++;
      onProgress?.(done, candidates.length);
      if (done % 10 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    return { sources, failures };
  }

  /**
   * Arquivos (inclusive de pastas) soltos numa área de drop.
   * @param {DataTransfer} dt
   * @returns {Promise<File[]>}
   */
  async function filesFromDataTransfer(dt) {
    const entries = [...dt.items]
      .map((it) => (typeof it.webkitGetAsEntry === 'function' ? it.webkitGetAsEntry() : null))
      .filter(Boolean);
    if (!entries.length) return [...dt.files];

    const out = [];
    const walk = async (entry, prefix) => {
      if (entry.isFile) {
        const file = await new Promise((res, rej) => entry.file(res, rej));
        const rel = `${prefix}${file.name}`;
        if (!isCandidatePath(rel)) return;
        Object.defineProperty(file, 'webkitRelativePath', { value: rel });
        out.push(file);
        return;
      }
      if (entry.isDirectory) {
        if (IGNORED_DIRS.has(entry.name)) return;
        const reader = entry.createReader();
        let batch;
        do {
          batch = await new Promise((res, rej) => reader.readEntries(res, rej));
          for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
        } while (batch.length);
      }
    };
    for (const e of entries) await walk(e, '');
    return out;
  }

  DDL.files = { isCandidatePath, looksLikeEntity, filePath, readFileList, filesFromDataTransfer };
})((globalThis.DDL = globalThis.DDL || {}));
