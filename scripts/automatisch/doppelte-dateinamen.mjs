#!/usr/bin/env node
// scripts/automatisch/doppelte-dateinamen.mjs
//
// Prüft, ob zwei getrackte oder ungetrackte, nicht ignorierte QUELLDATEIEN
// (mit --staged: nur Dateien im Index) denselben Basisnamen (Dateiname ohne
// Verzeichnis) haben – unabhängig davon, in welchem Ordner sie liegen.
// Auslöser: src/lib/import/gemeinsam/gemeinsam.index.ts und
// src/lib/markierungen/gemeinsam/gemeinsam.index.ts hießen versehentlich
// identisch (zwei verschiedene Fassaden aus der automatischen
// Ordner→Fassade-Namensregel, siehe scripts/automatisch/modulgrenzen.cjs).
// Ein Import-/Kopierskript hat dadurch die falsche Datei überschrieben –
// Tooling, das nach Dateinamen statt vollem Pfad sucht/matcht (IDE-
// Schnellöffnen, Copy-Skripte, Suche), kann beide Dateien verwechseln.
//
// Ein erster pauschaler Testlauf über ALLE getrackten Dateien (jede Endung)
// ergab neben den zwei zu erwartenden Konfig-Duplikaten (tsconfig.json,
// .gitignore) vor allem MASSENHAFT erwartete, harmlose Treffer bei
// generiertem Plattform-Code (src-tauri/gen/ – Android/iOS-Boilerplate von
// Tauri) sowie bei den App-Icons (identische Dateinamen bewusst einmal pro
// Theme/Dichte: dark/light/disabled, mipmap-hdpi/-mdpi/…). Beides ist reine
// Asset-/Build-Konvention, keine Verwechslungsgefahr im Sinne des
// eigentlichen Problems (zwei editierbare TS-QUELLDATEIEN, von denen jemand
// versehentlich die falsche anfasst). Ein Filter auf Quelldatei-Endungen
// (PRUEFBARE_ENDUNG, identisch zu LINTBARE_ENDUNG in
// scripts/automatisch/lint-geaendert.mjs) entfernt bereits ALLE diese Funde
// (PNG/XML/JSON/build.gradle.kts haben keine dieser Endungen) – aktuell
// liegt unter src-tauri/gen/ keine einzige .ts/.js-Datei, eine zusätzliche
// Pfad-Ausnahme dafür wäre also reine Spekulation ohne echten
// Anwendungsfall. Taucht dort künftig generierter TS/JS-Code auf und löst
// einen Fehlalarm aus, dann an dieser Stelle nachrüsten.
//
// Rust-Dateien (.rs) werden ebenfalls erfasst, weil gleichnamige Module wie
// fenster.rs und commands/fenster.rs genauso verwechselbar sind. Verglichen wird
// stets der vollständige Dateiname samt Endung.
//
// Aufrufvarianten (analog zu pfad-kleinschreibung.mjs):
//   node scripts/automatisch/doppelte-dateinamen.mjs            – alle getrackten und ungetrackten,
//                                                      nicht ignorierten Dateien
//   node scripts/automatisch/doppelte-dateinamen.mjs --staged   – nur gestagete Dateien, verglichen mit
//                                                      allen Dateien im Index (ohne ungetrackte)
//   node scripts/automatisch/doppelte-dateinamen.mjs a/b c/d    – die übergebenen Pfade (ebenfalls gegen
//                                                      alle Dateien verglichen)
//
// Exit-Code 1 bei Fund, sonst 0.

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PRUEFBARE_ENDUNG = /\.(ts|tsx|js|jsx|mjs|cjs|rs)$/;

function dateiname(pfad) {
  return pfad.split('/').pop();
}

function istPruefbar(pfad) {
  return PRUEFBARE_ENDUNG.test(pfad);
}

/**
 * Gruppiert die übergebenen Pfade (nach Anwendung von PRUEFBARE_ENDUNG/
 * AUSGENOMMENE_PRAEFIXE, siehe Kopfkommentar) nach Dateiname und gibt –
 * sortiert nach Dateiname – die Gruppen mit mehr als einem Vorkommen
 * zurück. `nurPruefen` (optional) beschränkt, für welche Dateinamen
 * überhaupt ein Fund gemeldet werden soll (Pre-Commit: nur gestagete
 * Dateien sollen den Commit blockieren können, auch wenn der
 * Duplikat-Partner bereits länger unverändert im Repo liegt) – die
 * Gruppierung selbst läuft aber immer über ALLE `pfade`, sonst würde ein
 * gestageter Duplikat-Partner nicht gefunden, dessen Gegenstück außerhalb
 * der Staged-Liste liegt.
 * @param {Iterable<string>} pfade
 * @param {Iterable<string>} [nurPruefen]
 * @returns {[string, string[]][]}
 */
export function doppelteDateinamen(pfade, nurPruefen) {
  const gruppen = new Map();
  for (const pfad of pfade) {
    if (!istPruefbar(pfad)) continue;
    const name = dateiname(pfad);
    if (!gruppen.has(name)) gruppen.set(name, []);
    gruppen.get(name).push(pfad);
  }

  const relevanteNamen = nurPruefen
    ? new Set([...nurPruefen].filter(istPruefbar).map(dateiname))
    : null;

  return [...gruppen.entries()]
    .filter(
      ([name, treffer]) => treffer.length > 1 && (!relevanteNamen || relevanteNamen.has(name)),
    )
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, treffer]) => [name, [...treffer].sort()]);
}

function gitDateien(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean);
}

const istHauptmodul = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (istHauptmodul) {
  const argv = process.argv.slice(2);
  const staged = argv.includes('--staged');
  // Ohne --staged zählt der Arbeitsbaum: im Arbeitsbaum gelöschte oder verschobene,
  // noch getrackte Dateien bleiben außer Betracht.
  // Mit --staged zählt nur der Index: unfertige ungetrackte Dateien blockieren keinen Commit.
  const alle = staged
    ? gitDateien(['ls-files', '--cached'])
    : gitDateien(['ls-files', '--cached', '--others', '--exclude-standard']).filter(existsSync);
  const explizitePfade = argv.filter((a) => !a.startsWith('--'));
  const nurPruefen = staged
    ? gitDateien(['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
    : explizitePfade.length > 0
      ? explizitePfade
      : undefined;

  const funde = doppelteDateinamen(alle, nurPruefen);
  if (funde.length > 0) {
    console.error('Quelldateien mit identischem Namen an unterschiedlichen Pfaden:');
    for (const [name, treffer] of funde) {
      console.error(`  ${name}:`);
      for (const pfad of treffer) console.error(`    ${pfad}`);
    }
    process.exit(1);
  }
}
