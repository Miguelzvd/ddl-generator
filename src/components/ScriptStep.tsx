import { useMemo, useState } from 'react';
import type { Session } from '../hooks/useSession';
import { download } from '../lib/browser';
import { collectWarnings, highlightSql } from '../lib/sqlView';
import { Icon } from './Icon';
import './ScriptStep.css';

interface Props {
  session: Session;
  announce: (msg: string) => void;
  copy: (text: string) => Promise<void>;
  onBack: () => void;
}

/** `ddl-<schema>-AAAAMMDD.sql` quando só há um schema; senão `ddl-projeto-…`. */
function fileName(session: Session) {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const schemas = new Set(session.reports.filter((r) => session.selected.has(r.id) && r.schema).map((r) => r.schema!));
  const base = schemas.size === 1 ? [...schemas][0].toLowerCase() : 'projeto';
  return `ddl-${base}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.sql`;
}

function jumpTo(line: number) {
  const el = document.getElementById(`sql-l${line}`);
  if (!el) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  el.classList.remove('flash');
  void el.offsetWidth; // reinicia a animação
  el.classList.add('flash');
}

/** Etapa 3 — Script: SQL destacado, painel de avisos, opção 11g, copiar e baixar. */
export function ScriptStep({ session, announce, copy, onBack }: Props) {
  const { sql, oracle11g } = session;
  const [copied, setCopied] = useState(false);
  const html = useMemo(() => highlightSql(sql), [sql]);
  const warns = useMemo(() => collectWarnings(sql), [sql]);

  const tables = (sql.match(/^CREATE TABLE /gm) ?? []).length;
  const fkOn = (sql.match(/^ALTER TABLE /gm) ?? []).length;
  const fkOff = (sql.match(/^-- ALTER TABLE /gm) ?? []).length;

  const onCopy = async () => {
    await copy(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  const onDownload = () => {
    const name = fileName(session);
    download(sql, name);
    announce(`Arquivo ${name} baixado.`);
  };
  const on11g = (on: boolean) => {
    session.toggle11g(on);
    announce(on ? 'Script refeito com SEQUENCE (Oracle 11g).' : 'Script refeito com IDENTITY (Oracle 12c+).');
  };

  return (
    <div className="stack">
      <div className="review-head">
        <div>
          <h2>Script gerado</h2>
          <p className="muted">
            {tables} tabelas · {fkOn} FKs ativas · {fkOff} FKs comentadas · {sql.split('\n').length} linhas
          </p>
        </div>
        <div className="row">
          <button type="button" className="btn btn-ghost" onClick={onBack}>
            <Icon name="back" />
            Voltar para a lista
          </button>
          <button type="button" className="btn" onClick={onCopy}>
            <Icon name={copied ? 'check' : 'copy'} />
            <span>{copied ? 'Copiado' : 'Copiar'}</span>
          </button>
          <button type="button" className="btn btn-primary" onClick={onDownload}>
            <Icon name="download" />
            Baixar .sql
          </button>
        </div>
      </div>

      <label className="option" htmlFor="opt-11g">
        <input type="checkbox" id="opt-11g" checked={oracle11g} onChange={(e) => on11g(e.target.checked)} />
        <span>
          <strong>Oracle 11g</strong> — usar SEQUENCE no lugar de IDENTITY e limitar nomes a 30 caracteres
        </span>
      </label>

      <div className="script-grid">
        <pre className="sql" tabIndex={0} aria-label="Script SQL gerado">
          {/* highlightSql escapa todo o texto antes de montar o HTML. */}
          <code dangerouslySetInnerHTML={{ __html: html }} />
        </pre>
        <aside className="warn-panel" aria-labelledby="warn-title">
          <h3 id="warn-title">Avisos no script</h3>
          <ul className="warn-list">
            {warns.length === 0 && <li className="muted">Nenhuma suposição: o script saiu exato.</li>}
            {warns.map((w) => (
              <li key={w.line}>
                <button type="button" className="warn-item" onClick={() => jumpTo(w.line)}>
                  <span className="warn-table mono">{w.where || 'Geral'}</span>
                  <span>{w.text}</span>
                  <span className="warn-line num">linha {w.line}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}
