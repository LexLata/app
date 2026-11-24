// MarkierungskonfliktFenster.helpers.test.ts
// Vollständige Gesetzesidentität bei Konfliktauswahl und Zielzeilen.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  aktualisiereAuswahl,
  auswahlSchluessel,
  formatiereInternetImportBericht,
  vergleicheZeilen,
  zeilenVonEintrag,
} from './MarkierungskonfliktFenster.helpers';
import type { AnzeigeKonfliktEintrag } from '@/lib/markierungen/markierungen.index';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

describe('vollständige Identität der Konfliktauswahl', () => {
  it('trennt gleiche Kurztitel verschiedener Normgeber und normalisiert die Schreibweise', () => {
    const bund = { art: 'datensatz' as const, gesetz: { kurztitel: 'ABC', normgeber: 'de-bund' } };
    const bw = { art: 'datensatz' as const, gesetz: { kurztitel: 'ABC', normgeber: 'de-bw' } };
    expect(auswahlSchluessel(bund)).not.toBe(auswahlSchluessel(bw));
    expect(auswahlSchluessel(bund)).toBe(
      auswahlSchluessel({ ...bund, gesetz: { kurztitel: 'abc', normgeber: 'de-bund' } }),
    );
    expect(
      aktualisiereAuswahl(bund, [{ gesetz: bw.gesetz, fehlendesGesetz: true, eintraege: [] }]),
    ).toBeNull();
  });
  it('hält namengleiche Zielkonflikte getrennt', () => {
    const eintrag: AnzeigeKonfliktEintrag = {
      schluessel: 'm',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezeichnungAnzeige: '§ 1',
      markierungstyp: 'verweismarkierung',
      zielKonflikte: [
        {
          gesetz: { kurztitel: 'ABC', normgeber: 'de-bund' },
          typ: 'zielGesetzFehlt',
          bezeichnungenAnzeige: [],
        },
        {
          gesetz: { kurztitel: 'ABC', normgeber: 'de-bw' },
          typ: 'zielGesetzFehlt',
          bezeichnungenAnzeige: [],
        },
      ],
    };
    const zeilen = zeilenVonEintrag(eintrag);
    expect(zeilen[0]!.schluessel).not.toBe(zeilen[1]!.schluessel);
    expect(zeilen[0]!.vorschauPunkt).toBe('ABC: Gesetz nicht auf dem Gerät');
  });
});

it('erhält im Importbericht die Quellen und fasst gleiche Verbindungsmeldungen zusammen', () => {
  const bund = 'Keine Verbindung zu gesetze-im-internet.de möglich. Bitte später erneut versuchen.';
  const bw = 'Keine Verbindung zu landesrecht-bw.de möglich. Bitte später erneut versuchen.';
  expect(
    formatiereInternetImportBericht([
      {
        gesetz: { kurztitel: 'BGB', normgeber: 'de-bund' },
        erfolg: false,
        kategorie: 'keineVerbindung',
        fehler: bund,
      },
      {
        gesetz: { kurztitel: 'GG', normgeber: 'de-bund' },
        erfolg: false,
        kategorie: 'keineVerbindung',
        fehler: bund,
      },
      {
        gesetz: { kurztitel: 'PolG', normgeber: 'de-bw' },
        erfolg: false,
        kategorie: 'keineVerbindung',
        fehler: bw,
      },
    ]),
  ).toEqual([bund, bw]);
});

