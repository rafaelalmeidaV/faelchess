import { useState } from 'react';
import { BOT_LEVELS } from '../lib/engine';
import { navigate } from '../lib/router';
import type { Profile } from '../lib/profile';
import { createOnlineGame } from '../lib/online';

export const TIME_CONTROLS = [
  { id: 'none', label: 'Sem relógio' },
  { id: '180+2', label: '3+2 blitz' },
  { id: '300+3', label: '5+3 blitz' },
  { id: '600+0', label: '10+0 rápida' },
  { id: '600+5', label: '10+5 rápida' },
  { id: '900+10', label: '15+10 rápida' },
  { id: '1800+0', label: '30+0 clássica' },
];

/** "600+5" -> { baseMs, incrementMs } (segundos na URL). */
export function parseTimeControl(id: string | null) {
  if (!id || id === 'none') return undefined;
  const [base, inc] = id.split('+').map(Number);
  if (!Number.isFinite(base) || base <= 0) return undefined;
  return { baseMs: base * 1000, incrementMs: (inc || 0) * 1000 };
}

export function HomePage({ profile }: { profile: Profile }) {
  const [elo, setElo] = useState(() => Number(localStorage.getItem('faelchess:lastElo') ?? 1200));
  const [botColor, setBotColor] = useState<'w' | 'b' | 'random'>('w');
  const [botTc, setBotTc] = useState('none');
  const [localTc, setLocalTc] = useState('600+5');
  const [mySide, setMySide] = useState<'w' | 'b' | 'none'>('w');
  const [guest, setGuest] = useState('Convidado');
  const [onlineTc, setOnlineTc] = useState('600+5');
  const [onlineColor, setOnlineColor] = useState<'w' | 'b' | 'random'>('random');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const playBot = () => {
    try {
      localStorage.setItem('faelchess:lastElo', String(elo));
    } catch {
      /* ok */
    }
    const color = botColor === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : botColor;
    navigate(`/play/bot?elo=${elo}&color=${color}&tc=${botTc}`);
  };

  const playLocal = () => {
    navigate(`/play/local?me=${mySide}&guest=${encodeURIComponent(guest)}&tc=${localTc}`);
  };

  const playOnline = async () => {
    setCreating(true);
    setError('');
    try {
      const { gameId } = await createOnlineGame({ timeControl: parseTimeControl(onlineTc), color: onlineColor, profile });
      navigate(`/online/${gameId}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="home">
      <section className="card">
        <h2>Contra o bot</h2>
        <p className="muted small">O Stockfish roda no seu navegador. Toda partida vai para análise.</p>
        <label>
          Nível
          <select value={elo} onChange={(e) => setElo(Number(e.target.value))}>
            {BOT_LEVELS.map((l) => (
              <option key={l.elo} value={l.elo}>
                {l.elo} · {l.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Suas peças
          <select value={botColor} onChange={(e) => setBotColor(e.target.value as 'w')}>
            <option value="w">Brancas</option>
            <option value="b">Pretas</option>
            <option value="random">Sorteio</option>
          </select>
        </label>
        <label>
          Ritmo
          <select value={botTc} onChange={(e) => setBotTc(e.target.value)}>
            {TIME_CONTROLS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" onClick={playBot}>
          Jogar
        </button>
      </section>

      <section className="card">
        <h2>Local</h2>
        <p className="muted small">Duas pessoas no mesmo aparelho.</p>
        <label>
          Você ({profile.name}) joga de
          <select value={mySide} onChange={(e) => setMySide(e.target.value as 'w')}>
            <option value="w">Brancas</option>
            <option value="b">Pretas</option>
            <option value="none">Nenhum (só registrar)</option>
          </select>
        </label>
        <label>
          Adversário
          <input value={guest} onChange={(e) => setGuest(e.target.value)} maxLength={40} />
        </label>
        <label>
          Ritmo
          <select value={localTc} onChange={(e) => setLocalTc(e.target.value)}>
            {TIME_CONTROLS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" onClick={playLocal}>
          Começar
        </button>
      </section>

      <section className="card">
        <h2>Online</h2>
        <p className="muted small">Cria um link de convite para jogar com alguém.</p>
        <label>
          Suas peças
          <select value={onlineColor} onChange={(e) => setOnlineColor(e.target.value as 'w')}>
            <option value="random">Sorteio</option>
            <option value="w">Brancas</option>
            <option value="b">Pretas</option>
          </select>
        </label>
        <label>
          Ritmo
          <select value={onlineTc} onChange={(e) => setOnlineTc(e.target.value)}>
            {TIME_CONTROLS.filter((t) => t.id !== 'none').map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" onClick={playOnline} disabled={creating}>
          {creating ? 'Criando…' : 'Criar convite'}
        </button>
        {error && <p className="error small">{error}</p>}
      </section>
    </div>
  );
}
