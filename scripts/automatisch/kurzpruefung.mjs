// kurzpruefung.mjs
// Leitet den Kurzprüfumfang ausschließlich aus dem aktuellen Arbeitsstand ab.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const CODE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;
const TEST = /\.test\.(?:ts|tsx)$/;
const DOKUMENTATION = /^(?:docs\/.*\.md|(?:AGENTS|README|CHANGELOG)\.md|\.agents\/.*\.md)$/;

/** Git-Fehler und unbekannte Dateitypen erweitern den Umfang statt ihn zu verkleinern. */
export function kurzpruefungPlanen(ordner = process.cwd()) {
  const voll = (grund, dateien = []) => ({
    dateien,
    tests: 'alle',
    testDateien: [],
    lint: 'alle',
    rust: true,
    grund,
  });
  const git = (args) =>
    execFileSync('git', args, {
      cwd: ordner,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .split('\0')
      .filter(Boolean);
  let dateien;
  let alleDateien;
  try {
    // Ohne Rename-Erkennung bleiben beide Pfade einer Umbenennung sichtbar.
    dateien = [
      ...new Set([
        ...git(['diff', '--cached', '--name-only', '-z', '--no-renames', 'HEAD', '--']),
        ...git(['diff', '--name-only', '-z', '--no-renames', '--']),
        ...git(['ls-files', '--others', '--exclude-standard', '-z']),
      ]),
    ].sort();
    alleDateien = [
      ...new Set([
        ...git(['ls-files', '-z']),
        ...git(['ls-files', '--others', '--exclude-standard', '-z']),
      ]),
    ];
  } catch {
    return voll('Git-Vergleich mit HEAD nicht lesbar.');
  }
  const relevant = dateien.filter((pfad) => !DOKUMENTATION.test(pfad));
  const rustDateien = relevant.filter((pfad) => /^src-tauri\/.*\.rs$/.test(pfad));
  const codeDateien = relevant.filter((pfad) => /^(?:src|scripts)\//.test(pfad) && CODE.test(pfad));
  if (relevant.length !== rustDateien.length + codeDateien.length) {
    return voll('Ressourcen, Konfiguration oder unbekannte Betroffenheit.', dateien);
  }
  const geloescht = codeDateien.some((pfad) => !existsSync(join(ordner, pfad)));
  const testumgebung = codeDateien.some((pfad) => pfad.startsWith('src/test/'));
  const skriptlogik = codeDateien.some((pfad) => pfad.startsWith('scripts/') && !TEST.test(pfad));
  // Diese Tests lesen auch Quelldateien direkt; Vitests Importgraph erfasst das nicht.
  const quellcode = codeDateien.some((pfad) => pfad.startsWith('src/'));
  const skripttests =
    skriptlogik || quellcode
      ? alleDateien.filter(
          (pfad) =>
            pfad.startsWith('scripts/') && TEST.test(pfad) && existsSync(join(ordner, pfad)),
        )
      : [];
  const beispielmatrix = dateien.includes('docs/doku/markierungskonflikte.md');
  const testDateien = [
    ...new Set([
      ...codeDateien,
      ...skripttests,
      ...(beispielmatrix ? ['scripts/automatisch/markierungskonflikte-beispiele.test.ts'] : []),
    ]),
  ];
  return {
    dateien,
    tests:
      rustDateien.length || geloescht || testumgebung
        ? 'alle'
        : testDateien.length
          ? 'betroffen'
          : 'keine',
    testDateien,
    lint: codeDateien.filter((pfad) => existsSync(join(ordner, pfad))),
    rust: rustDateien.length > 0,
    grund: rustDateien.length
      ? 'Ruständerungen: alle Vitest-Tests einschließlich dateilesender Vertragstests und alle Rustprüfungen.'
      : geloescht || testumgebung
        ? 'Gelöschter Code oder gemeinsame Testumgebung: alle Tests.'
        : [
            codeDateien.length ? 'Code: Importabhängigkeiten und geänderte Tests.' : '',
            skriptlogik || quellcode
              ? 'Quellcode oder Skriptlogik: zusätzlich alle Skripttests.'
              : '',
            beispielmatrix ? 'Fachliche Beispielmatrix: zugehöriger Skripttest.' : '',
          ]
            .filter(Boolean)
            .join(' ') || 'Keine testrelevanten Änderungen.',
  };
}
