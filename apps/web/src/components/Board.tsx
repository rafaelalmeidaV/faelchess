import { Chess, SQUARES, type Square } from 'chess.js';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { useEffect, useRef, useState } from 'react';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

export type BoardColor = 'white' | 'black';

interface Props {
  fen: string;
  orientation: BoardColor;
  /** Cor que pode mover agora; undefined = tabuleiro só de visualização. */
  movable?: BoardColor | 'both';
  lastMove?: [string, string];
  check?: boolean;
  shapes?: DrawShape[];
  /** Recebe o lance em UCI (com promoção, se houver). */
  onMove?: (uci: string) => void;
}

/** Lances legais no formato do chessground. */
function legalDests(chess: Chess): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>();
  for (const sq of SQUARES) {
    const ms = chess.moves({ square: sq, verbose: true });
    if (ms.length) dests.set(sq, ms.map((m) => m.to));
  }
  return dests;
}

const PROMO_PIECES = ['q', 'r', 'b', 'n'] as const;
const PIECE_NAMES = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight' } as const;

export function Board({ fen, orientation, movable, lastMove, check, shapes, onMove }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const cg = useRef<Api | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const [promotion, setPromotion] = useState<{ from: string; to: string; color: BoardColor } | null>(null);
  // Compara por valor: um array novo a cada render (relógio correndo) reconfiguraria o tabuleiro
  // e perderia a peça selecionada entre os dois cliques.
  const lastMoveKey = lastMove ? lastMove.join('') : '';

  useEffect(() => {
    if (!el.current) return;
    cg.current = Chessground(el.current, {
      animation: { duration: 180 },
      highlight: { lastMove: true, check: true },
      premovable: { enabled: false },
      drawable: { enabled: true, eraseOnClick: true },
      // Em dev aceita eventos sintéticos, para testes automatizados no navegador.
      trustAllEvents: import.meta.env.DEV,
    });
    return () => cg.current?.destroy();
  }, []);

  useEffect(() => {
    const chess = new Chess(fen);
    const turnColor: BoardColor = chess.turn() === 'w' ? 'white' : 'black';
    const canMove = movable === 'both' || movable === turnColor;
    const config: Config = {
      fen,
      orientation,
      turnColor,
      check: check ? turnColor : false,
      lastMove: lastMoveKey ? ([lastMoveKey.slice(0, 2), lastMoveKey.slice(2, 4)] as Key[]) : undefined,
      viewOnly: false,
      movable: {
        free: false,
        color: canMove ? turnColor : undefined,
        dests: canMove ? legalDests(chess) : new Map(),
        showDests: true,
        events: {
          after: (orig, dest) => {
            const piece = chess.get(orig as Square);
            const lastRank = dest[1] === '8' || dest[1] === '1';
            if (piece?.type === 'p' && lastRank) {
              setPromotion({ from: orig, to: dest, color: turnColor });
              return;
            }
            onMoveRef.current?.(`${orig}${dest}`);
          },
        },
      },
    };
    cg.current?.set(config);
  }, [fen, orientation, movable, lastMoveKey, check]);

  useEffect(() => {
    cg.current?.setAutoShapes(shapes ?? []);
  }, [shapes]);

  const choosePromotion = (piece: (typeof PROMO_PIECES)[number] | null) => {
    const p = promotion;
    setPromotion(null);
    if (!p) return;
    if (piece) onMoveRef.current?.(`${p.from}${p.to}${piece}`);
    // Cancelou: volta o tabuleiro para a posição real.
    else cg.current?.set({ fen });
  };

  return (
    <div className="board-wrap">
      <div ref={el} className="board" />
      {promotion && (
        <div className="promotion" onClick={() => choosePromotion(null)}>
          <div className="promotion-pieces cg-wrap" onClick={(e) => e.stopPropagation()}>
            {PROMO_PIECES.map((p) => (
              <button key={p} className="promotion-piece" onClick={() => choosePromotion(p)} title={PIECE_NAMES[p]}>
                <piece className={`${promotion.color} ${PIECE_NAMES[p]}`} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// <piece> é o elemento que o CSS do chessground usa para desenhar as peças.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      piece: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}
