import { START_FEN } from '@faelchess/shared';
import { Bot, ChevronRight, Globe, Play, Shuffle, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Box, Divider, Flex, Grid, HStack, Stack } from 'styled-system/jsx';
import { hstack } from 'styled-system/patterns';
import { Board } from '../components/Board';
import { ChoiceGroup, Muted, Panel, ToggleSwitch, type Choice } from '../components/kit';
import { Badge, Button, Field, Heading, Input, Tabs, Text } from '../components/ui';
import { api, type GameSummary } from '../lib/api';
import { loadAppearance } from '../lib/appearance';
import { BOT_LEVELS } from '../lib/engine';
import { createOnlineGame } from '../lib/online';
import type { Profile } from '../lib/profile';
import { navigate } from '../lib/router';
import { TRAINING_KEY, useStoredFlag } from '../lib/storedFlag';
import { OUTCOME_PALETTE, mySide, opponentName, outcomeFor, pct, relativeDay } from '../lib/summary';

export const TIME_CONTROLS = [
  { id: 'none', label: 'Sem relógio' },
  { id: '180+2', label: '3+2' },
  { id: '300+3', label: '5+3' },
  { id: '600+0', label: '10+0' },
  { id: '600+5', label: '10+5' },
  { id: '900+10', label: '15+10' },
  { id: '1800+0', label: '30+0' },
];

const TC_KIND: Record<string, string> = { '180+2': 'blitz', '300+3': 'blitz', '1800+0': 'clássica' };

/** "600+5" -> { baseMs, incrementMs } (segundos na URL). */
export function parseTimeControl(id: string | null) {
  if (!id || id === 'none') return undefined;
  // Na query da URL o "+" chega como espaço (URLSearchParams), então aceita os dois.
  const [base, inc] = id.split(/[+ ]/).map(Number);
  if (!Number.isFinite(base) || base <= 0) return undefined;
  return { baseMs: base * 1000, incrementMs: (inc || 0) * 1000 };
}

const tcChoices = (withNone: boolean): Choice<string>[] =>
  TIME_CONTROLS.filter((t) => withNone || t.id !== 'none').map((t) => ({
    value: t.id,
    label: t.label,
    title: t.id === 'none' ? undefined : TC_KIND[t.id] ?? 'rápida',
  }));

type Side = 'w' | 'b' | 'random';

function sideChoices(set: string): Choice<Side>[] {
  // Rei preto num fundo claro, senão some no cartão escuro.
  const piece = (c: 'w' | 'b') => (
    <Box bg={c === 'b' ? 'gray.11' : undefined} borderRadius="l1" p="0.5" display="flex">
      <img src={`/pieces/${set}/${c}K.svg`} alt="" width={34} height={34} />
    </Box>
  );
  return [
    { value: 'w', label: piece('w'), title: 'Brancas' },
    { value: 'random', label: <Shuffle size={22} />, title: 'Sorteio' },
    { value: 'b', label: piece('b'), title: 'Pretas' },
  ];
}

const ACTION_ROW = { justify: 'space-between', align: 'center', gap: '4', flexWrap: 'wrap' } as const;

function Stat({ label, value, sub, subColor }: { label: string; value: string; sub?: string; subColor?: string }) {
  return (
    <Panel gap="1" flex="1" minW="40">
      <Muted>{label}</Muted>
      <Text textStyle="3xl" fontWeight="bold" lineHeight="1.1">
        {value}
      </Text>
      {sub && (
        <Text textStyle="xs" fontWeight="semibold" color={subColor ?? 'fg.muted'}>
          {sub}
        </Text>
      )}
    </Panel>
  );
}

/** Últimas partidas + números rápidos, a partir das partidas analisadas mais recentes. */
function useRecent(userId: string) {
  const [items, setItems] = useState<GameSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [lastFen, setLastFen] = useState<string | null>(null);
  useEffect(() => {
    api
      .listGames({ userId, limit: 50 })
      .then(async (r) => {
        setItems(r.items);
        setTotal(r.total);
        const last = r.items[0];
        if (last) {
          const g = await api.getGame(last._id);
          setLastFen(g.moves.at(-1)?.fenAfter ?? g.startFen ?? null);
        }
      })
      .catch(() => setItems([]));
  }, [userId]);
  return { items, total, lastFen };
}

