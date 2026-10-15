export type CapturedType = 'p' | 'n' | 'b' | 'r' | 'q';

const TYPES: CapturedType[] = ['p', 'n', 'b', 'r', 'q'];
const START: Record<CapturedType, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
const VALUES: Record<CapturedType, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

export interface Material {
  /** Peças que cada lado capturou (do adversário), em ordem de valor. */
  captured: { w: CapturedType[]; b: CapturedType[] };
  /** Pontos das brancas menos os das pretas (peão 1, cavalo/bispo 3, torre 5, dama 9). */
  diff: number;
}

/**
 * Material a partir do FEN (sem histórico): capturado = o que falta do conjunto inicial do adversário.
 * Promoções entram no saldo de pontos (uma dama a mais conta 9), como no chess.com.
 */
export function materialFromFen(fen: string): Material {
  const count = { w: { p: 0, n: 0, b: 0, r: 0, q: 0 }, b: { p: 0, n: 0, b: 0, r: 0, q: 0 } };
  for (const ch of fen.split(' ')[0]) {
    const t = ch.toLowerCase() as CapturedType;
    if (!(t in START)) continue;
    count[ch === t ? 'b' : 'w'][t]++;
  }
  const missing = (side: 'w' | 'b') =>
    TYPES.flatMap((t) => Array<CapturedType>(Math.max(0, START[t] - count[side][t])).fill(t));
  const points = (side: 'w' | 'b') => TYPES.reduce((s, t) => s + count[side][t] * VALUES[t], 0);
  return { captured: { w: missing('b'), b: missing('w') }, diff: points('w') - points('b') };
}

/** Dados para a faixa do jogador `color` (peças que ele capturou e a vantagem dele). */
export function capturedFor(m: Material, color: 'w' | 'b') {
  return {
    pieces: m.captured[color],
    pieceColor: color === 'w' ? ('b' as const) : ('w' as const),
    advantage: color === 'w' ? m.diff : -m.diff,
  };
}
