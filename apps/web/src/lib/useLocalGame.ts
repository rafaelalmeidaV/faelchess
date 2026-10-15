import { Chess } from 'chess.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  START_FEN,
  boardOutcome,
  hasMatingMaterial,
  parseUci,
  type Color,
  type CreateGameInput,
  type GameResult,
  type PlayerInfo,
  type Termination,
  type TimeControl,
} from '@faelchess/shared';

export interface LocalGameConfig {
  type: 'bot' | 'local';
  white: PlayerInfo;
  black: PlayerInfo;
  timeControl?: TimeControl;
  startFen?: string;
}

export interface PlayedMove {
  uci: string;
  san: string;
  timeSpentMs: number;
  clockMs?: number;
}

export type Status = 'playing' | 'over';

export function useLocalGame(config: LocalGameConfig) {
  const startFen = config.startFen ?? START_FEN;
  const chessRef = useRef(new Chess(startFen));
  const startedAt = useRef(new Date());
  const turnStartedAt = useRef(performance.now());
  const tc = config.timeControl;

  const [fen, setFen] = useState(startFen);
  const [moves, setMoves] = useState<PlayedMove[]>([]);
  const [clocks, setClocks] = useState<Record<Color, number>>({ w: tc?.baseMs ?? 0, b: tc?.baseMs ?? 0 });
  const [status, setStatus] = useState<Status>('playing');
  const [result, setResult] = useState<GameResult>('*');
  const [termination, setTermination] = useState<Termination>('unterminated');
  const [finishedAt, setFinishedAt] = useState<Date | null>(null);
  const [now, setNow] = useState(performance.now());

  const turn = chessRef.current.turn();

  const end = useCallback((res: GameResult, term: Termination) => {
    setStatus('over');
    setResult(res);
    setTermination(term);
    setFinishedAt(new Date());
  }, []);

  /** Tempo restante de um lado agora (desconta o tempo do lance em andamento). */
  const remaining = useCallback(
    (color: Color) => {
      if (!tc) return undefined;
      const base = clocks[color];
      return status === 'playing' && color === turn ? Math.max(0, base - (now - turnStartedAt.current)) : base;
    },
    [clocks, now, status, tc, turn],
  );

  // Relógio: só re-renderiza enquanto há relógio e jogo em andamento.
  useEffect(() => {
    if (!tc || status !== 'playing') return;
    const id = setInterval(() => setNow(performance.now()), 100);
    return () => clearInterval(id);
  }, [tc, status]);

  // Queda de bandeira.
  useEffect(() => {
    if (!tc || status !== 'playing') return;
    if (clocks[turn] - (now - turnStartedAt.current) > 0) return;
    const winner: Color = turn === 'w' ? 'b' : 'w';
    if (!hasMatingMaterial(chessRef.current, winner)) end('1/2-1/2', 'timeout');
    else end(winner === 'w' ? '1-0' : '0-1', 'timeout');
  }, [now, tc, status, clocks, turn, end]);

  const makeMove = useCallback(
    (uci: string): boolean => {
      if (status !== 'playing') return false;
      const chess = chessRef.current;
      const color = chess.turn();
      const t = performance.now();
      const spent = Math.round(t - turnStartedAt.current);
      if (tc && clocks[color] - spent <= 0) return false; // a bandeira cai no efeito acima

      let mv;
      try {
        mv = chess.move(parseUci(uci));
      } catch {
        return false;
      }
      turnStartedAt.current = t;
      setNow(t);

      let clockMs: number | undefined;
      if (tc) {
        clockMs = clocks[color] - spent + tc.incrementMs;
        setClocks((c) => ({ ...c, [color]: clockMs! }));
      }
      setMoves((m) => [...m, { uci: mv.lan, san: mv.san, timeSpentMs: spent, clockMs }]);
      setFen(chess.fen());

      const outcome = boardOutcome(chess);
      if (outcome) end(outcome.result, outcome.termination);
      return true;
    },
    [status, tc, clocks, end],
  );

  const resign = useCallback(
    (color: Color) => {
      if (status === 'playing') end(color === 'w' ? '0-1' : '1-0', 'resign');
    },
    [status, end],
  );

  const agreeDraw = useCallback(() => {
    if (status === 'playing') end('1/2-1/2', 'agreement');
  }, [status, end]);

  const toCreateInput = useCallback(
    (): CreateGameInput => ({
      type: config.type,
      white: config.white,
      black: config.black,
      result,
      termination,
      ...(config.startFen ? { startFen: config.startFen } : {}),
      moves: moves.map(({ uci, timeSpentMs, clockMs }) => ({ uci, timeSpentMs, ...(clockMs !== undefined ? { clockMs } : {}) })),
      ...(tc ? { timeControl: tc } : {}),
      startedAt: startedAt.current.toISOString(),
      finishedAt: (finishedAt ?? new Date()).toISOString(),
    }),
    [config, result, termination, moves, tc, finishedAt],
  );

  const last = moves.at(-1);
  return {
    chess: chessRef.current,
    startFen,
    fen,
    turn,
    moves,
    status,
    result,
    termination,
    lastMove: last ? ([last.uci.slice(0, 2), last.uci.slice(2, 4)] as [string, string]) : undefined,
    inCheck: chessRef.current.inCheck(),
    remaining,
    makeMove,
    resign,
    agreeDraw,
    toCreateInput,
  };
}
