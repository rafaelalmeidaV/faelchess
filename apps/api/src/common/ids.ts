import { randomBytes } from 'node:crypto';

const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Id curto e legível para URLs (sem caracteres ambíguos como l, 1, O, 0). */
export function newId(length = 10): string {
  const bytes = randomBytes(length);
  let id = '';
  for (let i = 0; i < length; i++) id += ALPHABET[bytes[i] % ALPHABET.length];
  return id;
}

/** Segredo do jogador nas partidas online. */
export function newToken(): string {
  return randomBytes(24).toString('base64url');
}
