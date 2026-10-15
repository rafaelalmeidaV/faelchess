import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  START_FEN,
  boardOutcome,
  buildMoveRecords,
  type CreateGameInput,
  type GameDoc,
  type GameType,
  type PlayerInfo,
} from '@faelchess/shared';
import { detectOpening } from '@faelchess/shared/openings';
import { validateFen } from 'chess.js';
import type { Filter } from 'mongodb';
import { Collections } from '../database/database.module';
import { newId } from '../common/ids';
import type { ListGamesQuery } from './dto';

export type PersistGameInput = Omit<CreateGameInput, 'type'> & { type: GameType; id?: string };

/** Campos de listagem: tudo menos os lances (que são o grosso do documento). */
const SUMMARY_PROJECTION = {
  type: 1,
  white: 1,
  black: 1,
  result: 1,
  termination: 1,
  timeControl: 1,
  startedAt: 1,
  finishedAt: 1,
  opening: 1,
  analysisStatus: 1,
  'analysis.accuracy': 1,
  'analysis.counts': 1,
  plyCount: { $size: '$moves' },
} as const;

function playerPgnName(p: PlayerInfo) {
  return p.kind === 'bot' ? `${p.name} (Stockfish ${p.botElo ?? '?'})` : p.name;
}

function pgnDate(d: Date) {
  return d.toISOString().slice(0, 10).replace(/-/g, '.');
}

@Injectable()
export class GamesService {
  constructor(private readonly db: Collections) {}

  /**
   * Valida e grava uma partida terminada com `analysisStatus: "pending"`.
   * SAN, FENs e PGN são recalculados aqui a partir dos lances UCI.
   */
  async persist(input: PersistGameInput): Promise<GameDoc> {
    const startFen = input.startFen?.trim() || START_FEN;
    if (startFen !== START_FEN && !validateFen(startFen).ok) {
      throw new BadRequestException('startFen inválido');
    }

    let built: ReturnType<typeof buildMoveRecords>;
    try {
      built = buildMoveRecords(input.moves, startFen);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
    const { records, chess } = built;

    // O tabuleiro manda: se a posição final é mate/afogamento/etc., o resultado tem de bater.
    let { result, termination } = input;
    const natural = boardOutcome(chess);
    if (natural && ['checkmate', 'stalemate', 'insufficient'].includes(natural.termination)) {
      if (result !== natural.result) {
        throw new BadRequestException(`Resultado ${result} não bate com o tabuleiro (${natural.result})`);
      }
      termination = natural.termination;
    } else if (termination === 'checkmate' || termination === 'stalemate') {
      throw new BadRequestException(`Terminação ${termination} não confere com a posição final`);
    }

    const startedAt = new Date(input.startedAt);
    const finishedAt = new Date(input.finishedAt);
    const now = new Date();

    chess.setHeader('Event', input.type === 'bot' ? 'Partida contra bot' : `Partida ${input.type}`);
    chess.setHeader('Site', 'faelchess');
    chess.setHeader('Date', pgnDate(startedAt));
    chess.setHeader('White', playerPgnName(input.white));
    chess.setHeader('Black', playerPgnName(input.black));
    chess.setHeader('Result', result);
    chess.setHeader('Termination', termination);
    if (input.white.botElo) chess.setHeader('WhiteElo', String(input.white.botElo));
    if (input.black.botElo) chess.setHeader('BlackElo', String(input.black.botElo));
    if (input.timeControl) {
      chess.setHeader('TimeControl', `${input.timeControl.baseMs / 1000}+${input.timeControl.incrementMs / 1000}`);
    }
    if (startFen !== START_FEN) {
      chess.setHeader('SetUp', '1');
      chess.setHeader('FEN', startFen);
    }

    const userIds = [input.white.userId, input.black.userId].filter((u): u is string => !!u);
    const doc: GameDoc = {
      _id: input.id ?? newId(),
      type: input.type,
      white: input.white,
      black: input.black,
      userIds: [...new Set(userIds)],
      result,
      termination,
      ...(startFen !== START_FEN ? { startFen } : {}),
      pgn: chess.pgn(),
      ...(input.timeControl ? { timeControl: input.timeControl } : {}),
      startedAt,
      finishedAt,
      createdAt: now,
      updatedAt: now,
      opening: startFen === START_FEN ? detectOpening(records) : undefined,
      moves: records,
      // Partida sem lances não tem o que analisar.
      analysisStatus: records.length === 0 ? 'done' : 'pending',
    };
    if (!doc.opening) delete doc.opening;

    await this.db.games.replaceOne({ _id: doc._id }, doc, { upsert: true });
    return doc;
  }

  async list(q: ListGamesQuery) {
    const filter: Filter<GameDoc> = {};
    if (q.userId) filter.userIds = q.userId;
    if (q.type) filter.type = q.type;
    if (q.result) filter.result = q.result;
    if (q.analysisStatus) filter.analysisStatus = q.analysisStatus;

    const [items, total] = await Promise.all([
      this.db.games
        .find(filter, { projection: SUMMARY_PROJECTION })
        .sort({ finishedAt: -1 })
        .skip(q.skip ?? 0)
        .limit(q.limit ?? 50)
        .toArray(),
      this.db.games.countDocuments(filter),
    ]);
    return { items, total };
  }

  async get(id: string): Promise<GameDoc> {
    const game = await this.db.games.findOne({ _id: id });
    if (!game) throw new NotFoundException('Partida não encontrada');
    return game;
  }

  /** Volta a partida para a fila (ex.: depois de mudar as faixas de classificação). */
  async reanalyze(id: string) {
    const res = await this.db.games.updateOne(
      { _id: id, 'moves.0': { $exists: true } },
      {
        $set: { analysisStatus: 'pending', updatedAt: new Date(), analysisAttempts: 0 },
        $unset: { analysisStartedAt: '', analysisError: '' },
      },
    );
    if (res.matchedCount === 0) throw new NotFoundException('Partida não encontrada ou sem lances');
    return { ok: true };
  }

  async remove(id: string) {
    const res = await this.db.games.deleteOne({ _id: id });
    if (res.deletedCount === 0) throw new NotFoundException('Partida não encontrada');
    return { ok: true };
  }

  /** Quantas partidas em cada estado de análise (para o front mostrar a fila). */
  async queue() {
    const rows = await this.db.games
      .aggregate<{ _id: string; n: number }>([{ $group: { _id: '$analysisStatus', n: { $sum: 1 } } }])
      .toArray();
    return Object.fromEntries(rows.map((r) => [r._id, r.n]));
  }
}
