import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';

const PUBLIC_KEY = 'faelchess:public';
/** Rota liberada sem ACCESS_KEY (ex.: entrar numa partida online pelo link). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/**
 * Proteção simples para uso pessoal: se ACCESS_KEY estiver definido, exige o header x-access-key.
 * Sem ACCESS_KEY, tudo fica aberto (útil em desenvolvimento).
 */
@Injectable()
export class AccessKeyGuard implements CanActivate {
  private readonly key: Buffer | null;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService,
  ) {
    const key = config.get<string>('ACCESS_KEY');
    this.key = key ? Buffer.from(key) : null;
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.key || context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    const sent = Buffer.from(String(context.switchToHttp().getRequest<Request>().headers['x-access-key'] ?? ''));
    if (sent.length === this.key.length && timingSafeEqual(sent, this.key)) return true;
    throw new UnauthorizedException('x-access-key inválido');
  }
}
