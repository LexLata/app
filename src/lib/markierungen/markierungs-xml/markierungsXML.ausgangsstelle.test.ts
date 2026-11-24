import {
  gliederungsartikel,
  normaleNorm,
  gesetzDarstellung,
  gesetzesreferenz,
} from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// Prüft die drei Ausgangsstellen, volle Bezeichnungen und verlustfreie Auflösung im Rundlauf.
import { expect, it } from 'vitest';
import fc from 'fast-check';
import { ausgangsnormKennung } from '@/lib/domain/norm/norm.index';
import type { Ausgangsstelle } from '@/lib/domain/ausgangsstelle';
import {
  pruefeEigenenKonflikt,
  loeseAusgangsstelleAuf,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { baueXML, parseEintraege } from './markierungs-xml.index';

const datei = (stelle: string, rest = '<kommentartext>Notiz</kommentartext>') =>
  `<markierungen><infos><gesetz normgeber="de-bund">TestG</gesetz></infos><inhalt><kommentar>${stelle}<elementstand><textlaenge>0</textlaenge></elementstand>${rest}</kommentar></inhalt></markierungen>`;
it.each([
  '<bezeichnung></bezeichnung>',
  '<bezeichnung praefix="Art.|§">433</bezeichnung>',
  '<bezeichnung praefix="">E25</bezeichnung>',
  '<gliederungskennzahl praefix="">010</gliederungskennzahl>',
  '<gliederungskennzahl>010 020</gliederungskennzahl>',
  '<gliederungskennzahl>010\n</gliederungskennzahl>',
  '<gliederungskennzahl>010\r</gliederungskennzahl>',
  '<gliederungskennzahl>010\r\n</gliederungskennzahl>',
])('meldet ungültige Ausgangsstelle %s', (stelle) => {
  expect(parseEintraege(datei(stelle))).toMatchObject({
    eintraege: [],
    befunde: [{ fall: 'ausgangsstelleUngueltig' }],
  });
});
it.each([
  ['<bezeichnung>E25</bezeichnung>', { typ: 'erwaegungsgrund', bezeichnung: 'E25' }],
  ['<bezeichnung>5</bezeichnung>', { typ: 'norm', bezeichnung: '5' }],
  [
    '<gliederungskennzahl>010020</gliederungskennzahl>',
    { typ: 'ueberschrift', gliederungskennzahl: '010020' },
  ],
])('liest den eindeutigen Fall %s', (stelle, ausgangsstelle) => {
  expect(parseEintraege(datei(stelle))).toMatchObject({
    eintraege: [{ ausgangsstelle }],
    befunde: [],
  });
});
it('meldet Zielnorm mit unerlaubtem Präfixattribut', () => {
  const xml = datei('<bezeichnung>§ 1</bezeichnung>')
    .replace(
      '<kommentartext>Notiz</kommentartext>',
      '<verweisinhalt><verweistext>2</verweistext><verweisziel><bezeichnung praefix="§">2</bezeichnung><verweistextZeichenbereich start="0" ende="1"/><elementstand><textlaenge>0</textlaenge></elementstand></verweisziel></verweisinhalt>',
    )
    .replaceAll('kommentar', 'verweismarkierung');
  expect(parseEintraege(xml)).toMatchObject({
    eintraege: [],
    befunde: [{ fall: 'verweiszielUngueltig' }],
  });
});
it('erhält alle Fälle und mehrteilige volle Bezeichnungen beim Schreiben und Lesen', () => {
  const stellen: Ausgangsstelle[] = [
    { typ: 'norm', bezeichnung: '5' },
    { typ: 'norm', bezeichnung: 'Art. 229 5' },
    { typ: 'erwaegungsgrund', bezeichnung: 'E25' },
    { typ: 'ueberschrift', gliederungskennzahl: '010020' },
  ];
  const eintraege = stellen.map((ausgangsstelle) =>
    markierungsEintrag({
      typ: 'kommentar' as const,
      ausgangsstelle,
      bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 0 } },
      kommentarText: 'Notiz',
    }),
  );
  const xml = baueXML(gesetzesreferenz(), eintraege);
  expect(xml).not.toContain('praefix=');
  expect(xml).toContain('<bezeichnung>Art. 229 5</bezeichnung>');
  expect(parseEintraege(xml)).toMatchObject({
    eintraege: [eintraege[3], eintraege[0], eintraege[1], eintraege[2]],
    befunde: [],
  });
});
it('erzeugt, schreibt, liest und löst normale Normen mit und ohne Präfix eindeutig auf', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 99999 }),
      fc.constantFrom('', '§', 'Art.'),
      (zahl, praefix) => {
        const g = gesetzDarstellung({
          elemente: [
            {
              typ: 'norm',
              data: normaleNorm({
                id: 'n',
                xmlId: 'n',
                bezeichnung: [praefix, zahl].filter(Boolean).join(' '),
                absaetze: [],
              }),
            },
          ],
        });
        const ausgangsstelle = ausgangsnormKennung(
          g,
          g.elemente[0] ??
            (() => {
              throw new Error('Element fehlt');
            })(),
        );
        expect(ausgangsstelle?.typ).toBe('norm');
        if (!ausgangsstelle) throw new Error('Kennung fehlt');
        const xml = baueXML(gesetzesreferenz(), [
          markierungsEintrag({
            typ: 'kommentar',
            ausgangsstelle,
            bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 0 } },
            kommentarText: 'Notiz',
          }),
        ]);
        const gelesen = parseEintraege(xml);
        expect(gelesen.befunde).toEqual([]);
        expect(gelesen.eintraege[0]?.ausgangsstelle).toEqual(ausgangsstelle);
        expect(
          loeseAusgangsstelleAuf(
            g,
            gelesen.eintraege[0]?.ausgangsstelle ??
              (() => {
                throw new Error('Ausgangsstelle fehlt');
              })(),
          ).anzahlTreffer,
        ).toBe(1);
      },
    ),
  );
});
it('erhält Artikelkontext und präfixlose eigene Bezeichnungen im vollständigen Rundlauf', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 9999 }),
      fc.integer({ min: 1, max: 9999 }),
      fc.constantFrom('', '§'),
      (artikel, zahl, praefix) => {
        const kind = {
          typ: 'norm' as const,
          data: normaleNorm({
            id: 'kind',
            xmlId: 'kind',
            bezeichnung: [praefix, zahl].filter(Boolean).join(' '),
            absaetze: [],
          }),
        };
        const g = gesetzDarstellung({
          hatGliederungsartikel: true,
          elemente: [
            {
              typ: 'norm',
              data: gliederungsartikel({
                art: 'gliederungsartikel',
                ueberschriftartig: false,
                id: 'artikel',
                xmlId: 'artikel',
                bezeichnung: `Art. ${artikel}`,
                gliederungsEbene: 0,
                absaetze: [],
              }),
            },
            kind,
          ],
        });
        const ausgangsstelle = ausgangsnormKennung(g, kind);
        if (!ausgangsstelle) throw new Error('Ausgangsstelle fehlt');
        expect(ausgangsstelle).toEqual({
          typ: 'norm',
          bezeichnung: `Art. ${artikel} ${[praefix, zahl].filter(Boolean).join(' ')}`,
        });
        const xml = baueXML(gesetzesreferenz(), [
          markierungsEintrag({
            typ: 'kommentar',
            ausgangsstelle,
            bezug: { typ: 'pauschal' as const, elementstand: { textlaenge: 0 } },
            kommentarText: 'Notiz',
          }),
        ]);
        const gelesen = parseEintraege(xml);
        expect(gelesen.befunde).toEqual([]);
        const stelle = gelesen.eintraege[0]?.ausgangsstelle;
        if (!stelle) throw new Error('Gelesene Ausgangsstelle fehlt');
        expect(stelle).toEqual(ausgangsstelle);
        expect(loeseAusgangsstelleAuf(g, stelle).element?.xmlId).toBe('kind');
      },
    ),
  );
});