export function HomePage({ profile }: { profile: Profile }) {
  const pieceSet = loadAppearance().pieces;
  const [mode, setMode] = useState(() => localStorage.getItem('faelchess:lastMode') ?? 'bot');
  const [elo, setElo] = useState(() => Number(localStorage.getItem('faelchess:lastElo') ?? 1200));
  const [botColor, setBotColor] = useState<Side>('w');
  const [botTc, setBotTc] = useState('none');
  const [localTc, setLocalTc] = useState('600+5');
  const [mySideLocal, setMySideLocal] = useState<'w' | 'b' | 'none'>('w');
  const [guest, setGuest] = useState('Convidado');
  const [onlineTc, setOnlineTc] = useState('600+5');
  const [onlineColor, setOnlineColor] = useState<Side>('random');
  const [training, setTraining] = useStoredFlag(TRAINING_KEY, false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const { items, total, lastFen } = useRecent(profile.userId);

  const remember = (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ok */
    }
  };

  const playBot = () => {
    remember('faelchess:lastElo', String(elo));
    const color = botColor === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : botColor;
    navigate(`/play/bot?elo=${elo}&color=${color}&tc=${botTc}`);
  };

  const playLocal = () => {
    navigate(`/play/local?me=${mySideLocal}&guest=${encodeURIComponent(guest)}&tc=${localTc}`);
  };

  const playOnline = async () => {
    setCreating(true);
    setError('');
    try {
      const { gameId } = await createOnlineGame({ timeControl: parseTimeControl(onlineTc), color: onlineColor, profile });
      navigate(`/online/${gameId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  const trainingSwitch = (
    <ToggleSwitch checked={training} onChange={setTraining} label="Modo treino" hint="Classifica cada lance seu na hora" />
  );

  // Números das partidas recentes já analisadas.
  const analyzed = (items ?? []).filter((g) => g.analysis);
  const accs = analyzed.map((g) => g.analysis!.accuracy[mySide(g, profile.userId)]).filter((a): a is number => typeof a === 'number');
  const avgAcc = accs.length ? accs.reduce((s, a) => s + a, 0) / accs.length : undefined;
  const blunders = analyzed.length
    ? analyzed.reduce((s, g) => s + (g.analysis!.counts[mySide(g, profile.userId)].blunder ?? 0), 0) / analyzed.length
    : undefined;
  const tally = (items ?? []).reduce(
    (t, g) => {
      t[outcomeFor(g, profile.userId).kind]++;
      return t;
    },
    { win: 0, draw: 0, loss: 0 },
  );
  const last = items?.[0];

  return (
    <Grid gridTemplateColumns={{ base: '1fr', lg: 'auto minmax(0, 1fr)' }} gap={{ base: '6', lg: '10' }} alignItems="start">
      <Stack gap="3" order={{ base: 2, lg: 1 }} css={{ '--board-size': 'min(calc(100vh - 190px), calc((min(100vw, 1440px) - 88px) / 2))' }} hideBelow="lg">
        <Board fen={lastFen ?? START_FEN} orientation={last && mySide(last, profile.userId) === 'black' ? 'black' : 'white'} />
        {last && (
          <Panel asChild flexDirection="row" alignItems="center" justifyContent="space-between" py="3" cursor="pointer" _hover={{ borderColor: 'gray.7' }}>
            <a href={`#/game/${last._id}`}>
              <Stack gap="0.5" minW="0">
                <Muted>Última partida</Muted>
                <Text textStyle="sm" truncate>
                  {outcomeFor(last, profile.userId).text} contra {opponentName(last, profile.userId)}
                  {last.opening && ` · ${last.opening.name}`}
                </Text>
              </Stack>
              {typeof last.analysis?.accuracy[mySide(last, profile.userId)] === 'number' && (
                <Badge colorPalette="jade" size="2xl" borderRadius="full" fontWeight="bold">
                  {pct(last.analysis.accuracy[mySide(last, profile.userId)]!)}
                </Badge>
              )}
            </a>
          </Panel>
        )}
      </Stack>

      <Stack gap="6" order={{ base: 1, lg: 2 }} minW="0">
        <Stack gap="1">
          <Heading as="h1" textStyle={{ base: '2xl', md: '3xl' }}>
            Nova partida
          </Heading>
          <Muted textStyle="md">Toda partida salva vai para a análise do Stockfish.</Muted>
        </Stack>

        <Tabs.Root
          value={mode}
          onValueChange={(d) => {
            setMode(d.value);
            remember('faelchess:lastMode', d.value);
          }}
          variant="enclosed"
          colorPalette="jade"
        >
          <Tabs.List w={{ base: 'full', sm: 'fit-content' }}>
            <Tabs.Trigger value="bot" flex={{ base: '1', sm: 'initial' }}>
              <Bot />
              <Box as="span" hideBelow="sm">
                Contra o
              </Box>{' '}
              bot
            </Tabs.Trigger>
            <Tabs.Trigger value="local" flex={{ base: '1', sm: 'initial' }}>
              <Users /> Local
            </Tabs.Trigger>
            <Tabs.Trigger value="online" flex={{ base: '1', sm: 'initial' }}>
              <Globe /> Online
            </Tabs.Trigger>
            <Tabs.Indicator />
          </Tabs.List>

          <Tabs.Content value="bot">
            <Panel gap="6" mt="3">
              <ChoiceGroup
                label="Nível do bot"
                value={String(elo)}
                onChange={(v) => setElo(Number(v))}
                options={BOT_LEVELS.map((l) => ({ value: String(l.elo), label: l.elo, hint: l.label }))}
              />
              <Flex gap="6" flexWrap="wrap">
                <ChoiceGroup label="Suas peças" shape="tile" value={botColor} onChange={setBotColor} options={sideChoices(pieceSet)} />
                <Box flex="1" minW="64">
                  <ChoiceGroup label="Ritmo" shape="pill" value={botTc} onChange={setBotTc} options={tcChoices(true)} />
                </Box>
              </Flex>
              <Divider />
              <Flex {...ACTION_ROW}>
                {trainingSwitch}
                <Button colorPalette="jade" size="lg" minW={{ base: 'full', sm: '48' }} onClick={playBot}>
                  <Play /> Jogar
                </Button>
              </Flex>
            </Panel>
          </Tabs.Content>

          <Tabs.Content value="local">
            <Panel gap="6" mt="3">
              <Muted>Duas pessoas no mesmo aparelho.</Muted>
              <ChoiceGroup
                label={`Você (${profile.name}) joga de`}
                shape="pill"
                value={mySideLocal}
                onChange={setMySideLocal}
                options={[
                  { value: 'w', label: 'Brancas' },
                  { value: 'b', label: 'Pretas' },
                  { value: 'none', label: 'Nenhum (só registrar)' },
                ]}
              />
              <Field.Root maxW="sm">
                <Field.Label>Adversário</Field.Label>
                <Input value={guest} onChange={(e) => setGuest(e.target.value)} maxLength={40} />
              </Field.Root>
              <ChoiceGroup label="Ritmo" shape="pill" value={localTc} onChange={setLocalTc} options={tcChoices(true)} />
              <Divider />
              <Flex {...ACTION_ROW}>
                {trainingSwitch}
                <Button colorPalette="jade" size="lg" minW={{ base: 'full', sm: '48' }} onClick={playLocal}>
                  <Play /> Começar
                </Button>
              </Flex>
            </Panel>
          </Tabs.Content>

          <Tabs.Content value="online">
            <Panel gap="6" mt="3">
              <Muted>Cria um link de convite para jogar com alguém.</Muted>
              <Flex gap="6" flexWrap="wrap">
                <ChoiceGroup label="Suas peças" shape="tile" value={onlineColor} onChange={setOnlineColor} options={sideChoices(pieceSet)} />
                <Box flex="1" minW="64">
                  <ChoiceGroup label="Ritmo" shape="pill" value={onlineTc} onChange={setOnlineTc} options={tcChoices(false)} />
                </Box>
              </Flex>
              <Divider />
              <Flex {...ACTION_ROW}>
                <Text textStyle="sm" color="error">
                  {error}
                </Text>
                <Button colorPalette="jade" size="lg" minW={{ base: 'full', sm: '48' }} onClick={playOnline} loading={creating} loadingText="Criando…">
                  <Globe /> Criar convite
                </Button>
              </Flex>
            </Panel>
          </Tabs.Content>
        </Tabs.Root>

        {items && items.length > 0 && (
          <>
            <Flex gap="3" flexWrap="wrap">
              <Stat label="Precisão média" value={avgAcc !== undefined ? pct(avgAcc) : '–'} sub={accs.length ? `${accs.length} partidas analisadas` : undefined} />
              <Stat label="Partidas" value={String(total)} sub={`${tally.win}V · ${tally.draw}E · ${tally.loss}D`} />
              <Stat
                label="Capivaradas / partida"
                value={blunders !== undefined ? blunders.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '–'}
                sub={analyzed.length ? `nas últimas ${analyzed.length}` : undefined}
              />
            </Flex>

            <Panel p="0" gap="0">
              <HStack justify="space-between" px="4" py="3">
                <Heading as="h3" textStyle="md">
                  Últimas partidas
                </Heading>
                <Button asChild variant="plain" size="sm" colorPalette="jade" color="jade.11">
                  <a href="#/history">
                    Ver todas <ChevronRight />
                  </a>
                </Button>
              </HStack>
              {items.slice(0, 3).map((g) => {
                const o = outcomeFor(g, profile.userId);
                const acc = g.analysis?.accuracy[mySide(g, profile.userId)] ?? undefined;
                return (
                  <a key={g._id} href={`#/game/${g._id}`} className={hstack({ gap: '3.5', px: '4', py: '3', borderTopWidth: '1px', _hover: { bg: 'gray.a2' } })}>
                      <Badge colorPalette={OUTCOME_PALETTE[o.kind]} size="2xl" w="7" justifyContent="center" fontWeight="extrabold">
                        {o.short}
                      </Badge>
                      <Stack gap="0" flex="1" minW="0">
                        <Text textStyle="sm" fontWeight="semibold" truncate>
                          {opponentName(g, profile.userId)}
                        </Text>
                        <Text textStyle="xs" color="fg.muted" truncate>
                          {g.opening?.name ?? 'Abertura desconhecida'} · {Math.ceil(g.plyCount / 2)} lances
                        </Text>
                      </Stack>
                      <Text textStyle="sm" fontWeight="bold">
                        {acc !== undefined ? pct(acc) : '–'}
                      </Text>
                      <Text textStyle="xs" color="fg.muted" w="16" textAlign="right">
                        {relativeDay(g.finishedAt)}
                      </Text>
                  </a>
                );
              })}
            </Panel>
          </>
        )}
      </Stack>
    </Grid>
  );
}
