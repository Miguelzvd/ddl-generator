import { useEffect, useRef, useState } from 'react';
import { ConfirmDiscard } from './components/ConfirmDiscard';
import { Icon } from './components/Icon';
import { LoadStep } from './components/LoadStep';
import { ReviewStep } from './components/ReviewStep';
import { ScriptStep } from './components/ScriptStep';
import { useSession } from './hooks/useSession';
import { useTheme } from './hooks/useTheme';
import { copyText } from './lib/browser';

type Step = 1 | 2 | 3;
const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Carregar' },
  { n: 2, label: 'Revisar' },
  { n: 3, label: 'Script' },
];

export default function App() {
  const session = useSession();
  const theme = useTheme();
  const [step, setStep] = useState<Step>(1);
  const [live, setLive] = useState('');
  const main = useRef<HTMLElement>(null);

  /** Mensagem para leitor de tela. */
  const announce = (msg: string) => {
    setLive('');
    requestAnimationFrame(() => setLive(msg));
  };
  const copy = async (text: string) => {
    await copyText(text);
    announce('Copiado para a área de transferência.');
  };
  /** Ação que aguarda o usuário decidir se descarta o SQL editado. */
  const [pending, setPending] = useState<(() => void) | null>(null);
  /** Roda `action` direto ou, com SQL editado, depois de confirmar o descarte. */
  const guard = (action: () => void) => {
    if (session.sqlEdited) setPending(() => action);
    else action();
  };

  // Fechar ou recarregar a aba com SQL editado também perde as alterações.
  useEffect(() => {
    if (!session.sqlEdited) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [session.sqlEdited]);

  const go = (n: Step) => {
    const move = () => {
      setStep(n);
      main.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    };
    if (step === 3 && n !== 3) guard(move);
    else move();
  };
  const enabled = (n: Step) => n === 1 || (n === 2 && session.reports.length > 0) || (n === 3 && session.sql !== '');

  return (
    <>
      <a className="skip" href="#main">
        Pular para o conteúdo
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <h1>DDL Generator</h1>
        </div>
        <ol className="stepper" aria-label="Etapas">
          {STEPS.map(({ n, label }) => (
            <li key={n}>
              <button type="button" className="step" aria-current={step === n ? 'step' : undefined} disabled={!enabled(n)} onClick={() => go(n)}>
                <span className="step-n">{n}</span>
                <span>{label}</span>
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="btn btn-ghost btn-icon" aria-label="Alternar tema claro/escuro" title={theme.dark ? 'Usar tema claro' : 'Usar tema escuro'} onClick={theme.toggle}>
          <Icon name={theme.dark ? 'sun' : 'moon'} size={18} />
        </button>
      </header>
      <main id="main" className="main" tabIndex={-1} ref={main}>
        {step === 1 && <LoadStep session={session} announce={announce} onReview={() => go(2)} />}
        {step === 2 && <ReviewStep session={session} announce={announce} copy={copy} onAddFiles={() => go(1)} onGenerate={() => go(3)} />}
        {step === 3 && <ScriptStep session={session} announce={announce} copy={copy} guard={guard} onBack={() => go(2)} />}
      </main>
      {pending && (
        <ConfirmDiscard
          onKeep={() => setPending(null)}
          onDiscard={() => {
            session.revertSql();
            setPending(null);
            pending();
          }}
        />
      )}
      <div className="sr-only" aria-live="polite" role="status">
        {live}
      </div>
    </>
  );
}
