export interface SourceFile {
  path: string;
  text: string;
}

const IGNORED_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '.next', 'out']);

/** O caminho é um .ts que vale a pena ler? */
export function isCandidatePath(path: string): boolean {
  const parts = path.replace(/\\/g, '/').split('/');
  const name = parts[parts.length - 1];
  if (!name.endsWith('.ts') || name.endsWith('.d.ts')) return false;
  return !parts.slice(0, -1).some((p) => IGNORED_DIRS.has(p));
}

/** Filtro rápido antes do parse: só arquivos que mencionam @Entity( ou @ViewEntity(. */
export function looksLikeEntity(text: string): boolean {
  return /@(Entity|ViewEntity)\s*\(/.test(text);
}

export function filePath(f: File): string {
  return (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
}

/**
 * Lê os arquivos candidatos. `onProgress(lidos, total)` é chamado a cada arquivo;
 * cede a vez ao navegador para a barra de progresso andar.
 */
export async function readFileList(
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<{ sources: SourceFile[]; failures: { path: string; error: string }[] }> {
  const candidates = files.filter((f) => isCandidatePath(filePath(f)));
  const sources: SourceFile[] = [];
  const failures: { path: string; error: string }[] = [];
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

/** Arquivos (inclusive de pastas) soltos numa área de drop. */
export async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const entries = [...dt.items]
    .map((it) => (typeof it.webkitGetAsEntry === 'function' ? it.webkitGetAsEntry() : null))
    .filter((e): e is FileSystemEntry => !!e);
  if (!entries.length) return [...dt.files];

  const out: File[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
      const rel = `${prefix}${file.name}`;
      if (!isCandidatePath(rel)) return;
      Object.defineProperty(file, 'webkitRelativePath', { value: rel });
      out.push(file);
      return;
    }
    if (entry.isDirectory) {
      if (IGNORED_DIRS.has(entry.name)) return;
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      let batch: FileSystemEntry[];
      do {
        batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
        for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
      } while (batch.length);
    }
  };
  for (const e of entries) await walk(e, '');
  return out;
}
