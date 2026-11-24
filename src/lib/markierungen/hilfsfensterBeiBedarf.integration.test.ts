// @vitest-environment jsdom
// Hilfsfenster greifen über den echten Bestand gezielt auf die benötigten Quellen zu.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { beforeEach, expect, it } from 'vitest';
import { ladeGesetzeskandidaten } from '@/lib/import/import.index';
import { erzeugeGeladeneGesetze } from '@/lib/gesetz-laden/gesetz-laden.index';
import { istMarkierungsAusgangsstelleZuordenbar } from '@/lib/markierungen/markierungen.index';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { setzeSuchverzeichnisTestdaten } from '@/test/suchverzeichnis/suchverzeichnisSuchdaten';
import { analysiereZitatZiele } from '@/lib/markierungen/zitat/zitat.index';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
const xml =
  '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>BGB</kurztitel><langtitel>BGB</langtitel></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><titel>Titel</titel><absatz>Text</absatz></norm></inhalt></gesetz>';
const gelesen: string[] = [];
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  gelesen.length = 0;
  io.vorLesen = (pfad) => {
    gelesen.push(pfad);
    return undefined;
  };
});
it('ermittelt Zitatkurztitel aus dem Verzeichnis ohne GesetzesXML zu lesen', async () => {
  const gesetz = parseGesetzesXML(xml);
  expect(gesetz).not.toBeNull();
  setzeSuchverzeichnisTestdaten(
    gesetz
      ? [gesetz, { ...gesetz, normgeber: 'de-sn' }, { ...gesetz, normgeber: 'unbekannt' }]
      : [],
  );
  io.dateien.set('gesetze/BGB_de-bund.xml', xml);
  gelesen.length = 0;
  const kandidaten = await ladeGesetzeskandidaten();
  expect(kandidaten).toEqual(
    expect.arrayContaining([
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      { kurztitel: 'BGB', normgeber: 'de-sn' },
      { kurztitel: 'BGB', normgeber: 'unbekannt' },
    ]),
  );
  expect(analysiereZitatZiele('§ 1 BGB', kandidaten).map((zitat) => zitat.gesetzRoh)).toEqual([
    'BGB',
  ]);
  expect(gelesen.filter((pfad) => pfad.includes('/gesetze/'))).toHaveLength(0);
});
it('prüft eine ungeladene Ausgangsstelle mit Haltegrenze null ohne fremde Gesetze', async () => {
  io.dateien.set('gesetze/BGB_de-bund.xml', xml);
  io.dateien.set('gesetze/Fremd_de-bund.xml', 'unlesbar');
  const bestand = erzeugeGeladeneGesetze({ fenstertyp: 'hilfsfenster' });
  try {
    expect(
      await istMarkierungsAusgangsstelleZuordenbar(
        {
          gesetz: { kurztitel: 'BGB', normgeber: 'de-bund' },
          openerLabel: 'haupt',
          ausgangsstelle: normAusgangsstelle('§ 1'),
        },
        bestand.ladeGesetz,
      ),
    ).toBe(true);
    expect(bestand.holeGeladenes({ kurztitel: 'BGB', normgeber: 'de-bund' })).toBeUndefined();
    expect(gelesen.some((pfad) => pfad.includes('Fremd'))).toBe(false);
  } finally {
    bestand.beenden();
  }
});
