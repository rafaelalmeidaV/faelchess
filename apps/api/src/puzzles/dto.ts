import { IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

const USER_ID = /^[a-z0-9_-]{1,40}$/i;

export class UserQuery {
  @IsString()
  @Matches(USER_ID)
  userId: string;
}

export class NextPuzzleQuery extends UserQuery {
  /** Tema do Lichess (ex.: "fork", "mateIn2"). */
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9]{1,40}$/)
  theme?: string;
}

export class AttemptDto {
  @IsString()
  @Matches(USER_ID)
  userId: string;

  @IsBoolean()
  win: boolean;
}
