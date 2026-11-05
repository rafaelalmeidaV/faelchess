import { Chess, type Square } from 'chess.js';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { mateBadgeSvg, winnerBadgeSvg } from './labels';

function kingSquare(chess: Chess, color: 'w' | 'b'): Square | undefined {
  return chess.board().flat().find((p) => p?.type === 'k' && p.color === color)?.square;
}

/**
 * Xeque-mate na posição: selo vermelho no rei de quem levou o mate e selo verde de coroa no rei de quem
 * deu o mate (como no chess.com). Vazio se a posição não é mate.
 */
export function mateShapes(fen: string): DrawShape[] {
  const chess = new Chess(fen);
  if (!chess.isCheckmate()) return [];
  const loser = chess.turn();
  const mated = kingSquare(chess, loser);
  const winner = kingSquare(chess, loser === 'w' ? 'b' : 'w');
  const out: DrawShape[] = [];
  if (mated) out.push({ orig: mated as Key, customSvg: { html: mateBadgeSvg() } });
  if (winner) out.push({ orig: winner as Key, customSvg: { html: winnerBadgeSvg() } });
  return out;
}
