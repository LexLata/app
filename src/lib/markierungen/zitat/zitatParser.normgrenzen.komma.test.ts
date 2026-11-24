// zitatParser.normgrenzen.komma.test.ts
//
// Tests für zitatParser.normgrenzen.komma.ts (kolokiert, Vitest). Entstanden
// bei der Mutation-Testing-Auswertung vom 2026-08-27 (siehe Chatverlauf) als
// gezielte Ergänzung zu den in zitatParser.test.ts bereits umfangreich
// abgedeckten Grammatik-Fällen – hier speziell: die kontextFuer()-Ableitung
// pro Zusatzart einzeln, der Absturzschutz bei Komma ohne offene Norm, das
// Überschreiben einer bestehenden Zusatzart durch eine römische Zahl, und
// das verfeinerung-Feld im Negativfall (kein Verfeinerungs-Kandidat).
//
// Wie zitatParser.test.ts bewusst NUR über die öffentliche parseZitat()-API
// getestet, nicht über die einzelnen internen Funktionen direkt (nicht
// exportiert – künstlicher Test-only-Export widerspräche "keine Abstraktion
// ohne zwei echte Anwendungsfälle").

import { it, expect } from 'vitest';
import { parseZitat } from './zitatParser';

// ---------------------------------------------------------------------------
// kontextFuer: unterabsatzKontext/satzKontext je Zusatzart einzeln
// (satz/nummer/litera bekommen unterabsatzKontext, absatz NICHT;
//  nummer/litera bekommen satzKontext, satz NICHT)
// ---------------------------------------------------------------------------

it('unterabsatzKontext erscheint bei art:"satz" und art:"nummer", NICHT bei art:"absatz"', () => {
  expect(
    parseZitat('§ 5 UAbs 1 S 2, 3').ambiguitaeten.map((a) => a.unterabsatzKontext),
    'satz',
  ).toEqual(['1']);
  expect(
    parseZitat('§ 5 UAbs 1 Nr 2, 3').ambiguitaeten.map((a) => a.unterabsatzKontext),
    'nummer',
  ).toEqual(['1']);
  expect(
    parseZitat('§ 5 UAbs 1 Abs 2, 3').ambiguitaeten.map((a) => a.unterabsatzKontext),
    'absatz',
  ).toEqual([undefined]);
});

it('satzKontext erscheint bei art:"nummer", NICHT bei art:"satz" selbst', () => {
  expect(
    parseZitat('§ 5 S 1 Nr 2, 3').ambiguitaeten.map((a) => a.satzKontext),
    'nummer',
  ).toEqual(['1']);
  expect(
    parseZitat('§ 5 S 1, 2').ambiguitaeten.map((a) => a.satzKontext),
    'satz',
  ).toEqual([undefined]);
});

it('bei art:"litera" sind unterabsatzKontext/satzKontext/nummerKontext je nach vorhandener Ebene gleichzeitig gesetzt', () => {
  expect(
    parseZitat('§ 5 S 1 Nr 2 lit i, 433').ambiguitaeten.map((a) => ({
      satzKontext: a.satzKontext,
      nummerKontext: a.nummerKontext,
    })),
  ).toEqual([{ satzKontext: '1', nummerKontext: '2' }]);
  expect(
    parseZitat('§ 5 UAbs 1 Nr 2 lit i, 433').ambiguitaeten.map((a) => ({
      unterabsatzKontext: a.unterabsatzKontext,
      nummerKontext: a.nummerKontext,
    })),
  ).toEqual([{ unterabsatzKontext: '1', nummerKontext: '2' }]);
});

// ---------------------------------------------------------------------------
// behandleKomma: Absturzschutz bei Komma ohne offene Norm
// ---------------------------------------------------------------------------

it('ein Komma ganz ohne offene Norm (Textanfang) stürzt nicht ab, sondern wird ignoriert – die folgende Zahl bildet ihre eigene Norm', () => {
  expect(() => parseZitat(', 5')).not.toThrow();
  expect(parseZitat(', 5').zitate.map((z) => z.normzahlRoh)).toEqual(['5']);
  expect(() => parseZitat(',')).not.toThrow();
  expect(parseZitat(',').zitate).toEqual([]);
});

// ---------------------------------------------------------------------------
// behandleKomma: römische Zahl nach Komma überschreibt eine bestehende,
// abweichende Zusatzart (istRoemisch ist IMMER Absatz, siehe Kommentar
// dezimalWert/effektiveZusatzArt)
// ---------------------------------------------------------------------------

it('eine römische Zahl direkt nach dem Komma wird IMMER als Absatz gewertet, auch wenn zuvor eine andere Zusatzart (hier: litera) aktiv war', () => {
  const { ambiguitaeten } = parseZitat('434 lit I, X');
  expect(ambiguitaeten.map((a) => ({ art: a.art, wert: a.wert }))).toEqual([
    { art: 'absatz', wert: '10' },
  ]);
});

// ---------------------------------------------------------------------------
// legeAlsMehrdeutigenKandidatenAn: verfeinerung bleibt undefined ohne Kette
// ---------------------------------------------------------------------------

it('ohne einen tieferen Verfeinerungs-Kandidaten direkt danach bleibt das verfeinerung-Feld undefined (kein leeres Array)', () => {
  const { ambiguitaeten } = parseZitat('§ 5 Abs 1, 2');
  expect(ambiguitaeten).toHaveLength(1);
  expect(ambiguitaeten[0]!.verfeinerung).toBeUndefined();
});

it.each([
  ['§ 5 lit a, b, 7', 'litera'],
  ['§ 5 Abs 1, b, 7', 'absatz'],
] as const)(
  'Buchstaben eröffnen keine Norm und erhalten den Anker für die folgende Zahl: %s',
  (text, art) => {
    const { zitate, ambiguitaeten } = parseZitat(text);
    expect(zitate.map((z) => z.normzahlRoh)).toEqual(['5', '7']);
    expect(ambiguitaeten).toEqual([
      expect.objectContaining({ index: 1, vorherigerIndex: 0, art, wert: '7' }),
    ]);
    expect(zitate.map((z) => text.slice(z.textStart, z.textEnde))).toEqual([
      text.slice(0, 14),
      '7',
    ]);
  },
);

it('eine Zahl nach Litera bleibt prüfbarer Kandidat und erhält eine tiefere Verfeinerung', () => {
  expect(parseZitat('§§ 5 lit a, 7, 8').ambiguitaeten).toEqual([
    expect.objectContaining({ index: 1, vorherigerIndex: 0, art: 'litera', wert: '7' }),
  ]);
  expect(parseZitat('§ 5 Abs 1, 2 S 3 Nr 4').ambiguitaeten).toEqual([
    expect.objectContaining({
      art: 'absatz',
      wert: '2',
      verfeinerung: [
        { art: 'satz', wert: '3' },
        { art: 'nummer', wert: '4' },
      ],
    }),
  ]);
  expect(parseZitat('§ 5 S 1, 2 Abs 3').ambiguitaeten).toEqual([]);
});

it.each(['§§ 5 Abs 1, 2; 3, 4', '§§ 5 Abs 1, 2 § 3, 4'])(
  'ein neues Cluster liefert keinen weiteren Kandidaten für den alten Pluralzwang: %s',
  (text) => {
    const { zitate, ambiguitaeten } = parseZitat(text);
    expect(zitate.map((z) => z.normzahlRoh)).toEqual(['5', '2', '3', '4']);
    expect(ambiguitaeten).toEqual([]);
    expect(zitate.map((z) => text.slice(z.textStart, z.textEnde)).join('')).toBe(text);
  },
);
