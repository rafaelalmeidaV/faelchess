import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { css, cx } from 'styled-system/css';
import { Box, Flex, Grid, Stack } from 'styled-system/jsx';
import {
  BOARD_PRESETS,
  DEFAULT_APPEARANCE,
  PIECE_SETS,
  applyAppearance,
  boardColors,
  loadAppearance,
  saveAppearance,
  type Appearance,
} from '../lib/appearance';
import { Board } from './Board';
import { FieldLabel, Muted, Panel } from './kit';
import { Button, Checkbox, Heading, Link } from './ui';

/** Posição de exemplo da prévia: depois de 1.e4 e5 2.Nf3 Nc6 3.Bb5 (Espanhola). */
const PREVIEW_FEN = 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3';

const choice = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '2',
  px: '3',
  py: '2',
  borderRadius: 'l2',
  borderWidth: '1px',
  bg: 'gray.surface.bg',
  textStyle: 'sm',
  fontWeight: 'semibold',
  cursor: 'pointer',
  _hover: { borderColor: 'gray.7' },
  '&[aria-pressed=true]': { borderColor: 'jade.9', boxShadow: '0 0 0 1px var(--colors-jade-9)' },
});

function Swatch({ light, dark }: { light: string; dark: string }) {
  return (
    <Box display="inline-grid" gridTemplateColumns="9px 9px" gridTemplateRows="9px 9px" borderRadius="xs" overflow="hidden" aria-hidden>
      <span style={{ background: light }} />
      <span style={{ background: dark }} />
      <span style={{ background: dark }} />
      <span style={{ background: light }} />
    </Box>
  );
}

function ColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className={css({ display: 'inline-flex', alignItems: 'center', gap: '2', textStyle: 'sm', color: 'fg.muted', cursor: 'pointer' })}>
      {label}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={css({ w: '9', h: '7', p: '0', borderWidth: '1px', borderRadius: 'l2', bg: 'transparent', cursor: 'pointer' })}
      />
    </label>
  );
}

function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <Checkbox.Root size="sm" colorPalette="jade" checked={checked} onCheckedChange={(d) => onChange(d.checked === true)}>
      <Checkbox.HiddenInput />
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
      <Checkbox.Label textStyle="sm">{children}</Checkbox.Label>
    </Checkbox.Root>
  );
}

export function AppearanceSettings() {
  const [a, setA] = useState<Appearance>(loadAppearance);

  // Toda mudança vale na hora e fica salva.
  useEffect(() => {
    applyAppearance(a);
    saveAppearance(a);
  }, [a]);

  const set = (patch: Partial<Appearance>) => setA((prev) => ({ ...prev, ...patch }));
  const colors = boardColors(a);

  return (
    <Panel gap="5">
      <Stack gap="1">
        <Heading as="h2" textStyle="lg">
          Aparência
        </Heading>
        <Muted>Vale para jogo, análise, online e modo treino.</Muted>
      </Stack>

      <Grid gridTemplateColumns={{ base: '1fr', md: 'minmax(220px, 320px) 1fr' }} gap="7" alignItems="start">
        <Box css={{ '--board-size': 'min(320px, calc(100vw - 72px))' }} mx={{ base: 'auto', md: '0' }}>
          <Board fen={PREVIEW_FEN} orientation="white" lastMove={['f1', 'b5']} />
        </Box>

        <Stack gap="5" minW="0">
          <Stack gap="2.5">
            <FieldLabel>Tabuleiro</FieldLabel>
            <Flex gap="2" flexWrap="wrap">
              {BOARD_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={choice}
                  onClick={() => set({ board: p.id, highlight: p.highlight })}
                  aria-pressed={a.board === p.id}
                >
                  <Swatch light={p.light} dark={p.dark} />
                  {p.name}
                </button>
              ))}
              <button
                type="button"
                className={choice}
                onClick={() => set({ board: 'custom', light: colors.light, dark: colors.dark })}
                aria-pressed={a.board === 'custom'}
              >
                <Swatch light={a.light} dark={a.dark} />
                Personalizado
              </button>
            </Flex>
          </Stack>

          <Flex gap="6" flexWrap="wrap">
            <ColorInput label="Casas claras" value={colors.light} onChange={(v) => set({ board: 'custom', light: v, dark: colors.dark })} />
            <ColorInput label="Casas escuras" value={colors.dark} onChange={(v) => set({ board: 'custom', dark: v, light: colors.light })} />
            <ColorInput label="Destaque do lance" value={a.highlight} onChange={(v) => set({ highlight: v })} />
          </Flex>

          <Flex gap="6" flexWrap="wrap">
            <Check checked={a.coords} onChange={(v) => set({ coords: v })}>
              Coordenadas
            </Check>
            <Check checked={a.dests} onChange={(v) => set({ dests: v })}>
              Pontos dos lances legais
            </Check>
          </Flex>

          <Stack gap="2.5">
            <FieldLabel>Peças</FieldLabel>
            <Grid gridTemplateColumns="repeat(auto-fill, minmax(104px, 1fr))" gap="2">
              {PIECE_SETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={cx(
                    choice,
                    css({ display: 'grid', gridTemplateColumns: '1fr 1fr', justifyItems: 'center', gap: '0.5', p: '1.5', borderColor: 'transparent' }),
                  )}
                  onClick={() => set({ pieces: p.id })}
                  aria-pressed={a.pieces === p.id}
                  title={`${p.name} · ${p.license}`}
                  style={{ background: colors.dark }}
                >
                  <img src={`/pieces/${p.id}/wN.svg`} alt="" loading="lazy" width={40} height={40} />
                  <img src={`/pieces/${p.id}/bQ.svg`} alt="" loading="lazy" width={40} height={40} />
                  <Box as="span" gridColumn="1 / -1" textStyle="xs" color="white" textShadow="0 1px 2px rgba(0,0,0,.7)">
                    {p.name}
                  </Box>
                </button>
              ))}
            </Grid>
            <Muted textStyle="xs">
              Peças do Lichess; créditos e licenças em{' '}
              <Link href="/pieces/CREDITS.md" target="_blank" rel="noreferrer" colorPalette="jade">
                CREDITS.md
              </Link>
              .
            </Muted>
          </Stack>

          <Box>
            <Button type="button" variant="surface" size="sm" onClick={() => setA({ ...DEFAULT_APPEARANCE })}>
              <RotateCcw /> Restaurar padrão
            </Button>
          </Box>
        </Stack>
      </Grid>
    </Panel>
  );
}
