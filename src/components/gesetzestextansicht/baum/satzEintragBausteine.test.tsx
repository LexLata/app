import { pfadOhneDiskriminante, normtextPfad, pfadAusBlatt } from '@/test/gesetz/textpfadFabrik';
import {
  useTextDarstellungsModell,
  TextDarstellungsRahmen,
} from '@/components/gesetzestextansicht/text-darstellung/text-darstellung.index';
// satzEintragBausteine.test.tsx
// DOM-Blattpfade werden gegen Parser und Rückwärtsauflösung geprüft.
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as MarkierungAnzeige from '@/components/gesetzestextansicht/markierung/markierung.index';
afterEach(() => vi.restoreAllMocks());
import { renderToStaticMarkup } from 'react-dom/server';
import { getaggteVerweiseAlsTextauszeichnungen } from '@/components/gesetzestextansicht/markierung/markierung.index';
import { normTextLaenge } from '@/lib/domain/gesetzDarstellungAuswertung';
import { SaetzeListe as SaetzeBaum } from './satzEintragBausteine';
import { AbsatzListe } from './absatzBausteine';
import type { ComponentProps } from 'react';

function SaetzeListe(props: ComponentProps<typeof SaetzeBaum>) {
  const modell = useTextDarstellungsModell({});
  return (
    <TextDarstellungsRahmen modell={modell}>
      <SaetzeBaum {...props} />
    </TextDarstellungsRahmen>
  );
}
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { blattPfad, textAnTextpfad } from '@/lib/domain/textpfad/textpfad.index';
import { type TextpfadEintrag } from '@/lib/domain/gesetzTypes';

function rendereSaetze(saetze: ComponentProps<typeof SaetzeBaum>['saetze']) {
  const markup = renderToStaticMarkup(
    <SaetzeListe
      saetze={saetze}
      satzNrBreite={10}
      schrift={16}
      satzNeuZeile={true}
      basisPfad={normtextPfad({})}
      satzFeld="satz"
      markierungen={[]}
    />,
  );
  return new DOMParser().parseFromString(markup, 'text/html');
}

describe('vollständiger DOM-Blattpfad', () => {
  it.each([false, true])('erhält Satz und Listenkette (Unterabsatz: %s)', (unterabsatz) => {
    const liste =
      '<satz zahl="1">Liste:<nummer zahl="1">Gruppe:<litera buchstabe="a"><satz zahl="1">A.</satz><neu/><satz zahl="2">Siehe <verweis norm="2">B</verweis>.</satz></litera></nummer></satz>';
    const xml = `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>TestG</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz zahl="(1)">${unterabsatz ? `<unterabsatz zahl="[2]">${liste}</unterabsatz>` : liste}</absatz></text></norm></inhalt></gesetz>`;
    const el = parseGesetzesXML(xml)!.elemente[0]!;
    if (el.typ !== 'norm') throw new Error('Norm fehlt');
    const n = el.data;
    const a = n.absaetze[0]!;
    const saetze = unterabsatz ? a.unterabsaetze![0]!.saetze : a.saetze;
    const markup = renderToStaticMarkup(
      <SaetzeListe
        saetze={saetze}
        satzNrBreite={10}
        schrift={16}
        satzNeuZeile={true}
        basisPfad={normtextPfad({ absatz: '(1)', ...(unterabsatz ? { unterabsatz: '[2]' } : {}) })}
        satzFeld="satz"
        markierungen={[]}
      />,
    );
    const doc = new DOMParser().parseFromString(markup, 'text/html');
    const blatt = Array.from(doc.querySelectorAll('[data-leaf]')).find(
      (b) => b.textContent === 'Siehe B.',
    );
    expect(blatt).toBeDefined();
    const pfad = pfadAusBlatt(blattPfad(blatt!));
    const verweis = n.getaggteVerweise![0]!;
    expect(pfad).toEqual(
      normtextPfad({
        absatz: '(1)',
        ...(unterabsatz ? { unterabsatz: '[2]' } : {}),
        satz: 1,
        eintraege: [
          { ebene: 'nummer', bezeichnung: '1' },
          { ebene: 'litera', bezeichnung: 'a' },
        ],
        satzInEintrag: 2,
      }),
    );
    expect(verweis.textstelle.pfad).toMatchObject(pfadOhneDiskriminante(pfad));
    expect(
      textAnTextpfad(n, {
        pfad: pfad,
        zeichenbereichStart: verweis.textstelle.zeichenbereichStart,
        zeichenbereichEnde: verweis.textstelle.zeichenbereichEnde,
      }),
    ).toBe('B');
  });
});

