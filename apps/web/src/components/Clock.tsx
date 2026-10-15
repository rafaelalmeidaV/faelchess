export function formatClock(ms: number): string {
  const total = Math.max(0, ms);
  const s = Math.floor(total / 1000);
  const m = Math.floor(s / 60);
  const rest = s % 60;
  // Abaixo de 10 s mostra décimos, como no Lichess.
  if (total < 10_000) return `0:0${rest}.${Math.floor((total % 1000) / 100)}`;
  return `${m}:${String(rest).padStart(2, '0')}`;
}

export function Clock({ ms, active, name }: { ms?: number; active: boolean; name: string }) {
  return (
    <div className={`player-bar${active ? ' active' : ''}`}>
      <span className="player-name">{name}</span>
      {ms !== undefined && (
        <span className={`clock${active ? ' running' : ''}${ms < 20_000 ? ' low' : ''}`}>{formatClock(ms)}</span>
      )}
    </div>
  );
}
