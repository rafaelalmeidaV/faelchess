import { CLASSIFICATION_LABELS_PT, CLASSIFICATION_SYMBOLS, branchTokens, type Classification } from '@faelchess/shared';
import { Undo2, X } from 'lucide-react';
import { Fragment, useEffect, useRef } from 'react';
import { css } from 'styled-system/css';
import { Box, Flex, Grid, HStack, type BoxProps } from 'styled-system/jsx';
import { CLS_COLORS } from '../lib/labels';
import { IconButton } from './ui';

export interface MoveItem {
  san: string;
  classification?: Classification;
}

/** Ramificação (sandbox) que aparece recuada logo depois do lance real que foi substituído. */
export interface BranchView {
  /** Último lance real antes do desvio (-1 = posição inicial). */
  base: number;
  /** Lance real depois do qual o bloco é desenhado (o substituído; se não existe, o próprio base). */
  at: number;
  moves: { san: string; classification?: Classification }[];
  /** Lance da ramificação que está na tela. */
  current: number;
  thinking?: boolean;
  onSelect: (index: number) => void;
  onUndo: () => void;
  onExit: () => void;
}

const BRANCH = '#6aa6d9';

interface Props {
  moves: MoveItem[];
  branch?: BranchView;
  /** Índice do lance selecionado (0-based); -1 = posição inicial. */
  current?: number;
  onSelect?: (index: number) => void;
  /** Número do primeiro lance e se começa com as pretas (posição personalizada). */
  startsWithBlack?: boolean;
  maxH?: BoxProps['maxH'];
}

const moveCls = css({
  textAlign: 'left',
  px: '2',
  py: '1',
  borderRadius: 'l1',
  fontWeight: 'medium',
  textStyle: 'sm',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: '1',
  _hover: { bg: 'gray.a3' },
  '&[aria-current=true]': { bg: 'jade.a4', color: 'jade.12' },
});

const branchMoveCls = css({
  textAlign: 'left',
  px: '1.5',
  py: '0.5',
  borderRadius: 'l1',
  fontWeight: 'medium',
  textStyle: 'sm',
  cursor: 'pointer',
  _hover: { bg: 'gray.a3' },
  '&[aria-current=true]': { bg: 'rgba(106, 166, 217, 0.24)', color: '#b6d8f3' },
});

export function MoveList({ moves, branch, current, onSelect, startsWithBlack, maxH = '72' }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Rola só a lista (scrollIntoView rolaria a página inteira e o tabuleiro ia junto).
    const box = ref.current;
    const el = box?.querySelector('[aria-current=true]');
    if (!box || !el) return;
    const b = box.getBoundingClientRect();
    const e = el.getBoundingClientRect();
    if (e.top < b.top) box.scrollTop += e.top - b.top;
    else if (e.bottom > b.bottom) box.scrollTop += e.bottom - b.bottom;
  }, [current, moves.length, branch?.current, branch?.moves.length]);

  const offset = startsWithBlack ? 1 : 0;
  const rows: { n: number; white?: number; black?: number }[] = [];
  moves.forEach((_, i) => {
    const slot = i + offset;
    const n = Math.floor(slot / 2) + 1;
    if (slot % 2 === 0) rows.push({ n, white: i });
    else if (rows.length && rows[rows.length - 1].n === n) rows[rows.length - 1].black = i;
    else rows.push({ n, black: i });
  });

  const cell = (i?: number) => {
    if (i === undefined)
      return (
        <Box px="2" color="fg.subtle">
          …
        </Box>
      );
    const m = moves[i];
    const cls = m.classification;
    const symbol = cls && CLASSIFICATION_SYMBOLS[cls];
    return (
      <button
        type="button"
        className={moveCls}
        aria-current={i === current}
        onClick={() => onSelect?.(i)}
        title={cls ? CLASSIFICATION_LABELS_PT[cls] : undefined}
        style={symbol ? { color: CLS_COLORS[cls!] } : undefined}
      >
        {m.san}
        {symbol && <Box as="span" fontWeight="extrabold">{symbol}</Box>}
      </button>
    );
  };

  const branchBlock = branch && (
    <Box ml="10" my="1" pl="2" py="1" borderLeftWidth="2px" style={{ borderColor: BRANCH }}>
      <HStack justify="space-between" gap="2">
        <HStack gap="1.5" minW="0">
          <Box as="span" textStyle="xs" fontWeight="bold" style={{ color: BRANCH }}>
            Sandbox
          </Box>
          <Box as="span" textStyle="xs" color="fg.muted" truncate>
            nada é salvo{branch.thinking && ' · analisando…'}
          </Box>
        </HStack>
        <HStack gap="0.5" flexShrink="0">
          <IconButton variant="plain" size="xs" aria-label="Desfazer lance" title="Desfazer lance" onClick={branch.onUndo}>
            <Undo2 />
          </IconButton>
          <IconButton variant="plain" size="xs" aria-label="Sair do sandbox" title="Sair do sandbox (Esc)" onClick={branch.onExit}>
            <X />
          </IconButton>
        </HStack>
      </HStack>
      <Flex flexWrap="wrap" alignItems="center" gap="0.5">
        {branchTokens(branch.base, !!startsWithBlack, branch.moves.map((m) => m.san)).map((t) => (
          <Fragment key={t.i}>
            {t.number && (
              <Box as="span" textStyle="sm" color="fg.subtle" pl="1" fontVariantNumeric="tabular-nums">
                {t.number}
              </Box>
            )}
            {(() => {
              const cls = branch.moves[t.i]?.classification;
              const symbol = cls && CLASSIFICATION_SYMBOLS[cls];
              return (
                <button
                  type="button"
                  className={branchMoveCls}
                  aria-current={t.i === branch.current}
                  onClick={() => branch.onSelect(t.i)}
                  title={cls ? CLASSIFICATION_LABELS_PT[cls] : undefined}
                  style={symbol ? { color: CLS_COLORS[cls!] } : undefined}
                >
                  {t.san}
                  {symbol && (
                    <Box as="span" fontWeight="extrabold">
                      {symbol}
                    </Box>
                  )}
                </button>
              );
            })()}
          </Fragment>
        ))}
      </Flex>
    </Box>
  );

  return (
    <Box ref={ref} maxH={maxH} overflowY="auto" p="1">
      {branch && branch.at < 0 && branchBlock}
      {rows.map((r, idx) => (
        <Fragment key={r.n}>
          <Grid gridTemplateColumns="2.5rem 1fr 1fr" alignItems="center" gap="1" bg={idx % 2 ? 'gray.a2' : undefined} borderRadius="l1">
            <Box textStyle="sm" color="fg.subtle" textAlign="right" pr="1" fontVariantNumeric="tabular-nums">
              {r.n}.
            </Box>
            {cell(r.white)}
            {cell(r.black)}
          </Grid>
          {branch && branch.at >= 0 && (r.white === branch.at || r.black === branch.at) && branchBlock}
        </Fragment>
      ))}
      {moves.length === 0 && (
        <Box textStyle="sm" color="fg.muted" p="2">
          Nenhum lance ainda.
        </Box>
      )}
    </Box>
  );
}
