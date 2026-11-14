import { useMemo, useState } from 'react';
import { buildReports } from '../lib/analysis/classify';
import { generateDdl } from '../lib/ddl/generate';
import type { EntityReport, Overrides, ParsedFile } from '../lib/model';
import { loadOverrides, saveOverrides } from '../lib/storage';

/** Status que podem entrar no script. */
export const isSelectable = (r: EntityReport) => r.status === 'ok' || r.status === 'revised' || r.status === 'assumptions';

/**
 * Estado da sessão: arquivos lidos, correções do usuário, entities marcadas e o
 * último script. A análise (status e suposições) é recalculada a cada mudança.
 */
export function useSession() {
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [overrides, setOverrides] = useState<Overrides>(loadOverrides);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [source, setSource] = useState('');
  const [oracle11g, setOracle11g] = useState(false);
  const [sql, setSql] = useState('');

  const analysis = useMemo(() => buildReports(files, overrides), [files, overrides]);

  /** Soma novos arquivos (o mesmo caminho substitui o anterior); devolve quantas entities há. */
  function addFiles(parsed: ParsedFile[], label: string) {
    const byPath = new Map(files.map((f) => [f.file, f]));
    for (const p of parsed) byPath.set(p.file, p);
    const nextFiles = [...byPath.values()];
    const next = buildReports(nextFiles, overrides).reports;

    // Novas entities que podem gerar entram marcadas; as que o usuário desmarcou continuam desmarcadas.
    const previous = new Set(analysis.reports.map((r) => r.id));
    const ids = new Set(next.map((r) => r.id));
    const sel = new Set([...selected].filter((id) => ids.has(id)));
    for (const r of next) if (isSelectable(r) && !previous.has(r.id)) sel.add(r.id);

    setFiles(nextFiles);
    setSelected(sel);
    setSource(source && source !== label ? `${source} + ${label}` : label);
    return next.length;
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

  return { files, reports: analysis.reports, overrides, selected, setSelected, source, oracle11g, sql, addFiles, editOverrides, clearAll, buildSql, toggle11g };
}

export type Session = ReturnType<typeof useSession>;
