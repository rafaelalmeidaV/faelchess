// Baixa a base de aberturas do Lichess (lichess-org/chess-openings, licença CC0)
// e gera packages/shared/data/openings.json: { "<FEN sem contadores e sem en passant>": [eco, nome] }.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';

const BASE = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master';
const out = {};
let count = 0;

for (const file of ['a', 'b', 'c', 'd', 'e']) {
  const res = await fetch(`${BASE}/${file}.tsv`);
  if (!res.ok) throw new Error(`${file}.tsv: HTTP ${res.status}`);
  const lines = (await res.text()).trim().split('\n').slice(1);
  for (const line of lines) {
    const [eco, name, pgn] = line.split('\t');
    const chess = new Chess();
    chess.loadPgn(pgn);
    const key = chess.fen().split(' ').slice(0, 3).join(' ');
    // Em transposições, mantém o nome mais específico (o mais longo).
    if (!out[key] || out[key][1].length < name.length) out[key] = [eco, name];
    count++;
  }
}

const target = fileURLToPath(new URL('../packages/shared/data/openings.json', import.meta.url));
writeFileSync(target, JSON.stringify(out));
console.log(`${count} aberturas, ${Object.keys(out).length} posições -> ${target}`);