it.each([
  'bezugstextFehltOderUnpassend',
  'pauschalerBezugFehlt',
  'pauschalerBezugUnpassend',
] as const)('trägt %s durch Zeile und erneuerte Auswahl', (typ) => {
  const eintrag: AnzeigeKonfliktEintrag = {
    schluessel: 'm',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    bezeichnungAnzeige: '§ 1',
    markierungstyp: 'kommentar',
    eigenerKonflikt: typ,
    zielKonflikte: [],
  };
  const zeile = zeilenVonEintrag(eintrag)[0]!;
  expect(zeile.zeilenart).toBe(typ);
  expect(zeile.schluessel).toBe('m:eigen');
  expect(zeile.symbol).toBe(typ === 'pauschalerBezugFehlt' ? 'kreuz' : 'fragezeichen');
  expect(zeilenVonEintrag({ ...eintrag, ausgangsTrefferzahl: 3 })[0]).toMatchObject({
    schluessel: 'm:eigen',
    zeilenart: typ === 'pauschalerBezugUnpassend' ? typ : 'ausgangsstelleNichtEindeutig',
    symbol: 'fragezeichen',
  });
  const aktualisiert = aktualisiereAuswahl(
    {
      art: 'zeile',
      gesetz: gesetzesreferenz({ kurztitel: 'Test' }),
      eintrag,
      zeile: { ...zeile, zeilenart: 'bezugstextFehltOderUnpassend' },
    },
    [{ gesetz: gesetzesreferenz({ kurztitel: 'Test' }), eintraege: [eintrag] }],
  );
  expect(aktualisiert).toMatchObject({ art: 'zeile', zeile: { zeilenart: typ } });
  expect(zeile.erlaeuterung.length).toBeGreaterThan(0);
});

it.each(['bezugstextFehltOderUnpassend', 'pauschalerBezugFehlt'] as const)(
  'erklärt %s bei tatsächlicher Mehrdeutigkeit der Ausgangsstelle',
  (typ) => {
    const eintrag: AnzeigeKonfliktEintrag = {
      schluessel: 'm',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezeichnungAnzeige: '1',
      markierungstyp: 'kommentar',
      eigenerKonflikt: typ,
      ausgangsTrefferzahl: 2,
      zielKonflikte: [],
    };
    expect(zeilenVonEintrag(eintrag)[0]?.erlaeuterung).toContain('passen mehrere Normen');
    expect(zeilenVonEintrag(eintrag)[0]?.erlaeuterung).not.toContain('2');
    expect(
      zeilenVonEintrag({ ...eintrag, ausgangsTrefferzahl: undefined })[0]?.erlaeuterung,
    ).not.toContain('nicht eindeutig');
  },
);
it.each([undefined, 'nichtEindeutig'] as const)(
  'erklärt Zielmehrdeutigkeit nur mit tatsächlichem frischen Befund (%s)',
  (befund) => {
    const eintrag: AnzeigeKonfliktEintrag = {
      schluessel: 'm',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezeichnungAnzeige: '1',
      markierungstyp: 'verweismarkierung',
      zielKonflikte: [
        {
          gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
          typ: 'zielNormFehlt',
          bezeichnungenAnzeige: [{ bezeichnung: '§ 9', befund }],
        },
      ],
    };
    const text = zeilenVonEintrag(eintrag)[0]!.erlaeuterung;
    if (befund) expect(text).toContain('passen mehrere Normen');
    else expect(text).toBe('Die Zielnorm § 9 BGB, auf die sich der Verweis bezieht, fehlt.');
  },
);

it('verwendet für fehlende Zielnormen eine einfache eigene Erläuterung', () => {
  const eintrag: AnzeigeKonfliktEintrag = {
    schluessel: 'm',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    bezeichnungAnzeige: '§ 1',
    markierungstyp: 'verweismarkierung',
    zielKonflikte: [
      {
        gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
        typ: 'zielNormFehlt',
        bezeichnungenAnzeige: [{ bezeichnung: '§ 9' }, { bezeichnung: '§ 1' }],
      },
    ],
  };
  const zeile = zeilenVonEintrag(eintrag)[0]!;
  expect(zeile.erlaeuterung).toBe(
    'Die Zielnormen §§ 9, 1 BGB, auf die sich der Verweis bezieht, fehlen.',
  );
  expect(zeile.schluessel).toBe('m:ziel:["de-bund","bgb"]:zielNormFehlt');
});

it('verwirft die alte Datensatzauswahl, sobald das Ausgangsgesetz wieder vorhanden ist', () => {
  const gesetz = { kurztitel: 'BGB', normgeber: 'de-bund' };
  expect(aktualisiereAuswahl({ art: 'datensatz', gesetz }, [{ gesetz, eintraege: [] }])).toBeNull();
});

