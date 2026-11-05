import { BadRequestException, Injectable } from '@nestjs/common';
import { Binary } from 'mongodb';
import { Collections } from '../database/database.module';
import { USER_ID } from './dto';

/** Foto de perfil já reduzida pelo navegador (~256 px): passa disso é abuso, não foto. */
export const MAX_AVATAR_BYTES = 64 * 1024;

const DATA_URL = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/;

/** Confere os primeiros bytes: o tipo declarado tem que ser o conteúdo de verdade (nada de SVG/HTML disfarçado). */
function matchesMagic(type: string, b: Buffer) {
  if (type === 'image/jpeg') return b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (type === 'image/png') return b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (type === 'image/webp') return b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP';
  return false;
}

@Injectable()
export class ProfilesService {
  constructor(private readonly db: Collections) {}

  private checkId(userId: string) {
    if (!USER_ID.test(userId)) throw new BadRequestException('userId inválido');
  }

  async setAvatar(userId: string, dataUrl: string) {
    this.checkId(userId);
    const m = DATA_URL.exec(dataUrl);
    if (!m) throw new BadRequestException('Envie uma imagem webp, jpeg ou png');
    const [, type, b64] = m;
    const data = Buffer.from(b64, 'base64');
    if (data.length > MAX_AVATAR_BYTES) throw new BadRequestException(`Imagem grande demais (máx. ${MAX_AVATAR_BYTES / 1024} KB)`);
    if (!matchesMagic(type, data)) throw new BadRequestException('O conteúdo não é uma imagem do tipo informado');
    await this.db.profiles.updateOne(
      { _id: userId.toLowerCase() },
      { $set: { avatar: new Binary(data), avatarType: type, updatedAt: new Date() } },
      { upsert: true },
    );
    return { ok: true, bytes: data.length };
  }

  async removeAvatar(userId: string) {
    this.checkId(userId);
    await this.db.profiles.updateOne({ _id: userId.toLowerCase() }, { $unset: { avatar: '', avatarType: '' }, $set: { updatedAt: new Date() } });
    return { ok: true };
  }

  /** null se não tem foto (ou o id é inválido): o navegador cai na inicial do nome. */
  async getAvatar(userId: string): Promise<{ type: string; data: Buffer } | null> {
    if (!USER_ID.test(userId)) return null;
    const doc = await this.db.profiles.findOne({ _id: userId.toLowerCase() }, { projection: { avatar: 1, avatarType: 1 } });
    if (!doc?.avatar || !doc.avatarType) return null;
    return { type: doc.avatarType, data: Buffer.from(doc.avatar.buffer) };
  }
}

