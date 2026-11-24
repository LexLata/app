import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
// Vollständige Ausgangskennungen über echte XML-Schreib- und Lesewege.
import { expect, it } from 'vitest';
import fc from 'fast-check';
import { gesetzDarstellung, normDarstellung } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
import { ausgangsnormKennung } from '@/lib/domain/norm/norm.index';
import { loeseAusgangsstelleAuf } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { baueXML, parseEintraege } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import type { Ausgangsstelle } from '@/lib/domain/ausgangsstelle';

function rundlauf(bezeichnung: string, artikel?: string) {
  const norm = normDarstellung({ bezeichnung, xmlId: 'ziel' });
  const gesetz = gesetzDarstellung({
    elemente: [
      ...(artikel
        ? [
            {
              typ: 'norm' as const,
              data: normDarstellung({
                bezeichnung: artikel,
                xmlId: 'artikel',
                art: 'gliederungsartikel',
                gliederungsEbene: 1,
                ueberschriftartig: false,
              }),
            },
          ]
        : []),
      { typ: 'norm', data: norm },
    ],
  });
  const kennung = ausgangsnormKennung(gesetz, { typ: 'norm', data: norm });
  expect(kennung).not.toBeNull();
  if (!kennung) throw new Error('Kennung fehlt');
  const [geladen] = parseEintraege(
    baueXML(gesetz, [markierungsEintrag({ ausgangsstelle: kennung })]),
  ).eintraege;
  expect(geladen?.ausgangsstelle).toEqual(kennung);
  if (!geladen) throw new Error('XML-Rundlauf fehlt');
  expect(loeseAusgangsstelleAuf(gesetz, geladen.ausgangsstelle)).toEqual({
    element: norm,
    anzahlTreffer: 1,
  });
  return kennung;
}
it.each([
  ['Präambel', undefined],
  ['§ 1.2', undefined],
  ['Art. I', undefined],
  ['Anhang 1 zu Anlage 4', undefined],
  ['§ 1', 'Art. I'],
  ['E1', 'Art. I'],
  ['§ E1', 'Art. I'],
])('erhält %s mit Kontext %s', (bezeichnung, artikel) => {
  rundlauf(bezeichnung, artikel);
});
it('erhält vollständige mehrteilige Präfixtexte und römischen Kontext', () => {
  expect(rundlauf('Anhang 1 zu Anlage 4')).toEqual({
    typ: 'norm',
    bezeichnung: 'Anhang 1 zu Anlage 4',
  });
  expect(rundlauf('§ 1', 'Art. I')).toEqual({ typ: 'norm', bezeichnung: 'Art. I § 1' });
});
it('erhält erzeugte freie Kennungen und Punktnummern ohne neue Zitatgrammatik', () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 999 }), fc.integer({ min: 1, max: 99 }), (a, b) => {
      rundlauf(`§ ${a}.${b}`);
      rundlauf(`Anhang ${a} zu Anlage ${b}`);
    }),
    { numRuns: 40 },
  );
});
it.each(['Art.', 'Artikel', 'Art'])('erhält numerische Artikelpräfixe %s', (praefix) => {
  const norm = normDarstellung({ bezeichnung: 'Artikel 31' });
  const gesetz = gesetzDarstellung({ elemente: [{ typ: 'norm', data: norm }] });
  expect(
    loeseAusgangsstelleAuf(gesetz, normAusgangsstelle([praefix, '31'].filter(Boolean).join(' ')))
      .element,
  ).toBe(norm);
});
it('unterscheidet leeres Präfix, falsches Präfix und mehrdeutige gleichwertige Schreibweisen', () => {
  const normen = ['1', '§ 1', 'Art. 1', 'Artikel 1'].map((bezeichnung, index) =>
    normDarstellung({ bezeichnung, xmlId: `n${index}` }),
  );
  const gesetz = gesetzDarstellung({ elemente: normen.map((data) => ({ typ: 'norm', data })) });
  const stelle = (praefix: string): Ausgangsstelle =>
    normAusgangsstelle([praefix, '1'].filter(Boolean).join(' '));
  expect(loeseAusgangsstelleAuf(gesetz, stelle('')).element).toBe(normen[0]);
  expect(loeseAusgangsstelleAuf(gesetz, stelle('§')).element).toBe(normen[1]);
  expect(loeseAusgangsstelleAuf(gesetz, stelle('Art.'))).toEqual({
    element: undefined,
    anzahlTreffer: 2,
  });
  gesetz.elemente.reverse();
  expect(loeseAusgangsstelleAuf(gesetz, stelle('Art.'))).toEqual({
    element: undefined,
    anzahlTreffer: 2,
  });
  expect(loeseAusgangsstelleAuf(gesetz, stelle('Anlage')).anzahlTreffer).toBe(0);
});
it('erhält explizite Sammelzahlen und lehnt konkurrierende konkrete Kennungen ab', () => {
  const sammel = normDarstellung({ bezeichnung: '§§ 3 bis 6', status: 'weggefallen' });
  const gesetz = gesetzDarstellung({ elemente: [{ typ: 'norm', data: sammel }] });
  for (const bezeichnung of ['3', '4', '5', '6']) {
    expect(
      loeseAusgangsstelleAuf(
        gesetz,
        normAusgangsstelle(['§', bezeichnung].filter(Boolean).join(' ')),
      ).element,
    ).toBe(sammel);
  }

  expect(loeseAusgangsstelleAuf(gesetz, { typ: 'norm', bezeichnung: '§§ 3 bis 6' }).element).toBe(
    sammel,
  );
  gesetz.elemente.push({ typ: 'norm', data: normDarstellung({ bezeichnung: '§ 6' }) });
  for (const elemente of [gesetz.elemente, [...gesetz.elemente].reverse()]) {
    expect(
      loeseAusgangsstelleAuf({ ...gesetz, elemente }, { typ: 'norm', bezeichnung: '§ 6' }),
    ).toEqual({ element: undefined, anzahlTreffer: 2 });
  }
});
it('vermischt Normen, Erwägungsgründe und Überschriften nicht', () => {
  const erwaegung = normDarstellung({ art: 'erwaegungsgrund', bezeichnung: 'E25', xmlId: 'e25' });
  const norm = normDarstellung({ bezeichnung: '§ 25' });
  const gesetz = gesetzDarstellung({
    elemente: [
      { typ: 'norm', data: erwaegung },
      { typ: 'norm', data: norm },
      {
        typ: 'ueberschrift',
        data: { id: 'u', xmlId: 'u', bezeichnung: 'Teil', gliederungskennzahl: '025', ebene: 1 },
      },
    ],
  });
  const stellen: Ausgangsstelle[] = [
    { typ: 'erwaegungsgrund', bezeichnung: 'E25' },
    { typ: 'norm', bezeichnung: '§ 25' },
    { typ: 'ueberschrift', gliederungskennzahl: '025' },
  ];
  const gelesen = parseEintraege(
    baueXML(
      gesetz,
      stellen.map((ausgangsstelle) => markierungsEintrag({ ausgangsstelle })),
    ),
  ).eintraege;
  expect(gelesen.map((e) => loeseAusgangsstelleAuf(gesetz, e.ausgangsstelle).element)).toEqual([
    gesetz.elemente[2]?.data,
    norm,
    erwaegung,
  ]);
});
it('lehnt fehlenden Kontext und doppelte vollständige Kennungen ab', () => {
  const norm = normDarstellung({ bezeichnung: '§ 1' });
  const artikel = normDarstellung({
    bezeichnung: 'Art. I',
    art: 'gliederungsartikel',
    gliederungsEbene: 1,
    ueberschriftartig: false,
  });
  const gesetz = gesetzDarstellung({
    elemente: [
      { typ: 'norm', data: artikel },
      { typ: 'norm', data: norm },
    ],
  });
  expect(loeseAusgangsstelleAuf(gesetz, { typ: 'norm', bezeichnung: '§ 1' }).anzahlTreffer).toBe(0);
  const kennung = ausgangsnormKennung(gesetz, { typ: 'norm', data: norm });
  if (!kennung) throw new Error('Kennung fehlt');
  gesetz.elemente.push({ typ: 'norm', data: { ...norm } });
  expect(loeseAusgangsstelleAuf(gesetz, kennung)).toEqual({ element: undefined, anzahlTreffer: 2 });
});
it('erhält die bestehende kanonische Schreibweise vollständiger numerischer Sammelbezeichnungen', () => {
  const sammel = normDarstellung({ bezeichnung: 'Artikel 3 bis 6', status: 'weggefallen' });
  const gesetz = gesetzDarstellung({ elemente: [{ typ: 'norm', data: sammel }] });
  expect(loeseAusgangsstelleAuf(gesetz, { typ: 'norm', bezeichnung: 'Art. 3 bis 6' }).element).toBe(
    sammel,
  );
});

