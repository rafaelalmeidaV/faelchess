import type { CreateGameInput, GameDoc, GameAnalysisSummary, Jsonified, OpeningInfo, PuzzleDoc } from '@faelchess/shared';
import { getAccessKey } from './profile';

export type Game = Jsonified<GameDoc>;

export interface GameSummary
  extends Pick<
    Game,
    '_id' | 'type' | 'white' | 'black' | 'result' | 'termination' | 'timeControl' | 'startedAt' | 'finishedAt' | 'analysisStatus'
  > {
  opening?: OpeningInfo;
  analysis?: Pick<Jsonified<GameAnalysisSummary>, 'accuracy' | 'counts'>;
  plyCount: number;
}

export type Puzzle = PuzzleDoc;

export interface PuzzleStats {
  rating: number;
  rd: number;
  attempts: number;
  wins: number;
  recent: { puzzleId: string; win: boolean; puzzleRating: number; ratingAfter: number; at: string }[];
  themes: { theme: string; attempts: number; wins: number }[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  const key = getAccessKey();
  if (key) headers.set('x-access-key', key);
  const res = await fetch(`/api${path}`, { ...init, headers });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = Array.isArray(body.message) ? body.message.join('; ') : (body.message ?? msg);
    } catch {
      /* corpo não é JSON */
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  createGame: (input: CreateGameInput) =>
    request<{ id: string; analysisStatus: string }>('/games', { method: 'POST', body: JSON.stringify(input) }),
  listGames: (params: { userId?: string; type?: string; limit?: number; skip?: number } = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) q.set(k, String(v));
    return request<{ items: GameSummary[]; total: number }>(`/games?${q}`);
  },
  getGame: (id: string) => request<Game>(`/games/${encodeURIComponent(id)}`),
  reanalyze: (id: string) => request<{ ok: true }>(`/games/${encodeURIComponent(id)}/reanalyze`, { method: 'POST' }),
  deleteGame: (id: string) => request<{ ok: true }>(`/games/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  queue: () => request<Record<string, number>>('/games/queue'),
  health: () => request<{ ok: boolean }>('/health'),
  nextPuzzle: (userId: string, theme?: string) =>
    request<Puzzle>(`/puzzles/next?${new URLSearchParams({ userId, ...(theme ? { theme } : {}) })}`),
  getPuzzle: (id: string) => request<Puzzle>(`/puzzles/${encodeURIComponent(id)}`),
  puzzleAttempt: (id: string, userId: string, win: boolean) =>
    request<{ rating: number; delta: number; counted: boolean }>(`/puzzles/${encodeURIComponent(id)}/attempt`, {
      method: 'POST',
      body: JSON.stringify({ userId, win }),
    }),
  puzzleStats: (userId: string) => request<PuzzleStats>(`/puzzles/stats?${new URLSearchParams({ userId })}`),
};
