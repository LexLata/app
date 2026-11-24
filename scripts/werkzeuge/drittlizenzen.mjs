// drittlizenzen.mjs
// Aufruf: npm run drittlizenzen – erzeugt THIRD-PARTY-LICENSES im Stammordner (Release-Schritt).
// Voraussetzung: cargo-about (cargo install cargo-about --locked --features cli) und node_modules.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tsImport } from 'tsx/esm/api';

const {
  npmKomponenten,
  rustKomponenten,
  standardtexte,
  standardtexteErgaenzen,
  drittlizenzenText,
  lizenzbefund,
  cargoLockFingerabdruck,
  lucideVersion,
  EIGENES_CRATE,
} = await tsImport('./drittlizenzenAblauf.ts', import.meta.url);
const wurzel = fileURLToPath(new URL('../..', import.meta.url));

const cargoAbout = spawnSync(
  'cargo',
  [
    'about',
    'generate',
    '--format',
    'json',
    '--config',
    join(wurzel, 'scripts/werkzeuge/drittlizenzen/about.toml'),
    '--manifest-path',
    join(wurzel, 'src-tauri/Cargo.toml'),
  ],
  { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'inherit'] },
);
if (cargoAbout.status !== 0) {
  console.error(
    '❌ cargo about fehlgeschlagen. Installiert? cargo install cargo-about --locked --features cli',
  );
  process.exit(1);
}

// Sonstige eingebettete Fremdinhalte (nicht über einen Paketmanager bezogen).
// Lucide-Version aus den Lizenzköpfen der Quell-SVGs, damit sie nicht veraltet.
let lucide;
try {
  lucide = lucideVersion(join(wurzel, 'src-tauri/icons/menu/quellen'));
} catch (fehler) {
  console.error(`❌ ${fehler.message}`);
  process.exit(1);
}
const sonstige = [
  {
    herkunft: 'Sonstige',
    name: 'Source Serif 4 (Schrift, src/lib/stil/schriftdateien)',
    version: '4',
    lizenz: 'OFL-1.1',
    lizenztexte: [
      readFileSync(
        join(wurzel, 'src/lib/stil/schriftdateien/source-serif-lizenz.md'),
        'utf8',
      ).trim(),
    ],
  },
  {
    herkunft: 'Sonstige',
    name: 'Lucide-Icons (Menübilder, src-tauri/icons/menu)',
    version: lucide,
    lizenz: 'ISC AND MIT',
    lizenztexte: [
      readFileSync(join(wurzel, 'src-tauri/icons/menu/quellen/LIZENZ.txt'), 'utf8').trim(),
    ],
  },
];

// Zusätzliche Standardtext-Quelle: cargo-about liefert ISC nur mit paketeigenen Texten.
// Wortgetreu nach SPDX (https://spdx.org/licenses/ISC.html), Copyright-Zeile als Platzhalter.
const ISC_STANDARDTEXT = `ISC License

Copyright (c) <year> <copyright holders>

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`;

const rustJson = JSON.parse(cargoAbout.stdout);
let npm;
try {
  const sammlung = standardtexte(rustJson);
  if (!sammlung.has('ISC')) sammlung.set('ISC', ISC_STANDARDTEXT);
  npm = standardtexteErgaenzen(npmKomponenten(wurzel), sammlung);
} catch (fehler) {
  console.error(`❌ ${fehler.message}`);
  process.exit(1);
}
const komponenten = [...rustKomponenten(rustJson, EIGENES_CRATE), ...npm, ...sonstige];
const fingerabdruck = cargoLockFingerabdruck(
  readFileSync(join(wurzel, 'src-tauri/Cargo.lock'), 'utf8'),
  EIGENES_CRATE,
);
const ziel = join(wurzel, 'THIRD-PARTY-LICENSES');
writeFileSync(ziel, drittlizenzenText(komponenten, fingerabdruck));

const befund = lizenzbefund(komponenten);
const anzahl = (herkunft) => komponenten.filter((k) => k.herkunft === herkunft).length;
console.log(
  `THIRD-PARTY-LICENSES geschrieben: Rust ${anzahl('Rust')}, npm ${anzahl('npm')}, sonstige ${anzahl('Sonstige')}`,
);
console.log('Lizenz-IDs:', befund.ids.map(([id, n]) => `${id} ${n}`).join(', '));
if (befund.auffaellig.length > 0) {
  console.log(`Auffällig (${befund.auffaellig.length}):`);
  for (const zeile of befund.auffaellig) console.log(`  ${zeile}`);
}
