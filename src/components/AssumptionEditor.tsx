import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import * as ov from '../lib/analysis/overrides';
import { safeId } from '../lib/browser';
import type { Assumption, EntityReport, Overrides } from '../lib/model';
import { Icon } from './Icon';
import type { ChangeFn } from './ReviewStep';

const TYPEORM_TYPES = ['varchar2', 'nvarchar2', 'char', 'number', 'date', 'timestamp', 'clob', 'nclob', 'blob', 'boolean', 'float', 'raw'];

interface Props {
  r: EntityReport;
  overrides: Overrides;
  change: ChangeFn;
  copy: (text: string) => Promise<void>;
}

/**
 * Lista editável das suposições de uma entity: um campo por suposição,
 * "aceitar como está", ações em lote e os trechos para corrigir no código.
 */
export function AssumptionEditor({ r, overrides, change, copy }: Props) {
  const open = r.assumptions.filter((a) => !a.resolved);
  const resolved = r.assumptions.length - open.length;
  const snippets = [...new Set(r.assumptions.map((a) => a.snippet).filter((s): s is string => !!s))];
  const item = { r, overrides, change, copy };

  return (
    <div className="editor">
      <div className="editor-head">
        <h3>Suposições</h3>
        <span className="progress-pill num">
          {resolved} de {r.assumptions.length} resolvidas
        </span>
      </div>
      <BulkActions r={r} open={open} overrides={overrides} change={change} />
      <ul className="asm-list">
        {r.assumptions.map((a) => (
          <AssumptionItem key={a.key} a={a} {...item} />
        ))}
      </ul>
      {snippets.length > 0 && (
        <div className="code-fix">
          <div className="code-fix-head">
            <h3>Corrigir no código</h3>
            <button type="button" className="btn btn-sm" onClick={() => void copy(snippets.join('\n'))}>
              <Icon name="copy" size={14} />
              Copiar trechos
            </button>
          </div>
          <p className="hint">Substitua os decorators em {r.file} para que a próxima varredura já venha certa.</p>
          <pre className="code-block mono">{snippets.join('\n')}</pre>
        </div>
      )}
    </div>
  );
}

function AssumptionItem({ r, a, overrides, change, copy }: Props & { a: Assumption }) {
  const uid = (part: string) => safeId(`ed-${r.id}-${a.key}-${part}`);
  const accepted = overrides[r.id]?.accepted.includes(a.key) ?? false;
  return (
    <li className={`asm${a.resolved ? ' is-resolved' : ''}`}>
      <div className="asm-head">
        <span className={`asm-mark ${a.resolved ? 'ok' : 'open'}`} aria-hidden="true">
          {a.resolved && <Icon name="check" size={12} />}
        </span>
        <span className="sr-only">{a.resolved ? 'Resolvida: ' : 'Aberta: '}</span>
        {a.label && <span className="mono asm-label">{a.label}</span>}
        <span>{a.text}</span>
      </div>
      <div className="asm-controls">
        <Control r={r} a={a} overrides={overrides} change={change} uid={uid} />
        {a.kind !== 'fk-type' && (
          <label className="check" htmlFor={uid('ok')}>
            <input
              type="checkbox"
              id={uid('ok')}
              checked={accepted}
              onChange={(e) => change((o) => ov.setAccepted(o, r.id, a.key, e.target.checked), e.target.checked ? 'Suposição aceita.' : 'Suposição reaberta.')}
            />
            <span>Aceitar como está</span>
          </label>
        )}
      </div>
      {a.resolved && a.note && (
        <p className="asm-note">
          <strong>Revisado: </strong>
          {a.note}
        </p>
      )}
      {a.snippet && (
        <div className="snippet">
          <span className="snippet-label">Corrigir no código</span>
          <code className="mono">{a.snippet}</code>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Copiar trecho" onClick={() => void copy(a.snippet!)}>
            <Icon name="copy" size={14} />
          </button>
        </div>
      )}
    </li>
  );
}

interface ControlProps {
  r: EntityReport;
  a: Assumption;
  overrides: Overrides;
  change: ChangeFn;
  uid: (part: string) => string;
}

