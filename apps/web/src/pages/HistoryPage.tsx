import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Box, Flex, HStack, Stack } from 'styled-system/jsx';
import { ChoiceGroup, Muted, Panel, ToggleSwitch } from '../components/kit';
import { Alert, Badge, Button, Heading, Spinner, Table, Text } from '../components/ui';
import { api, type GameSummary } from '../lib/api';
import type { Profile } from '../lib/profile';
import { navigate } from '../lib/router';
import { OUTCOME_PALETTE, mySide, opponentName, outcomeFor } from '../lib/summary';
import { tcLabel } from './PlayPage';

const STATUS = {
  pending: { label: 'Na fila', palette: 'gray' },
  processing: { label: 'Analisando', palette: 'gray' },
  done: { label: 'Analisada', palette: 'jade' },
  failed: { label: 'Falhou', palette: 'red' },
} as const;
const TYPE_PT: Record<string, string> = { bot: 'Bot', local: 'Local', online: 'Online' };
const PAGE = 30;

type Filter = 'all' | 'bot' | 'local' | 'online';

function AccuracyBar({ value }: { value?: number | null }) {
  if (typeof value !== 'number') return <Text color="fg.subtle">–</Text>;
  const palette = value >= 85 ? 'jade' : value >= 70 ? 'amber' : 'red';
  const color = palette === 'jade' ? 'var(--colors-jade-9)' : palette === 'amber' ? '#e8b33a' : 'var(--colors-red-9)';
  return (
    <HStack gap="2.5">
      <Text fontWeight="bold" w="10" fontVariantNumeric="tabular-nums">
        {value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}
      </Text>
      <Box w="20" h="1.5" borderRadius="full" bg="gray.4" overflow="hidden" hideBelow="md">
        <Box h="full" borderRadius="full" style={{ width: `${Math.min(100, value)}%`, background: color }} />
      </Box>
    </HStack>
  );
}

