import { io } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { erfolgreicherSuchTestImport } from '@/test/suchverzeichnis/suchverzeichnisSuchdaten';
import { suchtrefferKopfangaben } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// useOeffnenAuswahl.test.ts
// Die Suchauswahl erhält Normgeber und Importziel über die Quellengruppe hinaus.
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ importieren: vi.fn() }));
vi.mock('react', () => ({ useCallback: (callback: unknown) => callback }));
vi.mock('@/lib/import/import.index', () => ({ importiereGesetze: mocks.importieren }));
import { useOeffnenAuswahl } from './useOeffnenAuswahl';
import { parseSuchanfrage } from '@/lib/domain/app/oeffnen/oeffnen.index';
beforeEach(() => {
  io.invoke.mockImplementation(async (name: string) => {
    if (name === 'gesetz_dateistempel_lesen')
      return [...io.dateien]
        .filter(([pfad]) => pfad.startsWith('gesetze/') && pfad.endsWith('.xml'))
        .map(([pfad, xml]) => ({
          name: pfad.slice(8),
          dateistempel: { groesse: String(xml.length), aenderungszeit: '1' },
        }));
    throw new Error(`Unerwarteter nativer Aufruf: ${name}`);
  });
});
it.each([
  ['EMRK', 'EMRK_europarat.xml', 'europarat'],
  ['Rom I', '32008R0593', 'eu'],
])(
  'importiert %s aus der Suchquelle eu unter dem tatsächlichen Normgeber',
  async (kurztitel, abrufkennung, normgeber) => {
    mocks.importieren
      .mockReset()
      .mockResolvedValue({ erfolgreiche: [{ kurztitel, normgeber }], fehlgeschlagene: [] });
    const ergebnis = await useOeffnenAuswahl()(
      {
        art: 'index',
        quelle: 'eu',
        eintrag: { kurztitel, abrufkennung, normgeber, langtitel: 'Titel' },
      },
      parseSuchanfrage(kurztitel),
    );
    expect(mocks.importieren).toHaveBeenCalledExactlyOnceWith(
      [{ kurztitel, abrufkennung }],
      normgeber,
      undefined,
      expect.any(Function),
    );
    expect(ergebnis.gesetz).toMatchObject({ kurztitel, normgeber });
  },
);

import { gesetzDarstellung, normaleNorm } from '@/test/gesetz/gesetzFabriken';
it.each(['index', 'installiert'] as const)(
  'wählt den %s-Treffer unter dem Kurztitel und löst die Norm vor einer mehrwortigen Alternative auf',
  async (art) => {
    const gesetz = gesetzDarstellung({
      kurztitel: 'AI Act',
      normgeber: 'eu',
      elemente: [{ typ: 'norm', data: normaleNorm({ xmlId: 'art6', bezeichnung: 'Art. 6' }) }],
    });
    io.dateien.clear();
    mocks.importieren
      .mockReset()
      .mockImplementation(async () => erfolgreicherSuchTestImport(gesetz));
    const treffer =
      art === 'index'
        ? {
            art,
            quelle: 'eu' as const,
            eintrag: {
              kurztitel: 'AI Act',
              langtitel: '',
              normgeber: 'eu',
              abrufkennung: '32024R1689',
            },
            gefundenUeber: '2. Digital Services Act',
          }
        : {
            art,
            ...suchtrefferKopfangaben(gesetz),
            gefundenUeber: '2. Digital Services Act',
            norm: { xmlId: 'art6', bezeichnung: 'Art. 6', artikelNummer: null },
          };
    const ergebnis = await useOeffnenAuswahl()(
      treffer,
      parseSuchanfrage('6 2. Digital Services Act'),
    );
    expect(ergebnis).toEqual(
      art === 'index'
        ? { gesetz, xmlId: 'art6' }
        : {
            gesetzesreferenz: { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber },
            xmlId: 'art6',
          },
    );
    if (art === 'index')
      expect(mocks.importieren).toHaveBeenCalledExactlyOnceWith(
        [{ kurztitel: 'AI Act', abrufkennung: '32024R1689' }],
        'eu',
        undefined,
        expect.any(Function),
      );
    else expect(mocks.importieren).not.toHaveBeenCalled();
  },
);
