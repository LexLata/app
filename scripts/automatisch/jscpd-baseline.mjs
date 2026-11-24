#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const berichtPfad = process.argv[2] ?? '.reports/jscpd-prod.json';
const baselinePfad = process.argv[3] ?? 'scripts/automatisch/jscpd-baseline.json';

function liesJson(pfad, bezeichnung) {
  try {
    return JSON.parse(readFileSync(pfad, 'utf8'));
  } catch (fehler) {
    console.error(`${bezeichnung} konnte nicht gelesen werden: ${pfad}`);
    console.error(fehler instanceof Error ? fehler.message : String(fehler));
    process.exit(2);
  }
}

function normalisiereFragment(fragment) {
  return fragment
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((zeile) => zeile.replace(/[ \t]+$/u, ''))
    .join('\n')
    .trim();
}

function fingerprint(duplikat) {
  const pfade = [duplikat.firstFile?.name, duplikat.secondFile?.name]
    .map((pfad) => String(pfad).replaceAll('\\', '/'))
    .sort();
  const grundlage = [duplikat.format, ...pfade, normalisiereFragment(duplikat.fragment)].join('\0');
  return createHash('sha256').update(grundlage).digest('hex');
}

function zaehle(liste, schluessel) {
  const ergebnis = new Map();
  for (const eintrag of liste) {
    const wert = schluessel(eintrag);
    ergebnis.set(wert, (ergebnis.get(wert) ?? 0) + 1);
  }
  return ergebnis;
}

const bericht = liesJson(berichtPfad, 'jscpd-Bericht');
const baseline = liesJson(baselinePfad, 'jscpd-Baseline');
if (baseline.schemaVersion !== 1 || !Array.isArray(baseline.fingerprints)) {
  console.error(`Ungültiges Baseline-Format: ${baselinePfad}`);
  process.exit(2);
}
if (!Array.isArray(bericht.duplicates)) {
  console.error(`Ungültiger jscpd-Bericht: ${berichtPfad}`);
  process.exit(2);
}

const akzeptierteCluster = new Set(
  [...readFileSync('docs/duplikate-akzeptiert.md', 'utf8').matchAll(/^### (K-[^\r\n]+)$/gmu)].map(
    (treffer) => treffer[1],
  ),
);
const unbekannteCluster = baseline.fingerprints
  .map((eintrag) => eintrag.cluster)
  .filter((cluster) => !akzeptierteCluster.has(cluster));
if (unbekannteCluster.length > 0) {
  console.error(
    `Baseline verweist auf nicht dokumentierte Cluster: ${[...new Set(unbekannteCluster)].join(', ')}`,
  );
  console.error('Akzeptierte Ausnahmen und ihre Gründe stehen in docs/duplikate-akzeptiert.md.');
  process.exit(2);
}

const aktuell = bericht.duplicates.map((duplikat) => ({
  fingerprint: fingerprint(duplikat),
  ort: `${duplikat.firstFile.name}:${duplikat.firstFile.start} <> ${duplikat.secondFile.name}:${duplikat.secondFile.start}`,
}));
const soll = zaehle(baseline.fingerprints, (eintrag) => eintrag.fingerprint);
const ist = zaehle(aktuell, (eintrag) => eintrag.fingerprint);
const alle = new Set([...soll.keys(), ...ist.keys()]);
const neu = [];
const verschwunden = [];

for (const wert of alle) {
  const differenz = (ist.get(wert) ?? 0) - (soll.get(wert) ?? 0);
  if (differenz > 0) {
    const ort = aktuell.find((eintrag) => eintrag.fingerprint === wert)?.ort ?? 'unbekannter Ort';
    neu.push(`${wert} (${differenz}×) – ${ort}`);
  } else if (differenz < 0) {
    const cluster = baseline.fingerprints.find((eintrag) => eintrag.fingerprint === wert)?.cluster;
    verschwunden.push(`${wert} (${-differenz}×) – ${cluster ?? 'ohne Cluster'}`);
  }
}

if (neu.length === 0 && verschwunden.length === 0) {
  console.log(`→ jscpd-Baseline: ${aktuell.length} akzeptierte Produktionsklone unverändert`);
  process.exit(0);
}

console.error('jscpd-Baseline weicht ab. Treffer fachlich prüfen; Baseline nicht blind erneuern.');
console.error('Akzeptierte Ausnahmen und ihre Gründe stehen in docs/duplikate-akzeptiert.md.');
if (neu.length > 0) console.error(`\nNeu oder verändert:\n${neu.map((x) => `  ${x}`).join('\n')}`);
if (verschwunden.length > 0) {
  console.error(`\nVerschwunden oder verändert:\n${verschwunden.map((x) => `  ${x}`).join('\n')}`);
}
process.exit(1);