export function HistoryPage({ profile }: { profile: Profile }) {
  const [items, setItems] = useState<GameSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [error, setError] = useState('');
  const [mine, setMine] = useState(true);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    api
      .listGames({ userId: mine ? profile.userId : undefined, type: filter === 'all' ? undefined : filter, limit: PAGE, skip })
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
      })
      .catch((e) => setError((e as Error).message));
  }, [skip, mine, filter, profile.userId]);

  if (error)
    return (
      <Alert.Root colorPalette="red" variant="subtle">
        <Alert.Content>
          <Alert.Description>{error}</Alert.Description>
        </Alert.Content>
      </Alert.Root>
    );

  const analyzed = (items ?? []).filter((g) => g.analysisStatus === 'done').length;

  return (
    <Stack gap="5">
      <Flex justify="space-between" align={{ base: 'flex-start', md: 'flex-end' }} gap="4" direction={{ base: 'column', md: 'row' }}>
        <Stack gap="1">
          <Heading as="h1" textStyle={{ base: '2xl', md: '3xl' }}>
            Partidas
          </Heading>
          <Muted textStyle="md">
            {total} {total === 1 ? 'partida' : 'partidas'}
            {items && ` · ${analyzed} analisadas nesta página`}
          </Muted>
        </Stack>
        <Flex gap="4" align="center" flexWrap="wrap">
          <ChoiceGroup
            shape="pill"
            value={filter}
            onChange={(v) => {
              setSkip(0);
              setFilter(v);
            }}
            options={[
              { value: 'all', label: 'Todas' },
              { value: 'bot', label: 'Bot' },
              { value: 'local', label: 'Local' },
              { value: 'online', label: 'Online' },
            ]}
          />
          <ToggleSwitch
            size="sm"
            checked={mine}
            onChange={(v) => {
              setSkip(0);
              setMine(v);
            }}
            label="Só as minhas"
          />
        </Flex>
      </Flex>

      <Panel p="0" gap="0" overflowX="auto">
        {!items ? (
          <HStack gap="2" color="fg.muted" p="5">
            <Spinner size="sm" /> Carregando…
          </HStack>
        ) : items.length === 0 ? (
          <Muted p="5">Nenhuma partida ainda.</Muted>
        ) : (
          <Table.Root interactive css={{ '& td, & th': { px: '4' }, whiteSpace: 'nowrap' }}>
            <Table.Head>
              <Table.Row>
                <Table.Header w="12" />
                <Table.Header>Adversário</Table.Header>
                <Table.Header hideBelow="md">Abertura</Table.Header>
                <Table.Header hideBelow="lg">Ritmo</Table.Header>
                <Table.Header>Precisão</Table.Header>
                <Table.Header hideBelow="md" title="Capivaradas">
                  Capivaradas
                </Table.Header>
                <Table.Header hideBelow="sm">Data</Table.Header>
                <Table.Header hideBelow="lg">Análise</Table.Header>
              </Table.Row>
            </Table.Head>
            <Table.Body>
              {items.map((g) => {
                const o = outcomeFor(g, profile.userId);
                const side = mySide(g, profile.userId);
                const played = g.white.userId === profile.userId || g.black.userId === profile.userId;
                const blunders = g.analysis?.counts[side]?.blunder;
                return (
                  <Table.Row key={g._id} cursor="pointer" onClick={() => navigate(`/game/${g._id}`)}>
                    <Table.Cell>
                      <Badge colorPalette={OUTCOME_PALETTE[o.kind]} size="2xl" w="7" justifyContent="center" fontWeight="extrabold" title={o.text}>
                        {o.short}
                      </Badge>
                    </Table.Cell>
                    <Table.Cell>
                      <Stack gap="0">
                        <Text fontWeight="semibold" truncate maxW="52">
                          {played ? opponentName(g, profile.userId) : `${g.white.name} × ${g.black.name}`}
                        </Text>
                        <Text textStyle="xs" color="fg.muted">
                          {TYPE_PT[g.type] ?? g.type}
                          {played && ` · você de ${side === 'white' ? 'brancas' : 'pretas'}`}
                        </Text>
                      </Stack>
                    </Table.Cell>
                    <Table.Cell hideBelow="md" maxW="72" truncate>
                      {g.opening ? `${g.opening.eco} ${g.opening.name}` : <Text as="span" color="fg.subtle">–</Text>}
                    </Table.Cell>
                    <Table.Cell hideBelow="lg" color="fg.muted">
                      {tcLabel(g.timeControl ?? undefined)}
                    </Table.Cell>
                    <Table.Cell>
                      <AccuracyBar value={g.analysis?.accuracy[side]} />
                    </Table.Cell>
                    <Table.Cell hideBelow="md" fontWeight="semibold" style={blunders ? { color: 'var(--cls-blunder)' } : undefined} color={blunders ? undefined : 'fg.subtle'}>
                      {blunders ?? '–'}
                    </Table.Cell>
                    <Table.Cell hideBelow="sm" color="fg.muted" textStyle="sm">
                      {new Date(g.finishedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </Table.Cell>
                    <Table.Cell hideBelow="lg">
                      <Badge colorPalette={STATUS[g.analysisStatus].palette} size="lg" borderRadius="full">
                        {STATUS[g.analysisStatus].label}
                      </Badge>
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table.Root>
        )}
      </Panel>

      <Flex justify="space-between" align="center" gap="3" flexWrap="wrap">
        <Muted>{total > 0 && `Mostrando ${skip + 1}–${Math.min(skip + PAGE, total)} de ${total}`}</Muted>
        <Flex gap="2">
          <Button variant="surface" size="sm" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - PAGE))}>
            <ArrowLeft /> Mais novas
          </Button>
          <Button variant="surface" size="sm" disabled={skip + PAGE >= total} onClick={() => setSkip(skip + PAGE)}>
            Mais antigas <ArrowRight />
          </Button>
        </Flex>
      </Flex>
    </Stack>
  );
}
