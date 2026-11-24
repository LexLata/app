#!/usr/bin/env node
// Prüft erklärende Kopfkommentare in produktiven TypeScript- und Rust-Dateien.
// Ohne Argumente gilt der Arbeitsbaum, mit --staged der Git-Index für Pre-Commit.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function istProduktionsdatei(pfad) {
  return (
    ((pfad.startsWith('src/') && /\.(ts|tsx)$/.test(pfad)) ||
      (pfad.startsWith('src-tauri/src/') && pfad.endsWith('.rs'))) &&
    !/\.test\.(ts|tsx|rs)$/.test(pfad)
  );
}

export function hatErklaerendenKopfkommentar(inhalt, pfad) {
  const zeilen = inhalt.replace(/^\uFEFF/, '').split(/\r?\n/);
  const erste = zeilen[0];
  if (!erste.startsWith('//') && !erste.startsWith('/*')) return false;

  const kommentarteile = [];
  if (erste.startsWith('//')) {
    for (const zeile of zeilen) {
      if (!zeile.startsWith('//')) break;
      kommentarteile.push(zeile.slice(2).trim());
    }
  } else {
    for (const zeile of zeilen) {
      const ende = zeile.indexOf('*/');
      kommentarteile.push(
        zeile
          .slice(0, ende === -1 ? undefined : ende)
          .replace(/^\s*\/\*+|^\s*\*/, '')
          .trim(),
      );
      if (ende !== -1) break;
    }
  }

  const dateiname = pfad.split('/').at(-1);
  return kommentarteile.some((teil) => teil !== '' && teil !== dateiname);
}

function gitPfade(argumente) {
  return execFileSync('git', argumente, { encoding: 'utf8' }).split('\0').filter(Boolean);
}

const istHauptmodul = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (istHauptmodul) {
  const staged = process.argv.includes('--staged');
  const pfade = staged
    ? gitPfade(['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMR'])
    : gitPfade(['ls-files', '--cached', '--others', '--exclude-standard', '-z']);
  const funde = [];
  for (const pfad of pfade.filter(istProduktionsdatei)) {
    if (!staged && !existsSync(pfad)) continue;
    const inhalt = staged
      ? execFileSync('git', ['show', `:${pfad}`], { encoding: 'utf8' })
      : readFileSync(pfad, 'utf8');
    if (!hatErklaerendenKopfkommentar(inhalt, pfad)) funde.push(pfad);
  }
  if (funde.length > 0) {
    console.error('Produktionsdateien ohne erklärenden Kopfkommentar:');
    for (const pfad of funde.sort()) console.error(`  ${pfad}`);
    process.exitCode = 1;
  }
}
