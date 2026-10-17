import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { OnlineService } from './online.service';

interface GameRef {
  gameId: string;
  token?: string;
}

/** Limite simples por socket: no máximo 30 eventos a cada 10 s. */
const RATE = { max: 30, windowMs: 10_000 };

@WebSocketGateway({ cors: process.env.CORS_ORIGIN ? { origin: process.env.CORS_ORIGIN.split(',') } : false })
export class OnlineGateway implements OnGatewayInit, OnGatewayDisconnect {
  private readonly logger = new Logger(OnlineGateway.name);
  @WebSocketServer() server: Server;
  private readonly hits = new Map<string, { n: number; since: number }>();

  constructor(private readonly online: OnlineService) {}

  afterInit() {
    // Timeouts e abandonos acontecem fora de um evento: o serviço avisa por aqui.
    this.online.onChange = (state) => this.server.to(state.id).emit('game:state', state);
    this.online.onGone = (gone) => this.server.to(gone.id).emit('game:gone', gone);
  }

  handleDisconnect(socket: Socket) {
    this.hits.delete(socket.id);
    for (const state of this.online.detach(socket.id)) this.server.to(state.id).emit('game:state', state);
  }

  private limited(socket: Socket): boolean {
    const now = Date.now();
    const h = this.hits.get(socket.id);
    if (!h || now - h.since > RATE.windowMs) {
      this.hits.set(socket.id, { n: 1, since: now });
      return false;
    }
    h.n++;
    if (h.n > RATE.max) {
      socket.emit('game:error', 'Muitos eventos; aguarde um pouco');
      return true;
    }
    return false;
  }

  private valid(dto: unknown): dto is GameRef {
    const d = dto as GameRef;
    return !!d && typeof d.gameId === 'string' && d.gameId.length < 40 && (d.token === undefined || typeof d.token === 'string');
  }

  @SubscribeMessage('game:join')
  async join(@ConnectedSocket() socket: Socket, @MessageBody() dto: GameRef) {
    if (this.limited(socket) || !this.valid(dto)) return;
    // Sala fora da memória: diz se a partida foi gravada (abre a análise) ou se o convite expirou.
    if (!this.online.has(dto.gameId))
      return socket.emit('game:gone', { id: dto.gameId, saved: await this.online.wasSaved(dto.gameId) });
    const { color, state } = this.online.attach(dto.gameId, dto.token, socket.id);
    void socket.join(dto.gameId);
    socket.emit('game:joined', { color });
    // Todo mundo na sala vê que o jogador (re)conectou.
    this.server.to(dto.gameId).emit('game:state', state);
  }

  @SubscribeMessage('move:make')
  async move(@ConnectedSocket() socket: Socket, @MessageBody() dto: GameRef & { uci: string }) {
    if (this.limited(socket) || !this.valid(dto) || typeof dto.uci !== 'string' || !dto.token) return;
    const result = await this.online.applyMove({ gameId: dto.gameId, token: dto.token, uci: dto.uci });
    if (!result.ok) {
      socket.emit('move:rejected', result.reason);
      // Manda o estado real para o cliente desfazer o lance otimista.
      if (this.online.has(dto.gameId)) socket.emit('game:state', this.online.publicState(this.online.get(dto.gameId)));
      return;
    }
    this.server.to(dto.gameId).emit('game:state', result.state);
  }

  @SubscribeMessage('game:resign')
  async resign(@ConnectedSocket() socket: Socket, @MessageBody() dto: GameRef) {
    if (this.limited(socket) || !this.valid(dto) || !dto.token) return;
    await this.run(socket, dto.gameId, () => this.online.resign(dto.gameId, dto.token!));
  }

  @SubscribeMessage('draw:offer')
  async offerDraw(@ConnectedSocket() socket: Socket, @MessageBody() dto: GameRef) {
    if (this.limited(socket) || !this.valid(dto) || !dto.token) return;
    await this.run(socket, dto.gameId, () => this.online.offerDraw(dto.gameId, dto.token!));
  }

  @SubscribeMessage('draw:answer')
  async answerDraw(@ConnectedSocket() socket: Socket, @MessageBody() dto: GameRef & { accept: boolean }) {
    if (this.limited(socket) || !this.valid(dto) || !dto.token) return;
    await this.run(socket, dto.gameId, () => this.online.answerDraw(dto.gameId, dto.token!, !!dto.accept));
  }

  private async run(socket: Socket, gameId: string, fn: () => Promise<{ id: string }>) {
    try {
      const state = await fn();
      this.server.to(gameId).emit('game:state', state);
    } catch (e) {
      socket.emit('game:error', (e as Error).message);
      this.logger.debug(`Evento rejeitado em ${gameId}: ${(e as Error).message}`);
    }
  }
}
