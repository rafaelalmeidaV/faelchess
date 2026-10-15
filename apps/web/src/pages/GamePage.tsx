import {
  CLASSIFICATIONS,
  CLASSIFICATION_LABELS_PT,
  START_FEN,
  formatEval,
  uciLineToSan,
  winPctWhite,
  type Eval,
} from '@faelchess/shared';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Copy, RefreshCw, Repeat2, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Divider, Flex, Grid, HStack } from 'styled-system/jsx';
import { Board, type BoardColor } from '../components/Board';
import { Clock } from '../components/Clock';
import { EvalGraph } from '../components/EvalGraph';
import { GameLayout } from '../components/GameLayout';
import { Muted, Panel } from '../components/kit';
import { MoveFeedback, San } from '../components/MoveFeedback';
import { MoveList } from '../components/MoveList';
import { Alert, Badge, Button, Checkbox, Heading, IconButton, Spinner, Table, Text, toaster } from '../components/ui';
import { api, type Game } from '../lib/api';
import { capturedFor, materialFromFen } from '../lib/material';
import { useMoveSound } from '../lib/useMoveSound';
import type { Profile } from '../lib/profile';
import { navigate } from '../lib/router';
import { resultText } from './PlayPage';
import { PHASE_PT, TAG_PT, badgeSvg } from '../lib/labels';

function EvalBar({ value, orientation }: { value?: Eval; orientation: BoardColor }) {
  const white = value ? winPctWhite(value) : 50;
  return (
    <div className={`eval-bar ${orientation === 'black' ? 'flipped' : ''}`} title={formatEval(value)}>
      <div className="eval-white" style={{ height: `${white}%` }} />
      <span className={`eval-label ${white >= 50 ? 'on-white' : 'on-black'}`}>{formatEval(value).replace('+', '')}</span>
    </div>
  );
}

