import {
  textauszeichnung,
  getaggterVerweis,
  type AuszeichnungsAngaben,
} from '@/test/gesetz/textauszeichnungFabrik';
// textSegmentierung.test.ts
//
// Tests für textSegmentierung.ts (kolokiert, Vitest). Deckt
// segmentiere() (Markierungstyp/VerweisInhalt-Zerlegung) und
// formatiereGetaggtesZitat() ab – beide rein, DOM-frei, bisher komplett
// ungetestet. Fokus auf die dokumentierten Grenzfälle: Clipping bei
// veraltetem Normtext, echte Überlappung vs. reines Aneinandergrenzen, sowie
// die zielabhängige Verschmelzung (gleicher vs. unterschiedlicher
// verweistext/kommentarText über zielSchluessel).

import { describe, it, expect } from 'vitest';
import {
  segmentiere as segmentiereAuszeichnungen,
  formatiereGetaggtesZitat,
} from '@/lib/darstellung/textSegmentierung';
import type { VerweisInhalt } from '@/lib/markierungen/markierungen.index';

// segmentiere() liest von VerweisInhalt ausschließlich verweistext (siehe
// zielSchluessel) – verweisziele bleibt für diese Tests daher immer leer.
function verweis(verweistext: string): VerweisInhalt {
  return { verweistext, verweisziele: [] };
}

describe('formatiereGetaggtesZitat', () => {
  it('hängt das Gesetz an, wenn vorhanden', () => {
    expect(formatiereGetaggtesZitat('§ 241', 'BGB')).toBe('§ 241 BGB');
  });

  it('lässt die Bezeichnung unverändert, wenn kein Gesetz übergeben wird', () => {
    expect(formatiereGetaggtesZitat('§ 241')).toBe('§ 241');
  });

  it('leerer String als Gesetz zählt als "nicht vorhanden" (falsy) und wird nicht angehängt', () => {
    expect(formatiereGetaggtesZitat('§ 241', '')).toBe('§ 241');
  });
});

describe('segmentiere – Grundverhalten', () => {
  it('ohne Bereiche: EIN Segment mit dem gesamten Text, typ null', () => {
    expect(segmentiere('Hallo Welt', [])).toEqual([{ text: 'Hallo Welt', typ: null }]);
  });

  it('leerer Text ohne Bereiche: EIN Segment mit leerem Text (nicht die leere Liste)', () => {
    expect(segmentiere('', [])).toEqual([{ text: '', typ: null }]);
  });

  it('ein Bereich mittendrin erzeugt drei Segmente: davor/Bereich/danach', () => {
    expect(
      segmentiere('Hallo Welt', [
        { zeichenbereichStart: 6, zeichenbereichEnde: 10, typ: 'unterstreichung' },
      ]),
    ).toEqual([
      { text: 'Hallo ', typ: null },
      { text: 'Welt', typ: 'unterstreichung' },
    ]);
  });

  it('ein Bereich am Textanfang erzeugt kein leeres "davor"-Segment', () => {
    expect(
      segmentiere('Hallo Welt', [
        { zeichenbereichStart: 0, zeichenbereichEnde: 5, typ: 'hervorhebung' },
      ]),
    ).toEqual([
      { text: 'Hallo', typ: 'hervorhebung' },
      { text: ' Welt', typ: null },
    ]);
  });

  it('ein Bereich am Textende erzeugt kein leeres "danach"-Segment', () => {
    expect(
      segmentiere('Hallo Welt', [
        { zeichenbereichStart: 6, zeichenbereichEnde: 10, typ: 'hervorhebung' },
      ]),
    ).toEqual([
      { text: 'Hallo ', typ: null },
      { text: 'Welt', typ: 'hervorhebung' },
    ]);
  });

  it('ein Bereich über den GESAMTEN Text erzeugt nur ein einziges Segment', () => {
    expect(
      segmentiere('Hallo', [
        { zeichenbereichStart: 0, zeichenbereichEnde: 5, typ: 'unterstreichung' },
      ]),
    ).toEqual([{ text: 'Hallo', typ: 'unterstreichung' }]);
  });

  it('Quellenverweis und Kommentartext werden pro Segment durchgereicht', () => {
    const segmente = segmentiere('Hallo', [
      {
        zeichenbereichStart: 0,
        zeichenbereichEnde: 5,
        typ: 'getaggterVerweis',
        verweis: getaggterVerweis({ zielBezeichnung: '§ 1 BGB' }),
      },
    ]);
    expect(segmente).toEqual([
      {
        text: 'Hallo',
        typ: 'getaggterVerweis',
        getaggterVerweis: getaggterVerweis({ zielBezeichnung: '§ 1 BGB' }),
      },
    ]);
  });
});

