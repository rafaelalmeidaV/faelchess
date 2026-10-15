import type { ReactNode } from 'react';
import { css } from 'styled-system/css';
import { Flex, Stack } from 'styled-system/jsx';

/*
 * Tamanho do tabuleiro: ocupa a altura que sobra (cabeçalho + duas faixas de jogador ≈ 205px) e,
 * no desktop, a largura que sobra ao lado do painel. Página com no máximo 1440px.
 * Celular: largura da tela menos as margens.
 */
const BOARD_SIZE = {
  play: css({
    '--board-size': {
      base: 'min(calc(100vw - 24px), calc(100vh - 205px))',
      lg: 'min(calc(min(100vw, 1440px) - 440px), calc(100vh - 205px))',
    },
  }),
  // Desconta a barra de avaliação (28px) e um painel lateral mais largo.
  analysis: css({
    '--board-size': {
      base: 'min(calc(100vw - 52px), calc(100vh - 245px))',
      lg: 'min(calc(min(100vw, 1440px) - 560px), calc(100vh - 205px))',
    },
  }),
};

/** Tabuleiro à esquerda e painel lateral à direita; empilha no celular. */
export function GameLayout({ board, side, kind = 'play' }: { board: ReactNode; side: ReactNode; kind?: 'play' | 'analysis' }) {
  return (
    <Flex direction={{ base: 'column', lg: 'row' }} gap={{ base: '4', lg: '8' }} align={{ base: 'center', lg: 'flex-start' }}>
      {/* No desktop o tabuleiro fica parado (abaixo do cabeçalho) e só a coluna da direita rola. */}
      <Stack gap="2.5" align="center" position={{ lg: 'sticky' }} top={{ lg: '18' }} className={BOARD_SIZE[kind]}>
        {board}
      </Stack>
      <Stack gap="4" flex="1" minW="0" w="full" maxW={{ lg: kind === 'play' ? 'lg' : '2xl' }}>
        {side}
      </Stack>
    </Flex>
  );
}
