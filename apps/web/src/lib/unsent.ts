import type { CreateGameInput } from '@faelchess/shared';
import { ApiError, api } from './api';

const KEY = 'faelchess:unsent';

function load(): CreateGameInput[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function store(list: CreateGameInput[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* sem storage: paciência */
  }
}

export function unsentCount(): number {
  return load().length;
}

/**
 * Envia a partida para a API. Se a API estiver fora do ar (VM reiniciando, sem internet...),
 * guarda no navegador para reenviar depois. Erros 4xx não são guardados: a partida é inválida.
 */
export async function saveGame(input: CreateGameInput): Promise<{ id?: string; queued: boolean }> {
  try {
    const res = await api.createGame(input);
    return { id: res.id, queued: false };
  } catch (e) {
    if (e instanceof ApiError && e.status >= 400 && e.status < 500) throw e;
    store([...load(), input]);
    return { queued: true };
  }
}

/** Tenta reenviar o que ficou guardado. Devolve quantas foram enviadas. */
export async function flushUnsent(): Promise<number> {
  const list = load();
  if (!list.length) return 0;
  const left: CreateGameInput[] = [];
  let sent = 0;
  for (const input of list) {
    try {
      await api.createGame(input);
      sent++;
    } catch (e) {
      // Inválida (4xx) é descartada; falha de rede fica para a próxima.
      if (!(e instanceof ApiError && e.status >= 400 && e.status < 500)) left.push(input);
    }
  }
  store(left);
  return sent;
}
