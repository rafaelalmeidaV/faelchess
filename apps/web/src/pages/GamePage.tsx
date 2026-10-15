import {
  CLASSIFICATIONS,
  CLASSIFICATION_LABELS_PT,
  CLASSIFICATION_SYMBOLS,
  START_FEN,
  formatEval,
  uciLineToSan,
  winPctWhite,
  type Eval,
} from '@faelchess/shared';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Board, type BoardColor } from '../components/Board';
import { EvalGraph } from '../components/EvalGraph';
import { MoveList } from '../components/MoveList';
import { api, type Game } from '../lib/api';
import type { Profile } from '../lib/profile';
import { navigate } from '../lib/router';
import { resultText } from './PlayPage';
import { PHASE_PT, TAG_PT, badgeSvg } from '../lib/labels';

function EvalBar({ value, orientation }: { value?: Eval; orientation: BoardColor }) {
  const white = value ? winPctWhite(value) : 50;
  return (
    <div className={`eval-bar ${orientation === 'black' ? 'flipped' : ''}`} title={formatEval(value)}>
      <div className="eval-white" style={{ height: `${white}%` }} />
      <span className={`eval-label ${white >= 50 ? 'on-white' : 'on-black'}`}>{formatEval(value).replace('+', '')}</span>
    </div>
  );
}

