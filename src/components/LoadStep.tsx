import { useRef, useState, type DragEvent } from 'react';
import type { Session } from '../hooks/useSession';
import { filesFromDataTransfer, readFileList } from '../lib/io/files';
import type { ParsedFile } from '../lib/model';
import { parseFile } from '../lib/parser/parseFile';
import { Icon } from './Icon';
import './LoadStep.css';

interface Props {
  session: Session;
  announce: (msg: string) => void;
  onReview: () => void;
}

/** Etapa 1 — Carregar: escolher pasta/arquivos ou arrastar, com barra de progresso. */
export function LoadStep({ session, announce, onReview }: Props) {
  const [loading, setLoading] = useState<{ done: number; total: number }>();
  const [over, setOver] = useState(false);
  const depth = useRef(0); // dragenter/dragleave disparam também nos filhos
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);

  /** Lê, interpreta e soma os arquivos; vai para a revisão se achou entities. */
  async function ingest(files: File[], label: string) {
    if (!files.length) return;
    setLoading({ done: 0, total: files.length });
    const { sources, failures } = await readFileList(files, (done, total) => setLoading({ done, total }));
    const parsed: ParsedFile[] = sources.map((s) => parseFile(s.path, s.text));
    for (const f of failures) parsed.push({ file: f.path, entities: [], commented: [], error: f.error });
    setLoading(undefined);
    const n = session.addFiles(parsed, label);
    if (n === 0) return announce('Nenhuma entity TypeORM encontrada nos arquivos selecionados.');
    announce(`${n} entities encontradas em ${parsed.length} arquivos.`);
    onReview();
  }

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    depth.current = 0;
    setOver(false);
    const files = await filesFromDataTransfer(e.dataTransfer);
    void ingest(files, `${files.length} arquivo(s) arrastado(s)`);
  };

  const clear = () => {
    session.clearAll();
    announce('Lista limpa.');
  };

  return (
    <div className="stack">
      <section
        className={`drop${over ? ' is-over' : ''}${loading ? ' is-busy' : ''}`}
        aria-labelledby="drop-title"
        onDragEnter={(e) => {
          e.preventDefault();
          depth.current++;
          setOver(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => {
          if (--depth.current <= 0) setOver(false);
        }}
        onDrop={onDrop}
      >
        <div className="drop-icon">
          <Icon name="upload" size={28} />
        </div>
        <h2 id="drop-title">Carregue as entities do seu projeto</h2>
        <p className="muted measure">
          Selecione a pasta do projeto (ou só a pasta das entities) e a ferramenta encontra sozinha os arquivos com @Entity e @ViewEntity. Se preferir, arraste arquivos .ts
          para cá. Nada sai do seu computador.
        </p>
        <div className="drop-actions">
          <button type="button" className="btn btn-primary" onClick={() => folderInput.current?.click()}>
            <Icon name="folder" size={18} />
            Selecionar pasta do projeto
          </button>
          <button type="button" className="btn" onClick={() => filesInput.current?.click()}>
            <Icon name="file" size={18} />
            Selecionar arquivos
          </button>
        </div>
        <p className="hint">Ignorados automaticamente: node_modules, dist, build, .git e arquivos .d.ts.</p>
        <input
          ref={(el) => {
            folderInput.current = el;
            el?.setAttribute('webkitdirectory', '');
          }}
          type="file"
          className="sr-only"
          multiple
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const list = [...(e.target.files ?? [])];
            void ingest(list, `pasta ${list[0]?.webkitRelativePath.split('/')[0] || 'pasta'}`);
          }}
        />
        <input
          ref={filesInput}
          type="file"
          className="sr-only"
          multiple
          accept=".ts"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const list = [...(e.target.files ?? [])];
            void ingest(list, `${list.length} arquivo(s)`);
          }}
        />
      </section>

      {loading ? (
        <>
          <div className="progress" role="progressbar" aria-label="Lendo arquivos">
            <div className="progress-track">
              <div className="progress-fill" style={{ transform: `scaleX(${loading.total ? loading.done / loading.total : 0})` }} />
            </div>
            <p className="progress-label">
              Lendo {loading.done} de {loading.total} arquivos…
            </p>
          </div>
          <div className="skeleton" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="skeleton-row" />
            ))}
          </div>
        </>
      ) : session.reports.length ? (
        <div className="loaded">
          <p>
            <strong className="num">{session.reports.length}</strong> entities carregadas de {session.source}. Novos arquivos são somados a elas.
          </p>
          <div className="row">
            <button type="button" className="btn btn-primary" onClick={onReview}>
              Revisar lista
            </button>
            <button type="button" className="btn btn-ghost" onClick={clear}>
              <Icon name="x" />
              Limpar tudo
            </button>
          </div>
        </div>
      ) : session.files.length ? (
        <p className="notice" role="alert">
          Nenhuma entity TypeORM foi encontrada nos arquivos selecionados. Confira se a pasta contém classes com @Entity ou @ViewEntity.
        </p>
      ) : null}
    </div>
  );
}
