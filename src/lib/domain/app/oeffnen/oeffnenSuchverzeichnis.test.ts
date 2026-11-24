// Suchverzeichniseinträge erlauben Treffer ohne geladene Gesetze.
import { expect, it } from 'vitest';
import { artikelkontextGesetz } from '@/test/gesetz/artikelkontext';
import { berechneTreffer, leiteSuchverzeichniseintragAb } from './oeffnen.index';

it('findet installierte Normen ohne geladene Gesetze und überspringt nicht lesbare Einträge', () => {
  const eintrag = leiteSuchverzeichniseintragAb(artikelkontextGesetz(), {
    groesse: '1',
    aenderungszeit: '2',
  });
  expect(
    berechneTreffer(
      '§ 4 EG',
      [
        eintrag,
        {
          status: 'nicht-lesbar',
          kurztitel: 'Kaputt',
          normgeber: 'de-bund',
          dateistempel: { groesse: '3', aenderungszeit: '4' },
        },
      ],
      null,
      null,
    ),
  ).toEqual([
    {
      art: 'installiert',
      gesetzesreferenz: { kurztitel: 'EG', normgeber: eintrag.normgeber },
      langtitel: eintrag.langtitel,
      norm: { xmlId: '4', bezeichnung: 'Art. 4', artikelNummer: null },
    },
  ]);
});

it('erkennt das aktive Gesetz über seine Referenz und wendet nur geladenen Artikelkontext an', () => {
  const gesetz = artikelkontextGesetz();
  const eintrag = leiteSuchverzeichniseintragAb(gesetz, { groesse: '1', aenderungszeit: '2' });
  expect(
    berechneTreffer(
      '§ 4 EG',
      [eintrag],
      structuredClone(gesetz),
      null,
      false,
      undefined,
      '246a-3',
    )[0],
  ).toMatchObject({ norm: { xmlId: '246a-4' } });
  expect(
    berechneTreffer('§ 4 EG', [eintrag], null, null, false, undefined, '246a-3')[0],
  ).toMatchObject({ norm: { xmlId: '4' } });
});
