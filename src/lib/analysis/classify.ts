/** Monta a lista de entities com status e motivos, na ordem dos arquivos. */
import { entityId, fileKey, type Registry } from '../ddl/naming';
import { planTable } from '../ddl/plan';
import type { EntityModel, EntityReport, Overrides, ParsedFile, Status } from '../model';

export interface Analysis {
  reports: EntityReport[];
  registry: Registry;
}

export function buildReports(files: ParsedFile[], overrides: Overrides = {}): Analysis {
  const registry: Registry = new Map();
  for (const f of files) {
    for (const e of f.entities) {
      if (!registry.has(e.className)) registry.set(e.className, e);
      registry.set(fileKey(e.file, e.className), e);
    }
  }

  const reports: EntityReport[] = [];
  const seenTables = new Map<string, string>();
  for (const f of files) {
    if (f.error) {
      reports.push(emptyReport(`${f.file}#erro`, 'impossible', f.file, { reasons: [`Erro ao ler o arquivo: ${f.error}`] }));
      continue;
    }
    for (const e of f.entities) reports.push(reportFor(e, registry, seenTables, overrides));
    for (const c of f.commented) {
      reports.push(
        emptyReport(`${f.file}#comentado#${c.className ?? c.tableName ?? reports.length}`, 'commented', f.file, {
          className: c.className ?? '—',
          tableName: c.tableName ?? '—',
          schema: c.schema,
          kind: c.kind,
          reasons: [`@${c.kind === 'view' ? 'ViewEntity' : 'Entity'} está comentado no código`],
        }),
      );
    }
  }
  return { reports, registry };
}

/** Linha sem entity lida (arquivo com erro ou entity comentada). */
function emptyReport(id: string, status: Status, file: string, extra: Partial<EntityReport>): EntityReport {
  return { id, status, className: '—', tableName: '—', kind: 'table', file, columnCount: 0, relationCount: 0, reasons: [], assumptions: [], ...extra };
}

function reportFor(e: EntityModel, registry: Registry, seenTables: Map<string, string>, overrides: Overrides): EntityReport {
  const base = {
    id: entityId(e),
    className: e.className,
    tableName: e.tableName,
    schema: e.schema,
    kind: e.kind,
    file: e.file,
    columnCount: e.columns.length,
    relationCount: e.relations.length,
    entity: e,
    assumptions: [],
  };

  if (e.kind === 'view') return { ...base, status: 'impossible', reasons: ['É uma view (@ViewEntity): o SELECT que a define não está no código'] };
  if (e.unresolved) return { ...base, status: 'impossible', reasons: [e.unresolved] };
  if (e.columns.length === 0) return { ...base, status: 'impossible', reasons: ['Nenhuma coluna declarada na entity'] };

  const plan = planTable(e, registry, { oracle11g: false, overrides });
  const assumptions = [...plan.assumptions];
  const reasons = [...plan.warnings];

  const qn = plan.qualifiedName;
  const other = seenTables.get(qn);
  if (other) {
    const text = `A entity ${other} usa a mesma tabela ${qn}; o CREATE TABLE sai uma vez só`;
    const accepted = overrides[base.id]?.accepted.includes('dup') ?? false;
    assumptions.unshift({ key: 'dup', kind: 'other', text, resolved: accepted, note: accepted ? `suposição aceita — ${text}` : undefined });
    if (!accepted) reasons.unshift(text);
  } else {
    seenTables.set(qn, e.className);
  }

  const open = assumptions.filter((a) => !a.resolved);
  const status: Status = assumptions.length === 0 ? 'ok' : open.length === 0 ? 'revised' : 'assumptions';
  return {
    ...base,
    tableName: plan.tableName,
    status,
    assumptions,
    reasons: status === 'revised' ? assumptions.map((a) => a.note ?? '') : reasons,
  };
}
