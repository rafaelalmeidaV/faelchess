export type Color = 'w' | 'b';

/** `chesscom` = partida importada do chess.com (só para análise). */
export type GameType = 'bot' | 'local' | 'online' | 'chesscom';
export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';
export type Termination =
  | 'checkmate'
  | 'resign'
  | 'timeout'
  | 'stalemate'
  | 'insufficient'
  | 'threefold'
  | 'fifty-moves'
  | 'agreement'
  | 'abandon'
  | 'unterminated';
export type AnalysisStatus = 'pending' | 'processing' | 'done' | 'failed';
export type Phase = 'opening' | 'middlegame' | 'endgame';

export const CLASSIFICATIONS = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'blunder',
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const CLASSIFICATION_LABELS_PT: Record<Classification, string> = {
  brilliant: 'Brilhante',
  great: 'Ótimo',
  best: 'Melhor',
  excellent: 'Excelente',
  good: 'Bom',
  inaccuracy: 'Imprecisão',
  mistake: 'Erro',
  blunder: 'Capivarada',
};

export const CLASSIFICATION_SYMBOLS: Record<Classification, string> = {
  brilliant: '!!',
  great: '!',
  best: '★',
  excellent: '',
  good: '',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};

/** Tags heurísticas anexadas a lances ruins (e alguns bons) para o MCP achar padrões. */
export type MoveTag =
  | 'hung_piece'
  | 'allowed_fork'
  | 'allowed_mate'
  | 'missed_mate'
  | 'missed_fork'
  | 'missed_material'
  | 'sacrifice'
  | 'recapture'
  | 'only_move'
  | 'check';

/**
 * Avaliação do engine, SEMPRE do ponto de vista das brancas.
 * Exatamente um de `cp` ou `mate` vem preenchido.
 * mate > 0: brancas dão mate em N; mate < 0: pretas dão mate em N.
 * mate = 0: a posição já é mate, e `winner` diz quem deu.
 */
export interface Eval {
  cp?: number;
  mate?: number;
  winner?: Color;
}

export interface PlayerInfo {
  kind: 'user' | 'bot';
  /** Id estável do usuário (sem login: vem do perfil salvo no navegador). Ausente para convidados. */
  userId?: string;
  botElo?: number;
  name: string;
  /** Rating do jogador na plataforma de origem (partidas importadas). */
  rating?: number;
}

export interface TimeControl {
  baseMs: number;
  incrementMs: number;
}

export interface MoveAnalysis {
  evalBefore: Eval;
  evalAfter: Eval;
  bestMove: string;
  bestMoveSan: string;
  bestEval: Eval;
  /** Linha principal do engine a partir da posição anterior ao lance (UCI). */
  bestLine: string[];
  /** Win% do ponto de vista de quem jogou o lance. */
  winPctBefore: number;
  winPctAfter: number;
  winPctLoss: number;
  /** Precisão do lance (0-100), fórmula do Lichess. */
  accuracy: number;
  classification: Classification;
  tags: MoveTag[];
  phase: Phase;
}

export interface MoveRecord extends Partial<MoveAnalysis> {
  ply: number;
  san: string;
  uci: string;
  color: Color;
  fenBefore: string;
  fenAfter: string;
  timeSpentMs?: number;
  /** Tempo restante no relógio de quem jogou, após o lance (se houver relógio). */
  clockMs?: number;
}

export interface OpeningInfo {
  eco: string;
  name: string;
  /** Último ply da partida que bateu com a base de aberturas. */
  ply: number;
}

export type ClassificationCounts = Record<Classification, number>;

export interface GameAnalysisSummary {
  engine: string;
  depth: number;
  multiPv: number;
  analyzedAt: Date;
  durationMs: number;
  /** Precisão da partida (média ponderada por volatilidade + média harmônica, como o Lichess). */
  accuracy: ColorAccuracy;
  /** Precisão em cada fase; null se a cor não jogou naquela fase. */
  phaseAccuracy: Record<Phase, ColorAccuracy>;
  /** Índices de posição (0 = inicial) onde começam o meio-jogo e o final. */
  division: { middle?: number; end?: number };
  counts: { white: ClassificationCounts; black: ClassificationCounts };
}

export interface ColorAccuracy {
  white: number | null;
  black: number | null;
}

