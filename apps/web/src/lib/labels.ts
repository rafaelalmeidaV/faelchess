import { CLASSIFICATION_SYMBOLS, type Classification, type MoveTag } from '@faelchess/shared';

export const CLS_COLORS: Record<Classification, string> = {
  brilliant: '#26c2a3',
  great: '#5c8bb0',
  best: '#81b64c',
  excellent: '#81b64c',
  good: '#95b776',
  inaccuracy: '#f7c045',
  mistake: '#e58f2a',
  blunder: '#ca3431',
};

export const TAG_PT: Record<MoveTag, string> = {
  hung_piece: 'perdeu material logo em seguida',
  allowed_fork: 'permitiu um garfo',
  allowed_mate: 'permitiu mate forçado',
  missed_mate: 'deixou passar um mate',
  missed_fork: 'deixou passar um garfo',
  missed_material: 'deixou de ganhar material',
  sacrifice: 'sacrifício',
  recapture: 'recaptura',
  only_move: 'único lance bom',
  check: 'xeque',
};

export const PHASE_PT = { opening: 'Abertura', middlegame: 'Meio-jogo', endgame: 'Final' } as const;

/** Ícone da classificação no canto superior direito da casa de destino (casa = 100x100, origem no canto). */
export function badgeSvg(cls: Classification): string {
  const symbol = CLASSIFICATION_SYMBOLS[cls] || (cls === 'excellent' ? '✓' : '•');
  return `<g transform="translate(66 -16) scale(0.5)">
    <circle cx="50" cy="50" r="46" fill="${CLS_COLORS[cls]}" stroke="#fff" stroke-width="6"/>
    <text x="50" y="66" font-size="${symbol.length > 1 ? 44 : 52}" font-weight="700" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif">${symbol}</text>
  </g>`;
}
