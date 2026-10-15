import type { GameSummary } from './api';

export type Outcome = 'win' | 'loss' | 'draw';

/** Resultado do ponto de vista do jogador (ou neutro, se ele não jogou). */
export function outcomeFor(g: GameSummary, userId: string): { text: string; short: string; kind: Outcome } {
  if (g.result === '1/2-1/2') return { text: 'Empate', short: '½', kind: 'draw' };
  if (g.result === '*') return { text: 'Não terminada', short: '*', kind: 'draw' };
  const meWhite = g.white.userId === userId;
  const meBlack = g.black.userId === userId && !meWhite;
  if (!meWhite && !meBlack) return { text: g.result, short: g.result, kind: 'draw' };
  const won = (g.result === '1-0') === meWhite;
  return won ? { text: 'Vitória', short: 'V', kind: 'win' } : { text: 'Derrota', short: 'D', kind: 'loss' };
}

export function mySide(g: GameSummary, userId: string): 'white' | 'black' {
  return g.white.userId === userId ? 'white' : 'black';
}

export function opponentName(g: GameSummary, userId: string): string {
  return mySide(g, userId) === 'white' ? g.black.name : g.white.name;
}

export const OUTCOME_PALETTE: Record<Outcome, string> = { win: 'jade', loss: 'red', draw: 'gray' };

/** "hoje", "ontem", "há 3 dias" ou a data. */
export function relativeDay(iso: string): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(new Date()) - start(d)) / 86_400_000);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 7) return `há ${days} dias`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
