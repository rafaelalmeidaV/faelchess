import { CLASSIFICATION_LABELS_PT, CLASSIFICATION_SYMBOLS, type Classification } from '@faelchess/shared';
import { useEffect, useRef } from 'react';

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
}

export function MoveList({ moves, current, onSelect, startsWithBlack }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector('.move.current')?.scrollIntoView({ block: 'nearest' });
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
    if (i === undefined) return <span className="move empty">…</span>;
    const m = moves[i];
    const cls = m.classification;
    return (
      <button
        className={`move${i === current ? ' current' : ''}${cls ? ` cls-${cls}` : ''}`}
        onClick={() => onSelect?.(i)}
        title={cls ? CLASSIFICATION_LABELS_PT[cls] : undefined}
      >
        {m.san}
        {cls && CLASSIFICATION_SYMBOLS[cls] && <span className="glyph">{CLASSIFICATION_SYMBOLS[cls]}</span>}
      </button>
    );
  };

  return (
    <div className="move-list" ref={ref}>
      {rows.map((r) => (
        <div className="move-row" key={r.n}>
          <span className="move-n">{r.n}.</span>
          {cell(r.white)}
          {cell(r.black)}
        </div>
      ))}
      {moves.length === 0 && <div className="muted small">Nenhum lance ainda.</div>}
    </div>
  );
}
