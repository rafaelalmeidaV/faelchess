import { buildMoveRecords, type PositionDoc } from '@faelchess/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { analyzeGame, type PositionCache } from './analyze';
import { UciEngine, parseInfoLine } from './engine';

describe('parseInfoLine', () => {
  it('lê score em cp, multipv e pv', () => {
    const info = parseInfoLine(
      'info depth 12 seldepth 19 multipv 2 score cp -28 nodes 58491 nps 913921 hashfull 20 tbhits 0 time 64 pv e7e5 g1f3',
    );
    expect(info).toEqual({ depth: 12, multipv: 2, score: { cp: -28 }, bound: false, pv: ['e7e5', 'g1f3'] });
  });

  it('lê mate e marca bounds', () => {
    expect(parseInfoLine('info depth 5 score mate -3 pv a1a2')?.score).toEqual({ mate: -3 });
    expect(parseInfoLine('info depth 5 score cp 10 lowerbound nodes 1 pv a1a2')?.bound).toBe(true);
    expect(parseInfoLine('info depth 5 currmove e2e4 currmovenumber 1')).toBeNull();
  });
});

const sfPath = process.env.STOCKFISH_PATH;

describe.skipIf(!sfPath)('analyzeGame com Stockfish real', () => {
  const engine = new UciEngine({ path: sfPath!, threads: 2, hashMb: 64 });
  const store = new Map<string, PositionDoc>();
  const cache: PositionCache = {
    get: async (k) => store.get(k) ?? null,
    put: async (d) => void store.set(d._id, d),
  };

  beforeAll(() => engine.start());
  afterAll(() => engine.quit());

  it('classifica o Mate do Pastor e usa o cache na segunda vez', async () => {
    // 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6?? 4.Qxf7#
    const { records } = buildMoveRecords(
      ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'].map((uci) => ({ uci })),
    );
    const res = await analyzeGame({ moves: records }, engine, cache, { depth: 12, multiPv: 3 });
    const bySan = Object.fromEntries(res.moves.map((m) => [m.san, m]));

    expect(bySan['Nf6'].classification).toBe('blunder');
    expect(bySan['Nf6'].tags).toContain('allowed_mate');
    expect(bySan['Nf6'].bestMoveSan).toMatch(/g6|Qe7|Qf6/);
    expect(['best', 'great']).toContain(bySan['Qxf7#'].classification);
    expect(bySan['Qxf7#'].evalAfter).toEqual({ mate: 0, winner: 'w' });
    expect(res.summary.counts.black.blunder).toBe(1);
    expect(res.summary.accuracy.white).toBeGreaterThan(res.summary.accuracy.black);
    expect(res.stats.cacheHits).toBe(1); // só a posição final (mate) não passa pelo engine

    const again = await analyzeGame({ moves: records }, engine, cache, { depth: 12, multiPv: 3 });
    expect(again.stats.cacheHits).toBe(again.stats.positions);
  }, 60_000);
});
