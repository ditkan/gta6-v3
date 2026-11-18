// Port Azura: Heat — make.fun gta6-01 entry program (Node 22, standard library only).
//
// The game itself is the static site in game/ (open game/index.html in a browser and play;
// it loads nothing from the network). This program is the hand-in step: it copies game/
// and screenshots/ into the output directory and writes dossier.json there with the
// vendored make.fun dossier library, exactly the bytes the scorer rebuilds and compares.
//
// Run it locally the same way the grader does:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// With no MAKEFUN_OUTPUT_DIR set it writes to /output, the grader's mount.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoDir = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Copy the playable game first: buildDossier reads the tree back from the output
// directory, so the dossier always describes the bytes that were actually handed in.
mkdirSync(outputDir, { recursive: true });
cpSync(join(repoDir, 'game'), join(outputDir, 'game'), { recursive: true });

// Screenshots are added to the repository before submission; tolerate their absence
// while developing so a bare checkout still produces a dossier for local checks.
const shotsDir = join(outputDir, 'screenshots');
mkdirSync(shotsDir, { recursive: true });
if (existsSync(join(repoDir, 'screenshots'))) {
  cpSync(join(repoDir, 'screenshots'), shotsDir, { recursive: true });
}

// The caps mirror the competition's sealed gate: at most 4 screenshots of 256 KiB,
// at most 993 entries and 48 MiB under game/, no game path over 1000 bytes, and the
// dossier's source text capped at 160 KiB. An entry outside them is refused here
// rather than scored invalid there.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);

console.log(`Port Azura: Heat handed in: game/ + screenshots/ + dossier.json (${dossier.length} bytes) -> ${outputDir}`);
