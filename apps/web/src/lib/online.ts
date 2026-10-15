import type { Color, OnlinePublicState, TimeControl } from '@faelchess/shared';
import { io, type Socket } from 'socket.io-client';
import { getAccessKey, saveOnlineToken, type Profile } from './profile';

async function post<T>(path: string, body: unknown, withKey = false): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  const key = getAccessKey();
  if (withKey && key) headers['x-access-key'] = key;
  const res = await fetch(`/api${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message.join('; ') : (data.message ?? res.statusText));
  return data as T;
}

export async function createOnlineGame(opts: {
  timeControl?: TimeControl;
  color: Color | 'random';
  profile: Profile;
}): Promise<{ gameId: string; color: Color }> {
  const res = await post<{ gameId: string; token: string; color: Color }>(
    '/online',
    {
      name: opts.profile.name,
      userId: opts.profile.userId,
      color: opts.color,
      timeControl: opts.timeControl ?? { baseMs: 600_000, incrementMs: 5_000 },
    },
    true,
  );
  saveOnlineToken(res.gameId, res.token);
  return res;
}

export async function joinOnlineGame(gameId: string, profile: Profile) {
  const res = await post<{ gameId: string; token: string; color: Color }>(`/online/${gameId}/join`, {
    name: profile.name,
    userId: profile.userId,
  });
  saveOnlineToken(gameId, res.token);
  return res;
}

export async function fetchOnlineState(gameId: string): Promise<OnlinePublicState | null> {
  const res = await fetch(`/api/online/${encodeURIComponent(gameId)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

let socket: Socket | null = null;

/** Um socket só para o app inteiro; reconecta sozinho. */
export function getSocket(): Socket {
  socket ??= io({ path: '/socket.io', transports: ['websocket', 'polling'] });
  return socket;
}