it.each([
  [
    '<nummer zahl="1"><satz zahl="1">A.</satz><satz zahl="2">Siehe <verweis norm="2">B</verweis>.</satz></nummer>',
    normtextPfad({ eintraege: [{ ebene: 'nummer', bezeichnung: '1' }], satzInEintrag: 2 }),
  ],
  [
    '<satz zahl="1"><nummer zahl="1">Siehe <verweis norm="2">B</verweis>.</nummer></satz>',
    normtextPfad({ satz: 1, eintraege: [{ ebene: 'nummer', bezeichnung: '1' }] }),
  ],
  [
    '<nummer zahl="1">Siehe <verweis norm="2">B</verweis>.</nummer>',
    normtextPfad({ eintraege: [{ ebene: 'nummer', bezeichnung: '1' }] }),
  ],
] as const)('erhält bestehende Pfade ohne äußeren oder inneren Satz: %s', (inhalt, erwartet) => {
  const g = parseGesetzesXML(
    `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>TestG</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz>${inhalt}</absatz></text></norm></inhalt></gesetz>`,
  )!;
  const el = g.elemente[0]!;
  if (el.typ !== 'norm') throw new Error('Norm fehlt');
  const n = el.data;
  const doc = rendereSaetze(n.absaetze[0]!.saetze);
  const blatt = Array.from(doc.querySelectorAll('[data-leaf]')).find(
    (b) => b.textContent === 'Siehe B.',
  )!;
  const pfad = pfadAusBlatt(blattPfad(blatt));
  expect(pfad).toEqual(erwartet);
  expect(n.getaggteVerweise![0]).toMatchObject({
    textstelle: {
      pfad: pfadOhneDiskriminante(pfad),
      zeichenbereichStart: 6,
      zeichenbereichEnde: 7,
    },
  });
  expect(textAnTextpfad(n, { pfad: pfad, zeichenbereichStart: 6, zeichenbereichEnde: 7 })).toBe(
    'B',
  );
});