it.each(['unterstreichung', 'hervorhebung', 'kommentar', 'verweismarkierung'] as const)(
  'schreibt die volle Ausgangsbezeichnung ohne Präfixattribut für %s',
  (typ) => {
    for (const bezeichnung of ['§ 433', 'Art. 229 § 3', 'E25']) {
      const ausgangsstelle: Ausgangsstelle =
        bezeichnung === 'E25'
          ? { typ: 'erwaegungsgrund', bezeichnung }
          : { typ: 'norm', bezeichnung };
      const xml = baueXML(gesetzesreferenz(), [markierungsEintrag({ typ, ausgangsstelle })]);
      expect(xml).toContain(`<bezeichnung>${bezeichnung}</bezeichnung>`);
      expect(xml).not.toContain('praefix=');
      expect(parseEintraege(xml).eintraege[0]?.ausgangsstelle).toEqual(ausgangsstelle);
    }
  },
);

it('führt eine alte bloße Ausgangszahl als Konflikt statt sie einem Paragraphen zuzuordnen', () => {
  const gesetz = gesetzDarstellung({
    elemente: [{ typ: 'norm', data: normaleNorm({ bezeichnung: '§ 433' }) }],
  });
  const gelesen = parseEintraege(datei('<bezeichnung>433</bezeichnung>')).eintraege[0];
  if (!gelesen) throw new Error('Lesbarer alter Eintrag fehlt');
  expect(pruefeEigenenKonflikt(gelesen, gesetz)).toBe('pauschalerBezugFehlt');
});
