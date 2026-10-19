import { Chess, type Square } from 'chess.js';
import {
  PIECE_VALUES,
  detectPhase,
  materialBalance,
  opposite,
  playUci,
  uciToSan,
} from './board';
import { evalScore, moveAccuracy, winPctFor } from './eval';
import type { Classification, Color, Eval, MoveAnalysis, MoveTag, Phase, PvLine } from './types';

/**
 * Limites superiores de perda de win% para cada classificação.
 * Começam com os valores do handoff; calibrar com partidas reais.
 */
export const LOSS_THRESHOLDS = {
  excellent: 2,
  good: 5,
  inaccuracy: 10,
  mistake: 20,
};

/** Diferença mínima de win% entre o melhor e o 2º melhor lance para um lance ser "Ótimo". */
export const GREAT_MIN_GAP = 15;
/** Brilhante só se quem jogou não estava ganhando de lavada antes. */
export const BRILLIANT_MAX_WINPCT_BEFORE = 90;
/** E se a posição depois do sacrifício fica boa ou ganhando. */
export const BRILLIANT_MIN_WINPCT_AFTER = 50;
/** Saldo de material (em peões) que caracteriza um sacrifício. */
export const SACRIFICE_MIN_MATERIAL = 2;

export interface ClassifyInput {
  fenBefore: string;
  playedUci: string;
  ply: number;
  /** MultiPV da posição antes do lance, ordenado do melhor para o pior. Avaliações do ponto de vista das brancas. */
  linesBefore: PvLine[];
  /** Avaliação da posição depois do lance (ponto de vista das brancas). */
  evalAfter: Eval;
  /** Melhor linha do engine a partir da posição depois do lance (o adversário joga primeiro). */
  lineAfter?: string[];
  /** Lance anterior do adversário, para reconhecer recapturas. */
  prevMove?: { to: string; captured: boolean };
  /** Fase vinda de divideGame(); sem ela, estima pela posição. */
  phase?: Phase;
}

export function lossToClassification(loss: number): Classification {
  if (loss < LOSS_THRESHOLDS.excellent) return 'excellent';
  if (loss < LOSS_THRESHOLDS.good) return 'good';
  if (loss < LOSS_THRESHOLDS.inaccuracy) return 'inaccuracy';
  if (loss < LOSS_THRESHOLDS.mistake) return 'mistake';
  return 'blunder';
}

const round1 = (n: number) => Math.round(n * 10) / 10;

const SEVERITY: Classification[] = ['inaccuracy', 'mistake', 'blunder'];

/** Avaliação do ponto de vista de `color`: centipawns, ou mate a favor (+) / contra (-). */
function povScore(e: Eval, color: Color): { cp?: number; mate?: number } {
  if (e.mate === undefined) return { cp: (e.cp ?? 0) * (color === 'w' ? 1 : -1) };
  if (e.mate === 0) return { mate: e.winner === color ? 1 : -1 };
  return { mate: e.mate * (color === 'w' ? 1 : -1) };
}

/**
 * Regras de mate do Lichess (MateAdvice): criar um mate contra si ou perder um mate forçado
 * é Capivarada, a menos que a posição já estivesse decidida.
 */
export function mateJudgement(before: Eval, after: Eval, color: Color): Classification | null {
  const b = povScore(before, color);
  const a = povScore(after, color);
  // Mate criado contra quem jogou.
  if (b.cp !== undefined && a.mate !== undefined && a.mate < 0) {
    if (b.cp < -999) return 'inaccuracy';
    if (b.cp < -700) return 'mistake';
    return 'blunder';
  }
  // Mate forçado perdido.
  if (b.mate !== undefined && b.mate > 0) {
    if (a.cp !== undefined) {
      if (a.cp > 999) return 'inaccuracy';
      if (a.cp > 700) return 'mistake';
      return 'blunder';
    }
    if (a.mate !== undefined && a.mate < 0) return 'blunder';
  }
  return null;
}

function worse(a: Classification, b: Classification | null): Classification {
  if (!b) return a;
  return SEVERITY.indexOf(b) > SEVERITY.indexOf(a) ? b : a;
}

