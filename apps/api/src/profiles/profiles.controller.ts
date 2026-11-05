import { Body, Controller, Delete, Get, HttpCode, Param, Put, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../common/access-key.guard';
import { AvatarDto } from './dto';
import { ProfilesService } from './profiles.service';

@Controller('profiles')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  /**
   * Foto de perfil. Pública de propósito: quem joga contra você (convidado de partida online) também a vê,
   * e o <img> do navegador não manda header. Sem foto, 404 e o navegador mostra a inicial do nome.
   */
  @Public()
  @Get(':userId/avatar')
  async avatar(@Param('userId') userId: string, @Res() res: Response) {
    const a = await this.profiles.getAvatar(userId);
    res.setHeader('x-content-type-options', 'nosniff');
    if (!a) {
      res.setHeader('cache-control', 'public, max-age=60');
      res.status(404).end();
      return;
    }
    res.setHeader('content-type', a.type);
    res.setHeader('content-security-policy', "default-src 'none'");
    res.setHeader('cache-control', 'public, max-age=300');
    res.end(a.data);
  }

  /** Só com a chave de acesso (guard global): enviar e remover. */
  @Put(':userId/avatar')
  @HttpCode(200)
  setAvatar(@Param('userId') userId: string, @Body() dto: AvatarDto) {
    return this.profiles.setAvatar(userId, dto.image);
  }

  @Delete(':userId/avatar')
  @HttpCode(200)
  removeAvatar(@Param('userId') userId: string) {
    return this.profiles.removeAvatar(userId);
  }
}
