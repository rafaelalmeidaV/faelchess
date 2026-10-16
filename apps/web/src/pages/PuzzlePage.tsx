import { parseUci } from '@faelchess/shared';
import { Chess } from 'chess.js';
import { ArrowRight, Check, ExternalLink, Lightbulb, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Flex, HStack, Stack, Wrap } from 'styled-system/jsx';
import { Board, type BoardColor } from '../components/Board';
import { Clock } from '../components/Clock';
import { GameLayout } from '../components/GameLayout';
import { ChoiceGroup, Muted, Panel } from '../components/kit';
import { Alert, Badge, Button, Heading, Link, Spinner, Text } from '../components/ui';
import { api, type Puzzle, type PuzzleStats } from '../lib/api';
import { localQuery, localStats, recordLocal } from '../lib/localPuzzles';
import { capturedFor, materialFromFen } from '../lib/material';
import { getAccessKey, type Profile } from '../lib/profile';
import { THEME_FILTERS, themeName } from '../lib/puzzleThemes';
import type { Route } from '../lib/router';
import { useMoveSound } from '../lib/useMoveSound';

const THEME_KEY = 'faelchess:puzzleTheme';
/** Espera antes do lance do adversário (para dar tempo de ver a posição). */
const OPPONENT_DELAY = 600;

type Outcome = 'solved' | 'revealed' | null;

