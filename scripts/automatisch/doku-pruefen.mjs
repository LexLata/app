#!/usr/bin/env node
// scripts/automatisch/doku-pruefen.mjs
// Prüft ARCHITEKTUR.md (höchstens 6.000 Zeichen) und rekursiv docs/doku/**/*.md.
// Lokale Markdown-Links und Referenzdefinitionen sind dokumentrelativ;
// eindeutige Repositorypfade in Inline-Code sind projektwurzelrelativ.
// Dateinamen und jedes Ordnersegment müssen exakt geschrieben sein, auch auf
// macOS/Windows. Bei Repositoryvorlagen wird nur der feste Ordneranteil geprüft.
// Externe URLs, reine Fragmente, XML-Pfade und AppData-Dateinamen werden nicht
// als Repositorypfade behandelt. Linkfragmente und externe Webseiten werden
// nicht geprüft. Markdown-Beispiele in Codeblöcken und Kommentare bleiben außen vor.
// Aufruf: npm run pruefen:doku; keine Abhängigkeiten oder gespeicherten Prüfdaten.

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJEKTWURZEL = fileURLToPath(new URL('../..', import.meta.url));
const REPOSITORYPFAD = /^(?:src|src-tauri|docs|scripts|eslint-rules|\.agents|\.husky)\//;

function markdownDateien(ordner) {
  return readdirSync(ordner, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((eintrag) => {
      const pfad = join(ordner, eintrag.name);
      if (eintrag.isDirectory()) return markdownDateien(pfad);
      return eintrag.isFile() && eintrag.name.endsWith('.md') ? [pfad] : [];
    });
}

function leerMaskieren(text) {
  return text.replace(/[^\r\n]/g, ' ');
}

/** Entfernt Beispiele aus der Analyse, ohne Zeilennummern zu verschieben. */
function ohneBeispiele(text) {
  let zaun = null;
  return text
    .replace(/<!--[\s\S]*?-->/g, leerMaskieren)
    .split('\n')
    .map((zeile) => {
      const beginn = zeile.match(/^ {0,3}(`{3,}|~{3,})/);
      if (zaun) {
        if (new RegExp(`^ {0,3}${zaun.zeichen}{${zaun.laenge},}\\s*$`).test(zeile)) zaun = null;
        return leerMaskieren(zeile);
      }
      if (beginn) {
        zaun = { zeichen: beginn[1][0], laenge: beginn[1].length };
        return leerMaskieren(zeile);
      }
      return zeile;
    })
    .join('\n');
}

function dokumentPfade(text) {
  const pfade = [];
  const bereinigt = ohneBeispiele(text);
  const zeileBei = (position) => bereinigt.slice(0, position).split('\n').length;
  const ohneInlineCode = bereinigt.replace(
    /(`+)([^`\n]+)\1/g,
    (treffer, _zaun, inhalt, position) => {
      if (REPOSITORYPFAD.test(inhalt)) {
        // Platzhalter sind keine existierenden Dateien; ihr fester Elternordner schon.
        const vorlageAb = inhalt.search(/[<{*]/);
        const pfad =
          vorlageAb < 0 ? inhalt : inhalt.slice(0, inhalt.lastIndexOf('/', vorlageAb) + 1);
        pfade.push({ pfad, zeile: zeileBei(position), projektRelativ: true });
      }
      return leerMaskieren(treffer);
    },
  );
  const muster = [
    /!?\[[^\]\n]*\]\(\s*(<[^>\n]+>|(?:\([^()\s]*\)|[^\s()])+)(?:\s+["'][^\n]*?["'])?\s*\)/g,
    /^ {0,3}\[[^\]\n]+\]:\s*(<[^>\n]+>|\S+)/gm,
  ];
  for (const regex of muster) {
    for (const treffer of ohneInlineCode.matchAll(regex)) {
      const pfad = treffer[1].replace(/^<|>$/g, '');
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(pfad)) continue;
      pfade.push({ pfad, zeile: zeileBei(treffer.index), projektRelativ: false });
    }
  }
  return pfade.sort((a, b) => a.zeile - b.zeile);
}

/** Segmentweise prüfen statt existsSync: dessen Case-Toleranz ist plattformabhängig. */
function pfadFehler(wurzel, dokument, angabe) {
  let pfad = angabe.pfad;
  if (!angabe.projektRelativ) {
    try {
      pfad = decodeURIComponent(pfad.split(/[?#]/)[0]);
    } catch {
      return `Ungültige Pfadkodierung: ${pfad}`;
    }
  }
  if (!pfad) return null;
  const ziel = pfad.startsWith('/')
    ? resolve(wurzel, `.${pfad}`)
    : resolve(angabe.projektRelativ ? wurzel : dirname(dokument), pfad);
  const relativ = relative(wurzel, ziel);
  if (isAbsolute(relativ) || relativ === '..' || relativ.startsWith(`..${sep}`)) {
    return `Pfad außerhalb des Repositorys: ${angabe.pfad}`;
  }
  let ordner = wurzel;
  for (const segment of relativ.split(sep).filter(Boolean)) {
    let eintraege;
    try {
      eintraege = readdirSync(ordner);
    } catch {
      return `Pfad fehlt: ${angabe.pfad}`;
    }
    if (!eintraege.includes(segment)) {
      const tatsaechlich = eintraege.find((name) => name.toLowerCase() === segment.toLowerCase());
      return tatsaechlich === undefined
        ? `Pfad fehlt: ${angabe.pfad}`
        : `Pfadschreibung weicht ab: ${angabe.pfad} (tatsächlich: ${tatsaechlich})`;
    }
    ordner = join(ordner, segment);
  }
  return null;
}

export function pruefeDokumentation(projektWurzel = PROJEKTWURZEL) {
  const wurzel = resolve(projektWurzel);
  const fehler = [];
  const architektur = join(wurzel, 'docs/ARCHITEKTUR.md');
  const dateien = [architektur];
  try {
    dateien.push(...markdownDateien(join(wurzel, 'docs/doku')));
  } catch (ursache) {
    fehler.push(
      ursache.code === 'ENOENT'
        ? 'docs/doku: Dokumentationsordner fehlt.'
        : `docs/doku: Dokumentationsordner kann nicht gelesen werden: ${ursache.message}`,
    );
  }
  for (const datei of dateien) {
    const name = relative(wurzel, datei).split(sep).join('/');
    let text;
    try {
      text = readFileSync(datei, 'utf8');
    } catch {
      fehler.push(`${name}: Dokument kann nicht gelesen werden.`);
      continue;
    }
    if (datei === architektur) {
      // Unicode-Zeichen einschließlich Markdown und Leerraum; CRLF zählt wie LF.
      const zeichen = [...text.replace(/\r\n/g, '\n')].length;
      if (zeichen > 6000) fehler.push(`${name}: ${zeichen} Zeichen; höchstens 6000 erlaubt.`);
    }
    for (const angabe of dokumentPfade(text)) {
      const befund = pfadFehler(wurzel, datei, angabe);
      if (befund) fehler.push(`${name}:${angabe.zeile}: ${befund}`);
    }
  }
  return [...new Set(fehler)];
}

const istHauptmodul = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (istHauptmodul) {
  const fehler = pruefeDokumentation();
  if (fehler.length) {
    console.error(fehler.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('Dokumentation: Architekturumfang und lokale Repositorypfade sind gültig.');
  }
}