describe('segmentiere – Clipping (veralteter Normtext)', () => {
  it('EDGE CASE: ein Bereich, der über die Textlänge hinausragt, wird auf die Textlänge geclippt statt zu werfen', () => {
    expect(
      segmentiere('Hallo', [
        { zeichenbereichStart: 3, zeichenbereichEnde: 20, typ: 'unterstreichung' },
      ]),
    ).toEqual([
      { text: 'Hal', typ: null },
      { text: 'lo', typ: 'unterstreichung' },
    ]);
  });

  it('EDGE CASE: ein Bereich, der KOMPLETT außerhalb der Textlänge liegt (start >= Textlänge), wird verworfen (nach Clipping ende<=start)', () => {
    expect(
      segmentiere('Hallo', [
        { zeichenbereichStart: 10, zeichenbereichEnde: 20, typ: 'unterstreichung' },
      ]),
    ).toEqual([{ text: 'Hallo', typ: null }]);
  });

  it('EDGE CASE: negative zeichenbereichStart-Werte werden auf 0 geclippt statt zu werfen', () => {
    expect(
      segmentiere('Hallo', [
        { zeichenbereichStart: -5, zeichenbereichEnde: 3, typ: 'unterstreichung' },
      ]),
    ).toEqual([
      { text: 'Hal', typ: 'unterstreichung' },
      { text: 'lo', typ: null },
    ]);
  });

  it('ein ungültiger Bereich (ende<=start nach Clipping) wird komplett verworfen', () => {
    expect(
      segmentiere('Hallo', [
        { zeichenbereichStart: 3, zeichenbereichEnde: 3, typ: 'unterstreichung' },
      ]),
    ).toEqual([{ text: 'Hallo', typ: null }]);
  });
});

