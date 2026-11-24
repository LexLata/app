#!/usr/bin/env node
// scripts/automatisch/ungenutzter-app-code.mjs
//
// Ungenutzter App-Code ist ein Fehler. Gemeldet wird jede exportierte Funktion,
// jeder exportierte Wert und Typ und jede Datei unter src/, die der App-Code
// (ab src/main.tsx und der Ziehvorschau) nirgends nutzt, auch nicht in der
// eigenen Datei. Nutzung durch Tests zählt nicht. Ausgenommen sind nur die
// begründeten Testzugänge aus interface-namen-testzugaenge.json und die
// Testhilfen unter src/test/. Ein Testzugang deckt nur die Interface-Zeile ab
// (samt Weiterreichungen im Modulordner auf dem Weg dorthin): Nutzt der
// App-Code die Funktion oder den Typ dahinter nirgends, wird sie trotzdem
// gemeldet.
//
// Grundlage ist knip im Produktionsmodus (Tests nicht im Projekt,
// ignoreExportsUsedInFile). Die knip-Konfiguration steht unten in KNIP_KONFIGURATION.
//
// Aufruf: node scripts/automatisch/ungenutzter-app-code.mjs
//         (Projekt im Arbeitsverzeichnis; Exit-Code 1 bei Funden)

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { liesTestzugaenge } from './interface-namen-pruefen.mjs';

const TESTZUGAENGE_DATEI = 'scripts/automatisch/interface-namen-testzugaenge.json';
const KNIP = fileURLToPath(new URL('../../node_modules/knip/bin/knip.js', import.meta.url));

// Das `!` markiert Produktionsdateien; Tests und src/test/ gehören nicht dazu.
const KNIP_KONFIGURATION = {
  entry: ['src/main.tsx!', 'src/components/ziehvorschau/ziehvorschau.start.ts!'],
  project: ['src/**/*.{ts,tsx}!', '!src/test/**!'],
  ignoreExportsUsedInFile: true,
};

const ART_TEXT = { export: 'Export', typ: 'Typ', datei: 'Datei' };

/**
 * Wandelt den JSON-Bericht von knip in eine Fundliste.
 * @returns {{datei: string, art: 'export'|'typ'|'datei', name?: string, zeile?: number}[]}
 */
export function liesKnipBericht(text) {
  const funde = [];
  for (const eintrag of JSON.parse(text).issues ?? []) {
    if ((eintrag.files ?? []).length > 0) funde.push({ datei: eintrag.file, art: 'datei' });
    for (const x of eintrag.exports ?? []) {
      funde.push({ datei: eintrag.file, art: 'export', name: x.name, zeile: x.line });
    }
    for (const x of eintrag.types ?? []) {
      funde.push({ datei: eintrag.file, art: 'typ', name: x.name, zeile: x.line });
    }
  }
  return funde;
}

/**
 * Prüft, ob die Fundzeile in einer Weiterreichung (`export { … } from '…'`)
 * steht und nicht in der Definition selbst.
 */
function istWeiterreichung(quelltext, zeile) {
  const zeilen = quelltext.split('\n');
  let anfang = zeile - 1;
  while (anfang > 0 && !/^\s*export\b/.test(zeilen[anfang])) anfang -= 1;
  let ende = anfang;
  while (ende < zeilen.length - 1 && !/;\s*$|\bfrom\s/.test(zeilen[ende])) ende += 1;
  const anweisung = zeilen.slice(anfang, ende + 1).join(' ');
  return /^\s*export\s+(type\s+)?\{[^}]*\}\s*from\s/.test(anweisung);
}

/**
 * Entfernt die Funde, die ein Testzugang abdeckt. Er deckt nur ab, dass der
 * Name im Interface steht: die Interface-Zeile selbst und Weiterreichungen
 * im Modulordner auf dem Weg dorthin. Die Funktion oder der Typ dahinter
 * bleibt der Prüfung unterworfen; nutzt der App-Code sie nirgends, meldet
 * knip die Definition, und dieser Fund bleibt stehen.
 */
