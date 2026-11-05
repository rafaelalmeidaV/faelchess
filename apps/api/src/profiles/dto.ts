import { IsString, MaxLength } from 'class-validator';

export const USER_ID = /^[a-z0-9_-]{1,40}$/i;

export class AvatarDto {
  /** data URL (webp, jpeg ou png) já reduzida pelo navegador. O limite real é conferido depois de decodificar. */
  @IsString()
  @MaxLength(95_000)
  image: string;
}
