import { Chess } from 'chess.js';
import { boardColors, type Appearance } from './appearance';
import { avatarUrl } from './avatar';
import { CLS_COLORS } from './labels';

/** Imagem para compartilhar um lance brilhante (1200×630, a proporção dos cartões de redes sociais). */
const W = 1200;
const H = 630;
const BOARD = 630;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export interface MoveCardInput {
  /** Posição depois do lance. */
  fenAfter: string;
  /** Lance em UCI (e2e4): destaca origem e destino. */
  uci: string;
  /** Lance em SAN (Bxe5). */
  san: string;
  /** Lado que fica embaixo: o de quem jogou. */
  orientation: 'white' | 'black';
  name: string;
  userId?: string;
  appearance: Appearance;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Corta com reticências até caber em `max` px. */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

/** Granulação fina (ruído claro com pouca opacidade) que dá textura de vidro fosco. */
function noisePattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  const n = document.createElement('canvas');
  n.width = n.height = 128;
  const nctx = n.getContext('2d');
  if (!nctx) return null;
  const data = nctx.createImageData(128, 128);
  for (let i = 0; i < data.data.length; i += 4) {
    data.data[i] = data.data[i + 1] = data.data[i + 2] = 255;
    data.data[i + 3] = Math.random() * 26;
  }
  nctx.putImageData(data, 0, 0);
  return ctx.createPattern(n, 'repeat');
}

function drawCrown(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const x = cx - s / 2;
  const y = cy - s / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.8);
  ctx.lineTo(x + s * 0.05, y + s * 0.25);
  ctx.lineTo(x + s * 0.3, y + s * 0.5);
  ctx.lineTo(x + s * 0.5, y + s * 0.15);
  ctx.lineTo(x + s * 0.7, y + s * 0.5);
  ctx.lineTo(x + s * 0.95, y + s * 0.25);
  ctx.lineTo(x + s, y + s * 0.8);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(x, y + s * 0.88, s, s * 0.12);
}

