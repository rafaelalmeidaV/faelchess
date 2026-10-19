/**
 * Importa partidas de um usuário do chess.com (API pública) para a análise do faelchess.
 *
 *   npm run build -w @faelchess/api
 *   node --env-file=apps/api/.env apps/api/dist/scripts/import-chesscom.js <usuario-chesscom> <userId-faelchess> 2025/04 2026/10
 *   (ONLY_IDS=cc185605742282 na frente importa só essa partida)
 *
 * Só partidas rápidas valendo rating, xadrez normal. Usa o mesmo `persist` das partidas do site
 * (validação, abertura, PGN) e grava com type "chesscom", já na fila do worker. Partidas que já
 * existem são puladas, então dá para rodar de novo sem reanalisar nada.
 */
import type { ConfigService } from '@nestjs/config';
import { Chess } from 'chess.js';
import { MongoClient } from 'mongodb';
import type { GameResult, PlayerInfo, Termination } from '@faelchess/shared';
import { Collections } from '../database/database.module';
import { GamesService } from '../games/games.service';

const UA = 'faelchess (projeto pessoal de estudo de xadrez)';

interface CcPlayer {
  username: string;
  rating: number;
  result: string;
}
interface CcGame {
  url: string;
  pgn?: string;
  time_control: string;
  time_class: string;
  rated: boolean;
  rules: string;
  end_time: number;
  initial_setup?: string;
  white: CcPlayer;
  black: CcPlayer;
}

/** Resultado do perdedor (ou do empate) no chess.com → terminação do faelchess. */
const TERMINATION: Record<string, Termination> = {
  checkmated: 'checkmate',
  resigned: 'resign',
  timeout: 'timeout',
  abandoned: 'abandon',
  stalemate: 'stalemate',
  insufficient: 'insufficient',
  timevsinsufficient: 'timeout',
  repetition: 'threefold',
  agreed: 'agreement',
  '50move': 'fifty-moves',
};

/** "0:09:58.6" → ms */
function clockMs(s: string) {
  const parts = s.split(':').map(Number);
  return Math.round(parts.reduce((acc, n) => acc * 60 + n, 0) * 1000);
}

function convert(g: CcGame, ccUser: string, me: { userId: string; name: string }) {
  if (!g.pgn) throw new Error('sem PGN');
  const chess = new Chess();
  chess.loadPgn(g.pgn);
  const history = chess.history({ verbose: true });
  const [base, inc] = g.time_control.split('+').map(Number);
  const baseMs = base * 1000;
  const incMs = (inc || 0) * 1000;

  // Relógio depois de cada lance ({[%clk 0:09:58.6]}), na ordem dos lances.
  const clocks = [...g.pgn.matchAll(/\[%clk ([\d:.]+)\]/g)].map((m) => clockMs(m[1]));
  const moves = history.map((m, i) => {
    const clock = clocks[i];
    if (clock === undefined) return { uci: m.from + m.to + (m.promotion ?? '') };
    const before = i >= 2 ? clocks[i - 2] : baseMs;
    return { uci: m.from + m.to + (m.promotion ?? ''), clockMs: clock, timeSpentMs: Math.max(0, before - clock + (i >= 2 ? incMs : 0)) };
  });

  const result: GameResult = g.white.result === 'win' ? '1-0' : g.black.result === 'win' ? '0-1' : '1/2-1/2';
  const decisive = result === '1-0' ? g.black.result : result === '0-1' ? g.white.result : g.white.result;
  const termination = TERMINATION[decisive] ?? (result === '1/2-1/2' ? 'agreement' : 'resign');

  const player = (p: CcPlayer): PlayerInfo =>
    p.username.toLowerCase() === ccUser.toLowerCase()
      ? { kind: 'user', userId: me.userId, name: me.name, rating: p.rating }
      : { kind: 'user', name: p.username, rating: p.rating };

  const finishedAt = new Date(g.end_time * 1000);
  // Início estimado: fim menos o tempo gasto em todos os lances.
  const elapsed = moves.reduce((sum, m) => sum + (m.timeSpentMs ?? 0), 0);
  return {
    id: 'cc' + g.url.split('/').pop(),
    type: 'chesscom' as const,
    white: player(g.white),
    black: player(g.black),
    result,
    termination,
    moves,
    timeControl: { baseMs, incrementMs: incMs },
    startedAt: new Date(finishedAt.getTime() - elapsed).toISOString(),
    finishedAt: finishedAt.toISOString(),
    externalUrl: g.url,
  };
}

async function main() {
  const [ccUser, userId, ...months] = process.argv.slice(2);
  if (!ccUser || !userId || months.length === 0) {
    console.error('uso: import-chesscom <usuario-chesscom> <userId-faelchess> <AAAA/MM> [AAAA/MM ...]');
    process.exit(1);
  }
  const client = new MongoClient(process.env.MONGODB_URI!, { maxPoolSize: 3, ignoreUndefined: true });
  await client.connect();
  const config = { get: (k: string, d?: string) => process.env[k] ?? d } as unknown as ConfigService;
  const db = new Collections(client, config);
  const service = new GamesService(db);
  const me = { userId, name: userId.charAt(0).toUpperCase() + userId.slice(1) };

  // ONLY_IDS=cc123,cc456: importa só essas partidas (ex.: a última jogada).
  const only = process.env.ONLY_IDS ? new Set(process.env.ONLY_IDS.split(',')) : null;
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  for (const month of months) {
    const res = await fetch(`https://api.chess.com/pub/player/${ccUser}/games/${month}`, { headers: { 'user-agent': UA } });
    if (!res.ok) throw new Error(`chess.com respondeu ${res.status} para ${month}`);
    const games = ((await res.json()) as { games: CcGame[] }).games.filter(
      (g) => g.time_class === 'rapid' && g.rated && g.rules === 'chess' && (!only || only.has('cc' + g.url.split('/').pop())),
    );
    for (const g of games) {
      const id = 'cc' + g.url.split('/').pop();
      if (await db.games.findOne({ _id: id }, { projection: { _id: 1 } })) {
        skipped++;
        continue;
      }
      try {
        await service.persist(convert(g, ccUser, me));
        imported++;
      } catch (e) {
        failed++;
        console.error(`  falhou ${g.url}: ${(e as Error).message}`);
      }
    }
    console.log(`${month}: ${games.length} rápidas valendo rating`);
  }
  console.log(`importadas ${imported}, já existiam ${skipped}, falharam ${failed}`);
  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
