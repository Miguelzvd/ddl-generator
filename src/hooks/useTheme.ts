import { useEffect, useState } from 'react';
import { loadTheme, saveTheme } from '../lib/storage';

const systemDark = () => matchMedia('(prefers-color-scheme: dark)').matches;

/** Tema claro/escuro: segue o sistema até o usuário escolher, e lembra a escolha. */
export function useTheme() {
  const [theme, setTheme] = useState(loadTheme);
  const dark = theme ? theme === 'dark' : systemDark();

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
    else delete root.dataset.theme;
  }, [theme]);

  const toggle = () => {
    const next = dark ? 'light' : 'dark';
    saveTheme(next);
    setTheme(next);
  };

  return { dark, toggle };
}
