// modulgrenzen-attrappen.test.ts
// Modulgrenzen für Attrappen an einem Mini-Projekt: welche Ziele gemeldet werden und welche erlaubt sind.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pruefeAttrappen } from './modulgrenzen-attrappen.mjs';

const skript = resolve(import.meta.dirname, 'modulgrenzen-attrappen.mjs');

const MODULGRENZEN = `module.exports = {
  MODULE: [
    { pfad: 'src/lib/aussen' },
    { pfad: 'src/lib/aussen/innen' },
    { pfad: 'src/lib/fremd' },
    { pfad: 'src/lib/fremd/huelle', attrappeVonAussen: 'Hülle des Dateisystems' },
    { pfad: 'src/lib/fremd/teil' },
  ],
  DIREKTIMPORTE: [
    { von: 'src/lib/aussen/abgestimmt.test.ts', nach: 'src/lib/fremd/kern.ts', grund: 'abgestimmt' },
  ],
};`;

const GRUNDDATEIEN: Record<string, string> = {
  'package.json': '{}',
  'scripts/automatisch/modulgrenzen.cjs': MODULGRENZEN,
  'src/lib/aussen/aussen.index.ts': 'export {};',
  'src/lib/aussen/kern.ts': 'export {};',
  'src/lib/aussen/innen/innen.index.ts': 'export {};',
  'src/lib/aussen/innen/teil.ts': 'export {};',
  'src/lib/fremd/fremd.index.ts': 'export {};',
  'src/lib/fremd/kern.ts': 'export {};',
  'src/lib/fremd/ordner/index.ts': 'export {};',
  'src/lib/lose.ts': 'export {};',
  'src/lib/fremd/huelle/huelle.index.ts': 'export {};',
  'src/lib/fremd/huelle/datei.ts': 'export {};',
  'src/lib/fremd/teil/teil.index.ts': 'export {};',
};

let wurzel: string | undefined;
afterEach(() => {
  if (wurzel) rmSync(wurzel, { recursive: true, force: true });
  wurzel = undefined;
});

function projekt(dateien: Record<string, string>): string {
  wurzel = mkdtempSync(join(tmpdir(), 'modulgrenzen-attrappen-'));
  for (const [pfad, inhalt] of Object.entries({ ...GRUNDDATEIEN, ...dateien })) {
    mkdirSync(dirname(join(wurzel, pfad)), { recursive: true });
    writeFileSync(join(wurzel, pfad), inhalt);
  }
  return wurzel;
}

function funde(test: string, datei = 'src/lib/aussen/probe.test.ts') {
  return pruefeAttrappen(projekt({ [datei]: test })).map(({ zeile, art, nach, modul }) => ({
    zeile,
    art,
    nach,
    modul,
  }));
}

