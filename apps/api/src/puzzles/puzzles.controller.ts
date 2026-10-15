import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { AttemptDto, NextPuzzleQuery, UserQuery } from './dto';
import { PuzzlesService } from './puzzles.service';

@Controller('puzzles')
export class PuzzlesController {
  constructor(private readonly puzzles: PuzzlesService) {}

  @Get('next')
  next(@Query() q: NextPuzzleQuery) {
    return this.puzzles.next(q.userId, q.theme);
  }

  @Get('stats')
  stats(@Query() q: UserQuery) {
    return this.puzzles.stats(q.userId);
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.puzzles.get(id);
  }

  @Post(':id/attempt')
  @HttpCode(200)
  attempt(@Param('id') id: string, @Body() dto: AttemptDto) {
    return this.puzzles.attempt(id, dto.userId, dto.win);
  }
}
