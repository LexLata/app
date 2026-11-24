#!/usr/bin/env node
// scripts/automatisch/lint-geaendert.mjs
//
// ESLint nur über die in diesem Arbeitsstand geänderten Dateien – gegenüber
// HEAD (staged + unstaged) plus noch nicht getrackte. Für den Pre-Commit-Hook;
// `npm run vollpruefen` verwendet stattdessen `pruefen:lint-voll`, damit auch
// unveränderte Dateien und der vollständige CI-Checkout geprüft werden.
//
// Exit-Code von ESLint wird durchgereicht; ohne betroffene Dateien Exit 0.

import { execFileSync } from 'node:child_process';

const LINTBARE_ENDUNG = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean);
}

const geaendert = new Set([
  ...git(['diff', '--name-only', '--diff-filter=ACMR', 'HEAD']),
  ...git(['ls-files', '--others', '--exclude-standard']),
]);

const dateien = [...geaendert].filter((pfad) => LINTBARE_ENDUNG.test(pfad));

if (dateien.length === 0) {
  console.log('lint: keine geänderten JS/TS-Dateien');
  process.exit(0);
}

try {
  execFileSync(
    process.execPath,
    ['node_modules/eslint/bin/eslint.js', '--no-warn-ignored', ...dateien],
    { stdio: 'inherit' },
  );
} catch {
  process.exit(1);
}
