import { Chess } from 'chess.js';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CLASSIFICATION_LABELS_PT, CLASSIFICATION_SYMBOLS, type Color, type PlayerInfo } from '@faelchess/shared';
import { Board, type BoardColor } from '../components/Board';
import { Clock } from '../components/Clock';
import { MoveList } from '../components/MoveList';
import { BrowserEngine, levelFor } from '../lib/engine';
import type { Profile } from '../lib/profile';
import { navigate, type Route } from '../lib/router';
import { TAG_PT, badgeSvg } from '../lib/labels';
import { saveGame } from '../lib/unsent';
import { useLocalGame, type LocalGameConfig } from '../lib/useLocalGame';
import { useTrainingReview } from '../lib/useTrainingReview';
import { parseTimeControl } from './HomePage';

const toBoard = (c: Color): BoardColor => (c === 'w' ? 'white' : 'black');

/** Preferência simples guardada no navegador (o storage pode estar bloqueado: aí só não lembra). */
function useStoredFlag(key: string, initial: boolean) {
  const [value, setValue] = useState(() => {
    try {
      const v = localStorage.getItem(key);
      return v === null ? initial : v === '1';
    } catch {
      return initial;
    }
  });
  const update = (v: boolean) => {
    setValue(v);
    try {
      localStorage.setItem(key, v ? '1' : '0');
    } catch {
      /* ok */
    }
  };
  return [value, update] as const;
}

export const TERMINATION_PT: Record<string, string> = {
  checkmate: 'xeque-mate',
  resign: 'desistência',
  timeout: 'tempo',
  stalemate: 'afogamento',
  insufficient: 'material insuficiente',
  threefold: 'repetição tripla',
  'fifty-moves': 'regra dos 50 lances',
  agreement: 'acordo',
  abandon: 'abandono',
  unterminated: 'não terminada',
};

export function resultText(result: string, termination: string, white: string, black: string) {
  const how = TERMINATION_PT[termination] ?? termination;
  if (result === '1-0') return `${white} venceu por ${how}`;
  if (result === '0-1') return `${black} venceu por ${how}`;
  if (result === '1/2-1/2') return `Empate por ${how}`;
  return 'Partida não terminada';
}

/** Monta a configuração da partida a partir da URL. */
function configFromRoute(route: Route, profile: Profile): { config: LocalGameConfig; botColor?: Color; me?: Color } {
  const me: PlayerInfo = { kind: 'user', userId: profile.userId, name: profile.name };
  const timeControl = parseTimeControl(route.query.get('tc'));
  if (route.path[1] === 'bot') {
    const level = levelFor(Number(route.query.get('elo') ?? 1200));
    const color: Color = route.query.get('color') === 'b' ? 'b' : 'w';
    const bot: PlayerInfo = { kind: 'bot', botElo: level.elo, name: `Stockfish ${level.elo}` };
    return {
      config: { type: 'bot', white: color === 'w' ? me : bot, black: color === 'w' ? bot : me, timeControl },
      botColor: color === 'w' ? 'b' : 'w',
      me: color,
    };
  }
  const side = route.query.get('me');
  const guest: PlayerInfo = { kind: 'user', name: route.query.get('guest') || 'Convidado' };
  const meSide: Color | undefined = side === 'w' || side === 'b' ? side : undefined;
  const white = meSide === 'w' ? me : meSide === 'b' ? guest : { kind: 'user' as const, name: 'Brancas' };
  const black = meSide === 'b' ? me : meSide === 'w' ? guest : { kind: 'user' as const, name: route.query.get('guest') || 'Pretas' };
  return { config: { type: 'local', white, black, timeControl }, me: meSide };
}

