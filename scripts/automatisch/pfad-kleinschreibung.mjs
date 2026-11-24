#!/usr/bin/env node
// scripts/automatisch/pfad-kleinschreibung.mjs
//
// Zwei unabhängige Prüfungen auf getrackten Pfaden:
//
// 1. ordnerVerstoesse – kein Ordnername darf Großbuchstaben enthalten.
//    Dateinamen dürfen Großbuchstaben haben (README.md, LICENSE) – nur
//    Verzeichnissegmente nicht. Das Projekt nutzt durchgängig
//    Kleinschreibung; die Claude-free-Version hat hier regelmäßig Ordner
//    mit Großbuchstaben angelegt.
//
// 2. dateiCaseVerstoesse – der von Git getrackte Pfad muss in JEDEM Segment
//    exakt (Groß-/Kleinschreibung) dem tatsächlichen Verzeichniseintrag auf
//    der Platte entsprechen. Grund: auf case-insensitiven Dateisystemen
//    (macOS/APFS, Windows/NTFS default) wird ein reiner Case-Rename von Git
//    oft nicht als Änderung erkannt (siehe core.ignorecase) – der Git-Index
//    behält dann die alte Schreibweise, während lokal/im Editor die neue
//    Schreibweise angezeigt wird. Das fällt lokal nicht auf, bricht aber
//    auf case-sensitiven Dateisystemen (Linux, u.a. CI) beim Import.
//    Prüft per fs.readdirSync() gegen den echten Verzeichnisinhalt – nicht
//    über FS-Pfadauflösung, da die auf macOS/Windows selbst case-insensitiv
//    wäre und den Fehler gerade nicht zeigen würde.
//
// Aufrufvarianten:
//   node scripts/automatisch/pfad-kleinschreibung.mjs            – alle getrackten und ungetrackten Dateien
//   node scripts/automatisch/pfad-kleinschreibung.mjs --staged   – nur gestagete Dateien (Pre-Commit)
//   node scripts/automatisch/pfad-kleinschreibung.mjs a/b c/d     – die übergebenen Pfade
//   node scripts/automatisch/pfad-kleinschreibung.mjs --hook      – Claude-Code-PostToolUse-Hook:
//                                                        liest das Tool-JSON von stdin
//
// Exit-Code 1 bei Fund, sonst 0. Im Hook-Modus stattdessen 2 – nur dieser Code
// spielt die Meldung an Claude zurück, damit der Pfad sofort korrigiert wird.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Von der Regel ausgenommen: von Tauri/Xcode/Gradle generierte native
// Projektordner (versioniert, weil manuell gepflegte Konfiguration darin liegt).
// Deren Namen – Assets.xcassets, Sources, buildSrc, gesetze_iOS – sind durch
// Apple- bzw. Gradle-Konventionen vorgegeben.
const AUSGENOMMENE_PRAEFIXE = ['src-tauri/gen/'];

/**
 * Verzeichnissegmente eines Pfads ohne den Dateinamen.
 * @param {string} pfad
 * @returns {string[]}
 */
function verzeichnisSegmente(pfad) {
  return pfad.split('/').slice(0, -1);
}

/**
 * Gibt – dedupliziert und sortiert – die Ordnerpfade zurück, deren Name einen
 * Großbuchstaben enthält. Bei geschachtelten Verstößen wird nur der oberste
 * gemeldet (das Kind ist dann automatisch mitbetroffen).
 * @param {Iterable<string>} pfade
 * @returns {string[]}
 */
export function ordnerVerstoesse(pfade) {
  const treffer = new Set();
  for (const pfad of pfade) {
    if (AUSGENOMMENE_PRAEFIXE.some((praefix) => pfad.startsWith(praefix))) continue;
    const bisher = [];
    for (const segment of verzeichnisSegmente(pfad)) {
      bisher.push(segment);
      if (/[A-Z]/.test(segment)) {
        treffer.add(bisher.join('/'));
        break;
      }
    }
  }
  return [...treffer].sort();
}

/**
 * Gibt – dedupliziert und sortiert – Pfade zurück, bei denen der von Git
 * getrackte Pfad in mindestens einem Segment eine andere Groß-/
 * Kleinschreibung hat als der tatsächliche Verzeichniseintrag auf der
 * Platte. Existiert ein Verzeichnis in der Kette gar nicht (mehr), wird das
 * NICHT gemeldet (kein Case-Problem, sondern z.B. eine bereits gelöschte
 * Datei zwischen zwei Git-Ständen).
 * @param {Iterable<string>} pfade
 * @param {string} [basisVerzeichnis] Projektwurzel, Default: cwd
 * @returns {string[]}
 */
