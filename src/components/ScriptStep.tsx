import { type KeyboardEvent, useMemo, useRef, useState } from 'react';
import type { Session } from '../hooks/useSession';
import { download } from '../lib/browser';
import { collectWarnings, highlightSql } from '../lib/sqlView';
import { Icon } from './Icon';

interface Props {
  session: Session;
  announce: (msg: string) => void;
  copy: (text: string) => Promise<void>;
  /** Com SQL editado, pede confirmação antes de `action` (que refaz o script). */
  guard: (action: () => void) => void;
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

/** Etapa 3 — Script: SQL destacado e editável, painel de avisos, opções, copiar e baixar. */
export function ScriptStep({ session, announce, copy, guard, onBack }: Props) {
  const { sql, oracle11g, singleBlock, useOwner, sqlEdited } = session;

  // Tabelas marcadas cuja entity não declara schema: ficam sem owner mesmo com a opção ligada.
  const tablesSel = session.reports.filter((r) => r.kind !== 'view' && session.selected.has(r.id));
  const unmapped = tablesSel.filter((r) => !r.schema).map((r) => r.tableName);
  const SHOW = 8;
  const editor = useRef<HTMLTextAreaElement>(null);
  // Tab insere recuo em vez de sair do campo; Esc libera o Tab para navegar.
  const tabTraps = useRef(true);
  const [copied, setCopied] = useState(false);
  const html = useMemo(() => highlightSql(sql), [sql]);
  const warns = useMemo(() => collectWarnings(sql), [sql]);

  // No bloco PL/SQL os comandos vêm como `  run(q'[CREATE ...`.
  const count = (re: RegExp) => (sql.match(re) ?? []).length;
  const tables = count(/^(?:\s*run\(q'.)?CREATE TABLE /gm);
  const fkOn = count(/^(?:\s*run\(q'.)?ALTER TABLE /gm);
  const fkOff = count(/^\s*-- ALTER TABLE /gm);

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
  const on11g = (on: boolean) =>
    guard(() => {
      session.toggle11g(on);
      announce(on ? 'Script refeito com SEQUENCE (Oracle 11g).' : 'Script refeito com IDENTITY (Oracle 12c+).');
    });
  const onOwner = (on: boolean) =>
    guard(() => {
      session.toggleOwner(on);
      announce(on ? 'Script refeito com OWNER.TABELA a partir do schema das entities.' : 'Script refeito sem owner nos nomes.');
    });
  const onBlock = (on: boolean) =>
    guard(() => {
      session.toggleBlock(on);
      announce(on ? 'Script refeito como um único bloco PL/SQL.' : 'Script refeito com comandos separados.');
    });
  const onEdit = (text: string) => {
    if (!sqlEdited) announce('Script editado. Use Reverter para voltar ao gerado.');
    session.editSql(text);
  };
  const onRevert = () => {
    session.revertSql();
    editor.current?.focus();
    announce('Alterações desfeitas: o script voltou ao gerado.');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') tabTraps.current = false;
    if (e.key !== 'Tab' || e.shiftKey || !tabTraps.current) return;
    e.preventDefault();
    document.execCommand('insertText', false, '  ');
  };

  return (
    <div className="stack">
      <div className="review-head">
        <div>
          <div className="title-row">
            <h2>Script gerado</h2>
            {sqlEdited && (
              <span className="edited" role="status">
                <span className="edited-dot" aria-hidden="true" />
                Editado
                <button type="button" className="btn btn-sm" onClick={onRevert}>
                  <Icon name="undo" size={14} />
                  Reverter
                </button>
              </span>
            )}
          </div>
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
      <label className="option" htmlFor="opt-owner">
        <input type="checkbox" id="opt-owner" checked={useOwner} onChange={(e) => onOwner(e.target.checked)} />
        <span>
          <strong>OWNER.TABELA</strong> — usar o schema declarado na entity (ex.: schema: 'APP') como owner de tabelas, FKs, sequences e índices
          {unmapped.length ? (
            <span className="option-note warn">
              {unmapped.length} de {tablesSel.length} tabelas sem schema na entity ficam sem owner: <span className="mono">{unmapped.slice(0, SHOW).join(', ')}</span>
              {unmapped.length > SHOW ? ` e mais ${unmapped.length - SHOW}` : ''}.
            </span>
          ) : (
            <span className="option-note">Todas as {tablesSel.length} tabelas marcadas têm schema na entity.</span>
          )}
        </span>
      </label>
      <label className="option" htmlFor="opt-block">
        <input type="checkbox" id="opt-block" checked={singleBlock} onChange={(e) => onBlock(e.target.checked)} />
        <span>
          <strong>Bloco PL/SQL único</strong> — tudo num só comando (BEGIN … END;), que pula o que já existe e pode rodar de novo
        </span>
      </label>

      <p className="hint">Dá para editar o SQL direto abaixo; copiar e baixar levam a versão editada.</p>

      <div className="script-grid">
        {/* Editor: textarea transparente por cima do SQL destacado (mesma fonte e linhas). */}
        <div className="sql">
          <div className="sql-inner">
            <pre aria-hidden="true">
              {/* highlightSql escapa todo o texto antes de montar o HTML. */}
              <code dangerouslySetInnerHTML={{ __html: html }} />
            </pre>
            <textarea
              ref={editor}
              className="sql-input"
              aria-label="Script SQL (editável)"
              spellCheck={false}
              autoComplete="off"
              autoCapitalize="off"
              wrap="off"
              value={sql}
              onChange={(e) => onEdit(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={() => (tabTraps.current = true)}
            />
          </div>
        </div>
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
