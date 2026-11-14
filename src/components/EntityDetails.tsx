import { columnName } from '../lib/ddl/naming';
import { mapColumnType } from '../lib/ddl/typeMap';
import type { EntityReport, Overrides } from '../lib/model';
import { AssumptionEditor } from './AssumptionEditor';
import type { ChangeFn } from './ReviewStep';

interface Props {
  r: EntityReport;
  overrides: Overrides;
  change: ChangeFn;
  copy: (text: string) => Promise<void>;
}

/** Linha aberta: suposições (editáveis) ou motivo, colunas e relações. */
export function EntityDetails({ r, overrides, change, copy }: Props) {
  const e = r.entity;
  const isView = e?.kind === 'view';
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

      <p className="hint">
        Arquivo: <span className="mono">{r.file}</span>
      </p>
    </div>
  );
}