export function dateiCaseVerstoesse(pfade, basisVerzeichnis = process.cwd()) {
  const treffer = new Set();
  const verzeichnisCache = new Map();

  function eintraege(absolutesVerzeichnis) {
    if (!verzeichnisCache.has(absolutesVerzeichnis)) {
      try {
        verzeichnisCache.set(absolutesVerzeichnis, readdirSync(absolutesVerzeichnis));
      } catch {
        verzeichnisCache.set(absolutesVerzeichnis, null);
      }
    }
    return verzeichnisCache.get(absolutesVerzeichnis);
  }

  for (const pfad of pfade) {
    let aktuellesVerzeichnis = basisVerzeichnis;
    for (const segment of pfad.split('/')) {
      const eintraegeHier = eintraege(aktuellesVerzeichnis);
      if (eintraegeHier === null) break;
      if (!eintraegeHier.includes(segment)) {
        const tatsaechlich = eintraegeHier.find((e) => e.toLowerCase() === segment.toLowerCase());
        if (tatsaechlich !== undefined) {
          treffer.add(`${pfad}  (Git: „${segment}“, Dateisystem: „${tatsaechlich}“)`);
        }
        break;
      }
      aktuellesVerzeichnis = join(aktuellesVerzeichnis, segment);
    }
  }
  return [...treffer].sort();
}

/**
 * Zieht aus der stdin-Eingabe eines Claude-Code-PostToolUse-Hooks den
 * projektrelativen Pfad der geschriebenen Datei. Null, wenn die Eingabe keinen
 * brauchbaren Pfad enthält oder er außerhalb des Projekts liegt.
 * @param {string} eingabe rohes JSON von stdin
 * @param {string} projektWurzel absoluter Pfad
 * @returns {string|null}
 */
export function pfadAusHookEingabe(eingabe, projektWurzel) {
  let daten;
  try {
    daten = JSON.parse(eingabe);
  } catch {
    return null;
  }
  const roh = daten?.tool_input?.file_path;
  if (typeof roh !== 'string' || roh === '') return null;

  const pfad = roh.replaceAll('\\', '/');
  const wurzel = projektWurzel.replaceAll('\\', '/').replace(/\/$/, '');
  if (!pfad.startsWith('/') && !/^[A-Za-z]:\//.test(pfad)) return pfad;
  if (!pfad.startsWith(`${wurzel}/`)) return null;
  return pfad.slice(wurzel.length + 1);
}

function gitDateien(args) {
  const ausgabe = execFileSync('git', args, { encoding: 'utf8' });
  return ausgabe.split('\n').filter(Boolean);
}

function zuPruefendePfade(argv) {
  if (argv.includes('--staged')) {
    return gitDateien(['diff', '--cached', '--name-only', '--diff-filter=ACMR']);
  }
  const pfade = argv.filter((a) => !a.startsWith('--'));
  if (pfade.length > 0) return pfade;
  return gitDateien(['ls-files', '--cached', '--others', '--exclude-standard']).filter((pfad) =>
    existsSync(pfad),
  );
}

const istHauptmodul = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

function meldeVerstoesse(abschnitte, exitCode) {
  const nichtLeer = abschnitte.filter((a) => a.verstoesse.length > 0);
  if (nichtLeer.length === 0) return;
  for (const { titel, verstoesse } of nichtLeer) {
    console.error(`${titel}:`);
    for (const eintrag of verstoesse) console.error(`  ${eintrag}`);
  }
  process.exit(exitCode);
}

function pruefeAlle(pfade) {
  return [
    {
      titel: 'Ordnernamen mit Großbuchstaben (nur Kleinbuchstaben erlaubt)',
      verstoesse: ordnerVerstoesse(pfade),
    },
    {
      titel: 'Git-Pfad weicht in der Groß-/Kleinschreibung vom Dateisystem ab',
      verstoesse: dateiCaseVerstoesse(pfade),
    },
  ];
}

if (istHauptmodul) {
  if (process.argv.includes('--hook')) {
    const pfad = pfadAusHookEingabe(readFileSync(0, 'utf8'), process.cwd());
    meldeVerstoesse(pfad === null ? [] : pruefeAlle([pfad]), 2);
  } else {
    meldeVerstoesse(pruefeAlle(zuPruefendePfade(process.argv.slice(2))), 1);
  }
}
