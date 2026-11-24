import {
  alsSuchverzeichniseintraege,
  suchtrefferKopfangaben,
} from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// oeffnenNormtreffer.test.ts
// Installierte Treffer tragen das vollständig aufgelöste Navigationsziel.
import { expect, it } from 'vitest';
import { gesetzDarstellung, normaleNorm, gliederungsartikel } from '@/test/gesetz/gesetzFabriken';
import { berechneTreffer } from './oeffnen.index';

it.each([
  ['433', '§ 433'],
  ['23a', '§ 23a'],
  ['4', '§§ 3 bis 6'],
  ['433 TestG', '§ 433'],
])('trägt bei %s die aufgelöste Norm %s', (eingabe, bezeichnung) => {
  const gesetz = gesetzDarstellung({
    kurztitel: 'TestG',
    elemente: [{ typ: 'norm', data: normaleNorm({ xmlId: 'ziel', bezeichnung }) }],
  });
  expect(berechneTreffer(eingabe, alsSuchverzeichniseintraege([gesetz]), gesetz, null)).toEqual([
    {
      art: 'installiert',
      ...suchtrefferKopfangaben(gesetz),
      norm: { xmlId: 'ziel', bezeichnung, artikelNummer: null },
    },
  ]);
});

it('trägt das Ziel unter einem Gliederungsartikel', () => {
  const gesetz = gesetzDarstellung({
    kurztitel: 'EG',
    hatGliederungsartikel: true,
    elemente: [
      { typ: 'norm', data: gliederungsartikel({ xmlId: '229', bezeichnung: 'Art. 229' }) },
      { typ: 'norm', data: normaleNorm({ xmlId: '229-3', bezeichnung: '§ 3' }) },
    ],
  });
  expect(berechneTreffer('229 3', alsSuchverzeichniseintraege([gesetz]), gesetz, null)[0]).toEqual({
    art: 'installiert',
    ...suchtrefferKopfangaben(gesetz),
    norm: { xmlId: '229-3', bezeichnung: '§ 3', artikelNummer: '229' },
  });
});

it('lässt bei reiner Gesetzeseingabe und fehlendem Normpräfix das Normziel weg', () => {
  const gesetz = gesetzDarstellung({
    kurztitel: 'TestG',
    elemente: [{ typ: 'norm', data: normaleNorm({ xmlId: 'anlage', bezeichnung: 'Anlage 1' }) }],
  });
  for (const eingabe of ['TestG', '1 TestG'])
    expect(berechneTreffer(eingabe, alsSuchverzeichniseintraege([gesetz]), null, null)).toEqual([
      { art: 'installiert', ...suchtrefferKopfangaben(gesetz) },
    ]);
});
