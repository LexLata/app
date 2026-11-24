// leerraum.test.ts
// Verhalten der gemeinsamen Leerraum-Normalisierung für Importtexte.

import { describe, expect, it } from 'vitest';
import { normalisiereWS } from './leerraum';

const FAELLE: [string, string, string][] = [
  ['leerer String', '', ''],
  ['nur Leerraum', ' \t\n  ', ''],
  ['führender und nachgestellter Leerraum', '  a b  ', 'a b'],
  ['Tabulator', 'a\tb', 'a b'],
  ['Zeilenumbruch', 'Zeile1\nZeile2\r\nZeile3', 'Zeile1 Zeile2 Zeile3'],
  ['geschütztes Leerzeichen (U+00A0)', 'a\u00a0b', 'a b'],
  ['mehrere Leerräume nacheinander', 'a  \t\n  b   c', 'a b c'],
  ['ohne Leerraum', 'abc', 'abc'],
];

describe('normalisiereWS', () => {
  it.each(FAELLE)('%s', (_fall, eingabe, erwartet) => {
    expect(normalisiereWS(eingabe)).toBe(erwartet);
  });
});