it.each([
  { aussen: true, unterabsatz: false, verschachtelt: false, zahl: true },
  { aussen: false, unterabsatz: false, verschachtelt: false, zahl: false },
  { aussen: true, unterabsatz: true, verschachtelt: true, zahl: false },
  { aussen: false, unterabsatz: true, verschachtelt: true, zahl: true },
])(
  'ordnet ein einzelnes Satzkind dem echten Blatt zu: %j',
  ({ aussen, unterabsatz, verschachtelt, zahl }) => {
    const innerer = `<neu/><satz${zahl ? ' zahl="1"' : ''}>Siehe <verweis norm="2">B</verweis>.</satz><neu/>`;
    const liste = `<nummer zahl="1">${verschachtelt ? `<litera buchstabe="a">${innerer}</litera>` : innerer}</nummer>`;
    const inhalt = aussen ? `<satz zahl="1">${liste}</satz>` : liste;
    const el = parseGesetzesXML(
      `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>TestG</kurztitel></infos><inhalt><norm id="1"><bezeichnung>§ 1</bezeichnung><text><absatz>${unterabsatz ? `<unterabsatz zahl="[2]">${inhalt}</unterabsatz>` : inhalt}</absatz></text></norm></inhalt></gesetz>`,
    )!.elemente[0]!;
    if (el.typ !== 'norm') throw new Error('Norm fehlt');
    const n = el.data;
    const a = n.absaetze[0]!;
    const markup = renderToStaticMarkup(
      <SaetzeListe
        saetze={unterabsatz ? a.unterabsaetze![0]!.saetze : a.saetze}
        satzNrBreite={10}
        schrift={16}
        satzNeuZeile={true}
        basisPfad={unterabsatz ? normtextPfad({ unterabsatz: '[2]' }) : normtextPfad({})}
        satzFeld="satz"
        markierungen={[]}
        getaggteVerweise={getaggteVerweiseAlsTextauszeichnungen(n)}
      />,
    );
    const doc = new DOMParser().parseFromString(markup, 'text/html');
    const blaetter = Array.from(doc.querySelectorAll('[data-leaf]'));
    expect(blaetter).toHaveLength(1);
    const blatt = blaetter[0]!;
    expect(blatt.textContent).toBe('Siehe B.');
    expect(doc.querySelector('sup')).toBeNull();
    const pfad = pfadAusBlatt(blattPfad(blatt));
    expect(pfad).toEqual(
      normtextPfad({
        ...(aussen ? { satz: 1 } : {}),
        ...(unterabsatz ? { unterabsatz: '[2]' } : {}),
        eintraege: [
          { ebene: 'nummer', bezeichnung: '1' },
          ...(verschachtelt ? [{ ebene: 'litera' as const, bezeichnung: 'a' }] : []),
        ],
        satzInEintrag: 1,
      }),
    );
    expect(n.getaggteVerweise![0]!.textstelle.pfad).toMatchObject(pfadOhneDiskriminante(pfad));
    expect(textAnTextpfad(n, { pfad: pfad, zeichenbereichStart: 6, zeichenbereichEnde: 7 })).toBe(
      'B',
    );
    const dekoriert = Array.from(blatt.querySelectorAll('[style]')).filter((node) =>
      node.getAttribute('style')?.includes('text-decoration:underline'),
    );
    expect(dekoriert.map((node) => node.textContent)).toEqual(['B']);
    expect(normTextLaenge(n)).toBe(8);
  },
);

it('erhält die artunabhängige Wiederholungszählung zwischen Parser, Rendering und Rückwärtsauflösung', () => {
  const el = parseGesetzesXML(
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>TestG</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz><nummer zahl="a">Erster</nummer><litera buchstabe="a">Siehe <verweis norm="2">B</verweis>.</litera><litera buchstabe="a">Siehe <verweis norm="3">C</verweis>.</litera></absatz></text></norm></inhalt></gesetz>',
  )!.elemente[0]!;
  if (el.typ !== 'norm') throw new Error('Norm fehlt');
  const n = el.data;
  const doc = rendereSaetze(n.absaetze[0]!.saetze);
  for (const [index, text] of ['Siehe B.', 'Siehe C.'].entries()) {
    const blatt = Array.from(doc.querySelectorAll('[data-leaf]')).find(
      (b) => b.textContent === text,
    )!;
    const pfad = pfadAusBlatt(blattPfad(blatt));
    const eintraege: TextpfadEintrag[] = [
      { ebene: 'litera', bezeichnung: 'a', wiederholung: index + 1 },
    ];
    expect(pfad).toEqual(normtextPfad({ eintraege }));
    const verweis = n.getaggteVerweise![index]!;
    expect(verweis).toMatchObject({
      textstelle: {
        pfad: pfadOhneDiskriminante(pfad),
        zeichenbereichStart: 6,
        zeichenbereichEnde: 7,
      },
    });
    expect(
      textAnTextpfad(n, {
        pfad: pfad,
        zeichenbereichStart: verweis.textstelle.zeichenbereichStart,
        zeichenbereichEnde: verweis.textstelle.zeichenbereichEnde,
      }),
    ).toBe(text[6]);
    expect(
      textAnTextpfad(n, {
        pfad: normtextPfad({ eintraege: [{ ...pfad.eintraege![0]!, ebene: 'nummer' }] }),
        zeichenbereichStart: 6,
        zeichenbereichEnde: 7,
      }),
    ).toBeUndefined();
  }
});