export async function renderMoveCard(input: MoveCardInput): Promise<Blob> {
  const { fenAfter, uci, san, orientation, name, userId, appearance } = input;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('O navegador não conseguiu desenhar a imagem');

  const { light, dark } = boardColors(appearance);
  const sq = BOARD / 8;
  const flipped = orientation === 'black';
  const pos = (square: string) => {
    const f = square.charCodeAt(0) - 97;
    const r = Number(square[1]) - 1;
    return { x: (flipped ? 7 - f : f) * sq, y: (flipped ? r : 7 - r) * sq };
  };

  const chess = new Chess(fenAfter);
  const pieces = chess.board().flat().filter((p): p is NonNullable<typeof p> => !!p);

  // Carrega peças e foto ao mesmo tempo. Se o conjunto escolhido falhar, cai no cburnett.
  const pieceKey = (p: { color: string; type: string }) => `${p.color}${p.type.toUpperCase()}`;
  const keys = [...new Set(pieces.map(pieceKey))];
  const to = uci.slice(2, 4);
  const from = uci.slice(0, 2);
  const mover = chess.get(to as 'a1');
  if (mover) keys.push(pieceKey(mover));
  const [avatar, ...imgs] = await Promise.all([
    userId ? loadImage(avatarUrl(userId)) : Promise.resolve(null),
    ...[...new Set(keys)].map(async (k) => ({
      k,
      img: (await loadImage(`/pieces/${appearance.pieces}/${k}.svg`)) ?? (await loadImage(`/pieces/cburnett/${k}.svg`)),
    })),
  ]);
  const pieceImg = new Map(imgs.map((i) => [i.k, i.img]));

  // Tabuleiro.
  for (let f = 0; f < 8; f++) {
    for (let r = 0; r < 8; r++) {
      const { x, y } = pos(`${'abcdefgh'[f]}${r + 1}`);
      ctx.fillStyle = (f + r) % 2 === 0 ? dark : light;
      ctx.fillRect(x, y, sq, sq);
    }
  }
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = appearance.highlight;
  for (const s of [from, to]) {
    const { x, y } = pos(s);
    ctx.fillRect(x, y, sq, sq);
  }
  ctx.globalAlpha = 1;

  // Coordenadas: letras na fileira de baixo, números na coluna da esquerda.
  ctx.font = `700 15px ${FONT}`;
  const bottomRank = flipped ? 7 : 0;
  const leftFile = flipped ? 7 : 0;
  for (let i = 0; i < 8; i++) {
    const file = flipped ? 7 - i : i;
    const rank = flipped ? i : 7 - i;
    // Cada marca usa a cor oposta à da casa onde está (a1 é escura: (coluna + fileira) par = escura).
    ctx.fillStyle = (file + bottomRank) % 2 === 0 ? light : dark;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('abcdefgh'[file], (i + 1) * sq - 5, BOARD - 6);
    ctx.fillStyle = (leftFile + rank) % 2 === 0 ? light : dark;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(String(rank + 1), 5, i * sq + 5);
  }

  // Peças.
  for (const p of pieces) {
    const img = pieceImg.get(pieceKey(p));
    if (!img) continue;
    const { x, y } = pos(p.square);
    ctx.drawImage(img, x, y, sq, sq);
  }

  // Selo "!!" no canto da casa de destino.
  const brilliant = CLS_COLORS.brilliant;
  const dest = pos(to);
  const bx = dest.x + sq - 8;
  const by = dest.y + 8;
  ctx.beginPath();
  ctx.arc(bx, by, 20, 0, Math.PI * 2);
  ctx.fillStyle = brilliant;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#fff';
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = `800 22px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!!', bx, by + 1);

  // Painel da direita.
  const bg = ctx.createLinearGradient(BOARD, 0, W, H);
  bg.addColorStop(0, '#34d3b3');
  bg.addColorStop(1, '#14917c');
  ctx.fillStyle = bg;
  ctx.fillRect(BOARD, 0, W - BOARD, H);
  // Manchas de cor atrás do cartão: sem elas o vidro não teria o que mostrar.
  ctx.save();
  ctx.beginPath();
  ctx.rect(BOARD, 0, W - BOARD, H);
  ctx.clip();
  for (const [bx0, by0, r, c0] of [
    [BOARD + 60, 40, 330, 'rgba(190, 255, 235, 0.55)'],
    [W - 40, 200, 280, 'rgba(60, 120, 230, 0.38)'],
    [BOARD + 220, H + 20, 300, 'rgba(6, 70, 62, 0.65)'],
  ] as const) {
    const g = ctx.createRadialGradient(bx0, by0, 0, bx0, by0, r);
    g.addColorStop(0, c0);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(BOARD, 0, W - BOARD, H);
  }
  ctx.restore();

  const cx = BOARD + (W - BOARD) / 2;
  const cardW = 470;
  const cardX = cx - cardW / 2;
  const cardY = 60;
  const cardH = 490;

  // Vidro acrílico, como os painéis do site: sombra, tinta translúcida, granulação, brilho no topo e borda de luz.
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = 44;
  ctx.shadowOffsetY = 18;
  roundRect(ctx, cardX, cardY, cardW, cardH, 30);
  ctx.fillStyle = 'rgba(5, 38, 44, 0.46)';
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, cardX, cardY, cardW, cardH, 30);
  ctx.clip();
  const grain = noisePattern(ctx);
  if (grain) {
    ctx.fillStyle = grain;
    ctx.fillRect(cardX, cardY, cardW, cardH);
  }
  const sheen = ctx.createLinearGradient(0, cardY, 0, cardY + cardH);
  sheen.addColorStop(0, 'rgba(255, 255, 255, 0.16)');
  sheen.addColorStop(0.35, 'rgba(255, 255, 255, 0.03)');
  sheen.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(cardX, cardY, cardW, cardH);
  ctx.restore();

  // Borda de luz: conic-gradient (forte nos cantos, some no meio), igual à dos painéis do site.
  roundRect(ctx, cardX, cardY, cardW, cardH, 30);
  ctx.lineWidth = 2.5;
  if (typeof ctx.createConicGradient === 'function') {
    const edge = ctx.createConicGradient((-75 * Math.PI) / 180, cardX + cardW / 2, cardY + cardH / 2);
    const light = 'rgba(255, 255, 255, 0.7)';
    const none = 'rgba(255, 255, 255, 0)';
    for (const [stop, color] of [[0, light], [0.05, none], [0.4, none], [0.5, light], [0.6, none], [0.95, none], [1, light]] as const) {
      edge.addColorStop(stop, color);
    }
    ctx.strokeStyle = edge;
  } else {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  }
  ctx.stroke();

  // Foto (ou a inicial) e nome.
  const AV = 128;
  const ax = cx - AV / 2;
  const ay = 100;
  ctx.save();
  roundRect(ctx, ax, ay, AV, AV, 18);
  ctx.clip();
  if (avatar) {
    ctx.drawImage(avatar, ax, ay, AV, AV);
  } else {
    ctx.fillStyle = brilliant;
    ctx.fillRect(ax, ay, AV, AV);
    ctx.fillStyle = '#fff';
    ctx.font = `700 76px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name.trim().charAt(0).toUpperCase() || '?', cx, ay + AV / 2 + 4);
  }
  ctx.restore();

  ctx.fillStyle = '#fff';
  ctx.font = `700 34px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(fit(ctx, name, cardW - 50), cx, 285);

  // Selo + peça + lance (sem a letra da peça: "Bxe5" vira o bispo e "xe5").
  const rest = san.replace(/^[KQRBN]/, '');
  const BADGE = 76;
  const ICON = 92;
  ctx.font = `800 62px ${FONT}`;
  const textW = ctx.measureText(rest).width;
  const hasIcon = !!(mover && pieceImg.get(pieceKey(mover)));
  const total = BADGE + 18 + (hasIcon ? ICON + 6 : 0) + textW;
  let x = cx - total / 2;
  const rowY = 385;
  ctx.beginPath();
  ctx.arc(x + BADGE / 2, rowY, BADGE / 2, 0, Math.PI * 2);
  ctx.fillStyle = brilliant;
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = `800 38px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('!!', x + BADGE / 2, rowY + 2);
  x += BADGE + 18;
  if (hasIcon && mover) {
    // Peça em fundo claro para não sumir no cartão escuro.
    ctx.beginPath();
    ctx.arc(x + ICON / 2, rowY, ICON / 2 - 4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fill();
    ctx.drawImage(pieceImg.get(pieceKey(mover))!, x, rowY - ICON / 2, ICON, ICON);
    x += ICON + 6;
  }
  ctx.fillStyle = brilliant;
  ctx.font = `800 62px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(rest, x, rowY + 3);

  ctx.fillStyle = '#fff';
  ctx.font = `800 46px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('É Brilhante!', cx, 505);

  // Marca.
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  drawCrown(ctx, cx - 62, 595, 26);
  ctx.font = `800 26px ${FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('faelchess', cx - 40, 596);

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não consegui gerar o PNG'))), 'image/png');
  });
}
