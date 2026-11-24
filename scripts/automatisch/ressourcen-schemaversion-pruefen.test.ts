// Prüft die Schemaversion gebündelter XML-Dateien mit isolierten Ressourcenordnern.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { pruefeRessourcen } from './ressourcen-schemaversion-pruefen.mjs';

const skript = fileURLToPath(new URL('./ressourcen-schemaversion-pruefen.mjs', import.meta.url));
const formate = [
  ['europa', 'gesetz'],
  ['importindizes', 'importindex'],
  ['nichtamtliche-titel', 'nichtamtlicheTitel'],
  ['praefixstrukturen', 'praefixstrukturen'],
] as const;
let testordner: string | undefined;

afterEach(() => {
  if (testordner) rmSync(testordner, { recursive: true, force: true });
  testordner = undefined;
});

function fixtures() {
  testordner = mkdtempSync(join(tmpdir(), 'ressourcen-schemaversion-'));
  for (const [ordner, wurzel] of formate) {
    mkdirSync(join(testordner, ordner));
    writeFileSync(
      join(testordner, ordner, 'gueltig.xml'),
      ordner === 'nichtamtliche-titel'
        ? `<${wurzel} version="1"><infos><geaendert>2026-05-26T00:00:00Z</geaendert></infos></${wurzel}>`
        : `<${wurzel} version="1"/>`,
    );
  }
  return testordner;
}

describe('Ressourcen-Schemaversion', () => {
  it('ignoriert die kuratierte JSON neben den Europa-GesetzesXML', () => {
    const basis = fixtures();
    writeFileSync(join(basis, 'europa', 'europaKuratiert.json'), '[{"celex":"12016E/TXT"}]');
    expect(pruefeRessourcen(basis)).toEqual([]);
  });
  it('akzeptiert alle Formate und prüft im CLI den angegebenen Bestand', () => {
    const basis = fixtures();
    expect(pruefeRessourcen(basis)).toEqual([]);
    const cli = spawnSync(process.execPath, [skript, basis], { encoding: 'utf8' });
    expect(cli.status).toBe(0);
    expect(cli.stderr).toBe('');
    expect(cli.stdout).toContain('alle XML-Dateien gültig');
    writeFileSync(join(basis, 'importindizes', 'eu.xml'), '<importindex version="2"/>');
    const defekt = spawnSync(process.execPath, [skript, basis], { encoding: 'utf8' });
    expect(defekt.status).toBe(1);
    expect(defekt.stderr).toContain('eu.xml');
  });

  it.each(formate)('meldet fehlende und abweichende Version bei %s', (ordner, wurzel) => {
    const basis = fixtures();
    writeFileSync(join(basis, ordner, 'fehlt.xml'), `<${wurzel}><kind version="1"/></${wurzel}>`);
    writeFileSync(join(basis, ordner, 'fremd.xml'), `<${wurzel} version="2"/>`);
    writeFileSync(join(basis, ordner, 'einfach.xml'), `<${wurzel} version='1'/>`);
    const befunde = pruefeRessourcen(basis);
    expect(befunde).toHaveLength(3);
    expect(befunde.map((befund) => befund.split(':')[0])).toEqual([
      `${ordner}/einfach.xml`,
      `${ordner}/fehlt.xml`,
      `${ordner}/fremd.xml`,
    ]);
    expect(befunde.every((befund) => befund.includes('version="1"'))).toBe(true);
  });

  it.each(formate)('meldet falsche oder ungültige Wurzel bei %s', (ordner) => {
    const basis = fixtures();
    writeFileSync(join(basis, ordner, 'falsch.xml'), '<andere version="1"/>');
    writeFileSync(join(basis, ordner, 'ungueltig.xml'), '<?xml version="1.0"?>');
    expect(pruefeRessourcen(basis).map((befund) => befund.split(':')[0])).toEqual([
      `${ordner}/falsch.xml`,
      `${ordner}/ungueltig.xml`,
    ]);
  });

  it('überspringt Deklaration, Kommentar und DOCTYPE mit internem Subset', () => {
    const basis = fixtures();
    writeFileSync(
      join(basis, 'europa', 'vorspann.xml'),
      '\uFEFF<?xml version="1.0"?><!-- version="1" --><!DOCTYPE gesetz [<!ENTITY x ">">]><gesetz id="a" version="1"/>',
    );
    writeFileSync(
      join(basis, 'importindizes', 'vorspann.xml'),
      '<?xml version="1.0"?><!-- version="1" --><!DOCTYPE importindex [<!ENTITY x ">">]><importindex><kind version="1"/></importindex>',
    );
    expect(pruefeRessourcen(basis)).toEqual([
      'importindizes/vorspann.xml: am Wurzel-Tag fehlt das exakte Attribut version="1"',
    ]);
  });

  it('überspringt eckige Klammern in Kommentaren des DOCTYPE-Subsets', () => {
    const basis = fixtures();
    writeFileSync(
      join(basis, 'europa', 'gueltig.xml'),
      '<!DOCTYPE gesetz [<!-- ] -->]><gesetz version="1"/>',
    );
    writeFileSync(
      join(basis, 'importindizes', 'fremd.xml'),
      '<!DOCTYPE importindex [<!-- ] -->]><importindex version="2"/>',
    );
    expect(pruefeRessourcen(basis)).toEqual([
      'importindizes/fremd.xml: am Wurzel-Tag fehlt das exakte Attribut version="1"',
    ]);
  });

  it('meldet fehlende und leere Unterordner', () => {
    const basis = fixtures();
    rmSync(join(basis, 'europa'), { recursive: true });
    rmSync(join(basis, 'importindizes', 'gueltig.xml'));
    expect(pruefeRessourcen(basis)).toEqual([
      'europa: erwarteter Unterordner fehlt oder ist nicht lesbar',
      'importindizes: keine XML-Dateien vorhanden',
    ]);
  });
});

