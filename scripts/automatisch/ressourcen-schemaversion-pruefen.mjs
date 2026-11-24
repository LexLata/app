#!/usr/bin/env node
// Prüft die gebündelten App-eigenen XML-Dateien auf Wurzel und Schemaversion.
// Einschließlich Normgeber-Unterordnern der nichtamtlichen Titel.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SaxesParser } from 'saxes';

const FORMATE = [
  ['europa', 'gesetz'],
  ['importindizes', 'importindex'],
  ['nichtamtliche-titel', 'nichtamtlicheTitel'],
  ['praefixstrukturen', 'praefixstrukturen'],
];

function pruefeXmlStruktur(xml) {
  const parser = new SaxesParser({ xmlns: true });
  parser.on('opentag', (tag) => {
    if (![...tag.name].every((zeichen) => zeichen.charCodeAt(0) < 128)) {
      throw new Error(`Nicht-ASCII-Elementname: ${tag.name}`);
    }
    for (const name of Object.keys(tag.attributes)) {
      if (![...name].every((zeichen) => zeichen.charCodeAt(0) < 128)) {
        throw new Error(`Nicht-ASCII-Attributname: ${name}`);
      }
    }
  });
  parser.write(xml).close();
}

function wurzelTag(xml) {
  let position = xml.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (position < xml.length) {
    while (/\s/.test(xml[position] ?? '') && position < xml.length) position++;
    if (xml.startsWith('<!--', position)) {
      const ende = xml.indexOf('-->', position + 4);
      if (ende < 0) return null;
      position = ende + 3;
      continue;
    }
    if (xml.startsWith('<?', position)) {
      const ende = xml.indexOf('?>', position + 2);
      if (ende < 0) return null;
      position = ende + 2;
      continue;
    }
    if (/^<!DOCTYPE\b/i.test(xml.slice(position, position + 9))) {
      position += 9;
      let tiefe = 0;
      let zitat = null;
      let geschlossen = false;
      for (; position < xml.length; position++) {
        const zeichen = xml[position];
        if (zitat) {
          if (zeichen === zitat) zitat = null;
        } else if (xml.startsWith('<!--', position)) {
          const kommentarEnde = xml.indexOf('-->', position + 4);
          if (kommentarEnde < 0) return null;
          position = kommentarEnde + 2;
        } else if (zeichen === '"' || zeichen === "'") {
          zitat = zeichen;
        } else if (zeichen === '[') {
          tiefe++;
        } else if (zeichen === ']') {
          tiefe--;
          if (tiefe < 0) return null;
        } else if (zeichen === '>' && tiefe === 0) {
          position++;
          geschlossen = true;
          break;
        }
      }
      if (!geschlossen) return null;
      continue;
    }
    break;
  }

  const start = xml.slice(position).match(/^<([A-Za-z_][\w.:-]*)(?=[\s/>])/);
  if (!start) return null;
  const name = start[1];
  position += start[0].length;
  const attribute = new Map();
  while (position < xml.length) {
    const vorLeerraum = position;
    while (/\s/.test(xml[position] ?? '') && position < xml.length) position++;
    if (xml.startsWith('/>', position) || xml[position] === '>') return { name, attribute };
    if (position === vorLeerraum) return null;
    const attribut = xml.slice(position).match(/^([A-Za-z_][\w.:-]*)\s*=\s*(["'])(.*?)\2/s);
    if (!attribut || attribute.has(attribut[1])) return null;
    attribute.set(attribut[1], { wert: attribut[3], quote: attribut[2] });
    position += attribut[0].length;
  }
  return null;
}

/** XML-Dateien rekursiv; Pfadteile bleiben für plattformunabhängige Befunde getrennt. */
function xmlDateipfade(ordnerPfad, teile = []) {
  return readdirSync(join(ordnerPfad, ...teile), { withFileTypes: true }).flatMap((datei) => {
    const pfad = [...teile, datei.name];
    if (datei.isDirectory()) return xmlDateipfade(ordnerPfad, pfad);
    return datei.isFile() && datei.name.endsWith('.xml') ? [pfad] : [];
  });
}

/**
 * Gibt nach relativem Pfad sortierte Befunde für alle erwarteten Ressourcen zurück.
 * @param {string} resourcesOrdner
 * @returns {string[]}
 */
export function pruefeRessourcen(resourcesOrdner) {
  const befunde = [];
  for (const [ordner, erwarteteWurzel] of FORMATE) {
    const ordnerPfad = join(resourcesOrdner, ordner);
    // Die Listen entstehen erst durch den Entwickler-Prüflauf.
    if (ordner === 'praefixstrukturen' && !existsSync(ordnerPfad)) continue;
    let dateien;
    try {
      dateien = xmlDateipfade(ordnerPfad);
    } catch {
      befunde.push(`${ordner}: erwarteter Unterordner fehlt oder ist nicht lesbar`);
      continue;
    }
    const xmlDateien = dateien;
    if (xmlDateien.length === 0 && ordner !== 'praefixstrukturen')
      befunde.push(`${ordner}: keine XML-Dateien vorhanden`);
    for (const datei of xmlDateien) {
      const pfad = `${ordner}/${datei.join('/')}`;
      let xml;
      try {
        xml = readFileSync(join(ordnerPfad, ...datei), 'utf8');
      } catch {
        befunde.push(`${pfad}: Datei nicht lesbar`);
        continue;
      }
      try {
        pruefeXmlStruktur(xml);
      } catch (fehler) {
        befunde.push(`${pfad}: XML ungültig (${fehler.message})`);
        continue;
      }
      const wurzel = wurzelTag(xml);
      if (!wurzel || wurzel.name !== erwarteteWurzel) {
        befunde.push(`${pfad}: erwartete Wurzel <${erwarteteWurzel}> fehlt oder ist ungültig`);
      } else if (
        wurzel.attribute.get('version')?.wert !== '1' ||
        wurzel.attribute.get('version')?.quote !== '"'
      ) {
        befunde.push(`${pfad}: am Wurzel-Tag fehlt das exakte Attribut version="1"`);
      } else if (ordner === 'nichtamtliche-titel') {
        const zeit = xml.match(
          /<infos>\s*[\s\S]*?<geaendert>([^<]*)<\/geaendert>[\s\S]*?<\/infos>/,
        )?.[1];
        const datum = zeit ? new Date(zeit) : null;
        if (
          !zeit ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(zeit) ||
          !datum ||
          Number.isNaN(datum.getTime()) ||
          datum.toISOString().replace(/\.000Z$/, 'Z') !== zeit
        ) {
          befunde.push(`${pfad}: infos/geaendert muss UTC mit Z ohne Millisekunden enthalten`);
        }
      }
    }
  }
  return befunde.sort((a, b) => a.localeCompare(b, 'de'));
}

const istHauptmodul =
  process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (istHauptmodul) {
  const resourcesOrdner = process.argv[2]
    ? resolve(process.argv[2])
    : fileURLToPath(new URL('../../src-tauri/resources/', import.meta.url));
  const befunde = pruefeRessourcen(resourcesOrdner);
  if (befunde.length > 0) {
    console.error('Ressourcen mit ungültiger Schemaversion:');
    for (const befund of befunde) console.error(`  ${befund}`);
    process.exitCode = 1;
  } else {
    console.log('Ressourcen-Schemaversion: alle XML-Dateien gültig.');
  }
}
