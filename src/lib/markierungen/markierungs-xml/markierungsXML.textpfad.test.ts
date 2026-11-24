import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// Prüft die gültigen Pfadfälle und die Ablehnung widersprüchlicher XML-Adressen.
import { expect, it } from 'vitest';
import fc from 'fast-check';
import { normtextPfad, bereichPfad } from '@/test/gesetz/textpfadFabrik';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { baueXML, parseEintraege } from './markierungs-xml.index';

it.each([
  '<bereich>amtlicher-titel</bereich><absatz>1</absatz><zeichenbereich start="0" ende="1"/>',
  '<bereich>bezeichnung</bereich><nummer>1</nummer><zeichenbereich start="0" ende="1"/>',
  '<satz>1</satz><satz>2</satz><zeichenbereich start="0" ende="1"/>',
  '<zeichenbereich start="2" ende="1"/>',
  '<zeichenbereich start="-1" ende="1"/>',
])('meldet unzulässige Textposition: %s', (pfad) => {
  const gelesen = parseEintraege(
    `<markierungen><infos><gesetz normgeber="de-bund">G</gesetz></infos><inhalt><unterstreichung><bezeichnung>§ 1</bezeichnung><textstelle>${pfad}</textstelle><bezugstext>x</bezugstext></unterstreichung></inhalt></markierungen>`,
  );
  expect(gelesen.eintraege).toEqual([]);
  expect(gelesen.befunde).toHaveLength(1);
});

it('erhält sämtliche gültigen Pfadfälle im XML-Rundlauf', () => {
  const optional = <T>(wert: fc.Arbitrary<T>) => fc.option(wert, { nil: undefined });
  const text = fc.constantFrom('(1)', '(2a)', 'A & B');
  const basis = fc.record({
    absatz: optional(text),
    absatzWiederholung: optional(fc.integer({ min: 1, max: 20 })),
    unterabsatz: optional(fc.constantFrom('[2]', '3a', 'zweiter Unterabsatz')),
    satz: optional(fc.nat({ max: 20 })),
  });
  const schritt = fc.record({
    ebene: fc.constantFrom('nummer' as const, 'litera' as const),
    bezeichnung: fc.constantFrom('1.', 'a)', 'aa)', '-'),
    wiederholung: optional(fc.integer({ min: 1, max: 20 })),
  });
  const saetze = basis.map(normtextPfad);
  const listen = fc
    .tuple(basis, fc.array(schritt, { minLength: 1, maxLength: 15 }), optional(fc.nat({ max: 20 })))
    .map(([werte, eintraege, satzInEintrag]) =>
      normtextPfad({ ...werte, eintraege, satzInEintrag }),
    );
  const bereiche = fc
    .constantFrom('bezeichnung' as const, 'amtlicherTitel' as const, 'nichtamtlicherTitel' as const)
    .map(bereichPfad);
  for (const fall of [bereiche, saetze, listen]) {
    fc.assert(
      fc.property(fall, (pfad) => {
        const xml = baueXML(gesetzesreferenz(), [
          markierungsEintrag({
            typ: 'unterstreichung',
            ausgangsstelle: normAusgangsstelle('§ 1'),
            bezug: {
              typ: 'bezugstext' as const,
              textstelle: { pfad, zeichenbereichStart: 0, zeichenbereichEnde: 1 },
              bezugstext: 'x',
            },
          }),
        ]);
        const gelesen = parseEintraege(xml);
        expect(gelesen.befunde).toEqual([]);
        expect(gelesen.eintraege[0]?.bezug.textstelle?.pfad).toEqual(pfad);
      }),
      { numRuns: 150 },
    );
  }
});

it.each([
  ['<satz>1</satz><absatz>1</absatz>', { absatz: '1', satz: 1 }],
  [
    '<nummer>2</nummer><absatz>1</absatz><satz>3</satz><unterabsatz>zwei</unterabsatz>',
    {
      absatz: '1',
      unterabsatz: 'zwei',
      eintraege: [{ ebene: 'nummer', bezeichnung: '2' }],
      satzInEintrag: 3,
    },
  ],
  [
    '<absatz wiederholung=" 1 ">1</absatz><satz>2</satz>',
    { absatz: '1', absatzWiederholung: 1, satz: 2 },
  ],
  ['<absatz wiederholung=" +2 ">1</absatz>', { absatz: '1', absatzWiederholung: 2 }],
  ['<absatz wiederholung=" -0 ">1</absatz>', { absatz: '1' }],
])('erhält schemaerlaubte Anordnung und Zahlen-Leerraum: %s', (pfad, erwartet) => {
  const gelesen = parseEintraege(
    `<markierungen><infos><gesetz normgeber="de-bund">G</gesetz></infos><inhalt><unterstreichung><bezeichnung>§ 1</bezeichnung><textstelle>${pfad}<zeichenbereich start="0" ende="1"/></textstelle><bezugstext>x</bezugstext></unterstreichung></inhalt></markierungen>`,
  );
  expect(gelesen.befunde).toEqual([]);
  expect(gelesen.eintraege[0]?.bezug.textstelle?.pfad).toEqual({ typ: 'normtext', ...erwartet });
});

it.each([
  ['amtlicherTitel', 'amtlicher-titel'],
  ['nichtamtlicherTitel', 'nichtamtlicher-titel'],
] as const)('schreibt und liest den Titelbereich %s mit Bindestrich', (intern, xmlWert) => {
  const eintrag = markierungsEintrag({
    typ: 'unterstreichung',
    bezug: {
      typ: 'bezugstext',
      textstelle: { pfad: bereichPfad(intern), zeichenbereichStart: 0, zeichenbereichEnde: 1 },
      bezugstext: 'x',
    },
  });
  const xml = baueXML(gesetzesreferenz(), [eintrag]);
  expect(xml).toContain(`<bereich>${xmlWert}</bereich>`);
  expect(parseEintraege(xml).eintraege[0]?.bezug.textstelle?.pfad).toEqual(bereichPfad(intern));
  const alt = parseEintraege(xml.replace(xmlWert, intern));
  expect(alt.eintraege).toEqual([]);
  expect(alt.befunde).toHaveLength(1);
});
