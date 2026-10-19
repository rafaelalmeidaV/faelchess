import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import {
  PUZZLE_START_RATING,
  PUZZLE_START_RD,
  START_FEN,
  glickoUpdate,
  boardOutcome,
  buildMoveRecords,
  classifyMove,
  detectPhase,
  detectSacrifice,
  divideGame,
  formatEval,
  gameAccuracyByColor,
  mateJudgement,
  moveAccuracy,
  phaseAt,
  forkTargets,
  negateEval,
  normalizeFen,
  terminalEval,
  winPctFor,
  winPctFromCp,
} from './index';
import { detectOpening } from './openings';

describe('eval', () => {
  it('converte centipawns em win% com a curva do Lichess', () => {
    expect(winPctFromCp(0)).toBe(50);
    expect(winPctFromCp(30)).toBeCloseTo(52.76, 1);
    expect(winPctFromCp(-150)).toBeCloseTo(36.5, 0);
    expect(winPctFromCp(5000)).toBe(winPctFromCp(1000));
  });

  it('trata mate separadamente', () => {
    expect(winPctFor({ mate: 3 }, 'w')).toBe(100);
    expect(winPctFor({ mate: 3 }, 'b')).toBe(0);
    expect(winPctFor({ mate: -1 }, 'b')).toBe(100);
    const mated = terminalEval('checkmate', 'b');
    expect(mated).toEqual({ mate: 0, winner: 'w' });
    expect(winPctFor(mated, 'w')).toBe(100);
    expect(negateEval(mated)).toEqual({ mate: 0, winner: 'b' });
    expect(formatEval({ mate: -2 })).toBe('-M2');
    expect(formatEval({ cp: 34 })).toBe('+0.34');
  });
});

describe('board', () => {
  it('normaliza FEN tirando os contadores', () => {
    expect(normalizeFen(START_FEN)).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -');
  });

  it('reconstrói lances a partir de UCI e detecta mate', () => {
    const { records, chess } = buildMoveRecords(
      ['f2f3', 'e7e5', 'g2g4', 'd8h4'].map((uci) => ({ uci, timeSpentMs: 1000 })),
    );
    expect(records.map((r) => r.san)).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
    expect(records[3].color).toBe('b');
    expect(records[1].fenBefore).toBe(records[0].fenAfter);
    expect(boardOutcome(chess)).toEqual({ result: '0-1', termination: 'checkmate' });
  });

  it('rejeita lance ilegal', () => {
    expect(() => buildMoveRecords([{ uci: 'e2e5' }])).toThrow(/ilegal/);
  });

  it('detecta a fase', () => {
    expect(detectPhase(START_FEN, 0)).toBe('opening');
    expect(detectPhase('8/5k2/8/8/8/8/3K4/R7 w - - 0 60', 100)).toBe('endgame');
  });
});

