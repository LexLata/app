import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';

import {
  dateiCaseVerstoesse,
  ordnerVerstoesse,
  pfadAusHookEingabe,
} from './pfad-kleinschreibung.mjs';

describe('ordnerVerstoesse', () => {
  it('akzeptiert reine Kleinbuchstaben-Ordner', () => {
    expect(ordnerVerstoesse(['src/lib/domain/gesetz.ts'])).toEqual([]);
  });

  it('ignoriert Großbuchstaben im Dateinamen', () => {
    expect(ordnerVerstoesse(['src/lib/README.md', 'LICENSE'])).toEqual([]);
  });

  it('meldet einen Ordner mit Großbuchstaben', () => {
    expect(ordnerVerstoesse(['src/Lib/domain/gesetz.ts'])).toEqual(['src/Lib']);
  });

  it('meldet den obersten verstoßenden Ordner, nicht die Kinder', () => {
    expect(ordnerVerstoesse(['src/Lib/Domain/gesetz.ts'])).toEqual(['src/Lib']);
  });

  it('dedupliziert über mehrere Dateien im selben Ordner', () => {
    expect(ordnerVerstoesse(['src/Lib/a.ts', 'src/Lib/b.ts'])).toEqual(['src/Lib']);
  });

  it('nimmt generierte native Ordner (src-tauri/gen) aus', () => {
    expect(
      ordnerVerstoesse([
        'src-tauri/gen/apple/Assets.xcassets/Contents.json',
        'src-tauri/gen/android/buildSrc/build.gradle.kts',
      ]),
    ).toEqual([]);
  });

  it('Property: Pfade aus rein kleingeschriebenen Segmenten sind nie ein Verstoß', () => {
    const kleinSegment = fc.constantFrom(
      'src',
      'lib',
      'domain',
      'persistenz',
      'unter-ordner',
      'x1',
      '__tests__',
    );
    fc.assert(
      fc.property(
        fc.array(kleinSegment, { minLength: 1, maxLength: 6 }),
        fc.constantFrom('index.ts', 'Gesetz.tsx', 'README.md'),
        (segmente, dateiname) => {
          const pfad = [...segmente, dateiname].join('/');
          expect(ordnerVerstoesse([pfad])).toEqual([]);
        },
      ),
    );
  });
});

describe('dateiCaseVerstoesse', () => {
  let basis: string;

  afterEach(() => {
    if (basis) rmSync(basis, { recursive: true, force: true });
  });

  it('meldet nichts, wenn Git-Pfad und Dateisystem exakt übereinstimmen', () => {
    basis = mkdtempSync(join(tmpdir(), 'pfad-case-'));
    mkdirSync(join(basis, 'src/lib/markierungen/hilfsfenster-aktionen'), { recursive: true });
    writeFileSync(
      join(basis, 'src/lib/markierungen/hilfsfenster-aktionen/hilfsfenster-aktionen.index.ts'),
      '',
    );

    expect(
      dateiCaseVerstoesse(
        ['src/lib/markierungen/hilfsfenster-aktionen/hilfsfenster-aktionen.index.ts'],
        basis,
      ),
    ).toEqual([]);
  });

  it('meldet eine abweichende Groß-/Kleinschreibung im Dateinamen (Reproduktion eines Dateinamenfalls)', () => {
    basis = mkdtempSync(join(tmpdir(), 'pfad-case-'));
    mkdirSync(join(basis, 'src/lib/markierungen/hilfsfenster-aktionen'), { recursive: true });
    // Git-Index "denkt" der Pfad heißt hilfsfenster-aktionen.index.ts (großes H),
    // tatsächlich liegt auf der Platte nur hilfsfenster-aktionen.index.ts (kleines h).
    writeFileSync(
      join(basis, 'src/lib/markierungen/hilfsfenster-aktionen/hilfsfenster-aktionen.index.ts'),
      '',
    );

    const funde = dateiCaseVerstoesse(
      ['src/lib/markierungen/hilfsfenster-aktionen/Hilfsfenster-aktionen.index.ts'],
      basis,
    );
    expect(funde).toHaveLength(1);
    expect(funde[0]).toContain('Hilfsfenster-aktionen.index.ts');
    expect(funde[0]).toContain('hilfsfenster-aktionen.index.ts');
  });

  it('meldet eine abweichende Groß-/Kleinschreibung in einem Verzeichnissegment', () => {
    basis = mkdtempSync(join(tmpdir(), 'pfad-case-'));
    mkdirSync(join(basis, 'src/Lib/domain'), { recursive: true });
    writeFileSync(join(basis, 'src/Lib/domain/gesetz.ts'), '');

    expect(dateiCaseVerstoesse(['src/lib/domain/gesetz.ts'], basis)).toHaveLength(1);
  });

  it('meldet nichts, wenn der Pfad auf der Platte gar nicht (mehr) existiert', () => {
    basis = mkdtempSync(join(tmpdir(), 'pfad-case-'));
    mkdirSync(join(basis, 'src'), { recursive: true });

    expect(dateiCaseVerstoesse(['src/laengst/geloescht.ts'], basis)).toEqual([]);
  });

  it('dedupliziert und sortiert über mehrere Funde', () => {
    basis = mkdtempSync(join(tmpdir(), 'pfad-case-'));
    mkdirSync(join(basis, 'src/b'), { recursive: true });
    mkdirSync(join(basis, 'src/a'), { recursive: true });
    writeFileSync(join(basis, 'src/b/datei.ts'), '');
    writeFileSync(join(basis, 'src/a/datei.ts'), '');

    const funde = dateiCaseVerstoesse(
      ['src/B/datei.ts', 'src/A/datei.ts', 'src/B/datei.ts'],
      basis,
    );
    expect(funde).toHaveLength(2);
    expect(funde).toEqual([...funde].sort());
  });
});

describe('pfadAusHookEingabe', () => {
  const wurzel = '/projekt';

  it('liefert den projektrelativen Pfad aus einem absoluten file_path', () => {
    const eingabe = JSON.stringify({ tool_input: { file_path: '/projekt/src/Lib/a.ts' } });
    expect(pfadAusHookEingabe(eingabe, wurzel)).toBe('src/Lib/a.ts');
  });

  it('reicht einen bereits relativen file_path durch', () => {
    const eingabe = JSON.stringify({ tool_input: { file_path: 'src/lib/a.ts' } });
    expect(pfadAusHookEingabe(eingabe, wurzel)).toBe('src/lib/a.ts');
  });

  it('normalisiert Windows-Trenner zu Schrägstrichen', () => {
    const eingabe = JSON.stringify({ tool_input: { file_path: 'src\\Lib\\a.ts' } });
    expect(pfadAusHookEingabe(eingabe, wurzel)).toBe('src/Lib/a.ts');
  });

  it('liefert null bei einem Pfad außerhalb des Projekts', () => {
    const eingabe = JSON.stringify({ tool_input: { file_path: '/woanders/Ordner/a.ts' } });
    expect(pfadAusHookEingabe(eingabe, wurzel)).toBeNull();
  });

  it('liefert null bei fehlendem file_path oder kaputtem JSON', () => {
    expect(pfadAusHookEingabe(JSON.stringify({ tool_input: {} }), wurzel)).toBeNull();
    expect(pfadAusHookEingabe('kein json', wurzel)).toBeNull();
    expect(pfadAusHookEingabe('', wurzel)).toBeNull();
  });
});
