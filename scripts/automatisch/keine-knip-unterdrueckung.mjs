#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { pathToFileURL } from 'node:url';

// Vollständige Liste der Knip-Tags, die Exporte von der Ungenutzt-Prüfung ausnehmen (knip/dist/constants.js).
const VERBOTENE_NAMEN = ['public', 'beta', 'alias', 'internal'];
const CODE_ENDUNGEN = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const MARKIERUNG = new RegExp(`@(${VERBOTENE_NAMEN.join('|')})\\b`, 'g');

/**
 * Findet Knip-Unterdrückungsmarkierungen in den übergebenen Dateien.
 * @param {Iterable<{pfad: string, inhalt: string}>} dateien
 * @returns {{pfad: string, zeile: number, markierung: string}[]}
 */
export function findeKnipUnterdrueckungen(dateien) {
  const funde = [];
  for (const { pfad, inhalt } of dateien) {
    for (const [index, zeile] of inhalt.split('\n').entries()) {
      MARKIERUNG.lastIndex = 0;
      for (const treffer of zeile.matchAll(MARKIERUNG)) {
        funde.push({ pfad, zeile: index + 1, markierung: treffer[0] });
      }
    }
  }
  return funde;
}

function projektCodeDateien() {
  const ausgabe = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
  });
  return ausgabe
    .split('\n')
    .filter((pfad) => pfad && CODE_ENDUNGEN.has(extname(pfad)) && existsSync(pfad))
    .map((pfad) => ({ pfad, inhalt: readFileSync(pfad, 'utf8') }));
}

const istHauptmodul = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (istHauptmodul) {
  const funde = findeKnipUnterdrueckungen(projektCodeDateien());
  if (funde.length > 0) {
    console.error(
      'Verbotene Knip-Unterdrückungsmarkierungen gefunden. Nicht genutzte Exporte müssen samt der Tests, die nur sie prüfen, gelöscht werden; künstliche Nutzung ist keine Lösung:',
    );
    for (const fund of funde) {
      console.error(`  ${fund.pfad}:${fund.zeile}  ${fund.markierung}`);
    }
    process.exit(1);
  }
}
