// interface-durchreichen.test.ts
// Quelltextproben für umbenannte und von außerhalb des Modulordners durchgereichte Interface-Namen.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const regel = require('../../eslint-rules/interface-durchreichen.cjs');
const wurzel = resolve(import.meta.dirname, '../..');
const INTERFACE = 'src/lib/beispiel/beispiel.index.ts';

function meldungen(quelle: string, datei = INTERFACE) {
  return new Linter()
    .verify(
      quelle,
      [
        {
          files: ['**/*.ts'],
          languageOptions: { parser: tseslint.parser },
          plugins: { lexlata: { rules: { durchreichen: regel } } },
          rules: { 'lexlata/durchreichen': 'error' },
        },
      ],
      { filename: resolve(wurzel, datei) },
    )
    .filter((m) => m.ruleId === 'lexlata/durchreichen');
}

describe('Durchreichen in Modul-Interfaces', () => {
  it.each([
    "export { x as y } from './beispiel.kern';",
    "export type { X as Y } from './beispiel.typen';",
    "import { x } from './beispiel.kern'; export { x as y };",
  ])('meldet die Umbenennung %s', (quelle) => {
    expect(meldungen(quelle)).toHaveLength(1);
  });

  it('erlaubt die Umbenennung des Default-Exports', () => {
    expect(meldungen("export { default as Beispiel } from './Beispiel';")).toEqual([]);
  });

  it.each([
    "export { x } from '@/lib/anderes/anderes.index';",
    "export { x } from '../anderes/anderes.index';",
    "export * from '@/lib/anderes/anderes.index';",
    "export type { X } from '@/lib/domain/typen';",
    "export { x } from 'fremdes-paket';",
    "import { x } from '@/lib/anderes/anderes.index'; export { x };",
    "import { x } from '@/lib/anderes/anderes.index'; export const y = x;",
    "import type { X } from '@/lib/domain/typen'; export type Y = X;",
    "import { type X } from 'fremdes-paket'; export type Y = X;",
  ])('meldet die Weitergabe von außerhalb des Modulordners: %s', (quelle) => {
    expect(meldungen(quelle)).toHaveLength(1);
  });

  it.each([
    "export { x } from './beispiel.kern';",
    "export * from './unter/unter.index';",
    "export { x } from '@/lib/beispiel/unter/unter.index';",
    "export type { X } from '@/lib/beispiel/beispiel.typen';",
    "import { x } from './beispiel.kern'; export { x };",
    'export const wert = 1;',
    "import { x } from './beispiel.kern'; export const y = x;",
    "import type { X } from './beispiel.typen'; export type Y = X;",
    "import { x } from '@/lib/anderes/anderes.index'; export const y = x + 1;",
    "import { x } from '@/lib/anderes/anderes.index'; export const y = () => x;",
    "import type { X } from '@/lib/domain/typen'; export type Y = Pick<X, 'a'>;",
    "import type { X } from '@/lib/domain/typen'; export type Y = X | undefined;",
  ])('erlaubt Namen aus dem eigenen Modulordner oder Submodulen: %s', (quelle) => {
    expect(meldungen(quelle)).toEqual([]);
  });

  it('greift nur in Interface-Dateien', () => {
    const quelle = "export { x as y } from '@/lib/anderes/anderes.index';";
    expect(meldungen(quelle, 'src/lib/beispiel/beispiel.kern.ts')).toEqual([]);
  });
});

const { default: konfiguration } = (await import('../../eslint.config.js')) as {
  default: { files?: string[]; rules?: object; ignores?: string[] }[];
};

describe('Konfiguration der Durchreich-Regel', () => {
  const eintrag = konfiguration.find(
    (teil) => teil.rules && 'lexlata/interface-durchreichen' in teil.rules,
  );

  it('gilt für alle Interface-Dateien ohne Ausnahme', () => {
    expect(eintrag).toMatchObject({ files: ['src/**/*.index.ts'] });
    expect(eintrag?.ignores).toBeUndefined();
  });
});