describe('classifyMove', () => {
  const lines = [
    { pv: ['e2e4', 'e7e5'], eval: { cp: 30 } },
    { pv: ['d2d4', 'd7d5'], eval: { cp: 25 } },
  ];

  it('lance do engine é Melhor', () => {
    const r = classifyMove({ fenBefore: START_FEN, playedUci: 'e2e4', ply: 1, linesBefore: lines, evalAfter: { cp: 28 } });
    expect(r.classification).toBe('best');
    expect(r.winPctLoss).toBe(0);
    expect(r.accuracy).toBe(100);
    expect(r.bestMoveSan).toBe('e4');
  });

  it('aplica as faixas de perda de win%', () => {
    const cls = (cp: number) =>
      classifyMove({ fenBefore: START_FEN, playedUci: 'g2g4', ply: 1, linesBefore: lines, evalAfter: { cp } })
        .classification;
    expect(cls(25)).toBe('excellent');
    expect(cls(-20)).toBe('good');
    expect(cls(-60)).toBe('inaccuracy');
    expect(cls(-150)).toBe('mistake');
    expect(cls(-400)).toBe('blunder');
  });

  it('único lance bom é Ótimo', () => {
    const r = classifyMove({
      fenBefore: START_FEN,
      playedUci: 'e2e4',
      ply: 1,
      linesBefore: [
        { pv: ['e2e4'], eval: { cp: 0 } },
        { pv: ['d2d4'], eval: { cp: -300 } },
      ],
      evalAfter: { cp: 0 },
    });
    expect(r.classification).toBe('great');
    expect(r.tags).toContain('only_move');
  });

  it('perder mate forçado e ficar só +5 é Capivarada (regra do Lichess)', () => {
    const r = classifyMove({
      fenBefore: START_FEN,
      playedUci: 'g2g4',
      ply: 1,
      linesBefore: [{ pv: ['e2e4'], eval: { mate: 2 } }],
      evalAfter: { cp: 500 },
    });
    expect(r.classification).toBe('blunder');
    expect(r.tags).toContain('missed_mate');
  });

  // Sacrifício grego: Bxh7+ Kxh7 Ng5+.
  const greek = 'r1bq1rk1/pppn1ppp/4p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R2QK2R w KQ - 0 8';

  it('detecta sacrifício pela linha principal', () => {
    expect(detectSacrifice(greek, 'd3h7', ['g8h7', 'f3g5'])).toBe(true);
    // Troca simples (bispo por cavalo na Espanhola) não é sacrifício.
    const ruyLopez = 'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4';
    expect(detectSacrifice(ruyLopez, 'b5c6', ['d7c6', 'e1g1'])).toBe(false);
    expect(detectSacrifice(START_FEN, 'e2e4', ['e7e5'])).toBe(false);
  });

  it('peça "atacada" por uma peça cravada não é sacrifício', () => {
    // Partida real: 9...Be6 deixa o bispo cravado no rei pela Qe2; 10.Nxd5 não oferece nada.
    const chess = new Chess();
    for (const san of 'e4 Nc6 Nc3 Nf6 Nf3 d6 e5 Ng8 exd6 exd6 d4 Nf6 Bg5 d5 Bxf6 Qxf6 Qe2+ Be6'.split(' ')) chess.move(san);
    expect(detectSacrifice(chess.fen(), 'c3d5', ['e8c8'])).toBe(false);
    // Sem a cravada (dama longe da coluna e), o mesmo cavalo em d5 seria peça oferecida ao bispo.
    const unpinned = chess.fen().replace('PPP1QPPP', 'PPPQ1PPP');
    expect(detectSacrifice(unpinned, 'c3d5', ['e6d5'])).toBe(true);
  });

  it('sacrifício bom vira Brilhante', () => {
    const r = classifyMove({
      fenBefore: greek,
      playedUci: 'd3h7',
      ply: 15,
      linesBefore: [
        { pv: ['d3h7', 'g8h7', 'f3g5'], eval: { cp: 150 } },
        { pv: ['e1g1'], eval: { cp: 40 } },
      ],
      evalAfter: { cp: 150 },
      lineAfter: ['g8h7', 'f3g5'],
    });
    expect(r.classification).toBe('brilliant');
    expect(r.tags).toContain('sacrifice');
  });

  it('não é Brilhante se já estava ganhando de lavada', () => {
    const r = classifyMove({
      fenBefore: greek,
      playedUci: 'd3h7',
      ply: 15,
      linesBefore: [{ pv: ['d3h7', 'g8h7'], eval: { cp: 900 } }],
      evalAfter: { cp: 900 },
      lineAfter: ['g8h7', 'f3g5'],
    });
    expect(r.classification).toBe('best');
  });

  it('marca peça pendurada', () => {
    // 1.e4 e5 2.Qh5?? Nc6 3.Qxe5+?? Nxe5: a dama cai.
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 2 3';
    const r = classifyMove({
      fenBefore: fen,
      playedUci: 'h5e5',
      ply: 5,
      linesBefore: [{ pv: ['f1c4', 'g7g6'], eval: { cp: 0 } }],
      evalAfter: { cp: -800 },
      lineAfter: ['c6e5', 'd2d4', 'e5c6'],
    });
    expect(r.classification).toBe('blunder');
    expect(r.tags).toContain('hung_piece');
    expect(r.tags).not.toContain('sacrifice');
  });
});

describe('forkTargets', () => {
  it('reconhece garfo de cavalo em rei e torre', () => {
    const chess = new Chess('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1');
    chess.move('Nc7+');
    expect(forkTargets(chess, 'c7')).toBe(2);
  });
});

describe('openings', () => {
  it('identifica a abertura pela posição', () => {
    const { records } = buildMoveRecords(['e2e4', 'c7c5', 'g1f3', 'd7d6'].map((uci) => ({ uci })));
    const op = detectOpening(records);
    expect(op?.eco).toBe('B50');
    expect(op?.name).toMatch(/Sicilian/);
    expect(op?.ply).toBe(4);
  });
});

