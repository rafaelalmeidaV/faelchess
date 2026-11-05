import { Chess } from 'chess.js';
import {
  boardOutcome,
  classifyMove,
  sandboxFen,
  terminalEval,
  type Eval,
  type MoveAnalysis,
  type PvLine,
  type Sandbox,
} from '@faelchess/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BrowserEngine } from './engine';

/** Rasa de propósito: o sandbox é para pensar, não para precisão (como o bot e a dica). */
const SANDBOX_DEPTH = 12;
/** 2 linhas bastam para saber se o lance era o único bom ("Ótimo") e comparar com o melhor. */
const SANDBOX_LINES = 2;

export interface PositionAnalysis {
  /** Melhores linhas (avaliação do ponto de vista das brancas). Vazio se a partida acabou ali ou a análise falhou. */
  lines: PvLine[];
  /** Avaliação quando a partida acabou na posição (mate, afogamento, empate). */
  terminal?: Eval;
}

const evalOf = (a: PositionAnalysis | undefined) => a?.lines[0]?.eval ?? a?.terminal;

/** Classifica cada lance do sandbox que já tem a posição de antes e a de depois analisadas. */
export function classifySandbox(
  sb: Sandbox,
  get: (fen: string) => PositionAnalysis | undefined,
  realPrev?: { uci: string; san: string },
): (MoveAnalysis | null)[] {
  return sb.moves.map((m, i) => {
    const fenBefore = i === 0 ? sb.baseFen : sb.moves[i - 1].fen;
    const before = get(fenBefore);
    const after = get(m.fen);
    const evalAfter = evalOf(after);
    if (!before || before.lines.length === 0 || !evalAfter) return null;
    const prev = i === 0 ? realPrev : sb.moves[i - 1];
    try {
      return classifyMove({
        fenBefore,
        playedUci: m.uci,
        ply: sb.base + 2 + i,
        linesBefore: before.lines,
        evalAfter,
        lineAfter: after?.lines[0]?.pv,
        prevMove: prev ? { to: prev.uci.slice(2, 4), captured: prev.san.includes('x') } : undefined,
      });
    } catch {
      return null;
    }
  });
}

/** "21. dxe5" ou "21... Qxd3": número e cor de quem jogou o lance `i` do sandbox. */
export function sandboxMoveLabel(sb: Sandbox, i: number): string {
  const chess = new Chess(i === 0 ? sb.baseFen : sb.moves[i - 1].fen);
  return `${chess.moveNumber()}${chess.turn() === 'w' ? '.' : '...'} ${sb.moves[i].san}`;
}

/** Última avaliação disponível na ramificação: a barra de avaliação não volta ao meio enquanto o motor pensa. */
function lastKnownEval(cache: Map<string, PositionAnalysis>, sb: Sandbox | null): Eval | undefined {
  if (!sb) return undefined;
  for (let i = sb.moves.length - 1; i >= 0; i--) {
    const e = evalOf(cache.get(sb.moves[i].fen));
    if (e) return e;
  }
  return evalOf(cache.get(sb.baseFen));
}

/**
 * Analisa no navegador as posições do sandbox (a de partida e cada lance jogado), uma vez cada, e
 * guarda o resultado. A posição na tela vai primeiro (seta e barra); as outras servem para classificar os lances.
 * Posição nova corta a busca anterior (`stop`) e descarta o que ela devolver depois.
 */
export function useSandboxEngine(sandbox: Sandbox | null, realPrev?: { uci: string; san: string }) {
  const engine = useRef<BrowserEngine | null>(null);
  const cache = useRef(new Map<string, PositionAnalysis>());
  // Muda quando o cache muda: é o que faz o React recalcular os valores derivados abaixo.
  const [version, setVersion] = useState(0);

  // Outra posição de partida (outro lance real): o cache da ramificação anterior não vale mais.
  const baseKey = sandbox ? `${sandbox.baseFen}|${sandbox.base}` : '';
  useEffect(() => {
    cache.current.clear();
    setVersion((v) => v + 1);
  }, [baseKey]);

  useEffect(
    () => () => {
      engine.current?.destroy();
      engine.current = null;
    },
    [],
  );

  // Posições da ramificação; a da tela vai na frente. (Chave de texto para o efeito só rodar quando muda.)
  const fensKey = sandbox ? [...new Set([sandboxFen(sandbox), ...sandbox.moves.map((m) => m.fen), sandbox.baseFen])].join('#') : '';

  useEffect(() => {
    if (!fensKey) {
      engine.current?.stop();
      return;
    }
    const pending: string[] = [];
    for (const fen of fensKey.split('#')) {
      if (cache.current.has(fen)) continue;
      // Posição que já acabou (mate, afogamento, empate): não há o que perguntar ao motor.
      const chess = new Chess(fen);
      if (boardOutcome(chess) || chess.isGameOver()) {
        cache.current.set(fen, { lines: [], terminal: terminalEval(chess.isCheckmate() ? 'checkmate' : 'draw', chess.turn()) });
      } else pending.push(fen);
    }
    setVersion((v) => v + 1);
    if (pending.length === 0) return;

    let cancelled = false;
    engine.current ??= new BrowserEngine();
    engine.current.stop();
    void (async () => {
      for (const fen of pending) {
        if (cancelled) return;
        try {
          const lines = await engine.current!.analyse(fen, SANDBOX_DEPTH, SANDBOX_LINES);
          if (cancelled) return;
          cache.current.set(fen, { lines });
        } catch {
          // Falhou: guarda vazio para esta posição não ficar "analisando" para sempre.
          if (cancelled) return;
          cache.current.set(fen, { lines: [] });
        }
        setVersion((v) => v + 1);
      }
    })();
    return () => {
      cancelled = true;
      engine.current?.stop();
    };
  }, [fensKey]);

  const current = sandbox ? sandboxFen(sandbox) : null;
  const analysis = current ? cache.current.get(current) : undefined;
  const classes = useMemo(
    () => (sandbox ? classifySandbox(sandbox, (f) => cache.current.get(f), realPrev) : []),
    // `version` representa o conteúdo do cache (que vive em um ref).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sandbox, version, realPrev?.uci],
  );

  return {
    /** Avaliação da posição na tela, ou a última conhecida enquanto o motor pensa. */
    eval: evalOf(analysis) ?? lastKnownEval(cache.current, sandbox),
    /** Melhor lance (UCI) de quem está para jogar na posição da tela. */
    best: analysis?.lines[0]?.pv[0],
    thinking: !!current && !analysis,
    /** Classificação de cada lance do sandbox (null enquanto falta analisar a posição de antes ou a de depois). */
    classes,
  };
}
