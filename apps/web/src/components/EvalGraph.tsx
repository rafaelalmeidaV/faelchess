import { CLASSIFICATION_LABELS_PT, formatEval, winPctWhite, type Classification, type Eval } from '@faelchess/shared';
import { useRef, useState } from 'react';

export interface GraphPoint {
  san: string;
  label: string;
  eval?: Eval;
  classification?: Classification;
}

interface Props {
  /** Um ponto por lance (avaliação depois do lance). */
  points: GraphPoint[];
  current: number;
  onSelect: (index: number) => void;
}

const W = 600;
const H = 120;
const MARKED: Classification[] = ['brilliant', 'great', 'mistake', 'blunder'];

/**
 * Win% das brancas ao longo da partida (área clara = brancas melhor).
 * Hover mostra lance e avaliação; clique leva ao lance.
 */
export function EvalGraph({ points, current, onSelect }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  if (points.length === 0) return null;

  const n = points.length;
  const x = (i: number) => (n === 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (e?: Eval) => H - ((e ? winPctWhite(e) : 50) / 100) * H;
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.eval).toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;

  const indexAt = (clientX: number) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const rel = (clientX - rect.left) / rect.width;
    return Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1))));
  };

  const shown = hover ?? current;
  const hp = hover !== null ? points[hover] : null;

  return (
    <div className="eval-graph">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Gráfico da vantagem ao longo da partida"
        onMouseMove={(e) => setHover(indexAt(e.clientX))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => onSelect(indexAt(e.clientX))}
      >
        <rect x="0" y="0" width={W} height={H} className="eg-bg" />
        <path d={area} className="eg-area" />
        <line x1="0" x2={W} y1={H / 2} y2={H / 2} className="eg-mid" />
        <path d={line} className="eg-line" vectorEffect="non-scaling-stroke" />
        {shown >= 0 && shown < n && (
          <line x1={x(shown)} x2={x(shown)} y1="0" y2={H} className="eg-cursor" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {/* Marcadores em HTML para continuarem redondos com o SVG esticado. */}
      {points.map((p, i) =>
        p.classification && MARKED.includes(p.classification) ? (
          <span
            key={i}
            className={`eg-dot cls-bg-${p.classification}`}
            style={{ left: `${(x(i) / W) * 100}%`, top: `${(y(p.eval) / H) * 100}%` }}
          />
        ) : null,
      )}
      {hp && hover !== null && (
        <div className="eg-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <strong>{hp.label}</strong> {formatEval(hp.eval)}
          {hp.classification && (
            <>
              {' · '}
              <span className={`chip cls-bg-${hp.classification}`} />
              {CLASSIFICATION_LABELS_PT[hp.classification]}
            </>
          )}
        </div>
      )}
    </div>
  );
}