describe('Modulgrenzen für Attrappen', () => {
  it('meldet vi.mock auf eine innere Datei eines fremden Moduls mit Alias-Pfad', () => {
    expect(funde(`vi.mock('@/lib/fremd/kern', () => ({}));`)).toEqual([
      { zeile: 1, art: 'vi.mock', nach: 'src/lib/fremd/kern.ts', modul: 'src/lib/fremd' },
    ]);
  });

  it('meldet vi.doMock, vi.importActual, importOriginal-Ziel und dynamisches import()', () => {
    const test = [
      `vi.doMock('../fremd/kern.ts', () => ({}));`,
      `const echt = await vi.importActual<typeof import('@/lib/fremd/kern')>('@/lib/fremd/kern');`,
      `vi.mock('@/lib/fremd/kern', async (importOriginal) => ({ ...(await importOriginal()) }));`,
      `const m = await import('@/lib/fremd/kern');`,
      `vi.mock(import('@/lib/fremd/ordner'), () => ({}));`,
    ].join('\n');
    expect(funde(test).map(({ zeile, art, nach }) => `${zeile} ${art} ${nach}`)).toEqual([
      '1 vi.doMock src/lib/fremd/kern.ts',
      '2 vi.importActual src/lib/fremd/kern.ts',
      '3 vi.mock src/lib/fremd/kern.ts',
      '4 import() src/lib/fremd/kern.ts',
      '5 vi.mock src/lib/fremd/ordner/index.ts',
    ]);
  });

  it('erlaubt das eigene Modul, fremde Interfaces, lose Dateien und externe Pakete', () => {
    const test = [
      `vi.mock('./kern', () => ({}));`,
      `vi.mock('@/lib/fremd/fremd.index', () => ({}));`,
      `vi.mock('@/lib/aussen/innen/innen.index', () => ({}));`,
      `vi.mock('@/lib/lose', () => ({}));`,
      `vi.mock('@tauri-apps/api/core', () => ({}));`,
      `await import('react');`,
    ].join('\n');
    expect(funde(test)).toEqual([]);
  });

  it('meldet den Zugriff des äußeren Moduls auf das Innere seines Submoduls', () => {
    expect(funde(`vi.mock('./innen/teil', () => ({}));`)).toEqual([
      {
        zeile: 1,
        art: 'vi.mock',
        nach: 'src/lib/aussen/innen/teil.ts',
        modul: 'src/lib/aussen/innen',
      },
    ]);
  });

  it('erlaubt dem Submodul das Innere des umgebenden Moduls wie bei gewöhnlichen Importen', () => {
    const datei = 'src/lib/aussen/innen/probe.test.ts';
    expect(funde(`vi.mock('../kern', () => ({}));`, datei)).toEqual([]);
    expect(funde(`vi.mock('./teil', () => ({}));`, datei)).toEqual([]);
  });

  it('erlaubt von außen nur das Interface eines Submoduls mit Attrappenvermerk', () => {
    expect(funde(`vi.mock('@/lib/fremd/huelle/huelle.index', () => ({}));`)).toEqual([]);
    expect(funde(`vi.mock('@/lib/fremd/huelle/datei', () => ({}));`)).toEqual([
      { zeile: 1, art: 'vi.mock', nach: 'src/lib/fremd/huelle/datei.ts', modul: 'src/lib/fremd' },
    ]);
    expect(funde(`vi.mock('@/lib/fremd/teil/teil.index', () => ({}));`)).toEqual([
      {
        zeile: 1,
        art: 'vi.mock',
        nach: 'src/lib/fremd/teil/teil.index.ts',
        modul: 'src/lib/fremd',
      },
    ]);
  });

  it('erlaubt abgestimmte Direktimporte nur für die genannte Kante', () => {
    expect(
      funde(`vi.mock('@/lib/fremd/kern', () => ({}));`, 'src/lib/aussen/abgestimmt.test.ts'),
    ).toEqual([]);
  });

  it('prüft Testhilfen unter src/test, aber keine Produktionsdateien', () => {
    const ziel = `await import('@/lib/fremd/kern');`;
    expect(funde(ziel, 'src/test/hilfe.ts')).toHaveLength(1);
    expect(funde(ziel, 'src/lib/aussen/produktion.ts')).toEqual([]);
  });

  it('meldet Attrappen- und Importziele ohne festes Zeichenkettenliteral', () => {
    const test = [
      `const pfad = '@/lib/fremd/kern';`,
      `vi.mock(pfad, () => ({}));`,
      'vi.doMock(`@/lib/${pfad}`, () => ({}));',
      `await vi.importActual(pfad);`,
      `await vi.importMock(pfad);`,
      `await import(pfad);`,
      `vi.mock(import(pfad), () => ({}));`,
      'vi.mock(`@/lib/fremd/fremd.index`, () => ({}));',
    ].join('\n');
    expect(funde(test)).toEqual([
      { zeile: 2, art: 'vi.mock', nach: undefined, modul: undefined },
      { zeile: 3, art: 'vi.doMock', nach: undefined, modul: undefined },
      { zeile: 4, art: 'vi.importActual', nach: undefined, modul: undefined },
      { zeile: 5, art: 'vi.importMock', nach: undefined, modul: undefined },
      { zeile: 6, art: 'import()', nach: undefined, modul: undefined },
      { zeile: 7, art: 'vi.mock', nach: undefined, modul: undefined },
    ]);
  });

  it('erkennt umbenanntes vi und den Zugriff über den Namensraum vitest', () => {
    const test = [
      `import { vi as v } from 'vitest';`,
      `import * as vitest from 'vitest';`,
      `v.mock('@/lib/fremd/kern', () => ({}));`,
      `vitest.vi.doMock('@/lib/fremd/kern', () => ({}));`,
      `await v.importActual(pfad);`,
    ].join('\n');
    expect(funde(test).map(({ zeile, art, nach }) => `${zeile} ${art} ${nach}`)).toEqual([
      '3 vi.mock src/lib/fremd/kern.ts',
      '4 vi.doMock src/lib/fremd/kern.ts',
      '5 vi.importActual undefined',
    ]);
  });

  it('normalisiert Zielpfade vor der Prüfung', () => {
    const test = [
      `vi.mock('@/lib/../lib/fremd/kern', () => ({}));`,
      `vi.mock('@/lib/fremd/./kern', () => ({}));`,
      `vi.mock('@/lib/aussen/../fremd/kern', () => ({}));`,
    ].join('\n');
    expect(funde(test).map(({ zeile, nach }) => `${zeile} ${nach}`)).toEqual([
      '1 src/lib/fremd/kern.ts',
      '2 src/lib/fremd/kern.ts',
      '3 src/lib/fremd/kern.ts',
    ]);
  });

  it('erlaubt das Interface mit Attrappenvermerk nur als Attrappe, nicht als Import', () => {
    const ziel = '@/lib/fremd/huelle/huelle.index';
    const test = [
      `vi.mock('${ziel}', () => ({}));`,
      `vi.doMock('${ziel}', () => ({}));`,
      `await vi.importMock('${ziel}');`,
      `vi.mock(import('${ziel}'), () => ({}));`,
      `await vi.importActual('${ziel}');`,
      `await import('${ziel}');`,
    ].join('\n');
    expect(funde(test).map(({ zeile, art }) => `${zeile} ${art}`)).toEqual([
      '5 vi.importActual',
      '6 import()',
    ]);
  });

  it('prüft auch Tests und Werkzeuge unter scripts', () => {
    const ziel = `await import('@/lib/fremd/kern');`;
    expect(funde(ziel, 'scripts/automatisch/probe.test.ts')).toHaveLength(1);
    expect(funde(ziel, 'scripts/werkzeuge/werkzeug.ts')).toHaveLength(1);
    expect(funde(ziel, 'scripts/werkzeuge/werkzeug.mjs')).toHaveLength(1);
  });

  it('nennt bei einem Ziel ohne festes Literal Ort und Grund', () => {
    const ort = projekt({ 'src/lib/aussen/probe.test.ts': `const p = 'x';\nvi.mock(p);` });
    const lauf = spawnSync(process.execPath, [skript], { cwd: ort, encoding: 'utf8' });
    expect(lauf.status).toBe(1);
    expect(lauf.stderr).toContain('src/lib/aussen/probe.test.ts:2');
    expect(lauf.stderr).toContain('kein festes Zeichenkettenliteral');
  });

  it('nennt bei Funden Ort, Regel, zulässige Lösungen und unzulässige Umgehungen', () => {
    const ort = projekt({ 'src/lib/aussen/probe.test.ts': `vi.mock('@/lib/fremd/kern');` });
    const lauf = spawnSync(process.execPath, [skript], { cwd: ort, encoding: 'utf8' });
    expect(lauf.status).toBe(1);
    expect(lauf.stderr).toContain('src/lib/aussen/probe.test.ts:1');
    expect(lauf.stderr).toContain('src/lib/fremd/fremd.index.ts');
    expect(lauf.stderr).toContain('nur über dessen Interface');
    expect(lauf.stderr).toContain('Interface des fremden Moduls als Attrappe');
    expect(lauf.stderr).toContain('echt laufen lassen');
    expect(lauf.stderr).toContain('fachlich zuständige Modul verschieben');
    expect(lauf.stderr).toContain('keine Bestandsliste');
    expect(lauf.stderr).toContain('ohne vorherige Abstimmung');
    expect(lauf.stderr).toContain('nur für Tests ohne begründeten Testzugang');
  });

  it('meldet ohne Fund Erfolg', () => {
    const ort = projekt({ 'src/lib/aussen/probe.test.ts': `vi.mock('@/lib/fremd/fremd.index');` });
    const lauf = spawnSync(process.execPath, [skript], { cwd: ort, encoding: 'utf8' });
    expect(lauf.status).toBe(0);
    expect(lauf.stdout).toContain('keine Funde');
  });
});
