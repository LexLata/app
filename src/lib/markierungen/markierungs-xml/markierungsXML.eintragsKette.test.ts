// Roundtrip der GesetzesXML-Textpfade über die interne MarkierungsXML-Serialisierung.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { pruefeEigenenKonflikt } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { expect, it } from 'vitest';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import type { Textpfad } from '@/lib/domain/textpfad/textpfad.index';
import { pfadGleich, textAnTextpfad } from '@/lib/domain/textpfad/textpfad.index';
import type { NormDarstellung } from '@/lib/domain/gesetzTypes';
import type { MarkierungsEintrag } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import { bauTextstelleZeilen, TAG_VON_TYP } from './markierungsXML';
import { baueXML, parseEintraege } from './markierungs-xml.index';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

const xml = `<?xml version="1.0"?>
<gesetz id="test">
  <infos><normgeber>de-bund</normgeber><langtitel>Testgesetz</langtitel><kurztitel>TestG</kurztitel></infos>
  <inhalt>
    <norm id="n1">
      <bezeichnung>§ 1</bezeichnung>
      <text>
        <absatz zahl="(1)">
          <nummer zahl="1.">
            <litera buchstabe="a)">
              Text a
              <litera buchstabe="aa)">Text aa unter 1a</litera>
              <litera buchstabe="bb)">Text bb unter 1a</litera>
            </litera>
            <litera buchstabe="b)">Text b unter 1</litera>
          </nummer>
          <nummer zahl="2.">
            <litera buchstabe="a)">
              Text a
              <litera buchstabe="aa)">Text aa unter 2a</litera>
            </litera>
          </nummer>
        </absatz>
      </text>
    </norm>
  </inhalt>
</gesetz>`;

const pfadAaUnter1a: Textpfad = normtextPfad({
  absatz: '(1)',
  eintraege: [
    { ebene: 'nummer', bezeichnung: '1.' },
    { ebene: 'litera', bezeichnung: 'a)' },
    { ebene: 'litera', bezeichnung: 'aa)' },
  ],
});
const pfadAaUnter2a: Textpfad = normtextPfad({
  absatz: '(1)',
  eintraege: [
    { ebene: 'nummer', bezeichnung: '2.' },
    { ebene: 'litera', bezeichnung: 'a)' },
    { ebene: 'litera', bezeichnung: 'aa)' },
  ],
});

it('Persistenz-Roundtrip: bauTextstelleZeilen → XML-Block → parseEintraege', () => {
  const gesetz = parseGesetzesXML(xml);
  expect(gesetz).not.toBeNull();
  const norm = gesetz!.elemente[0]!.data as NormDarstellung;
  expect(
    textAnTextpfad(norm, { pfad: pfadAaUnter1a, zeichenbereichStart: 0, zeichenbereichEnde: 100 }),
  ).toBe('Text aa unter 1a');
  expect(
    textAnTextpfad(norm, { pfad: pfadAaUnter2a, zeichenbereichStart: 0, zeichenbereichEnde: 100 }),
  ).toBe('Text aa unter 2a');
  const eintragFuerXml: MarkierungsEintrag = markierungsEintrag({
    typ: 'unterstreichung',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    bezug: {
      typ: 'bezugstext' as const,
      textstelle: { pfad: { ...pfadAaUnter1a }, zeichenbereichStart: 0, zeichenbereichEnde: 5 },
      bezugstext: '',
    },
  });
  const zeilen = bauTextstelleZeilen(eintragFuerXml.bezug.textstelle);
  const tags = [...zeilen.matchAll(/<(nummer|litera)>/g)].map((m) => m[1]);
  expect(tags, 'alle drei Kettenschritte in Reihenfolge').toEqual(['nummer', 'litera', 'litera']);

  const xmlBlock = `<markierungen><infos><gesetz normgeber="de-bund">TestG</gesetz></infos><inhalt><${TAG_VON_TYP.unterstreichung}>
  <bezeichnung>§ 1</bezeichnung>
<textstelle>${zeilen}</textstelle>
  <bezugstext>aa</bezugstext>
</${TAG_VON_TYP.unterstreichung}></inhalt></markierungen>`;
  const zurueckgelesen = parseEintraege(xmlBlock).eintraege;
  expect(zurueckgelesen.length, 'genau ein Eintrag zurückgelesen').toBe(1);
  expect(
    pfadGleich(pfadAaUnter1a, zurueckgelesen[0]!.bezug.textstelle!.pfad),
    'Pfad nach Serialisierung+Parsen identisch zum Original',
  ).toBe(true);
});

