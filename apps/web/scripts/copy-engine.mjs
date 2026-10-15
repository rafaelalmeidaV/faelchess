// Copia o Stockfish WASM (lite, single-thread) para public/engine, de onde o Web Worker o carrega.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pkgDir;
try {
  pkgDir = dirname(require.resolve('stockfish/package.json'));
} catch {
  console.warn('[copy-engine] pacote stockfish ainda não instalado; pulando');
  process.exit(0);
}
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'engine');
mkdirSync(out, { recursive: true });
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
  const src = join(pkgDir, 'bin', f);
  if (!existsSync(src)) throw new Error(`[copy-engine] ${src} não existe (versão do pacote mudou?)`);
  copyFileSync(src, join(out, f));
}
console.log(`[copy-engine] Stockfish WASM copiado para ${out}`);
