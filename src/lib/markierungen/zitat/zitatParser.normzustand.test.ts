// Ebenenwechsel erhalten übergeordnete Werte und verwerfen tiefere Kontexte.

import { expect, it } from 'vitest';
import { erzeugeNormState, setzeEbene } from './zitatParser.normzustand';
import { parseZitat } from './zitatParser';

it.each([
  ['absatz', ['9', undefined, undefined, undefined]],
  ['unterabsatz', ['1', '9', undefined, undefined]],
  ['satz', ['1', '2', '9', undefined]],
  ['nummer', ['1', '2', '3', '9']],
] as const)('setzeEbene für %s erhält nur übergeordnete Kontextwerte', (art, erwartet) => {
  const state = erzeugeNormState();
  state.aktiverAbsatzWert = '1';
  state.aktiverUnterabsatzWert = '2';
  state.aktiverSatzWert = '3';
  state.aktiverNummerWert = '4';
  setzeEbene(state, art, '9');
  expect([
    state.aktiverAbsatzWert,
    state.aktiverUnterabsatzWert,
    state.aktiverSatzWert,
    state.aktiverNummerWert,
  ]).toEqual(erwartet);
});

it.each([
  ['Abs. 9', ['9', undefined, undefined, undefined]],
  ['IX', ['9', undefined, undefined, undefined]],
  ['UAbs. 9', ['1', '9', undefined, undefined]],
  ['S. 9', ['1', '2', '9', undefined]],
  ['Abs. 9 8', ['9', undefined, '8', undefined]],
  ['IX 8', ['9', undefined, '8', undefined]],
  ['Nr. 9', ['1', '2', '3', '9']],
] as const)(
  'Kontextwechsel durch %s erscheint im folgenden Litera-Kandidaten',
  (wechsel, erwartet) => {
    const { ambiguitaeten } = parseZitat(`§ 5 Abs. 1 UAbs. 2 S. 3 Nr. 4 ${wechsel} lit. a, 7`);
    expect(ambiguitaeten).toHaveLength(1);
    const punkt = ambiguitaeten[0]!;
    expect(punkt.art).toBe('litera');
    expect([
      punkt.absatzKontext,
      punkt.unterabsatzKontext,
      punkt.satzKontext,
      punkt.nummerKontext,
    ]).toEqual(erwartet);
  },
);

it.each(['Abs. 3', 'III', 'a', '1. Alt.'])('Zusatz ohne Ziel nach Semikolon: %s', (zusatz) => {
  const { zitate, ambiguitaeten } = parseZitat(`§§ 5 Abs. 1 UAbs. 2 S. 3 Nr. 4; ${zusatz}`);
  expect(zitate.map((zitat) => zitat.ohneZiel === true)).toEqual([false, true]);
  expect(ambiguitaeten).toEqual([]);
});

it.each([', III', '§ 5; , III'])(
  'Komma ohne Anker lässt römischen Absatz ohne Ziel: %s',
  (text) => {
    const { zitate, ambiguitaeten } = parseZitat(text);
    expect(zitate.at(-1)?.ohneZiel).toBe(true);
    expect(ambiguitaeten).toEqual([]);
  },
);

it.each(['UAbs.', 'S.', 'Nr.'])('Wert von %s erwartet keine Satz-Kurzform', (zusatz) => {
  const { ambiguitaeten } = parseZitat(`§ 5 ${zusatz} 2 3, 4`);
  const art = zusatz === 'UAbs.' ? 'unterabsatz' : zusatz === 'S.' ? 'satz' : 'nummer';
  expect(ambiguitaeten.map((punkt) => punkt.art)).toEqual([art]);
});
