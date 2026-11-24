#!/usr/bin/env node
// scripts/automatisch/zeilenlimit-pruefen.mjs
//
// Verpflichtende Zeilengrenze: höchstens 500 Zeilen je Produktionsdatei unter src/
// (TypeScript ohne Tests/Testhilfen) und src-tauri/src/ (Rust). Kommentare zählen mit.
// Rust: Nur vollständig erkannte Testmodule am Dateiende werden abgezogen;
// bei unklarer Abgrenzung zählt die ganze Datei. src-tauri/tests/ enthält nur Tests.
// Ausnahmen in zeilenlimit-ausnahmen.json brauchen eine Begründung und das exakte
// Maximum der tatsächlichen Produktionszeilen. Wachstum führt zum Fehler; bei
// Schrumpfung muss das Maximum im selben Commit sinken. Unter 501 Zeilen oder
// bei gelöschten Dateien ist die Ausnahme zu entfernen.
//
// Aufruf: node scripts/automatisch/zeilenlimit-pruefen.mjs           (versionierte und
//         ungetrackte, nicht ignorierte Dateien)
//         node scripts/automatisch/zeilenlimit-pruefen.mjs --staged  (Pre-Commit: nur Dateien
//         im Index, damit eine unfertige, nicht zum Commit vorgesehene Datei nicht blockiert)
// Geprüft wird das Git-Repository des Arbeitsverzeichnisses.
// Exit-Code 1 bei Fehlern, sonst 0.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const GRENZE = 500;

const AUSNAHMEN_DATEI = 'scripts/automatisch/zeilenlimit-ausnahmen.json';

/** Zeilenzahl wie `wc -l`; eine letzte Zeile ohne Zeilenumbruch zählt mit. */
export function zaehleZeilen(inhalt) {
  if (inhalt === '') return 0;
  const teile = inhalt.split('\n').length;
  return inhalt.endsWith('\n') ? teile - 1 : teile;
}

/** Maskiert Rust-Kommentare und Literale positionsgetreu; unvollständig: null. */
function maskiereRust(text) {
  let maske = '';
  let i = 0;
  const maskieren = (ende) => {
    maske += text.slice(i, ende).replace(/[^\n\r]/g, ' ');
    i = ende;
  };
  while (i < text.length) {
    if (text.startsWith('//', i)) {
      const ende = text.indexOf('\n', i);
      maskieren(ende < 0 ? text.length : ende);
    } else if (text.startsWith('/*', i)) {
      let tiefe = 1;
      let ende = i + 2;
      while (ende < text.length && tiefe > 0) {
        if (text.startsWith('/*', ende)) {
          tiefe++;
          ende += 2;
        } else if (text.startsWith('*/', ende)) {
          tiefe--;
          ende += 2;
        } else ende++;
      }
      if (tiefe) return null;
      maskieren(ende);
    } else {
      const roh = /^(?:br|cr|r)(#*)"/.exec(text.slice(i));
      if (roh) {
        const schluss = '"' + roh[1];
        const ende = text.indexOf(schluss, i + roh[0].length);
        if (ende < 0) return null;
        maskieren(ende + schluss.length);
      } else if (text[i] === '"') {
        let ende = i + 1;
        while (ende < text.length && text[ende] !== '"') {
          ende += text[ende] === '\\' ? 2 : 1;
        }
        if (ende >= text.length) return null;
        maskieren(ende + 1);
      } else {
        // Apostrophe ohne abschließendes Apostroph sind Rust-Lebensdauern.
        const zeichen = /^'(?:\\(?:u\{[0-9a-fA-F_]+\}|x[0-9a-fA-F]{2}|[^\r\n])|[^'\\\r\n])'/u.exec(
          text.slice(i),
        );
        if (zeichen) maskieren(i + zeichen[0].length);
        else maske += text[i++];
      }
    }
  }
  return maske;
}

