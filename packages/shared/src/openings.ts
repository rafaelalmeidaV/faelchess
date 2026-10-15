import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MoveRecord, OpeningInfo } from './types';

let book: Record<string, [string, string]> | null = null;

/** Base de aberturas do Lichess (gerada por `npm run openings:fetch`). Só para Node: o front não usa. */
function loadBook(): Record<string, [string, string]> {
  book ??= JSON.parse(readFileSync(join(__dirname, '..', 'data', 'openings.json'), 'utf8'));
  return book!;
}

const key = (fen: string) => fen.split(' ').slice(0, 3).join(' ');

export function lookupOpening(fen: string): { eco: string; name: string } | null {
  const hit = loadBook()[key(fen)];
  return hit ? { eco: hit[0], name: hit[1] } : null;
}

/** Abertura da partida: a posição mais avançada (até o ply 40) que está na base. */
export function detectOpening(moves: Pick<MoveRecord, 'fenAfter'>[]): OpeningInfo | undefined {
  let found: OpeningInfo | undefined;
  for (let i = 0; i < Math.min(moves.length, 40); i++) {
    const hit = lookupOpening(moves[i].fenAfter);
    if (hit) found = { ...hit, ply: i + 1 };
  }
  return found;
}

/** Família da abertura ("Sicilian Defense: Najdorf Variation" -> "Sicilian Defense"). */
export function openingFamily(name: string): string {
  return name.split(':')[0].trim();
}
