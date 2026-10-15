#!/usr/bin/env node
/**
 * Importa uma seleção do banco de problemas do Lichess (CC0) para a coleção `puzzles`.
 *
 *   curl -O https://database.lichess.org/lichess_db_puzzle.csv.zst
 *   node --env-file=apps/api/.env scripts/import-puzzles.mjs lichess_db_puzzle.csv.zst [total=200000]
 *
 * Só problemas bem testados (popularidade, número de jogadas, rating estável), distribuídos por
 * faixa de 100 pontos de rating: em cada faixa ficam os mais populares, até completar a cota.
 * Roda uma vez (é idempotente: apaga e recria a coleção). O Atlas gratuito tem 512 MB; 200 mil ≈ 60 MB.
 */
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { Decompress } from 'fzstd';
import { MongoClient } from 'mongodb';

const [file, totalArg] = process.argv.slice(2);
if (!file) {
  console.error('uso: node --env-file=apps/api/.env scripts/import-puzzles.mjs <lichess_db_puzzle.csv.zst> [total]');
  process.exit(1);
}
const TOTAL = Number(totalArg ?? 200_000);
const MIN_POPULARITY = 80;
const MIN_PLAYS = 300;
const MAX_RD = 90;
const BAND = 100;
const MIN_RATING = 400;
const MAX_RATING = 3100;
const BANDS = (MAX_RATING - MIN_RATING) / BAND;
// Teto por faixa durante a leitura; a cota real é decidida no fim (o que falta nas pontas vai pro meio).
const CAP = Math.ceil((TOTAL / BANDS) * 2.5);

/** Heap de mínimo por pontuação: guarda os K melhores de cada faixa sem ordenar tudo. */
class TopK {
  constructor(k) {
    this.k = k;
    this.items = [];
  }
  push(score, row) {
    const h = this.items;
    if (h.length < this.k) {
      h.push([score, row]);
      this.#up(h.length - 1);
    } else if (score > h[0][0]) {
      h[0] = [score, row];
      this.#down(0);
    }
  }
  #up(i) {
    const h = this.items;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (h[p][0] <= h[i][0]) break;
      [h[p], h[i]] = [h[i], h[p]];
      i = p;
    }
  }
  #down(i) {
    const h = this.items;
    for (;;) {
      const l = 2 * i + 1;
      const r = l + 1;
      let m = i;
      if (l < h.length && h[l][0] < h[m][0]) m = l;
      if (r < h.length && h[r][0] < h[m][0]) m = r;
      if (m === i) break;
      [h[m], h[i]] = [h[i], h[m]];
      i = m;
    }
  }
}

/**
 * Descompressão com o fzstd: o arquivo do Lichess começa com um "skippable frame" (índice do formato
 * zstd seekable) que o zstd do Node rejeita; o fzstd pula esse bloco como o zstd de linha de comando.
 */
async function* decompress(path) {
  const out = [];
  const d = new Decompress((chunk) => out.push(Buffer.from(chunk)));
  for await (const chunk of createReadStream(path, { highWaterMark: 1 << 20 })) {
    d.push(chunk);
    while (out.length) yield out.shift();
  }
  d.push(new Uint8Array(0), true);
  while (out.length) yield out.shift();
}

const bands = Array.from({ length: BANDS }, () => new TopK(CAP));
let lines = 0;
let candidates = 0;

const rl = createInterface({ input: Readable.from(decompress(file)), crlfDelay: Infinity });
for await (const line of rl) {
  if (lines++ === 0) continue; // cabeçalho
  // PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags[,DailyDate]
  const c = line.split(',');
  const rating = Number(c[3]);
  const rd = Number(c[4]);
  const popularity = Number(c[5]);
  const plays = Number(c[6]);
  if (popularity < MIN_POPULARITY || plays < MIN_PLAYS || rd > MAX_RD) continue;
  if (rating < MIN_RATING || rating >= MAX_RATING) continue;
  candidates++;
  const score = popularity + 10 * Math.log10(plays);
  bands[Math.floor((rating - MIN_RATING) / BAND)].push(score, c);
  if (lines % 1_000_000 === 0) console.log(`${(lines / 1e6).toFixed(0)} mi de linhas lidas, ${candidates} candidatos`);
}

// Cota igual por faixa ("enchendo o copo"): a menor cota L com soma de min(tamanho, L) >= TOTAL.
const sizes = bands.map((b) => b.items.length);
let quota = 0;
while (quota < CAP && sizes.reduce((s, n) => s + Math.min(n, quota), 0) < TOTAL) quota += 50;
const chosen = bands.flatMap((b) => b.items.sort((x, y) => y[0] - x[0]).slice(0, quota)).slice(0, TOTAL);

const docs = chosen.map(([, c]) => ({
  _id: c[0],
  fen: c[1],
  moves: c[2].split(' '),
  rating: Number(c[3]),
  themes: c[7] ? c[7].split(' ') : [],
  popularity: Number(c[5]),
  plays: Number(c[6]),
  gameUrl: c[8],
  ...(c[9] ? { openingTags: c[9].split(' ') } : {}),
}));

console.log(`${lines - 1} problemas no arquivo, ${candidates} passaram nos filtros, ${docs.length} selecionados`);
const perBand = bands.map((b, i) => `${MIN_RATING + i * BAND}:${Math.min(b.items.length, quota)}`).join(' ');
console.log(`por faixa: ${perBand}`);

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.MONGODB_DB ?? 'faelchess');
const col = db.collection('puzzles');
await col.drop().catch(() => {});
for (let i = 0; i < docs.length; i += 5000) {
  await col.insertMany(docs.slice(i, i + 5000), { ordered: false });
  process.stdout.write(`\rinseridos ${Math.min(i + 5000, docs.length)}/${docs.length}`);
}
console.log('');
await col.createIndexes([{ key: { rating: 1 } }, { key: { themes: 1, rating: 1 } }]);
const stats = await db.command({ collStats: 'puzzles' });
console.log(`coleção puzzles: ${stats.count} docs, ${(stats.storageSize / 1e6).toFixed(1)} MB em disco, índices ${(stats.totalIndexSize / 1e6).toFixed(1)} MB`);
await client.close();
