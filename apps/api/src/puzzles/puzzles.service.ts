import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PUZZLE_START_RATING,
  PUZZLE_START_RD,
  glickoUpdate,
  type PuzzleDoc,
  type PuzzleRatingDoc,
} from '@faelchess/shared';
import { Collections } from '../database/database.module';

/** Quantos problemas recentes do jogador ficam fora do sorteio. */
const RECENT_EXCLUDE = 2000;

@Injectable()
export class PuzzlesService {
  constructor(private readonly db: Collections) {}

  async rating(userId: string): Promise<PuzzleRatingDoc> {
    return (
      (await this.db.puzzleRatings.findOne({ _id: userId })) ?? {
        _id: userId,
        rating: PUZZLE_START_RATING,
        rd: PUZZLE_START_RD,
        attempts: 0,
        wins: 0,
        updatedAt: new Date(),
      }
    );
  }

  /** Próximo problema perto do rating do jogador, que ele ainda não fez (abre a faixa se faltar). */
  async next(userId: string, theme?: string): Promise<PuzzleDoc> {
    const { rating } = await this.rating(userId);
    const done = await this.db.puzzleAttempts
      .find({ userId }, { projection: { puzzleId: 1 } })
      .sort({ at: -1 })
      .limit(RECENT_EXCLUDE)
      .toArray();
    const exclude = done.map((a) => a.puzzleId);
    for (const width of [75, 150, 300, 600, 3000]) {
      const [puzzle] = await this.db.puzzles
        .aggregate<PuzzleDoc>([
          {
            $match: {
              rating: { $gte: rating - width, $lte: rating + width },
              ...(theme ? { themes: theme } : {}),
              ...(exclude.length ? { _id: { $nin: exclude } } : {}),
            },
          },
          { $sample: { size: 1 } },
        ])
        .toArray();
      if (puzzle) return puzzle;
    }
    throw new NotFoundException('Nenhum problema disponível com esse filtro');
  }

  async get(id: string): Promise<PuzzleDoc> {
    const puzzle = await this.db.puzzles.findOne({ _id: id });
    if (!puzzle) throw new NotFoundException('Problema não encontrado');
    return puzzle;
  }

  /**
   * Registra a tentativa e atualiza o rating. Refazer um problema não mexe no rating
   * (senão bastaria decorar a solução).
   */
  async attempt(id: string, userId: string, win: boolean) {
    const puzzle = await this.get(id);
    const before = await this.rating(userId);
    const repeated = (await this.db.puzzleAttempts.countDocuments({ userId, puzzleId: id }, { limit: 1 })) > 0;
    const after = repeated ? { rating: before.rating, rd: before.rd } : glickoUpdate(before, puzzle.rating, win);

    await this.db.puzzleAttempts.insertOne({
      userId,
      puzzleId: id,
      win,
      puzzleRating: puzzle.rating,
      themes: puzzle.themes,
      ratingBefore: before.rating,
      ratingAfter: after.rating,
      at: new Date(),
    });
    if (!repeated) {
      await this.db.puzzleRatings.updateOne(
        { _id: userId },
        { $set: { rating: after.rating, rd: after.rd, updatedAt: new Date() }, $inc: { attempts: 1, wins: win ? 1 : 0 } },
        { upsert: true },
      );
    }
    return { rating: after.rating, delta: after.rating - before.rating, counted: !repeated };
  }

  /** Rating, últimas tentativas e aproveitamento por tema. */
  async stats(userId: string) {
    const [rating, recent, themes] = await Promise.all([
      this.rating(userId),
      this.db.puzzleAttempts
        .find({ userId }, { projection: { _id: 0, puzzleId: 1, win: 1, puzzleRating: 1, ratingAfter: 1, at: 1 } })
        .sort({ at: -1 })
        .limit(30)
        .toArray(),
      this.db.puzzleAttempts
        .aggregate<{ theme: string; attempts: number; wins: number }>([
          { $match: { userId } },
          { $unwind: '$themes' },
          { $group: { _id: '$themes', attempts: { $sum: 1 }, wins: { $sum: { $cond: ['$win', 1, 0] } } } },
          { $sort: { attempts: -1 } },
          { $limit: 40 },
          { $project: { _id: 0, theme: '$_id', attempts: 1, wins: 1 } },
        ])
        .toArray(),
    ]);
    return { rating: rating.rating, rd: rating.rd, attempts: rating.attempts, wins: rating.wins, recent, themes };
  }
}
