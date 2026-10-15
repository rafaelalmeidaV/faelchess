import { CLASSIFICATION_LABELS_PT, CLASSIFICATION_SYMBOLS, type Classification } from '@faelchess/shared';
import { useEffect, useRef } from 'react';
import { css } from 'styled-system/css';
import { Box, Grid, type BoxProps } from 'styled-system/jsx';
import { CLS_COLORS } from '../lib/labels';

export interface MoveItem {
  san: string;
  classification?: Classification;
}

interface Props {
  moves: MoveItem[];
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

export function MoveList({ moves, current, onSelect, startsWithBlack, maxH = '72' }: Props) {
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
  }, [current, moves.length]);

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

  return (
    <Box ref={ref} maxH={maxH} overflowY="auto" p="1">
      {rows.map((r, idx) => (
        <Grid key={r.n} gridTemplateColumns="2.5rem 1fr 1fr" alignItems="center" gap="1" bg={idx % 2 ? 'gray.a2' : undefined} borderRadius="l1">
          <Box textStyle="sm" color="fg.subtle" textAlign="right" pr="1" fontVariantNumeric="tabular-nums">
            {r.n}.
          </Box>
          {cell(r.white)}
          {cell(r.black)}
        </Grid>
      ))}
      {moves.length === 0 && (
        <Box textStyle="sm" color="fg.muted" p="2">
          Nenhum lance ainda.
        </Box>
      )}
    </Box>
  );
}
