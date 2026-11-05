import { getProfile } from './profile';

const VERSION_KEY = 'faelchess:avatarVersion';
const SIZE = 256;
/** O servidor aceita até 64 KB decodificados (~87 mil caracteres em base64). */
const MAX_DATA_URL = 85_000;

/**
 * Endereço da foto de um jogador. Sem foto o servidor responde 404 e o <Avatar> mostra a inicial do nome.
 * Para a própria foto, a versão local força o navegador a baixar de novo depois de trocar (o servidor deixa em cache por 5 min).
 */
export function avatarUrl(userId: string): string {
  let v = '';
  if (getProfile()?.userId === userId) {
    try {
      v = localStorage.getItem(VERSION_KEY) ?? '';
    } catch {
      /* sem storage: sem versão */
    }
  }
  return `/api/profiles/${encodeURIComponent(userId)}/avatar${v ? `?v=${v}` : ''}`;
}

export function bumpAvatarVersion() {
  try {
    localStorage.setItem(VERSION_KEY, String(Date.now()));
  } catch {
    /* ok */
  }
}

/** Recorta o quadrado central, reduz para 256 px e devolve uma data URL (webp se o navegador salvar, senão jpeg). */
export async function prepareAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') throw new Error('Escolha uma foto (jpeg, png ou webp)');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Não consegui abrir essa imagem');
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('O navegador não conseguiu processar a imagem');
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.55]) {
    let url = canvas.toDataURL('image/webp', quality);
    if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= MAX_DATA_URL) return url;
  }
  throw new Error('Não consegui reduzir a imagem o bastante');
}
