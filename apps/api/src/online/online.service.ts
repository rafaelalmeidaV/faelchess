import { ConflictException, ForbiddenException, HttpException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import {
  START_FEN,
  boardOutcome,
  hasMatingMaterial,
  parseUci,
  type Color,
  type GameResult,
  type OnlinePublicState,
  type Termination,
  type TimeControl,
} from '@faelchess/shared';
import { Chess } from 'chess.js';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Collection } from 'mongodb';
import { Collections } from '../database/database.module';
import { newId, newToken } from '../common/ids';
import { GamesService } from '../games/games.service';

interface Seat {
  name: string;
  userId?: string;
  /** sha256 do token: o token em si só existe no navegador do jogador. */
  tokenHash: string;
}

interface LiveMove {
  uci: string;
  san: string;
  timeSpentMs: number;
  clockMs: number;
}

/** Documento da coleção `live_games` (estado mínimo para reconstruir a partida após reiniciar a API). */
interface LiveDoc {
  _id: string;
  startFen: string;
  white: Seat | null;
  black: Seat | null;
  timeControl: TimeControl;
  remaining: Record<Color, number>;
  moves: LiveMove[];
  status: OnlinePublicState['status'];
  result: GameResult;
  termination: Termination;
  drawOffer?: Color;
  /** Criada com a chave: salva e analisada no fim. Ausente (partidas antigas) = true. */
  analyzed?: boolean;
  createdAt: Date;
  startedAt?: Date;
  updatedAt: Date;
}

interface LiveGame extends LiveDoc {
  chess: Chess;
  /** Instante (Date.now) em que começou a vez atual. */
  lastMoveAt: number;
  connected: Record<Color, Set<string>>;
  flagTimer?: NodeJS.Timeout;
  abandonTimer?: NodeJS.Timeout;
}

export type MoveOutcome = { ok: true; state: OnlinePublicState } | { ok: false; reason: string };

const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
const ABANDON_MS = 2 * 60_000;
/** Partidas terminadas ficam um tempo na memória para os clientes verem o resultado. */
const KEEP_FINISHED_MS = 30 * 60_000;
/** Convites nunca aceitos expiram. */
const WAITING_TTL_MS = 24 * 60 * 60_000;
/** Salas criadas sem a chave (abertas a qualquer um): limites para não sobrecarregar a VM. */
const PUBLIC_WAITING_TTL_MS = 60 * 60_000;
const PUBLIC_MAX_OPEN = 30;
const PUBLIC_PER_IP = 5;
const PUBLIC_IP_WINDOW_MS = 10 * 60_000;

@Injectable()
export class OnlineService implements OnModuleInit {
  private readonly logger = new Logger(OnlineService.name);
  private readonly games = new Map<string, LiveGame>();
  private readonly live: Collection<LiveDoc>;
  /** Instantes das últimas salas sem chave criadas por IP. */
  private readonly publicByIp = new Map<string, number[]>();
  /** O gateway registra aqui como avisar os clientes (timeout/abandono acontecem fora de um evento). */
  onChange: (state: OnlinePublicState) => void = () => undefined;

  constructor(
    db: Collections,
    private readonly gamesService: GamesService,
  ) {
    this.live = db.db.collection<LiveDoc>('live_games');
  }

  /** Recarrega as partidas em andamento depois de um restart. O tempo em que a API ficou fora não conta. */
  async onModuleInit() {
    const docs = await this.live.find({ status: { $ne: 'over' } }).toArray();
    for (const doc of docs) {
      const ttl = doc.analyzed === false ? PUBLIC_WAITING_TTL_MS : WAITING_TTL_MS;
      if (doc.status === 'waiting' && Date.now() - doc.createdAt.getTime() > ttl) {
        await this.live.deleteOne({ _id: doc._id });
        continue;
      }
      const chess = new Chess(doc.startFen);
      for (const m of doc.moves) chess.move(parseUci(m.uci));
      const g: LiveGame = { ...doc, chess, lastMoveAt: Date.now(), connected: { w: new Set(), b: new Set() } };
      this.games.set(g._id, g);
      this.scheduleFlag(g);
      // Ninguém está conectado logo após o restart: dá o prazo normal de abandono.
      if (g.status === 'playing') this.scheduleAbandon(g);
      if (g.status === 'waiting' && g.analyzed === false) this.expireIfNotAccepted(g);
    }
    if (docs.length) this.logger.log(`${docs.length} partida(s) online recarregada(s)`);
  }