export function ohneTestzugaenge(funde, testzugaenge, liesDatei) {
  const zugaenge = testzugaenge.flatMap(({ interface: pfad, namen }) =>
    Object.keys(namen).map((name) => ({ interface: pfad, ordner: `${dirname(pfad)}/`, name })),
  );
  const abgedeckt = (f) =>
    zugaenge.some(
      (z) =>
        z.name === f.name &&
        (f.datei === z.interface ||
          (f.datei.startsWith(z.ordner) && istWeiterreichung(liesDatei(f.datei), f.zeile))),
    );
  return funde.filter((f) => !(f.name && abgedeckt(f)));
}

export function formatiereFund(f) {
  const ort = f.zeile ? `${f.datei}:${f.zeile}` : f.datei;
  return f.name ? `${ort}  ${ART_TEXT[f.art]} ${f.name}` : `${ort}  ${ART_TEXT[f.art]}`;
}

const ERKLAERUNG = `
Regel: Jeder Export (Funktion, Wert, Typ) und jede Datei unter src/ muss vom
App-Code genutzt werden (Einstieg src/main.tsx). Nutzung nur durch Tests zählt
nicht; direkte Tests von Hilfsfunktionen bleiben erlaubt, solange der App-Code
die Funktion nutzt. Die Nutzung in der eigenen Datei zählt.

Zulässige Lösungen:
  1. Ungenutzten Code löschen, samt der Tests, die nur ihn prüfen. Wird dadurch
     weiterer Code ungenutzt, auch diesen behandeln.
  2. Wird nur das Schlüsselwort "export" nicht gebraucht (Nutzung nur in der
     eigenen Datei), "export" entfernen.
  3. Nur für Namen eines Modul-Interfaces (*.index.ts), die Tests außerhalb des
     Moduls als vereinbarten Vertrag brauchen: begründeten Testzugang in
     ${TESTZUGAENGE_DATEI} eintragen (Vertrag und Test nennen).
     Ein Testzugang deckt nur die Interface-Zeile ab: Die Funktion oder der Typ
     dahinter muss trotzdem vom App-Code genutzt werden.
  Sieht der Code nach einer angefangenen, noch nicht angeschlossenen Funktion
  aus, nicht löschen, sondern dem Nutzer melden.

Unzulässig sind Umgehungen: keine Unterdrückung (knip-JSDoc-Tags wie public
oder alias, ignore-Einträge, neue Ausnahmelisten, Änderung der
Prüfkonfiguration) und kein Erhalt eines Exports durch künstliche Nutzung im
App-Code.`;

function main() {
  const wurzel = process.cwd();
  const testzugaenge = liesTestzugaenge(readFileSync(join(wurzel, TESTZUGAENGE_DATEI), 'utf8'));
  const ordner = mkdtempSync(join(tmpdir(), 'ungenutzter-app-code-'));
  let lauf;
  try {
    const konfiguration = join(ordner, 'knip.json');
    writeFileSync(konfiguration, JSON.stringify(KNIP_KONFIGURATION));
    lauf = spawnSync(
      process.execPath,
      [
        KNIP,
        '--production',
        '--no-config-hints',
        '--config',
        konfiguration,
        '--include',
        'exports,types,files',
        '--reporter',
        'json',
        '--no-exit-code',
      ],
      { cwd: wurzel, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
  } finally {
    rmSync(ordner, { recursive: true, force: true });
  }
  if (lauf.status !== 0) {
    console.error(`Ungenutzter App-Code: knip ist gescheitert.\n${lauf.stderr}${lauf.stdout}`);
    process.exitCode = 2;
    return;
  }
  const funde = ohneTestzugaenge(liesKnipBericht(lauf.stdout), testzugaenge, (datei) =>
    readFileSync(join(wurzel, datei), 'utf8'),
  );
  if (funde.length === 0) {
    console.log('Ungenutzter App-Code: keine Funde.');
    return;
  }
  for (const f of funde) console.error(`Ungenutzter App-Code: ${formatiereFund(f)}`);
  console.error(ERKLAERUNG);
  console.error(`\nUngenutzter App-Code: ${funde.length} Funde.`);
  process.exitCode = 1;
}

const istHauptmodul = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (istHauptmodul) main();
