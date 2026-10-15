import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Eye } from 'lucide-react';
import { HStack } from 'styled-system/jsx';
import type { useMoveBrowser } from '../lib/useMoveBrowser';
import { Button, IconButton, Text } from './ui';

type Browser = ReturnType<typeof useMoveBrowser>;

/** Botões « ‹ › » para rever lances durante a partida, e o aviso de que está vendo o passado. */
export function MoveNav({ browser: b }: { browser: Browser }) {
  return (
    <HStack justify="space-between" gap="2" px="2" py="1.5" flexWrap="wrap">
      <HStack gap="1">
        <IconButton size="sm" variant="plain" aria-label="Início" title="Início (Home)" disabled={b.index < 0} onClick={() => b.go(-1)}>
          <ChevronsLeft />
        </IconButton>
        <IconButton size="sm" variant="plain" aria-label="Lance anterior" title="Lance anterior (←)" disabled={b.index < 0} onClick={() => b.step(-1)}>
          <ChevronLeft />
        </IconButton>
        <IconButton size="sm" variant="plain" aria-label="Próximo lance" title="Próximo lance (→)" disabled={b.live} onClick={() => b.step(1)}>
          <ChevronRight />
        </IconButton>
        <IconButton size="sm" variant="plain" aria-label="Lance atual" title="Lance atual (End)" disabled={b.live} onClick={() => b.go(b.total - 1)}>
          <ChevronsRight />
        </IconButton>
      </HStack>
      {!b.live && (
        <HStack gap="2">
          <Text textStyle="xs" color="fg.muted" display="flex" alignItems="center" gap="1">
            <Eye size={14} /> Revendo
          </Text>
          <Button size="xs" colorPalette="jade" onClick={() => b.go(b.total - 1)}>
            Voltar ao jogo
          </Button>
        </HStack>
      )}
    </HStack>
  );
}
