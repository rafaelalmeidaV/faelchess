import { Chess } from 'chess.js';
import { useEffect, useMemo, useRef, useState } from 'react';
import { classifyMove, parseUci, terminalEval, type Eval, type MoveAnalysis, type PvLine } from '@faelchess/shared';
import { BrowserEngine } from './engine';

/** Profundidade do modo treino: rápida no navegador; a análise completa vem do worker depois. */
const DEPTH = 12;
/** Duas linhas bastam para reconhecer o "Ótimo" (único lance bom). */
const MULTI_PV = 2;

interface PositionEval {
  lines: PvLine[];
  eval: Eval;
}

/** Posição final não vai para o engine: o resultado sai das regras. */
function terminal(fen: string): Eval | null {
  const chess = new Chess(fen);
  if (chess.isCheckmate()) return terminalEval('checkmate', chess.turn());
  if (chess.isStalemate() || chess.isInsufficientMaterial()) return terminalEval('draw', chess.turn());
  return null;
}

/**
 * Modo treino: classifica cada lance logo depois de jogado, com o Stockfish WASM numa instância própria.
 * Devolve uma análise por lance (undefined enquanto aquele lance ainda está sendo avaliado).
 */
export function useTrainingReview(enabled: boolean, startFen: string, moves: { uci: string; san: string }[]) {
  // FENs de todas as posições: inicial + depois de cada lance.
  const fens = useMemo(() => {
    const chess = new Chess(startFen);
    const out = [startFen];
    for (const m of moves) {
      chess.move(parseUci(m.uci));
      out.push(chess.fen());
    }
    return out;
  }, [startFen, moves]);

  const evals = useRef(new Map<string, PositionEval>());
  const [version, setVersion] = useState(0);
  const fensRef = useRef(fens);
  fensRef.current = fens;
  const engineRef = useRef<BrowserEngine | null>(null);
  const running = useRef(false);

  // Engine próprio só enquanto o modo treino está ligado.
  useEffect(() => {
    if (!enabled) return;
    const engine = new BrowserEngine();
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
      running.current = false;
    };
  }, [enabled]);

  // Avalia, em ordem, as posições que ainda não foram avaliadas.
  useEffect(() => {
    if (!enabled || running.current) return;
    const engine = engineRef.current;
    if (!engine) return;
    running.current = true;
    void (async () => {
      try {
        for (;;) {
          const fen = fensRef.current.find((f) => !evals.current.has(f));
          if (!fen || engineRef.current !== engine) break;
          const end = terminal(fen);
          if (end) evals.current.set(fen, { lines: [], eval: end });
          else {
            const lines = await engine.analyse(fen, DEPTH, MULTI_PV);
            if (engineRef.current !== engine) break;
            if (lines.length) evals.current.set(fen, { lines, eval: lines[0].eval });
            else break;
          }
          setVersion((v) => v + 1);
        }
      } finally {
        if (engineRef.current === engine) running.current = false;
      }
    })();
  }, [enabled, fens]);

  const results = useMemo<(MoveAnalysis | undefined)[]>(() => {
    if (!enabled) return [];
    return moves.map((m, i) => {
      const before = evals.current.get(fens[i]);
      const after = evals.current.get(fens[i + 1]);
      if (!before?.lines.length || !after) return undefined;
      const prev = moves[i - 1];
      try {
        return classifyMove({
          fenBefore: fens[i],
          playedUci: m.uci,
          ply: i + 1,
          linesBefore: before.lines,
          evalAfter: after.eval,
          lineAfter: after.lines[0]?.pv,
          prevMove: prev ? { to: prev.uci.slice(2, 4), captured: prev.san.includes('x') } : undefined,
        });
      } catch {
        return undefined;
      }
    });
    // `version` muda a cada posição avaliada (as avaliações ficam num ref).
  }, [enabled, moves, fens, version]);

  return { results, pending: enabled && results.some((r) => !r) };
}
