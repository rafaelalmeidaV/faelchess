/**
 * Sons do tabuleiro: gravações CC0 de madeira batendo (Kenney), em public/sounds (ver CREDITS.md).
 * Os sons padrão do Lichess não são livres, então não dá para usá-los.
 * Cada tipo tem algumas variações sorteadas a cada lance, para não soar repetido.
 */
import { loadAppearance } from './appearance';

export type SoundKind = 'move' | 'capture' | 'check' | 'end';

const FILES: Record<Exclude<SoundKind, 'check'>, string[]> = {
  move: [0, 1, 2, 3, 4].map((i) => `/sounds/move-${i}.wav`),
  capture: [0, 1, 2, 3, 4].map((i) => `/sounds/capture-${i}.wav`),
  end: ['/sounds/end.wav'],
};
const VOLUME = 0.7;

let ctx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();

function audio(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    // O navegador só libera áudio depois de um clique; até lá fica suspenso (e o som é ignorado).
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Baixa e decodifica uma vez; depois toca da memória, sem atraso. */
function load(c: AudioContext, url: string) {
  let p = buffers.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => c.decodeAudioData(b))
      .catch(() => null);
    buffers.set(url, p);
  }
  return p;
}

/** Já deixa os arquivos carregados (chamado ao abrir uma partida). */
export function preloadSounds() {
  if (!loadAppearance().sound) return;
  const c = audio();
  if (c) for (const list of Object.values(FILES)) for (const url of list) void load(c, url);
}

export function playSound(kind: SoundKind, force = false) {
  if (!force && !loadAppearance().sound) return;
  const c = audio();
  if (!c) return;
  // Como no Lichess, o xeque usa o som de lance comum.
  const list = FILES[kind === 'check' ? 'move' : kind];
  const url = list[Math.floor(Math.random() * list.length)];
  void load(c, url).then((buffer) => {
    if (!buffer) return;
    const src = c.createBufferSource();
    src.buffer = buffer;
    const gain = c.createGain();
    gain.gain.value = VOLUME;
    src.connect(gain).connect(c.destination);
    src.start();
  });
}

/** Som do lance pelo SAN: captura ou lance comum (xeque cai no comum). */
export function soundForSan(san: string): SoundKind {
  if (san.includes('x')) return 'capture';
  if (san.includes('+') || san.includes('#')) return 'check';
  return 'move';
}
