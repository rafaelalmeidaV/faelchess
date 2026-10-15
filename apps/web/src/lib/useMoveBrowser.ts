import { Chess } from 'chess.js';
import { parseUci } from '@faelchess/shared';
import { useEffect, useMemo, useState } from 'react';

/**
 * Navegação pelos lances já jogados durante uma partida em andamento (só visualização).
 * `view === null` = acompanhando a posição atual; qualquer outro valor = olhando o passado,
 * e aí o tabuleiro não aceita lances. Lances novos não tiram você do lance que está vendo.
 */
export function useMoveBrowser(startFen: string, moves: { uci: string }[]) {
  const [view, setView] = useState<number | null>(null);
  const last = moves.length - 1;

  // Posição depois de cada lance (os lances só crescem, então o tamanho basta como dependência).
  const fens = useMemo(() => {
    const chess = new Chess(startFen);
    return moves.map((m) => {
      chess.move(parseUci(m.uci));
      return chess.fen();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startFen, moves.length]);

  const index = view === null ? last : Math.min(view, last);
  const live = view === null || view >= last;

  const clamp = (i: number) => {
    const c = Math.max(-1, Math.min(last, i));
    return c >= last ? null : c;
  };
  const go = (i: number) => setView(clamp(i));
  /** Anda a partir do valor mais recente (várias setas seguidas contam todas). */
  const step = (delta: number) => setView((v) => clamp((v ?? last) + delta));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'Home') go(-1);
      else if (e.key === 'End') go(last);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const viewed = index >= 0 ? moves[index] : undefined;
  const viewFen = index >= 0 ? fens[index] : startFen;
  return {
    /** Lance mostrado (-1 = posição inicial). */
    index,
    /** true = posição atual (pode jogar). */
    live,
    go,
    step,
    /** Só valem quando !live: posição, último lance e xeque do lance que está sendo visto. */
    viewFen,
    viewLastMove: viewed ? ([viewed.uci.slice(0, 2), viewed.uci.slice(2, 4)] as [string, string]) : undefined,
    viewCheck: useMemo(() => new Chess(viewFen).inCheck(), [viewFen]),
    total: moves.length,
  };
}
