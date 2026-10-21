import { useState } from 'react';

/** Preferência simples guardada no navegador (o storage pode estar bloqueado: aí só não lembra). */
export function useStoredFlag(key: string, initial: boolean) {
  const [value, setValue] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? initial : v === '1';
    } catch {
      return initial;
    }
  });
  const update = (v: boolean) => {
    setValue(v);
    try {
      localStorage.setItem(key, v ? '1' : '0');
    } catch {
      /* ok */
    }
  };
  return [value, update] as const;
}

export const TRAINING_KEY = 'faelchess:training';
export const TRAINING_ONLY_MINE_KEY = 'faelchess:trainingOnlyMine';
export const PUZZLE_THEMES_KEY = 'faelchess:puzzleShowThemes';