export function classifyMove(input: ClassifyInput): MoveAnalysis {
  const { fenBefore, playedUci, linesBefore, evalAfter } = input;
  if (linesBefore.length === 0) throw new Error(`Sem linhas do engine para ${fenBefore}`);

  const before = new Chess(fenBefore);
  const color = before.turn();
  const legalMoves = before.moves().length;
  const best = linesBefore[0];
  const bestMove = best.pv[0];

  const winPctBefore = winPctFor(best.eval, color);
  const winPctAfter = winPctFor(evalAfter, color);

  const playedLine = linesBefore.find((l) => l.pv[0] === playedUci);
  const isBest =
    playedUci === bestMove ||
    (playedLine !== undefined && evalScore(playedLine.eval, color) >= evalScore(best.eval, color));

  // Se o lance jogado é o melhor, a perda é zero por definição: evita ruído entre
  // a avaliação da raiz e a da posição seguinte (buscas diferentes).
  const winPctLoss = isBest ? 0 : Math.max(0, winPctBefore - winPctAfter);

  const tags = new Set<MoveTag>();
  const played = new Chess(fenBefore);
  const mv = playUci(played, playedUci);
  if (!mv) throw new Error(`Lance ilegal ${playedUci} em ${fenBefore}`);
  if (played.inCheck()) tags.add('check');

  const isRecapture = !!input.prevMove?.captured && mv.isCapture() && mv.to === input.prevMove.to;
  if (isRecapture) tags.add('recapture');

  const gap =
    linesBefore.length >= 2 ? winPctFor(best.eval, color) - winPctFor(linesBefore[1].eval, color) : 0;
  const onlyMove = isBest && legalMoves >= 2 && linesBefore.length >= 2 && gap >= GREAT_MIN_GAP;
  if (onlyMove) tags.add('only_move');
  // Mate em 1 é "único" mas óbvio: não merece Ótimo.
  const deliversMate = played.isCheckmate();

  // Entregar material num lance ruim é peça pendurada, não sacrifício.
  const sacrifice =
    winPctLoss < LOSS_THRESHOLDS.good && detectSacrifice(fenBefore, playedUci, input.lineAfter ?? []);
  if (sacrifice) tags.add('sacrifice');

  let classification: Classification = isBest ? 'best' : lossToClassification(winPctLoss);
  if (!isBest) classification = worse(classification, mateJudgement(best.eval, evalAfter, color));

  if (
    sacrifice &&
    !isRecapture &&
    legalMoves >= 2 &&
    winPctLoss < LOSS_THRESHOLDS.excellent &&
    winPctAfter >= BRILLIANT_MIN_WINPCT_AFTER &&
    winPctBefore < BRILLIANT_MAX_WINPCT_BEFORE
  ) {
    classification = 'brilliant';
  } else if (onlyMove && !isRecapture && !deliversMate) {
    classification = 'great';
  }

  if (SEVERITY.includes(classification)) {
    for (const t of errorTags(input, color)) tags.add(t);
  }

  return {
    evalBefore: best.eval,
    evalAfter,
    bestMove,
    bestMoveSan: uciToSan(fenBefore, bestMove),
    bestEval: best.eval,
    bestLine: best.pv.slice(0, 12),
    winPctBefore: round1(winPctBefore),
    winPctAfter: round1(winPctAfter),
    winPctLoss: round1(winPctLoss),
    accuracy: round1(moveAccuracy(winPctLoss)),
    classification,
    tags: [...tags],
    phase: input.phase ?? detectPhase(fenBefore, input.ply),
  };
}

/** Joga uma sequência de lances UCI e devolve o saldo de material de `color` depois de cada um. */
function materialAlong(fen: string, line: string[], color: Color): number[] {
  const chess = new Chess(fen);
  const out: number[] = [];
  for (const uci of line) {
    if (!playUci(chess, uci)) break;
    out.push(materialBalance(chess, color));
  }
  return out;
}

/**
 * Sacrifício: depois do lance, quem jogou fica com material a menos de forma "voluntária".
 * Dois sinais (aproximação, o chess.com não publica a regra):
 * 1. Na linha principal, o adversário captura a peça que acabou de se mover e o déficit continua
 *    depois da nossa resposta (capturas de outras peças são ameaças antigas, não sacrifício).
 * 2. A peça movida (>= 3) fica oferecida: atacada por peça de menor valor, ou atacada e sem defesa,
 *    e o que ela capturou vale bem menos que ela.
 */
export function detectSacrifice(fenBefore: string, playedUci: string, lineAfter: string[]): boolean {
  const chess = new Chess(fenBefore);
  const color = chess.turn();
  const m0 = materialBalance(chess, color);
  const mv = playUci(chess, playedUci);
  if (!mv) return false;

  // Sinal 1: a peça movida é capturada e o material NÃO volta em nenhum lance nosso da linha do engine
  // (até 4 lances nossos). Retomadas atrasadas, ex.: 20.Nf5 Bxf5 21.Qf2 Bh6+ 22.Kb1 b6 23.exf5, são troca.
  const mats = materialAlong(chess.fen(), lineAfter.slice(0, 8), color);
  const takesMovedPiece = lineAfter[0]?.slice(2, 4) === mv.to;
  if (takesMovedPiece && mats.length >= 1 && m0 - mats[0] >= SACRIFICE_MIN_MATERIAL) {
    const afterOurMoves = mats.filter((_, i) => i % 2 === 1);
    if (afterOurMoves.every((x) => m0 - x >= SACRIFICE_MIN_MATERIAL)) return true;
  }

  // Sinal 2: peça oferecida.
  const piece = chess.get(mv.to);
  if (!piece || piece.type === 'k' || piece.type === 'p') return false;
  // Peça recém-promovida: o que está em jogo é o peão que virou dama, não a dama (28...a1=Q não sacrifica 9).
  const value = mv.promotion ? PIECE_VALUES.p : PIECE_VALUES[piece.type];
  const capturedValue = mv.captured ? PIECE_VALUES[mv.captured] : 0;
  if (value - capturedValue < SACRIFICE_MIN_MATERIAL) return false;

  // Só capturas LEGAIS do adversário: uma peça cravada no rei "ataca" a casa mas não pode capturar,
  // e o rei não captura peça defendida. (É a vez do adversário depois do nosso lance.)
  const captures = chess.moves({ verbose: true }).filter((m) => m.to === mv.to);
  if (captures.length === 0) return false;
  const defended = chess.attackers(mv.to, color).length > 0;
  const cheapestAttacker = Math.min(...captures.map((m) => (m.piece === 'k' ? 0 : PIECE_VALUES[m.piece])));
  return !defended || cheapestAttacker < value;
}

