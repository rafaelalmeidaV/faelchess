import { Star } from 'lucide-react';
import { getAccessKey } from '../lib/profile';
import { IconButton } from './ui';

/** Estrela de favorito da análise de uma partida. Sem a chave de acesso a API recusa, então fica desligada. */
export function FavoriteStar({
  active,
  onToggle,
  size = 'sm',
}: {
  active: boolean;
  onToggle: () => void;
  size?: 'xs' | 'sm' | 'md';
}) {
  const hasKey = !!getAccessKey();
  const label = !hasKey ? 'Salve a chave de acesso para favoritar' : active ? 'Tirar dos favoritos' : 'Favoritar esta análise';
  return (
    <IconButton
      variant="plain"
      size={size}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={!hasKey}
      // O tema não gera o token amber: usa o mesmo amarelo da barra de precisão.
      color={active ? '#e8b33a' : 'fg.subtle'}
      _hover={{ color: '#e8b33a' }}
      onClick={(e) => {
        // Dentro de uma linha clicável da lista: não abre a partida.
        e.stopPropagation();
        onToggle();
      }}
    >
      <Star fill={active ? 'currentColor' : 'none'} />
    </IconButton>
  );
}