describe('ideias do Lichess', () => {
  it('precisão do lance: 100 sem perda, com bônus de incerteza', () => {
    expect(moveAccuracy(0)).toBe(100);
    expect(moveAccuracy(10)).toBeCloseTo(64.6, 1);
    expect(moveAccuracy(80)).toBeCloseTo(1, 1);
  });

  it('precisão da partida pune mais um erro grave do que a média simples', () => {
    // Brancas jogam perfeito; pretas jogam bem e entregam tudo no último lance (ply 10).
    const wp = [50, 50, 50, 50, 50, 50, 50, 50, 50, 50, 90];
    const acc = gameAccuracyByColor(wp, 'w');
    expect(acc.white).toBe(100);
    const naive = (4 * 100 + moveAccuracy(40)) / 5;
    expect(acc.black!).toBeLessThan(naive);
  });

  it('regras de mate', () => {
    expect(mateJudgement({ cp: 50 }, { mate: -3 }, 'w')).toBe('blunder');
    expect(mateJudgement({ cp: -800 }, { mate: -3 }, 'w')).toBe('mistake');
    expect(mateJudgement({ mate: -2 }, { cp: -1200 }, 'b')).toBe('inaccuracy'); // pretas tinham mate, seguem +12
    expect(mateJudgement({ mate: 2 }, { cp: 200 }, 'w')).toBe('blunder');
    expect(mateJudgement({ cp: 10 }, { cp: -10 }, 'w')).toBeNull();
  });

  it('divide a partida em fases', () => {
    const { records } = buildMoveRecords(
      'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 e1g1 f8c5 d2d3 e8g8 c1g5 d7d6'.split(' ').map((uci) => ({ uci })),
    );
    const fens = [START_FEN, ...records.map((r) => r.fenAfter)];
    // 12 plies de desenvolvimento ainda são abertura.
    expect(divideGame(fens)).toEqual({ middle: undefined, end: undefined });
    // Primeira fileira das brancas com só 3 peças: começou o meio-jogo.
    const developed = 'r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R4RK1 w - - 0 8';
    const div = divideGame([START_FEN, developed]);
    expect(div).toEqual({ middle: 1, end: undefined });
    expect(phaseAt(div, 0)).toBe('opening');
    expect(phaseAt(div, 1)).toBe('middlegame');
    expect(divideGame(['8/5k2/8/8/8/8/3K4/R7 w - - 0 60'])).toEqual({ middle: undefined, end: 0 });
  });
});

describe('glickoUpdate', () => {
  it('acertar sobe, errar desce; contra problema mais difícil o ganho é maior', () => {
    const p = { rating: PUZZLE_START_RATING, rd: PUZZLE_START_RD };
    const winEasy = glickoUpdate(p, 1200, true);
    const winHard = glickoUpdate(p, 1800, true);
    const lossEasy = glickoUpdate(p, 1200, false);
    expect(winEasy.rating).toBeGreaterThan(1500);
    expect(winHard.rating - 1500).toBeGreaterThan(winEasy.rating - 1500);
    expect(lossEasy.rating).toBeLessThan(1500);
    expect(winEasy.rd).toBeLessThan(PUZZLE_START_RD);
  });

  it('com desvio pequeno o rating se mexe pouco e o desvio não cai abaixo do mínimo', () => {
    const settled = glickoUpdate({ rating: 1500, rd: 60 }, 1500, true);
    expect(settled.rating - 1500).toBeGreaterThan(3);
    expect(settled.rating - 1500).toBeLessThan(15);
    expect(settled.rd).toBe(60);
  });
});

describe('detectSacrifice: falsos brilhantes encontrados em partidas reais', () => {
  it('promover e deixar a peça nova ser capturada não é sacrifício (vale como peão)', () => {
    // 28...a1=Q com a torre de f1 podendo capturar: o Stockfish até preferia a1=R.
    expect(detectSacrifice('8/2p1kp1P/2p5/2P3R1/8/2q5/p4PP1/5RK1 b - - 0 28', 'a2a1q', ['f1a1', 'c3a1'])).toBe(false);
  });

  it('retomada depois de um lance intermediário não é sacrifício', () => {
    // 20.Nf5 Bxf5 21.Qf2 Bh6+ 22.Kb1 b6 23.exf5 (linha real do Stockfish): a peça volta no 3º lance.
    const fen = '1k1r2r1/1pp1qpbp/3p1nb1/1N1Pp2p/2B1P2Q/1P3PN1/P1P4P/2KR2R1 w - - 0 20';
    expect(detectSacrifice(fen, 'g3f5', ['g6f5', 'h4f2', 'b7b6', 'e4f5'])).toBe(false);
    expect(detectSacrifice(fen, 'g3f5', ['g6f5', 'h4f2', 'g7h6', 'c1b1', 'b7b6', 'e4f5'])).toBe(false);
  });
});
