// Vergleicht registrierte Befehle, Argumentnamen, Pflicht/optional und einfache Typen
// einschließlich Ergebnissen mit Rust. Eigene Strukturen werden nach Modul und
// Verwendungsposition zugeordnet; ihre Felder und die Bedeutung der Werte bleiben ungeprüft.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';
import { leseRustQuellen, vergleicheSignaturen } from './tauri-signaturen';
import { expect, it } from 'vitest';
const verzeichnis = readFileSync('src/lib/plattform/tauri-befehle/befehle.ts', 'utf8');
const rust = readFileSync('src-tauri/src/lib.rs', 'utf8');
function fehlendeBefehle(quelle: string, nativ: string): string[] {
  const registriert = new Set(
    // Einträge dürfen cfg-Attribute tragen (`#[cfg(debug_assertions)] pfad::befehl`);
    // ihre Klammern beenden die Liste nicht, das Attribut selbst ist kein Befehl.
    [...nativ.matchAll(/tauri::generate_handler!\s*\[((?:#\[(?:[^\]]*)\]|[^\]])*)\]/g)].flatMap(
      (m) =>
        (m[1] ?? '')
          .replace(/#\[[^\]]*\]/g, '')
          .split(',')
          .map((e) => e.trim().split('::').at(-1)),
    ),
  );
  const ast = ts.createSourceFile('befehle.ts', quelle, ts.ScriptTarget.Latest, true);
  const namen = ast.statements.flatMap((s) =>
    ts.isInterfaceDeclaration(s) && s.name.text === 'Befehlsverzeichnis'
      ? s.members.flatMap((m) =>
          ts.isPropertySignature(m) && m.name && ts.isIdentifier(m.name) ? [m.name.text] : [],
        )
      : [],
  );
  if (!namen.length) throw new Error('Befehlsverzeichnis fehlt oder ist leer.');
  return namen.filter((n) => !registriert.has(n));
}
it('findet alle verwendeten Befehle in den Rust-Handlerlisten', () =>
  expect(fehlendeBefehle(verzeichnis, rust)).toEqual([]));
it('meldet einen zusätzlich eingetragenen, nativ fehlenden Befehl', () => {
  const probe = verzeichnis.replace(
    'export interface Befehlsverzeichnis {',
    'export interface Befehlsverzeichnis { probe_fehlt: { argumente: KeineArgumente; ergebnis: KeinErgebnis };',
  );
  expect(fehlendeBefehle(probe, rust)).toEqual(['probe_fehlt']);
});

it('erkennt bedingt registrierte Befehle nach einem cfg-Attribut in der Handlerliste', () => {
  const probe =
    'export interface Befehlsverzeichnis { a: { argumente: KeineArgumente; ergebnis: KeinErgebnis }; b: { argumente: KeineArgumente; ergebnis: KeinErgebnis }; c: { argumente: KeineArgumente; ergebnis: KeinErgebnis } }';
  const nativ =
    'tauri::generate_handler![m::a, #[cfg(debug_assertions)] m::b, #[cfg(all(desktop, debug_assertions))]\n m::n::c]';
  expect(fehlendeBefehle(probe, nativ)).toEqual([]);
  expect(fehlendeBefehle(probe.replace('c:', 'cfg:'), nativ)).toEqual(['cfg']);
});

const probeVerzeichnis = (argumente: string, ergebnis = 'void') =>
  `export interface Befehlsverzeichnis { probe: { argumente: { ${argumente} }; ergebnis: ${ergebnis} } }`;
const probeRust = (argumente: string, ergebnis = '()') => ({
  'probe.rs': `#[tauri::command] pub fn probe(${argumente}) -> ${ergebnis} {}`,
});
it.each([
  ['relativPfad: string', 'relativer_pfad: String'],
  ['', 'relativer_pfad: String'],
  ['relativerPfad: string; extra: boolean', 'relativer_pfad: String'],
  ['wert: string', 'wert: Option<String>'],
  ['wert?: string', 'wert: String'],
  ['wert: number', 'wert: String'],
  ['wert: string[]', 'wert: String'],
  ['wert: string', 'wert: Unbekannt'],
])('weist unpassende Argumente zurück: %s / %s', (tsArgumente, rustArgumente) => {
  expect(vergleicheSignaturen(probeVerzeichnis(tsArgumente), probeRust(rustArgumente))).not.toEqual(
    [],
  );
});
it.each([
  ['void', '()'],
  ['string', 'String'],
  ['boolean', 'bool'],
  ['string | null', 'Option<String>'],
  ['number[]', 'Result<Vec<u64>, String>'],
])('erkennt Ergebnistyp %s / %s', (tsErgebnis, rustErgebnis) => {
  expect(
    vergleicheSignaturen(probeVerzeichnis('', tsErgebnis), probeRust('', rustErgebnis)),
  ).toEqual([]);
  expect(
    vergleicheSignaturen(probeVerzeichnis('', 'number'), probeRust('', rustErgebnis)),
  ).not.toEqual([]);
});
it('weist unbekannte Ergebnisstrukturen und abweichende Plattformsignaturen zurück', () => {
  expect(
    vergleicheSignaturen(probeVerzeichnis('', 'AndererTyp'), probeRust('', 'Auftrag')),
  ).not.toEqual([]);
  expect(
    vergleicheSignaturen(probeVerzeichnis(''), {
      ...probeRust(''),
      'andere-plattform.rs': '#[tauri::command] pub fn probe(wert: String) {}',
    }),
  ).not.toEqual([]);
});
it('weist unbekannte Attributoptionen ausdrücklich zurück', () => {
  expect(
    vergleicheSignaturen(probeVerzeichnis(''), {
      'probe.rs': '#[tauri::command(rename_all = "snake_case")] pub fn probe() {}',
    }),
  ).not.toEqual([]);
});

it('gleicht alle Verzeichnissignaturen mit Rust ab', () => {
  expect(vergleicheSignaturen(verzeichnis, leseRustQuellen('src-tauri/src'))).toEqual([]);
});

it('findet Befehlsdateien in Modulunterordnern unter ihrem relativen Pfad', () => {
  const wurzel = mkdtempSync(join(tmpdir(), 'lexlata-rust-'));
  try {
    mkdirSync(join(wurzel, 'commands', 'datei_io'), { recursive: true });
    writeFileSync(join(wurzel, 'lib.rs'), 'mod commands;');
    writeFileSync(join(wurzel, 'commands', 'datei_io', 'probe.rs'), probeRust('')['probe.rs']);
    writeFileSync(join(wurzel, 'commands', 'notiz.txt'), '#[tauri::command] fn nicht_rust() {}');
    const quellen = leseRustQuellen(wurzel);
    expect(Object.keys(quellen).sort()).toEqual(['commands/datei_io/probe.rs', 'lib.rs']);
    expect(vergleicheSignaturen(probeVerzeichnis(''), quellen)).toEqual([]);
  } finally {
    rmSync(wurzel, { recursive: true });
  }
});

it('prüft konkrete Strukturzuordnung, Modul und Hüllen statt beliebiger Typnamen', () => {
  const quelle = `type FensterGeometrie = { x: number }; type Fremd = { x: number };
    interface Befehlsverzeichnis { fenster_oeffnen_mit_label: {
      argumente: { geometrie?: FensterGeometrie | null }; ergebnis: void } }`;
  const nativ = {
    'fenster/hauptfenster.rs':
      '#[tauri::command] pub fn fenster_oeffnen_mit_label(geometrie: Option<FensterGeometrie>) {}',
  };
  expect(vergleicheSignaturen(quelle, nativ)).toEqual([]);
  expect(
    vergleicheSignaturen(
      quelle.replace('geometrie?: FensterGeometrie', 'geometrie?: Fremd'),
      nativ,
    ),
  ).not.toEqual([]);
  expect(
    vergleicheSignaturen(quelle, { 'fremd.rs': nativ['fenster/hauptfenster.rs'] }),
  ).not.toEqual([]);
  expect(
    vergleicheSignaturen(
      quelle.replace('geometrie?: FensterGeometrie', 'geometrie?: FensterGeometrie[]'),
      nativ,
    ),
  ).not.toEqual([]);
});
it('prüft Strukturzuordnung auch innerhalb von Listen und optionalen Ergebnissen', () => {
  const quelle = `type FensterPosition = { x: number }; type Fremd = { x: number };
    interface Befehlsverzeichnis { fenster_alle_positionen: {
      argumente: Record<string, never>; ergebnis: FensterPosition[] | null } }`;
  const nativ = {
    'fenster.rs':
      '#[tauri::command] pub fn fenster_alle_positionen() -> Result<Option<Vec<FensterPosition>>, String> {}',
  };
  expect(vergleicheSignaturen(quelle, nativ)).toEqual([]);
  expect(
    vergleicheSignaturen(quelle.replace('ergebnis: FensterPosition[]', 'ergebnis: Fremd[]'), nativ),
  ).not.toEqual([]);
  expect(vergleicheSignaturen(quelle.replace('[] | null', '[]'), nativ)).not.toEqual([]);
});
it('lässt zusätzliche unbekannte Generic-Argumente nicht ungeprüft', () => {
  expect(
    vergleicheSignaturen(probeVerzeichnis('', 'string[]'), probeRust('', 'Vec<String, Unbekannt>')),
  ).not.toEqual([]);
});
