import { Crown, History, Puzzle, Swords, UserRound } from 'lucide-react';
import { useEffect, useState } from 'react';
import { css } from 'styled-system/css';
import { Box, Container, HStack } from 'styled-system/jsx';
import { hstack } from 'styled-system/patterns';
import { SideNav, type NavItem } from './components/SideNav';
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

const SIDENAV_KEY = 'faelchess:sidenav';

/**
 * Variáveis de layout: altura do cabeçalho e largura do menu lateral. O tabuleiro (GameLayout)
 * usa as duas para crescer no espaço que sobra. Nas telas de jogo, no desktop, o cabeçalho vira menu lateral.
 */
const LAYOUT = {
  normal: css({ '--header-h': '57px', '--sidenav-w': '0px' }),
  // Valores literais: o Panda gera o CSS na compilação e não enxerga constantes importadas (SIDENAV_W).
  gameOpen: css({ '--header-h': { base: '57px', lg: '0px' }, '--sidenav-w': { base: '0px', lg: '220px' } }),
  gameClosed: css({ '--header-h': { base: '57px', lg: '0px' }, '--sidenav-w': { base: '0px', lg: '64px' } }),
};

export function App() {
  const route = useRoute();
  const [sideOpen, setSideOpen] = useState(() => {
    try {
      return localStorage.getItem(SIDENAV_KEY) === 'open';
    } catch {
      return false;
    }
  });
  const toggleSide = () =>
    setSideOpen((o) => {
      try {
        localStorage.setItem(SIDENAV_KEY, o ? 'closed' : 'open');
      } catch {
        /* ok */
      }
      return !o;
    });
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

  // Telas de tabuleiro: partida (bot/local), online, problemas e análise.
  const gameMode = !!profile && (section === 'play' || section === 'online' || section === 'puzzles' || (section === 'game' && !!id));
  const navItems: NavItem[] = [
    { href: '#/', label: 'Jogar', icon: <Swords size={20} />, active: !section || section === 'play' || section === 'online' },
    { href: '#/puzzles', label: 'Problemas', icon: <Puzzle size={20} />, active: section === 'puzzles' },
    { href: '#/history', label: 'Partidas', icon: <History size={20} />, active: section === 'history' || section === 'game' },
    { href: '#/settings', label: profile?.name ?? 'Perfil', icon: <UserRound size={20} />, active: section === 'settings' },
  ];

  return (
    <div className={gameMode ? (sideOpen ? LAYOUT.gameOpen : LAYOUT.gameClosed) : LAYOUT.normal}>
      {gameMode && <SideNav items={navItems} open={sideOpen} onToggle={toggleSide} />}
      <Box as="header" borderBottomWidth="1px" bg="gray.2" position="sticky" top="0" zIndex="sticky" hideFrom={gameMode ? 'lg' : undefined}>
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
      <Box style={{ marginLeft: 'var(--sidenav-w)' }} transition="margin-left 0.18s ease">
        <Container as="main" maxW="8xl" pt={{ base: '3', md: '4' }} pb={{ base: '6', md: '8' }} px={{ base: '3', md: '6' }}>
          {page}
        </Container>
      </Box>
      <Toaster />
    </div>
  );
}
