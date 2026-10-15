import type { GameDoc, PositionDoc } from '@faelchess/shared';
import { MongoClient, type Collection } from 'mongodb';
import { cpus } from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import { analyzeGame, type PositionCache } from './analyze';
import { UciEngine } from './engine';

const env = (name: string, fallback?: string) => {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Variável de ambiente ${name} não definida`);
  return v;
};

const config = {
  mongoUri: env('MONGODB_URI'),
  dbName: env('MONGODB_DB', 'faelchess'),
  stockfishPath: env('STOCKFISH_PATH', 'stockfish'),
  depth: Number(env('ANALYSIS_DEPTH', '16')),
  multiPv: Number(env('ANALYSIS_MULTIPV', '3')),
  threads: Number(env('STOCKFISH_THREADS', String(Math.max(1, Math.min(4, cpus().length - 1))))),
  hashMb: Number(env('STOCKFISH_HASH_MB', '256')),
  pollMs: Number(env('POLL_MS', '5000')),
  stuckMs: Number(env('STUCK_MINUTES', '10')) * 60_000,
  maxAttempts: Number(env('MAX_ATTEMPTS', '3')),
};

const log = (...args: unknown[]) => console.log(new Date().toISOString(), ...args);

let stopping = false;
let currentGameId: string | null = null;

/**
 * Jobs em "processing" sem heartbeat há mais de STUCK_MINUTES (PC desligou, caiu a internet...)
 * voltam para a fila, ou viram "failed" se já estouraram as tentativas.
 */
async function recoverStuck(games: Collection<GameDoc>) {
  const cutoff = new Date(Date.now() - config.stuckMs);
  const stuck = { analysisStatus: 'processing' as const, analysisStartedAt: { $lt: cutoff } };
  const failed = await games.updateMany(
    { ...stuck, analysisAttempts: { $gte: config.maxAttempts } },
    { $set: { analysisStatus: 'failed', analysisError: 'Excedeu o número de tentativas', updatedAt: new Date() } },
  );
  const requeued = await games.updateMany(stuck, { $set: { analysisStatus: 'pending', updatedAt: new Date() } });
  if (failed.modifiedCount || requeued.modifiedCount) {
    log(`Recuperação: ${requeued.modifiedCount} de volta para a fila, ${failed.modifiedCount} marcadas como falha`);
  }
}

/** Pega a próxima partida pendente e já marca como "processing" numa operação atômica. */
function claimNext(games: Collection<GameDoc>) {
  return games.findOneAndUpdate(
    { analysisStatus: 'pending' },
    {
      $set: { analysisStatus: 'processing', analysisStartedAt: new Date(), updatedAt: new Date() },
      $inc: { analysisAttempts: 1 },
    },
    { sort: { createdAt: 1 }, returnDocument: 'after' },
  );
}

async function main() {
  const client = new MongoClient(config.mongoUri, { maxPoolSize: 3, ignoreUndefined: true });
  await client.connect();
  const db = client.db(config.dbName);
  const games = db.collection<GameDoc>('games');
  const positions = db.collection<PositionDoc>('positions');

  const cache: PositionCache = {
    get: (key) => positions.findOne({ _id: key }),
    put: async (doc) => {
      // Nunca troca uma avaliação mais profunda por uma mais rasa.
      await positions.updateOne(
        { _id: doc._id, depth: { $lte: doc.depth } },
        { $set: { depth: doc.depth, multiPv: doc.multiPv, engine: doc.engine, evaluatedAt: doc.evaluatedAt } },
        { upsert: true },
      ).catch((e: { code?: number }) => {
        // Duplicate key: já existe uma avaliação mais profunda; tudo bem.
        if (e.code !== 11000) throw e;
      });
    },
  };

  const engine = new UciEngine({ path: config.stockfishPath, threads: config.threads, hashMb: config.hashMb });
  await engine.start();
  log(`Worker pronto: ${engine.name}, depth ${config.depth}, MultiPV ${config.multiPv}, ${config.threads} threads`);

  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log(`${signal} recebido, encerrando...`);
    if (currentGameId) {
      // Devolve o job para a fila em vez de esperar o timeout de travamento.
      await games.updateOne(
        { _id: currentGameId, analysisStatus: 'processing' },
        { $set: { analysisStatus: 'pending', updatedAt: new Date() }, $inc: { analysisAttempts: -1 } },
      );
    }
    await engine.quit();
    await client.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  let lastRecovery = 0;
  while (!stopping) {
    if (Date.now() - lastRecovery > 60_000) {
      await recoverStuck(games).catch((e) => log('Erro na recuperação:', e.message));
      lastRecovery = Date.now();
    }

    let game: GameDoc | null;
    try {
      game = await claimNext(games);
    } catch (e) {
      log('Erro consultando a fila:', (e as Error).message);
      await sleep(config.pollMs * 3);
      continue;
    }
    if (!game) {
      await sleep(config.pollMs);
      continue;
    }

    currentGameId = game._id;
    const label = `${game._id} (${game.white.name} x ${game.black.name}, ${game.moves.length} lances)`;
    log(`Analisando ${label}`);

    // Heartbeat: renova analysisStartedAt para partidas longas não parecerem travadas.
    const heartbeat = setInterval(() => {
      games
        .updateOne({ _id: game!._id, analysisStatus: 'processing' }, { $set: { analysisStartedAt: new Date() } })
        .catch(() => undefined);
    }, 60_000);

    try {
      await engine.newGame();
      let lastPct = -1;
      const result = await analyzeGame(game, engine, cache, {
        depth: config.depth,
        multiPv: config.multiPv,
        onProgress: (done, total) => {
          const pct = Math.floor((done / total) * 4) * 25;
          if (pct !== lastPct && pct < 100) log(`  ${pct}%`);
          lastPct = pct;
        },
      });
      await games.updateOne(
        { _id: game._id, analysisStatus: 'processing' },
        {
          $set: { moves: result.moves, analysis: result.summary, analysisStatus: 'done', updatedAt: new Date() },
          $unset: { analysisError: '' },
        },
      );
      const { accuracy } = result.summary;
      log(
        `Pronto ${game._id}: precisão brancas ${accuracy.white}%, pretas ${accuracy.black}% ` +
          `(${result.stats.positions} posições, ${result.stats.cacheHits} do cache, ${result.summary.durationMs} ms)`,
      );
    } catch (e) {
      const message = (e as Error).message;
      log(`Falha em ${game._id}: ${message}`);
      const attempts = game.analysisAttempts ?? 1;
      await games.updateOne(
        { _id: game._id },
        {
          $set: {
            analysisStatus: attempts >= config.maxAttempts ? 'failed' : 'pending',
            analysisError: message,
            updatedAt: new Date(),
          },
        },
      );
      // Se o Stockfish morreu, sai: o systemd/pm2 reinicia o processo.
      if (/Stockfish encerrou|EPIPE/.test(message)) await shutdown('engine-crash');
    } finally {
      clearInterval(heartbeat);
      currentGameId = null;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
