import type {
  AnalysisStatus,
  CreateGameInput,
  GameResult,
  GameType,
  PlayerInfo,
  Termination,
  TimeControl,
} from '@faelchess/shared';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const RESULTS: GameResult[] = ['1-0', '0-1', '1/2-1/2', '*'];
const TERMINATIONS: Termination[] = [
  'checkmate',
  'resign',
  'timeout',
  'stalemate',
  'insufficient',
  'threefold',
  'fifty-moves',
  'agreement',
  'abandon',
  'unterminated',
];

export class PlayerDto implements PlayerInfo {
  @IsIn(['user', 'bot'])
  kind: 'user' | 'bot';

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_-]{1,40}$/i)
  userId?: string;

  @IsOptional()
  @IsInt()
  @Min(100)
  @Max(3500)
  botElo?: number;

  @IsString()
  @MaxLength(60)
  name: string;
}

export class TimeControlDto implements TimeControl {
  @IsInt()
  @Min(0)
  baseMs: number;

  @IsInt()
  @Min(0)
  incrementMs: number;
}

export class MoveInputDto {
  @Matches(/^[a-h][1-8][a-h][1-8][qrbn]?$/)
  uci: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  timeSpentMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  clockMs?: number;
}

export class CreateGameDto implements CreateGameInput {
  @IsIn(['bot', 'local'])
  type: 'bot' | 'local';

  @ValidateNested()
  @Type(() => PlayerDto)
  white: PlayerDto;

  @ValidateNested()
  @Type(() => PlayerDto)
  black: PlayerDto;

  @IsIn(RESULTS)
  result: GameResult;

  @IsIn(TERMINATIONS)
  termination: Termination;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  startFen?: string;

  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => MoveInputDto)
  moves: MoveInputDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => TimeControlDto)
  timeControl?: TimeControlDto;

  @IsISO8601()
  startedAt: string;

  @IsISO8601()
  finishedAt: string;
}

export class ListGamesQuery {
  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsIn(['bot', 'local', 'online'])
  type?: GameType;

  @IsOptional()
  @IsIn(RESULTS)
  result?: GameResult;

  @IsOptional()
  @IsIn(['pending', 'processing', 'done', 'failed'])
  analysisStatus?: AnalysisStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;
}
