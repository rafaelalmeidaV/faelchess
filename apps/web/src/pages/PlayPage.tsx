import { Chess } from 'chess.js';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { Bot, Flag, GraduationCap, Handshake, Repeat2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type Color, type PlayerInfo } from '@faelchess/shared';
import { Divider, Flex, HStack, Stack } from 'styled-system/jsx';
import { Board, type BoardColor } from '../components/Board';
import { Clock } from '../components/Clock';
import { GameLayout } from '../components/GameLayout';
import { Muted, Panel, ToggleSwitch } from '../components/kit';
import { MoveFeedback, San } from '../components/MoveFeedback';
import { MoveList } from '../components/MoveList';
import { MoveNav } from '../components/MoveNav';
import { Badge, Button, Checkbox, Heading, Text } from '../components/ui';
import { BrowserEngine, levelFor } from '../lib/engine';
import type { Profile } from '../lib/profile';
import { navigate, type Route } from '../lib/router';
import { TAG_PT, badgeSvg } from '../lib/labels';
import { TRAINING_KEY, TRAINING_ONLY_MINE_KEY, useStoredFlag } from '../lib/storedFlag';
import { capturedFor, materialFromFen } from '../lib/material';
import { saveGame } from '../lib/unsent';
import { useLocalGame, type LocalGameConfig } from '../lib/useLocalGame';
import { useMoveBrowser } from '../lib/useMoveBrowser';
import { useMoveSound } from '../lib/useMoveSound';
import { useTrainingReview } from '../lib/useTrainingReview';
import { TIME_CONTROLS, parseTimeControl } from './HomePage';

const toBoard = (c: Color): BoardColor => (c === 'w' ? 'white' : 'black');
const NO_SHAPES: DrawShape[] = [];

/** "10+5 · rápida" a partir do controle de tempo em ms. */
export function tcLabel(tc?: { baseMs: number; incrementMs: number }) {
  if (!tc) return 'Sem relógio';
  const id = `${tc.baseMs / 1000}+${tc.incrementMs / 1000}`;
  const known = TIME_CONTROLS.find((t) => t.id === id);
  return known?.label ?? `${tc.baseMs / 60000}+${tc.incrementMs / 1000}`;
}

