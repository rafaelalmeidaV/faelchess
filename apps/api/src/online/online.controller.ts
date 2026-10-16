import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import { Public, accessKeyMatches } from '../common/access-key.guard';
import { TimeControlDto } from '../games/dto';
import { OnlineService } from './online.service';

class SeatDto {
  @IsString()
  @MaxLength(40)
  name: string;

  @IsOptional()
  @Matches(/^[a-z0-9_-]{1,40}$/i)
  userId?: string;
}

class CreateOnlineDto extends SeatDto {
  @IsIn(['w', 'b', 'random'])
  color: 'w' | 'b' | 'random';

  @ValidateNested()
  @Type(() => TimeControlDto)
  timeControl: TimeControlDto;
}

@Controller('online')
export class OnlineController {
  constructor(
    private readonly online: OnlineService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Cria o convite. Aberto a qualquer um; só quem manda a ACCESS_KEY tem a partida salva e analisada
   * (a análise roda num PC modesto em casa). Sem a chave valem limites de salas e por IP.
   */
  @Public()
  @Post()
  create(@Body() dto: CreateOnlineDto, @Req() req: Request) {
    const analyzed = accessKeyMatches(this.config.get<string>('ACCESS_KEY'), req.headers['x-access-key']);
    // Atrás do Caddy: ele substitui o X-Forwarded-For pelo IP real do cliente.
    const ip = String(req.headers['x-forwarded-for'] ?? req.ip ?? '').split(',')[0].trim();
    return this.online.create(dto, analyzed, ip);
  }

  /** Quem abre o link ocupa a cadeira livre. Público: o convidado não tem a chave. */
  @Public()
  @Post(':id/join')
  join(@Param('id') id: string, @Body() dto: SeatDto) {
    return this.online.join(id, dto);
  }

  @Public()
  @Get(':id')
  state(@Param('id') id: string) {
    return this.online.publicState(this.online.get(id));
  }
}
