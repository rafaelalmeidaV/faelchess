import {
  CLASSIFICATION_LABELS_PT,
  CLASSIFICATIONS,
  formatEval,
  normalizeFen,
  sideToMove,
  uciLineToSan,
  detectPhase,
  type Classification,
  type Color,
  type GameDoc,
  type MoveRecord,
  type Phase,
  type PositionDoc,
} from '@faelchess/shared';
import type { Collection, Filter } from 'mongodb';

export interface Db {
  games: Collection<GameDoc>;
  positions: Collection<PositionDoc>;
}

export interface GameFilters {
  userId: string;
  type?: 'bot' | 'local' | 'online';
  /** Resultado do ponto de vista do usuário. */
  outcome?: 'win' | 'loss' | 'draw';
  color?: 'white' | 'black';
  /** ECO (ex.: B50) ou trecho do nome (ex.: "Sicilian"). */
  opening?: string;
  botEloMin?: number;
  botEloMax?: number;
  from?: string;
  to?: string;
  /** Só partidas já analisadas. */
  analyzedOnly?: boolean;
  /** Máximo de partidas consideradas (as mais recentes). */
  maxGames?: number;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function buildFilter(f: GameFilters): Filter<GameDoc> {
  const and: Filter<GameDoc>[] = [{ userIds: f.userId }];
  if (f.type) and.push({ type: f.type });
  if (f.analyzedOnly) and.push({ analysisStatus: 'done' });
  if (f.color === 'white') and.push({ 'white.userId': f.userId });
  if (f.color === 'black') and.push({ 'black.userId': f.userId, 'white.userId': { $ne: f.userId } });
  if (f.opening) {
    and.push(
      /^[A-E]\d\d$/i.test(f.opening)
        ? { 'opening.eco': f.opening.toUpperCase() }
        : { 'opening.name': { $regex: escapeRegex(f.opening), $options: 'i' } },
    );
  }
  if (f.botEloMin !== undefined || f.botEloMax !== undefined) {
    const range: Record<string, number> = {};
    if (f.botEloMin !== undefined) range.$gte = f.botEloMin;
    if (f.botEloMax !== undefined) range.$lte = f.botEloMax;
    and.push({ $or: [{ 'white.botElo': range }, { 'black.botElo': range }] });
  }
  if (f.from || f.to) {
    const range: Record<string, Date> = {};
    if (f.from) range.$gte = new Date(f.from);
    if (f.to) range.$lte = new Date(f.to);
    and.push({ finishedAt: range });
  }
  if (f.outcome) {
    const asWhite = { 'white.userId': f.userId };
    const asBlack = { 'black.userId': f.userId, 'white.userId': { $ne: f.userId } };
    if (f.outcome === 'draw') and.push({ result: '1/2-1/2' });
    else {
      const whiteWins = f.outcome === 'win' ? '1-0' : '0-1';
      const blackWins = f.outcome === 'win' ? '0-1' : '1-0';
      and.push({ $or: [{ ...asWhite, result: whiteWins }, { ...asBlack, result: blackWins }] });
    }
  }
  return { $and: and };
}

export function userColor(game: Pick<GameDoc, 'white'>, userId: string): Color {
  return game.white.userId === userId ? 'w' : 'b';
}

export function userOutcome(game: Pick<GameDoc, 'white' | 'result'>, userId: string): 'win' | 'loss' | 'draw' | 'unfinished' {
  if (game.result === '*') return 'unfinished';
  if (game.result === '1/2-1/2') return 'draw';
  const c = userColor(game, userId);
  return (game.result === '1-0') === (c === 'w') ? 'win' : 'loss';
}

const opponentOf = (g: GameDoc, c: Color) => (c === 'w' ? g.black : g.white);
const moveNumber = (m: MoveRecord) => `${Math.ceil(m.ply / 2)}${m.color === 'w' ? '.' : '...'}`;
const secs = (ms?: number) => (ms === undefined ? undefined : Math.round(ms / 100) / 10);

async function loadGames(db: Db, f: GameFilters, withMoves: boolean): Promise<GameDoc[]> {
  return db.games
    .find(buildFilter(f), withMoves ? {} : { projection: { moves: 0, pgn: 0 } })
    .sort({ finishedAt: -1 })
    .limit(Math.min(f.maxGames ?? 300, 2000))
    .toArray();
}

/** Lance formatado para a IA explicar. */
function describeMove(g: GameDoc, m: MoveRecord) {
  return {
    gameId: g._id,
    date: g.finishedAt.toISOString().slice(0, 10),
    opening: g.opening?.name,
    move: `${moveNumber(m)}${m.san}`,
    ply: m.ply,
    color: m.color === 'w' ? 'white' : 'black',
    classification: m.classification,
    classificationPt: m.classification ? CLASSIFICATION_LABELS_PT[m.classification] : undefined,
    fenBefore: m.fenBefore,
    played: m.san,
    best: m.bestMoveSan,
    bestLine: m.bestLine ? uciLineToSan(m.fenBefore, m.bestLine, 8).join(' ') : undefined,
    evalBefore: formatEval(m.evalBefore),
    evalAfter: formatEval(m.evalAfter),
    winPctLoss: m.winPctLoss,
    tags: m.tags,
    phase: m.phase,
    timeSpentS: secs(m.timeSpentMs),
    clockLeftS: secs(m.clockMs),
  };
}

export async function getGame(db: Db, gameId: string, onlyErrors = false) {
  const g = await db.games.findOne({ _id: gameId });
  if (!g) return null;
  const moves = g.moves
    .filter((m) => !onlyErrors || ['inaccuracy', 'mistake', 'blunder'].includes(m.classification ?? ''))
    .map((m) => {
      const bad = ['inaccuracy', 'mistake', 'blunder'].includes(m.classification ?? '');
      return {
        move: `${moveNumber(m)}${m.san}`,
        cls: m.classification,
        loss: m.winPctLoss,
        eval: formatEval(m.evalAfter),
        best: m.classification && m.classification !== 'best' ? m.bestMoveSan : undefined,
        // Para erros, manda a posição e a linha do engine para a IA poder explicar.
        ...(bad
          ? { fenBefore: m.fenBefore, bestLine: uciLineToSan(m.fenBefore, m.bestLine ?? [], 8).join(' ') }
          : {}),
        tags: m.tags?.length ? m.tags : undefined,
        phase: m.phase,
        t: secs(m.timeSpentMs),
      };
    });
  return {
    id: g._id,
    type: g.type,
    white: g.white,
    black: g.black,
    result: g.result,
    termination: g.termination,
    date: g.finishedAt.toISOString(),
    timeControl: g.timeControl,
    opening: g.opening,
    analysisStatus: g.analysisStatus,
    analysis: g.analysis && {
      accuracy: g.analysis.accuracy,
      phaseAccuracy: g.analysis.phaseAccuracy,
      counts: g.analysis.counts,
      depth: g.analysis.depth,
    },
    pgn: g.pgn,
    moves,
  };
}

export async function listGames(db: Db, f: GameFilters, limit = 20) {
  const games = await loadGames(db, { ...f, maxGames: limit }, false);
  return games.map((g) => {
    const c = userColor(g, f.userId);
    const opp = opponentOf(g, c);
    const acc = g.analysis?.accuracy;
    return {
      id: g._id,
      date: g.finishedAt.toISOString().slice(0, 16),
      type: g.type,
      userColor: c === 'w' ? 'white' : 'black',
      opponent: opp.kind === 'bot' ? `bot ${opp.botElo}` : opp.name,
      outcome: userOutcome(g, f.userId),
      termination: g.termination,
      opening: g.opening ? `${g.opening.eco} ${g.opening.name}` : undefined,
      userAccuracy: acc ? (c === 'w' ? acc.white : acc.black) : undefined,
      userCounts: g.analysis ? (c === 'w' ? g.analysis.counts.white : g.analysis.counts.black) : undefined,
      analysisStatus: g.analysisStatus,
    };
  });
}

/** Lances do usuário nas partidas filtradas (só analisadas). */
async function userMoves(db: Db, f: GameFilters) {
  const games = await loadGames(db, { ...f, analyzedOnly: true }, true);
  const out: { game: GameDoc; move: MoveRecord }[] = [];
  for (const g of games) {
    const c = userColor(g, f.userId);
    for (const m of g.moves) if (m.color === c && m.classification) out.push({ game: g, move: m });
  }
  return { games, moves: out };
}

export async function getWorstMoves(
  db: Db,
  f: GameFilters,
  opts: { limit?: number; classifications?: Classification[]; phase?: Phase; tag?: string } = {},
) {
  const classes = opts.classifications ?? ['mistake', 'blunder'];
  const { moves } = await userMoves(db, f);
  return moves
    .filter(({ move }) => classes.includes(move.classification!))
    .filter(({ move }) => !opts.phase || move.phase === opts.phase)
    .filter(({ move }) => !opts.tag || move.tags?.includes(opts.tag as never))
    .sort((a, b) => (b.move.winPctLoss ?? 0) - (a.move.winPctLoss ?? 0))
    .slice(0, opts.limit ?? 10)
    .map(({ game, move }) => describeMove(game, move));
}

const pct = (n: number, d: number) => (d === 0 ? null : Math.round((n / d) * 1000) / 10);
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export async function getStatsByOpening(db: Db, f: GameFilters, groupBy: 'family' | 'name' | 'eco' = 'family') {
  const games = await loadGames(db, f, true);
  const groups = new Map<
    string,
    { games: number; win: number; draw: number; loss: number; acc: number[]; losses: number[]; blunders: number; mistakes: number }
  >();
  for (const g of games) {
    const name = g.opening?.name ?? 'Desconhecida';
    const key = groupBy === 'eco' ? (g.opening?.eco ?? '?') : groupBy === 'name' ? name : name.split(':')[0].trim();
    const s = groups.get(key) ?? { games: 0, win: 0, draw: 0, loss: 0, acc: [], losses: [], blunders: 0, mistakes: 0 };
    const c = userColor(g, f.userId);
    const o = userOutcome(g, f.userId);
    s.games++;
    if (o === 'win') s.win++;
    else if (o === 'draw') s.draw++;
    else if (o === 'loss') s.loss++;
    const acc = g.analysis?.accuracy[c === 'w' ? 'white' : 'black'];
    if (acc != null) s.acc.push(acc);
    for (const m of g.moves) {
      if (m.color !== c || m.winPctLoss === undefined) continue;
      s.losses.push(m.winPctLoss);
      if (m.classification === 'blunder') s.blunders++;
      if (m.classification === 'mistake') s.mistakes++;
    }
    groups.set(key, s);
  }
  return [...groups.entries()]
    .map(([opening, s]) => ({
      opening,
      games: s.games,
      wins: s.win,
      draws: s.draw,
      losses: s.loss,
      scorePct: pct(s.win + s.draw / 2, s.win + s.draw + s.loss),
      avgAccuracy: avg(s.acc),
      avgWinPctLossPerMove: avg(s.losses),
      blundersPerGame: Math.round((s.blunders / s.games) * 100) / 100,
      mistakesPerGame: Math.round((s.mistakes / s.games) * 100) / 100,
    }))
    .sort((a, b) => b.games - a.games);
}

function pieceOf(san: string): string {
  if (san.startsWith('O-O')) return 'king (castle)';
  const map: Record<string, string> = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight' };
  return map[san[0]] ?? 'pawn';
}

function timeBucket(ms?: number): string {
  if (ms === undefined) return 'sem dado';
  if (ms < 3000) return '<3s';
  if (ms < 10000) return '3-10s';
  if (ms < 30000) return '10-30s';
  if (ms < 120000) return '30s-2min';
  return '>2min';
}

const ERROR_LEVELS: Classification[] = ['inaccuracy', 'mistake', 'blunder'];

export async function getBlunderPatterns(db: Db, f: GameFilters, minSeverity: Classification = 'mistake') {
  const { games, moves } = await userMoves(db, f);
  const severe = ERROR_LEVELS.slice(Math.max(0, ERROR_LEVELS.indexOf(minSeverity)));
  const isErr = (m: MoveRecord) => severe.includes(m.classification!);
  const errors = moves.filter(({ move }) => isErr(move));

  type Bucket = { moves: number; errors: number };
  const tally = (keyOf: (m: MoveRecord, g: GameDoc) => string) => {
    const map = new Map<string, Bucket>();
    for (const { move, game } of moves) {
      const k = keyOf(move, game);
      const b = map.get(k) ?? { moves: 0, errors: 0 };
      b.moves++;
      if (isErr(move)) b.errors++;
      map.set(k, b);
    }
    return Object.fromEntries(
      [...map.entries()].map(([k, b]) => [k, { ...b, errorRatePer100: pct(b.errors, b.moves) }]),
    );
  };

  const tagCounts = new Map<string, number>();
  for (const { move } of errors) for (const t of move.tags ?? []) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);