it.each([false, true])(
  'übergibt originale Satztexte an die Anzeigegrenze (neue Zeile: %s)',
  (satzNeuZeile) => {
    const originaltext = '😀 § 9999 Abs. 1 I 2';
    const eingang = vi.spyOn(MarkierungAnzeige, 'geschuetzterBlatttext');
    const saetze = [{ id: 's', zahl: 1, text: originaltext, eintraege: [] }];
    const vorher = structuredClone(saetze);
    const markup = renderToStaticMarkup(
      <SaetzeListe
        saetze={saetze}
        satzNrBreite={10}
        schrift={16}
        satzNeuZeile={satzNeuZeile}
        basisPfad={normtextPfad({})}
        satzFeld="satz"
        markierungen={[]}
      />,
    );
    expect(eingang).toHaveBeenCalledExactlyOnceWith(originaltext);
    expect(
      new DOMParser().parseFromString(markup, 'text/html').querySelector('[data-leaf]')!
        .textContent,
    ).toBe('😀 §\u00a09999 Abs.\u00a01 I 2');
    expect(saetze).toEqual(vorher);
  },
);

it('übergibt Haupttext und Fortsetzungen verschachtelter Einträge unverändert', () => {
  const el = parseGesetzesXML(
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>TestG</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz><satz zahl="1">😀 § 1<nummer zahl="1">Art. 2<litera buchstabe="a">Abs. 3</litera>Nr. 4</nummer>§ 5</satz></absatz></text></norm></inhalt></gesetz>',
  )!.elemente[0]!;
  if (el.typ !== 'norm') throw new Error('Norm fehlt');
  const vorher = structuredClone(el.data);
  const eingang = vi.spyOn(MarkierungAnzeige, 'geschuetzterBlatttext');
  const doc = rendereSaetze(el.data.absaetze[0]!.saetze);
  expect(eingang.mock.calls.map(([text]) => text)).toEqual([
    '😀 § 1',
    'Art. 2',
    'Abs. 3',
    'Nr. 4',
    '§ 5',
  ]);
  const fortsetzungen = [...doc.querySelectorAll('[data-zeichen-versatz]')];
  expect(fortsetzungen.map((blatt) => blatt.getAttribute('data-zeichen-versatz'))).toEqual([
    String('Art. 2'.length),
    String('😀 § 1'.length),
  ]);
  expect(el.data).toEqual(vorher);
});

