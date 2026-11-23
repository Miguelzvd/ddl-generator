import { useState } from 'react';
import { columnName } from '../lib/ddl/naming';
import { mapColumnType } from '../lib/ddl/typeMap';
import { editorPath } from '../lib/io/files';
import type { EntityReport, Overrides } from '../lib/model';
import type { Usage } from '../lib/usages';
import { AssumptionEditor } from './AssumptionEditor';
import { Icon } from './Icon';
import type { ChangeFn } from './ReviewStep';

const USAGES_SHOWN = 20;

interface Props {
  r: EntityReport;
  overrides: Overrides;
  change: ChangeFn;
  copy: (text: string) => Promise<void>;
  /** Onde a classe é usada no projeto. */
  usages: Usage[];
  /** Outra entity carregada tem o mesmo nome de classe (os usos podem se misturar). */
  sharedName: boolean;
}

/** Linha aberta: suposições (editáveis) ou motivo, colunas, relações e onde a entity é usada. */
export function EntityDetails({ r, overrides, change, copy, usages, sharedName }: Props) {
  const [allUsages, setAllUsages] = useState(false);
  const e = r.entity;
  const isView = e?.kind === 'view';
  const shown = allUsages ? usages : usages.slice(0, USAGES_SHOWN);

  return (
    <div className="detail">
      {r.assumptions.length > 0 ? (
        <AssumptionEditor r={r} overrides={overrides} change={change} copy={copy} />
      ) : (
        r.reasons.length > 0 && (
          <>
            <h3>Motivo</h3>
            <ul className="reasons">
              {r.reasons.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </>
        )
      )}

      {e && e.columns.length > 0 && (
        <>
          <h3>Colunas</h3>
          <table className="mini">
            <thead>
              <tr>
                <th>Propriedade</th>
                <th>Coluna</th>
                <th>{isView ? 'Tipo TS' : 'Tipo Oracle'}</th>
                <th>Nulo</th>
                <th>PK</th>
                <th>Linha</th>
              </tr>
            </thead>
            <tbody>
              {e.columns.map((c) => (
                <tr key={c.property}>
                  <td className="mono">{c.property}</td>
                  <td className="mono">{columnName(c)}</td>
                  <td className="mono">{isView ? (c.tsType ?? '—') : mapColumnType(c).sql}</td>
                  <td>{c.nullable ? 'sim' : 'não'}</td>
                  <td>{c.primary ? (c.generated ? 'gerada' : 'sim') : ''}</td>
                  <td>{c.line && <SourceRef file={r.file} line={c.line} copy={copy} label={String(c.line)} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {e && e.relations.length > 0 && (
        <>
          <h3>Relações</h3>
          <ul className="reasons">
            {e.relations.map((x) => (
              <li key={x.property}>
                <span className="mono">{x.property}</span> — {x.kind} → {x.targetClass}
                {x.joinColumns[0]?.name ? ` (coluna ${x.joinColumns[0].name})` : ''}
              </li>
            ))}
          </ul>
        </>
      )}

      {e && (
        <>
          <h3>Usada em ({usages.length})</h3>
          {sharedName && <p className="hint">Há outra entity chamada {e.className}: os usos abaixo podem ser de qualquer uma delas.</p>}
          {usages.length === 0 ? (
            <p className="hint">Nenhum uso de {e.className} encontrado nos arquivos carregados (fora a própria entity).</p>
          ) : (
            <ul className="usages">
              {shown.map((u) => (
                <li key={`${u.file}:${u.line}`}>
                  <SourceRef file={u.file} line={u.line} copy={copy} />
                  <code className="mono usage-code" title={u.text}>
                    {u.text}
                  </code>
                </li>
              ))}
            </ul>
          )}
          {usages.length > USAGES_SHOWN && (
            <button type="button" className="link" onClick={() => setAllUsages(!allUsages)}>
              {allUsages ? 'Mostrar menos' : `Mostrar todos (+${usages.length - USAGES_SHOWN})`}
            </button>
          )}
        </>
      )}

      <p className="hint">
        Arquivo: {e?.line ? <SourceRef file={r.file} line={e.line} copy={copy} /> : <span className="mono">{r.file}</span>}
      </p>
    </div>
  );
}

/** `arquivo:linha` que copia a referência ao clicar (para colar no Ctrl+P do editor). */
function SourceRef({ file, line, copy, label }: { file: string; line: number; copy: (text: string) => Promise<void>; label?: string }) {
  const ref = `${editorPath(file)}:${line}`;
  return (
    <button type="button" className="source-ref mono" title={`Copiar ${ref}`} aria-label={`Copiar ${ref}`} onClick={() => void copy(ref)}>
      <span>{label ?? ref}</span>
      <Icon name="copy" size={12} />
    </button>
  );
}
