/**
 * Stockfish WASM (lite, single-thread) num Web Worker: o bot joga no navegador, sem gastar o servidor.
 */
import { parseInfoLine, sideToMove, toWhitePov, type InfoLine, type PvLine } from '@faelchess/shared';

export interface BotLevel {
  elo: number;
  label: string;
  /** Acima de 1320 o Stockfish limita a força sozinho (UCI_Elo). Abaixo, usamos Skill Level + profundidade baixa. */
  skill?: number;
  depth?: number;
  movetimeMs: number;
}

export const BOT_LEVELS: BotLevel[] = [
  { elo: 400, label: 'Iniciante', skill: 0, depth: 1, movetimeMs: 50 },
  { elo: 600, label: 'Novato', skill: 1, depth: 2, movetimeMs: 80 },
  { elo: 800, label: 'Casual', skill: 3, depth: 3, movetimeMs: 100 },
  { elo: 1000, label: 'Clube I', skill: 5, depth: 4, movetimeMs: 150 },
  { elo: 1200, label: 'Clube II', skill: 8, depth: 6, movetimeMs: 200 },
  { elo: 1400, label: 'Intermediário', movetimeMs: 400 },
  { elo: 1600, label: 'Avançado I', movetimeMs: 500 },
  { elo: 1800, label: 'Avançado II', movetimeMs: 600 },
  { elo: 2000, label: 'Expert', movetimeMs: 700 },
  { elo: 2200, label: 'Mestre', movetimeMs: 800 },
  { elo: 2500, label: 'Grande Mestre', movetimeMs: 1000 },
  { elo: 3190, label: 'Stockfish máximo', movetimeMs: 1500 },
];

export function levelFor(elo: number): BotLevel {
  return BOT_LEVELS.reduce((best, l) => (Math.abs(l.elo - elo) < Math.abs(best.elo - elo) ? l : best));
}

type Listener = (line: string) => void;

export class BrowserEngine {
  private worker: Worker | null = null;
  private listeners = new Set<Listener>();
  private queue: Promise<unknown> = Promise.resolve();
  private ready: Promise<void> | null = null;
  private fullStrength = false;
  private multiPv = 1;

  private ensure(): Promise<void> {
    if (this.ready) return this.ready;
    this.worker = new Worker('/engine/stockfish-19-lite-single.js');
    this.worker.onmessage = (e: MessageEvent) => {
      const line = typeof e.data === 'string' ? e.data : String(e.data);
      for (const l of [...this.listeners]) l(line);
    };
    this.ready = (async () => {
      this.send('uci');
      await this.waitFor((l) => l === 'uciok');
      this.send('setoption name Hash value 32');
      await this.isReady();
    })();
    return this.ready;
  }

  private send(cmd: string) {
    this.worker?.postMessage(cmd);
  }

  private waitFor(match: (line: string) => boolean, onLine?: Listener): Promise<string> {
    return new Promise((resolve) => {
      const l: Listener = (line) => {
        onLine?.(line);
        if (match(line)) {
          this.listeners.delete(l);
          resolve(line);
        }
      };
      this.listeners.add(l);
    });
  }

  private async isReady() {
    this.send('isready');
    await this.waitFor((l) => l === 'readyok');
  }

  /** Serializa as chamadas: o worker só pensa em uma coisa por vez. */
  private run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.catch(() => undefined);
    return next;
  }

  async newGame(level: BotLevel) {
    return this.run(async () => {
      await this.ensure();
      this.send('ucinewgame');
      if (level.skill !== undefined) {
        this.send('setoption name UCI_LimitStrength value false');
        this.send(`setoption name Skill Level value ${level.skill}`);
      } else {
        this.send('setoption name Skill Level value 20');
        this.send('setoption name UCI_LimitStrength value true');
        this.send(`setoption name UCI_Elo value ${Math.max(1320, Math.min(3190, level.elo))}`);
      }
      await this.isReady();
    });
  }

  /**
   * Lance do bot. `fen` é a posição inicial e `moves` os lances UCI desde ela
   * (passar o histórico ajuda o engine a evitar repetições).
   */
  bestMove(fen: string, moves: string[], level: BotLevel, maxMs?: number): Promise<string> {
    return this.run(async () => {
      await this.ensure();
      this.send(`position fen ${fen}${moves.length ? ` moves ${moves.join(' ')}` : ''}`);
      const movetime = Math.max(30, Math.min(level.movetimeMs, maxMs ?? Infinity));
      const go = level.depth ? `go depth ${level.depth} movetime ${movetime}` : `go movetime ${movetime}`;
      const done = this.waitFor((l) => l.startsWith('bestmove'));
      this.send(go);
      const line = await done;
      return line.split(' ')[1];
    });
  }

  /**
   * Avaliação de uma posição na força máxima (modo treino). Use uma instância separada da do bot,
   * porque aqui a força limitada é desligada. Avaliações do ponto de vista das brancas.
   */
  analyse(fen: string, depth: number, multiPv: number): Promise<PvLine[]> {
    return this.run(async () => {
      await this.ensure();
      if (!this.fullStrength) {
        this.send('setoption name UCI_LimitStrength value false');
        this.send('setoption name Skill Level value 20');
        this.fullStrength = true;
      }
      if (multiPv !== this.multiPv) {
        this.send(`setoption name MultiPV value ${multiPv}`);
        this.multiPv = multiPv;
      }
      await this.isReady();
      const lines = new Map<number, InfoLine>();
      const done = this.waitFor(
        (l) => l.startsWith('bestmove'),
        (l) => {
          const info = parseInfoLine(l);
          if (info && !info.bound) {
            const prev = lines.get(info.multipv);
            if (!prev || info.depth >= prev.depth) lines.set(info.multipv, info);
          }
        },
      );
      this.send(`position fen ${fen}`);
      this.send(`go depth ${depth}`);
      await done;
      const stm = sideToMove(fen);
      return [...lines.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, l]) => ({ pv: l.pv, eval: toWhitePov(l.score, stm) }));
    });
  }

  stop() {
    this.send('stop');
  }

  destroy() {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    this.listeners.clear();
  }
}
