// Prüft Absatzadressen vom Parser über DOM und MarkierungsXML zurück zum Rechtstext.
import { normtextPfad, pfadAusBlatt } from '@/test/gesetz/textpfadFabrik';
import { expect, it } from 'vitest';
import { createElement } from 'react';
import fc from 'fast-check';
import { renderToStaticMarkup } from 'react-dom/server';
import { AbsatzListe } from '@/components/gesetzestextansicht/gesetzestextansicht.index';
import {
  TextDarstellungsRahmen,
  useTextDarstellungsModell,
} from '@/components/gesetzestextansicht/text-darstellung/text-darstellung.index';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import {
  blattPfad,
  pfadGleich,
  textAnTextpfad,
  vergleicheTextpfad,
} from '@/lib/domain/textpfad/textpfad.index';
import { baueXML, parseEintraege } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import { identitaetsSchluessel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import {
  baueMarkierungskonflikteXML,
  erstelleGespeicherteGesetzKonflikte,
} from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import type { Textstelle } from '@/lib/domain/textpfad/textpfad.index';
import { formatiereZitat } from '@/lib/markierungen/markierungen.index';
import type { NormDarstellung } from '@/lib/domain/gesetzTypes';
import type { MarkierungsEintrag } from '@/lib/markierungen/markierungen.index';

function textstelleImMarkierungsXML(textstelle: Textstelle): string {
  return baueXML({ kurztitel: 'TestG', normgeber: 'de-bund' }, [
    {
      typ: 'unterstreichung',
      ausgangsstelle: { typ: 'norm', bezeichnung: '§ 1' },
      bezug: { typ: 'bezugstext', textstelle, bezugstext: 'Z' },
    },
  ]);
}

function norm(inhalt: string) {
  return parseGesetzesXML(
    `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>TestG</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>Art. 1</bezeichnung><text>${inhalt}</text></norm></inhalt></gesetz>`,
  )!.elemente[0]!.data as NormDarstellung;
}
function Ansicht({ n }: { n: NormDarstellung }) {
  const modell = useTextDarstellungsModell({});
  return createElement(TextDarstellungsRahmen, {
    modell,
    children: createElement(AbsatzListe, {
      absaetze: n.absaetze,
      schrift: 16,
      satzNeuZeile: false,
    }),
  });
}
function blaetter(n: NormDarstellung) {
  return Array.from(
    new DOMParser()
      .parseFromString(renderToStaticMarkup(createElement(Ansicht, { n })), 'text/html')
      .querySelectorAll('[data-leaf]'),
  );
}

it('adressiert die dritte von fünf Zwischenüberschriften zwischen nummerierten Absätzen', () => {
  const n = norm(
    Array.from(
      { length: 5 },
      (_, i) =>
        `<absatz zahl="(${i + 1})">Absatz ${i}</absatz><absatz typ="zwischenueberschrift">Überschrift ${i}</absatz>`,
    ).join(''),
  );
  const b = blaetter(n);
  expect(pfadAusBlatt(blattPfad(b[1]!))).toEqual(normtextPfad({}));
  const pfad = pfadAusBlatt(blattPfad(b[5]!));
  expect(pfad).toEqual(normtextPfad({ absatzWiederholung: 2 }));
  expect(textAnTextpfad(n, { pfad, zeichenbereichStart: 0, zeichenbereichEnde: 100 })).toBe(
    'Überschrift 2',
  );
  expect(pfadGleich(pfadAusBlatt(blattPfad(b[1]!)), pfad)).toBe(false);
  expect(pfadGleich(normtextPfad({}), normtextPfad({ absatzWiederholung: 0 }))).toBe(true);
  expect(vergleicheTextpfad(normtextPfad({}), pfad)).toBeLessThan(0);
  expect(
    formatiereZitat('Art. 1', 'TestG', pfad, {
      abkuerzungenAktiv: true,
      ohnePunkt: false,
      roemischeAbsaetze: false,
    }),
  ).toBe('Art. 1 TestG');
});

it('erhält den zweiten Präambelabsatz und denselben Pfad in Markierungs- und KonfliktXML', () => {
  const n = norm('<absatz>Erster</absatz><absatz>Zweiter</absatz><absatz>Dritter</absatz>');
  const pfad = pfadAusBlatt(blattPfad(blaetter(n)[1]!));
  expect(pfad).toEqual(normtextPfad({ absatzWiederholung: 1 }));
  const m: MarkierungsEintrag = {
    typ: 'unterstreichung',
    ausgangsstelle: { typ: 'norm', bezeichnung: '§ 1' },
    bezug: {
      typ: 'bezugstext',
      textstelle: { pfad, zeichenbereichStart: 0, zeichenbereichEnde: 7 },
      bezugstext: 'Zweiter',
    },
  };
  const xml = baueXML({ kurztitel: 'TestG', normgeber: 'de-bund' }, [m]);
  expect(xml).toContain('<absatz wiederholung="1"/>');
  const gelesen = parseEintraege(xml).eintraege[0]!;
  expect(pfadGleich(gelesen.bezug.textstelle!.pfad, pfad)).toBe(true);
  expect(textAnTextpfad(n, gelesen.bezug.textstelle!)).toBe('Zweiter');
  const konflikt = erstelleGespeicherteGesetzKonflikte({
    gesetz: { kurztitel: 'TestG', normgeber: 'de-bund' },
    eintraege: [
      {
        markierungstyp: m.typ,
        ausgangsstelle: m.ausgangsstelle,
        textstelle: m.bezug.textstelle,
        eigenerKonflikt: 'bezugstextFehltOderUnpassend',
        zielKonflikte: [],
      },
    ],
  });
  const textstelle = baueMarkierungskonflikteXML({
    gesetzKonflikte: new Map([['TestG', konflikt]]),
    pruefstatus: 'aktuell',
  }).match(/<textstelle>[\s\S]*?<\/textstelle>/)![0];
  const k = parseEintraege(
    `<markierungen><infos><gesetz normgeber="de-bund">TestG</gesetz></infos><inhalt><kommentar><bezeichnung>§ 1</bezeichnung>${textstelle}<bezugstext>Text</bezugstext><kommentartext/></kommentar></inhalt></markierungen>`,
  ).eintraege[0]!;
  expect(pfadGleich(k.bezug.textstelle!.pfad, pfad)).toBe(true);
  expect(
    textstelleImMarkierungsXML({
      pfad: normtextPfad({ absatzWiederholung: 2 }),
      zeichenbereichStart: 0,
      zeichenbereichEnde: 1,
    }),
  ).toContain('<absatz wiederholung="2"/>');
  expect(
    textstelleImMarkierungsXML({
      pfad: normtextPfad({ absatz: '(1)', absatzWiederholung: 0 }),
      zeichenbereichStart: 0,
      zeichenbereichEnde: 1,
    }),
  ).toContain('<absatz>(1)</absatz>');
});

it.each([
  '<absatz typ="zwischenueberschrift">A</absatz><absatz zahl="(1)">B</absatz><absatz typ="zwischenueberschrift">C</absatz><absatz typ="zwischenueberschrift">Siehe <verweis norm="2">Ziel</verweis></absatz>',
  '<absatz>Erster</absatz><absatz>Siehe <verweis norm="2">Ziel</verweis></absatz><absatz>Dritter</absatz>',
])('ordnet getaggte Verweise dem jeweiligen Absatz zu', (inhalt) => {
  const n = norm(inhalt);
  const index = inhalt.includes('zwischenueberschrift') ? 3 : 1;
  const pfad = pfadAusBlatt(blattPfad(blaetter(n)[index]!));
  const verweis = n.getaggteVerweise![0]!;
  expect(pfadGleich(verweis.textstelle.pfad, pfad)).toBe(true);
  expect(textAnTextpfad(n, verweis.textstelle)).toBe('Ziel');
});

it('zählt beliebige Folgen mit und ohne Bezeichnung vorwärts und rückwärts identisch', () => {
  fc.assert(
    fc.property(
      fc.array(fc.option(fc.constantFrom('(1)', '(2)', '1b.'), { nil: undefined }), {
        minLength: 1,
        maxLength: 15,
      }),
      (bezeichnungen) => {
        const n = norm(
          bezeichnungen
            .map((b, i) => `<absatz${b === undefined ? '' : ` zahl="${b}"`}>Text ${i}</absatz>`)
            .join(''),
        );
        blaetter(n).forEach((blatt, i) => {
          const pfad = pfadAusBlatt(blattPfad(blatt));
          const wiederholung = bezeichnungen
            .slice(0, i)
            .filter((b) => b === bezeichnungen[i]).length;
          expect(pfad.absatzWiederholung).toBe(wiederholung || undefined);
          expect(pfad.absatz).toBe(bezeichnungen[i]);
          expect(textAnTextpfad(n, { pfad, zeichenbereichStart: 0, zeichenbereichEnde: 100 })).toBe(
            `Text ${i}`,
          );
        });
      },
    ),
  );
});

it('unterscheidet Konflikte gleicher Zeichenbereiche anhand des Textpfads und normalisiert 0', () => {
  const m: MarkierungsEintrag = {
    typ: 'unterstreichung',
    ausgangsstelle: { typ: 'norm', bezeichnung: '§ 1' },
    bezug: {
      typ: 'bezugstext',
      bezugstext: 'A',
      textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 1 },
    },
  };
  const schluessel = (pfad: NonNullable<MarkierungsEintrag['bezug']['textstelle']>['pfad']) =>
    identitaetsSchluessel({
      ...m,
      bezug: { ...m.bezug, textstelle: { ...m.bezug.textstelle!, pfad } },
    });
  expect(schluessel(normtextPfad({}))).toBe(schluessel(normtextPfad({ absatzWiederholung: 0 })));
  expect(schluessel(normtextPfad({}))).not.toBe(
    schluessel(normtextPfad({ absatzWiederholung: 1 })),
  );
  expect(schluessel(normtextPfad({ absatz: '(1)' }))).not.toBe(
    schluessel(normtextPfad({ absatz: '(2)' })),
  );
  const pfade = [
    normtextPfad({}),
    normtextPfad({ absatzWiederholung: 0 }),
    normtextPfad({ absatzWiederholung: 2 }),
    normtextPfad({
      absatz: '(1)',
      satz: 2,
      eintraege: [{ ebene: 'nummer', bezeichnung: '1', wiederholung: 1 }],
    }),
  ];
  const konflikte = erstelleGespeicherteGesetzKonflikte({
    gesetz: { kurztitel: 'TestG', normgeber: 'de-bund' },
    eintraege: pfade.map((pfad) => ({
      markierungstyp: m.typ,
      ausgangsstelle: m.ausgangsstelle,
      textstelle: { ...m.bezug.textstelle!, pfad },
      eigenerKonflikt: 'bezugstextFehltOderUnpassend',
      zielKonflikte: [],
    })),
  });
  expect(konflikte.eintraege.map((k) => k.schluessel)).toEqual(pfade.map(schluessel));
});

