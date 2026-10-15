import type { ReactNode } from 'react';
import { css, cx } from 'styled-system/css';
import { Box, type BoxProps } from 'styled-system/jsx';
import { Card, RadioCardGroup, Switch, Text } from './ui';

/** Bloco de conteúdo padrão das telas (Card do Park UI com respiro interno). */
export function Panel({ children, ...rest }: Card.RootProps) {
  return (
    <Card.Root p={{ base: '4', md: '5' }} gap="4" overflow="visible" {...rest}>
      {children}
    </Card.Root>
  );
}

/** Rótulo pequeno acima de um grupo de opções. */
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <Text textStyle="sm" color="fg.muted" fontWeight="medium">
      {children}
    </Text>
  );
}

export function Muted({ children, ...rest }: BoxProps) {
  return (
    <Box textStyle="sm" color="fg.muted" {...rest}>
      {children}
    </Box>
  );
}

/** Interruptor com título e descrição opcional. */
export function ToggleSwitch({
  checked,
  onChange,
  label,
  hint,
  size = 'md',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  size?: 'sm' | 'md';
}) {
  return (
    <Switch.Root checked={checked} onCheckedChange={(d) => onChange(d.checked)} colorPalette="jade" size={size} alignItems="center">
      <Switch.HiddenInput />
      <Switch.Control />
      <Switch.Label display="flex" flexDirection="column" gap="0">
        <Box as="span" fontWeight="semibold">
          {label}
        </Box>
        {hint && (
          <Box as="span" textStyle="xs" color="fg.muted" fontWeight="normal">
            {hint}
          </Box>
        )}
      </Switch.Label>
    </Switch.Root>
  );
}

export interface Choice<T extends string> {
  value: T;
  label: ReactNode;
  /** Segunda linha (cartões) ou dica no title. */
  hint?: ReactNode;
  title?: string;
}

const shapes = {
  card: css({ flexDirection: 'column', alignItems: 'flex-start', gap: '0.5', px: '3.5', py: '2.5', minW: '24', w: 'auto' }),
  pill: css({ borderRadius: 'full', px: '3.5', py: '2', w: 'auto', justifyContent: 'center' }),
  tile: css({ boxSize: '14', p: '0', justifyContent: 'center' }),
};

/** Grupo de opções exclusivas (radio) no visual do Park UI: cartões, pílulas ou ladrilhos. */
export function ChoiceGroup<T extends string>({
  value,
  onChange,
  options,
  shape = 'card',
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Choice<T>[];
  shape?: keyof typeof shapes;
  label?: ReactNode;
}) {
  return (
    <RadioCardGroup.Root
      value={value}
      onValueChange={(d) => d.value && onChange(d.value as T)}
      colorPalette="jade"
      variant="outline"
      gap="2.5"
    >
      {label && <RadioCardGroup.Label color="fg.muted">{label}</RadioCardGroup.Label>}
      <Box display="flex" flexWrap="wrap" gap="2">
        {options.map((o) => (
          <RadioCardGroup.Item
            key={o.value}
            value={o.value}
            title={o.title}
            className={cx(shapes[shape], css({ _checked: { bg: 'colorPalette.subtle.bg' } }))}
          >
            <RadioCardGroup.ItemText fontWeight="semibold">{o.label}</RadioCardGroup.ItemText>
            {o.hint && shape === 'card' && (
              <Text as="span" textStyle="xs" color="fg.muted" css={{ '[data-state=checked] &': { color: 'colorPalette.subtle.fg' } }}>
                {o.hint}
              </Text>
            )}
            <RadioCardGroup.ItemHiddenInput />
          </RadioCardGroup.Item>
        ))}
      </Box>
    </RadioCardGroup.Root>
  );
}