it('gibt zwei Zielkonflikten desselben Gesetzes verschiedene stabile Schlüssel', () => {
  const eintrag: AnzeigeKonfliktEintrag = {
    schluessel: 'm',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    bezeichnungAnzeige: '§ 1',
    markierungstyp: 'verweismarkierung',
    zielKonflikte: (['zielNormUnpassend', 'zielNormFehlt'] as const).map((typ) => ({
      gesetz: gesetzesreferenz({ kurztitel: 'GG' }),
      typ,
      bezeichnungenAnzeige: [],
    })),
  };
  const schluessel = zeilenVonEintrag(eintrag).map((z) => z.schluessel);
  expect(new Set(schluessel).size).toBe(2);
  expect(zeilenVonEintrag(eintrag).map((z) => z.schluessel)).toEqual(schluessel);
});

describe('getrennte Konfliktzeilen und Reihenfolge', () => {
  const gesetz = { kurztitel: 'GG', normgeber: 'de-bund' };
  const eintrag: AnzeigeKonfliktEintrag = {
    schluessel: 'verweis',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    bezeichnungAnzeige: '§ 1',
    markierungstyp: 'verweismarkierung',
    zielKonflikte: [
      {
        gesetz,
        typ: 'zielNormFehlt',
        bezeichnungenAnzeige: [
          { bezeichnung: '999', befund: 'fehlt' },
          { bezeichnung: '5', befund: 'nichtEindeutig' },
        ],
      },
      {
        gesetz,
        typ: 'zielNormUnpassend',
        bezeichnungenAnzeige: [{ bezeichnung: '10', befund: 'unpassend' }],
      },
    ],
  };
  it('trennt Art. 10, 5 und 999 mit stabilen Schlüsseln und Symbolen', () => {
    const zeilen = zeilenVonEintrag(eintrag);
    expect(zeilen.map((z) => z.zeilenart)).toEqual([
      'zielNormUnpassend',
      'zielNormNichtEindeutig',
      'zielNormFehlt',
    ]);
    expect(zeilen.map((z) => z.symbol)).toEqual(['pfeil', 'pfeil', 'kreuz']);
    expect(zeilen.map((z) => z.verweisziele.map((n) => n.bezeichnung))).toEqual([
      ['10'],
      ['5'],
      ['999'],
    ]);
    expect(new Set(zeilen.map((z) => z.schluessel)).size).toBe(3);
    expect(zeilenVonEintrag(structuredClone(eintrag))).toEqual(zeilen);
  });
  it('ordnet unabhängig von der Eingabereihenfolge total und deterministisch', () => {
    const zeilen = zeilenVonEintrag({
      ...eintrag,
      eigenerKonflikt: 'bezugstextFehltOderUnpassend',
      zielKonflikte: ['ZPO', 'ABC', 'GG'].flatMap((kurztitel) =>
        ['de-bund', 'de-bw'].flatMap((normgeber) =>
          eintrag.zielKonflikte.map((z) => ({ ...z, gesetz: { kurztitel, normgeber } })),
        ),
      ),
    });
    fc.assert(
      fc.property(
        fc.shuffledSubarray(zeilen, { minLength: zeilen.length, maxLength: zeilen.length }),
        (permutation) => {
          expect([...permutation].sort(vergleicheZeilen)).toEqual(zeilen);
          for (const a of permutation)
            for (const b of permutation) {
              expect(Math.sign(vergleicheZeilen(a, b)) + Math.sign(vergleicheZeilen(b, a))).toBe(0);
              expect(vergleicheZeilen(a, a)).toBe(0);
              if (a.schluessel !== b.schluessel) expect(vergleicheZeilen(a, b)).not.toBe(0);
              for (const c of permutation) {
                if (vergleicheZeilen(a, b) <= 0 && vergleicheZeilen(b, c) <= 0)
                  expect(vergleicheZeilen(a, c)).toBeLessThanOrEqual(0);
              }
            }
        },
      ),
    );
  });
  it.each([
    ['zielNormUnpassend', 'zielNormNichtEindeutig'],
    ['zielNormFehlt', 'zielNormNichtEindeutig'],
    ['zielGesetzFehlt', 'zielNormUnpassend'],
  ] as const)('wählt nach Wegfall von %s die Zeile %s', (alt, erwartet) => {
    const vorher = zeilenVonEintrag({
      ...eintrag,
      zielKonflikte: [{ gesetz, typ: alt, bezeichnungenAnzeige: [] }],
    })[0]!;
    const neu = {
      ...eintrag,
      zielKonflikte: eintrag.zielKonflikte
        .map((z) => ({
          ...z,
          bezeichnungenAnzeige: z.bezeichnungenAnzeige.filter(
            (n) => alt !== 'zielNormFehlt' || n.befund !== 'fehlt',
          ),
        }))
        .filter((z) => z.typ !== alt || alt === 'zielNormFehlt'),
    };
    expect(
      aktualisiereAuswahl({ art: 'zeile', gesetz, eintrag, zeile: vorher }, [
        { gesetz, eintraege: [neu] },
      ]),
    ).toMatchObject({ zeile: { zeilenart: erwartet } });
  });
  it('entfernt die Auswahl, wenn der Verweis keine Konfliktzeile mehr hat', () => {
    const zeile = zeilenVonEintrag(eintrag)[0]!;
    expect(
      aktualisiereAuswahl({ art: 'zeile', gesetz, eintrag, zeile }, [
        { gesetz, eintraege: [{ ...eintrag, zielKonflikte: [] }] },
      ]),
    ).toBeNull();
  });
  it('wählt niemals einen anderen Verweis', () => {
    const zeile = zeilenVonEintrag(eintrag)[0]!;
    expect(
      aktualisiereAuswahl({ art: 'zeile', gesetz, eintrag, zeile }, [
        { gesetz, eintraege: [{ ...eintrag, schluessel: 'anderer' }] },
      ]),
    ).toBeNull();
  });
});