export function PlayPage({ route, profile }: { route: Route; profile: Profile }) {
  // A URL define a partida e é lida uma vez só: uma URL nova monta outro componente (key no App).
  const setup = useMemo(() => configFromRoute(route, profile), []);
  const { config, botColor, me } = setup;
  const game = useLocalGame(config);
  const isBot = config.type === 'bot';
  const level = useMemo(() => (isBot ? levelFor(Number(route.query.get('elo') ?? 1200)) : null), []);

  const [orientation, setOrientation] = useState<BoardColor>(toBoard(me ?? 'w'));
  const [autoFlip, setAutoFlip] = useState(config.type === 'local' && !me);
  const [thinking, setThinking] = useState(false);
  const [saved, setSaved] = useState<{ id?: string; queued?: boolean; error?: string } | null>(null);
  const engineRef = useRef<BrowserEngine | null>(null);

  // Modo treino: classifica cada lance na hora (só bot e local; o online nem tem essa opção).
  const [training, setTraining] = useStoredFlag('faelchess:training', false);
  const [onlyMine, setOnlyMine] = useStoredFlag('faelchess:trainingOnlyMine', true);
  const review = useTrainingReview(training, game.startFen, game.moves);
  const firstColor = useMemo(() => new Chess(game.startFen).turn(), [game.startFen]);
  const colorOfMove = (i: number): Color => (i % 2 === 0 ? firstColor : firstColor === 'w' ? 'b' : 'w');
  // Contra o bot, por padrão só mostra os seus lances (ver o "??" do bot entregaria a tática).
  const visible = (i: number) => training && (!isBot || !onlyMine || colorOfMove(i) === me);

  // Engine do bot: cria uma vez por partida.
  useEffect(() => {
    if (!isBot || !level) return;
    const engine = new BrowserEngine();
    engineRef.current = engine;
    void engine.newGame(level);
    return () => engine.destroy();
  }, [isBot, level]);

  // Vez do bot.
  useEffect(() => {
    if (!isBot || !level || game.status !== 'playing' || game.turn !== botColor) return;
    const engine = engineRef.current;
    if (!engine) return;
    let cancelled = false;
    setThinking(true);
    const started = performance.now();
    const clock = game.remaining(botColor!);
    // Com relógio, o bot gasta no máximo ~1/30 do tempo que tem.
    const maxMs = clock !== undefined ? Math.max(50, clock / 30) : undefined;
    engine
      .bestMove(game.startFen, game.moves.map((m) => m.uci), level, maxMs)
      .then(async (uci) => {
        // Uma pausa mínima para o lance não aparecer "instantâneo".
        const minDelay = clock !== undefined && clock < 10_000 ? 0 : 350 + Math.random() * 400;
        const wait = minDelay - (performance.now() - started);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        if (!cancelled) game.makeMove(uci);
      })
      .finally(() => !cancelled && setThinking(false));
    return () => {
      cancelled = true;
      engine.stop();
    };
    // Só reage à troca de vez/lances (game.remaining muda a cada 100 ms e reiniciaria o engine).
  }, [game.turn, game.moves.length, game.status]);

  // PvP local sem "dono": vira o tabuleiro a cada lance.
  useEffect(() => {
    if (autoFlip) setOrientation(toBoard(game.turn));
  }, [autoFlip, game.turn]);

  // Fim de jogo: salva (ou guarda para reenviar).
  useEffect(() => {
    if (game.status !== 'over' || saved) return;
    setSaved({});
    saveGame(game.toCreateInput())
      .then((r) => setSaved(r))
      .catch((e) => setSaved({ error: (e as Error).message }));
  }, [game.status]);

  const movable =
    game.status !== 'playing' ? undefined : isBot ? toBoard(me!) : 'both';
  const top: Color = orientation === 'white' ? 'b' : 'w';
  const bottom: Color = top === 'w' ? 'b' : 'w';
  const nameOf = (c: Color) => (c === 'w' ? config.white.name : config.black.name);
  const myColor: Color | undefined = isBot ? me : undefined;

  const moveItems = game.moves.map((m, i) => ({
    san: m.san,
    classification: visible(i) ? review.results[i]?.classification : undefined,
  }));
  let lastVisible = -1;
  for (let i = game.moves.length - 1; i >= 0; i--) {
    if (visible(i)) {
      lastVisible = i;
      break;
    }
  }
  const feedback = lastVisible >= 0 ? review.results[lastVisible] : undefined;
  const feedbackMove = lastVisible >= 0 ? game.moves[lastVisible] : undefined;

  // Selo na peça que acabou de jogar, enquanto ela ainda estiver naquela casa.
  const shapes = useMemo<DrawShape[]>(() => {
    if (!feedback || !feedbackMove) return [];
    const to = feedbackMove.uci.slice(2, 4);
    const piece = new Chess(game.fen).get(to as never);
    if (!piece || piece.color !== colorOfMove(lastVisible)) return [];
    return [{ orig: to as Key, customSvg: { html: badgeSvg(feedback.classification) } }];
    // colorOfMove só depende de firstColor, que é fixo na partida.
  }, [feedback, feedbackMove, game.fen, lastVisible]);

  return (
    <div className="play">
      <div className="board-col">
        <Clock name={nameOf(top) + (thinking && top === botColor ? ' · pensando…' : '')} ms={game.remaining(top)} active={game.status === 'playing' && game.turn === top} />
        <Board
          fen={game.fen}
          orientation={orientation}
          movable={movable}
          lastMove={game.lastMove}
          check={game.inCheck}
          shapes={shapes}
          onMove={(uci) => game.makeMove(uci)}
        />
        <Clock name={nameOf(bottom)} ms={game.remaining(bottom)} active={game.status === 'playing' && game.turn === bottom} />
      </div>

      <aside className="side">
        <div className="card">
          <div className="muted small">
            {isBot ? `Contra Stockfish ${level?.elo}` : 'Partida local'}
            {config.timeControl
              ? ` · ${config.timeControl.baseMs / 60000}+${config.timeControl.incrementMs / 1000}`
              : ' · sem relógio'}
          </div>
          <MoveList moves={moveItems} current={game.moves.length - 1} />
          <div className="training-toggle">
            <label className="inline small">
              <input type="checkbox" checked={training} onChange={(e) => setTraining(e.target.checked)} /> Modo treino
            </label>
            {training && isBot && (
              <label className="inline small">
                <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} /> só os meus lances
              </label>
            )}
          </div>
          <div className="actions">
            <button onClick={() => { setAutoFlip(false); setOrientation((o) => (o === 'white' ? 'black' : 'white')); }}>
              Virar
            </button>
            {game.status === 'playing' && (
              <>
                {isBot ? (
                  <button className="danger" onClick={() => confirm('Desistir da partida?') && game.resign(myColor!)}>
                    Desistir
                  </button>
                ) : (
                  <>
                    <button onClick={() => confirm('Os dois concordam com o empate?') && game.agreeDraw()}>Empate</button>
                    <button className="danger" onClick={() => confirm(`${nameOf(game.turn)} desiste?`) && game.resign(game.turn)}>
                      Desistir ({nameOf(game.turn)})
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {training && feedbackMove && (
          <div className="card move-detail">
            {feedback ? (
              <>
                <div className="move-headline">
                  <span className={`badge cls-bg-${feedback.classification}`}>
                    {CLASSIFICATION_SYMBOLS[feedback.classification] || (feedback.classification === 'excellent' ? '✓' : '•')}
                  </span>
                  <strong>
                    {Math.ceil((lastVisible + 1) / 2)}
                    {colorOfMove(lastVisible) === 'w' ? '.' : '...'} {feedbackMove.san}
                  </strong>{' '}
                  é {CLASSIFICATION_LABELS_PT[feedback.classification].toLowerCase()}
                </div>
                {!['best', 'great', 'brilliant'].includes(feedback.classification) && (
                  <div>
                    Melhor era <strong>{feedback.bestMoveSan}</strong>
                    <span className="muted small"> · perdeu {feedback.winPctLoss}% de chance de vitória</span>
                  </div>
                )}
                {feedback.tags.filter((t) => t !== 'check').length > 0 && (
                  <div className="tags">
                    {feedback.tags
                      .filter((t) => t !== 'check')
                      .map((t) => (
                        <span key={t} className="tag">
                          {TAG_PT[t] ?? t}
                        </span>
                      ))}
                  </div>
                )}
              </>
            ) : (
              <div className="muted small">Avaliando {feedbackMove.san}…</div>
            )}
          </div>
        )}

        {game.status === 'over' && (
          <div className="card result-card">
            <h3>{resultText(game.result, game.termination, config.white.name, config.black.name)}</h3>
            {!saved || (!saved.id && !saved.queued && !saved.error) ? (
              <p className="muted">Salvando…</p>
            ) : saved.error ? (
              <p className="error">Não foi possível salvar: {saved.error}</p>
            ) : saved.queued ? (
              <p className="muted">Servidor indisponível: a partida ficou guardada no navegador e será enviada depois.</p>
            ) : (
              <p className="muted">Partida salva e na fila de análise.</p>
            )}
            <div className="actions">
              {saved?.id && (
                <button className="primary" onClick={() => navigate(`/game/${saved.id}`)}>
                  Ver análise
                </button>
              )}
              <button onClick={() => navigate('/')}>Nova partida</button>
              {isBot && (
                <button onClick={() => navigate(`/play/bot?elo=${level?.elo}&color=${me === 'w' ? 'b' : 'w'}&tc=${route.query.get('tc') ?? 'none'}&r=${Date.now()}`)}>
                  Revanche
                </button>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