/** Quantas peças valiosas (ou o rei) a peça em `sq` ataca ao mesmo tempo. */
export function forkTargets(chess: Chess, sq: Square): number {
  const attacker = chess.get(sq);
  if (!attacker) return 0;
  const attackerValue = attacker.type === 'k' ? 100 : PIECE_VALUES[attacker.type];
  const victim = opposite(attacker.color);
  let count = 0;
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell || cell.color !== victim || cell.type === 'p') continue;
      if (!chess.attackers(cell.square, attacker.color).includes(sq)) continue;
      if (cell.type === 'k') count++;
      else if (PIECE_VALUES[cell.type] > attackerValue || chess.attackers(cell.square, victim).length === 0) {
        count++;
      }
    }
  }
  return count;
}

function createsFork(fen: string, uci: string): boolean {
  const chess = new Chess(fen);
  const mv = playUci(chess, uci);
  return !!mv && forkTargets(chess, mv.to) >= 2;
}

function isMateFor(e: Eval, color: Color): boolean {
  if (e.mate === undefined) return false;
  if (e.mate === 0) return e.winner === color;
  return color === 'w' ? e.mate > 0 : e.mate < 0;
}

/** Tags que explicam um lance ruim (imprecisão para baixo). */
function errorTags(input: ClassifyInput, color: Color): MoveTag[] {
  const tags: MoveTag[] = [];
  const { fenBefore, playedUci, linesBefore, evalAfter } = input;
  const best = linesBefore[0];
  const opp = opposite(color);
  const lineAfter = input.lineAfter ?? [];

  if (isMateFor(best.eval, color) && !isMateFor(evalAfter, color)) tags.push('missed_mate');
  if (isMateFor(evalAfter, opp) && !isMateFor(best.eval, opp)) tags.push('allowed_mate');

  const m0 = materialBalance(new Chess(fenBefore), color);

  // Material perdido logo após o lance (adversário captura, nós respondemos, adversário de novo).
  const playedMats = materialAlong(fenBefore, [playedUci, ...lineAfter.slice(0, 3)], color);
  const playedLow = playedMats.length > 1 ? Math.min(...playedMats.slice(1)) : m0;
  const playedEnd = playedMats.at(-1) ?? m0;
  if (m0 - playedLow >= SACRIFICE_MIN_MATERIAL && m0 - playedEnd >= SACRIFICE_MIN_MATERIAL) {
    tags.push('hung_piece');
  }

  // Garfo do adversário na resposta (ou no lance seguinte dele, depois de um xeque).
  const afterPlayed = new Chess(fenBefore);
  playUci(afterPlayed, playedUci);
  for (let i = 0; i < Math.min(lineAfter.length, 3); i += 2) {
    const fen = afterPlayed.fen();
    if (createsFork(fen, lineAfter[i])) {
      tags.push('allowed_fork');
      break;
    }
    if (!playUci(afterPlayed, lineAfter[i]) || (lineAfter[i + 1] && !playUci(afterPlayed, lineAfter[i + 1]))) break;
  }

  if (createsFork(fenBefore, best.pv[0]) && !createsFork(fenBefore, playedUci)) tags.push('missed_fork');

  // Melhor linha ganhava material e a jogada não.
  const bestMats = materialAlong(fenBefore, best.pv.slice(0, 4), color);
  const bestGain = (bestMats.at(-1) ?? m0) - m0;
  if (bestGain >= SACRIFICE_MIN_MATERIAL && bestGain - (playedEnd - m0) >= SACRIFICE_MIN_MATERIAL) {
    tags.push('missed_material');
  }

  return tags;
}

/** Contagem zerada por classificação. */
export function emptyCounts(): Record<Classification, number> {
  return {
    brilliant: 0,
    great: 0,
    best: 0,
    excellent: 0,
    good: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
  };
}