/** Campo de correção conforme o tipo da suposição. */
function Control({ r, a, overrides, change, uid }: ControlProps) {
  const eo = overrides[r.id];
  const colOv = a.column ? eo?.columns[a.column] : undefined;
  const column = a.column ?? '';

  switch (a.kind) {
    case 'varchar-length':
      return (
        <Field id={uid('len')} label="Tamanho">
          <CommitInput
            id={uid('len')}
            type="number"
            className="input input-sm"
            min="1"
            max="32767"
            inputMode="numeric"
            value={String(colOv?.length ?? '')}
            placeholder={a.current ?? '255'}
            onCommit={(v) => {
              const n = v === '' ? undefined : Math.trunc(Number(v));
              const length = n && n > 0 ? n : undefined;
              change((o) => ov.setColumn(o, r.id, column, { length }), length ? `Tamanho de ${a.label} definido como ${length}.` : `Tamanho de ${a.label} voltou ao presumido.`);
            }}
          />
        </Field>
      );
    case 'type':
      return (
        <div>
          <Field id={uid('type')} label="Tipo (TypeORM)">
            <CommitInput
              id={uid('type')}
              className="input input-sm mono"
              list={`${uid('type')}-list`}
              value={colOv?.type ?? ''}
              placeholder="ex.: varchar2…"
              onCommit={(v) => change((o) => ov.setColumn(o, r.id, column, { type: v.trim().toLowerCase() || undefined }), `Tipo de ${a.label} atualizado.`)}
            />
          </Field>
          <datalist id={`${uid('type')}-list`}>
            {TYPEORM_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </div>
      );
    case 'column-name':
      return (
        <Field id={uid('name')} label="Nome da coluna">
          <CommitInput
            id={uid('name')}
            className="input input-sm mono"
            value={colOv?.name ?? ''}
            placeholder={a.current ?? ''}
            onCommit={(v) => change((o) => ov.setColumn(o, r.id, column, { name: v.trim().toUpperCase() || undefined }), 'Nome da coluna atualizado.')}
          />
        </Field>
      );
    case 'table-name':
      return (
        <Field id={uid('table')} label="Nome da tabela">
          <CommitInput
            id={uid('table')}
            className="input input-sm mono"
            value={eo?.tableName ?? ''}
            placeholder={a.current ?? ''}
            onCommit={(v) => change((o) => ov.setTableName(o, r.id, v.trim().toUpperCase() || undefined), 'Nome da tabela atualizado.')}
          />
        </Field>
      );
    case 'fk-type':
      return <FkChoice r={r} a={a} current={eo?.fks[a.fkColumn ?? '']} change={change} name={uid('fk')} />;
    default:
      return null;
  }
}

/** FK com tipo diferente da PK: usar o tipo da PK ou manter comentada. */
function FkChoice({ r, a, current, change, name }: { r: EntityReport; a: Assumption; current?: 'adopt' | 'keep'; change: ChangeFn; name: string }) {
  const fk = a.fkColumn ?? '';
  const radio = (value: 'adopt' | 'keep', text: string) => (
    <label className="radio" htmlFor={`${name}-${value}`}>
      <input
        type="radio"
        id={`${name}-${value}`}
        name={name}
        value={value}
        checked={current === value}
        onChange={() => change((o) => ov.setFk(o, r.id, fk, value), value === 'adopt' ? `FK ${fk} vai usar o tipo da PK de destino.` : `FK ${fk} fica comentada.`)}
      />
      <span>{text}</span>
    </label>
  );
  return (
    <div className="radios" role="radiogroup" aria-label={`Decisão sobre a FK ${fk}`}>
      {radio('adopt', 'Usar o tipo da PK de destino')}
      {radio('keep', 'Manter comentada')}
      {current && (
        <button type="button" className="link" onClick={() => change((o) => ov.setFk(o, r.id, fk, undefined), 'Decisão da FK desfeita.')}>
          desfazer
        </button>
      )}
    </div>
  );
}

/** Tamanho em lote, "aceitar as restantes" e "desfazer revisão". */
function BulkActions({ r, open, overrides, change }: { r: EntityReport; open: Assumption[]; overrides: Overrides; change: ChangeFn }) {
  const [length, setLength] = useState('255');
  const openLengths = open.filter((a) => a.kind === 'varchar-length').length;
  const inputId = safeId(`bulk-${r.id}`);
  const apply = () => {
    const n = Math.trunc(Number(length));
    if (n > 0) change((o) => ov.applyLengthToEntity(o, r, n), `${openLengths} colunas receberam tamanho ${n}.`);
  };
  return (
    <div className="asm-actions">
      {openLengths > 0 && (
        <div className="bulk">
          <label htmlFor={inputId}>Tamanho para os {openLengths} VARCHAR2 sem tamanho desta entity:</label>
          <input id={inputId} type="number" className="input input-sm" min="1" max="32767" inputMode="numeric" value={length} onChange={(e) => setLength(e.target.value)} />
          <button type="button" className="btn btn-sm" onClick={apply}>
            Aplicar
          </button>
        </div>
      )}
      {(open.length > 0 || overrides[r.id]) && (
        <div className="row">
          {open.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => change((o) => ov.acceptRemaining(o, r), 'Demais suposições aceitas.')}>
              <Icon name="check" size={14} />
              Aceitar as {open.length} restantes
            </button>
          )}
          {overrides[r.id] && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => change((o) => ov.clearEntity(o, r.id), 'Revisão desfeita.')}>
              <Icon name="x" size={14} />
              Desfazer revisão
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

/**
 * Campo que só aplica a correção ao sair dele ou apertar Enter (e não a cada
 * tecla), como o evento `change` do HTML. Volta ao valor salvo se ele mudar.
 */
function CommitInput({ value, onCommit, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value'> & { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(value);
  if (saved !== value) {
    setSaved(value);
    setDraft(value);
  }
  const commit = () => {
    if (draft !== value) onCommit(draft);
  };
  return (
    <input
      {...rest}
      value={draft}
      autoComplete="off"
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
}
