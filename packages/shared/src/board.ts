import { Chess, type Square, type PieceSymbol } from 'chess.js';
import type { Color, GameResult, MoveRecord, Phase, Termination } from './types';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const PIECE_VALUES: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** FEN sem os contadores de meio-lance e de lance: chave do cache `positions`. */
export function normalizeFen(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

export function sideToMove(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

export function opposite(c: Color): Color {
  return c === 'w' ? 'b' : 'w';
}

export interface ParsedUci {
  from: Square;
  to: Square;
  promotion?: string;
}

export function parseUci(uci: string): ParsedUci {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: uci.length > 4 ? uci[4] : undefined,
  };
}

/** Joga um lance UCI; devolve o Move do chess.js ou null se for ilegal. */
export function playUci(chess: Chess, uci: string) {
  try {
    return chess.move(parseUci(uci));
  } catch {
    return null;
  }
}

/** Saldo de material (P=1, N=B=3, R=5, Q=9) do ponto de vista de `color`. */
export function materialBalance(chess: Chess, color: Color): number {
  let sum = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq) continue;
      sum += (sq.color === color ? 1 : -1) * PIECE_VALUES[sq.type];
    }
  }
  return sum;
}

/** O lado consegue dar mate com o que tem? (Queda de bandeira contra quem não pode dar mate é empate.) */
export function hasMatingMaterial(chess: Chess, color: Color): boolean {
  let minors = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== color || sq.type === 'k') continue;
      if (sq.type === 'p' || sq.type === 'r' || sq.type === 'q') return true;
      minors++;
    }
  }
  return minors >= 2;
}

/** Material sem peões e reis, somando os dois lados (62 na posição inicial). */
export function nonPawnMaterial(chess: Chess): number {
  let sum = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (sq && sq.type !== 'p') sum += PIECE_VALUES[sq.type];
    }
  }
  return sum;
}

/**
 * Fase da partida, aproximada:
 * - final: material de peças (sem peões) somado <= 26 (ex.: torre + bispo + cavalo de cada lado), ou sem damas e <= 32;
 * - abertura: até o lance 12 e quase todo o material ainda em jogo;
 * - o resto é meio-jogo.
 */
export function detectPhase(fen: string, ply: number): Phase {
  const chess = new Chess(fen);
  const npm = nonPawnMaterial(chess);
  const hasQueens = fen.split(' ')[0].toLowerCase().includes('q');
  if (npm <= 26 || (!hasQueens && npm <= 32)) return 'endgame';
  if (ply < 24 && npm >= 52) return 'opening';
  return 'middlegame';
}

/**
 * Reconstrói os lances a partir de UCI, validando cada um com chess.js.
 * Lança erro se algum lance for ilegal.
 */
export function buildMoveRecords(
  moves: { uci: string; timeSpentMs?: number; clockMs?: number }[],
  startFen: string = START_FEN,
): { records: MoveRecord[]; chess: Chess } {
  const chess = new Chess(startFen);
  const records: MoveRecord[] = moves.map((m, i) => {
    const fenBefore = chess.fen();
    const mv = playUci(chess, m.uci);
    if (!mv) throw new Error(`Lance ilegal no ply ${i + 1}: ${m.uci}`);
    const record: MoveRecord = {
      ply: i + 1,
      san: mv.san,
      uci: mv.lan,
      color: mv.color,
      fenBefore,
      fenAfter: mv.after,
    };
    if (m.timeSpentMs !== undefined) record.timeSpentMs = Math.max(0, Math.round(m.timeSpentMs));
    if (m.clockMs !== undefined) record.clockMs = Math.max(0, Math.round(m.clockMs));
    return record;
  });
  return { records, chess };
}

/** Resultado "natural" da posição final, se o jogo acabou pelas regras. */
export function boardOutcome(chess: Chess): { result: GameResult; termination: Termination } | null {
  if (chess.isCheckmate()) {
    return { result: chess.turn() === 'w' ? '0-1' : '1-0', termination: 'checkmate' };
  }
  if (chess.isStalemate()) return { result: '1/2-1/2', termination: 'stalemate' };
  if (chess.isInsufficientMaterial()) return { result: '1/2-1/2', termination: 'insufficient' };
  if (chess.isThreefoldRepetition()) return { result: '1/2-1/2', termination: 'threefold' };
  if (chess.isDrawByFiftyMoves()) return { result: '1/2-1/2', termination: 'fifty-moves' };
  return null;
}

/** Converte uma linha UCI em SAN a partir de um FEN (para exibir a linha do engine). */
export function uciLineToSan(fen: string, line: string[], max = line.length): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const uci of line.slice(0, max)) {
    const mv = playUci(chess, uci);
    if (!mv) break;
    out.push(mv.san);
  }
  return out;
}

export function uciToSan(fen: string, uci: string): string {
  return uciLineToSan(fen, [uci], 1)[0] ?? uci;
}
