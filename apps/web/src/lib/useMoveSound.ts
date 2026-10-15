import { useEffect, useRef } from 'react';
import { playSound, preloadSounds, soundForSan } from './sound';

/**
 * Toca o som do lance quando o lance mostrado anda ou volta uma casa (lance novo, ← →).
 * Saltos (Home/End, carregar a partida) ficam em silêncio. `over` virando true toca o fim de jogo.
 */
export function useMoveSound(moves: { san: string }[], index: number, over = false) {
  const prev = useRef<number | null>(null);
  useEffect(() => preloadSounds(), []);
  useEffect(() => {
    const before = prev.current;
    prev.current = index;
    if (before === null || Math.abs(index - before) !== 1) return;
    // Voltando, o som é o do lance que foi desfeito; avançando, o do lance que apareceu.
    const san = moves[Math.max(index, before)]?.san;
    if (san) playSound(soundForSan(san));
  }, [index, moves]);

  const wasOver = useRef(over);
  useEffect(() => {
    if (over && !wasOver.current) {
      // Depois do som do último lance (o mate, por exemplo).
      const t = setTimeout(() => playSound('end'), 250);
      wasOver.current = over;
      return () => clearTimeout(t);
    }
    wasOver.current = over;
  }, [over]);
}
