#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CLASSIFICATIONS, type GameDoc, type PositionDoc, type PuzzleAttemptDoc, type PuzzleRatingDoc } from '@faelchess/shared';
import { MongoClient } from 'mongodb';
import { z } from 'zod';
import {
  getAccuracyTrend,
  getBlunderPatterns,
  getGame,
  getPositionAnalysis,
  getPuzzleStats,
  getStatsByOpening,
  getWorstMoves,
  listGames,
  type Db,
  type GameFilters,
} from './queries';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('Defina MONGODB_URI');
  process.exit(1);
}
const DEFAULT_USER = process.env.FAELCHESS_USER_ID ?? 'bruno';

const client = new MongoClient(uri, { maxPoolSize: 3 });
const mongo = client.db(process.env.MONGODB_DB ?? 'faelchess');
const db: Db = {
  games: mongo.collection<GameDoc>('games'),
  positions: mongo.collection<PositionDoc>('positions'),
  puzzleAttempts: mongo.collection<PuzzleAttemptDoc>('puzzle_attempts'),
  puzzleRatings: mongo.collection<PuzzleRatingDoc>('puzzle_ratings'),
};

const filterShape = {
  userId: z.string().optional().describe(`Id do jogador (padrão: ${DEFAULT_USER})`),
  type: z.enum(['bot', 'local', 'online']).optional().describe('Tipo de partida'),
  outcome: z.enum(['win', 'loss', 'draw']).optional().describe('Resultado do ponto de vista do jogador'),
  color: z.enum(['white', 'black']).optional().describe('Cor com que o jogador jogou'),
  opening: z.string().optional().describe('ECO (ex.: "B50") ou trecho do nome (ex.: "Sicilian")'),
  botEloMin: z.number().int().optional().describe('Elo mínimo do bot adversário'),
  botEloMax: z.number().int().optional().describe('Elo máximo do bot adversário'),
  from: z.string().optional().describe('Data inicial (ISO, ex.: 2026-10-01)'),
  to: z.string().optional().describe('Data final (ISO)'),
  maxGames: z.number().int().min(1).max(2000).optional().describe('Quantas partidas recentes considerar (padrão 300)'),
};

type FilterArgs = { [K in keyof typeof filterShape]?: z.infer<(typeof filterShape)[K]> };
const toFilters = (a: FilterArgs): GameFilters => ({ ...a, userId: a.userId ?? DEFAULT_USER });

const json = (data: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(data, null, 1) }],
});

const server = new McpServer({ name: 'faelchess', version: '0.1.0' });

server.registerTool(
  'get_game',
  {
    title: 'Partida completa',
    description:
      'Partida com todos os lances classificados (Brilhante...Capivarada), avaliação, melhor lance, ' +
      'tags táticas, fase e tempo gasto. Para erros, inclui o FEN e a linha do engine em SAN.',
    inputSchema: {
      gameId: z.string(),
      onlyErrors: z.boolean().optional().describe('Só imprecisões, erros e capivaradas'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ gameId, onlyErrors }) => {
    const game = await getGame(db, gameId, onlyErrors);
    return game ? json(game) : json({ error: `Partida ${gameId} não encontrada` });
  },
);

server.registerTool(
  'list_games',
  {
    title: 'Listar partidas',
    description: 'Partidas recentes do jogador com resultado, abertura, adversário, precisão e contagem de classificações.',
    inputSchema: { ...filterShape, limit: z.number().int().min(1).max(200).optional() },
    annotations: { readOnlyHint: true },
  },
  async ({ limit, ...f }) => json(await listGames(db, toFilters(f), limit ?? 20)),
);

server.registerTool(
  'get_worst_moves',
  {
    title: 'Piores lances',
    description:
      'Piores lances do jogador (por perda de win%), com FEN, lance jogado, melhor lance, linha do engine, ' +
      'avaliações antes/depois, tags (hung_piece, allowed_fork, missed_mate...) e tempo gasto. Use para explicar erros concretos.',
    inputSchema: {
      ...filterShape,
      limit: z.number().int().min(1).max(100).optional(),
      classifications: z.array(z.enum(CLASSIFICATIONS)).optional().describe('Padrão: ["mistake","blunder"]'),
      phase: z.enum(['opening', 'middlegame', 'endgame']).optional(),
      tag: z.string().optional().describe('Filtra por tag, ex.: "allowed_fork"'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ limit, classifications, phase, tag, ...f }) =>
    json(await getWorstMoves(db, toFilters(f), { limit, classifications, phase, tag })),
);

server.registerTool(
  'get_stats_by_opening',
  {
    title: 'Estatísticas por abertura',
    description: 'Vitórias/empates/derrotas, aproveitamento, precisão média e erros por partida, agrupados por abertura.',
    inputSchema: {
      ...filterShape,
      groupBy: z.enum(['family', 'name', 'eco']).optional().describe('family = "Sicilian Defense" (padrão)'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ groupBy, ...f }) => json(await getStatsByOpening(db, toFilters(f), groupBy)),
);

server.registerTool(
  'get_blunder_patterns',
  {
    title: 'Padrões de erro',
    description:
      'Padrões recorrentes nos erros do jogador: taxa por fase, por peça movida, por tempo gasto, por cor, ' +
      'por adversário, sob pressão de relógio, frequência de cada tag tática, e exemplos concretos das tags mais comuns.',
    inputSchema: {
      ...filterShape,
      minSeverity: z.enum(['inaccuracy', 'mistake', 'blunder']).optional().describe('Padrão: mistake'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ minSeverity, ...f }) => json(await getBlunderPatterns(db, toFilters(f), minSeverity)),
);

server.registerTool(
  'get_accuracy_trend',
  {
    title: 'Evolução da precisão',
    description: 'Precisão média, aproveitamento e capivaradas por partida ao longo do tempo (por semana ou mês).',
    inputSchema: { ...filterShape, period: z.enum(['week', 'month']).optional() },
    annotations: { readOnlyHint: true },
  },
  async ({ period, ...f }) => json(await getAccuracyTrend(db, toFilters(f), period)),
);

server.registerTool(
  'get_position_analysis',
  {
    title: 'Análise de posição',
    description: 'Linhas do engine (MultiPV) para um FEN, vindas do cache de posições já analisadas.',
    inputSchema: { fen: z.string() },
    annotations: { readOnlyHint: true },
  },
  async ({ fen }) => json(await getPositionAnalysis(db, fen)),
);

server.registerTool(
  'get_puzzle_stats',
  {
    title: 'Problemas (puzzles)',
    description:
      'Rating de problemas do jogador, aproveitamento por tema (temas do Lichess, piores primeiro) e evolução por semana. Útil para achar fraquezas táticas.',
    inputSchema: {
      userId: z.string().optional().describe(`Id do jogador (padrão: ${DEFAULT_USER})`),
      minAttempts: z.number().int().min(1).optional().describe('Mínimo de tentativas para um tema aparecer (padrão 3)'),
    },
    annotations: { readOnlyHint: true },
  },
  async ({ userId, minAttempts }) => json(await getPuzzleStats(db, userId ?? DEFAULT_USER, minAttempts)),
);

async function main() {
  await client.connect();
  await server.connect(new StdioServerTransport());
  console.error(`faelchess MCP pronto (usuário padrão: ${DEFAULT_USER})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
