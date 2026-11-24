#!/usr/bin/env node
// scripts/automatisch/modulzyklen-pruefen.mjs
//
// Meldet Abhängigkeitskreise auf Modulebene und auf Dateiebene über Laufzeitimporte. Die Dateiprüfung `no-circular`
// in scripts/automatisch/dependency-cruiser.cjs sieht nur Kreise zwischen einzelnen Dateien;
// hier werden Dateien zu Einheiten zusammengefasst:
//   - die obersten in scripts/automatisch/modulgrenzen.cjs registrierten
//     Module (Submodule gehören zu ihrem obersten Modul),
//   - die Ordner in NICHT_REGISTRIERTE_EINHEITEN,
//   - je Unterordner von lib/domain, hooks und components eine Einheit,
//   - lose Dateien übrigen Ordners je Ordner eine Wurzeleinheit
//     (z. B. „src/lib/domain (Wurzel)“).
// Der längste passende Ordner gewinnt. Es zählen Laufzeitimporte einschließlich
// dynamischem import(); reine Typimporte und Testdateien zählen nicht.
// Zusätzlich prüft das Skript die Dateiebene vollständig auf Laufzeitkreise
// (auch innerhalb einer Einheit): `no-circular` mit `viaOnly` filtert nur den
// ersten gefundenen Kreis je Kante und kann einen daneben liegenden übersehen.
// Jeder Kreis ist ein Fehler; es gibt keine Ausnahmendatei.
//
// Aufruf: node scripts/automatisch/modulzyklen-pruefen.mjs (im Projektordner).
// Exit-Code 1 bei Fund, sonst 0.

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPOSITORY = resolve(import.meta.dirname, '..', '..');

const NICHT_REGISTRIERTE_EINHEITEN = [
  'src/lib/persistenz/nutzerdaten',
  'src/lib/stil',
  'src/lib/utils',
  'src/lib/plattform',
  'src/mobile',
];
const ORDNER_MIT_UNTEREINHEITEN = ['src/lib/domain', 'src/hooks', 'src/components'];
const TESTDATEI = /\.test\.tsx?$|^src\/test\//;

function liegtIn(datei, ordner) {
  return datei.startsWith(`${ordner}/`);
}

/** Oberste registrierte Module: ohne registrierten Vorfahren. */
function obersteModule(module) {
  return module.filter((pfad) => !module.some((andere) => liegtIn(pfad, andere)));
}

/**
 * Einheit einer Datei. `module` sind die registrierten Modulpfade.
 * @param {string} datei
 * @param {string[]} module
 */
export function einheitFuer(datei, module) {
  const feste = [...obersteModule(module), ...NICHT_REGISTRIERTE_EINHEITEN]
    .filter((ordner) => liegtIn(datei, ordner))
    .sort((a, b) => b.length - a.length);
  if (feste.length) return feste[0];
  for (const ordner of ORDNER_MIT_UNTEREINHEITEN) {
    if (!liegtIn(datei, ordner)) continue;
    const rest = datei.slice(ordner.length + 1).split('/');
    if (rest.length > 1) return `${ordner}/${rest[0]}`;
  }
  return `${dirname(datei)} (Wurzel)`;
}

/** Laufzeitkanten zwischen Produktionsdateien in `src` (ohne reine Typimporte). */
function laufzeitKanten(cruiseModule) {
  const kanten = [];
  for (const { source, dependencies } of cruiseModule) {
    if (!source.startsWith('src/') || TESTDATEI.test(source)) continue;
    for (const { resolved, dependencyTypes } of dependencies) {
      if (!resolved.startsWith('src/') || TESTDATEI.test(resolved)) continue;
      if (dependencyTypes.includes('type-only') || resolved === source) continue;
      kanten.push({ von: source, nach: resolved, quelle: source, ziel: resolved });
    }
  }
  return kanten;
}

/** Dieselben Kanten, Endpunkte zu Einheiten zusammengefasst; Kanten innerhalb einer Einheit entfallen. */
function einheitenKanten(kanten, module) {
  return kanten
    .map((kante) => ({
      ...kante,
      von: einheitFuer(kante.quelle, module),
      nach: einheitFuer(kante.ziel, module),
    }))
    .filter(({ von, nach }) => von !== nach);
}