  const classCounts = Object.fromEntries(CLASSIFICATIONS.map((c) => [c, 0])) as Record<Classification, number>;
  for (const { move } of moves) classCounts[move.classification!]++;

  const phaseAcc: Record<Phase, number[]> = { opening: [], middlegame: [], endgame: [] };
  for (const g of games) {
    const side = userColor(g, f.userId) === 'w' ? 'white' : 'black';
    for (const p of ['opening', 'middlegame', 'endgame'] as Phase[]) {
      const v = g.analysis?.phaseAccuracy?.[p]?.[side];
      if (v != null) phaseAcc[p].push(v);
    }
  }

  // Pressão de relógio: lances com menos de 30 s restantes (só partidas com relógio).
  const timed = moves.filter(({ move }) => move.clockMs !== undefined);
  const pressure = timed.filter(({ move }) => move.clockMs! < 30_000);

  const examples = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([tag]) => ({
      tag,
      examples: errors
        .filter(({ move }) => move.tags?.includes(tag as never))
        .sort((a, b) => (b.move.winPctLoss ?? 0) - (a.move.winPctLoss ?? 0))
        .slice(0, 2)
        .map(({ game, move }) => describeMove(game, move)),
    }));

  return {
    scope: { games: games.length, userMoves: moves.length, errorsConsidered: severe, errors: errors.length },
    classificationCounts: classCounts,
    errorRatePer100Moves: pct(errors.length, moves.length),
    byPhase: tally((m) => m.phase ?? 'unknown'),
    avgAccuracyByPhase: { opening: avg(phaseAcc.opening), middlegame: avg(phaseAcc.middlegame), endgame: avg(phaseAcc.endgame) },
    byPieceMoved: tally((m) => pieceOf(m.san)),
    byTimeSpent: tally((m) => timeBucket(m.timeSpentMs)),
    byColor: tally((m) => (m.color === 'w' ? 'white' : 'black')),
    byOpponent: tally((_, g) => {
      const o = opponentOf(g, userColor(g, f.userId));
      return o.kind === 'bot' ? `bot ${o.botElo}` : 'humano';
    }),
    tagsInErrors: Object.fromEntries(
      [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => [t, { count: n, pctOfErrors: pct(n, errors.length) }]),
    ),
    clockPressure: timed.length
      ? {
          movesUnder30s: pressure.length,
          errorRateUnder30s: pct(pressure.filter(({ move }) => isErr(move)).length, pressure.length),
          errorRateOtherwise: pct(
            timed.filter(({ move }) => move.clockMs! >= 30_000 && isErr(move)).length,
            timed.length - pressure.length,
          ),
        }
      : null,
    tagGlossary: {
      hung_piece: 'perdeu material logo depois do lance (peça pendurada ou troca ruim)',
      allowed_fork: 'a resposta do adversário foi um garfo',
      allowed_mate: 'o lance permitiu um mate forçado',
      missed_mate: 'havia mate forçado e não foi jogado',
      missed_fork: 'o melhor lance era um garfo',
      missed_material: 'o melhor lance ganhava material',
      only_move: 'havia um único lance bom',
      recapture: 'o lance foi uma recaptura',
      sacrifice: 'o lance entregou material',
      check: 'o lance deu xeque',
    },
    examples,
  };
}

