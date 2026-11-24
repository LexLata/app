import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pruefeDokumentation } from './doku-pruefen.mjs';

describe('Dokumentationsprüfung', () => {
  let wurzel: string;

  function datei(pfad: string, inhalt = '') {
    const ziel = join(wurzel, pfad);
    mkdirSync(dirname(ziel), { recursive: true });
    writeFileSync(ziel, inhalt);
  }

  beforeEach(() => {
    wurzel = mkdtempSync(join(tmpdir(), 'lexlata-doku-'));
    datei('docs/ARCHITEKTUR.md', '# Architektur\n');
    mkdirSync(join(wurzel, 'docs/doku'), { recursive: true });
  });

  afterEach(() => rmSync(wurzel, { recursive: true, force: true }));

  it.each(['', '\n', '\r\n'])('akzeptiert 6.000 Zeichen mit Abschluss %j', (abschluss) => {
    const text = 'a'.repeat(6000 - Number(abschluss !== '')) + abschluss;
    datei('docs/ARCHITEKTUR.md', text);
    expect(pruefeDokumentation(wurzel)).toEqual([]);
  });

  it('meldet eine Überschreitung auch ohne Zeilenumbrüche', () => {
    datei('docs/ARCHITEKTUR.md', 'a'.repeat(6001));
    expect(pruefeDokumentation(wurzel)).toEqual([
      'docs/ARCHITEKTUR.md: 6001 Zeichen; höchstens 6000 erlaubt.',
    ]);
  });

  it('zählt Leerraum und Markdown mit', () => {
    datei('docs/ARCHITEKTUR.md', '# ' + ' '.repeat(5998) + '\n');
    expect(pruefeDokumentation(wurzel)).toEqual([
      'docs/ARCHITEKTUR.md: 6001 Zeichen; höchstens 6000 erlaubt.',
    ]);
  });

  it('zählt Unicode-Zeichen statt Bytes und erlaubt mehr als 300 kurze Zeilen', () => {
    datei('docs/ARCHITEKTUR.md', '😀\n'.repeat(3000));
    expect(pruefeDokumentation(wurzel)).toEqual([]);
  });

  it('prüft Unterordner der Fachdokumentation, aber keine historischen Pläne', () => {
    datei('docs/doku/xml-formate/gesetz.md', '# Gesetz\n[Quelle](../../../src/fehlt.ts)');
    datei('docs/plaene/erledigt/alt.md', '[Alt](fehlt.md)');
    expect(pruefeDokumentation(wurzel)).toEqual([
      'docs/doku/xml-formate/gesetz.md:2: Pfad fehlt: ../../../src/fehlt.ts',
    ]);
  });

  it('akzeptiert Datei- und Ordnerlinks sowie Fragmente und externe Adressen', () => {
    datei('src/lib/Quelle.ts');
    datei(
      'docs/doku/einstieg.md',
      [
        '[Datei](../../src/lib/Quelle.ts#funktion)',
        '[Ordner](../../src/lib/)',
        '[Hier](#abschnitt)',
        '[Web](https://example.org/fehlt)',
        '[Mail](mailto:test@example.org)',
        '[Link](lexlata://de-bund/bgb/433)',
      ].join('\n'),
    );
    expect(pruefeDokumentation(wurzel)).toEqual([]);
  });

  it('prüft Bilder, Referenzlinks und Links mit Leerzeichen oder Titel', () => {
    datei('docs/doku/Ein Text.md');
    datei(
      'docs/doku/einstieg.md',
      [
        '[Text](Ein%20Text.md "Titel")',
        '[Text](<Ein Text.md>)',
        '[Quelle][quelle]',
        '[quelle]: <Ein Text.md> "Titel"',
        '![Bild](fehlt.png)',
      ].join('\n'),
    );
    expect(pruefeDokumentation(wurzel)).toEqual(['docs/doku/einstieg.md:5: Pfad fehlt: fehlt.png']);
  });

  it('meldet einen ungültigen Referenzpfad', () => {
    datei('docs/doku/einstieg.md', '[Quelle][quelle]\n[quelle]: fehlt.md');
    expect(pruefeDokumentation(wurzel)).toEqual(['docs/doku/einstieg.md:2: Pfad fehlt: fehlt.md']);
  });

  it('akzeptiert Klammern im Dateinamen eines Links', () => {
    datei('docs/doku/Text(Details).md');
    datei('docs/ARCHITEKTUR.md', '[Quelle](doku/Text(Details).md)');
    expect(pruefeDokumentation(wurzel)).toEqual([]);
  });

  it('prüft die genaue Schreibung jedes Pfadsegments', () => {
    datei('src/lib/Quelle.ts');
    datei('docs/ARCHITEKTUR.md', '[Quelle](../src/Lib/quelle.ts)');
    expect(pruefeDokumentation(wurzel)).toEqual([
      'docs/ARCHITEKTUR.md:1: Pfadschreibung weicht ab: ../src/Lib/quelle.ts (tatsächlich: lib)',
    ]);
  });

  it('prüft eindeutige Repositorypfade in Inline-Code', () => {
    datei('src/lib/Quelle.ts');
    datei('docs/ARCHITEKTUR.md', '`src/lib/Quelle.ts` und `src/lib/Fehlt.ts`');
    expect(pruefeDokumentation(wurzel)).toEqual([
      'docs/ARCHITEKTUR.md:1: Pfad fehlt: src/lib/Fehlt.ts',
    ]);
  });

  it('prüft bei Repositoryvorlagen den festen Verzeichnisanteil', () => {
    mkdirSync(join(wurzel, 'src-tauri/resources/titel'), { recursive: true });
    datei(
      'docs/ARCHITEKTUR.md',
      [
        '`src-tauri/resources/titel/{Normgeber}/{Kurztitel}.xml`',
        '`src-tauri/resources/fehlt/{Normgeber}.xml`',
      ].join('\n'),
    );
    expect(pruefeDokumentation(wurzel)).toEqual([
      'docs/ARCHITEKTUR.md:2: Pfad fehlt: src-tauri/resources/fehlt/',
    ]);
  });

  it('verwechselt XML-Pfade und Nutzerdaten-Dateinamen nicht mit Repositorypfaden', () => {
    datei(
      'docs/ARCHITEKTUR.md',
      '`infos/gesetz`, `lesezeichen.xml`, `markierungen/{Kurztitel}.xml`',
    );
    expect(pruefeDokumentation(wurzel)).toEqual([]);
  });

  it('ignoriert Markdown-Beispiele in Codeblöcken und Inline-Code', () => {
    datei(
      'docs/ARCHITEKTUR.md',
      [
        '```md',
        '[Beispiel](fehlt.md)',
        '```',
        '`[Beispiel](fehlt.md)`',
        '~~~md',
        '[Beispiel](fehlt.md)',
        '~~~',
        '[Quelle](fehlt.md)',
      ].join('\n'),
    );
    expect(pruefeDokumentation(wurzel)).toEqual(['docs/ARCHITEKTUR.md:8: Pfad fehlt: fehlt.md']);
  });

  it('ignoriert auskommentierte Verweise', () => {
    datei('docs/ARCHITEKTUR.md', '<!--\n[Alt](fehlt.md)\n-->');
    expect(pruefeDokumentation(wurzel)).toEqual([]);
  });

  it('meldet ungültige URL-Kodierung statt die Prüfung abzubrechen', () => {
    datei('docs/ARCHITEKTUR.md', '[Quelle](kaputt%ZZ.md)');
    expect(pruefeDokumentation(wurzel)).toEqual([
      'docs/ARCHITEKTUR.md:1: Ungültige Pfadkodierung: kaputt%ZZ.md',
    ]);
  });

  it('meldet einen Pfad außerhalb des Repositorys', () => {
    datei('docs/ARCHITEKTUR.md', '[Quelle](../../ausserhalb.md)');
    expect(pruefeDokumentation(wurzel)).toEqual([
      'docs/ARCHITEKTUR.md:1: Pfad außerhalb des Repositorys: ../../ausserhalb.md',
    ]);
  });

  it('meldet fehlende Dokumentation statt einen leeren Prüfumfang zu akzeptieren', () => {
    rmSync(join(wurzel, 'docs/doku'), { recursive: true });
    expect(pruefeDokumentation(wurzel)).toEqual(['docs/doku: Dokumentationsordner fehlt.']);
  });

  it('meldet eine fehlende Architekturdatei', () => {
    rmSync(join(wurzel, 'docs/ARCHITEKTUR.md'));
    expect(pruefeDokumentation(wurzel)).toEqual([
      'docs/ARCHITEKTUR.md: Dokument kann nicht gelesen werden.',
    ]);
  });
});
