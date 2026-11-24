// interface-namen-pruefen.test.ts
// Ungenutzte Interface-Namen an einem Mini-Projekt: welche Zugriffe außerhalb des Modulordners zählen.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { liesTestzugaenge, pruefeInterfaceNamen } from './interface-namen-pruefen.mjs';

const skript = resolve(import.meta.dirname, 'interface-namen-pruefen.mjs');
const INTERFACE = 'src/lib/modul/modul.index.ts';
const TESTZUGAENGE = 'scripts/automatisch/interface-namen-testzugaenge.json';

// Jeder Name im Interface steht für einen Fall; der Name sagt, wo er genutzt wird.
const DATEIEN: Record<string, string> = {
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      noEmit: true,
      allowImportingTsExtensions: true,
      paths: { '@/*': ['./src/*'] },
    },
    include: ['src'],
  }),
  'src/lib/modul/modul.kern.ts': `
export const nurImModul = 1;
export const statisch = 2;
export const dynamischDestrukturiert = 3;
export const dynamischesModulobjekt = 4;
export const namespaceZugriff = 5;
export const nurTestAussen = 6;
export const nurTestInnen = 7;
export const nurSkript = 8;
export const nurMock = 9;
export const nurMockTypisiert = 10;
export interface ImportTyp { a: number }
export interface ExportTypGenutzt { b: number }
export interface ExportTypUngenutzt { c: number }
`,
  [INTERFACE]: `
export {
  nurImModul,
  statisch,
  dynamischDestrukturiert,
  dynamischesModulobjekt,
  namespaceZugriff,
  nurTestAussen,
  nurTestInnen,
  nurSkript,
  nurMock,
  nurMockTypisiert,
} from './modul.kern';
export type { ImportTyp, ExportTypGenutzt, ExportTypUngenutzt } from './modul.kern';
`,
  'src/lib/modul/modul.nutzer.ts': `
import { nurImModul } from './modul.index';
export const wert = nurImModul;
`,
  'src/lib/modul/modul.test.ts': `
import { nurTestInnen } from './modul.index';
export const probe = nurTestInnen;
`,
  'src/lib/anderes/statisch.ts': `
import { statisch } from '@/lib/modul/modul.index';
export const a = statisch;
`,
  'src/lib/anderes/dynamisch.ts': `
export async function lade() {
  const { dynamischDestrukturiert } = await import('@/lib/modul/modul.index');
  const modul = await import('@/lib/modul/modul.index');
  return dynamischDestrukturiert + modul.dynamischesModulobjekt;
}
`,
  'src/lib/anderes/namespace.ts': `
import * as modul from '@/lib/modul/modul.index';
export const n = modul.namespaceZugriff;
`,
  'src/lib/anderes/importTyp.ts': `
export type T = import('@/lib/modul/modul.index').ImportTyp;
`,
  'src/lib/anderes/exportTyp.ts': `
import type { ExportTypGenutzt } from '@/lib/modul/modul.index';
export type U = ExportTypGenutzt;
`,
  'src/test/aussen.test.ts': `
import { nurTestAussen } from '@/lib/modul/modul.index';
export const t = nurTestAussen;
`,
  'src/lib/anderes/attrappe.test.ts': `
declare const vi: { mock: (...args: unknown[]) => void; fn: () => unknown };
vi.mock('@/lib/modul/modul.index', () => ({ nurMock: vi.fn() }));
vi.mock(import('@/lib/modul/modul.index'), async (importOriginal: () => Promise<typeof import('@/lib/modul/modul.index')>) => ({
  ...(await importOriginal()),
  nurMockTypisiert: 11,
}));
`,
  'scripts/werkzeug.ts': `
import { nurSkript } from '@/lib/modul/modul.index';
export const s = nurSkript;
`,
};

let projekt: string;

function schreibe(pfad: string, inhalt: string) {
  mkdirSync(dirname(join(projekt, pfad)), { recursive: true });
  writeFileSync(join(projekt, pfad), inhalt);
}

function lauf(...args: string[]) {
  return spawnSync(process.execPath, [skript, ...args], { cwd: projekt, encoding: 'utf8' });
}

beforeAll(() => {
  projekt = mkdtempSync(join(tmpdir(), 'lexlata-interface-namen-'));
  for (const [pfad, inhalt] of Object.entries(DATEIEN)) schreibe(pfad, inhalt);
});

afterAll(() => rmSync(projekt, { recursive: true, force: true }));