export async function getAccuracyTrend(db: Db, f: GameFilters, period: 'week' | 'month' = 'week') {
  const games = await loadGames(db, { ...f, analyzedOnly: true, maxGames: f.maxGames ?? 1000 }, false);
  const key = (d: Date) => {
    if (period === 'month') return d.toISOString().slice(0, 7);
    const monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return monday.toISOString().slice(0, 10);
  };
  const map = new Map<string, { acc: number[]; games: number; win: number; blunders: number }>();
  for (const g of games) {
    const k = key(g.finishedAt);
    const s = map.get(k) ?? { acc: [], games: 0, win: 0, blunders: 0 };
    const side = userColor(g, f.userId) === 'w' ? 'white' : 'black';
    const a = g.analysis?.accuracy[side];
    if (a != null) s.acc.push(a);
    s.games++;
    if (userOutcome(g, f.userId) === 'win') s.win++;
    s.blunders += g.analysis?.counts[side].blunder ?? 0;
    map.set(k, s);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([p, s]) => ({
      period: p,
      games: s.games,
      winPct: pct(s.win, s.games),
      avgAccuracy: avg(s.acc),
      blundersPerGame: Math.round((s.blunders / s.games) * 100) / 100,
    }));
}

function plyFromFen(fen: string): number {
  const fullmove = Number(fen.split(' ')[5] ?? 1) || 1;
  return (fullmove - 1) * 2 + (sideToMove(fen) === 'b' ? 1 : 0);
}

export async function getPositionAnalysis(db: Db, fen: string) {
  const doc = await db.positions.findOne({ _id: normalizeFen(fen) });
  const base = { fen, sideToMove: sideToMove(fen) === 'w' ? 'white' : 'black', phaseEstimate: detectPhase(fen, plyFromFen(fen)) };
  if (!doc) return { ...base, cached: false, note: 'Posição não está no cache (só posições de partidas analisadas ficam salvas).' };
  return {
    ...base,
    cached: true,
    depth: doc.depth,
    engine: doc.engine,
    lines: doc.multiPv.map((l, i) => ({
      rank: i + 1,
      eval: formatEval(l.eval),
      line: uciLineToSan(fen, l.pv, 10).join(' '),
    })),
  };
}