describe('fortlaufende Sätze (Neue Zeile für jeden Satz ausgeschaltet)', () => {
  function parseAbsaetze(absatzInhalt: string) {
    const el = parseGesetzesXML(
      `<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>TestG</kurztitel></infos><inhalt><norm id="n1"><bezeichnung>§ 1</bezeichnung><text><absatz zahl="(1)">${absatzInhalt}</absatz></text></norm></inhalt></gesetz>`,
    )?.elemente[0];
    if (el?.typ !== 'norm') throw new Error('Norm fehlt');
    return el.data.absaetze;
  }
  function dokument(markup: string) {
    const doc = new DOMParser().parseFromString(markup, 'text/html');
    const blatt = (text: string) => {
      const treffer = [...doc.querySelectorAll('[data-leaf]')].find((b) => b.textContent === text);
      if (!treffer) throw new Error(`Blatt „${text}“ fehlt`);
      return treffer;
    };
    return { doc, blatt, block: (text: string) => blatt(text).closest('div') };
  }
  function rendereFortlaufend(absatzInhalt: string) {
    return dokument(
      renderToStaticMarkup(
        <SaetzeListe
          saetze={parseAbsaetze(absatzInhalt)[0]?.saetze ?? []}
          satzNrBreite={10}
          schrift={16}
          satzNeuZeile={false}
          basisPfad={normtextPfad({ absatz: '(1)' })}
          satzFeld="satz"
          markierungen={[]}
        />,
      ),
    );
  }

  it('zeigt Aufzählung, Eintragssätze und Fortsetzung; Folgesätze laufen im Fortsetzungsblock weiter', () => {
    const { blatt, block } = rendereFortlaufend(
      '<satz zahl="1">Erster.</satz><satz zahl="2">Liste:<nummer zahl="1"><satz zahl="1">A.</satz><satz zahl="2">B.</satz></nummer><nummer zahl="2">Zwei<litera buchstabe="a">Buchstabe</litera></nummer>danach.</satz><satz zahl="3">Dritter.</satz>',
    );
    expect(block('Erster.')).toBe(block('Liste:'));
    expect(block('A.')).toBe(block('B.'));
    expect(block('danach.')).toBe(block('Dritter.'));
    expect(block('Erster.')).not.toBe(block('danach.'));
    expect(block('A.')).not.toBe(block('Erster.'));
    expect(blatt('Buchstabe')).toBeDefined();
    expect(pfadAusBlatt(blattPfad(blatt('Dritter.')))).toEqual(
      normtextPfad({ absatz: '(1)', satz: 3 }),
    );
    expect(pfadAusBlatt(blattPfad(blatt('B.')))).toEqual(
      normtextPfad({
        absatz: '(1)',
        satz: 2,
        eintraege: [{ ebene: 'nummer', bezeichnung: '1' }],
        satzInEintrag: 2,
      }),
    );
    expect(blatt('danach.').getAttribute('data-zeichen-versatz')).toBe(String('Liste:'.length));
  });

  it('stellt die Satznummer hochgestellt in denselben Fließtext ohne eigene Spalte', () => {
    const { doc, block } = rendereFortlaufend(
      '<satz zahl="1">Erster.</satz><satz zahl="2">Zweiter.</satz>',
    );
    const nummern = [...doc.querySelectorAll('sup')];
    expect(nummern.map((n) => n.textContent)).toEqual(['1', '2']);
    expect(nummern.every((n) => n.closest('div') === block('Erster.'))).toBe(true);
    expect(block('Zweiter.')).toBe(block('Erster.'));
  });

  it('behält für jeden Unterabsatz einen eigenen Block; nur dessen Sätze laufen fortlaufend', () => {
    const absaetze = parseAbsaetze(
      '<unterabsatz zahl="[1]"><satz zahl="1">Eins A.</satz><satz zahl="2">Eins B.</satz></unterabsatz><unterabsatz zahl="[2]"><satz zahl="1">Zwei A.</satz></unterabsatz>',
    );
    function Rahmen() {
      const modell = useTextDarstellungsModell({});
      return (
        <TextDarstellungsRahmen modell={modell}>
          <AbsatzListe absaetze={absaetze} schrift={16} satzNeuZeile={false} />
        </TextDarstellungsRahmen>
      );
    }
    const { doc, blatt, block } = dokument(renderToStaticMarkup(<Rahmen />));
    expect(block('Eins A.')).toBe(block('Eins B.'));
    expect(block('Eins A.')).not.toBe(block('Zwei A.'));
    // Unterabsätze stehen untereinander als Blöcke, nicht im Fließtext einer Zeile.
    expect(doc.querySelector('span div')).toBeNull();
    const marken = [...doc.querySelectorAll('span')].filter((s) =>
      /^\[\d\]$/.test(s.textContent ?? ''),
    );
    expect([...new Set(marken.map((m) => m.textContent))]).toEqual(['[1]', '[2]']);
    // Marke steht als eigene Spalte neben dem Satzblock, nicht im Fließtext.
    expect(marken.every((m) => m.closest('div') !== block('Eins A.'))).toBe(true);
    expect(pfadAusBlatt(blattPfad(blatt('Zwei A.')))).toEqual(
      normtextPfad({ absatz: '(1)', unterabsatz: '[2]', satz: 1 }),
    );
  });
});
