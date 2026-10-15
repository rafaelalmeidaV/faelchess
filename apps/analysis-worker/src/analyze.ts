import { Chess } from 'chess.js';
import {
  START_FEN,
  classifyMove,
  divideGame,
  emptyCounts,
  gameAccuracyByColor,
  normalizeFen,
  phaseAt,
  terminalEval,
  type Eval,
  type GameAnalysisSummary,
  type GameDoc,
  type MoveRecord,
  type Phase,
  type PositionDoc,
  type PvLine,
  winPctWhite,
} from '@faelchess/shared';
import type { Analyzer } from './engine';

export interface PositionCache {
  get(key: string): Promise<PositionDoc | null>;
  put(doc: PositionDoc): Promise<void>;
}

export interface AnalyzeOptions {
  depth: number;
  multiPv: number;
  onProgress?: (done: number, total: number) => void;
}

interface PositionEval {
  /** Linhas do engine (vazio em posição terminal). */
  lines: PvLine[];
  eval: Eval;
}

/** Posições finais não vão para o engine: o resultado sai das regras. */
function terminal(fen: string): Eval | null {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return terminalEval('checkmate', chess.turn());
  if (chess.isStalemate() || chess.isInsufficientMaterial()) return terminalEval('draw', chess.turn());
  return null;
}

async function evaluate(
  fen: string,
  engine: Analyzer,
  cache: PositionCache,
  opts: AnalyzeOptions,
): Promise<{ result: PositionEval; cached: boolean }> {
  const end = terminal(fen);
  if (end) return { result: { lines: [], eval: end }, cached: true };

  const key = normalizeFen(fen);
  const hit = await cache.get(key);
  // Cache vale se for pelo menos tão profundo e tiver linhas suficientes
  // (ou a posição tem menos lances legais que o MultiPV pedido).
  if (hit && hit.depth >= opts.depth && hit.multiPv.length > 0) {
    const legal = new Chess(fen).moves().length;
    if (hit.multiPv.length >= Math.min(opts.multiPv, legal)) {
      return { result: { lines: hit.multiPv, eval: hit.multiPv[0].eval }, cached: true };
    }
  }

  const lines = await engine.analyse(fen, opts.depth, opts.multiPv);
  if (lines.length === 0) throw new Error(`Engine não devolveu linhas para ${fen}`);
  await cache.put({ _id: key, depth: opts.depth, multiPv: lines, engine: engine.name, evaluatedAt: new Date() });
  return { result: { lines, eval: lines[0].eval }, cached: false };
}

export interface AnalyzeResult {
  moves: MoveRecord[];
  summary: GameAnalysisSummary;
  stats: { positions: number; cacheHits: number };
}

export async function analyzeGame(
  game: Pick<GameDoc, 'moves' | 'startFen'>,
  engine: Analyzer,
  cache: PositionCache,
  opts: AnalyzeOptions,
): Promise<AnalyzeResult> {
  const t0 = Date.now();
  const fens = [game.moves[0]?.fenBefore ?? game.startFen ?? START_FEN, ...game.moves.map((m) => m.fenAfter)];

  const evals: PositionEval[] = [];
  let cacheHits = 0;
  for (let i = 0; i < fens.length; i++) {
    const { result, cached } = await evaluate(fens[i], engine, cache, opts);
    if (cached) cacheHits++;
    evals.push(result);
    opts.onProgress?.(i + 1, fens.length);
  }

  const division = divideGame(fens);
  const counts = { white: emptyCounts(), black: emptyCounts() };

  const moves = game.moves.map((m, i): MoveRecord => {
    const prev = game.moves[i - 1];
    const analysis = classifyMove({
      fenBefore: m.fenBefore,
      playedUci: m.uci,
      ply: m.ply,
      linesBefore: evals[i].lines,
      evalAfter: evals[i + 1].eval,
      lineAfter: evals[i + 1].lines[0]?.pv,
      prevMove: prev ? { to: prev.uci.slice(2, 4), captured: prev.san.includes('x') } : undefined,
      phase: phaseAt(division, i),
    });
    counts[m.color === 'w' ? 'white' : 'black'][analysis.classification]++;
    return { ...m, ...analysis };
  });

  // Precisão da partida e por fase, a partir do win% das brancas em cada posição.
  const winPcts = evals.map((e) => winPctWhite(e.eval));
  const firstMover = game.moves[0]?.color ?? 'w';
  const phaseAccuracy = {} as GameAnalysisSummary['phaseAccuracy'];
  for (const phase of ['opening', 'middlegame', 'endgame'] as Phase[]) {
    const idx = moves.map((m, i) => (m.phase === phase ? i : -1)).filter((i) => i >= 0);
    phaseAccuracy[phase] = idx.length
      ? gameAccuracyByColor(winPcts.slice(idx[0], idx.at(-1)! + 2), moves[idx[0]].color)
      : { white: null, black: null };
  }

  return {
    moves,
    summary: {
      engine: engine.name,
      depth: opts.depth,
      multiPv: opts.multiPv,
      analyzedAt: new Date(),
      durationMs: Date.now() - t0,
      accuracy: gameAccuracyByColor(winPcts, firstMover),
      phaseAccuracy,
      division,
      counts,
    },
    stats: { positions: fens.length, cacheHits },
  };
}
