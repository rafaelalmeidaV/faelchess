import { useEffect, useState } from 'react';
import { api, type GameSummary } from '../lib/api';
import type { Profile } from '../lib/profile';
import { navigate } from '../lib/router';

const STATUS_PT = { pending: 'na fila', processing: 'analisando', done: 'analisada', failed: 'falhou' } as const;
const PAGE = 30;

function outcome(g: GameSummary, userId: string): { text: string; cls: string } {
  if (g.result === '1/2-1/2') return { text: '½', cls: 'draw' };
  if (g.result === '*') return { text: '*', cls: 'draw' };
  const meWhite = g.white.userId === userId;
  const meBlack = g.black.userId === userId && !meWhite;
  if (!meWhite && !meBlack) return { text: g.result, cls: 'draw' };
  const won = (g.result === '1-0') === meWhite;
  return { text: won ? 'Vitória' : 'Derrota', cls: won ? 'win' : 'loss' };
}

export function HistoryPage({ profile }: { profile: Profile }) {
  const [items, setItems] = useState<GameSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [skip, setSkip] = useState(0);
  const [error, setError] = useState('');
  const [mine, setMine] = useState(true);

  useEffect(() => {
    api
      .listGames({ userId: mine ? profile.userId : undefined, limit: PAGE, skip })
      .then((r) => {
        setItems(r.items);
        setTotal(r.total);
      })
      .catch((e) => setError((e as Error).message));
  }, [skip, mine, profile.userId]);

  if (error) return <div className="card error">{error}</div>;

  return (
    <div className="card history">
      <div className="history-head">
        <h2>Partidas ({total})</h2>
        <label className="inline small">
          <input type="checkbox" checked={mine} onChange={(e) => { setSkip(0); setMine(e.target.checked); }} /> só as minhas
        </label>
      </div>
      <div className="table-scroll">
        <table className="games">
          <thead>
            <tr>
              <th>Data</th>
              <th>Brancas</th>
              <th>Pretas</th>
              <th>Resultado</th>
              <th>Abertura</th>
              <th>Lances</th>
              <th>Precisão</th>
              <th>Análise</th>
            </tr>
          </thead>
          <tbody>
            {items.map((g) => {
              const o = outcome(g, profile.userId);
              const side = g.white.userId === profile.userId ? 'white' : 'black';
              const acc = g.analysis?.accuracy?.[side];
              return (
                <tr key={g._id} onClick={() => navigate(`/game/${g._id}`)}>
                  <td>{new Date(g.finishedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{g.white.name}</td>
                  <td>{g.black.name}</td>
                  <td className={o.cls}>{o.text}</td>
                  <td className="muted">{g.opening?.name ?? '–'}</td>
                  <td>{Math.ceil(g.plyCount / 2)}</td>
                  <td>{acc ?? '–'}</td>
                  <td className="muted">{STATUS_PT[g.analysisStatus]}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {items.length === 0 && <p className="muted">Nenhuma partida ainda.</p>}
      <div className="actions">
        <button disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - PAGE))}>← Mais novas</button>
        <button disabled={skip + PAGE >= total} onClick={() => setSkip(skip + PAGE)}>Mais antigas →</button>
      </div>
    </div>
  );
}
