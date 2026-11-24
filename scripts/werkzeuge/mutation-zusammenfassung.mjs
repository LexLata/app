#!/usr/bin/env node
// scripts/werkzeuge/mutation-zusammenfassung.mjs
//
// Liest .reports/mutation/mutation.json (von `stryker run`, s.
// stryker.config.mjs 'json'-Reporter) und schreibt für jeden überlebenden
// (abgedeckten, aber nicht getöteten) Mutanten Datei:Zeile, Mutator,
// Original → Ersetzung und die deckenden-aber-nicht-tötenden Tests nach
// .reports/mutation/zusammenfassung.txt.
//
// Bewusst OHNE Terminal-Ausgabe: die kompakte Pro-Datei-Score-Tabelle kommt
// bereits vom clear-text-Reporter (s. stryker.config.mjs,
// clearTextReporter.reportScoreTable), das hier ist nur der Datei-Export
// für die Detail-Recherche bei Bedarf.
//
// Aufruf: node scripts/werkzeuge/mutation-zusammenfassung.mjs (läuft automatisch nach
// 'npx stryker run' über scripts/werkzeuge/mutation.sh / das 'mutation'-Skript in
// package.json).

import { readFileSync, writeFileSync } from 'node:fs';

const REPORT_PFAD = '.reports/mutation/mutation.json';
const ZIEL_PFAD = '.reports/mutation/zusammenfassung.txt';

let bericht;
try {
  bericht = JSON.parse(readFileSync(REPORT_PFAD, 'utf-8'));
} catch {
  // Bewusst kein console.error: bei fehlendem Report (z. B. Dry-Run ohne
  // Treffer) soll dieses Skript keine zusätzliche Terminal-Zeile erzeugen.
  process.exit(0);
}

const testNameZuId = new Map();
for (const testFile of Object.values(bericht.testFiles ?? {})) {
  for (const test of testFile.tests ?? []) {
    testNameZuId.set(test.id, test.name);
  }
}

const alleMutanten = [];
for (const [dateiPfad, datei] of Object.entries(bericht.files)) {
  for (const mutant of datei.mutants) {
    alleMutanten.push({ ...mutant, dateiPfad, quellcode: datei.source });
  }
}

const survived = alleMutanten
  .filter((m) => m.status === 'Survived')
  // Nach Datei (alphabetisch) und innerhalb der Datei nach Zeile/Spalte
  // sortiert – Voraussetzung dafür, die Datei sinnvoll zum Nachbessern
  // weiterzugeben (z. B. an Claude), statt einer durch Strykers interne
  // JSON-Reihenfolge zufällig wirkenden Liste.
  .sort(
    (a, b) =>
      a.dateiPfad.localeCompare(b.dateiPfad) ||
      a.location.start.line - b.location.start.line ||
      a.location.start.column - b.location.start.column,
  );

const formatiereMutant = (m) => {
  const zeilen = m.quellcode.split('\n');
  const original = zeilen
    .slice(m.location.start.line - 1, m.location.end.line)
    .join('\n')
    .trim();

  // Alle deckenden Tests, unbegrenzt: diese Datei ist für die gezielte
  // Nachbesserung gedacht, nicht fürs Terminal – Vollständigkeit schlägt
  // hier Kompaktheit.
  const testNamen = (m.coveredBy ?? []).map((id) => testNameZuId.get(id) ?? id);

  // Mutant-ID mit ausgegeben, damit sich der Eintrag eindeutig auf
  // reports/mutation/mutation.json bzw. die HTML-Ansicht zurückführen
  // lässt (z. B. bei mehreren Mutanten exakt derselben Zeile).
  return (
    `— ${m.dateiPfad}:${m.location.start.line} [${m.mutatorName}, Mutant #${m.id}]\n` +
    `  - ${original}\n` +
    `  + ${m.replacement}\n` +
    `  Deckt ab, tötet aber nicht: ${testNamen.join(', ')}\n`
  );
};

writeFileSync(
  ZIEL_PFAD,
  survived.length > 0
    ? survived.map(formatiereMutant).join('\n')
    : 'Keine überlebenden Mutanten in abgedecktem Code.\n',
);
