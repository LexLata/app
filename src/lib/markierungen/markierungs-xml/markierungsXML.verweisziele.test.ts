// markierungsXML.verweisziele.test.ts
// Prüft die Eingangskontrolle und leere Verweise im neuen Verweiszielformat.

import { describe, expect, it } from 'vitest';
import { baueXML, parseEintraege } from './markierungs-xml.index';

const dokument = (ziele: string) =>
  `<markierungen version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><verweismarkierung><elementstand><textlaenge>0</textlaenge></elementstand><bezeichnung>§ 1</bezeichnung><verweisinhalt><verweistext>Abs. 3 und GG</verweistext>${ziele}</verweisinhalt></verweismarkierung></inhalt></markierungen>`;

describe('Verweisziele', () => {
  it('lädt und speichert einen Verweis ohne Ziele', () => {
    const gelesen = parseEintraege(dokument(''));
    expect(gelesen.befunde).toEqual([]);
    expect(gelesen.eintraege[0]?.verweisinhalt).toEqual({
      verweistext: 'Abs. 3 und GG',
      verweisziele: [],
    });
    expect(
      parseEintraege(baueXML({ kurztitel: 'BGB', normgeber: 'de-bund' }, gelesen.eintraege))
        .eintraege,
    ).toEqual(gelesen.eintraege);
  });
  it.each([
    '<zielnorm><bezeichnung>§ 3</bezeichnung><verweistextZeichenbereich start="0" ende="6"/></zielnorm>',
    '<verweisziel><verweistextZeichenbereich start="0" ende="6"/></verweisziel>',
    '<verweisziel><bezeichnung>§ 3</bezeichnung></verweisziel>',
    '<verweisziel><bezeichnung>§ 3</bezeichnung><verweistextZeichenbereich start="0" ende="6"/></verweisziel><verweisziel><gesetz normgeber="de-bund">GG</gesetz><verweistextZeichenbereich start="5" ende="12"/></verweisziel>',
    '<verweisziel><bezeichnung>§ 3</bezeichnung><verweistextZeichenbereich start="0" ende="99"/></verweisziel>',
  ])('meldet einen unzulässigen Verweisinhalt: %s', (ziele) => {
    const gelesen = parseEintraege(dokument(ziele));
    expect(gelesen.eintraege).toEqual([]);
    expect(gelesen.befunde).toHaveLength(1);
  });
});

it('schließt widersprüchliche Verweiszielfälle bereits im Typ aus', () => {
  // @ts-expect-error Ein Verweis auf ein ganzes Gesetz benötigt die Gesetzesreferenz.
  const ohneGesetz: import('@/lib/markierungen/gemeinsam/gemeinsam.index').Verweisziel = {
    typ: 'ganzesGesetz',
    verweistextZeichenbereich: [0, 2],
  };
  // @ts-expect-error Eine Zielnorm mit Elementstand benötigt den gespeicherten Vergleichsmaßstab.
  const ohneStand: import('@/lib/markierungen/gemeinsam/gemeinsam.index').Verweisziel = {
    typ: 'zielnorm',
    bezeichnung: '§ 1',
    verweistextZeichenbereich: [0, 2],
  };
  // @ts-expect-error Ein ganzes Gesetz hat keine konkrete Normbezeichnung.
  const mitBezeichnung: import('@/lib/markierungen/gemeinsam/gemeinsam.index').Verweisziel = {
    typ: 'ganzesGesetz',
    gesetz: { kurztitel: 'GG', normgeber: 'de-bund' },
    bezeichnung: '1',
    verweistextZeichenbereich: [0, 2],
  };
  expect([ohneGesetz.typ, ohneStand.typ, mitBezeichnung.typ]).toHaveLength(3);
});

it.each([
  '<bezeichnung>§ 2</bezeichnung><bezeichnung>§ 3</bezeichnung><verweistextZeichenbereich start="0" ende="3"/>',
  '<bezeichnung></bezeichnung><verweistextZeichenbereich start="0" ende="3"/>',
  '<bezeichnung>§ 2</bezeichnung><verweistextZeichenbereich start="0" ende="3"/><verweistextZeichenbereich start="0" ende="99"/>',
  '<gesetz normgeber="de-bund">GG</gesetz><gesetz normgeber="de-bund">BGB</gesetz><verweistextZeichenbereich start="0" ende="3"/>',
  '<gesetz normgeber="de-bund"> </gesetz><verweistextZeichenbereich start="0" ende="3"/>',
])('meldet defekte Pflichtangaben statt erste Werte still zu übernehmen: %s', (inhalt) => {
  const gelesen = parseEintraege(dokument(`<verweisziel>${inhalt}</verweisziel>`));
  expect(gelesen.eintraege).toEqual([]);
  expect(gelesen.befunde).toMatchObject([{ fall: 'verweiszielUngueltig' }]);
});

it.each(['§ 433', 'Art. 229 § 3'])(
  'erhält die volle Zielbezeichnung %s mit und ohne Elementstand',
  (bezeichnung) => {
    for (const stand of ['', '<elementstand><textlaenge>12</textlaenge></elementstand>']) {
      const gelesen = parseEintraege(
        dokument(
          `<verweisziel><bezeichnung>${bezeichnung}</bezeichnung><verweistextZeichenbereich start="0" ende="3"/>${stand}</verweisziel>`,
        ),
      );
      expect(gelesen.befunde).toEqual([]);
      expect(gelesen.eintraege[0]?.verweisinhalt?.verweisziele[0]).toEqual({
        typ: stand ? 'zielnorm' : 'zielnormOhneElementstand',
        bezeichnung,
        gesetz: undefined,
        verweistextZeichenbereich: [0, 3],
        ...(stand ? { elementstand: { textlaenge: 12 } } : {}),
      });
      const xml = baueXML({ kurztitel: 'BGB', normgeber: 'de-bund' }, gelesen.eintraege);
      expect(xml).toContain(`<bezeichnung>${bezeichnung}</bezeichnung>`);
      expect(xml).not.toContain('praefix=');
      expect(parseEintraege(xml).eintraege).toEqual(gelesen.eintraege);
    }
  },
);
it('erhält das ganze Zielgesetz ohne Normbezeichnung', () => {
  const gelesen = parseEintraege(
    dokument(
      '<verweisziel><gesetz normgeber="de-bund">GG</gesetz><verweistextZeichenbereich start="0" ende="3"/></verweisziel>',
    ),
  );
  expect(gelesen.befunde).toEqual([]);
  expect(gelesen.eintraege[0]?.verweisinhalt?.verweisziele[0]).toEqual({
    typ: 'ganzesGesetz',
    gesetz: { kurztitel: 'GG', normgeber: 'de-bund' },
    verweistextZeichenbereich: [0, 3],
  });
  const xml = baueXML({ kurztitel: 'BGB', normgeber: 'de-bund' }, gelesen.eintraege);
  expect(xml).not.toContain('praefix=');
  expect(parseEintraege(xml).eintraege).toEqual(gelesen.eintraege);
});
