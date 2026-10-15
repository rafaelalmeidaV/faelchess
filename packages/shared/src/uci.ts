import type { Eval } from './types';

export interface InfoLine {
  depth: number;
  multipv: number;
  score: Eval;
  bound: boolean;
  pv: string[];
}

/** Interpreta uma linha `info ...` do UCI. Devolve null se não tiver score + pv. */
export function parseInfoLine(line: string): InfoLine | null {
  if (!line.startsWith('info ') || !line.includes(' pv ')) return null;
  const tokens = line.split(' ');
  let depth = 0;
  let multipv = 1;
  let score: Eval | null = null;
  let bound = false;
  let pv: string[] = [];
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'depth') depth = Number(tokens[++i]);
    else if (t === 'multipv') multipv = Number(tokens[++i]);
    else if (t === 'score') {
      const kind = tokens[++i];
      const value = Number(tokens[++i]);
      score = kind === 'mate' ? { mate: value } : { cp: value };
      if (tokens[i + 1] === 'lowerbound' || tokens[i + 1] === 'upperbound') {
        bound = true;
        i++;
      }
    } else if (t === 'pv') {
      pv = tokens.slice(i + 1);
      break;
    }
  }
  if (!score || pv.length === 0) return null;
  return { depth, multipv, score, bound, pv };
}
