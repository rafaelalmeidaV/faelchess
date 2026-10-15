import { useEffect, useState } from 'react';
import { GamePage } from './pages/GamePage';
import { HistoryPage } from './pages/HistoryPage';
import { HomePage } from './pages/HomePage';
import { OnlinePage } from './pages/OnlinePage';
import { PlayPage } from './pages/PlayPage';
import { SettingsPage } from './pages/SettingsPage';
import { getProfile, type Profile } from './lib/profile';
import { useRoute } from './lib/router';
import { flushUnsent, unsentCount } from './lib/unsent';

export function App() {
  const route = useRoute();
  const [profile, setProfile] = useState<Profile | null>(getProfile);
  const [notice, setNotice] = useState('');

  // Partidas que não conseguiram ser enviadas antes (API fora do ar) vão agora.
  useEffect(() => {
    if (!unsentCount()) return;
    flushUnsent().then((n) => n && setNotice(`${n} partida(s) guardada(s) foram enviadas para análise.`));
  }, []);

  const [section, id] = route.path;
  let page: React.ReactNode;
  if (!profile) page = <SettingsPage profile={null} onSaved={setProfile} />;
  else if (section === 'play') page = <PlayPage key={window.location.hash} route={route} profile={profile} />;
  else if (section === 'game' && id) page = <GamePage key={id} id={id} profile={profile} />;
  else if (section === 'online' && id) page = <OnlinePage key={id} gameId={id} profile={profile} />;
  else if (section === 'history') page = <HistoryPage profile={profile} />;
  else if (section === 'settings') page = <SettingsPage profile={profile} onSaved={setProfile} />;
  else page = <HomePage profile={profile} />;

  return (
    <>
      <header className="topbar">
        <a href="#/" className="logo">faelchess</a>
        <nav>
          <a href="#/" className={!section ? 'active' : ''}>Jogar</a>
          <a href="#/history" className={section === 'history' || section === 'game' ? 'active' : ''}>Partidas</a>
          <a href="#/settings" className={section === 'settings' ? 'active' : ''}>{profile?.name ?? 'Perfil'}</a>
        </nav>
      </header>
      {notice && (
        <div className="notice" onClick={() => setNotice('')}>
          {notice}
        </div>
      )}
      <main>{page}</main>
    </>
  );
}
