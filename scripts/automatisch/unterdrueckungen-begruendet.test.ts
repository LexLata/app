// Prüft die zulässige Form begründeter ESLint-Unterdrückungen anhand echter Kommentare.
import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { kontrolliereUnterdrueckungen, pruefeBestand } from './unterdrueckungen-begruendet.mjs';

describe('Begründete Unterdrückungen', () => {
  it.each([
    '// eslint-disable-next-line no-console',
    '// eslint-disable-next-line no-console -- ',
    '// eslint-disable-next-line no-console -- zu kurz',
    '// eslint-disable-next-line no-console -- a b c d e f g h i',
    '/* eslint-disable no-console -- Technischer Ausnahmegrund */',
    '// eslint-disable-line no-console -- Technischer Ausnahmegrund',
    '// eslint-disable-next-line -- Technischer Ausnahmegrund',
    '// eslint-disable-next-line no-console-- Technischer Ausnahmegrund',
  ])('meldet unzulässige Direktive %s', (code) => {
    expect(kontrolliereUnterdrueckungen(code, 'beispiel.ts')).toHaveLength(1);
  });
  it.each([
    '// eslint-disable-next-line no-console -- Technischer Ausnahmegrund',
    '// eslint-disable-next-line no-console, no-alert -- Technischer Ausnahmegrund',
    'const a = <div>{/* eslint-disable-next-line no-console -- Technischer Ausnahmegrund */}</div>;',
    'const a = "// eslint-disable-next-line no-console";',
    'const a = `/* eslint-disable no-console */`;',
    '// Erläutert eslint-disable ohne eine Direktive zu sein.',
  ])('akzeptiert gültige Kommentare oder reine Zeichenketten %s', (code) => {
    expect(kontrolliereUnterdrueckungen(code, 'beispiel.tsx')).toEqual([]);
  });
  it('nennt die Fundstelle', () => {
    expect(
      kontrolliereUnterdrueckungen('\n// eslint-disable-next-line no-console', 'quelle.ts')[0],
    ).toContain('quelle.ts:2:1');
  });
});

it('prüft den ganzen vereinbarten Bestand einschließlich Tests und Wurzelkonfigurationen', async () => {
  const wurzel = await mkdtemp(join(tmpdir(), 'lexlata-unterdrueckungen-'));
  const dateien = [
    'src/anzeige.tsx',
    'src/anzeige.test.tsx',
    'scripts/pruefung.mjs',
    'eslint-rules/regel.cjs',
    '.konfiguration.js',
  ];
  try {
    for (const ordner of ['src', 'scripts', 'eslint-rules']) await mkdir(join(wurzel, ordner));
    for (const datei of dateien)
      await writeFile(join(wurzel, datei), '// eslint-disable-next-line no-console');
    const fehler = await pruefeBestand(wurzel);
    expect(fehler).toHaveLength(dateien.length);
    for (const datei of dateien)
      expect(fehler.some((meldung) => meldung.startsWith(join(wurzel, datei) + ':1:1:'))).toBe(
        true,
      );
  } finally {
    await rm(wurzel, { recursive: true, force: true });
  }
});