function readTheme() {
  try {
    return localStorage.getItem(THEME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function PuzzlePage({ profile, route }: { profile: Profile; route: Route }) {
  const [theme, setTheme] = useState(readTheme);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  /** Quantos lances da linha já estão no tabuleiro (o 1º é do adversário). */
  const [step, setStep] = useState(0);
  /** Errou ao menos uma vez (a tentativa já foi registrada como erro). */
  const [failed, setFailed] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [wrong, setWrong] = useState(false);
  /** Mate alternativo aceito no último lance: posição final diferente da linha do Lichess. */
  const [altEnd, setAltEnd] = useState<{ fen: string; uci: string } | null>(null);
  const [result, setResult] = useState<{ rating: number; delta: number; counted: boolean } | null>(null);
  const [stats, setStats] = useState<PuzzleStats | null>(null);
  const [syncKey, setSyncKey] = useState(0);
  const [error, setError] = useState('');
  const timers = useRef<number[]>([]);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  // Sem a chave, rating e histórico ficam só neste navegador (o servidor não grava nada).
  const guest = !getAccessKey();

  const refreshStats = useCallback(() => {
    if (guest) setStats(localStats());
    else api.puzzleStats(profile.userId).then(setStats).catch(() => {});
  }, [guest, profile.userId]);

  const start = useCallback((p: Puzzle) => {
    clearTimers();
    setPuzzle(p);
    setStep(0);
    setFailed(false);
    setOutcome(null);
    setWrong(false);
    setAltEnd(null);
    setResult(null);
    later(() => setStep(1), OPPONENT_DELAY);
  }, []);

  const loadNext = useCallback(
    (t = theme) => {
      setError('');
      setPuzzle(null);
      api
        .nextPuzzle(guest ? { ...localQuery(), theme: t || undefined } : { userId: profile.userId, theme: t || undefined })
        .then(start)
        .catch((e) => setError((e as Error).message));
    },
    [guest, profile.userId, start, theme],
  );

  // Primeiro problema: o do link (#/puzzles/<id>) ou o próximo do sorteio.
  useEffect(() => {
    const id = route.path[1];
    if (id) api.getPuzzle(id).then(start).catch((e) => setError((e as Error).message));
    else loadNext();
    refreshStats();
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Posições e SAN de cada lance da solução. */
  const line = useMemo(() => {
    if (!puzzle) return null;
    const chess = new Chess(puzzle.fen);
    const fens = [puzzle.fen];
    const sans: string[] = [];
    for (const uci of puzzle.moves) {
      sans.push(chess.move(parseUci(uci)).san);
      fens.push(chess.fen());
    }
    return { fens, sans };
  }, [puzzle]);

  // Quem resolve é o lado que joga DEPOIS do lance do adversário.
  const userColor = puzzle ? (new Chess(puzzle.fen).turn() === 'w' ? 'b' : 'w') : 'w';
  const orientation: BoardColor = userColor === 'w' ? 'white' : 'black';
  const total = puzzle?.moves.length ?? 0;
  const userTurn = !!puzzle && !outcome && step % 2 === 1 && step < total;

  const record = (win: boolean) => {
    if (!puzzle) return;
    if (guest) {
      setResult(recordLocal(puzzle, win));
      refreshStats();
      return;
    }
    api
      .puzzleAttempt(puzzle._id, profile.userId, win)
      .then((r) => {
        setResult(r);
        refreshStats();
      })
      .catch((e) => setError((e as Error).message));
  };

  const onMove = (uci: string) => {
    if (!puzzle || !line || !userTurn) return;
    const chess = new Chess(line.fens[step]);
    try {
      chess.move(parseUci(uci));
    } catch {
      setSyncKey((k) => k + 1);
      return;
    }
    const expected = puzzle.moves[step];
    // Como no Lichess: qualquer mate vale, mesmo que não seja o lance da linha.
    const mate = chess.isCheckmate();
    if (uci !== expected && !mate) {
      setWrong(true);
      setSyncKey((k) => k + 1);
      if (!failed) {
        setFailed(true);
        record(false);
      }
      return;
    }
    setWrong(false);
    const next = step + 1;
    if (uci !== expected) setAltEnd({ fen: chess.fen(), uci });
    setStep(next);
    if (next >= total || mate) {
      setOutcome('solved');
      if (!failed) record(true);
      return;
    }
    later(() => setStep(next + 1), OPPONENT_DELAY / 2);
  };

  const reveal = () => {
    if (!puzzle || outcome) return;
    clearTimers();
    if (!failed) {
      setFailed(true);
      record(false);
    }
    setWrong(false);
    setOutcome('revealed');
    for (let s = step + 1, i = 0; s <= total; s++, i++) {
      const target = s;
      later(() => setStep(target), 600 * (i + 1));
    }
  };

  const playedSans = useMemo(() => (line ? line.sans.slice(0, step).map((san) => ({ san })) : []), [line, step]);
  useMoveSound(playedSans, step - 1, outcome === 'solved' && !failed);

  const chooseTheme = (t: string) => {
    setTheme(t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* ok */
    }
    loadNext(t);
  };

  if (error && !puzzle)
    return (
      <Stack gap="4" maxW="lg">
        <Alert.Root colorPalette="red" variant="subtle">
          <Alert.Content>
            <Alert.Description>{error}</Alert.Description>
          </Alert.Content>
        </Alert.Root>
        <Box>
          <Button variant="surface" onClick={() => (theme ? chooseTheme('') : loadNext())}>
            {theme ? 'Tirar o filtro de tema' : 'Tentar de novo'}
          </Button>
        </Box>
      </Stack>
    );

  if (!puzzle || !line)
    return (
      <HStack gap="2" color="fg.muted">
        <Spinner size="sm" /> Carregando problema…
      </HStack>
    );

  const fen = altEnd && outcome === 'solved' ? altEnd.fen : line.fens[Math.min(step, total)];
  const lastUci = altEnd && outcome === 'solved' ? altEnd.uci : step > 0 ? puzzle.moves[step - 1] : undefined;
  const material = materialFromFen(fen);
  const opponent = userColor === 'w' ? 'b' : 'w';
  const sideName = userColor === 'w' ? 'brancas' : 'pretas';
  const winRate = stats && stats.attempts ? Math.round((stats.wins / stats.attempts) * 100) : null;
  const weak = (stats?.themes ?? [])
    .filter((t) => t.attempts >= 5 && THEME_FILTERS.includes(t.theme))
    .map((t) => ({ ...t, rate: t.wins / t.attempts }))
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 3);

  const board = (
    <>
      <Clock name="Adversário" sub={opponent === 'w' ? 'Brancas' : 'Pretas'} active={!userTurn && !outcome} captured={capturedFor(material, opponent)} />
      <Board
        fen={fen}
        orientation={orientation}
        movable={userTurn ? orientation : undefined}
        lastMove={lastUci ? [lastUci.slice(0, 2), lastUci.slice(2, 4)] : undefined}
        check={new Chess(fen).inCheck()}
        onMove={onMove}
        syncKey={syncKey}
      />
      <Clock name={profile.name} sub={`Você · ${sideName}`} active={userTurn} captured={capturedFor(material, userColor)} />
    </>
  );

  const side = (
    <>
      <Panel flexDirection="row" alignItems="center" justifyContent="space-between" gap="3">
        <Stack gap="0">
          <Muted>{guest ? 'Seu rating (salvo neste navegador)' : 'Seu rating de problemas'}</Muted>
          <HStack gap="2" alignItems="baseline">
            <Text textStyle="3xl" fontWeight="bold" lineHeight="1.1">
              {result?.rating ?? stats?.rating ?? '–'}
            </Text>
            {result && result.counted && (
              <Badge colorPalette={result.delta >= 0 ? 'jade' : 'red'} size="lg" fontWeight="bold">
                {result.delta >= 0 ? `+${result.delta}` : result.delta}
              </Badge>
            )}
          </HStack>
        </Stack>
        {stats && stats.attempts > 0 && (
          <Stack gap="0" textAlign="right">
            <Text fontWeight="semibold">{stats.attempts} feitos</Text>
            <Muted>{winRate}% de acerto</Muted>
          </Stack>
        )}
      </Panel>

      {/* Situação do problema */}
      {outcome === 'solved' ? (
        <Panel borderColor="jade.7" gap="3">
          <HStack gap="2" color="jade.11">
            <Check />
            <Heading as="h3" textStyle="lg" color="jade.11">
              {failed ? 'Resolvido (depois de errar)' : 'Resolvido!'}
            </Heading>
          </HStack>
          {result && !result.counted && <Muted>Você já tinha feito este problema, então o rating não mudou.</Muted>}
          <Button colorPalette="jade" size="lg" onClick={() => loadNext()}>
            Próximo problema <ArrowRight />
          </Button>
        </Panel>
      ) : outcome === 'revealed' ? (
        <Panel gap="3">
          <Heading as="h3" textStyle="lg">
            Solução
          </Heading>
          <Text fontFamily="mono" textStyle="sm">
            {line.sans.slice(1).join(' ')}
          </Text>
          <Button colorPalette="jade" size="lg" onClick={() => loadNext()}>
            Próximo problema <ArrowRight />
          </Button>
        </Panel>
      ) : (
        <Panel gap="3" borderColor={wrong ? 'red.7' : undefined}>
          {wrong ? (
            <HStack gap="2" color="red.11">
              <X />
              <Stack gap="0">
                <Heading as="h3" textStyle="md" color="red.11">
                  Não é esse lance
                </Heading>
                <Text textStyle="sm" color="fg.muted">
                  Tente de novo (este problema já contou como erro).
                </Text>
              </Stack>
            </HStack>
          ) : (
            <Stack gap="0">
              <Heading as="h3" textStyle="md">
                {step === 0 ? 'Observe a posição…' : step > 1 ? 'Isso! Continue.' : 'Sua vez'}
              </Heading>
              <Muted>Encontre o melhor lance para as {sideName}.</Muted>
            </Stack>
          )}
          <Flex gap="2" flexWrap="wrap">
            <Button variant="surface" onClick={reveal} disabled={step === 0}>
              <Lightbulb /> Ver solução
            </Button>
            {failed && (
              <Button variant="plain" onClick={() => loadNext()}>
                Pular <ArrowRight />
              </Button>
            )}
          </Flex>
        </Panel>
      )}

      {/* Detalhes do problema: só depois de terminar, para não entregar a ideia */}
      {outcome && (
        <Panel gap="2">
          <HStack justify="space-between">
            <Text fontWeight="semibold">Problema {puzzle._id}</Text>
            <Badge size="lg">Rating {puzzle.rating}</Badge>
          </HStack>
          <Wrap gap="1.5">
            {puzzle.themes.map((t) => (
              <Badge key={t} variant="outline" size="lg" borderRadius="full">
                {themeName(t)}
              </Badge>
            ))}
          </Wrap>
          <Link href={puzzle.gameUrl} target="_blank" rel="noreferrer" textStyle="sm" colorPalette="jade" color="jade.11">
            Partida original no Lichess <ExternalLink size={14} />
          </Link>
        </Panel>
      )}

      {stats && stats.recent.length > 0 && (
        <Panel gap="2">
          <Muted>Últimos problemas</Muted>
          <Wrap gap="1">
            {[...stats.recent].reverse().map((r, i) => (
              <Box
                key={i}
                w="4"
                h="4"
                borderRadius="l1"
                bg={r.win ? 'jade.9' : 'red.9'}
                title={`${r.win ? 'Acertou' : 'Errou'} · problema ${r.puzzleRating} · rating ${r.ratingAfter}`}
              />
            ))}
          </Wrap>
          {weak.length > 0 && (
            <Text textStyle="sm" color="fg.muted">
              Pontos fracos:{' '}
              {weak.map((w, i) => (
                <span key={w.theme}>
                  {i > 0 && ', '}
                  <Text as="span" color="fg.default" fontWeight="semibold">
                    {themeName(w.theme)}
                  </Text>{' '}
                  ({Math.round(w.rate * 100)}%)
                </span>
              ))}
            </Text>
          )}
        </Panel>
      )}

      <Panel gap="3">
        <ChoiceGroup
          label="Tema"
          shape="pill"
          value={theme || 'all'}
          onChange={(v) => chooseTheme(v === 'all' ? '' : v)}
          options={[{ value: 'all', label: 'Todos' }, ...THEME_FILTERS.map((t) => ({ value: t, label: themeName(t) }))]}
        />
      </Panel>
    </>
  );

  return <GameLayout board={board} side={side} />;
}