/** Caixa de seleção pequena (Park UI). */
function SmallCheck({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <Checkbox.Root size="sm" colorPalette="jade" checked={checked} onCheckedChange={(d) => onChange(d.checked === true)}>
      <Checkbox.HiddenInput />
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
      <Checkbox.Label textStyle="sm">{children}</Checkbox.Label>
    </Checkbox.Root>
  );
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
  const [training, setTraining] = useStoredFlag(TRAINING_KEY, false);
  const [onlyMine, setOnlyMine] = useStoredFlag(TRAINING_ONLY_MINE_KEY, true);
  const review = useTrainingReview(training, game.startFen, game.moves);
  // Rever lances anteriores sem sair da partida (← → ou clicando na lista).
  const browser = useMoveBrowser(game.startFen, game.moves);
  useMoveSound(game.moves, browser.index, game.status === 'over');
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

  const subOf = (c: Color) => {
    if (isBot && c === botColor) return thinking ? 'pensando…' : `Bot · ${level?.label}`;
    if (c === me) return `Você · ${c === 'w' ? 'brancas' : 'pretas'}`;
    return c === 'w' ? 'Brancas' : 'Pretas';
  };
  const visibleTags = feedback?.tags.filter((t) => t !== 'check') ?? [];
  const over = game.status === 'over';
  const savedOk = saved?.id || saved?.queued || saved?.error;

  // Material da posição na tela (ao rever um lance, mostra o placar daquele momento).
  const material = materialFromFen(browser.live ? game.fen : browser.viewFen);

  const board = (
    <>
      <Clock
        name={nameOf(top)}
        sub={subOf(top)}
        captured={capturedFor(material, top)}
        avatar={isBot && top === botColor ? <Bot /> : undefined}
        ms={game.remaining(top)}
        active={game.status === 'playing' && game.turn === top}
      />
      <Board
        fen={browser.live ? game.fen : browser.viewFen}
        orientation={orientation}
        movable={browser.live ? movable : undefined}
        lastMove={browser.live ? game.lastMove : browser.viewLastMove}
        check={browser.live ? game.inCheck : browser.viewCheck}
        shapes={browser.live ? shapes : NO_SHAPES}
        onMove={(uci) => game.makeMove(uci)}
      />
      <Clock
        name={nameOf(bottom)}
        sub={subOf(bottom)}
        captured={capturedFor(material, bottom)}
        avatar={isBot && bottom === botColor ? <Bot /> : undefined}
        ms={game.remaining(bottom)}
        active={game.status === 'playing' && game.turn === bottom}
      />
    </>
  );

  const side = (
    <>
      {over && (
        <Panel borderColor="jade.7" gap="3">
          <Heading as="h3" textStyle="lg">
            {resultText(game.result, game.termination, config.white.name, config.black.name)}
          </Heading>
          {!savedOk ? (
            <Muted>Salvando…</Muted>
          ) : saved?.error ? (
            <Text textStyle="sm" color="error">
              Não foi possível salvar: {saved.error}
            </Text>
          ) : saved?.queued ? (
            <Muted>Servidor indisponível: a partida ficou guardada no navegador e será enviada depois.</Muted>
          ) : (
            <Muted>Partida salva e na fila de análise.</Muted>
          )}
          <Flex gap="2" flexWrap="wrap">
            {saved?.id && (
              <Button colorPalette="jade" onClick={() => navigate(`/game/${saved.id}`)}>
                Ver análise
              </Button>
            )}
            <Button variant="surface" onClick={() => navigate('/')}>
              Nova partida
            </Button>
            {isBot && (
              <Button
                variant="surface"
                onClick={() =>
                  navigate(`/play/bot?elo=${level?.elo}&color=${me === 'w' ? 'b' : 'w'}&tc=${route.query.get('tc') ?? 'none'}&r=${Date.now()}`)
                }
              >
                <Repeat2 /> Revanche
              </Button>
            )}
          </Flex>
        </Panel>
      )}

      <Panel p="0" gap="0">
        <HStack justify="space-between" px="4" py="3" gap="3">
          <Stack gap="0" minW="0">
            <Heading as="h3" textStyle="md" truncate>
              {isBot ? `Contra Stockfish ${level?.elo}` : 'Partida local'}
            </Heading>
            <Text textStyle="xs" color="fg.muted">
              {tcLabel(config.timeControl)}
            </Text>
          </Stack>
          {training && (
            <Badge colorPalette="jade" size="lg" borderRadius="full" flexShrink="0">
              <GraduationCap /> Modo treino
            </Badge>
          )}
        </HStack>
        <Divider />
        <MoveNav browser={browser} />
        <MoveList moves={moveItems} current={browser.index} onSelect={browser.go} maxH={{ base: '40', lg: '72' }} />
      </Panel>

      {training && feedbackMove && (
        feedback ? (
          <MoveFeedback
            cls={feedback.classification}
            title={`${Math.ceil((lastVisible + 1) / 2)}${colorOfMove(lastVisible) === 'w' ? '.' : '...'} ${feedbackMove.san}`}
            best={
              <>
                Melhor era <San>{feedback.bestMoveSan}</San> · perdeu {feedback.winPctLoss}% de chance de vitória
              </>
            }
            tags={visibleTags.map((t) => TAG_PT[t] ?? t)}
          />
        ) : (
          <Panel py="3">
            <Muted>Avaliando {feedbackMove.san}…</Muted>
          </Panel>
        )
      )}

      <Flex justify="space-between" gap="2" flexWrap="wrap">
        <Flex gap="2">
          <Button
            variant="surface"
            size="sm"
            onClick={() => {
              setAutoFlip(false);
              setOrientation((o) => (o === 'white' ? 'black' : 'white'));
            }}
          >
            <Repeat2 /> Virar
          </Button>
          {game.status === 'playing' && !isBot && (
            <Button variant="surface" size="sm" onClick={() => confirm('Os dois concordam com o empate?') && game.agreeDraw()}>
              <Handshake /> Empate
            </Button>
          )}
        </Flex>
        {game.status === 'playing' && (
          <Button
            variant="surface"
            colorPalette="red"
            size="sm"
            onClick={() =>
              isBot
                ? confirm('Desistir da partida?') && game.resign(myColor!)
                : confirm(`${nameOf(game.turn)} desiste?`) && game.resign(game.turn)
            }
          >
            <Flag /> Desistir{!isBot && ` (${nameOf(game.turn)})`}
          </Button>
        )}
      </Flex>

      <Panel flexDirection="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" py="3" gap="3">
        <ToggleSwitch
          checked={training}
          onChange={setTraining}
          label="Modo treino"
          hint={isBot && onlyMine ? 'Só os seus lances são classificados' : 'Classifica cada lance na hora'}
        />
        {training && isBot && (
          <SmallCheck checked={onlyMine} onChange={setOnlyMine}>
            Só os meus
          </SmallCheck>
        )}
      </Panel>
    </>
  );

  return <GameLayout board={board} side={side} />;
}
