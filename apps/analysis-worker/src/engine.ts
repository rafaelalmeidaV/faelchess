import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { parseInfoLine, sideToMove, toWhitePov, type InfoLine, type PvLine } from '@faelchess/shared';

// O parser UCI mora no shared (o navegador também usa no modo treino); reexportado para os testes.
export { parseInfoLine };

export interface EngineOptions {
  path: string;
  threads: number;
  hashMb: number;
  /** Tempo máximo por posição (proteção contra travamento). */
  timeoutMs?: number;
  /**
   * Teto de busca por posição: o Stockfish para na profundidade pedida OU neste tempo, o que vier
   * primeiro. Sem isso, uma posição rara pode buscar sem fim e travar a fila inteira.
   */
  maxMoveMs?: number;
}

/** Interface mínima que o analisador usa (facilita testar com um engine falso). */
export interface Analyzer {
  name: string;
  analyse(fen: string, depth: number, multiPv: number): Promise<PvLine[]>;
}

/** Stockfish nativo como processo filho, falando UCI por stdin/stdout. */
export class UciEngine implements Analyzer {
  name = 'stockfish';
  private proc!: ChildProcessWithoutNullStreams;
  private listeners: ((line: string) => void)[] = [];
  private currentMultiPv = 0;
  private exited = false;

  constructor(private readonly opts: EngineOptions) {}

  async start(): Promise<void> {
    this.proc = spawn(this.opts.path, [], { stdio: 'pipe' });
    this.proc.on('exit', () => (this.exited = true));
    const spawned = new Promise<void>((resolve, reject) => {
      this.proc.once('spawn', resolve);
      this.proc.once('error', reject);
    });
    createInterface({ input: this.proc.stdout }).on('line', (line) => {
      for (const l of [...this.listeners]) l(line);
    });
    await spawned;

    this.send('uci');
    await this.waitFor((line) => {
      if (line.startsWith('id name ')) this.name = line.slice(8).trim();
      return line === 'uciok';
    });
    this.send(`setoption name Threads value ${this.opts.threads}`);
    this.send(`setoption name Hash value ${this.opts.hashMb}`);
    await this.ready();
  }

  private send(cmd: string) {
    if (this.exited) throw new Error('Stockfish encerrou');
    this.proc.stdin.write(cmd + '\n');
  }

  private waitFor(match: (line: string) => boolean, timeoutMs = 30_000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.listeners = this.listeners.filter((l) => l !== listener);
        reject(new Error('Timeout esperando o Stockfish'));
      }, timeoutMs);
      const listener = (line: string) => {
        if (!match(line)) return;
        clearTimeout(timer);
        this.listeners = this.listeners.filter((l) => l !== listener);
        resolve();
      };
      this.listeners.push(listener);
    });
  }

  private async ready() {
    this.send('isready');
    await this.waitFor((l) => l === 'readyok');
  }

  async newGame() {
    this.send('ucinewgame');
    await this.ready();
  }

  /** Analisa uma posição e devolve as linhas do MultiPV, avaliações do ponto de vista das brancas. */
  async analyse(fen: string, depth: number, multiPv: number): Promise<PvLine[]> {
    if (multiPv !== this.currentMultiPv) {
      this.send(`setoption name MultiPV value ${multiPv}`);
      this.currentMultiPv = multiPv;
      await this.ready();
    }
    const lines = new Map<number, InfoLine>();
    const done = this.waitFor((line) => {
      const info = parseInfoLine(line);
      // Ignora scores parciais (lowerbound/upperbound) e mantém a linha mais profunda de cada multipv.
      if (info && !info.bound) {
        const prev = lines.get(info.multipv);
        if (!prev || info.depth >= prev.depth) lines.set(info.multipv, info);
      }
      return line.startsWith('bestmove');
    }, this.opts.timeoutMs ?? 120_000);
    this.send(`position fen ${fen}`);
    this.send(`go depth ${depth} movetime ${this.opts.maxMoveMs ?? 15_000}`);
    await done;

    const stm = sideToMove(fen);
    return [...lines.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, l]) => ({ pv: l.pv, eval: toWhitePov(l.score, stm) }));
  }

  async quit() {
    if (this.exited) return;
    this.send('quit');
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        this.proc.kill();
        resolve();
      }, 2000);
      this.proc.once('exit', () => {
        clearTimeout(t);
        resolve();
      });
    });
  }
}
