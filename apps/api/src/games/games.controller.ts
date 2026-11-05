import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { CreateGameDto, FavoriteDto, ListGamesQuery } from './dto';
import { GamesService } from './games.service';

@Controller('games')
export class GamesController {
  constructor(private readonly games: GamesService) {}

  /** Recebe uma partida terminada (bot ou local) e coloca na fila de análise. */
  @Post()
  async create(@Body() dto: CreateGameDto) {
    const game = await this.games.persist(dto);
    return { id: game._id, analysisStatus: game.analysisStatus, opening: game.opening };
  }

  @Get()
  list(@Query() query: ListGamesQuery) {
    return this.games.list(query);
  }

  @Get('queue')
  queue() {
    return this.games.queue();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.games.get(id);
  }

  /** Favoritar / desfavoritar (exige a chave de acesso, como o resto). */
  @Put(':id/favorite')
  @HttpCode(200)
  favorite(@Param('id') id: string, @Body() dto: FavoriteDto) {
    return this.games.setFavorite(id, dto.userId, dto.favorite);
  }

  @Post(':id/reanalyze')
  @HttpCode(200)
  reanalyze(@Param('id') id: string) {
    return this.games.reanalyze(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.games.remove(id);
  }
}