it('ordnet Ausgangsstelle und Zielgesetze nach Kurztitel und Normgeber; ohne Livedaten je Typ eine Zeile', () => {
  const eintrag: AnzeigeKonfliktEintrag = {
    schluessel: 'm',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    bezeichnungAnzeige: '§ 1',
    markierungstyp: 'verweismarkierung',
    eigenerKonflikt: 'pauschalerBezugFehlt',
    zielKonflikte: [
      {
        gesetz: { kurztitel: 'ZPO', normgeber: 'de-bund' },
        typ: 'zielGesetzFehlt',
        bezeichnungenAnzeige: [],
      },
      {
        gesetz: { kurztitel: 'ABC', normgeber: 'de-bw' },
        typ: 'zielNormFehlt',
        bezeichnungenAnzeige: [],
      },
      {
        gesetz: { kurztitel: 'ABC', normgeber: 'unbekannt' },
        typ: 'zielNormFehlt',
        bezeichnungenAnzeige: [],
      },
      {
        gesetz: { kurztitel: 'ABC', normgeber: 'de-bund' },
        typ: 'zielNormUnpassend',
        bezeichnungenAnzeige: [],
      },
    ],
  };
  const zeilen = zeilenVonEintrag(eintrag);
  expect(
    zeilen.map((z) => [z.zeilenart, z.zielgesetz?.kurztitel, z.zielgesetz?.normgeber]),
  ).toEqual([
    ['pauschalerBezugFehlt', undefined, undefined],
    ['zielNormUnpassend', 'ABC', 'de-bund'],
    ['zielNormFehlt', 'ABC', 'de-bw'],
    ['zielNormFehlt', 'ABC', 'unbekannt'],
    ['zielGesetzFehlt', 'ZPO', 'de-bund'],
  ]);
  expect(zeilen.every((z) => z.verweisziele.length === 0)).toBe(true);
  expect(zeilen.at(-1)?.symbol).toBe('kreuz');
});
