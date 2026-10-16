import { Body, Controller, Get, HttpCode, HttpException, Param, Post, Query, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PUZZLE_START_RATING } from '@faelchess/shared';
import { Public, accessKeyMatches } from '../common/access-key.guard';
import { AttemptDto, NextPuzzleQuery, UserQuery } from './dto';
import { PuzzlesService } from './puzzles.service';

/** Sem a chave: até 120 problemas a cada 10 minutos por IP. */
const PUBLIC_LIMIT = 120;
const PUBLIC_WINDOW_MS = 10 * 60_000;

@Controller('puzzles')
export class PuzzlesController {
  private readonly byIp = new Map<string, number[]>();

  constructor(
    private readonly puzzles: PuzzlesService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Próximo problema. Com a chave, usa o rating e o histórico do jogador no banco. Sem a chave
   * (qualquer pessoa), usa o rating e os últimos ids que o navegador manda, e nada é gravado.
   */
  @Public()
  @Get('next')
  next(@Query() q: NextPuzzleQuery, @Req() req: Request) {
    const keyed = accessKeyMatches(this.config.get<string>('ACCESS_KEY'), req.headers['x-access-key']);
    if (keyed && q.userId) return this.puzzles.next(q.userId, q.theme);
    this.limit(req);
    return this.puzzles.nextFor(q.rating ?? PUZZLE_START_RATING, q.exclude?.split(',') ?? [], q.theme);
  }

  @Get('stats')
  stats(@Query() q: UserQuery) {
    return this.puzzles.stats(q.userId);
  }

  @Public()
  @Get(':id')
  get(@Param('id') id: string, @Req() req: Request) {
    if (!accessKeyMatches(this.config.get<string>('ACCESS_KEY'), req.headers['x-access-key'])) this.limit(req);
    return this.puzzles.get(id);
  }

  @Post(':id/attempt')
  @HttpCode(200)
  attempt(@Param('id') id: string, @Body() dto: AttemptDto) {
    return this.puzzles.attempt(id, dto.userId, dto.win);
  }

  private limit(req: Request) {
    // Atrás do Caddy: ele substitui o X-Forwarded-For pelo IP real do cliente.
    const ip = String(req.headers['x-forwarded-for'] ?? req.ip ?? '').split(',')[0].trim();
    const now = Date.now();
    const recent = (this.byIp.get(ip) ?? []).filter((t) => now - t < PUBLIC_WINDOW_MS);
    if (recent.length >= PUBLIC_LIMIT) throw new HttpException('Muitos problemas seguidos. Respire e volte daqui a pouco.', 429);
    recent.push(now);
    this.byIp.set(ip, recent);
    if (this.byIp.size > 1000)
      for (const [k, v] of this.byIp) if (v.every((t) => now - t >= PUBLIC_WINDOW_MS)) this.byIp.delete(k);
  }
}