describe('Prüfung ungenutzter Interface-Namen', () => {
  it('meldet genau die außerhalb des Modulordners ungenutzten Namen', () => {
    schreibe(TESTZUGAENGE, '{ "testzugaenge": [] }\n');
    const ergebnis = lauf();
    expect(ergebnis.status).toBe(1);
    const gemeldet = [...ergebnis.stderr.matchAll(/ungenutzt: (\S+)/g)].map((t) => t[1]).sort();
    expect(gemeldet).toEqual([
      'ExportTypUngenutzt',
      'nurImModul',
      'nurMock',
      'nurMockTypisiert',
      'nurTestInnen',
    ]);
    expect(ergebnis.stderr).toContain(INTERFACE);
  });

  it('zählt Namen, die nur in vi.mock-Fabriken vorkommen, nicht als Nutzung', () => {
    schreibe(TESTZUGAENGE, '{ "testzugaenge": [] }\n');
    const ergebnis = lauf();
    expect(ergebnis.stderr).toMatch(/ungenutzt: nurMock\b/);
    expect(ergebnis.stderr).toMatch(/ungenutzt: nurMockTypisiert\b/);
    expect(ergebnis.stderr).not.toMatch(/nur von Tests genutzt: nurMock/);
  });

  it('meldet einen außerhalb nur von Tests genutzten Namen ohne Eintrag', () => {
    schreibe(TESTZUGAENGE, '{ "testzugaenge": [] }\n');
    const ergebnis = lauf();
    expect(ergebnis.status).toBe(1);
    expect(ergebnis.stderr).toMatch(/nur von Tests genutzt: nurTestAussen/);
  });

  it('nennt im Listenmodus die Namen, die außerhalb nur Tests nutzen', () => {
    schreibe(TESTZUGAENGE, '{ "testzugaenge": [] }\n');
    const ergebnis = lauf('--nur-tests');
    expect(ergebnis.status).toBe(0);
    expect(ergebnis.stdout).toContain(INTERFACE);
    expect(ergebnis.stdout).toContain('nurTestAussen');
    expect(ergebnis.stdout).not.toContain('nurSkript');
    expect(ergebnis.stdout).not.toContain('statisch');
  });
});

describe('Liste der Testzugänge', () => {
  const I = 'src/lib/modul/modul.index.ts';
  const nutzung = [
    { interface: I, name: 'genutzt', nutzung: 'genutzt' },
    { interface: I, name: 'nurTest', nutzung: 'nurTests' },
  ];
  const liste = (namen: Record<string, string>, pfad = I) =>
    liesTestzugaenge(JSON.stringify({ testzugaenge: [{ interface: pfad, namen }] }));

  it('erlaubt einen nur von Tests genutzten Namen mit Begründung', () => {
    const testzugaenge = liste({ nurTest: 'Dateiformat (Test: modul.format.test.ts)' });
    expect(pruefeInterfaceNamen({ nutzung, testzugaenge })).toEqual([]);
  });

  it('meldet einen Eintrag ohne Begründung', () => {
    const fehler = pruefeInterfaceNamen({ nutzung, testzugaenge: liste({ nurTest: ' ' }) });
    expect(fehler).toHaveLength(1);
    expect(fehler[0]).toContain('ohne Begründung');
    expect(fehler[0]).toContain('nurTest');
  });

  it('meldet einen Eintrag für einen regulär genutzten Namen als überholt', () => {
    const testzugaenge = liste({
      nurTest: 'Grund (Test: a.test.ts)',
      genutzt: 'Grund (Test: b.test.ts)',
    });
    const fehler = pruefeInterfaceNamen({ nutzung, testzugaenge });
    expect(fehler).toEqual([expect.stringMatching(/überholt: .*genutzt/)]);
  });

  it('meldet einen Eintrag für einen ungenutzten Namen als überholt und den Namen als ungenutzt', () => {
    const mitUngenutzt = [...nutzung, { interface: I, name: 'frei', nutzung: 'keine' }];
    const testzugaenge = liste({
      nurTest: 'Grund (Test: a.test.ts)',
      frei: 'Grund (Test: b.test.ts)',
    });
    const fehler = pruefeInterfaceNamen({ nutzung: mitUngenutzt, testzugaenge });
    expect(fehler).toHaveLength(2);
    expect(fehler).toContainEqual(expect.stringMatching(/überholt: .*frei/));
    expect(fehler).toContainEqual(expect.stringMatching(/ungenutzt: frei/));
  });

  it('meldet Einträge für nicht mehr vorhandene Namen und Interfaces als überholt', () => {
    const testzugaenge = liesTestzugaenge(
      JSON.stringify({
        testzugaenge: [
          {
            interface: I,
            namen: { nurTest: 'Grund (Test: a.test.ts)', weg: 'Grund (Test: b.test.ts)' },
          },
          { interface: 'src/lib/weg/weg.index.ts', namen: { x: 'Grund (Test: c.test.ts)' } },
        ],
      }),
    );
    const fehler = pruefeInterfaceNamen({ nutzung, testzugaenge });
    expect(fehler).toHaveLength(2);
    expect(fehler).toContainEqual(expect.stringMatching(/überholt: .*weg/));
    expect(fehler).toContainEqual(
      expect.stringMatching(/überholt: src\/lib\/weg\/weg\.index\.ts: x/),
    );
  });

  it('meldet ein doppelt eingetragenes Interface', () => {
    const testzugaenge = liesTestzugaenge(
      JSON.stringify({
        testzugaenge: [
          { interface: I, namen: { nurTest: 'Grund (Test: a.test.ts)' } },
          { interface: I, namen: {} },
        ],
      }),
    );
    expect(pruefeInterfaceNamen({ nutzung, testzugaenge })).toEqual([
      expect.stringMatching(/src\/lib\/modul\/modul\.index\.ts: steht doppelt/),
    ]);
  });

  it('lehnt eine Liste in falscher Form ab', () => {
    expect(() =>
      liesTestzugaenge('{ "testzugaenge": [{ "interface": "a", "namen": ["x"] }] }'),
    ).toThrow();
  });
});
