import type { Color, Eval } from './types';

/** Curva do Lichess: centipawns -> chance de vitória (0-100). */
export function winPctFromCp(cp: number): number {
  const clamped = Math.max(-1000, Math.min(1000, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
}

/** Win% do ponto de vista das brancas. Mate é tratado à parte: 100 ou 0. */
export function winPctWhite(e: Eval): number {
  if (e.mate !== undefined) {
    if (e.mate > 0) return 100;
    if (e.mate < 0) return 0;
    return e.winner === 'b' ? 0 : 100;
  }
  return winPctFromCp(e.cp ?? 0);
}

export function winPctFor(e: Eval, color: Color): number {
  const w = winPctWhite(e);
  return color === 'w' ? w : 100 - w;
}

/**
 * Precisão de um lance a partir da perda de win% (curva ajustada do Lichess).
 * Sem perda é 100; com perda, soma 1 ponto de "incerteza" (a análise não é perfeita).
 */
export function moveAccuracy(winPctLoss: number): number {
  if (winPctLoss <= 0) return 100;
  const acc = 103.1668 * Math.exp(-0.04354 * winPctLoss) - 3.1669 + 1;
  return Math.max(0, Math.min(100, acc));
}

function stdDev(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length);
}

/**
 * Precisão da partida por cor, à moda do Lichess: média entre
 * - a média das precisões ponderada pela volatilidade (desvio-padrão do win% numa janela deslizante),
 *   para que errar numa posição tensa pese mais que numa posição morta;
 * - a média harmônica, que puxa para baixo quem tem poucos lances muito ruins.
 *
 * `winPcts` é o win% das brancas em cada posição (inicial + depois de cada lance).
 */
export function gameAccuracyByColor(
  winPcts: number[],
  firstMover: Color = 'w',
): { white: number | null; black: number | null } {
  const moves = winPcts.length - 1;
  if (moves < 1) return { white: null, black: null };
  const window = Math.max(2, Math.min(8, Math.floor(moves / 10)));
  const weights: number[] = [];
  for (let i = 0; i < moves; i++) {
    // As primeiras janelas repetem o começo da partida para todos os lances terem peso.
    const start = Math.max(0, Math.min(i + 2 - window, winPcts.length - window));
    const slice = winPcts.slice(start, start + window);
    weights.push(Math.max(0.5, Math.min(12, stdDev(slice))));
  }

  const per: Record<Color, { acc: number; w: number }[]> = { w: [], b: [] };
  for (let i = 0; i < moves; i++) {
    const color: Color = (i % 2 === 0) === (firstMover === 'w') ? 'w' : 'b';
    const before = color === 'w' ? winPcts[i] : 100 - winPcts[i];
    const after = color === 'w' ? winPcts[i + 1] : 100 - winPcts[i + 1];
    per[color].push({ acc: moveAccuracy(before - after), w: weights[i] });
  }

  const combine = (xs: { acc: number; w: number }[]) => {
    if (xs.length === 0) return null;
    const weighted = xs.reduce((a, x) => a + x.acc * x.w, 0) / xs.reduce((a, x) => a + x.w, 0);
    // Precisão 0 zeraria a harmônica; o piso de 1 evita divisão por zero sem mudar o espírito.
    const harmonic = xs.length / xs.reduce((a, x) => a + 1 / Math.max(1, x.acc), 0);
    return Math.round(((weighted + harmonic) / 2) * 10) / 10;
  };
  return { white: combine(per.w), black: combine(per.b) };
}

/** Inverte o sinal (usado para converter do lado que joga para o das brancas). */
export function negateEval(e: Eval): Eval {
  if (e.mate !== undefined) {
    return e.mate === 0 ? { mate: 0, winner: e.winner === 'w' ? 'b' : 'w' } : { mate: -e.mate };
  }
  return { cp: -(e.cp ?? 0) };
}

/** Converte score do UCI (sempre do lado que vai jogar) para o ponto de vista das brancas. */
export function toWhitePov(e: Eval, sideToMove: Color): Eval {
  return sideToMove === 'w' ? e : negateEval(e);
}

/** Avaliação de uma posição terminal, do ponto de vista das brancas. */
export function terminalEval(kind: 'checkmate' | 'draw', sideToMove: Color): Eval {
  if (kind === 'draw') return { cp: 0 };
  // Quem está para jogar levou mate.
  return { mate: 0, winner: sideToMove === 'w' ? 'b' : 'w' };
}

/** Ordena avaliações do ponto de vista de `color` (maior = melhor para `color`). */
export function evalScore(e: Eval, color: Color): number {
  const sign = color === 'w' ? 1 : -1;
  if (e.mate !== undefined) {
    if (e.mate === 0) return (e.winner === color ? 1 : -1) * 100000;
    const m = e.mate * sign;
    // Mate mais curto a favor é melhor; mate mais longo contra é "menos pior".
    return m > 0 ? 100000 - m : -100000 - m;
  }
  return (e.cp ?? 0) * sign;
}

export function formatEval(e: Eval | undefined): string {
  if (!e) return '';
  if (e.mate !== undefined) {
    if (e.mate === 0) return e.winner === 'b' ? '0-1' : '1-0';
    const m = Math.abs(e.mate);
    return `${e.mate > 0 ? '' : '-'}M${m}`;
  }
  const v = (e.cp ?? 0) / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(2)}`;
}
