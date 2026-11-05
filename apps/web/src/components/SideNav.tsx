import { Crown } from 'lucide-react';
import type { ReactNode } from 'react';
import { css } from 'styled-system/css';
import { Box, Stack } from 'styled-system/jsx';
import { Button } from './ui';

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
}

const item = css({ justifyContent: 'flex-start', w: 'full', gap: '3', px: '3' });

/**
 * Menu lateral das telas de jogo no desktop: substitui o cabeçalho para o tabuleiro ganhar altura.
 * Sempre aberto (ícone e nome): a largura de 220px é a mesma de --sidenav-w no App.
 */
export function SideNav({ items }: { items: NavItem[] }) {
  return (
    <Box
      as="aside"
      className="glass-surface"
      hideBelow="lg"
      position="fixed"
      top="0"
      left="0"
      bottom="0"
      w="220px"
      zIndex="sticky"
      bg="gray.2"
      borderRightWidth="1px"
      overflow="hidden"
    >
      <Stack h="full" gap="1" p="2">
        <a href="#/" className={css({ display: 'flex', alignItems: 'center', gap: '2.5', h: '12', px: '3', mb: '2', fontWeight: 'bold', textStyle: 'lg', letterSpacing: 'tight', whiteSpace: 'nowrap' })} title="faelchess">
          <Box color="jade.9" display="flex" flexShrink="0">
            <Crown size={20} />
          </Box>
          faelchess
        </a>
        {items.map((it) => (
          <Button
            key={it.href}
            asChild
            variant={it.active ? 'subtle' : 'plain'}
            size="md"
            color={it.active ? 'fg.default' : 'fg.muted'}
            className={item}
          >
            <a href={it.href} aria-current={it.active ? 'page' : undefined}>
              <Box display="flex" flexShrink="0">
                {it.icon}
              </Box>
              <Box as="span" truncate>
                {it.label}
              </Box>
            </a>
          </Button>
        ))}
      </Stack>
    </Box>
  );
}
