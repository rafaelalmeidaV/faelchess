import { Chess } from 'chess.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { START_FEN, parseUci, type Color, type OnlinePublicState } from '@faelchess/shared';
import { Check, Copy, Eye, Flag, Handshake, Swords } from 'lucide-react';
import { Box, Divider, Flex, HStack, Stack } from 'styled-system/jsx';
import { Board, type BoardColor } from '../components/Board';
import { Clock } from '../components/Clock';
import { GameLayout } from '../components/GameLayout';
import { Muted, Panel } from '../components/kit';
import { MoveList } from '../components/MoveList';
import { MoveNav } from '../components/MoveNav';
import { Alert, Badge, Button, Clipboard, Heading, Input, Spinner, Text, toaster } from '../components/ui';
import { fetchOnlineState, getSocket, joinOnlineGame } from '../lib/online';
import { getOnlineToken, type Profile } from '../lib/profile';
import { capturedFor, materialFromFen } from '../lib/material';
import { useMoveBrowser } from '../lib/useMoveBrowser';
import { useMoveSound } from '../lib/useMoveSound';
import { navigate } from '../lib/router';
import { resultText, tcLabel } from './PlayPage';

const toBoard = (c: Color): BoardColor => (c === 'w' ? 'white' : 'black');
const NO_MOVES: { uci: string; san: string }[] = [];

/** PGN da partida (para quem jogou sem chave poder analisar em outro lugar). */
function pgnOf(state: OnlinePublicState) {
  const chess = new Chess(state.startFen);
  chess.setHeader('Event', 'faelchess online');
  chess.setHeader('White', state.white?.name ?? '?');
  chess.setHeader('Black', state.black?.name ?? '?');
  chess.setHeader('Result', state.result);
  for (const m of state.moves) chess.move(parseUci(m.uci));
  return chess.pgn();
}