  /**
   * Cria o convite. Com a chave (`analyzed`), a partida é salva e analisada no fim; sem a chave
   * qualquer um pode criar, mas a partida não é salva e há limite de salas abertas e por IP.
   */
  async create(
    input: { name: string; userId?: string; color: Color | 'random'; timeControl: TimeControl },
    analyzed: boolean,
    ip: string,
  ) {
    if (!analyzed) this.checkPublicLimits(ip);
    const color: Color = input.color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : input.color;
    const token = newToken();
    const seat: Seat = { name: input.name, userId: input.userId, tokenHash: hashToken(token) };
    const now = new Date();
    const g: LiveGame = {
      _id: newId(8),
      startFen: START_FEN,
      white: color === 'w' ? seat : null,
      black: color === 'b' ? seat : null,
      timeControl: input.timeControl,
      remaining: { w: input.timeControl.baseMs, b: input.timeControl.baseMs },
      moves: [],
      status: 'waiting',
      result: '*',
      termination: 'unterminated',
      analyzed,
      createdAt: now,
      updatedAt: now,
      chess: new Chess(),
      lastMoveAt: Date.now(),
      connected: { w: new Set(), b: new Set() },
    };
    this.games.set(g._id, g);
    await this.save(g);
    if (!analyzed) this.expireIfNotAccepted(g);
    return { gameId: g._id, token, color };
  }

  /** Ocupa a cadeira livre de um convite. */
  async join(gameId: string, input: { name: string; userId?: string }) {
    const g = this.get(gameId);
    if (g.status !== 'waiting') throw new ConflictException('A partida já começou');
    const color: Color = g.white ? 'b' : 'w';
    const token = newToken();
    const seat: Seat = { name: input.name, userId: input.userId, tokenHash: hashToken(token) };
    if (color === 'w') g.white = seat;
    else g.black = seat;
    g.status = 'playing';
    g.startedAt = new Date();
    g.lastMoveAt = Date.now();
    await this.save(g);
    this.onChange(this.publicState(g));
    return { gameId, token, color };
  }

  get(gameId: string): LiveGame {
    const g = this.games.get(gameId);
    if (!g) throw new NotFoundException('Partida online não encontrada (ou já expirou)');
    return g;
  }

  has(gameId: string) {
    return this.games.has(gameId);
  }

  /** Cor do dono do token, ou null se não for jogador desta partida. */
  colorOf(g: LiveGame, token?: string): Color | null {
    if (!token) return null;
    const h = Buffer.from(hashToken(token));
    for (const [c, seat] of [['w', g.white], ['b', g.black]] as const) {
      if (seat && timingSafeEqual(h, Buffer.from(seat.tokenHash))) return c;
    }
    return null;
  }

  /** Associa um socket a um jogador (reconexão inclusa). Sem token válido, entra como espectador. */
  attach(gameId: string, token: string | undefined, socketId: string): { color: Color | null; state: OnlinePublicState } {
    const g = this.get(gameId);
    const color = this.colorOf(g, token);
    if (color) {
      g.connected[color].add(socketId);
      // Com os dois lados conectados de novo, não há mais abandono pendente.
      if (g.abandonTimer && g.connected.w.size > 0 && g.connected.b.size > 0) {
        clearTimeout(g.abandonTimer);
        g.abandonTimer = undefined;
      }
    }
    return { color, state: this.publicState(g) };
  }

  /** Um socket caiu: se o jogador ficou sem conexão, começa a contar o abandono. */
  detach(socketId: string): OnlinePublicState[] {
    const changed: OnlinePublicState[] = [];
    for (const g of this.games.values()) {
      let hit = false;
      for (const c of ['w', 'b'] as const) if (g.connected[c].delete(socketId)) hit = true;
      if (!hit) continue;
      if (g.status === 'playing') this.scheduleAbandon(g);
      if (g.status === 'waiting' && g.analyzed === false) this.expireIfNotAccepted(g);
      changed.push(this.publicState(g));
    }
    return changed;
  }

  async applyMove(dto: { gameId: string; token: string; uci: string }): Promise<MoveOutcome> {
    const g = this.games.get(dto.gameId);
    if (!g) return { ok: false, reason: 'Partida não encontrada' };
    if (g.status !== 'playing') return { ok: false, reason: 'A partida não está em andamento' };
    const color = this.colorOf(g, dto.token);
    if (!color) return { ok: false, reason: 'Token inválido' };
    if (g.chess.turn() !== color) return { ok: false, reason: 'Não é a sua vez' };
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(dto.uci)) return { ok: false, reason: 'Lance mal formatado' };