it.each([
  '2026-05-26T00:00:00',
  '2026-05-26T00:00:00.000Z',
  '2026-05-26',
  'kein-datum',
  '2026-02-30T00:00:00Z',
])('weist nichtamtlichen Inhalts-Bearbeitungszeitpunkt %s zurück', (zeit) => {
  const basis = fixtures();
  writeFileSync(
    join(basis, 'nichtamtliche-titel', 'gueltig.xml'),
    `<nichtamtlicheTitel version="1"><infos><geaendert>${zeit}</geaendert></infos></nichtamtlicheTitel>`,
  );
  expect(pruefeRessourcen(basis)).toEqual([
    'nichtamtliche-titel/gueltig.xml: infos/geaendert muss UTC mit Z ohne Millisekunden enthalten',
  ]);
});
it('weist fehlenden Inhalts-Bearbeitungszeitpunkt zurück', () => {
  const basis = fixtures();
  writeFileSync(
    join(basis, 'nichtamtliche-titel', 'gueltig.xml'),
    '<nichtamtlicheTitel version="1"/>',
  );
  expect(pruefeRessourcen(basis)).toHaveLength(1);
});

it.each([
  ['falsch geschlossener Tag', '<gesetz version="1"><infos></gesetz>'],
  ['kaputtes Attribut', '<gesetz version="1" id="kaputt></gesetz>'],
  ['unmaskiertes Ampersand', '<gesetz version="1">A & B</gesetz>'],
  ['Nicht-ASCII-Elementname', '<gesetz version="1"><normlänge/></gesetz>'],
  ['Nicht-ASCII-Attributname', '<gesetz version="1" größe="1"/>'],
])('weist %s in gebündeltem XML zurück', (_fall, xml) => {
  const basis = fixtures();
  writeFileSync(join(basis, 'europa', 'gueltig.xml'), xml);
  expect(pruefeRessourcen(basis)).not.toEqual([]);
});

it('prüft Dateien in Normgeber-Unterordnern und meldet ihren vollständigen relativen Pfad', () => {
  const basis = fixtures();
  rmSync(join(basis, 'nichtamtliche-titel', 'gueltig.xml'));
  mkdirSync(join(basis, 'nichtamtliche-titel', 'de-bund'));
  writeFileSync(
    join(basis, 'nichtamtliche-titel', 'de-bund', 'GG.xml'),
    '<nichtamtlicheTitel version="1"><infos><geaendert>2026-05-26T00:00:00Z</geaendert></infos></nichtamtlicheTitel>',
  );
  expect(pruefeRessourcen(basis)).toEqual([]);
  writeFileSync(
    join(basis, 'nichtamtliche-titel', 'de-bund', 'GG.xml'),
    '<nichtamtlicheTitel version="2"/>',
  );
  expect(pruefeRessourcen(basis)).toEqual([
    'nichtamtliche-titel/de-bund/GG.xml: am Wurzel-Tag fehlt das exakte Attribut version="1"',
  ]);
});
