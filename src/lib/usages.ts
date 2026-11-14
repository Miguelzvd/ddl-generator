/**
 * Onde cada entity é usada no projeto: linhas que citam o nome da classe
 * (repositórios, services, tipos, outras entities…), fora imports e comentários.
 */
import type { SourceFile } from './io/files';

export interface Usage {
  file: string;
  line: number;
  /** A linha do código, sem os espaços das pontas. */
  text: string;
}

/** Nome da classe → usos. */
export type UsageIndex = Map<string, Usage[]>;

const escapeRe = (s: string) => s.replace(/[$]/g, '\\$');

/**
 * @param sources   todos os arquivos lidos
 * @param entities  classe e arquivo de cada entity (o próprio arquivo não conta como uso)
 */
export function findUsages(sources: SourceFile[], entities: { className: string; file: string }[]): UsageIndex {
  const index: UsageIndex = new Map();
  const ownFiles = new Map<string, Set<string>>();
  for (const e of entities) {
    if (!ownFiles.has(e.className)) ownFiles.set(e.className, new Set());
    ownFiles.get(e.className)!.add(e.file);
    index.set(e.className, []);
  }
  if (!index.size) return index;

  const names = [...index.keys()].sort((a, b) => b.length - a.length).map(escapeRe);
  const re = new RegExp(`(?<![\\w$])(${names.join('|')})(?![\\w$])`, 'g');

  for (const src of sources) {
    let inImport = false;
    src.text.split(/\r?\n/).forEach((raw, i) => {
      const text = raw.trim();
      // Imports (inclusive os de várias linhas) e reexports só repetem o nome.
      if (inImport) {
        if (/\bfrom\s*['"]/.test(text)) inImport = false;
        return;
      }
      if (/^import\b/.test(text)) {
        if (!/\bfrom\s*['"]|^import\s*['"]|;\s*$/.test(text)) inImport = true;
        return;
      }
      if (/^export\b.*\bfrom\s*['"]/.test(text) || /^(\/\/|\/\*|\*)/.test(text)) return;

      const seen = new Set<string>();
      for (const m of text.matchAll(re)) {
        const name = m[1];
        if (seen.has(name) || ownFiles.get(name)!.has(src.path)) continue;
        seen.add(name);
        index.get(name)!.push({ file: src.path, line: i + 1, text });
      }
    });
  }
  return index;
}