    const now = Date.now();
    const clockRunning = this.clockRunning(g);
    const spent = now - g.lastMoveAt;
    if (clockRunning && g.remaining[color] - spent <= 0) {
      await this.flag(g);
      return { ok: false, reason: 'Seu tempo acabou' };
    }

    let mv;
    try {
      mv = g.chess.move(parseUci(dto.uci));
    } catch {
      return { ok: false, reason: 'Lance ilegal' };
    }

    if (clockRunning) g.remaining[color] = g.remaining[color] - spent + g.timeControl.incrementMs;
    g.lastMoveAt = now;
    g.moves.push({ uci: mv.lan, san: mv.san, timeSpentMs: spent, clockMs: g.remaining[color] });
    // Um lance recusa implicitamente a oferta de empate do adversário.
    if (g.drawOffer && g.drawOffer !== color) g.drawOffer = undefined;

    const outcome = boardOutcome(g.chess);
    if (outcome) await this.finish(g, outcome.result, outcome.termination);
    else {
      this.scheduleFlag(g);
      await this.save(g);
    }
    return { ok: true, state: this.publicState(g) };
  }

  async resign(gameId: string, token: string) {
    const g = this.get(gameId);
    const color = this.requirePlayer(g, token);
    if (g.status !== 'playing') return this.publicState(g);
    await this.finish(g, color === 'w' ? '0-1' : '1-0', 'resign');
    return this.publicState(g);
  }

  async offerDraw(gameId: string, token: string) {
    const g = this.get(gameId);
    const color = this.requirePlayer(g, token);
    if (g.status !== 'playing') return this.publicState(g);
    // Se o outro já tinha oferecido, oferecer de volta é aceitar.
    if (g.drawOffer && g.drawOffer !== color) await this.finish(g, '1/2-1/2', 'agreement');
    else {
      g.drawOffer = color;
      await this.save(g);
    }
    return this.publicState(g);
  }

  async answerDraw(gameId: string, token: string, accept: boolean) {
    const g = this.get(gameId);
    const color = this.requirePlayer(g, token);
    if (g.status !== 'playing' || !g.drawOffer || g.drawOffer === color) return this.publicState(g);
    if (accept) await this.finish(g, '1/2-1/2', 'agreement');
    else {
      g.drawOffer = undefined;
      await this.save(g);
    }
    return this.publicState(g);
  }

  publicState(g: LiveGame): OnlinePublicState {
    const seat = (s: Seat | null, c: Color) => (s ? { name: s.name, userId: s.userId, connected: g.connected[c].size > 0 } : null);
    const running = g.status === 'playing' && this.clockRunning(g);
    return {
      id: g._id,
      status: g.status,
      startFen: g.startFen,
      fen: g.chess.fen(),
      moves: g.moves.map(({ uci, san }) => ({ uci, san })),
      white: seat(g.white, 'w'),
      black: seat(g.black, 'b'),
      timeControl: g.timeControl,
      remaining: { ...g.remaining },
      turnElapsedMs: running ? Date.now() - g.lastMoveAt : 0,
      clockRunning: running,
      result: g.result,
      termination: g.termination,
      drawOffer: g.drawOffer,
      analyzed: g.analyzed !== false,
    };
  }

  private checkPublicLimits(ip: string) {
    const open = [...this.games.values()].filter((g) => g.analyzed === false && g.status !== 'over').length;
    if (open >= PUBLIC_MAX_OPEN) throw new HttpException('Muitas salas abertas agora. Tente de novo daqui a pouco.', 429);
    const now = Date.now();
    const recent = (this.publicByIp.get(ip) ?? []).filter((t) => now - t < PUBLIC_IP_WINDOW_MS);
    if (recent.length >= PUBLIC_PER_IP) throw new HttpException('Você criou muitas salas seguidas. Espere alguns minutos.', 429);
    recent.push(now);
    this.publicByIp.set(ip, recent);
    // Limpa IPs antigos de vez em quando para o mapa não crescer.
    if (this.publicByIp.size > 1000)
      for (const [k, v] of this.publicByIp) if (v.every((t) => now - t >= PUBLIC_IP_WINDOW_MS)) this.publicByIp.delete(k);
  }

  /** Convite sem chave que ninguém aceitou some depois de uma hora. */
  private expireIfNotAccepted(g: LiveGame) {
    const left = PUBLIC_WAITING_TTL_MS - (Date.now() - g.createdAt.getTime());
    setTimeout(async () => {
      if (g.status !== 'waiting') return;
      this.games.delete(g._id);
      await this.live.deleteOne({ _id: g._id });
    }, Math.max(0, left)).unref();
  }

  private requirePlayer(g: LiveGame, token: string): Color {
    const c = this.colorOf(g, token);
    if (!c) throw new ForbiddenException('Token inválido');
    return c;
  }

  /** Como no Lichess: o relógio só corre depois que cada lado fez o primeiro lance. */
  private clockRunning(g: LiveGame) {
    return g.moves.length >= 2;
  }

  /** Um setTimeout por partida, reagendado a cada lance: estoura o tempo sem polling. */
  private scheduleFlag(g: LiveGame) {
    if (g.flagTimer) clearTimeout(g.flagTimer);
    g.flagTimer = undefined;
    if (g.status !== 'playing' || !this.clockRunning(g)) return;
    const turn = g.chess.turn();
    const left = g.remaining[turn] - (Date.now() - g.lastMoveAt);
    g.flagTimer = setTimeout(() => void this.flag(g), Math.max(0, left) + 50);
  }

  private async flag(g: LiveGame) {
    if (g.status !== 'playing') return;
    const turn = g.chess.turn();
    if (g.remaining[turn] - (Date.now() - g.lastMoveAt) > 0) return this.scheduleFlag(g);
    g.remaining[turn] = 0;
    const winner: Color = turn === 'w' ? 'b' : 'w';
    const result: GameResult = !hasMatingMaterial(g.chess, winner) ? '1/2-1/2' : winner === 'w' ? '1-0' : '0-1';
    await this.finish(g, result, 'timeout');
    this.onChange(this.publicState(g));
  }

  /** Jogador sem conexão por ABANDON_MS: perde (ou a partida é anulada se ninguém está conectado). */
  private scheduleAbandon(g: LiveGame) {
    if (g.abandonTimer) clearTimeout(g.abandonTimer);
    g.abandonTimer = setTimeout(async () => {
      g.abandonTimer = undefined;
      if (g.status !== 'playing') return;
      const wGone = g.connected.w.size === 0;
      const bGone = g.connected.b.size === 0;
      if (!wGone && !bGone) return;
      if (wGone && bGone) await this.finish(g, '*', 'abandon');
      else await this.finish(g, wGone ? '0-1' : '1-0', 'abandon');
      this.onChange(this.publicState(g));
    }, ABANDON_MS);
  }

  private async finish(g: LiveGame, result: GameResult, termination: Termination) {
    g.status = 'over';
    g.result = result;
    g.termination = termination;
    g.drawOffer = undefined;
    if (g.flagTimer) clearTimeout(g.flagTimer);
    if (g.abandonTimer) clearTimeout(g.abandonTimer);
    g.flagTimer = g.abandonTimer = undefined;

    // Sala criada sem a chave: não salva nem analisa (só some da memória depois).
    if (g.analyzed === false) {
      await this.live.deleteOne({ _id: g._id });
      setTimeout(() => this.games.delete(g._id), KEEP_FINISHED_MS).unref();
      return;
    }

    try {
      // Grava como partida normal (mesmo id), já na fila de análise.
      await this.gamesService.persist({
        id: g._id,
        type: 'online',
        white: { kind: 'user', name: g.white?.name ?? '?', userId: g.white?.userId },
        black: { kind: 'user', name: g.black?.name ?? '?', userId: g.black?.userId },
        result,
        termination,
        moves: g.moves.map(({ uci, timeSpentMs, clockMs }) => ({ uci, timeSpentMs, clockMs })),
        timeControl: g.timeControl,
        startedAt: (g.startedAt ?? g.createdAt).toISOString(),
        finishedAt: new Date().toISOString(),
      });
      await this.live.deleteOne({ _id: g._id });
    } catch (e) {
      this.logger.error(`Falha ao gravar a partida ${g._id}: ${(e as Error).message}`);
      await this.save(g);
    }
    setTimeout(() => this.games.delete(g._id), KEEP_FINISHED_MS).unref();
  }

  private async save(g: LiveGame) {
    g.updatedAt = new Date();
    const doc: LiveDoc = {
      _id: g._id,
      startFen: g.startFen,
      white: g.white,
      black: g.black,
      timeControl: g.timeControl,
      remaining: g.remaining,
      moves: g.moves,
      status: g.status,
      result: g.result,
      termination: g.termination,
      drawOffer: g.drawOffer,
      analyzed: g.analyzed,
      createdAt: g.createdAt,
      startedAt: g.startedAt,
      updatedAt: g.updatedAt,
    };
    await this.live.replaceOne({ _id: g._id }, doc, { upsert: true });
  }
}
