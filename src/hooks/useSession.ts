import { useMemo, useState } from 'react';
import { buildReports } from '../lib/analysis/classify';
import { generateDdl } from '../lib/ddl/generate';
import { looksLikeEntity, type SourceFile } from '../lib/io/files';
import type { EntityReport, Overrides, ParsedFile } from '../lib/model';
import { parseFile } from '../lib/parser/parseFile';
import { loadOverrides, saveOverrides } from '../lib/storage';
import { findUsages } from '../lib/usages';

/** Status que podem entrar no script. */
export const isSelectable = (r: EntityReport) => r.status === 'ok' || r.status === 'revised' || r.status === 'assumptions';

/** Soma listas pelo caminho: o mesmo caminho substitui o anterior. */
function mergeBy<T>(old: T[], add: T[], key: (x: T) => string) {
  const map = new Map(old.map((x) => [key(x), x]));
  for (const x of add) map.set(key(x), x);
  return [...map.values()];
}

/**
 * Estado da sessão: arquivos lidos, correções do usuário, entities marcadas e o
 * último script. A análise (status e suposições) é recalculada a cada mudança.
 */
export function useSession() {
  const [sources, setSources] = useState<SourceFile[]>([]);
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [overrides, setOverrides] = useState<Overrides>(loadOverrides);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [source, setSource] = useState('');
  const [oracle11g, setOracle11g] = useState(false);
  const [sql, setSql] = useState('');

  const analysis = useMemo(() => buildReports(files, overrides), [files, overrides]);
  const usages = useMemo(() => findUsages(sources, files.flatMap((f) => f.entities)), [sources, files]);

  /**
   * Soma os arquivos lidos: os que têm entity são interpretados e todos entram na
   * busca de usos. Devolve quantas entities há agora e quantos arquivos tinham entity.
   */
  function addFiles(read: SourceFile[], failures: { path: string; error: string }[], label: string) {
    const parsed: ParsedFile[] = read.filter((s) => looksLikeEntity(s.text)).map((s) => parseFile(s.path, s.text));
    for (const f of failures) parsed.push({ file: f.path, entities: [], commented: [], error: f.error });
    const nextFiles = mergeBy(files, parsed, (f) => f.file);
    const next = buildReports(nextFiles, overrides).reports;

    // Novas entities que podem gerar entram marcadas; as que o usuário desmarcou continuam desmarcadas.
    const previous = new Set(analysis.reports.map((r) => r.id));
    const ids = new Set(next.map((r) => r.id));
    const sel = new Set([...selected].filter((id) => ids.has(id)));
    for (const r of next) if (isSelectable(r) && !previous.has(r.id)) sel.add(r.id);

    setSources(mergeBy(sources, read, (s) => s.path));
    setFiles(nextFiles);
    setSelected(sel);
    setSource(source && source !== label ? `${source} + ${label}` : label);
    return { entities: next.length, files: parsed.length };
  }

  /** Aplica uma correção (as funções de `analysis/overrides` alteram o objeto) e salva. */
  function editOverrides(change: (o: Overrides) => void) {
    const next = structuredClone(overrides);
    change(next);
    saveOverrides(next);
    setOverrides(next);
  }

  /** Limpa a sessão; as correções salvas continuam guardadas. */
  function clearAll() {
    setSources([]);
    setFiles([]);
    setSelected(new Set());
    setSource('');
    setSql('');
  }

  function buildSql(use11g = oracle11g) {
    const chosen = analysis.reports.filter((r) => (isSelectable(r) && selected.has(r.id)) || r.kind === 'view');
    const text = generateDdl(chosen, analysis.registry, { oracle11g: use11g, overrides }, { source });
    setSql(text);
    return text;
  }

  function toggle11g(on: boolean) {
    setOracle11g(on);
    buildSql(on);
  }

  return { files, reports: analysis.reports, usages, overrides, selected, setSelected, source, oracle11g, sql, addFiles, editOverrides, clearAll, buildSql, toggle11g };
}

export type Session = ReturnType<typeof useSession>;
