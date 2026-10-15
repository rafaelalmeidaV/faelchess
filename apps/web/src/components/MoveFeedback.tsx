import { CLASSIFICATION_LABELS_PT, CLASSIFICATION_SYMBOLS, type Classification } from '@faelchess/shared';
import type { ReactNode } from 'react';
import { Box, HStack, Stack, Wrap } from 'styled-system/jsx';
import { CLS_COLORS } from '../lib/labels';
import { Badge, Text } from './ui';

const TOP = ['best', 'great', 'brilliant'];

export function ClsBadge({ cls, size = 8 }: { cls: Classification; size?: number }) {
  return (
    <Box
      flexShrink="0"
      display="inline-flex"
      alignItems="center"
      justifyContent="center"
      borderRadius="full"
      color="white"
      fontWeight="extrabold"
      style={{ background: CLS_COLORS[cls], width: size * 4, height: size * 4, fontSize: size * 1.7 }}
    >
      {CLASSIFICATION_SYMBOLS[cls] || (cls === 'excellent' ? '✓' : '•')}
    </Box>
  );
}

/** Cartão do lance: classificação em destaque, melhor alternativa e etiquetas. */
export function MoveFeedback({
  cls,
  title,
  subtitle,
  best,
  extra,
  tags = [],
}: {
  cls: Classification;
  /** Ex.: "7. Qf3". */
  title: string;
  subtitle?: ReactNode;
  /** Linha "Melhor era …" (só aparece quando o lance não foi o melhor). */
  best?: ReactNode;
  extra?: ReactNode;
  tags?: string[];
}) {
  const color = CLS_COLORS[cls];
  return (
    <Stack
      gap="3"
      p="4"
      borderRadius="l3"
      borderWidth="1px"
      style={{
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
      }}
    >
      <HStack gap="3">
        <ClsBadge cls={cls} />
        <Stack gap="0" minW="0">
          <Text textStyle="md" fontWeight="bold">
            {title} é {CLASSIFICATION_LABELS_PT[cls].toLowerCase()}
          </Text>
          {subtitle && (
            <Text textStyle="xs" color="fg.muted">
              {subtitle}
            </Text>
          )}
        </Stack>
      </HStack>
      {best && !TOP.includes(cls) && <Box textStyle="sm" color="fg.muted">{best}</Box>}
      {extra}
      {tags.length > 0 && (
        <Wrap gap="1.5">
          {tags.map((t) => (
            <Badge key={t} variant="outline" size="lg" borderRadius="full">
              {t}
            </Badge>
          ))}
        </Wrap>
      )}
    </Stack>
  );
}

/** Lance em destaque (ex.: "Be2") dentro de uma frase. */
export function San({ children }: { children: ReactNode }) {
  return (
    <Box as="span" display="inline-block" px="1.5" mx="0.5" borderRadius="l1" bg="gray.4" color="fg.default" fontWeight="bold">
      {children}
    </Box>
  );
}