export interface GameDoc {
  _id: string;
  type: GameType;
  white: PlayerInfo;
  black: PlayerInfo;
  /** userIds presentes na partida, para filtrar "minhas partidas" com um índice só. */
  userIds: string[];
  result: GameResult;
  termination: Termination;
  startFen?: string;
  pgn: string;
  timeControl?: TimeControl;
  /** Link da partida original (importadas do chess.com). */
  externalUrl?: string;
  startedAt: Date;
  finishedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  opening?: OpeningInfo;
  moves: MoveRecord[];
  analysisStatus: AnalysisStatus;
  analysisStartedAt?: Date;
  analysisAttempts?: number;
  analysisError?: string;
  analysis?: GameAnalysisSummary;
}

export interface PvLine {
  /** Lances em UCI, começando pelo lance candidato. */
  pv: string[];
  eval: Eval;
}

export interface PositionDoc {
  /** FEN normalizado (sem contadores de meio-lance e lance). */
  _id: string;
  depth: number;
  multiPv: PvLine[];
  engine: string;
  evaluatedAt: Date;
}

/** Corpo do POST /games: o servidor recalcula SAN, FENs e PGN a partir dos lances UCI. */
export interface CreateGameInput {
  type: Exclude<GameType, 'online' | 'chesscom'>;
  white: PlayerInfo;
  black: PlayerInfo;
  result: GameResult;
  termination: Termination;
  startFen?: string;
  moves: { uci: string; timeSpentMs?: number; clockMs?: number }[];
  timeControl?: TimeControl;
  startedAt: string;
  finishedAt: string;
}

/** Converte Date em string, como o objeto chega via JSON no front. */
export type Jsonified<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Jsonified<U>[]
    : T extends object
      ? { [K in keyof T]: Jsonified<T[K]> }
      : T;

export interface OnlineSeat {
  name: string;
  userId?: string;
  connected: boolean;
}

/** Estado de uma partida online como o servidor transmite (sem tokens). */
export interface OnlinePublicState {
  id: string;
  status: 'waiting' | 'playing' | 'over';
  startFen: string;
  fen: string;
  moves: { uci: string; san: string }[];
  white: OnlineSeat | null;
  black: OnlineSeat | null;
  timeControl: TimeControl;
  remaining: Record<Color, number>;
  /** Quanto do tempo do lado da vez já passou no instante do envio (o cliente desconta o resto localmente). */
  turnElapsedMs: number;
  /** O relógio só corre depois do primeiro lance de cada lado. */
  clockRunning: boolean;
  result: GameResult;
  termination: Termination;
  drawOffer?: Color;
  /** Criada com a chave de acesso: ao terminar é salva e vai para a análise. Sem chave, não. */
  analyzed: boolean;
  /** Enquanto ninguém aceitou o convite: quando ele expira (ms desde 1970). */
  expiresAt?: number;
}

/** Aviso de que a sala não existe mais: `saved` = a partida foi gravada (dá para abrir a análise). */
export interface OnlineGone {
  id: string;
  saved: boolean;
}

/** Problema importado do banco do Lichess (CC0), coleção `puzzles`. */
export interface PuzzleDoc {
  /** Id do Lichess (ex.: "00sHx"). */
  _id: string;
  /** Posição ANTES do lance do adversário. */
  fen: string;
  /** Lances em UCI: o 1º é do adversário; os seguintes alternam você / adversário. */
  moves: string[];
  rating: number;
  themes: string[];
  popularity: number;
  plays: number;
  gameUrl: string;
  openingTags?: string[];
}

/** Tentativa de um jogador num problema, coleção `puzzle_attempts`. */
export interface PuzzleAttemptDoc {
  _id?: unknown;
  userId: string;
  puzzleId: string;
  /** Acertou de primeira (sem nenhum lance errado). */
  win: boolean;
  puzzleRating: number;
  themes: string[];
  ratingBefore: number;
  ratingAfter: number;
  at: Date;
}

/** Rating de problemas do jogador, coleção `puzzle_ratings` (_id = userId). */
export interface PuzzleRatingDoc {
  _id: string;
  rating: number;
  /** Desvio (Glicko): começa alto e cai com o número de tentativas. */
  rd: number;
  attempts: number;
  wins: number;
  updatedAt: Date;
}
