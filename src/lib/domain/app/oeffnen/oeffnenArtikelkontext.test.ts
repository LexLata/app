import {
  alsSuchverzeichniseintraege,
  alsSuchverzeichniseintrag,
} from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// Artikelkontext über die öffentliche Trefferberechnung, einschließlich Rückfall.
import { expect, it } from 'vitest';
import { artikelkontextGesetz } from '@/test/gesetz/artikelkontext';
import { gesetzDarstellung, gliederungsartikel, normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { berechneTreffer, loeseNormzielAuf, parseSuchanfrage } from './oeffnen.index';
it.each([
  ['§ 4', '246a-3', '246a-4', '246a'],
  ['§ 4', 'unterhalb', '246a-4', '246a'],
  ['§ 4', '246a', '246a-4', '246a'],
  ['§ 4', 'gleichrangig', '4', null],
  ['§ 4', 'hoeherrangig', '4', null],
  ['§ 4', '229', '4', null],
  ['4', '246a-3', '4', null],
  ['Art. 4', '246a-3', '4', null],
  ['§ 4 EG', '246a-3', '246a-4', '246a'],
])('findet %s mit aktivem Element %s', (text, id, xmlId, artikelNummer) => {
  const eg = artikelkontextGesetz();
  expect(
    berechneTreffer(text, alsSuchverzeichniseintraege([eg]), eg, null, false, new Map(), id)[0],
  ).toMatchObject({
    norm: { xmlId, artikelNummer },
  });
});
it('wendet den Kontext nicht auf ein anderes oder nur teilweise genanntes Gesetz an', () => {
  const eg = artikelkontextGesetz();
  const g = gesetzDarstellung({
    elemente: [{ typ: 'norm', data: normaleNorm({ bezeichnung: '§ 9' }) }],
  });
  expect(
    berechneTreffer(
      '§ 4',
      alsSuchverzeichniseintraege([eg, g]),
      g,
      null,
      false,
      undefined,
      '246a-3',
    ),
  ).toEqual([]);
  expect(
    berechneTreffer(
      '§ 4 EG',
      alsSuchverzeichniseintraege([eg, g]),
      g,
      null,
      false,
      undefined,
      '246a-3',
    )[0],
  ).toMatchObject({
    norm: { xmlId: '4', artikelNummer: null },
  });
  expect(
    berechneTreffer(
      '§ 4 Einführung',
      alsSuchverzeichniseintraege([eg]),
      eg,
      null,
      false,
      undefined,
      '246a-3',
    ),
  ).toEqual([]);
});
it('behält ohne Kontext das Einzelziel für Öffnen-Link und mobile Suche', () => {
  const eg = artikelkontextGesetz();
  expect(berechneTreffer('§ 4 EG', alsSuchverzeichniseintraege([eg]), null, null)[0]).toMatchObject(
    {
      norm: { xmlId: '4', artikelNummer: null },
    },
  );
  expect(loeseNormzielAuf(parseSuchanfrage('§ 4 EG'), alsSuchverzeichniseintrag(eg))?.xmlId).toBe(
    '4',
  );
});

// Ähnliche XML-IDs dürfen eine fehlende ganze Normzahl nicht ersetzen.
it.each([
  ['40', true],
  ['4a', true],
  ['40', false],
  ['4a', false],
] as const)(
  'löst fehlenden § 4 neben § %s mit Art. 4 = %s durch den Rückfall auf',
  (nummer, mitArtikel) => {
    const basis = artikelkontextGesetz();
    const eg = {
      ...basis,
      elemente: basis.elemente.map((el) =>
        el.data.xmlId === '246a-4'
          ? {
              typ: 'norm' as const,
              data: normaleNorm({
                id: `246a-${nummer}`,
                xmlId: `246a-${nummer}`,
                bezeichnung: `§ ${nummer}`,
              }),
            }
          : el,
      ),
    };
    const gesetz = mitArtikel
      ? eg
      : { ...eg, elemente: eg.elemente.filter((el) => el.data.xmlId !== '4') };
    const treffer = berechneTreffer(
      '§ 4',
      alsSuchverzeichniseintraege([gesetz]),
      gesetz,
      null,
      false,
      undefined,
      '246a-3',
    );
    if (mitArtikel) expect(treffer[0]).toMatchObject({ norm: { xmlId: '4', artikelNummer: null } });
    else expect(treffer).toEqual([]);
  },
);

it.each([
  ['4a', '4a', '246a-4a'],
  ['4', '3 bis 6', '246a-3bis6'],
])('findet die ganze Normzahl %s im Artikel auch als Sammelnorm', (suche, nummer, xmlId) => {
  const basis = artikelkontextGesetz();
  const eg = {
    ...basis,
    elemente: basis.elemente.map((el) =>
      el.data.xmlId === '246a-4'
        ? {
            typ: 'norm' as const,
            data: normaleNorm({
              id: xmlId,
              xmlId,
              bezeichnung: `${nummer.includes('bis') ? '§§' : '§'} ${nummer}`,
            }),
          }
        : el,
    ),
  };
  expect(
    berechneTreffer(
      `§ ${suche}`,
      alsSuchverzeichniseintraege([eg]),
      eg,
      null,
      false,
      undefined,
      '246a-3',
    )[0],
  ).toMatchObject({
    norm: { xmlId, artikelNummer: '246a' },
  });
});

it('begrenzt den Kontext auf den ganzen Artikel und erhält die bisherige Zwei-Zahlen-Auflösung', () => {
  const basis = artikelkontextGesetz();
  const eg = {
    ...basis,
    elemente: basis.elemente
      .filter((el) => el.data.xmlId !== '246a-4')
      .map((el) => {
        if (el.data.xmlId === '246a')
          return {
            typ: 'norm' as const,
            data: gliederungsartikel({
              id: '246',
              xmlId: '246',
              bezeichnung: 'Art. 246',
              gliederungsEbene: 2,
              ueberschriftartig: true,
            }),
          };
        if (el.data.xmlId === '246a-3')
          return {
            typ: 'norm' as const,
            data: normaleNorm({ id: '246-3', xmlId: '246-3', bezeichnung: '§ 3' }),
          };
        return el;
      })
      .concat([
        {
          typ: 'norm' as const,
          data: gliederungsartikel({
            id: '246a',
            xmlId: '246a',
            bezeichnung: 'Art. 246a',
            gliederungsEbene: 2,
          }),
        },
        {
          typ: 'norm' as const,
          data: normaleNorm({ id: '246a-4', xmlId: '246a-4', bezeichnung: '§ 4' }),
        },
      ]),
  };
  expect(
    berechneTreffer(
      '§ 4',
      alsSuchverzeichniseintraege([eg]),
      eg,
      null,
      false,
      undefined,
      '246-3',
    )[0],
  ).toMatchObject({
    norm: { xmlId: '4' },
  });
  const mitPraefix = {
    ...basis,
    elemente: basis.elemente.map((el) =>
      el.data.xmlId === '246a-4'
        ? {
            typ: 'norm' as const,
            data: normaleNorm({ id: '246a-40', xmlId: '246a-40', bezeichnung: '§ 40' }),
          }
        : el,
    ),
  };
  expect(
    berechneTreffer('246a 4 EG', alsSuchverzeichniseintraege([mitPraefix]), mitPraefix, null)[0],
  ).toMatchObject({
    norm: { xmlId: '246a-40' },
  });
});

it.each([true, false])(
  'behandelt Anlage 3 bis 6 bei § 4 nicht als Sammelnorm (Art. 4 vorhanden: %s)',
  (mitArtikel) => {
    const basis = artikelkontextGesetz();
    const eg = {
      ...basis,
      elemente: basis.elemente
        .filter((el) => mitArtikel || el.data.xmlId !== '4')
        .map((el) =>
          el.data.xmlId === '246a-4'
            ? {
                typ: 'norm' as const,
                data: normaleNorm({
                  id: '246a-anlage',
                  xmlId: '246a-anlage',
                  bezeichnung: 'Anlage 3 bis 6',
                }),
              }
            : el,
        ),
    };
    const treffer = berechneTreffer(
      '§ 4',
      alsSuchverzeichniseintraege([eg]),
      eg,
      null,
      false,
      undefined,
      '246a-3',
    );
    if (mitArtikel) expect(treffer[0]).toMatchObject({ norm: { xmlId: '4', artikelNummer: null } });
    else expect(treffer).toEqual([]);
  },
);
