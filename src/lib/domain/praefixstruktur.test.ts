// praefixstruktur.test.ts
// Verhalten und Invarianten der Bestimmung aus dem Darstellungsmodell.
import { gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import { expect, it } from 'vitest';
import fc from 'fast-check';
import type { GesetzDarstellung, NormDarstellung } from './gesetzTypes';
import { ermittlePraefixstruktur, ordnePraefixstrukturNormEin } from './praefixstruktur';

const bestimmePraefixstruktur = (g: GesetzDarstellung) =>
  ermittlePraefixstruktur(g).praefixstruktur;

it.each([
  [['', 'Schlussformel'], 'unbezeichnete-normen'],
  [['§ 1', 'Unbekannt'], 'sonstige-bezeichnungen'],
] as const)('ermittelt für %j den dauerhaften Diagnosegrund %s', (namen, diagnosegrund) => {
  expect(ermittlePraefixstruktur(gesetz([...namen]))).toEqual({
    praefixstruktur: 'unklar',
    diagnosegrund,
  });
});
it('liefert für eindeutige Strukturen keinen Diagnosegrund und unterscheidet reine Überschriften', () => {
  expect(ermittlePraefixstruktur(gesetz(['I.', 'II.']))).toEqual({ praefixstruktur: 'roemisch' });
  const g = gesetz([]);
  g.elemente.push({
    typ: 'ueberschrift',
    data: {
      id: 'u',
      xmlId: 'ueberschrift:001',
      bezeichnung: 'Teil 1',
      ebene: 1,
      gliederungskennzahl: '001',
    },
  });
  expect(ermittlePraefixstruktur(g)).toEqual({
    praefixstruktur: 'unklar',
    diagnosegrund: 'nur-ueberschriften',
  });
});

it.each([
  ['§ 1', 'paragraph'],
  ['Art.1', 'artikel'],
  ['Anlage 1', 'ausgeschlossen'],
  ['Muster 1', 'ausgeschlossen'],
  ['Muster', 'ausgeschlossen'],
  ['Muster1', 'sonstige'],
  ['Musterung', 'sonstige'],
  ['Schlussformel', 'ausgeschlossen'],
  ['Anlagen', 'ausgeschlossen'],
  ['Anlagen 1 bis 3', 'ausgeschlossen'],
  ['Schlußformel', 'ausgeschlossen'],
  ['Inhaltsverzeichnis', 'ausgeschlossen'],
  ['Anlagenverzeichnis', 'sonstige'],
  ['', 'sonstige'],
  ['I.', 'roemisch'],
  ['IV.', 'roemisch'],
  [' XVIII. ', 'roemisch'],
  ['III', 'roemisch'],
  ['IIII.', 'sonstige'],
  ['IC.', 'sonstige'],
  ['I. und II.', 'roemisch'],
  ['IVG', 'sonstige'],
] as const)('erklärt die Einordnung von %j als %s', (bezeichnung, erwartet) => {
  expect(ordnePraefixstrukturNormEin({ bezeichnung, art: 'normal' })).toBe(erwartet);
});
it('schließt Erwägungsgründe vor der Bezeichnungsprüfung aus', () => {
  expect(ordnePraefixstrukturNormEin({ bezeichnung: 'Artikel 1', art: 'erwaegungsgrund' })).toBe(
    'erwaegungsgrund',
  );
});

function gesetz(bezeichnungen: string[], zusatz: Partial<NormDarstellung> = {}): GesetzDarstellung {
  return gesetzMitNormen(bezeichnungen, { kurztitel: 'G', langtitel: '', norm: zusatz });
}
it.each([
  [['§ 1'], 'paragraph'],
  [['§§3 bis 6'], 'paragraph'],
  [['§§ 3 bis 6'], 'paragraph'],
  [[' Art.1 bis 3'], 'artikel'],
  [['Art1'], 'artikel'],
  [['Artikel 1'], 'artikel'],
  [['Artt 1 bis 3'], 'artikel'],
  [['Artikels 1'], 'artikel'],
  [['Artikeln 1'], 'artikel'],
  [['Artikelliste'], 'unklar'],
  [['Canon 1'], 'unklar'],
  [[], undefined],
  [
    [
      'Anlage',
      'Anhang',
      'Eingangsformel',
      'Schlussformel',
      'Inhaltsübersicht',
      'Präambel',
      'Vorspruch',
    ],
    'ohne-praefix',
  ],
  [[...Array<string>(9).fill('§ 1'), 'Artikel 1'], 'artikel-und-paragraphen'],
  [[...Array<string>(8).fill('§ 1'), 'Artikel 1'], 'artikel-und-paragraphen'],
  [[...Array<string>(9).fill('Art. 1'), '§ 1'], 'artikel-und-paragraphen'],
  [['§ 1', 'Anlage 1', ' anhang 2', 'INHALTSÜBERSICHT'], 'paragraph'],
  [['§ 1', 'Muster 1', 'Muster 2'], 'paragraph'],
  [['§ 1', 'Anlagen', 'Schlußformel', 'Inhaltsverzeichnis'], 'paragraph'],
  [['I.', 'II.', 'III.', 'Schlußformel'], 'roemisch'],
  [[...Array<string>(9).fill('IV.'), '§ 1'], 'roemisch'],
  [[...Array<string>(8).fill('IV.'), '§ 1'], 'unklar'],
  [['§ 1', 'I.'], 'unklar'],
] as const)('bestimmt %j als %s', (bezeichnungen, erwartet) => {
  expect(bestimmePraefixstruktur(gesetz([...bezeichnungen]))).toBe(erwartet);
});
it('zählt weggefallene Normen, aber keine Erwägungsgründe oder Überschriften', () => {
  expect(bestimmePraefixstruktur(gesetz(['Artikel 1'], { status: 'weggefallen' }))).toBe('artikel');
  const g = gesetz(['§ 1']);
  g.elemente.push(...gesetz(['E1'], { art: 'erwaegungsgrund' }).elemente);
  g.elemente.push({
    typ: 'ueberschrift',
    data: { id: 'u', xmlId: 'u', bezeichnung: 'Teil 1', ebene: 1, gliederungskennzahl: '001' },
  });
  expect(bestimmePraefixstruktur(g)).toBe('paragraph');
});
it('ist unabhängig von Reihenfolge und beliebig vielen ausgeschlossenen Elementen', () => {
  fc.assert(
    fc.property(
      fc.array(fc.constantFrom('§ 1', 'Artikel 2', 'Canon 3', 'IV.'), { minLength: 1 }),
      fc.nat({ max: 100 }),
      (namen, anzahl) => {
        const erwartet = bestimmePraefixstruktur(gesetz(namen));
        expect(bestimmePraefixstruktur(gesetz([...namen].reverse()))).toBe(erwartet);
        expect(
          bestimmePraefixstruktur(
            gesetz([
              ...namen,
              ...Array<string>(anzahl).fill('Anlage 1'),
              ...Array<string>(anzahl).fill('Inhaltsübersicht'),
            ]),
          ),
        ).toBe(erwartet);
        expect(bestimmePraefixstruktur({ ...gesetz(namen), hatGliederungsartikel: true })).toBe(
          'gliederungsartikel',
        );
      },
    ),
  );
});

it('erkennt unbezeichnete Textnormen neben Ausnahmen, aber keine unbekannten Bezeichnungen', () => {
  const g = gesetz(['', 'Schlussformel'], {
    absaetze: [{ id: 'a', saetze: [{ id: 's', text: 'Regelung.', eintraege: [] }] }],
  });
  expect(bestimmePraefixstruktur(g)).toBe('ohne-praefix');
  expect(bestimmePraefixstruktur(gesetz(['']))).toBe('unklar');
  expect(
    bestimmePraefixstruktur(
      gesetz(['', 'Unbekannt'], {
        absaetze: [{ id: 'a', saetze: [{ id: 's', text: 'Regelung.', eintraege: [] }] }],
      }),
    ),
  ).toBe('unklar');
});

it.each(['Anlage 1', 'Muster 2', 'Formblatt 1', 'Tabelle 3', 'Einziger Paragraph'])(
  'ordnet ausschließlich %s auch ohne Normtext ohne-praefix ein',
  (name) => {
    expect(bestimmePraefixstruktur(gesetz([name]))).toBe('ohne-praefix');
  },
);
it('unterscheidet vollständig leeren importierten Inhalt von unbezeichneten leeren Normen', () => {
  expect(ermittlePraefixstruktur(gesetz([]))).toEqual({ ermittlungsstatus: 'leer' });
  expect(ermittlePraefixstruktur(gesetz(['']))).toEqual({
    praefixstruktur: 'unklar',
    diagnosegrund: 'unbezeichnete-normen',
  });
});
it.each([
  ['Regel 1', 'regel'],
  ['Nr. 1', 'nummer'],
  ['Nr 1', 'nummer'],
  ['Regelung 1', 'sonstige'],
  ['Formblatt 1', 'ausgeschlossen'],
  ['Formblatt1', 'sonstige'],
  ['Tabellenwerk', 'sonstige'],
  ['Tabelle1', 'sonstige'],
  ['I. und IIII.', 'sonstige'],
  ['IC. und II.', 'sonstige'],
  ['I. oder II.', 'sonstige'],
  ['I. und II. und III.', 'sonstige'],
] as const)('ordnet die begrenzte neue Bezeichnung %s als %s ein', (bezeichnung, erwartet) => {
  expect(ordnePraefixstrukturNormEin({ bezeichnung, art: 'normal' })).toBe(erwartet);
});
it.each([
  ['Regel 1', 'regel'],
  ['Nr. 1', 'nummer'],
  ['I. und II.', 'roemisch'],
] as const)('bestimmt die Familie von %s', (name, familie) => {
  expect(bestimmePraefixstruktur(gesetz([name]))).toBe(familie);
});

it.each([
  [['1.', '7a.', '1. bis 6.'], 'arabisch'],
  [['A.', 'B.', 'C.'], 'alphabetisch'],
  [['A.', 'B.', 'C.', 'D.'], 'alphabetisch'],
  [['A.', 'B.'], 'alphabetisch'],
  [['C.'], 'roemisch'],
  [['D.'], 'roemisch'],
  [['I.', 'V.', 'X.'], 'roemisch'],
  [['A.', 'C.'], 'unklar'],
] as const)('ordnet die Familie im gesamten Modell %j als %s ein', (namen, familie) => {
  expect(bestimmePraefixstruktur(gesetz([...namen]))).toBe(familie);
  expect(bestimmePraefixstruktur(gesetz([...namen], { status: 'weggefallen' }))).toBe(familie);
});

it('ermittelt den alphabetischen Kontext mit linear vielen Bezeichnungszugriffen', () => {
  const g = gesetz([...Array<string>(1000).fill('C.'), 'A.', 'B.']);
  let zugriffe = 0;
  for (const element of g.elemente) {
    if (element.typ !== 'norm') continue;
    const bezeichnung = element.data.bezeichnung;
    Object.defineProperty(element.data, 'bezeichnung', {
      get() {
        zugriffe++;
        return bezeichnung;
      },
    });
  }
  expect(bestimmePraefixstruktur(g)).toBe('alphabetisch');
  expect(zugriffe).toBeLessThanOrEqual(10 * g.elemente.length);
});