export function GamePage({ id, profile }: { id: string; profile: Profile }) {
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(-1);
  const [orientation, setOrientation] = useState<BoardColor>('white');
  const [showBest, setShowBest] = useState(true);

  const load = useCallback(async () => {
    try {
      const g = await api.getGame(id);
      setGame(g);
      return g;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  }, [id]);

  useEffect(() => {
    void load().then((g) => {
      if (!g) return;
      setOrientation(g.black.userId === profile.userId && g.white.userId !== profile.userId ? 'black' : 'white');
      setIndex(g.moves.length - 1);
    });
  }, [load, profile.userId]);

  // Enquanto o worker não termina, consulta de novo a cada 4 s.
  useEffect(() => {
    if (!game || game.analysisStatus === 'done' || game.analysisStatus === 'failed') return;
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [game, load]);

  const moves = game?.moves ?? [];
  const n = moves.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(-1, i - 1));
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(n - 1, i + 1));
      else if (e.key === 'Home') setIndex(-1);
      else if (e.key === 'End') setIndex(n - 1);
      else if (e.key === 'f') setOrientation((o) => (o === 'white' ? 'black' : 'white'));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [n]);

  const move = index >= 0 ? moves[index] : undefined;
  const startFen = game?.startFen ?? START_FEN;
  const fen = move ? move.fenAfter : startFen;

  const shapes = useMemo<DrawShape[]>(() => {
    if (!move?.classification) return [];
    const out: DrawShape[] = [{ orig: move.uci.slice(2, 4) as Key, customSvg: { html: badgeSvg(move.classification) } }];
    const isTop = ['best', 'great', 'brilliant'].includes(move.classification);
    if (showBest && !isTop && move.bestMove) {
      out.push({ orig: move.bestMove.slice(0, 2) as Key, dest: move.bestMove.slice(2, 4) as Key, brush: 'green' });
    }
    return out;
  }, [move, showBest]);

  if (error) return <div className="card error">{error}</div>;
  if (!game) return <div className="muted">Carregando…</div>;

  const analysis = game.analysis;
  const status = game.analysisStatus;
  const evalNow: Eval | undefined = move?.evalAfter ?? moves[0]?.evalBefore;

  const players = [
    { side: 'white' as const, p: game.white },
    { side: 'black' as const, p: game.black },
  ];

  return (
    <div className="play analysis">
      <div className="board-col">
        <div className="player-bar">
          <span className="player-name">{orientation === 'white' ? game.black.name : game.white.name}</span>
        </div>
        <div className="board-with-bar">
          <EvalBar value={status === 'done' ? evalNow : undefined} orientation={orientation} />
          <Board fen={fen} orientation={orientation} lastMove={move ? [move.uci.slice(0, 2), move.uci.slice(2, 4)] : undefined} shapes={shapes} />
        </div>
        <div className="player-bar">
          <span className="player-name">{orientation === 'white' ? game.white.name : game.black.name}</span>
        </div>
        <div className="nav-buttons">
          <button onClick={() => setIndex(-1)} title="Início (Home)">«</button>
          <button onClick={() => setIndex((i) => Math.max(-1, i - 1))} title="Anterior (←)">‹</button>
          <button onClick={() => setIndex((i) => Math.min(n - 1, i + 1))} title="Próximo (→)">›</button>
          <button onClick={() => setIndex(n - 1)} title="Fim (End)">»</button>
          <button onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))} title="Virar (f)">Virar</button>
        </div>
      </div>

      <aside className="side">
        <div className="card">
          <h3 className="result-line">{resultText(game.result, game.termination, game.white.name, game.black.name)}</h3>
          <div className="muted small">
            {new Date(game.finishedAt).toLocaleString('pt-BR')}
            {game.opening && ` · ${game.opening.eco} ${game.opening.name}`}
          </div>
          {status !== 'done' && (
            <p className={status === 'failed' ? 'error' : 'muted'}>
              {status === 'pending' && 'Na fila de análise… (o worker em casa precisa estar ligado)'}
              {status === 'processing' && 'Analisando com o Stockfish…'}
              {status === 'failed' && `A análise falhou: ${game.analysisError ?? 'erro desconhecido'}`}
            </p>
          )}
        </div>

        {analysis && (
          <div className="card">
            <table className="summary">
              <thead>
                <tr>
                  <th />
                  {players.map(({ side, p }) => (
                    <th key={side}>{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="acc-row">
                  <td>Precisão</td>
                  {players.map(({ side }) => (
                    <td key={side}>{analysis.accuracy[side] ?? '–'}</td>
                  ))}
                </tr>
                {(['opening', 'middlegame', 'endgame'] as const).map((ph) => (
                  <tr key={ph} className="phase-row">
                    <td>{PHASE_PT[ph]}</td>
                    {players.map(({ side }) => (
                      <td key={side}>{analysis.phaseAccuracy?.[ph]?.[side] ?? '–'}</td>
                    ))}
                  </tr>
                ))}
                {CLASSIFICATIONS.map((c) => (
                  <tr key={c}>
                    <td>
                      <span className={`chip cls-bg-${c}`} />
                      {CLASSIFICATION_LABELS_PT[c]}
                    </td>
                    {players.map(({ side }) => (
                      <td key={side}>{analysis.counts[side][c]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {move?.classification && (
          <div className="card move-detail">
            <div className="move-headline">
              <span className={`badge cls-bg-${move.classification}`}>{CLASSIFICATION_SYMBOLS[move.classification] || (move.classification === 'excellent' ? '✓' : '•')}</span>
              <strong>
                {Math.ceil(move.ply / 2)}
                {move.color === 'w' ? '.' : '...'} {move.san}
              </strong>{' '}
              é {CLASSIFICATION_LABELS_PT[move.classification].toLowerCase()}
              <span className="muted"> · {formatEval(move.evalAfter)}</span>
            </div>
            {!['best', 'great', 'brilliant'].includes(move.classification) && move.bestMoveSan && (
              <div>
                Melhor era <strong>{move.bestMoveSan}</strong> ({formatEval(move.bestEval)}):{' '}
                <span className="muted">{uciLineToSan(move.fenBefore, move.bestLine ?? [], 8).join(' ')}</span>
              </div>
            )}
            <div className="muted small">
              Perda de {move.winPctLoss}% de chance de vitória · precisão {move.accuracy}
              {move.phase && ` · ${PHASE_PT[move.phase]}`}
              {move.timeSpentMs !== undefined && ` · ${(move.timeSpentMs / 1000).toFixed(1)} s`}
            </div>
            {move.tags && move.tags.length > 0 && (
              <div className="tags">
                {move.tags.map((t) => (
                  <span key={t} className="tag">
                    {TAG_PT[t] ?? t}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="card">
          {status === 'done' && (
            <EvalGraph
              points={moves.map((m) => ({
                san: m.san,
                label: `${Math.ceil(m.ply / 2)}${m.color === 'w' ? '.' : '...'} ${m.san}`,
                eval: m.evalAfter,
                classification: m.classification,
              }))}
              current={index}
              onSelect={setIndex}
            />
          )}
          <MoveList
            moves={moves}
            current={index}
            onSelect={setIndex}
            startsWithBlack={moves[0]?.color === 'b'}
          />
          <div className="actions">
            <label className="inline small">
              <input type="checkbox" checked={showBest} onChange={(e) => setShowBest(e.target.checked)} /> seta do melhor lance
            </label>
          </div>
          <div className="actions">
            <button onClick={() => navigator.clipboard.writeText(game.pgn)}>Copiar PGN</button>
            {(status === 'done' || status === 'failed') && (
              <button onClick={() => api.reanalyze(game._id).then(load)}>Reanalisar</button>
            )}
            <button
              className="danger"
              onClick={async () => {
                if (!confirm('Apagar esta partida?')) return;
                await api.deleteGame(game._id);
                navigate('/history');
              }}
            >
              Apagar
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
