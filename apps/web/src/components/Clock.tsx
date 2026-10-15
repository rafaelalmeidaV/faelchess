import type { ReactNode } from 'react';
import { Box, HStack, Stack } from 'styled-system/jsx';
import { loadAppearance } from '../lib/appearance';
import type { CapturedType } from '../lib/material';
import { Avatar, Text } from './ui';

export interface CapturedInfo {
  /** Peças do adversário que este jogador capturou. */
  pieces: CapturedType[];
  /** Cor dessas peças (a do adversário). */
  pieceColor: 'w' | 'b';
  /** Vantagem de material deste jogador (só aparece se > 0). */
  advantage: number;
}

/** Peças capturadas agrupadas por tipo (levemente sobrepostas) e o "+N" de vantagem. */
function Captured({ pieces, pieceColor, advantage }: CapturedInfo) {
  if (pieces.length === 0 && advantage <= 0) return null;
  const set = loadAppearance().pieces;
  const groups = pieces.reduce<CapturedType[][]>((acc, t) => {
    if (acc.at(-1)?.[0] === t) acc.at(-1)!.push(t);
    else acc.push([t]);
    return acc;
  }, []);
  return (
    <HStack gap="1" flexShrink="0" title={advantage > 0 ? `Vantagem de ${advantage}` : undefined}>
      {groups.map((g, i) => (
        <HStack key={i} gap="0">
          {g.map((t, j) => (
            <img
              key={j}
              src={`/pieces/${set}/${pieceColor}${t.toUpperCase()}.svg`}
              alt=""
              width={18}
              height={18}
              // Peças pretas somem no fundo escuro: um contorno claro discreto.
              style={{ marginLeft: j ? -10 : 0, filter: pieceColor === 'b' ? 'drop-shadow(0 0 1px rgba(255,255,255,.55))' : undefined }}
            />
          ))}
        </HStack>
      ))}
      {advantage > 0 && (
        <Text as="span" textStyle="xs" fontWeight="semibold" color="fg.muted">
          +{advantage}
        </Text>
      )}
    </HStack>
  );
}

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
  captured,
}: {
  ms?: number;
  active: boolean;
  name: string;
  sub?: ReactNode;
  /** Conteúdo do avatar (inicial ou ícone); por padrão a inicial do nome. */
  avatar?: ReactNode;
  captured?: CapturedInfo;
}) {
  const low = ms !== undefined && ms < 20_000;
  return (
    <HStack justify="space-between" w="var(--board-size)" maxW="full" gap="3">
      <HStack gap="2.5" minW="0">
        <Avatar.Root size="sm" colorPalette={active ? 'jade' : 'gray'} variant={active ? 'solid' : 'subtle'} borderRadius="l2">
          <Avatar.Fallback>{avatar ?? name.trim().charAt(0).toUpperCase()}</Avatar.Fallback>
        </Avatar.Root>
        <Stack gap="0" minW="0">
          <HStack gap="2" minW="0">
            <Text textStyle="sm" fontWeight="semibold" truncate>
              {name}
            </Text>
            {captured && <Captured {...captured} />}
          </HStack>
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
