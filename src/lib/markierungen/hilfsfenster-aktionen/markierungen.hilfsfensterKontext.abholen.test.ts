// Vollständige gültige Übergaben und defekte verschachtelte Felder an der JSON-Grenze.
import { describe, expect, it, vi } from 'vitest';
import { liesTabUebertragung } from '@/lib/plattform/fensterUebergabe';
import {
  liesVerweismarkierungKontext,
  liesKommentarKontext,
} from './markierungen.hilfsfensterKontext.abholen';
import type { TabUebertragung } from '@/lib/domain/appTypes';
const gesetz = { normgeber: 'de-bund', kurztitel: 'BGB' };
const tab = {
  transport: { kennung: 't', quellLabel: 'main', gueltigBis: 123 },
  gesetzesreferenz: gesetz,
  initialNorm: 'n',
  scrollPosition: { index: 1, offset: -2 },
  einklappZustand: { ueberschriftenXmlId: ['u'], normenXmlId: ['n'], aktivesElementXmlId: null },
  verlauf: { eintraege: [{ gesetzesreferenz: gesetz, xmlId: 'n' }], position: 0 },
} satisfies TabUebertragung;
const textstelle = {
  pfad: {
    typ: 'normtext',
    absatz: '1',
    absatzWiederholung: 1,
    unterabsatz: '2',
    satz: 1,
    eintraege: [{ ebene: 'nummer', bezeichnung: '1', wiederholung: 1 }],
    satzInEintrag: 1,
  },
  zeichenbereichStart: 0,
  zeichenbereichEnde: 2,
} as const;
const stand = { titel: 'Titel', textlaenge: 2 };
const norm = {
  id: 'n',
  xmlId: 'n',
  bezeichnung: '§ 1',
  titel: 'Titel',
  art: 'gliederungsartikel',
  gliederungsEbene: 1,
  ueberschriftartig: true,
  vorgaenger: 'a',
  status: 'weggefallen',
  fussnoten: 'f',
  titelIstNichtamtlich: true,
  getaggteVerweise: [{ textstelle, bezugstext: 'ab', zielBezeichnung: '1', zielgesetz: gesetz }],
  absaetze: [
    {
      id: 'a',
      bezeichnung: '1',
      zwischenueberschrift: true,
      saetze: [
        {
          id: 's',
          zahl: 1,
          text: 'ab',
          fortsetzung: 'c',
          eintraege: [
            {
              id: 'e',
              bezeichnung: 'a',
              ebene: 'litera',
              text: 'ab',
              fortsetzung: 'd',
              untereintraege: [],
              saetze: [{ id: 's2', text: 'a', eintraege: [] }],
            },
          ],
        },
      ],
      unterabsaetze: [{ id: 'u', bezeichnung: '2', saetze: [] }],
    },
  ],
} as const;
const inhalt = {
  verweistext: 'ab',
  verweisziele: [
    {
      typ: 'zielnorm',
      gesetz,
      bezeichnung: '§ 1',

      verweistextZeichenbereich: [0, 1],
      elementstand: stand,
    },
    {
      typ: 'zielnormOhneElementstand',
      gesetz,
      bezeichnung: '2',

      verweistextZeichenbereich: [1, 2],
    },
    { typ: 'ganzesGesetz', gesetz, verweistextZeichenbereich: [0, 2] },
  ],
};
// JSON-Kopie bildet die tatsächlich übertragenen veränderlichen Arrays ab.
const basis = {
  openerLabel: 'main',
  gesetz,
  ausgangsstelle: { typ: 'norm', bezeichnung: '§ 1' },
  ausgangsBezeichnung: '§ 1',
  auswahl: { textstelle, bezugstext: 'ab' },
  aktuellesElement: norm,
};
const kommentar = {
  ...basis,
  bearbeiten: {
    textbezug: { textstelle, bezugstext: 'ab' },
    kommentarText: 'c',
    vorher: { kommentarText: 'a', elementstand: stand },
  },
};
const verweis = {
  ...basis,
  bearbeiten: {
    textbezug: { textstelle, bezugstext: 'ab' },
    zitatText: 'ab',
    vorher: { verweisinhalt: inhalt, elementstand: stand },
  },
};
function pfade(w: unknown, prefix: (string | number)[] = []): (string | number)[][] {
  if (typeof w !== 'object' || w === null) return [prefix];
  return [
    prefix,
    ...Object.entries(w).flatMap(([k, v]) =>
      pfade(v, [...prefix, Array.isArray(w) ? Number(k) : k]),
    ),
  ];
}
function ersetze(w: unknown, pfad: (string | number)[], wert: unknown): unknown {
  if (!pfad.length) return wert;
  if (Array.isArray(w))
    return w.map((v, i) => (i === pfad[0] ? ersetze(v, pfad.slice(1), wert) : v));
  if (typeof w === 'object' && w !== null)
    return Object.fromEntries(
      Object.entries(w).map(([k, v]) => [k, k === pfad[0] ? ersetze(v, pfad.slice(1), wert) : v]),
    );
  return w;
}
describe.each([
  ['Tab', liesTabUebertragung, tab],
  ['Kommentar', liesKommentarKontext, kommentar],
  ['Verweis', liesVerweismarkierungKontext, verweis],
] as const)('%s-Übergabe', (_, lesen, daten) => {
  it('erkennt vollständige gültige Eingaben', () =>
    expect(lesen(JSON.stringify(daten))).toEqual(daten));
  it.each(['', '{', 'null', '[]', '{"gesetzesreferenz": 1}'])(
    'verwirft defektes JSON %s',
    (json) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(lesen(json)).toBeNull();
    },
  );
  it('prüft jeden verschachtelten Feldtyp', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const pfad of pfade(daten)) {
      const defekt = ersetze(daten, pfad, pfad.at(-1) === 'aktivesElementXmlId' ? {} : null);
      expect(lesen(JSON.stringify(defekt)), pfad.join('.')).toBeNull();
    }
  });
});
it('akzeptiert einen Leertab', () => expect(liesTabUebertragung('{}')).toEqual({}));
it('akzeptiert Erwägungsgrund und Überschrift', () => {
  expect(
    liesKommentarKontext(
      JSON.stringify({
        ...basis,
        ausgangsstelle: { typ: 'erwaegungsgrund', bezeichnung: 'E1' },
        aktuellesElement: {
          ...norm,
          art: 'erwaegungsgrund',
          gliederungsEbene: undefined,
          ueberschriftartig: undefined,
        },
      }),
    ),
  ).not.toBeNull();
  expect(
    liesKommentarKontext(
      JSON.stringify({
        ...basis,
        ausgangsstelle: { typ: 'ueberschrift', gliederungskennzahl: '001' },
        aktuellesElement: {
          id: 'u',
          xmlId: 'u',
          bezeichnung: 'Teil',
          titel: 'Titel',
          ebene: 1,
          gliederungskennzahl: '001',
        },
      }),
    ),
  ).not.toBeNull();
});

