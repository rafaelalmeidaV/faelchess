/**
 * Aparência do tabuleiro (cores, peças, coordenadas), guardada no navegador.
 * Tudo vira um único <style> global gerado a partir das escolhas: vale para jogo, análise, online e treino.
 */

export interface Appearance {
  /** Id de um tema pronto, ou 'custom' para usar `light`/`dark`. */
  board: string;
  light: string;
  dark: string;
  /** Cor de destaque do último lance e da casa selecionada. */
  highlight: string;
  pieces: string;
  coords: boolean;
  /** Pontinhos dos lances legais ao selecionar uma peça. */
  dests: boolean;
  /** Sons de lance, captura, xeque e fim de jogo. */
  sound: boolean;
}

export const BOARD_PRESETS: { id: string; name: string; light: string; dark: string; highlight: string }[] = [
  { id: 'brown', name: 'Marrom', light: '#f0d9b5', dark: '#b58863', highlight: '#9bc700' },
  { id: 'green', name: 'Verde', light: '#ebecd0', dark: '#739552', highlight: '#f5f682' },
  { id: 'blue', name: 'Azul', light: '#dee3e6', dark: '#8ca2ad', highlight: '#9bc700' },
  { id: 'gray', name: 'Cinza', light: '#e3e3e3', dark: '#a0a0a0', highlight: '#7fb2e5' },
  { id: 'purple', name: 'Roxo', light: '#e9e1f1', dark: '#9479b5', highlight: '#f2d76b' },
];

export const PIECE_SETS: { id: string; name: string; license: string }[] = [
  { id: 'cburnett', name: 'CBurnett', license: 'GPLv2+' },
  { id: 'merida', name: 'Merida', license: 'GPLv2+' },
  { id: 'california', name: 'California', license: 'CC BY-NC-SA 4.0' },
  { id: 'staunty', name: 'Staunty', license: 'CC BY-NC-SA 4.0' },
  { id: 'maestro', name: 'Maestro', license: 'CC BY-NC-SA 4.0' },
  { id: 'cardinal', name: 'Cardinal', license: 'CC BY-NC-SA 4.0' },
  { id: 'tatiana', name: 'Tatiana', license: 'CC BY-NC-SA 4.0' },
  { id: 'icpieces', name: 'ICPieces', license: 'CC BY-NC-SA 4.0' },
  { id: 'chessnut', name: 'Chessnut', license: 'Apache 2.0' },
  { id: 'fantasy', name: 'Fantasy', license: 'MIT' },
  { id: 'celtic', name: 'Celtic', license: 'MIT' },
  { id: 'spatial', name: 'Spatial', license: 'MIT' },
];

export const DEFAULT_APPEARANCE: Appearance = {
  board: 'brown',
  light: '#f0d9b5',
  dark: '#b58863',
  highlight: '#9bc700',
  pieces: 'cburnett',
  coords: true,
  dests: true,
  sound: true,
};

const KEY = 'faelchess:appearance';
const STYLE_ID = 'faelchess-appearance';
const HEX = /^#[0-9a-f]{6}$/i;

export function loadAppearance(): Appearance {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Appearance>;
    const a = { ...DEFAULT_APPEARANCE, ...saved };
    // Valores corrompidos ou de versões antigas voltam para o padrão.
    if (!PIECE_SETS.some((p) => p.id === a.pieces)) a.pieces = DEFAULT_APPEARANCE.pieces;
    if (a.board !== 'custom' && !BOARD_PRESETS.some((b) => b.id === a.board)) a.board = DEFAULT_APPEARANCE.board;
    for (const k of ['light', 'dark', 'highlight'] as const) if (!HEX.test(a[k])) a[k] = DEFAULT_APPEARANCE[k];
    return a;
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}

export function saveAppearance(a: Appearance) {
  try {
    localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    /* sem storage: vale só nesta aba */
  }
}

/** Cores efetivas das casas (tema pronto ou personalizado). */
export function boardColors(a: Appearance): { light: string; dark: string } {
  if (a.board === 'custom') return { light: a.light, dark: a.dark };
  const p = BOARD_PRESETS.find((b) => b.id === a.board) ?? BOARD_PRESETS[0];
  return { light: p.light, dark: p.dark };
}

function rgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Tabuleiro 8x8 em SVG: a casa do canto superior esquerdo é sempre clara (a8 ou h1). */
function boardSvg(light: string, dark: string): string {
  let rects = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) if ((x + y) % 2 === 1) rects += `<rect x='${x}' y='${y}' width='1' height='1'/>`;
  }
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8' shape-rendering='crispEdges'><rect width='8' height='8' fill='${light}'/><g fill='${dark}'>${rects}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

const ROLES = { pawn: 'P', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q', king: 'K' } as const;

export function appearanceCss(a: Appearance): string {
  const { light, dark } = boardColors(a);
  const css: string[] = [];
  // O prefixo `body` ganha das regras do tema marrom/cburnett importadas pelo chessground.
  css.push(`body cg-board { background-color: ${light}; background-image: ${boardSvg(light, dark)}; }`);
  css.push(`body cg-board square.last-move { background-color: ${rgba(a.highlight, 0.45)}; }`);
  css.push(`body cg-board square.selected { background-color: ${rgba(a.highlight, 0.6)}; }`);
  // Coordenadas na cor oposta à da casa embaixo delas. Os filhos vêm sempre na ordem 1..8 e a..h:
  // de brancas, os números ficam na coluna a (a1 escura) e as letras na fileira 1 (a1 escura);
  // de pretas, os números ficam na coluna h (h1 clara) e as letras na fileira 8 (a8 clara).
  const onDark = `body .orientation-white .ranks :nth-child(odd), body .orientation-white .files :nth-child(odd),
    body .orientation-black .ranks :nth-child(even), body .orientation-black .files :nth-child(even)`;
  const onLight = `body .orientation-white .ranks :nth-child(even), body .orientation-white .files :nth-child(even),
    body .orientation-black .ranks :nth-child(odd), body .orientation-black .files :nth-child(odd)`;
  css.push(`${onDark} { color: ${light}; }`);
  css.push(`${onLight} { color: ${dark}; }`);
  if (!a.coords) css.push('body .cg-wrap coords { display: none; }');
  if (!a.dests) css.push('body cg-board square.move-dest, body cg-board square.oc.move-dest { background: none; }');
  for (const [role, letter] of Object.entries(ROLES)) {
    for (const [color, c] of [['white', 'w'], ['black', 'b']]) {
      css.push(`body .cg-wrap piece.${role}.${color} { background-image: url('/pieces/${a.pieces}/${c}${letter}.svg'); }`);
    }
  }
  return css.join('\n');
}

/** Aplica a aparência na página toda (um <style> só, substituído a cada mudança). */
export function applyAppearance(a: Appearance) {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = appearanceCss(a);
}
