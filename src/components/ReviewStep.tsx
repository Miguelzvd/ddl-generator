import { useState, type ReactNode } from 'react';
import { applyLengthToAll, countOpen } from '../lib/analysis/overrides';
import { safeId } from '../lib/browser';
import { STATUS_LABEL, type EntityReport, type Overrides, type Status } from '../lib/model';
import { isSelectable, type Session } from '../hooks/useSession';
import { EntityDetails } from './EntityDetails';
import { Icon, StatusDot } from './Icon';
import './ReviewStep.css';

const STATUS_ORDER: Status[] = ['ok', 'revised', 'assumptions', 'commented', 'impossible'];
const NO_SCHEMA = '(sem schema)';
const COLS = 8;

/** Aplica uma correção e avisa o leitor de tela. */
export type ChangeFn = (change: (o: Overrides) => void, msg: string) => void;

interface Props {
  session: Session;
  announce: (msg: string) => void;
  copy: (text: string) => Promise<void>;
  onAddFiles: () => void;
  onGenerate: () => void;
}

/** Ordem por status, calculada ao abrir a lista (não muda enquanto o usuário edita). */
function statusOrder(reports: EntityReport[]) {
  const sorted = [...reports].sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || a.tableName.localeCompare(b.tableName));
  return new Map(sorted.map((r, i) => [r.id, i]));
}

/** Etapa 2 — Revisar: lista de entities com status, filtros, detalhes e correções. */
export function ReviewStep({ session, announce, copy, onAddFiles, onGenerate }: Props) {
  const { reports, selected, setSelected } = session;
  const [order] = useState(() => statusOrder(reports));
  const [statusFilter, setStatusFilter] = useState<Set<Status>>(new Set());
  const [schemaFilter, setSchemaFilter] = useState('');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [bulkLength, setBulkLength] = useState('255');

  const change: ChangeFn = (fn, msg) => {
    session.editOverrides(fn);
    announce(msg);
  };

  const q = query.trim().toLowerCase();
  const schema = schemaFilter === NO_SCHEMA ? '' : schemaFilter;
  const visible = reports
    .filter((r) => statusFilter.size === 0 || statusFilter.has(r.status))
    .filter((r) => !schemaFilter || (r.schema ?? '') === schema)
    .filter((r) => !q || [r.className, r.tableName, r.file].some((s) => s.toLowerCase().includes(q)))
    .sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));

  const counts: Record<Status, number> = { ok: 0, revised: 0, assumptions: 0, commented: 0, impossible: 0 };
  for (const r of reports) counts[r.status]++;
  const selectedCount = reports.filter((r) => isSelectable(r) && selected.has(r.id)).length;
  const schemas = [...new Set(reports.map((r) => r.schema ?? NO_SCHEMA))].sort();
  const openLengths = countOpen(reports, 'varchar-length');
  const lengthEntities = reports.filter((r) => r.assumptions.some((a) => a.kind === 'varchar-length' && !a.resolved)).length;

  const toggleIn = <T,>(set: Set<T>, v: T) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    return next;
  };
  const mark = (on: boolean) => {
    const next = new Set(selected);
    for (const r of visible) {
      if (on && isSelectable(r)) next.add(r.id);
      if (!on) next.delete(r.id);
    }
    setSelected(next);
  };
  const clearFilters = () => {
    setStatusFilter(new Set());
    setQuery('');
    setSchemaFilter('');
  };
  const applyBulk = () => {
    const n = Math.trunc(Number(bulkLength));
    if (!(n > 0)) return;
    let done = 0;
    session.editOverrides((o) => (done = applyLengthToAll(o, reports, n)));
    announce(`${done} colunas receberam tamanho ${n}.`);
  };
  const generate = () => {
    session.buildSql();
    announce('Script gerado.');
    onGenerate();
  };

  return (
    <div className="stack review">
      <div className="review-head">
        <div>
          <h2>Revise as entities encontradas</h2>
          <p className="muted">
            {reports.length} entities em {session.files.length} arquivos · {session.source}
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={onAddFiles}>
          <Icon name="upload" />
          Adicionar arquivos
        </button>
      </div>

      <div className="chips" role="group" aria-label="Filtrar por status">
        {STATUS_ORDER.filter((s) => s !== 'revised' || counts.revised > 0).map((s) => (
          <button key={s} type="button" className="chip" aria-pressed={statusFilter.has(s)} onClick={() => setStatusFilter(toggleIn(statusFilter, s))}>
            <StatusDot status={s} />
            <span className="num">{counts[s]}</span>
            <span>{STATUS_LABEL[s]}</span>
          </button>
        ))}
      </div>

      {openLengths > 0 && (
        <div className="bulkbar">
          <StatusDot status="assumptions" />
          <label htmlFor="bulk-all">
            <strong className="num">{openLengths}</strong> VARCHAR2 sem tamanho em {lengthEntities} entities. Tamanho para todos:
          </label>
          <input id="bulk-all" type="number" className="input input-sm" min="1" max="32767" inputMode="numeric" value={bulkLength} onChange={(e) => setBulkLength(e.target.value)} />
          <button type="button" className="btn btn-sm" onClick={applyBulk}>
            Aplicar em todas
          </button>
        </div>
      )}

      <div className="toolbar">
        <label className="search">
          <Icon name="search" />
          <input type="search" className="input" placeholder="Buscar classe, tabela ou arquivo…" aria-label="Buscar" value={query} autoComplete="off" spellCheck={false} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <select className="input select" aria-label="Filtrar por schema" value={schemaFilter} onChange={(e) => setSchemaFilter(e.target.value)}>
          <option value="">Todos os schemas</option>
          {schemas.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <div className="spacer" />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => mark(true)}>
          Marcar visíveis
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => mark(false)}>
          Desmarcar visíveis
        </button>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="c-check">
                <span className="sr-only">Incluir</span>
              </th>
              <th className="c-exp">
                <span className="sr-only">Detalhes</span>
              </th>
              <th>Status</th>
              <th>Classe</th>
              <th>Tabela</th>
              <th>Schema</th>
              <th className="right">Col.</th>
              <th>Arquivo</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={COLS} className="empty">
                  Nenhuma entity corresponde aos filtros.{' '}
                  <button type="button" className="link" onClick={clearFilters}>
                    Limpar filtros
                  </button>
                </td>
              </tr>
            )}
            {visible.map((r) => (
              <EntityRow
                key={r.id}
                r={r}
                checked={selected.has(r.id)}
                open={expanded.has(r.id)}
                onCheck={() => setSelected(toggleIn(selected, r.id))}
                onToggle={() => setExpanded(toggleIn(expanded, r.id))}
              >
                <EntityDetails r={r} overrides={session.overrides} change={change} copy={copy} />
              </EntityRow>
            ))}
          </tbody>
        </table>
      </div>

      <div className="actionbar">
        <p>
          <span className="num">{selectedCount}</span> selecionadas para o script
        </p>
        <span className="hint">{selectedCount === 0 ? 'Marque ao menos uma entity para gerar.' : ''}</span>
        <div className="spacer" />
        <button type="button" className="btn btn-primary" disabled={selectedCount === 0} onClick={generate}>
          Gerar script
        </button>
      </div>
    </div>
  );
}

