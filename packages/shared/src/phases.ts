import type { Phase } from './types';

/**
 * Divide a partida em abertura / meio-jogo / final, com as heurísticas do Divider do Lichess (scalachess):
 * - meio-jogo começa na 1ª posição com <= 10 peças (sem peões e reis), ou com a 1ª fileira de algum lado
 *   esvaziando (< 4 peças em casa), ou com as peças dos dois lados já bem misturadas ("mixedness" > 150);
 * - final começa na 1ª posição com <= 6 peças.
 * Os índices são de posição: 0 = inicial, i = depois do ply i.
 */
export interface Division {
  middle?: number;
  end?: number;
}

interface Occupancy {
  /** [rank][file], rank 0 = 1ª fileira. 'w', 'b' ou null. */
  grid: ('w' | 'b' | null)[][];
  piecesNoPawnsKings: number;
}

function parseBoard(fen: string): Occupancy {
  const grid: ('w' | 'b' | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
  let pieces = 0;
  const rows = fen.split(' ')[0].split('/');
  rows.forEach((row, i) => {
    const rank = 7 - i;
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        file += Number(ch);
        continue;
      }
      grid[rank][file] = ch === ch.toUpperCase() ? 'w' : 'b';
      if (!'pPkK'.includes(ch)) pieces++;
      file++;
    }
  });
  return { grid, piecesNoPawnsKings: pieces };
}

function backRankSparse({ grid }: Occupancy): boolean {
  const whiteHome = grid[0].filter((c) => c === 'w').length;
  const blackHome = grid[7].filter((c) => c === 'b').length;
  return whiteHome < 4 || blackHome < 4;
}

/**
 * Pontua um quadrado 2x2 conforme quantas peças de cada cor tem e quão avançado está (y = 1..7).
 * Regiões com peças das duas cores, ou peças longe de casa, indicam que o jogo "abriu".
 */
function regionScore(y: number, white: number, black: number): number {
  if (white === 0) {
    if (black === 1) return 1 + y;
    if (black === 2) return y < 6 ? 2 + (6 - y) : 0;
    if (black === 3 || black === 4) return y < 7 ? 3 + (7 - y) : 0;
    return 0;
  }
  if (white === 1) {
    if (black === 0) return 1 + (8 - y);
    if (black === 1) return 5 + Math.abs(4 - y);
    if (black === 2) return 4 + (7 - y);
    if (black === 3) return 5 + (7 - y);
    return 0;
  }
  if (white === 2) {
    if (black === 0) return y > 2 ? 2 + (y - 2) : 0;
    if (black === 1) return 4 + (y - 1);
    if (black === 2) return 7;
    return 0;
  }
  if (white === 3) {
    if (black === 0) return y > 1 ? 3 + (y - 1) : 0;
    if (black === 1) return 5 + (y - 1);
    return 0;
  }
  if (white === 4 && black === 0) return y > 1 ? 3 + (y - 1) : 0;
  return 0;
}

function mixedness({ grid }: Occupancy): number {
  let total = 0;
  for (let rank = 0; rank < 7; rank++) {
    for (let file = 0; file < 7; file++) {
      let w = 0;
      let b = 0;
      for (const [dr, df] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
        const c = grid[rank + dr][file + df];
        if (c === 'w') w++;
        else if (c === 'b') b++;
      }
      total += regionScore(rank + 1, w, b);
    }
  }
  return total;
}

export function divideGame(fens: string[]): Division {
  const boards = fens.map(parseBoard);
  const middle = boards.findIndex(
    (b) => b.piecesNoPawnsKings <= 10 || backRankSparse(b) || mixedness(b) > 150,
  );
  const end = middle >= 0 ? boards.findIndex((b) => b.piecesNoPawnsKings <= 6) : -1;
  return {
    middle: middle >= 0 && (end < 0 || middle < end) ? middle : undefined,
    end: end >= 0 ? end : undefined,
  };
}

/** Fase da posição de índice `index` (0 = inicial). */
export function phaseAt(div: Division, index: number): Phase {
  if (div.end !== undefined && index >= div.end) return 'endgame';
  if (div.middle !== undefined && index >= div.middle) return 'middlegame';
  return 'opening';
}
