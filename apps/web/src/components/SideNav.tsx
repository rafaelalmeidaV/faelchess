import { Crown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import type { ReactNode } from 'react';
import { css } from 'styled-system/css';
import { Box, Stack } from 'styled-system/jsx';
import { Button, IconButton } from './ui';

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
}

/** Larguras do menu lateral (também usadas no cálculo do tamanho do tabuleiro). */
export const SIDENAV_W = { open: '220px', closed: '64px' } as const;

const item = css({ justifyContent: 'flex-start', w: 'full', gap: '3', px: '3' });

/**
 * Menu lateral das telas de jogo no desktop: substitui o cabeçalho para o tabuleiro ganhar altura.
 * Encolhido mostra só os ícones; expandido, ícone e nome.
 */
export function SideNav({ items, open, onToggle }: { items: NavItem[]; open: boolean; onToggle: () => void }) {
  return (
    <Box
      as="aside"
      hideBelow="lg"
      position="fixed"
      top="0"
      left="0"
      bottom="0"
      zIndex="sticky"
      bg="gray.2"
      borderRightWidth="1px"
      transition="width 0.18s ease"
      overflow="hidden"
      style={{ width: open ? SIDENAV_W.open : SIDENAV_W.closed }}
    >
      <Stack h="full" gap="1" p="2" justify="space-between">
        <Stack gap="1">
          <a href="#/" className={css({ display: 'flex', alignItems: 'center', gap: '2.5', h: '12', px: '3', mb: '2', fontWeight: 'bold', textStyle: 'lg', letterSpacing: 'tight', whiteSpace: 'nowrap' })} title="faelchess">
            <Box color="jade.9" display="flex" flexShrink="0">
              <Crown size={20} />
            </Box>
            {open && 'faelchess'}
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
              <a href={it.href} aria-current={it.active ? 'page' : undefined} title={open ? undefined : it.label}>
                <Box display="flex" flexShrink="0">
                  {it.icon}
                </Box>
                {open && (
                  <Box as="span" truncate>
                    {it.label}
                  </Box>
                )}
              </a>
            </Button>
          ))}
        </Stack>
        <IconButton
          variant="plain"
          color="fg.muted"
          aria-label={open ? 'Encolher menu' : 'Expandir menu'}
          title={open ? 'Encolher menu' : 'Expandir menu'}
          onClick={onToggle}
          alignSelf={open ? 'flex-end' : 'center'}
        >
          {open ? <PanelLeftClose /> : <PanelLeftOpen />}
        </IconButton>
      </Stack>
    </Box>
  );
}
