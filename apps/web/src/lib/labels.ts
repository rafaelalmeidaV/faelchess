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

/** Selo do rei em xeque-mate (vermelho, com um rei tombado), como no chess.com. Mesma caixa 100x100 do badgeSvg. */
export function mateBadgeSvg(): string {
  return `<g transform="translate(66 -16) scale(0.5)">
    <circle cx="50" cy="50" r="46" fill="#ca3431" stroke="#fff" stroke-width="6"/>
    <g fill="#fff" transform="translate(50 50) rotate(60) scale(0.62) translate(-50 -46)">
      <rect x="47" y="8" width="6" height="19"/><rect x="40" y="14" width="20" height="6"/>
      <path d="M29 40 C29 31 39 27 50 27 C61 27 71 31 71 40 L66 47 L34 47 Z"/>
      <path d="M35 49 L65 49 L71 73 L29 73 Z"/><rect x="24" y="75" width="52" height="9" rx="2"/>
    </g>
  </g>`;
}

/** Selo do rei vencedor (verde, com uma coroa). */
export function winnerBadgeSvg(): string {
  return `<g transform="translate(66 -16) scale(0.5)">
    <circle cx="50" cy="50" r="46" fill="#81b64c" stroke="#fff" stroke-width="6"/>
    <g fill="#fff"><polygon points="24,66 28,34 41,49 50,28 59,49 72,34 76,66"/><rect x="24" y="70" width="52" height="9" rx="2"/></g>
  </g>`;
}