it('erhält Präambelmarkierung und getaggten Verweis nach Satz-Nachbereitung', async () => {
  const { nachbereiteGesetzesXML } =
    await import('@/lib/import/importabschluss/importabschluss.index');
  const original =
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>TestG</kurztitel><langtitel>Test</langtitel></infos><inhalt><norm id="Präambel"><bezeichnung>Präambel</bezeichnung><text><absatz>Erster.</absatz><absatz>Siehe <verweis norm="2">Ziel</verweis>.</absatz></text></norm></inhalt></gesetz>';
  const nachher = await nachbereiteGesetzesXML(original, undefined, 'saetze');
  const n = parseGesetzesXML(nachher)!.elemente[0]!.data as NormDarstellung;
  expect(n.absaetze).toHaveLength(2);
  const verweis = n.getaggteVerweise![0]!;
  expect(verweis.textstelle.pfad).toEqual(normtextPfad({ absatzWiederholung: 1 }));
  const gespeichert = baueXML({ kurztitel: 'TestG', normgeber: 'de-bund' }, [
    {
      typ: 'unterstreichung',
      bezug: { typ: 'bezugstext', textstelle: verweis.textstelle, bezugstext: verweis.bezugstext },
      ausgangsstelle: { typ: 'norm', bezeichnung: '§ 1' },
    },
  ]);
  const gelesen = parseEintraege(gespeichert).eintraege[0]!;
  expect(textAnTextpfad(n, gelesen.bezug.textstelle!)).toBe('Ziel');
  expect(
    formatiereZitat('Präambel', 'TestG', gelesen.bezug.textstelle!.pfad, {
      abkuerzungenAktiv: true,
      ohnePunkt: false,
      roemischeAbsaetze: false,
    }),
  ).toBe('Präambel TestG');
});
