/**
 * Rating de problemas (Glicko-1, um "jogo" por tentativa contra o problema).
 * O problema é tratado como um adversário de rating fixo e desvio pequeno: só o jogador muda.
 */

export const PUZZLE_START_RATING = 1500;
export const PUZZLE_START_RD = 350;
/** Desvio mínimo: o rating continua se mexendo de forma perceptível mesmo depois de muitas tentativas. */
export const PUZZLE_MIN_RD = 60;
const PUZZLE_RD = 60;

const Q = Math.LN10 / 400;
const g = (rd: number) => 1 / Math.sqrt(1 + (3 * Q * Q * rd * rd) / (Math.PI * Math.PI));

export function glickoUpdate(
  player: { rating: number; rd: number },
  puzzleRating: number,
  win: boolean,
): { rating: number; rd: number } {
  const gj = g(PUZZLE_RD);
  const expected = 1 / (1 + 10 ** ((-gj * (player.rating - puzzleRating)) / 400));
  const d2 = 1 / (Q * Q * gj * gj * expected * (1 - expected));
  const denom = 1 / (player.rd * player.rd) + 1 / d2;
  const rating = player.rating + (Q / denom) * gj * ((win ? 1 : 0) - expected);
  const rd = Math.max(PUZZLE_MIN_RD, Math.sqrt(1 / denom));
  return { rating: Math.round(rating), rd: Math.round(rd * 10) / 10 };
}