/** Zieht ausschließlich zusammenhängende, vollständig erkannte Rust-Testmodule am Ende ab. */
export function zaehleProduktionszeilen(pfad, inhalt) {
  if (!pfad.endsWith('.rs')) return zaehleZeilen(inhalt);
  const maske = maskiereRust(inhalt);
  if (maske === null) return zaehleZeilen(inhalt);
  if (/^\s*#!\s*\[\s*cfg\s*\(\s*test\s*\)\s*\]/.test(maske)) return 0;
  const module = [];
  const klammern = [];
  const kopf = /#\s*\[\s*cfg\s*\(\s*test\s*\)\s*\]\s*mod\s+[a-zA-Z_][a-zA-Z_0-9]*\s*\{/y;
  let testStart = null;
  for (let i = 0; i < maske.length; i++) {
    if (klammern.length === 0 && maske[i] === '#') {
      kopf.lastIndex = i;
      if (kopf.test(maske)) testStart = i;
    }
    if ('{[('.includes(maske[i])) klammern.push(maske[i]);
    else if ('}])'.includes(maske[i])) {
      const erwartet = { '}': '{', ']': '[', ')': '(' }[maske[i]];
      if (klammern.pop() !== erwartet) return zaehleZeilen(inhalt);
      if (klammern.length === 0 && maske[i] === '}' && testStart !== null) {
        module.push({ start: testStart, ende: i + 1 });
        testStart = null;
      }
    }
  }
  if (klammern.length) return zaehleZeilen(inhalt);
  let ende = maske.length;
  for (const modul of module.reverse()) {
    if (maske.slice(modul.ende, ende).trim() !== '') break;
    ende = modul.start;
  }
  // Bei reinen Testdateien zählen auch die davorliegenden Kommentare nicht.
  if (ende < maske.length && maske.slice(0, ende).trim() === '') return 0;
  return zaehleZeilen(inhalt.slice(0, ende));
}

/** Produktionsdateien unter src/; Tests und Testhilfen sind ausgenommen. */
export function unterliegtZeilenlimit(pfad) {
  return (
    (pfad.startsWith('src-tauri/src/') && pfad.endsWith('.rs')) ||
    (pfad.startsWith('src/') &&
      /\.(ts|tsx)$/.test(pfad) &&
      !/\.test\.(ts|tsx)$/.test(pfad) &&
      !pfad.startsWith('src/test/'))
  );
}

/** Liest die Ausnahmeliste; wirft bei ungültiger Form. Inhaltliche Prüfung: pruefeZeilenlimit. */
export function liesAusnahmen(text) {
  let dokument;
  try {
    dokument = JSON.parse(text);
  } catch (fehler) {
    throw new Error(`Ausnahmeliste ist kein gültiges JSON: ${fehler.message}`, { cause: fehler });
  }
  const liste = dokument?.ausnahmen;
  if (!Array.isArray(liste)) {
    throw new Error('Ausnahmeliste braucht ein Feld "ausnahmen" mit einer Liste.');
  }
  for (const eintrag of liste) {
    if (typeof eintrag !== 'object' || eintrag === null || Array.isArray(eintrag)) {
      throw new Error('Jede Ausnahme muss ein Objekt mit datei, maximum und begruendung sein.');
    }
  }
  return liste;
}

/**
 * @param {{ dateien: { pfad: string, zeilen: number }[],
 *           ausnahmen: { datei: string, maximum: number, begruendung: string }[] }} eingabe
 * @returns {{ fehler: string[] }}
 */
export function pruefeZeilenlimit({ dateien, ausnahmen }) {
  const fehler = [];
  const zeilenJeDatei = new Map(dateien.map(({ pfad, zeilen }) => [pfad, zeilen]));
  const gueltigeMaxima = new Map();
  const gesehen = new Set();

  for (const eintrag of ausnahmen) {
    const pfad = eintrag.datei;
    if (typeof pfad !== 'string' || pfad === '') {
      fehler.push('Ausnahme ohne Dateipfad.');
      continue;
    }
    if (gesehen.has(pfad)) {
      fehler.push(`${pfad}: steht doppelt in der Ausnahmeliste.`);
      continue;
    }
    gesehen.add(pfad);

    let gueltig = true;
    if (!Number.isInteger(eintrag.maximum) || eintrag.maximum <= GRENZE) {
      fehler.push(`${pfad}: Das Maximum muss eine ganze Zahl über ${GRENZE} sein.`);
      gueltig = false;
    }
    if (typeof eintrag.begruendung !== 'string' || eintrag.begruendung.trim() === '') {
      fehler.push(`${pfad}: Die Ausnahme braucht eine Begründung.`);
      gueltig = false;
    }

    const zeilen = zeilenJeDatei.get(pfad);
    if (zeilen === undefined) {
      fehler.push(
        `${pfad}: Die Ausnahme verweist auf keine Produktionsdatei (gelöscht, umbenannt oder nicht prüfpflichtig). Eintrag entfernen oder Pfad korrigieren.`,
      );
      continue;
    }
    if (zeilen <= GRENZE) {
      fehler.push(
        `${pfad}: Die Datei hält mit ${zeilen} Zeilen die Grenze von ${GRENZE} ein. Ausnahme aus der Liste entfernen.`,
      );
    }
    if (gueltig) gueltigeMaxima.set(pfad, eintrag.maximum);
  }

  for (const { pfad, zeilen } of dateien) {
    if (zeilen <= GRENZE) continue;
    const maximum = gueltigeMaxima.get(pfad);
    if (maximum === undefined) {
      fehler.push(
        `${pfad}: ${zeilen} Zeilen, erlaubt sind ${GRENZE}. Verantwortungen trennen und aufteilen – oder eine fachlich begründete Ausnahme in ${AUSNAHMEN_DATEI} eintragen.`,
      );
    } else if (zeilen > maximum) {
      fehler.push(
        `${pfad}: ${zeilen} Zeilen, die Ausnahme erlaubt höchstens ${maximum}. Datei wieder verkleinern; ein höheres Maximum braucht eine neue Entscheidung mit Begründung.`,
      );
    } else if (zeilen < maximum) {
      fehler.push(
        `${pfad}: ${zeilen} Zeilen bei einem Maximum von ${maximum}. Maximum auf ${zeilen} senken, damit die Datei nicht wieder wächst.`,
      );
    }
  }

  return { fehler };
}

/** Dateien im Index; außerhalb des Hooks auch ungetrackte, nicht ignorierte. */
function zuPruefendeDateien(nurIndex) {
  const auswahl = nurIndex ? ['--cached'] : ['--cached', '--others', '--exclude-standard'];
  return execFileSync(
    'git',
    ['ls-files', '-z', ...auswahl, '--', 'src', 'src-tauri/src', 'src-tauri/tests'],
    { encoding: 'utf8' },
  )
    .split('\0')
    .filter(Boolean);
}

function main() {
  process.chdir(execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim());
  const dateien = zuPruefendeDateien(process.argv.slice(2).includes('--staged'))
    .filter((pfad) => unterliegtZeilenlimit(pfad) && existsSync(pfad))
    .map((pfad) => ({ pfad, zeilen: zaehleProduktionszeilen(pfad, readFileSync(pfad, 'utf8')) }));
  const ausnahmen = liesAusnahmen(readFileSync(AUSNAHMEN_DATEI, 'utf8'));

  const { fehler } = pruefeZeilenlimit({ dateien, ausnahmen });
  if (fehler.length > 0) {
    for (const meldung of fehler) console.error(`Zeilenlimit: ${meldung}`);
    console.error(`\nZeilenlimit: ${fehler.length} Verstoß/Verstöße.`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `Zeilenlimit: ${dateien.length} Dateien geprüft, ${ausnahmen.length} Ausnahmen, keine Verstöße.`,
  );
}

const istHauptmodul = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (istHauptmodul) main();
