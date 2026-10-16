import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

const USER_ID = /^[a-z0-9_-]{1,40}$/i;

export class UserQuery {
  @IsString()
  @Matches(USER_ID)
  userId: string;
}

export class NextPuzzleQuery {
  /** Com a chave: rating e histórico vêm do banco deste jogador. */
  @IsOptional()
  @IsString()
  @Matches(USER_ID)
  userId?: string;

  /** Tema do Lichess (ex.: "fork", "mateIn2"). */
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9]{1,40}$/)
  theme?: string;

  /** Sem a chave: rating guardado no navegador da pessoa. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(3500)
  rating?: number;

  /** Sem a chave: ids dos últimos problemas feitos, separados por vírgula (até 100). */
  @IsOptional()
  @IsString()
  @Matches(/^[a-zA-Z0-9]{1,10}(,[a-zA-Z0-9]{1,10}){0,99}$/)
  exclude?: string;
}

export class AttemptDto {
  @IsString()
  @Matches(USER_ID)
  userId: string;

  @IsBoolean()
  win: boolean;
}
