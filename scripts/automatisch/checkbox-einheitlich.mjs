#!/usr/bin/env node
// checkbox-einheitlich.mjs
// Verhindert native Checkboxdarstellungen außerhalb der gemeinsamen Komponente.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function findeRoheCheckboxen(dateien) {
  const funde = [];
  const muster =
    /\btype\s*(?:=\s*(?:["']checkbox["']|\{\s*["']checkbox["']\s*\})|:\s*["']checkbox["'])/g;
  for (const { pfad, inhalt } of dateien) {
    if (
      !pfad.startsWith('src/') ||
      /\.test\.[^.]+$/.test(pfad) ||
      pfad === 'src/components/Checkbox.tsx'
    )
      continue;
    for (const treffer of inhalt.matchAll(muster)) {
      funde.push({ pfad, zeile: inhalt.slice(0, treffer.index).split('\n').length });
    }
  }
  return funde;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const pfade = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8' },
  ).split('\0');
  const dateien = pfade
    .filter((pfad) => /^src\/.*\.(?:tsx?|jsx?|mjs|cjs)$/.test(pfad) && existsSync(pfad))
    .map((pfad) => ({ pfad, inhalt: readFileSync(pfad, 'utf8') }));
  const funde = findeRoheCheckboxen(dateien);
  for (const { pfad, zeile } of funde)
    console.error(`${pfad}:${zeile} Rohe Checkbox: gemeinsame Checkbox verwenden.`);
  if (funde.length) process.exitCode = 1;
}
