/**
 * O que fica guardado neste navegador: correções das suposições e o tema.
 * Sem storage disponível (aba anônima, bloqueio), tudo vale só até fechar a aba.
 */
import type { Overrides } from './model';

const OVERRIDES_KEY = 'ddl-overrides-v1';
const THEME_KEY = 'ddl-theme';

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* sem storage */
  }
}

export function loadOverrides(): Overrides {
  try {
    const parsed = JSON.parse(read(OVERRIDES_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export const saveOverrides = (o: Overrides) => write(OVERRIDES_KEY, JSON.stringify(o));
export const loadTheme = () => read(THEME_KEY);
export const saveTheme = (t: string) => write(THEME_KEY, t);
