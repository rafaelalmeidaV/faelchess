import { Chess } from 'chess.js';
import { playUci } from './board';

/**
 * Sandbox da análise: uma ramificação que nasce de um lance real da partida e onde dá para jogar
 * qualquer lance, dos dois lados. Nada disso é salvo: some ao navegar pela partida.
 */
export interface SandboxMove {
  uci: string;
  san: string;
  /** Posição depois deste lance. */
  fen: string;
}

export interface Sandbox {
  /** Índice do último lance REAL antes do desvio (-1 = posição inicial). */
  base: number;
  baseFen: string;
  moves: SandboxMove[];
  /** Lance da ramificação que está na tela (sempre >= 0: sem lances, o sandbox deixa de existir). */
  cursor: number;
}

function step(fen: string, uci: string): SandboxMove | null {
  const chess = new Chess(fen);
  const mv = playUci(chess, uci);
  return mv ? { uci, san: mv.san, fen: chess.fen() } : null;
}

/** Primeiro lance diferente do real: cria o sandbox. null se o lance for ilegal. */
export function startSandbox(baseFen: string, base: number, uci: string): Sandbox | null {
  const first = step(baseFen, uci);
  return first ? { base, baseFen, moves: [first], cursor: 0 } : null;
}

export function sandboxFen(sb: Sandbox): string {
  return sb.moves[sb.cursor].fen;
}

/** Joga a partir do lance que está na tela; o que vinha depois dele na ramificação é descartado. */
export function playInSandbox(sb: Sandbox, uci: string): Sandbox | null {
  const next = step(sandboxFen(sb), uci);
  return next ? { ...sb, moves: [...sb.moves.slice(0, sb.cursor + 1), next], cursor: sb.cursor + 1 } : null;
}

/** Desfaz o lance da tela. null = não sobrou nada (volta para a partida real). */
export function undoSandbox(sb: Sandbox): Sandbox | null {
  return sb.cursor <= 0 ? null : { ...sb, moves: sb.moves.slice(0, sb.cursor), cursor: sb.cursor - 1 };
}

/** Mostra outro lance da ramificação (sem apagar nada). */
export function selectInSandbox(sb: Sandbox, cursor: number): Sandbox {
  return { ...sb, cursor: Math.max(0, Math.min(sb.moves.length - 1, cursor)) };
}

export interface BranchToken {
  /** Índice do lance dentro da ramificação. */
  i: number;
  san: string;
  /** "21." (brancas) ou "21..." (pretas que abrem a ramificação); ausente no resto. */
  number?: string;
}

/** Numera os lances da ramificação como numa linha de variante ("21. dxe5 xd3 22. e2 ..."). */
export function branchTokens(base: number, startsWithBlack: boolean, sans: string[]): BranchToken[] {
  const offset = startsWithBlack ? 1 : 0;
  return sans.map((san, i) => {
    const slot = base + 1 + i + offset;
    const white = slot % 2 === 0;
    const full = Math.floor(slot / 2) + 1;
    if (white) return { i, san, number: `${full}.` };
    return i === 0 ? { i, san, number: `${full}...` } : { i, san };
  });
}