interface RowProps {
  r: EntityReport;
  checked: boolean;
  open: boolean;
  onCheck: () => void;
  onToggle: () => void;
  children: ReactNode;
}

function EntityRow({ r, checked, open, onCheck, onToggle, children }: RowProps) {
  const selectable = isSelectable(r);
  const done = r.assumptions.filter((a) => a.resolved).length;
  const progress = r.status === 'assumptions' && done > 0 ? `${done} de ${r.assumptions.length} resolvidas · ` : '';
  const detailsId = safeId(`det-${r.id}`);
  return (
    <>
      <tr className={`row-${r.status}${open ? ' is-open' : ''}`}>
        <td className="c-check">
          <input type="checkbox" checked={selectable && checked} disabled={!selectable} aria-label={`Incluir ${r.className} no script`} onChange={onCheck} />
        </td>
        <td className="c-exp">
          <button type="button" className="btn-expand" aria-expanded={open} aria-controls={detailsId} aria-label={`${open ? 'Ocultar' : 'Ver'} detalhes de ${r.className}`} onClick={onToggle}>
            <Icon name="chevron" />
          </button>
        </td>
        <td className="c-status">
          <span className="status">
            <StatusDot status={r.status} />
            {STATUS_LABEL[r.status]}
          </span>
        </td>
        <td>
          <div className="cls">{r.className}</div>
          {r.reasons[0] && <span className="reason">{progress + r.reasons[0] + (r.reasons.length > 1 ? ` (+${r.reasons.length - 1})` : '')}</span>}
        </td>
        <td className="mono">{r.tableName}</td>
        <td className="mono muted">{r.schema ?? '—'}</td>
        <td className="num right">{r.entity ? r.columnCount : '—'}</td>
        <td className="file muted" title={r.file}>
          {r.file}
        </td>
      </tr>
      {open && (
        <tr className="details" id={detailsId}>
          <td colSpan={COLS}>{children}</td>
        </tr>
      )}
    </>
  );
}
