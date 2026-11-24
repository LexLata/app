// ungenutzter-app-code.test.ts
// Ungenutzter App-Code an einem Mini-Projekt: was als ungenutzt gilt, welche Testzugänge ausgenommen sind, was die Meldung sagt.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const skript = resolve(import.meta.dirname, 'ungenutzter-app-code.mjs');

const DATEIEN: Record<string, string> = {
  'package.json': JSON.stringify({ name: 'mini', type: 'module', private: true }),
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      noEmit: true,
      jsx: 'react-jsx',
    },
    include: ['src'],
  }),
  'src/main.tsx': `
import { genutzt, testzugangWert } from './lib/modul/modul.index';
import { inEigenerDatei } from './lib/hilfe';
import { appGenutzt, type AppTyp } from './lib/modul/modul.kern';
const typprobe: AppTyp = { c: 1 };
console.log(genutzt, inEigenerDatei(), testzugangWert, appGenutzt, typprobe);
`,
  'src/components/ziehvorschau/ziehvorschau.start.ts': `export {};\n`,
  'src/lib/hilfe.ts': `
export function intern() { return 1; }
export function inEigenerDatei() { return intern(); }
export function nurVomTestGenutzt() { return 2; }
export type UngenutzterTyp = { a: number };
`,
  'src/lib/hilfe.test.ts': `
import { nurVomTestGenutzt } from './hilfe';
export const probe = nurVomTestGenutzt();
`,
  'src/lib/modul/modul.kern.ts': `
export const genutzt = 1;
export const testzugangWert = 2;
export const testzugangName = 3;
export interface TestzugangTyp { b: number }
export const appGenutzt = 4;
export interface AppTyp { c: number }
`,
  'src/lib/modul/modul.index.ts': `
export { genutzt, testzugangWert, testzugangName } from './modul.kern';
export { appGenutzt } from './modul.zwischen';
export type { TestzugangTyp, AppTyp } from './modul.kern';
`,
  'src/lib/modul/modul.zwischen.ts': `
export {
  appGenutzt,
} from './modul.kern';
`,
  'src/lib/nurTestDatei.ts': `export const x = 1;\n`,
  'src/lib/nurTestDatei.test.ts': `import { x } from './nurTestDatei';\nexport const y = x;\n`,
  'src/lib/verwaist.ts': `export const verwaist = 1;\n`,
  'src/test/testhilfe.ts': `export const testhilfeUngenutzt = 1;\n`,
  'scripts/automatisch/interface-namen-testzugaenge.json': JSON.stringify({
    testzugaenge: [
      {
        interface: 'src/lib/modul/modul.index.ts',
        namen: {
          testzugangName: 'Vertrag (Test: x).',
          TestzugangTyp: 'Vertrag (Test: x).',
          appGenutzt: 'Vertrag (Test: x).',
          AppTyp: 'Vertrag (Test: x).',
        },
      },
    ],
  }),
};

let wurzel: string;
let ergebnis: { status: number | null; stdout: string; stderr: string };
const fundzeilen = () =>
  ergebnis.stderr
    .split('\n')
    .filter((zeile) => zeile.startsWith('Ungenutzter App-Code: src/'))
    .join('\n');

beforeAll(() => {
  wurzel = mkdtempSync(join(tmpdir(), 'ungenutzter-app-code-'));
  for (const [pfad, inhalt] of Object.entries(DATEIEN)) {
    mkdirSync(dirname(join(wurzel, pfad)), { recursive: true });
    writeFileSync(join(wurzel, pfad), inhalt);
  }
  ergebnis = spawnSync(process.execPath, [skript], { cwd: wurzel, encoding: 'utf8' });
}, 60_000);

afterAll(() => {
  rmSync(wurzel, { recursive: true, force: true });
});

describe('Prüfung auf ungenutzten App-Code', () => {
  it('scheitert, wenn der App-Code Exporte, Typen oder Dateien nicht nutzt', () => {
    expect(ergebnis.status).toBe(1);
  });

  it('meldet Exporte und Typen, die nur Tests oder niemand nutzen, mit Fundstelle', () => {
    expect(fundzeilen()).toMatch(/src\/lib\/hilfe\.ts:4 .*nurVomTestGenutzt/);
    expect(fundzeilen()).toMatch(/src\/lib\/hilfe\.ts:5 .*UngenutzterTyp/);
  });

  it('meldet Dateien, die nur Tests oder niemand nutzen', () => {
    expect(fundzeilen()).toMatch(/src\/lib\/nurTestDatei\.ts .*Datei/);
    expect(fundzeilen()).toMatch(/src\/lib\/verwaist\.ts .*Datei/);
  });

  it('zählt die Nutzung in der eigenen Datei als Nutzung', () => {
    expect(fundzeilen()).not.toMatch(/\bintern\b/);
    expect(fundzeilen()).not.toMatch(/inEigenerDatei/);
    expect(fundzeilen()).not.toMatch(/\bgenutzt\b/);
  });

  it('nimmt für einen Testzugang Interface-Zeile und Weiterreichung im Modul aus, wenn der App-Code den Namen anderswo nutzt', () => {
    expect(fundzeilen()).not.toMatch(/appGenutzt/);
    expect(fundzeilen()).not.toMatch(/AppTyp/);
  });

  it('meldet Funktionen und Typen hinter einem Testzugang, die der App-Code nirgends nutzt', () => {
    expect(fundzeilen()).toMatch(/src\/lib\/modul\/modul\.kern\.ts:4 .*Export testzugangName/);
    expect(fundzeilen()).toMatch(/src\/lib\/modul\/modul\.kern\.ts:5 .*Typ TestzugangTyp/);
  });

  it('lässt Testhilfen unter src/test außer Betracht', () => {
    expect(fundzeilen()).not.toMatch(/testhilfe/);
  });

  it('erklärt Regel und zulässige Lösungen und schließt Umgehungen aus', () => {
    expect(ergebnis.stderr).toMatch(/Regel:/);
    expect(ergebnis.stderr).toMatch(/löschen/i);
    expect(ergebnis.stderr).toMatch(/interface-namen-testzugaenge\.json/);
    expect(ergebnis.stderr).toMatch(/Testzugang deckt nur die Interface-Zeile ab/);
    expect(ergebnis.stderr).toMatch(/Unzulässig/);
    expect(ergebnis.stderr).toMatch(/Unterdrückung/);
    expect(ergebnis.stderr).toMatch(/künstlich/);
  });

  it('meldet Erfolg, wenn der App-Code alles nutzt', () => {
    const sauber = mkdtempSync(join(tmpdir(), 'ungenutzter-app-code-sauber-'));
    try {
      const dateien = {
        'package.json': DATEIEN['package.json'],
        'tsconfig.json': DATEIEN['tsconfig.json'],
        'src/main.tsx': `import { a } from './lib/a';\nconsole.log(a);\n`,
        'src/components/ziehvorschau/ziehvorschau.start.ts': `export {};\n`,
        'src/lib/a.ts': `export const a = 1;\n`,
        'scripts/automatisch/interface-namen-testzugaenge.json': JSON.stringify({
          testzugaenge: [],
        }),
      };
      for (const [pfad, inhalt] of Object.entries(dateien)) {
        mkdirSync(dirname(join(sauber, pfad)), { recursive: true });
        writeFileSync(join(sauber, pfad), inhalt);
      }
      const lauf = spawnSync(process.execPath, [skript], { cwd: sauber, encoding: 'utf8' });
      expect(lauf.stderr).toBe('');
      expect(lauf.status).toBe(0);
    } finally {
      rmSync(sauber, { recursive: true, force: true });
    }
  }, 60_000);
});
