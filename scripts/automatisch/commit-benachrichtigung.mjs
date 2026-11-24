#!/usr/bin/env node
// Meldet erfolgreiche und abgebrochene Commits unter macOS mit Systemmitteilung und separatem Ton.
// Andere Plattformen und Benachrichtigungsfehler beeinflussen den Hook nicht.
import { spawnSync } from 'node:child_process';
import { platform } from 'node:os';
import { pathToFileURL } from 'node:url';

export function benachrichtigeCommit(ergebnis = 'erfolgreich') {
  if (platform() !== 'darwin') return;

  const aufrufe = [
    [
      'osascript',
      [
        '-e',
        'on run {msg, ttl}',
        '-e',
        'display notification msg with title ttl',
        '-e',
        'end run',
        '--',
        ergebnis === 'abgebrochen' ? 'Commit abgebrochen' : 'Commit erfolgreich',
        'LexLata',
      ],
    ],
    [
      'afplay',
      ['-v', '1', `/System/Library/Sounds/${ergebnis === 'abgebrochen' ? 'Basso' : 'Purr'}.aiff`],
    ],
  ];
  for (const [befehl, argumente] of aufrufe) {
    try {
      spawnSync(befehl, argumente, { stdio: 'ignore', timeout: 5000 });
    } catch {
      // Auch nach fehlgeschlagener Systemmitteilung den separaten Ton versuchen.
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  benachrichtigeCommit(process.argv[2]);
}
