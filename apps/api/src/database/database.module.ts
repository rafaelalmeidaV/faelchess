import { Global, Inject, Injectable, Logger, Module, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { GameDoc, PositionDoc, PuzzleAttemptDoc, PuzzleDoc, PuzzleRatingDoc } from '@faelchess/shared';
import { Collection, Db, MongoClient } from 'mongodb';

export const MONGO_CLIENT = Symbol('MONGO_CLIENT');

@Injectable()
export class Collections implements OnModuleInit {
  private readonly logger = new Logger(Collections.name);
  readonly db: Db;
  readonly games: Collection<GameDoc>;
  readonly positions: Collection<PositionDoc>;
  readonly puzzles: Collection<PuzzleDoc>;
  readonly puzzleAttempts: Collection<PuzzleAttemptDoc>;
  readonly puzzleRatings: Collection<PuzzleRatingDoc>;

  constructor(@Inject(MONGO_CLIENT) client: MongoClient, config: ConfigService) {
    this.db = client.db(config.get('MONGODB_DB', 'faelchess'));
    this.games = this.db.collection<GameDoc>('games');
    this.positions = this.db.collection<PositionDoc>('positions');
    this.puzzles = this.db.collection<PuzzleDoc>('puzzles');
    this.puzzleAttempts = this.db.collection<PuzzleAttemptDoc>('puzzle_attempts');
    this.puzzleRatings = this.db.collection<PuzzleRatingDoc>('puzzle_ratings');
  }

  async onModuleInit() {
    await this.games.createIndexes([
      // Fila do worker: próxima partida pendente.
      { key: { analysisStatus: 1, createdAt: 1 } },
      // "Minhas partidas" e filtros do MCP.
      { key: { userIds: 1, finishedAt: -1 } },
      { key: { 'white.userId': 1 } },
      { key: { 'black.userId': 1 } },
      { key: { 'opening.eco': 1 } },
      { key: { type: 1, finishedAt: -1 } },
    ]);
    await this.puzzles.createIndexes([{ key: { rating: 1 } }, { key: { themes: 1, rating: 1 } }]);
    await this.puzzleAttempts.createIndexes([
      // Histórico do jogador e "já fez este problema?".
      { key: { userId: 1, at: -1 } },
      { key: { userId: 1, puzzleId: 1 } },
    ]);
    this.logger.log('Índices garantidos');
  }
}

@Injectable()
class MongoShutdown implements OnApplicationShutdown {
  constructor(@Inject(MONGO_CLIENT) private readonly client: MongoClient) {}
  async onApplicationShutdown() {
    await this.client.close();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: MONGO_CLIENT,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const uri = config.getOrThrow<string>('MONGODB_URI');
        // Pool pequeno: a VM tem 1 GB e o tráfego é de uma pessoa.
        const client = new MongoClient(uri, { maxPoolSize: 5, ignoreUndefined: true });
        await client.connect();
        return client;
      },
    },
    Collections,
    MongoShutdown,
  ],
  exports: [Collections],
})
export class DatabaseModule {}