export function OnlinePage({ gameId, profile }: { gameId: string; profile: Profile }) {
  const [state, setState] = useState<OnlinePublicState | null>(null);
  const [myColor, setMyColor] = useState<Color | null>(null);
  const [gone, setGone] = useState(false);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [tick, setTick] = useState(0);
  const receivedAt = useRef(performance.now());
  const [token, setToken] = useState(() => getOnlineToken(gameId));
  /** Lance otimista: aparece na hora e some se o servidor rejeitar. */
  const [pending, setPending] = useState<{ fen: string; uci: string } | null>(null);

  // Conecta, entra na sala e escuta o estado.
  useEffect(() => {
    const socket = getSocket();
    const onState = (s: OnlinePublicState) => {
      if (s.id !== gameId) return;
      receivedAt.current = performance.now();
      setPending(null);
      setState(s);
    };
    const onJoined = ({ color }: { color: Color | null }) => setMyColor(color);
    const onGone = (id: string) => id === gameId && setGone(true);
    const onError = (msg: string) => setError(msg);
    const join = () => socket.emit('game:join', { gameId, token: token ?? undefined });

    socket.on('game:state', onState);
    socket.on('game:joined', onJoined);
    socket.on('game:gone', onGone);
    socket.on('move:rejected', onError);
    socket.on('game:error', onError);
    // Reconexão: entra de novo na sala com o mesmo token.
    socket.on('connect', join);
    if (socket.connected) join();
    return () => {
      socket.off('game:state', onState);
      socket.off('game:joined', onJoined);
      socket.off('game:gone', onGone);
      socket.off('move:rejected', onError);
      socket.off('game:error', onError);
      socket.off('connect', join);
    };
  }, [gameId, token]);

  // Partida que já saiu da memória do servidor: se foi salva, vai para a análise.
  useEffect(() => {
    if (!gone) return;
    // Sem análise (sala criada sem chave) não existe página de análise para abrir.
    if (state && !state.analyzed) return;
    fetchOnlineState(gameId).then((s) => {
      if (!s) navigate(`/game/${gameId}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gone, gameId]);

  // Relógio local: re-render a cada 100 ms enquanto corre.
  useEffect(() => {
    if (!state?.clockRunning || state.status !== 'playing') return;
    const id = setInterval(() => setTick((t) => t + 1), 100);
    return () => clearInterval(id);
  }, [state?.clockRunning, state?.status]);

  const remaining = useCallback(
    (c: Color) => {
      if (!state) return undefined;
      const base = state.remaining[c];
      const turn = new Chess(state.fen).turn();
      if (!state.clockRunning || state.status !== 'playing' || c !== turn) return base;
      return Math.max(0, base - state.turnElapsedMs - (performance.now() - receivedAt.current));
    },
    // `tick` força o recálculo a cada 100 ms enquanto o relógio corre.
    [state, tick],
  );

  // Rever lances anteriores sem sair da partida (← → ou clicando na lista).
  const browser = useMoveBrowser(state?.startFen ?? START_FEN, state?.moves ?? NO_MOVES);
  useMoveSound(state?.moves ?? NO_MOVES, browser.index, state?.status === 'over');

  const emit = (event: string, extra: object = {}) => getSocket().emit(event, { gameId, token, ...extra });

  const onMove = (uci: string) => {
    if (!state) return;
    const chess = new Chess(state.fen);
    try {
      chess.move(parseUci(uci));
    } catch {
      return;
    }
    setError('');
    setPending({ fen: chess.fen(), uci });
    emit('move:make', { uci });
  };

  const join = async () => {
    setJoining(true);
    try {
      const res = await joinOnlineGame(gameId, profile);
      setToken(res.token); // reconecta à sala já como jogador
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setJoining(false);
    }
  };

  if (gone && state && !state.analyzed)
    return (
      <Stack gap="3" maxW="md">
        <Muted>Esta partida já terminou e não ficou salva (foi criada sem a chave de acesso).</Muted>
        <Box>
          <Button variant="surface" onClick={() => navigate('/')}>
            Início
          </Button>
        </Box>
      </Stack>
    );
  if (gone || !state)
    return (
      <HStack gap="2" color="fg.muted">
        <Spinner size="sm" /> {gone ? 'Partida encerrada. Abrindo a análise…' : 'Conectando…'}
      </HStack>
    );

  const fen = pending?.fen ?? state.fen;
  const turn = new Chess(fen).turn();
  const orientation = toBoard(myColor ?? 'w');
  const top: Color = orientation === 'white' ? 'b' : 'w';
  const bottom: Color = top === 'w' ? 'b' : 'w';
  const seat = (c: Color) => (c === 'w' ? state.white : state.black);
  const seatName = (c: Color) => seat(c)?.name ?? 'aguardando…';
  const seatSub = (c: Color) => {
    const s = seat(c);
    if (!s) return 'lugar livre';
    const who = c === myColor ? 'Você' : 'Adversário';
    return `${who} · ${c === 'w' ? 'brancas' : 'pretas'}${s.connected ? '' : ' · desconectado'}`;
  };
  const lastUci = pending?.uci ?? state.moves.at(-1)?.uci;
  const link = `${window.location.origin}/#/online/${gameId}`;
  const canPlay = state.status === 'playing' && myColor !== null && !pending;
  const freeSeat = state.status === 'waiting' && !myColor;
  const tc = tcLabel(state.timeControl);

  // Material da posição na tela (ao rever um lance, mostra o placar daquele momento).
  const material = materialFromFen(browser.live ? fen : browser.viewFen);

  const board = (
    <>
      <Clock name={seatName(top)} sub={seatSub(top)} captured={capturedFor(material, top)} ms={remaining(top)} active={state.status === 'playing' && turn === top} />
      <Board
        fen={browser.live ? fen : browser.viewFen}
        orientation={orientation}
        movable={canPlay && browser.live ? toBoard(myColor!) : undefined}
        lastMove={browser.live ? (lastUci ? [lastUci.slice(0, 2), lastUci.slice(2, 4)] : undefined) : browser.viewLastMove}
        check={browser.live ? new Chess(fen).inCheck() : browser.viewCheck}
        onMove={onMove}
      />
      <Clock name={seatName(bottom)} sub={seatSub(bottom)} captured={capturedFor(material, bottom)} ms={remaining(bottom)} active={state.status === 'playing' && turn === bottom} />
    </>
  );

  const side = (
    <>
      {state.status === 'waiting' && myColor && (
        <Panel gap="4" borderColor="jade.7">
          <HStack gap="3">
            <Spinner size="sm" colorPalette="jade" />
            <Stack gap="0">
              <Heading as="h3" textStyle="md">
                Aguardando o adversário
              </Heading>
              <Muted>Mande este link. A partida começa quando ele entrar.</Muted>
            </Stack>
          </HStack>
          <Clipboard.Root value={link}>
            <Clipboard.Control>
              <Clipboard.Input asChild>
                <Input size="sm" readOnly onFocus={(e) => e.target.select()} />
              </Clipboard.Input>
              <Clipboard.Trigger asChild>
                <Button colorPalette="jade" size="sm">
                  <Clipboard.Indicator copied={<Check />}>
                    <Copy />
                  </Clipboard.Indicator>
                  <Clipboard.CopyText>Copiar</Clipboard.CopyText>
                </Button>
              </Clipboard.Trigger>
            </Clipboard.Control>
          </Clipboard.Root>
        </Panel>
      )}

      {freeSeat && (
        <Panel gap="3" borderColor="jade.7">
          <Heading as="h3" textStyle="lg">
            {(state.white ?? state.black)?.name} te convidou
          </Heading>
          <Muted>
            {tc} · você joga como {profile.name}
          </Muted>
          <Button colorPalette="jade" size="lg" onClick={join} loading={joining} loadingText="Entrando…">
            <Swords /> Aceitar e jogar
          </Button>
        </Panel>
      )}

      {state.status === 'over' && (
        <Panel gap="3" borderColor="jade.7">
          <Heading as="h3" textStyle="lg">
            {resultText(state.result, state.termination, state.white?.name ?? '?', state.black?.name ?? '?')}
          </Heading>
          <Muted>
            {state.analyzed
              ? 'Partida salva e na fila de análise.'
              : 'Esta sala foi criada sem a chave de acesso, então a partida não é salva nem analisada. Copie o PGN para analisar onde quiser.'}
          </Muted>
          <Flex gap="2" flexWrap="wrap">
            {state.analyzed ? (
              <Button colorPalette="jade" onClick={() => navigate(`/game/${gameId}`)}>
                Ver análise
              </Button>
            ) : (
              <Button
                colorPalette="jade"
                onClick={() => {
                  void navigator.clipboard.writeText(pgnOf(state));
                  toaster.create({ title: 'PGN copiado', type: 'success' });
                }}
              >
                <Copy /> Copiar PGN
              </Button>
            )}
            <Button variant="surface" onClick={() => navigate('/')}>
              Início
            </Button>
          </Flex>
        </Panel>
      )}

      <Panel p="0" gap="0">
        <HStack justify="space-between" px="4" py="3" gap="3">
          <Stack gap="0">
            <Heading as="h3" textStyle="md">
              Partida online
            </Heading>
            <Text textStyle="xs" color="fg.muted">
              {tc}
            </Text>
          </Stack>
          {!myColor && state.status !== 'waiting' && (
            <Badge size="lg" borderRadius="full">
              <Eye /> Assistindo
            </Badge>
          )}
        </HStack>
        <Divider />
        <MoveNav browser={browser} />
        <MoveList moves={state.moves} current={browser.index} onSelect={browser.go} maxH={{ base: '40', lg: '72' }} />
      </Panel>

      {error && (
        <Alert.Root colorPalette="red" variant="subtle">
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
      )}

      {state.status === 'playing' && myColor && (
        <>
          {state.drawOffer && state.drawOffer !== myColor && (
            <Panel flexDirection="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" py="3" gap="3">
              <HStack gap="2">
                <Handshake size={18} /> <Text fontWeight="semibold">Adversário oferece empate</Text>
              </HStack>
              <Flex gap="2">
                <Button size="sm" colorPalette="jade" onClick={() => emit('draw:answer', { accept: true })}>
                  Aceitar
                </Button>
                <Button size="sm" variant="surface" onClick={() => emit('draw:answer', { accept: false })}>
                  Recusar
                </Button>
              </Flex>
            </Panel>
          )}
          <Flex justify="space-between" gap="2" flexWrap="wrap">
            <Button variant="surface" size="sm" disabled={state.drawOffer === myColor} onClick={() => emit('draw:offer')}>
              <Handshake /> {state.drawOffer === myColor ? 'Empate oferecido' : 'Oferecer empate'}
            </Button>
            <Button variant="surface" colorPalette="red" size="sm" onClick={() => confirm('Desistir da partida?') && emit('game:resign')}>
              <Flag /> Desistir
            </Button>
          </Flex>
        </>
      )}
    </>
  );

  return <GameLayout board={board} side={side} />;
}