/** Stark zusammenhängende Komponenten (Tarjan) mit mehr als einem Knoten samt ihren Dateikanten. */
function kreise(kanten) {
  const nachbarn = new Map();
  for (const { von, nach } of kanten) {
    if (!nachbarn.has(von)) nachbarn.set(von, new Set());
    if (!nachbarn.has(nach)) nachbarn.set(nach, new Set());
    nachbarn.get(von).add(nach);
  }
  let zaehler = 0;
  const index = new Map();
  const tief = new Map();
  const stapel = [];
  const aufStapel = new Set();
  const komponenten = [];
  const besuche = (knoten) => {
    index.set(knoten, zaehler);
    tief.set(knoten, zaehler++);
    stapel.push(knoten);
    aufStapel.add(knoten);
    for (const ziel of nachbarn.get(knoten)) {
      if (!index.has(ziel)) {
        besuche(ziel);
        tief.set(knoten, Math.min(tief.get(knoten), tief.get(ziel)));
      } else if (aufStapel.has(ziel)) {
        tief.set(knoten, Math.min(tief.get(knoten), index.get(ziel)));
      }
    }
    if (tief.get(knoten) === index.get(knoten)) {
      const komponente = [];
      let k;
      do {
        k = stapel.pop();
        aufStapel.delete(k);
        komponente.push(k);
      } while (k !== knoten);
      if (komponente.length > 1) komponenten.push(komponente.sort());
    }
  };
  for (const knoten of [...nachbarn.keys()].sort()) if (!index.has(knoten)) besuche(knoten);

  return komponenten
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map((knoten) => {
      const enthalten = new Set(knoten);
      const dateikanten = [
        ...new Set(
          kanten
            .filter(({ von, nach }) => enthalten.has(von) && enthalten.has(nach))
            .map(({ quelle, ziel }) => `${quelle} → ${ziel}`),
        ),
      ].sort();
      return { knoten, dateikanten };
    });
}

function cruiseAusfuehren() {
  // Die Paketexporte geben den CLI-Einstieg nicht frei; Pfad im eigenen Repository.
  const lauf = spawnSync(
    process.execPath,
    [
      join(REPOSITORY, 'node_modules', 'dependency-cruiser', 'bin', 'dependency-cruiser.mjs'),
      'src',
      '--config',
      'scripts/automatisch/dependency-cruiser.cjs',
      '--output-type',
      'json',
    ],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024 },
  );
  return werteCruiseLaufAus(lauf);
}

/**
 * Module aus einem dependency-cruiser-Lauf mit JSON-Ausgabe. Der JSON-Bericht
 * endet regulär immer mit Status 0; jeder andere Status, ein Signal, ein
 * Startfehler oder fehlende Ausgabe lässt die Prüfung scheitern.
 * @param {{status: number | null, signal?: string | null, error?: Error, stdout?: string, stderr?: string}} lauf
 */
export function werteCruiseLaufAus(lauf) {
  if (lauf.error || lauf.status !== 0 || !lauf.stdout) {
    const grund =
      lauf.error?.message ??
      (lauf.status === null ? `Signal ${lauf.signal}` : `Status ${lauf.status}`);
    throw new Error(`dependency-cruiser fehlgeschlagen (${grund}): ${lauf.stderr ?? ''}`);
  }
  return JSON.parse(lauf.stdout).modules;
}

const istHauptmodul = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (istHauptmodul) {
  const require = createRequire(import.meta.url);
  const { MODULE } = require(resolve('scripts/automatisch/modulgrenzen.cjs'));
  const module = MODULE.map(({ pfad }) => pfad);
  const kanten = laufzeitKanten(cruiseAusfuehren());
  // Dateiebene vollständig: no-circular mit viaOnly prüft je Kante nur den ersten Kreis.
  const berichte = [
    ['Modulkreise', 'Einheiten', kreise(einheitenKanten(kanten, module))],
    ['Dateikreise über Laufzeitimporte', 'Dateien', kreise(kanten)],
  ].filter(([, , funde]) => funde.length);
  for (const [titel, knotenname, funde] of berichte) {
    console.error(`${titel} (${funde.length}):`);
    for (const { knoten, dateikanten } of funde) {
      console.error(`\n  ${knotenname}: ${knoten.join(', ')}`);
      console.error('  Kanten im Kreis:');
      for (const kante of dateikanten) console.error(`    ${kante}`);
    }
    console.error('');
  }
  if (berichte.length) process.exit(1);
}