describe('segmentiere – Zusammenführung angrenzender/überlappender Bereiche', () => {
  it('zwei angrenzende Bereiche GLEICHEN Typs (unterstreichung/hervorhebung) verschmelzen zu einem Segment', () => {
    expect(
      segmentiere('HalloWelt', [
        { zeichenbereichStart: 0, zeichenbereichEnde: 5, typ: 'unterstreichung' },
        { zeichenbereichStart: 5, zeichenbereichEnde: 9, typ: 'unterstreichung' },
      ]),
    ).toEqual([{ text: 'HalloWelt', typ: 'unterstreichung' }]);
  });

  it('zwei angrenzende Bereiche UNTERSCHIEDLICHEN Typs bleiben getrennte Segmente (KEIN Konflikt, siehe Funktionskommentar)', () => {
    expect(
      segmentiere('HalloWelt', [
        { zeichenbereichStart: 0, zeichenbereichEnde: 5, typ: 'unterstreichung' },
        { zeichenbereichStart: 5, zeichenbereichEnde: 9, typ: 'hervorhebung' },
      ]),
    ).toEqual([
      { text: 'Hallo', typ: 'unterstreichung' },
      { text: 'Welt', typ: 'hervorhebung' },
    ]);
  });

  it('echte Überlappung mit UNTERSCHIEDLICHEM Ziel: der zuerst startende Bereich gewinnt vollständig, der zweite wird verworfen', () => {
    expect(
      segmentiere('HalloWelt', [
        { zeichenbereichStart: 0, zeichenbereichEnde: 6, typ: 'unterstreichung' },
        { zeichenbereichStart: 3, zeichenbereichEnde: 9, typ: 'hervorhebung' },
      ]),
    ).toEqual([
      { text: 'HalloW', typ: 'unterstreichung' },
      { text: 'elt', typ: null },
    ]);
  });

  it('echte Überlappung mit GLEICHEM Typ verschmilzt (Ende wird auf das Maximum erweitert)', () => {
    expect(
      segmentiere('HalloWelt', [
        { zeichenbereichStart: 0, zeichenbereichEnde: 6, typ: 'unterstreichung' },
        { zeichenbereichStart: 3, zeichenbereichEnde: 9, typ: 'unterstreichung' },
      ]),
    ).toEqual([{ text: 'HalloWelt', typ: 'unterstreichung' }]);
  });

  it('typ "verweismarkierung": zwei angrenzende Bereiche mit IDENTISCHEM verweistext verschmelzen', () => {
    expect(
      segmentiere('HalloWelt', [
        {
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
          typ: 'verweismarkierung',
          verweisinhalt: verweis('§ 1 BGB'),
        },
        {
          zeichenbereichStart: 5,
          zeichenbereichEnde: 9,
          typ: 'verweismarkierung',
          verweisinhalt: verweis('§ 1 BGB'),
        },
      ]),
    ).toEqual([{ text: 'HalloWelt', typ: 'verweismarkierung', verweisinhalt: verweis('§ 1 BGB') }]);
  });

  it('typ "verweismarkierung": zwei angrenzende Bereiche mit UNTERSCHIEDLICHEM verweistext bleiben getrennt (verschiedene Ziele)', () => {
    expect(
      segmentiere('HalloWelt', [
        {
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
          typ: 'verweismarkierung',
          verweisinhalt: verweis('§ 1 BGB'),
        },
        {
          zeichenbereichStart: 5,
          zeichenbereichEnde: 9,
          typ: 'verweismarkierung',
          verweisinhalt: verweis('§ 2 BGB'),
        },
      ]),
    ).toEqual([
      { text: 'Hallo', typ: 'verweismarkierung', verweisinhalt: verweis('§ 1 BGB') },
      { text: 'Welt', typ: 'verweismarkierung', verweisinhalt: verweis('§ 2 BGB') },
    ]);
  });

  it('typ "kommentar": zwei angrenzende Bereiche mit IDENTISCHEM kommentarText verschmelzen', () => {
    expect(
      segmentiere('HalloWelt', [
        {
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
          typ: 'kommentar',
          kommentarText: 'Anmerkung',
        },
        {
          zeichenbereichStart: 5,
          zeichenbereichEnde: 9,
          typ: 'kommentar',
          kommentarText: 'Anmerkung',
        },
      ]),
    ).toEqual([{ text: 'HalloWelt', typ: 'kommentar', kommentarText: 'Anmerkung' }]);
  });

  it('typ "kommentar": zwei angrenzende Bereiche mit UNTERSCHIEDLICHEM kommentarText bleiben getrennt', () => {
    expect(
      segmentiere('HalloWelt', [
        {
          zeichenbereichStart: 0,
          zeichenbereichEnde: 5,
          typ: 'kommentar',
          kommentarText: 'Anmerkung1',
        },
        {
          zeichenbereichStart: 5,
          zeichenbereichEnde: 9,
          typ: 'kommentar',
          kommentarText: 'Anmerkung2',
        },
      ]),
    ).toEqual([
      { text: 'Hallo', typ: 'kommentar', kommentarText: 'Anmerkung1' },
      { text: 'Welt', typ: 'kommentar', kommentarText: 'Anmerkung2' },
    ]);
  });

  it('typ "verweismarkierung" mit leerem Verweisinhalt verschmilzt nicht fälschlich mit einem echten Verweis auf denselben Bereich', () => {
    // Kein Wurf trotz fehlendem verweisinhalt (Optional Chaining in
    // zielSchluessel) – UND: da zielSchluessel('') !== zielSchluessel('§ 1 BGB'),
    // bleiben die beiden angrenzenden Bereiche getrennte Segmente.
    expect(
      segmentiere('HalloWelt', [
        { zeichenbereichStart: 0, zeichenbereichEnde: 5, typ: 'verweismarkierung' },
        {
          zeichenbereichStart: 5,
          zeichenbereichEnde: 9,
          typ: 'verweismarkierung',
          verweisinhalt: verweis('§ 1 BGB'),
        },
      ]),
    ).toEqual([
      { text: 'Hallo', typ: 'verweismarkierung', verweisinhalt: verweis('') },
      { text: 'Welt', typ: 'verweismarkierung', verweisinhalt: verweis('§ 1 BGB') },
    ]);
  });

  it('typ "unterstreichung": eine echte LÜCKE zwischen zwei Bereichen bleibt bestehen, auch wenn beide denselben Typ haben (nur Aneinandergrenzen verschmilzt, siehe Funktionskommentar)', () => {
    expect(
      segmentiere('HalloxWelt', [
        { zeichenbereichStart: 0, zeichenbereichEnde: 5, typ: 'unterstreichung' },
        { zeichenbereichStart: 6, zeichenbereichEnde: 10, typ: 'unterstreichung' },
      ]),
    ).toEqual([
      { text: 'Hallo', typ: 'unterstreichung' },
      { text: 'x', typ: null },
      { text: 'Welt', typ: 'unterstreichung' },
    ]);
  });

  it('EDGE CASE: unsortiert übergebene Bereiche werden vor der Verarbeitung nach Start-Position sortiert', () => {
    expect(
      segmentiere('HalloWelt', [
        { zeichenbereichStart: 5, zeichenbereichEnde: 9, typ: 'hervorhebung' },
        { zeichenbereichStart: 0, zeichenbereichEnde: 5, typ: 'unterstreichung' },
      ]),
    ).toEqual([
      { text: 'Hallo', typ: 'unterstreichung' },
      { text: 'Welt', typ: 'hervorhebung' },
    ]);
  });
});

