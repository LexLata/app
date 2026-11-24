// normgeber.test.ts
// Importindex-Kategorien sind eine Teilmenge der offenen Normgeber-Codes.
import { expect, it } from 'vitest';
import {
  hatImportindex,
  IMPORTINDEX_KATEGORIEN,
  type ImportindexKategorie,
  normgeberAnzeigename,
} from './normgeber';
import type { Normgeber } from './gesetzTypes';

const kategorie: ImportindexKategorie = 'de-bund';
const normgeber: Normgeber = kategorie;
// @ts-expect-error Die Bundlequelle hat keinen Importindex.
const bundle: ImportindexKategorie = 'europarat';
// @ts-expect-error Ein eigenständiger gültiger Normgeber ist keine Importindex-Kategorie.
const eigenerCode: ImportindexKategorie = 'bund';

it.each([
  ['de-bund', 'Bund'], // normgeber-anzeige: Erwarteter Anzeigename des Codes.
  ['de-bw', 'Baden-Württemberg'],
  ['eu', 'EU'], // normgeber-anzeige: Erwarteter Anzeigename des Codes.
  ['europarat', 'Europarat'], // normgeber-anzeige: Erwarteter Anzeigename des Codes.
  ['at-bund', 'at-bund'],
  ['unbekannt', 'unbekannt'],
  ['bund', 'bund'],
  ['bw', 'bw'],
])('zeigt den Normgeber %s als %s an', (code, name) => {
  expect(normgeberAnzeigename(code)).toBe(name);
});

it('verwendet ausschließlich die drei Normgeber mit Importindex als Kategorien', () => {
  expect(IMPORTINDEX_KATEGORIEN).toEqual(['de-bund', 'de-bw', 'eu']);
  expect(normgeber).toBe('de-bund');
  expect(IMPORTINDEX_KATEGORIEN).not.toContain(bundle);
  expect(IMPORTINDEX_KATEGORIEN).not.toContain(eigenerCode);
});

it.each(['de-bund', 'de-bw', 'eu'])('kennt für %s einen Importindex', (code) => {
  expect(hatImportindex(code)).toBe(true);
});
it.each(['europarat', 'at-bund', 'bund', ''])('kennt für %j keinen Importindex', (code) => {
  expect(hatImportindex(code)).toBe(false);
});
