import type { ReactNode } from 'react';
import { Box, HStack, Stack } from 'styled-system/jsx';
import { Avatar, Text } from './ui';

export function formatClock(ms: number): string {
  const total = Math.max(0, ms);
  const s = Math.floor(total / 1000);
  const m = Math.floor(s / 60);
  const rest = s % 60;
  // Abaixo de 10 s mostra décimos, como no Lichess.
  if (total < 10_000) return `0:0${rest}.${Math.floor((total % 1000) / 100)}`;
  return `${m}:${String(rest).padStart(2, '0')}`;
}

/** Faixa do jogador acima/abaixo do tabuleiro: avatar, nome, subtítulo e relógio. */
export function Clock({
  ms,
  active,
  name,
  sub,
  avatar,
}: {
  ms?: number;
  active: boolean;
  name: string;
  sub?: ReactNode;
  /** Conteúdo do avatar (inicial ou ícone); por padrão a inicial do nome. */
  avatar?: ReactNode;
}) {
  const low = ms !== undefined && ms < 20_000;
  return (
    <HStack justify="space-between" w="var(--board-size)" maxW="full" gap="3">
      <HStack gap="2.5" minW="0">
        <Avatar.Root size="sm" colorPalette={active ? 'jade' : 'gray'} variant={active ? 'solid' : 'subtle'} borderRadius="l2">
          <Avatar.Fallback>{avatar ?? name.trim().charAt(0).toUpperCase()}</Avatar.Fallback>
        </Avatar.Root>
        <Stack gap="0" minW="0">
          <Text textStyle="sm" fontWeight="semibold" truncate>
            {name}
          </Text>
          {sub && (
            <Text textStyle="xs" color="fg.muted" truncate>
              {sub}
            </Text>
          )}
        </Stack>
      </HStack>
      {ms !== undefined && (
        <Box
          fontFamily="mono"
          fontWeight="semibold"
          textStyle={{ base: 'xl', md: '2xl' }}
          lineHeight="1"
          px="3"
          py="2"
          borderRadius="l2"
          fontVariantNumeric="tabular-nums"
          bg={active ? (low ? 'red.9' : 'gray.12') : 'gray.3'}
          color={active ? (low ? 'white' : 'gray.1') : 'fg.muted'}
        >
          {formatClock(ms)}
        </Box>
      )}
    </HStack>
  );
}