it('erhält den äußeren Satz im Parser–MarkierungsXML–Konfliktprüfungs-Rundlauf', () => {
  const xml =
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>TestG</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz><satz zahl="1">Liste:<nummer zahl="1"><satz zahl="1">A.</satz><satz zahl="2">Siehe <verweis norm="2">B</verweis>.</satz></nummer></satz></absatz></text></norm></inhalt></gesetz>';
  const g = parseGesetzesXML(xml)!;
  const n = g.elemente[0]!.data as NormDarstellung;
  const markierung: MarkierungsEintrag = markierungsEintrag({
    bezug: {
      typ: 'bezugstext' as const,
      textstelle: {
        pfad: normtextPfad({
          absatz: n.getaggteVerweise![0]!.textstelle.pfad.absatz,
          unterabsatz: n.getaggteVerweise![0]!.textstelle.pfad.unterabsatz,
          satz: n.getaggteVerweise![0]!.textstelle.pfad.satz,
          eintraege: n.getaggteVerweise![0]!.textstelle.pfad.eintraege!,
          satzInEintrag: n.getaggteVerweise![0]!.textstelle.pfad.satzInEintrag,
        }),
        zeichenbereichStart: n.getaggteVerweise![0]!.textstelle.zeichenbereichStart,
        zeichenbereichEnde: n.getaggteVerweise![0]!.textstelle.zeichenbereichEnde,
      },
      bezugstext: n.getaggteVerweise![0]!.bezugstext,
    },

    typ: 'unterstreichung',
    ausgangsstelle: normAusgangsstelle('§ 1'),
  });
  const gelesen = parseEintraege(
    baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [markierung]),
    gesetzesreferenz({
      kurztitel: 'TestG',
    }),
  ).eintraege[0]!;
  expect(pruefeEigenenKonflikt(gelesen, g)).toBeUndefined();
  expect(gelesen).toMatchObject({
    bezug: {
      textstelle: {
        pfad: { typ: 'normtext' as const, satz: 1, satzInEintrag: 2 },
        zeichenbereichStart: 6,
        zeichenbereichEnde: 7,
      },
      bezugstext: 'B',
    },
  });
  expect(
    pruefeEigenenKonflikt(
      markierungsEintrag({
        ...gelesen,
        bezug: {
          typ: 'bezugstext',
          textstelle: {
            pfad: normtextPfad({ absatz: 'fehlt' }),
            zeichenbereichStart: 0,
            zeichenbereichEnde: 1,
          },
          bezugstext: 'x',
        },
      }),
      g,
    ),
  ).toBe('bezugstextFehltOderUnpassend');
  expect(
    pruefeEigenenKonflikt(gelesen, parseGesetzesXML(xml.replace('zahl="2"', 'zahl="3"'))!),
  ).toBe('bezugstextFehltOderUnpassend');
});

it('erhält einen einzelnen expliziten inneren Satz im MarkierungsXML-Rundlauf', () => {
  const xml =
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>TestG</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz><satz zahl="1"><nummer zahl="1"><satz zahl="1">Siehe <verweis norm="2">B</verweis>.</satz></nummer></satz></absatz></text></norm></inhalt></gesetz>';
  const g = parseGesetzesXML(xml)!;
  const n = g.elemente[0]!.data as NormDarstellung;
  const markierung: MarkierungsEintrag = markierungsEintrag({
    bezug: {
      typ: 'bezugstext' as const,
      textstelle: {
        pfad: normtextPfad({
          absatz: n.getaggteVerweise![0]!.textstelle.pfad.absatz,
          unterabsatz: n.getaggteVerweise![0]!.textstelle.pfad.unterabsatz,
          satz: n.getaggteVerweise![0]!.textstelle.pfad.satz,
          eintraege: n.getaggteVerweise![0]!.textstelle.pfad.eintraege!,
          satzInEintrag: n.getaggteVerweise![0]!.textstelle.pfad.satzInEintrag,
        }),
        zeichenbereichStart: n.getaggteVerweise![0]!.textstelle.zeichenbereichStart,
        zeichenbereichEnde: n.getaggteVerweise![0]!.textstelle.zeichenbereichEnde,
      },
      bezugstext: n.getaggteVerweise![0]!.bezugstext,
    },

    typ: 'unterstreichung',
    ausgangsstelle: normAusgangsstelle('§ 1'),
  });
  const gelesen = parseEintraege(
    baueXML(gesetzesreferenz({ kurztitel: 'TestG' }), [markierung]),
    gesetzesreferenz({
      kurztitel: 'TestG',
    }),
  ).eintraege[0]!;
  expect(gelesen).toMatchObject({
    bezug: {
      textstelle: {
        pfad: { typ: 'normtext' as const, satz: 1, satzInEintrag: 1 },
        zeichenbereichStart: 6,
        zeichenbereichEnde: 7,
      },
      bezugstext: 'B',
    },
  });
  expect(pruefeEigenenKonflikt(gelesen, g)).toBeUndefined();
  expect(pruefeEigenenKonflikt(gelesen, parseGesetzesXML(xml.replace('>B<', '>C<'))!)).toBe(
    'bezugstextFehltOderUnpassend',
  );
  expect(
    pruefeEigenenKonflikt(
      gelesen,
      parseGesetzesXML(
        xml.replace('<satz zahl="1">Siehe <verweis norm="2">B</verweis>.</satz>', ''),
      )!,
    ),
  ).toBe('bezugstextFehltOderUnpassend');
});

it('schreibt Unterabsatz-Bezeichnungen als XML-Text ohne eingeschleuste Elemente', () => {
  const text = '2</unterabsatz><satz>99</satz><unterabsatz>2&';
  const zeilen = bauTextstelleZeilen({
    pfad: normtextPfad({ unterabsatz: text }),
    zeichenbereichStart: 0,
    zeichenbereichEnde: 1,
  });
  const doc = new DOMParser().parseFromString(
    `<textstelle>${zeilen}</textstelle>`,
    'application/xml',
  );
  expect(doc.querySelectorAll('unterabsatz')).toHaveLength(1);
  expect(doc.querySelectorAll('satz')).toHaveLength(0);
  expect(doc.querySelector('unterabsatz')!.textContent).toBe(text);
});