it('erhält getrennte Markierungseinträge auch bei angrenzendem gleichem Typ', () => {
  const segmente = segmentiere('auf Antrag', [
    { zeichenbereichStart: 0, zeichenbereichEnde: 4, typ: 'unterstreichung', markierungIndex: 0 },
    { zeichenbereichStart: 4, zeichenbereichEnde: 10, typ: 'unterstreichung', markierungIndex: 1 },
  ]);
  expect(segmente.map(({ text, typ }) => ({ text, typ }))).toEqual([
    { text: 'auf ', typ: 'unterstreichung' },
    { text: 'Antrag', typ: 'unterstreichung' },
  ]);
});

it.each(['unterstreichung', 'hervorhebung'] as const)(
  'Nutzermarkierung %s gewinnt teilweise; getaggtes Klickziel bleibt',
  (typ) => {
    const ziel = getaggterVerweis({
      zielBezeichnung: '§ 77',
      textstelle: { pfad: { typ: 'normtext' }, zeichenbereichStart: 0, zeichenbereichEnde: 13 },
    });
    for (const [start, ende] of [
      [0, 4],
      [5, 11],
      [0, 13],
    ]) {
      const segmente = segmentiere('§ 77 Absatz 2', [
        {
          typ: 'getaggterVerweis',
          verweis: ziel,
          zeichenbereichStart: 0,
          zeichenbereichEnde: 13,
        },
        { typ, zeichenbereichStart: start!, zeichenbereichEnde: ende! },
      ]);
      expect(segmente.map((s) => s.text).join('')).toBe('§ 77 Absatz 2');
      expect(
        segmente
          .filter((s) => s.typ === typ)
          .map((s) => s.text)
          .join(''),
      ).toBe('§ 77 Absatz 2'.slice(start, ende));
      expect(
        segmente
          .filter((s) => s.typ === typ)
          .flatMap((s) => s.getaggteVerweisTeile ?? [{ text: s.text, verweis: s.getaggterVerweis }])
          .every((teil) => teil.verweis === ziel),
      ).toBe(true);
      expect(segmente.filter((s) => s.typ !== typ).every((s) => s.typ === 'getaggterVerweis')).toBe(
        true,
      );
    }
  },
);

it.each(['hervorhebung', 'kommentar'] as const)(
  'erhält einen zusammenhängenden %s-Bereich über mehrere getaggte Verweise',
  (typ) => {
    const text = 'Siehe § 1 und § 2 heute';
    const erstes = getaggterVerweis({
      zielBezeichnung: '§ 1',
      textstelle: { pfad: { typ: 'normtext' }, zeichenbereichStart: 6, zeichenbereichEnde: 9 },
    });
    const zweites = getaggterVerweis({
      zielBezeichnung: '§ 2',
      textstelle: { pfad: { typ: 'normtext' }, zeichenbereichStart: 14, zeichenbereichEnde: 17 },
    });
    const segmente = segmentiere(text, [
      { typ, zeichenbereichStart: 0, zeichenbereichEnde: text.length, markierungIndex: 2 },
      {
        typ: 'getaggterVerweis',
        zeichenbereichStart: 6,
        zeichenbereichEnde: 9,
        verweis: erstes,
      },
      {
        typ: 'getaggterVerweis',
        zeichenbereichStart: 14,
        zeichenbereichEnde: 17,
        verweis: zweites,
      },
    ]);
    expect(segmente).toHaveLength(1);
    expect(segmente[0]).toMatchObject({
      typ,
      text,
      getaggteVerweisTeile: [
        { text: 'Siehe ' },
        { text: '§ 1', verweis: erstes },
        { text: ' und ' },
        { text: '§ 2', verweis: zweites },
        { text: ' heute' },
      ],
    });
  },
);

function segmentiere(
  text: Parameters<typeof segmentiereAuszeichnungen>[0],
  bereiche: (AuszeichnungsAngaben & { markierungIndex?: number })[],
) {
  return segmentiereAuszeichnungen(
    text,
    bereiche.map(textauszeichnung),
    bereiche.some((b) => b.markierungIndex !== undefined),
  );
}