it('prüft sehr große Sammelbereiche ohne Aufzählung und bewahrt den Artikelkontext', () => {
  const artikel = normDarstellung({
    bezeichnung: 'Art. 2',
    xmlId: 'artikel',
    art: 'gliederungsartikel',
    gliederungsEbene: 1,
    ueberschriftartig: false,
  });
  const sammel = normDarstellung({
    bezeichnung: '§§ 1 bis 9007199254740993',
    xmlId: 'sammel',
    status: 'weggefallen',
  });
  const gesetz = gesetzDarstellung({
    elemente: [
      { typ: 'norm', data: artikel },
      { typ: 'norm', data: sammel },
    ],
  });
  for (const bezeichnung of ['Artikel 2 § 4', 'Art. 2 § 9007199254740993']) {
    expect(loeseAusgangsstelleAuf(gesetz, normAusgangsstelle(bezeichnung))).toEqual({
      element: sammel,
      anzahlTreffer: 1,
    });
  }
  for (const bezeichnung of [
    'Art. 2 § 9007199254740994',
    'Art. 2 § 0',
    'Art. 3 § 4',
    'Art. 2 Anlage 4',
    '§ 4',
  ]) {
    expect(loeseAusgangsstelleAuf(gesetz, normAusgangsstelle(bezeichnung))).toEqual({
      element: undefined,
      anzahlTreffer: 0,
    });
  }
});
