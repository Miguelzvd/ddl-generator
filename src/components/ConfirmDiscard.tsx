import { useEffect, useRef } from 'react';

interface Props {
  onKeep: () => void;
  onDiscard: () => void;
}

/** Pergunta antes de descartar o SQL editado (voltar, trocar opção, mudar de etapa). */
export function ConfirmDiscard({ onKeep, onDiscard }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const keep = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    d.showModal();
    keep.current?.focus();
    return () => d.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="dialog"
      aria-labelledby="discard-title"
      aria-describedby="discard-desc"
      onCancel={(e) => {
        e.preventDefault();
        onKeep();
      }}
    >
      <h2 id="discard-title">Descartar as alterações no script?</h2>
      <p id="discard-desc" className="muted">
        Você editou o SQL. Se continuar, o script volta a ser o gerado e as alterações que você fez serão desfeitas.
      </p>
      <div className="row dialog-actions">
        <button type="button" className="btn" ref={keep} onClick={onKeep}>
          Continuar editando
        </button>
        <button type="button" className="btn btn-danger" onClick={onDiscard}>
          Descartar alterações
        </button>
      </div>
    </dialog>
  );
}
