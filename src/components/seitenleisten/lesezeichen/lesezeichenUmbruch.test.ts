// Prüft den wortweisen Kurztitelumbruch anhand unabhängig bestimmter Beispiele.
import { expect, it } from 'vitest';
import { zerlegeKurztitel } from './lesezeichenHilfen';
it.each([
  ['BGB', ['BGB']],
  ['CIC/1983 IV aF', ['CIC/1983', 'IV aF']],
  ['ABCDEFGHIJKLM', ['ABCDEFGHIJKLM']],
  ['ABCDEFGHIJKL', ['ABCDEFGHIJKL']],
  ['  CIC/1983   IV aF  ', ['CIC/1983', 'IV aF']],
])('zerlegt %s nur an Wortgrenzen ausgewogen', (text, zeilen) => {
  expect(zerlegeKurztitel(text)).toEqual(zeilen);
});
