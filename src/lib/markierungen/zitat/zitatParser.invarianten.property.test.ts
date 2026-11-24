// Dauerhafte Text- und Datenverträge mit dem Vokabular der eingefrorenen Grundlinie.

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseZitat, type Kurztitelbestand, type ZitatProfilAbfrage } from './zitatParser';

const BAUSTEINE = [
  '§',
  '§§',
  'Art.',
  'Artikel',
  'ErwG',
  '1',
  '2',
  '3',
  '5',
  '6',
  '7',
  '9',
  '18',
  '90',
  '229',
  '280',
  '433',
  '434',
  '2265',
  '2275',
  '2278',
  '2283',
  '5a',
  '5f',
  '5ff',
  '1.',
  'Abs.',
  'Absatz',
  'UAbs.',
  'Unterabsatz',
  'S.',
  'Satz',
  'Nr.',
  'Nummer',
  'Ziff.',
  'lit.',
  'a',
  'b',
  'Alt.',
  'Var.',
  'Gr.',
  'Hs.',
  'I',
  'II',
  'III',
  'IV',
  'IIII',
  'BGB',
  'GG',
  'StGB',
  'ZPO',
  'ZVG',
  'HGB',
  'StPO',
  'EGBGB',
  'AEUV',
  'CIC',
  'CCEO',
  'SGB IV',
  ',',
  ';',
  '/',
  'und',
  'UND.',
  'sowie',
  'oder.',
  'bzw.',
  '–',
  '—',
  'and.',
  'et.',
  'Buchst.',
  'Unterabs.',
  'Halbs.',
  'des',
  '5bis',
  '5aa',
  'analog',
  'vgl.',
  'i.V.m.',
  'a.E.',
  'am Ende',
  'ff.',
  'bis',
  '-',
  'can.',
  'canon',
  'c.',
  'Kan.',
  'Kanon',
  'cann.',
  'canons',
  'canones',
  'cc.',
  'Kanones',
  'Canons',
  'n.',
  'and',
  'et',
  'VO zu § 18 LHO',
  'Art. und Abs. 2 / Can. 3',
  'VO zu § 18',
  'vo  zu\t§ 18\nLHO.',
];

const PROFILABFRAGEN: Array<{ name: string; profil: ZitatProfilAbfrage | undefined }> = [
  { name: 'ohne Profil', profil: undefined },
  { name: 'immer Canon', profil: () => 'canon' },
  {
    name: 'gemischtes Profil',
    profil: ({ gesetzRoh }) => (!gesetzRoh || gesetzRoh === 'CIC' ? 'canon' : undefined),
  },
];

const BESTAENDE: Array<{ name: string; bestand: Kurztitelbestand | undefined }> = [
  { name: 'ohne Bestand', bestand: undefined },
  {
    name: 'mit unveränderlichem Bestand',
    bestand: Object.freeze(
      [
        'VO zu § 18 LHO',
        'VO zu § 18',
        'Art. und Abs. 2 / Can. 3',
        'SGB\u00a0IV',
        'BGB.',
        'CIC',
      ].map((kurztitel) => Object.freeze({ kurztitel })),
    ),
  },
];
const PROFILE = PROFILABFRAGEN.flatMap((profil) =>
  BESTAENDE.map((bestand) => ({
    name: `${profil.name}, ${bestand.name}`,
    profil: profil.profil,
    bestand: bestand.bestand,
  })),
);

const textArb = fc
  .array(fc.tuple(fc.constantFrom(...BAUSTEINE), fc.constantFrom('', ' ')), {
    minLength: 1,
    maxLength: 12,
  })
  .map((teile) =>
    teile.map(([wort, trenner], index) => (index === 0 ? '' : trenner) + wort).join(''),
  );

describe.each(PROFILE)('Parserverträge: $name', ({ profil, bestand }) => {
  it.each(['und', ',', 'vgl.', 'analog', '/', ''])(
    'leeres Ergebnis für "%s" ist zulässig',
    (text) => {
      expect(parseZitat(text, profil, bestand)).toEqual({ zitate: [], ambiguitaeten: [] });
    },
  );

  it('nichtleere Ergebnisse kacheln den Text und erfüllen alle Datenverträge', () => {
    fc.assert(
      fc.property(textArb, (text) => {
        const { zitate, ambiguitaeten } = parseZitat(text, profil, bestand);
        if (zitate.length > 0) {
          expect(zitate[0]!.textStart).toBe(0);
          expect(zitate.at(-1)!.textEnde).toBe(text.length);
        }
        for (const [index, zitat] of zitate.entries()) {
          expect(Number.isInteger(zitat.textStart)).toBe(true);
          expect(Number.isInteger(zitat.textEnde)).toBe(true);
          expect(zitat.textStart).toBeGreaterThanOrEqual(0);
          expect(zitat.textEnde).toBeGreaterThanOrEqual(zitat.textStart);
          expect(zitat.textEnde).toBeLessThanOrEqual(text.length);
          if (index > 0) expect(zitat.textStart).toBe(zitate[index - 1]!.textEnde);
          if (zitat.gesetzRoh === undefined) expect(Object.hasOwn(zitat, 'gesetzRoh')).toBe(false);
          expect(zitat.ohneZiel === true && zitat.ganzesGesetz === true).toBe(false);
        }
        for (const punkt of ambiguitaeten) {
          expect(Number.isInteger(punkt.index)).toBe(true);
          expect(Number.isInteger(punkt.vorherigerIndex)).toBe(true);
          expect(punkt.vorherigerIndex).toBeGreaterThanOrEqual(0);
          expect(punkt.index).toBeGreaterThan(punkt.vorherigerIndex);
          expect(punkt.index).toBeLessThan(zitate.length);
        }
      }),
      { seed: 987654321, numRuns: 1000 },
    );
  });
});
