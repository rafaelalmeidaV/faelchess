/** Perfil sem login: fica no localStorage do navegador. */
export interface Profile {
  userId: string;
  name: string;
}

const PROFILE_KEY = 'faelchess:profile';
const ACCESS_KEY = 'faelchess:accessKey';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* modo privado: segue sem persistir */
  }
}

export function slugify(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'jogador'
  );
}

export function getProfile(): Profile | null {
  return read<Profile>(PROFILE_KEY);
}

export function saveProfile(p: Profile) {
  write(PROFILE_KEY, p);
}

export function getAccessKey(): string {
  return read<string>(ACCESS_KEY) ?? '';
}

export function saveAccessKey(key: string) {
  write(ACCESS_KEY, key);
}

/** Token secreto por partida online, para reconectar depois de recarregar a página. */
export function getOnlineToken(gameId: string): string | null {
  return read<string>(`faelchess:online:${gameId}`);
}

export function saveOnlineToken(gameId: string, token: string) {
  write(`faelchess:online:${gameId}`, token);
}
