import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches, MaxLength, ValidateNested } from 'class-validator';
import { Public } from '../common/access-key.guard';
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
  constructor(private readonly online: OnlineService) {}

  /** Cria o convite (protegido pela ACCESS_KEY, se houver): só o dono do app cria partidas. */
  @Post()
  create(@Body() dto: CreateOnlineDto) {
    return this.online.create(dto);
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