export function GamePage({ id, profile }: { id: string; profile: Profile }) {
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(-1);
  const [orientation, setOrientation] = useState<BoardColor>('white');
  const [showBest, setShowBest] = useState(true);

  const load = useCallback(async () => {
    try {
      const g = await api.getGame(id);
      setGame(g);
      return g;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [id]);

  useEffect(() => {
    void load().then((g) => {
      if (!g) return;
      setOrientation(g.black.userId === profile.userId && g.white.userId !== profile.userId ? 'black' : 'white');
      setIndex(g.moves.length - 1);
    });
  }, [load, profile.userId]);

  // Enquanto o worker não termina, consulta de novo a cada 4 s.
  useEffect(() => {
    if (!game || game.analysisStatus === 'done' || game.analysisStatus === 'failed') return;
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [game, load]);

  const moves = game?.moves ?? [];
  const n = moves.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(-1, i - 1));
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(n - 1, i + 1));
      else if (e.key === 'Home') setIndex(-1);
      else if (e.key === 'End') setIndex(n - 1);
      else if (e.key === 'f') setOrientation((o) => (o === 'white' ? 'black' : 'white'));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [n]);

  useMoveSound(moves, index);
  const move = index >= 0 ? moves[index] : undefined;
  const startFen = game?.startFen ?? START_FEN;
  const fen = move ? move.fenAfter : startFen;

  const shapes = useMemo<DrawShape[]>(() => {
    if (!move?.classification) return [];
    const out: DrawShape[] = [{ orig: move.uci.slice(2, 4) as Key, customSvg: { html: badgeSvg(move.classification) } }];
    const isTop = ['best', 'great', 'brilliant'].includes(move.classification);
    if (showBest && !isTop && move.bestMove) {
      out.push({ orig: move.bestMove.slice(0, 2) as Key, dest: move.bestMove.slice(2, 4) as Key, brush: 'green' });
    }
    return out;
  }, [move, showBest]);

  if (error)
    return (
      <Alert.Root colorPalette="red" variant="subtle">
        <Alert.Content>
          <Alert.Description>{error}</Alert.Description>
        </Alert.Content>
      </Alert.Root>
    );
  if (!game)
    return (
      <HStack gap="2" color="fg.muted">
        <Spinner size="sm" /> Carregando…
      </HStack>
    );

  const analysis = game.analysis;
  const status = game.analysisStatus;
  const evalNow: Eval | undefined = move?.evalAfter ?? moves[0]?.evalBefore;

  const players = [
    { side: 'white' as const, p: game.white },
    { side: 'black' as const, p: game.black },
  ];
  const STATUS = {
    pending: { label: 'Na fila', palette: 'gray' },
    processing: { label: 'Analisando', palette: 'gray' },
    done: { label: 'Analisada', palette: 'jade' },
    failed: { label: 'Falhou', palette: 'red' },
  } as const;
  const shortName = (p: { name: string; userId?: string }) => (p.userId === profile.userId ? 'Você' : p.name);
  const num = (v: number | null | undefined) => (typeof v === 'number' ? v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '–');
  const cell = { textAlign: 'center', w: '16', px: '1' } as const;

  const navButtons = (
    <HStack gap="2" justify="center" flexWrap="wrap">
      <IconButton variant="surface" aria-label="Início" title="Início (Home)" onClick={() => setIndex(-1)}>
        <ChevronsLeft />
      </IconButton>
      <IconButton variant="surface" aria-label="Anterior" title="Anterior (←)" onClick={() => setIndex((i) => Math.max(-1, i - 1))}>
        <ChevronLeft />
      </IconButton>
      <IconButton variant="surface" aria-label="Próximo" title="Próximo (→)" onClick={() => setIndex((i) => Math.min(n - 1, i + 1))}>
        <ChevronRight />
      </IconButton>
      <IconButton variant="surface" aria-label="Fim" title="Fim (End)" onClick={() => setIndex(n - 1)}>
        <ChevronsRight />
      </IconButton>
      <Button variant="surface" title="Virar (f)" onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}>
        <Repeat2 /> Virar
      </Button>
    </HStack>
  );

  const material = materialFromFen(fen);
  const topColor = orientation === 'white' ? 'b' : 'w';
  const bottomColor = orientation === 'white' ? 'w' : 'b';

  const board = (
    <>
      <Clock name={orientation === 'white' ? game.black.name : game.white.name} active={false} captured={capturedFor(material, topColor)} />
      <HStack gap="2" alignItems="stretch">
        <EvalBar value={status === 'done' ? evalNow : undefined} orientation={orientation} />
        <Board fen={fen} orientation={orientation} lastMove={move ? [move.uci.slice(0, 2), move.uci.slice(2, 4)] : undefined} shapes={shapes} />
      </HStack>
      <Clock name={orientation === 'white' ? game.white.name : game.black.name} active={false} captured={capturedFor(material, bottomColor)} />
      <Box hideFrom="lg">{navButtons}</Box>
    </>
  );

  const side = (
    <>
      <Panel gap="1.5">
        <HStack justify="space-between" alignItems="flex-start" gap="3">
          <Heading as="h2" textStyle={{ base: 'lg', md: 'xl' }}>
            {resultText(game.result, game.termination, game.white.name, game.black.name)}
          </Heading>
          <Badge colorPalette={STATUS[status].palette} size="lg" borderRadius="full" flexShrink="0">
            {status === 'processing' && <Spinner size="xs" />}
            {STATUS[status].label}
          </Badge>
        </HStack>
        <Muted>
          {new Date(game.finishedAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
          {game.opening && ` · ${game.opening.eco} ${game.opening.name}`} · {Math.ceil(n / 2)} lances
        </Muted>
        {status !== 'done' && (
          <Text textStyle="sm" color={status === 'failed' ? 'error' : 'fg.muted'} mt="1">
            {status === 'pending' && 'Na fila de análise… (o worker em casa precisa estar ligado)'}
            {status === 'processing' && 'Analisando com o Stockfish…'}
            {status === 'failed' && `A análise falhou: ${game.analysisError ?? 'erro desconhecido'}`}
          </Text>
        )}
      </Panel>

      <Grid gridTemplateColumns={{ base: '1fr', md: analysis ? 'repeat(2, minmax(0, 1fr))' : '1fr' }} gap="4" alignItems="start">
        {analysis && (
          <Panel gap="0" px="4" py="3">
            <Table.Root variant="plain" css={{ '& td, & th': { py: '1', px: '1' } }}>
              <Table.Head>
                <Table.Row>
                  <Table.Header />
                  {players.map(({ side, p }) => (
                    <Table.Header key={side} {...cell} color="fg.default" fontWeight="bold" textStyle="xs" truncate maxW="16">
                      {shortName(p)}
                    </Table.Header>
                  ))}
                </Table.Row>
              </Table.Head>
              <Table.Body>
                <Table.Row>
                  <Table.Cell fontWeight="semibold">Precisão</Table.Cell>
                  {players.map(({ side }) => (
                    <Table.Cell key={side} {...cell} textStyle="xl" fontWeight="bold">
                      {num(analysis.accuracy[side])}
                    </Table.Cell>
                  ))}
                </Table.Row>
                {(['opening', 'middlegame', 'endgame'] as const).map((ph) => (
                  <Table.Row key={ph} color="fg.muted">
                    <Table.Cell textStyle="xs">{PHASE_PT[ph]}</Table.Cell>
                    {players.map(({ side }) => (
                      <Table.Cell key={side} {...cell} textStyle="xs">
                        {num(analysis.phaseAccuracy?.[ph]?.[side])}
                      </Table.Cell>
                    ))}
                  </Table.Row>
                ))}
                {CLASSIFICATIONS.map((c, i) => (
                  <Table.Row key={c} borderTopWidth={i === 0 ? '1px' : undefined}>
                    <Table.Cell>
                      <HStack gap="0">
                        <span className={`chip cls-bg-${c}`} />
                        {CLASSIFICATION_LABELS_PT[c]}
                      </HStack>
                    </Table.Cell>
                    {players.map(({ side }) => (
                      <Table.Cell key={side} {...cell} fontWeight="semibold" color={analysis.counts[side][c] ? 'fg.default' : 'fg.subtle'}>
                        {analysis.counts[side][c]}
                      </Table.Cell>
                    ))}
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Panel>
        )}

        {move?.classification ? (
          <MoveFeedback
            cls={move.classification}
            title={`${Math.ceil(move.ply / 2)}${move.color === 'w' ? '.' : '...'} ${move.san}`}
            subtitle={
              <>
                {formatEval(move.evalAfter)} · precisão {move.accuracy}
                {move.phase && ` · ${PHASE_PT[move.phase]}`}
                {move.timeSpentMs !== undefined && ` · ${(move.timeSpentMs / 1000).toFixed(1)} s`}
              </>
            }
            best={
              move.bestMoveSan && (
                <>
                  Melhor era <San>{move.bestMoveSan}</San> ({formatEval(move.bestEval)}) · perdeu {move.winPctLoss}%
                  <Box mt="1" fontFamily="mono" textStyle="xs" color="fg.subtle">
                    {uciLineToSan(move.fenBefore, move.bestLine ?? [], 8).join(' ')}
                  </Box>
                </>
              )
            }
            tags={(move.tags ?? []).map((t) => TAG_PT[t] ?? t)}
          />
        ) : (
          analysis && (
            <Panel>
              <Muted>Escolha um lance na lista ou no gráfico para ver a avaliação dele.</Muted>
            </Panel>
          )
        )}
      </Grid>

      {status === 'done' && (
        <Panel gap="2">
          <HStack justify="space-between">
            <Muted>Vantagem ao longo da partida</Muted>
            {move && (
              <Muted>
                Lance {Math.ceil(move.ply / 2)} · {formatEval(move.evalAfter)}
              </Muted>
            )}
          </HStack>
          <EvalGraph
            points={moves.map((m) => ({
              san: m.san,
              label: `${Math.ceil(m.ply / 2)}${m.color === 'w' ? '.' : '...'} ${m.san}`,
              eval: m.evalAfter,
              classification: m.classification,
            }))}
            current={index}
            onSelect={setIndex}
          />
        </Panel>
      )}

      <Panel p="2" gap="2">
        <Box hideBelow="lg" pt="1">
          {navButtons}
        </Box>
        <MoveList moves={moves} current={index} onSelect={setIndex} startsWithBlack={moves[0]?.color === 'b'} />
        <Divider />
        <Flex gap="2" flexWrap="wrap" align="center" justify="space-between" px="2" pb="1">
          <Checkbox.Root size="sm" colorPalette="jade" checked={showBest} onCheckedChange={(d) => setShowBest(d.checked === true)}>
            <Checkbox.HiddenInput />
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Label textStyle="sm">Seta do melhor lance</Checkbox.Label>
          </Checkbox.Root>
          <Flex gap="2" flexWrap="wrap">
            <Button
              variant="surface"
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(game.pgn);
                toaster.create({ title: 'PGN copiado', type: 'success' });
              }}
            >
              <Copy /> PGN
            </Button>
            {(status === 'done' || status === 'failed') && (
              <Button variant="surface" size="sm" onClick={() => api.reanalyze(game._id).then(load)}>
                <RefreshCw /> Reanalisar
              </Button>
            )}
            <Button
              variant="surface"
              colorPalette="red"
              size="sm"
              onClick={async () => {
                if (!confirm('Apagar esta partida?')) return;
                await api.deleteGame(game._id);
                navigate('/history');
              }}
            >
              <Trash2 /> Apagar
            </Button>
          </Flex>
        </Flex>
      </Panel>
    </>
  );

  return <GameLayout kind="analysis" board={board} side={side} />;
}
