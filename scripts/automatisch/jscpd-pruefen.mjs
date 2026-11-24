#!/usr/bin/env node

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projektWurzel = fileURLToPath(new URL('../..', import.meta.url));
const berichtOrdner = fileURLToPath(new URL('../../.reports/jscpd/', import.meta.url));
const berichtPfad = `${berichtOrdner}jscpd-report.json`;
const konsolenPfad = `${berichtOrdner}konsolen-ausgabe.txt`;
const jscpdPfad = fileURLToPath(new URL('../../node_modules/jscpd/run-jscpd.js', import.meta.url));
const baselinePfad = fileURLToPath(new URL('./jscpd-baseline.mjs', import.meta.url));

mkdirSync(berichtOrdner, { recursive: true });
rmSync(berichtPfad, { force: true });
rmSync(konsolenPfad, { force: true });

const jscpd = spawnSync(
  process.execPath,
  [
    jscpdPfad,
    'src',
    '--ignore',
    '**/*.test.ts',
    '--min-lines',
    '10',
    '--min-tokens',
    '50',
    '--threshold',
    '5',
    '--reporters',
    'console,json',
    '--output',
    berichtOrdner,
    '--no-colors',
  ],
  { cwd: projektWurzel, encoding: 'utf8' },
);

const konsolenausgabe = `${jscpd.stdout ?? ''}${jscpd.stderr ?? ''}`;
writeFileSync(konsolenPfad, konsolenausgabe);

let bericht;
try {
  bericht = JSON.parse(readFileSync(berichtPfad, 'utf8'));
} catch {
  process.stderr.write(konsolenausgabe);
  console.error(`jscpd hat keinen lesbaren Bericht erzeugt. Ausgabe: ${konsolenPfad}`);
  process.exit(jscpd.status ?? 1);
}

const gesamt = bericht?.statistics?.total;
if (
  !gesamt ||
  !Number.isFinite(gesamt.clones) ||
  !Number.isFinite(gesamt.duplicatedLines) ||
  !Number.isFinite(gesamt.percentage)
) {
  console.error(`jscpd-Bericht enthält keine gültige Gesamtstatistik: ${berichtPfad}`);
  process.exit(1);
}

console.log(
  `→ jscpd: ${gesamt.clones} Duplikate, ${gesamt.duplicatedLines} Zeilen (${gesamt.percentage.toFixed(2)}%)`,
);

const baseline = spawnSync(process.execPath, [baselinePfad, berichtPfad], {
  cwd: projektWurzel,
  stdio: 'inherit',
});

if (jscpd.status !== 0) {
  console.error(`Schwelle überschritten – volle Übersicht: ${konsolenPfad}`);
  console.error('Akzeptierte Ausnahmen und ihre Gründe stehen in docs/duplikate-akzeptiert.md.');
  process.exit(jscpd.status ?? 1);
}
process.exit(baseline.status ?? 1);
