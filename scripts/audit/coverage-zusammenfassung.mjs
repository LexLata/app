#!/usr/bin/env node
// scripts/audit/coverage-zusammenfassung.mjs
//
// Liest .reports/coverage/coverage-summary.json (von `vitest run --coverage`,
// s. vitest.config.ts) und aggregiert die Statement-Coverage getrennt für:
//   - Pflicht-Schicht: src/lib/domain, src/lib/darstellung, src/lib/persistenz
//     (dort sind Tests laut Projektkonvention verpflichtend)
//   - Rest: alles andere in src/ (React-Komponenten, Hooks, dünne
//     I/O-Orchestrierung – dort bewusst nicht automatisch getestet)
//
// Aggregation ist statement-gewichtet (nicht der naive Mittelwert der
// Datei-Prozentwerte), damit eine große Datei nicht das gleiche Gewicht wie
// eine 5-Zeilen-Datei bekommt.
//
// Aufruf: node scripts/audit/coverage-zusammenfassung.mjs [<pfad-fuer-detailbericht>]
// Gibt eine einzelne kompakte Zeile auf stdout aus. Exit-Code 0 immer
// (informativ, kein Gate) – außer die Summary-Datei fehlt (dann Exit 1,
// von audit.sh als "übersprungen" behandelt).

import { readFileSync, rmSync, writeFileSync } from 'node:fs';

const SUMMARY_PFAD = '.reports/coverage/coverage-summary.json';
const detailZielpfad = process.argv[2];

const PFLICHT_MUSTER = ['/lib/domain/', '/lib/darstellung/', '/lib/persistenz/'];

let rohdaten;
try {
  rohdaten = JSON.parse(readFileSync(SUMMARY_PFAD, 'utf-8'));
} catch {
  console.error(`⏭️  Coverage — ${SUMMARY_PFAD} nicht gefunden, übersprungen`);
  process.exit(1);
}

const gruppen = {
  pflicht: { covered: 0, total: 0, dateien: [] },
  rest: { covered: 0, total: 0, dateien: [] },
};

for (const [pfad, werte] of Object.entries(rohdaten)) {
  if (pfad === 'total') continue;
  const istPflicht = PFLICHT_MUSTER.some((muster) => pfad.includes(muster));
  const ziel = istPflicht ? gruppen.pflicht : gruppen.rest;
  ziel.covered += werte.statements.covered;
  ziel.total += werte.statements.total;
  ziel.dateien.push({ pfad, pct: werte.statements.pct });
}

const prozent = ({ covered, total }) =>
  total === 0 ? null : Math.round((covered / total) * 1000) / 10;

const pflichtPct = prozent(gruppen.pflicht);
const restPct = prozent(gruppen.rest);

const anzeige = (pct) => (pct === null ? '–' : `${pct} %`);

console.log(
  `📊 Coverage (Statements) — domain/darstellung/persistenz: ${anzeige(pflichtPct)} · Rest: ${anzeige(restPct)}`,
);

if (detailZielpfad) {
  const zeilen = [
    'Statement-Coverage pro Datei, aufsteigend sortiert (niedrigste zuerst).',
    '',
    '=== Pflicht-Schicht (domain/darstellung/persistenz) ===',
    ...gruppen.pflicht.dateien
      .sort((a, b) => a.pct - b.pct)
      .map((d) => `${d.pct.toString().padStart(5)} %  ${d.pfad}`),
    '',
    '=== Rest ===',
    ...gruppen.rest.dateien
      .sort((a, b) => a.pct - b.pct)
      .map((d) => `${d.pct.toString().padStart(5)} %  ${d.pfad}`),
  ];
  writeFileSync(detailZielpfad, zeilen.join('\n') + '\n');
}

rmSync('.reports/coverage', { recursive: true, force: true });
