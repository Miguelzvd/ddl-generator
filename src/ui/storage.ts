import type { Overrides } from '../model';

const KEY = 'ddl-overrides-v1';

/** Correções salvas neste navegador. Sem storage disponível, começa vazio. */
export function loadOverrides(): Overrides {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveOverrides(o: Overrides): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    /* sem storage: as correções valem até fechar a aba */
  }
}
