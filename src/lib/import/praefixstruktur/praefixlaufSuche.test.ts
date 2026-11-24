import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// praefixlaufSuche.test.ts
// Ohne Netz vom gespeicherten Prüfergebnis über Ressourcenlesen zur Suchanzeige.
import { normaleNorm, gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { expect, it, vi } from 'vitest';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import {
  berechneTreffer,
  indexNormAnzeige,
  parseSuchanfrage,
} from '@/lib/domain/app/oeffnen/oeffnen.index';
import { fuehrePraefixlaufAus } from './praefixstruktur.index';
import { ergaenzePraefixstrukturMitDiagnose } from './praefixstrukturErgaenzung';
const datei = vi.hoisted(() => ({ xml: '' }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: async () => true,
  readTextFile: async () => datei.xml,
}));
vi.mock('@/lib/plattform/dateipfade', () => ({ ressourcenPfad: async (pfad: string) => pfad }));
it('übernimmt die bestimmte Präfixstruktur bis zur Trefferberechnung und Anzeige', async () => {
  const gesetz: GesetzDarstellung = gesetzDarstellung({
    kurztitel: 'GG',
    langtitel: '',
    hatGliederungsartikel: false,
    elemente: [
      {
        typ: 'norm',
        data: normaleNorm({ id: '1', xmlId: '1', bezeichnung: 'Art. 1', absaetze: [] }),
      },
    ],
  });
  const eintraege = ['GG', 'StGB'].map((kurztitel) => ({
    kurztitel,
    langtitel: '',
    abrufkennung: '',
  }));
  await fuehrePraefixlaufAus(
    { modus: 'praefix', normgeber: 'de-bund', anzahl: 2 },
    {
      leseDateistand: async () => ({ quellen: [], gesetzesxml: [] }),
      leseListe: async () => null,
      schreibeListe: async (xml) => {
        datei.xml = xml;
      },
      ladeKandidaten: async () => eintraege,
      ladeGesetz: async (_, eintrag) => ({
        netz: true,
        gesetz:
          eintrag.kurztitel === 'GG'
            ? gesetz
            : {
                ...gesetz,

                kurztitel: 'StGB',
                elemente: [
                  {
                    typ: 'norm',
                    data: normaleNorm({ id: '10', xmlId: '10', bezeichnung: '§ 10', absaetze: [] }),
                  },
                ],
              },
      }),
      pruefeErreichbarkeit: async () => null,
      ausgabe: () => {},
      pause: async () => {},
      zufall: () => 0,
    },
  );
  const gelesen = (await ergaenzePraefixstrukturMitDiagnose('de-bund', eintraege)).eintraege;
  expect(gelesen.map(({ kurztitel, praefixstruktur }) => [kurztitel, praefixstruktur])).toEqual([
    ['GG', 'artikel'],
    ['StGB', 'paragraph'],
  ]);
  for (const [eingabe, kurztitel, normLabel] of [
    ['1 GG', 'GG', 'Art. 1'],
    ['10 5 StGB', 'StGB', '§ 10'],
  ] as const) {
    const treffer = berechneTreffer(eingabe, alsSuchverzeichniseintraege([]), null, {
      'de-bund': gelesen,
      'de-bw': [],
      eu: [],
    });
    expect(treffer).toHaveLength(1);
    const gefunden = treffer[0];
    if (gefunden?.art !== 'index') throw new Error('Importangebot erwartet');
    expect(gefunden.eintrag.kurztitel).toBe(kurztitel);
    expect(indexNormAnzeige(parseSuchanfrage(eingabe), gefunden.eintrag.praefixstruktur)).toEqual({
      normLabel,
      artikelNummer: null,
    });
  }
});
