import { Crown, History, Puzzle, Swords, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Box, Container, HStack } from 'styled-system/jsx';
import { hstack } from 'styled-system/patterns';
import { Alert, Button, Toaster } from './components/ui';
import { GamePage } from './pages/GamePage';
import { HistoryPage } from './pages/HistoryPage';
import { HomePage } from './pages/HomePage';
import { OnlinePage } from './pages/OnlinePage';
import { PlayPage } from './pages/PlayPage';
import { PuzzlePage } from './pages/PuzzlePage';
import { SettingsPage } from './pages/SettingsPage';
import { getProfile, type Profile } from './lib/profile';
import { useRoute } from './lib/router';
import { flushUnsent, unsentCount } from './lib/unsent';

function NavLink({ href, active, icon, children }: { href: string; active: boolean; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Button asChild variant={active ? 'subtle' : 'plain'} size="sm" color={active ? 'fg.default' : 'fg.muted'}>
      <a href={href} aria-current={active ? 'page' : undefined}>
        {icon}
        <Box as="span" display={{ base: 'none', sm: 'inline' }}>
          {children}
        </Box>
      </a>
    </Button>
  );
}

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
  else if (section === 'puzzles') page = <PuzzlePage key={id ?? 'next'} profile={profile} route={route} />;
  else if (section === 'history') page = <HistoryPage profile={profile} />;
  else if (section === 'settings') page = <SettingsPage profile={profile} onSaved={setProfile} />;
  else page = <HomePage profile={profile} />;

  return (
    <>
      <Box as="header" borderBottomWidth="1px" bg="gray.2" position="sticky" top="0" zIndex="sticky">
        <Container maxW="8xl" px={{ base: '3', md: '6' }}>
          <HStack h="14" justify="space-between">
            <a href="#/" className={hstack({ gap: '2', fontWeight: 'bold', textStyle: 'lg', letterSpacing: 'tight' })}>
              <Box color="jade.9" display="flex">
                <Crown size={20} />
              </Box>
              faelchess
            </a>
            <HStack as="nav" gap="1">
              <NavLink href="#/" active={!section || section === 'play' || section === 'online'} icon={<Swords />}>
                Jogar
              </NavLink>
              <NavLink href="#/puzzles" active={section === 'puzzles'} icon={<Puzzle />}>
                Problemas
              </NavLink>
              <NavLink href="#/history" active={section === 'history' || section === 'game'} icon={<History />}>
                Partidas
              </NavLink>
              <NavLink href="#/settings" active={section === 'settings'} icon={<UserRound />}>
                {profile?.name ?? 'Perfil'}
              </NavLink>
            </HStack>
          </HStack>
        </Container>
      </Box>
      {notice && (
        <Container maxW="8xl" pt="4" px={{ base: '3', md: '6' }}>
          <Alert.Root colorPalette="jade" variant="subtle" onClick={() => setNotice('')} cursor="pointer">
            <Alert.Content>
              <Alert.Description>{notice}</Alert.Description>
            </Alert.Content>
          </Alert.Root>
        </Container>
      )}
      <Container as="main" maxW="8xl" pt={{ base: '3', md: '4' }} pb={{ base: '6', md: '8' }} px={{ base: '3', md: '6' }}>
        {page}
      </Container>
      <Toaster />
    </>
  );
}
