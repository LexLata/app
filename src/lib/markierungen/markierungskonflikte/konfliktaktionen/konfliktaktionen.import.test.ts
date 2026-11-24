// konfliktaktionen.import.test.ts
// Zwei Importdurchgänge bewahren Zielreferenzen und prüfen nur tatsächlich erfolgreiche Ziele.
import { beforeEach, expect, it, vi } from 'vitest';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
const mocks = vi.hoisted(() => ({ importieren: vi.fn(), pruefen: vi.fn(), konflikte: vi.fn() }));
vi.mock('@/lib/import/import.index', () => ({ importiereGesetzesreferenzen: mocks.importieren }));
vi.mock(
  '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.selektiv',
  () => ({
    pruefeMarkierungenSelektiv: mocks.pruefen,
    pruefeEineMarkierungSelektiv: vi.fn(),
  }),
);
vi.mock(
  '@/lib/markierungen/markierungskonflikte/konfliktspeicher/markierungskonflikteSpeicher.pruefkette',
  () => ({ reiheInPruefungsKetteEin: vi.fn() }),
);
vi.mock('@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige', () => ({
  ladeMarkierungskonflikteFuerAnzeige: mocks.konflikte,
  verifiziereBekannteKonflikte: vi.fn(),
}));
import { importFehlenderNormen } from './konfliktaktionen.import';
const bund = { kurztitel: 'TestG', normgeber: 'de-bund' };
const bw = { kurztitel: 'TestG', normgeber: 'de-bw' };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.konflikte.mockResolvedValue({ pruefstatus: 'aktuell', gesetze: [] });
  mocks.pruefen.mockResolvedValue(undefined);
  mocks.importieren.mockImplementation(async (liste: Gesetzesreferenz[], fortschritt) => {
    const ergebnisse = liste.map((referenz) => ({
      referenz,
      ergebnis: { art: 'erfolg', gesetz: referenz },
    }));
    for (const { referenz, ergebnis } of ergebnisse) fortschritt(referenz, ergebnis);
    return ergebnisse;
  });
});
it('importiert namengleiche Gesetze getrennt und prüft die erfolgreichen vollständigen Referenzen gemeinsam', async () => {
  const fortschritt = vi.fn();
  expect(await importFehlenderNormen([bund, bw], fortschritt)).toEqual([
    { gesetz: bund, erfolg: true },
    { gesetz: bw, erfolg: true },
  ]);
  expect(mocks.importieren).toHaveBeenCalledExactlyOnceWith([bund, bw], expect.any(Function));
  expect(mocks.pruefen).toHaveBeenCalledExactlyOnceWith([bund, bw]);
  expect(fortschritt).toHaveBeenCalledTimes(2);
});
it('versucht im zweiten Durchgang nur neue vollständige Referenzen, auch nach einem Fehler', async () => {
  mocks.importieren.mockImplementationOnce(async (_liste, fortschritt) => {
    fortschritt(bund, { art: 'fehler', fehler: { grund: 'keineVerbindung', meldung: 'Offline' } });
    return [];
  });
  mocks.konflikte.mockResolvedValue({
    pruefstatus: 'aktuell',
    gesetze: [
      {
        gesetz: { kurztitel: 'testg', normgeber: 'de-bund' },
        fehlendesGesetz: true,
        eintraege: [],
      },
      { gesetz: bw, fehlendesGesetz: true, eintraege: [] },
    ],
  });
  const ergebnisse = await importFehlenderNormen([bund]);
  expect(mocks.importieren).toHaveBeenNthCalledWith(2, [bw], expect.any(Function));
  expect(ergebnisse).toEqual([
    { gesetz: bund, erfolg: false, fehler: 'Offline', kategorie: 'keineVerbindung' },
    { gesetz: bw, erfolg: true },
  ]);
  expect(mocks.pruefen).toHaveBeenCalledExactlyOnceWith([bw]);
});
it('meldet ein falsches Erfolgsergebnis nicht als Zielerfolg und prüft es nicht', async () => {
  mocks.importieren.mockImplementation(async (_liste, fortschritt) => {
    fortschritt(bw, { art: 'erfolg', gesetz: bund });
    return [];
  });
  expect(await importFehlenderNormen([bw])).toEqual([
    {
      gesetz: bw,
      erfolg: false,
      fehler: 'Das angeforderte Gesetz konnte nicht importiert werden.',
      kategorie: 'sonstiger',
    },
  ]);
  expect(mocks.pruefen).not.toHaveBeenCalled();
});
it('reicht einen Importabbruch durch und startet weder Prüfung noch zweiten Durchgang', async () => {
  const abbruch = new Error('Import abgebrochen');
  mocks.importieren.mockRejectedValueOnce(abbruch);
  await expect(importFehlenderNormen([bund])).rejects.toBe(abbruch);
  expect(mocks.pruefen).not.toHaveBeenCalled();
  expect(mocks.konflikte).not.toHaveBeenCalled();
  expect(mocks.importieren).toHaveBeenCalledOnce();
});
