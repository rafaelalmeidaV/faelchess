import { useEffect, useRef, useState } from 'react';
import { BrowserEngine } from './engine';

/** Profundidade da dica: forte o bastante para achar o lance bom, rápida no navegador. */
const HINT_DEPTH = 14;

/**
 * Dica em duas etapas, como no Lichess: 1ª mostra a peça que deve ser movida, 2ª mostra também
 * a casa de destino. O Stockfish da dica (força total) só é criado quando a primeira dica é pedida.
 * Qualquer mudança de posição apaga a dica.
 */
export function useHint(fen: string) {
  const engine = useRef<BrowserEngine | null>(null);
  const [level, setLevel] = useState<0 | 1 | 2>(0);
  const [best, setBest] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  // Posição atual fora do closure: para descartar uma dica que chegou depois de um lance.
  const current = useRef(fen);
  current.current = fen;

  useEffect(() => {
    setLevel(0);
    setBest(null);
    setThinking(false);
  }, [fen]);

  useEffect(() => () => engine.current?.destroy(), []);

  const request = async () => {
    if (level === 1 && best) return setLevel(2);
    if (level > 0 || thinking) return;
    setThinking(true);
    engine.current ??= new BrowserEngine();
    const askedFor = fen;
    try {
      const [line] = await engine.current.analyse(fen, HINT_DEPTH, 1);
      // A posição pode ter mudado enquanto o engine pensava.
      if (askedFor !== current.current || !line?.pv[0]) return;
      setBest(line.pv[0]);
      setLevel(1);
    } finally {
      setThinking(false);
    }
  };

  return {
    /** 0 = sem dica, 1 = peça, 2 = peça e destino. */
    level,
    thinking,
    request,
    from: level >= 1 && best ? best.slice(0, 2) : null,
    to: level >= 2 && best ? best.slice(2, 4) : null,
  };
}
