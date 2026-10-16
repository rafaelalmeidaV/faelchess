/**
 * Rating e histórico de problemas de quem não tem a chave de acesso: ficam só no navegador
 * (o servidor não grava nada dessas pessoas). Mesmo cálculo Glicko do servidor.
 */
import { PUZZLE_START_RATING, PUZZLE_START_RD, glickoUpdate } from '@faelchess/shared';
import type { Puzzle, PuzzleStats } from './api';

const KEY = 'faelchess:puzzles:local';
const KEEP = 300;

interface LocalAttempt {
  puzzleId: string;
  win: boolean;
  puzzleRating: number;
  ratingAfter: number;
  themes: string[];
  at: string;
}

interface LocalPuzzles {
  rating: number;
  rd: number;
  attempts: number;
  wins: number;
  /** Mais recente primeiro. */
  recent: LocalAttempt[];
}

const empty = (): LocalPuzzles => ({ rating: PUZZLE_START_RATING, rd: PUZZLE_START_RD, attempts: 0, wins: 0, recent: [] });

function load(): LocalPuzzles {
  try {
    return { ...empty(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return empty();
  }
}

function save(data: LocalPuzzles) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* sem storage: vale só até fechar a aba */
  }
}

/** Rating atual e ids recentes, para o servidor sortear o próximo problema. */
export function localQuery() {
  const d = load();
  return { rating: Math.max(100, Math.min(3500, d.rating)), exclude: d.recent.slice(0, 100).map((a) => a.puzzleId) };
}

/** Registra a tentativa; refazer um problema não mexe no rating (igual ao servidor). */
export function recordLocal(puzzle: Puzzle, win: boolean) {
  const d = load();
  const repeated = d.recent.some((a) => a.puzzleId === puzzle._id);
  const before = d.rating;
  if (!repeated) {
    const after = glickoUpdate(d, puzzle.rating, win);
    d.rating = after.rating;
    d.rd = after.rd;
    d.attempts++;
    if (win) d.wins++;
  }
  d.recent.unshift({ puzzleId: puzzle._id, win, puzzleRating: puzzle.rating, ratingAfter: d.rating, themes: puzzle.themes, at: new Date().toISOString() });
  d.recent = d.recent.slice(0, KEEP);
  save(d);
  return { rating: d.rating, delta: d.rating - before, counted: !repeated };
}

/** Mesmo formato das estatísticas do servidor. */
export function localStats(): PuzzleStats {
  const d = load();
  const themes = new Map<string, { attempts: number; wins: number }>();
  for (const a of d.recent)
    for (const t of a.themes) {
      const s = themes.get(t) ?? { attempts: 0, wins: 0 };
      s.attempts++;
      if (a.win) s.wins++;
      themes.set(t, s);
    }
  return {
    rating: d.rating,
    rd: d.rd,
    attempts: d.attempts,
    wins: d.wins,
    recent: d.recent.slice(0, 30).map(({ puzzleId, win, puzzleRating, ratingAfter, at }) => ({ puzzleId, win, puzzleRating, ratingAfter, at })),
    themes: [...themes].map(([theme, s]) => ({ theme, ...s })).sort((a, b) => b.attempts - a.attempts),
  };
}