it('verwirft fehlende Pflichtfelder einschließlich verschachtelter Fachfälle', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(
    liesTabUebertragung(JSON.stringify({ ...tab, gesetzesreferenz: { kurztitel: 'BGB' } })),
  ).toBeNull();
  expect(liesKommentarKontext(JSON.stringify({ ...kommentar, openerLabel: undefined }))).toBeNull();
  expect(
    liesKommentarKontext(
      JSON.stringify({ ...kommentar, bearbeiten: { kommentarText: 'a', vorher: {} } }),
    ),
  ).toBeNull();
  expect(
    liesVerweismarkierungKontext(
      JSON.stringify({ ...verweis, bearbeiten: { zitatText: 'a', vorher: {} } }),
    ),
  ).toBeNull();
  expect(
    liesKommentarKontext(
      JSON.stringify({ ...basis, aktuellesElement: { ...norm, absaetze: [{ id: 'a' }] } }),
    ),
  ).toBeNull();
});
it.each([
  { typ: 'bereich', bereich: 'amtlicherTitel' },
  { typ: 'bereich', bereich: 'nichtamtlicherTitel' },
  { typ: 'bereich', bereich: 'bezeichnung' },
  { typ: 'normtext' },
  { typ: 'normtext', eintraege: [{ ebene: 'litera', bezeichnung: 'a' }] },
])('erkennt gültigen Textpfad %o', (pfad) => {
  const daten = {
    ...basis,
    auswahl: {
      textstelle: { pfad, zeichenbereichStart: 0, zeichenbereichEnde: 2 },
      bezugstext: 'ab',
    },
    aktuellesElement: {
      ...norm,
      art: 'normal',
      gliederungsEbene: undefined,
      ueberschriftartig: undefined,
    },
  };
  expect(liesKommentarKontext(JSON.stringify(daten))).not.toBeNull();
});
it.each([
  { typ: 'bereich', bereich: 'bezeichnung', satz: 1 },
  { typ: 'normtext', bereich: 'bezeichnung' },
  { typ: 'normtext', satzInEintrag: 1 },
  { typ: 'normtext', eintraege: [] },
])('verwirft unzulässigen Textpfad %o', (pfad) => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(
    liesKommentarKontext(
      JSON.stringify({
        ...basis,
        auswahl: {
          textstelle: { pfad, zeichenbereichStart: 0, zeichenbereichEnde: 2 },
          bezugstext: 'ab',
        },
      }),
    ),
  ).toBeNull();
});
it.each([
  {
    typ: 'zielnorm',
    bezeichnung: '§ 1',
    praefix: ['§'],
    verweistextZeichenbereich: [0, 1],
    elementstand: stand,
  },
  {
    typ: 'zielnormOhneElementstand',
    bezeichnung: '1',
    verweistextZeichenbereich: [0, 1],
    elementstand: stand,
  },
  { typ: 'ganzesGesetz', gesetz, bezeichnung: '1', verweistextZeichenbereich: [0, 1] },
])('verwirft unzulässiges Verweisziel %o', (ziel) => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(
    liesVerweismarkierungKontext(
      JSON.stringify({
        ...verweis,
        bearbeiten: {
          ...verweis.bearbeiten,
          vorher: { verweisinhalt: { verweistext: 'a', verweisziele: [ziel] } },
        },
      }),
    ),
  ).toBeNull();
});
it('erhält einen Verweis ohne Verweisziele und eine Zielnorm ohne bekannten Präfix', () => {
  for (const verweisziele of [
    [],
    [{ typ: 'zielnormOhneElementstand', bezeichnung: '1', verweistextZeichenbereich: [0, 1] }],
  ]) {
    expect(
      liesVerweismarkierungKontext(
        JSON.stringify({
          ...verweis,
          bearbeiten: {
            ...verweis.bearbeiten,
            vorher: { verweisinhalt: { verweistext: 'a', verweisziele } },
          },
        }),
      ),
    ).not.toBeNull();
  }
});
