// Harbor Heat — Solmar Bay: the make.fun entry packager (Node 22, standard
// library only). The game is this directory's game/ folder: plain static files
// a desktop browser loads offline (game/index.html and its ES modules, with a
// vendored three.js under game/vendor/, no library fetched from the network and
// no network request at runtime). This program hands the entry in: it copies
// game/ and screenshots/ from beside this file into the output directory and
// writes output/dossier.json, the summary the judge reads, using the vendored
// make.fun library. The game itself is an original open-world crime game — a
// rookie getaway driver for the Harbor Crew, driving a procedural harbor city
// through five story jobs, police chases and timed deliveries — built with
// three.js, synthesized WebAudio, and a seeded world so every run replays.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Where this file lives, and where the packaged entry goes.
const here = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse — more than 4
// screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of
// game files in all, or a path under game/ over 1000 bytes. game/ counts
// beside /output's own 1000-entry cap, its screenshots/ and dossier.json.
const DOSSIER_LIMITS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
} as const;

function copyTree(source: string, target: string): void {
  mkdirSync(target, { recursive: true });
  cpSync(source, target, { recursive: true });
}

function packageEntry(): void {
  mkdirSync(outDir, { recursive: true });
  copyTree(join(here, 'game'), join(outDir, 'game'));
  if (existsSync(join(here, 'screenshots'))) {
    copyTree(join(here, 'screenshots'), join(outDir, 'screenshots'));
  }
  const dossier = buildDossier(outDir, DOSSIER_LIMITS);
  writeFileSync(join(outDir, 'dossier.json'), dossier);
}

packageEntry();
