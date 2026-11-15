// make.fun entrypoint (Node 22, standard library only). The game is the game/ folder beside this
// file: plain static files the browser loads as ES modules with three.js from an import map. This
// program copies game/ and screenshots/ to the output directory and writes dossier.json with the
// vendored make.fun library, which is what the judge reads.
//
// Locally: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play it first: node serve.ts, then open http://localhost:8080

import { cpSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');

if (!existsSync(join(gameDir, 'index.html'))) {
  throw new Error('game/index.html is missing: the entry ships the game as static files');
}

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true, dereference: true });

const shotsOut = join(out, 'screenshots');
mkdirSync(shotsOut, { recursive: true });
if (existsSync(shotsDir)) {
  cpSync(shotsDir, shotsOut, { recursive: true, dereference: true });
}

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
  }),
);

const bytes = statSync(join(out, 'dossier.json')).size;
process.stdout.write(`wrote ${out}/dossier.json (${bytes} bytes)\n`);