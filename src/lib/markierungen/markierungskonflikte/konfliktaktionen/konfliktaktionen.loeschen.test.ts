// Wiederholte und gleichzeitige Löschungen per Konfliktaktion erhalten unveränderte und fehlgeschlagene Ergebnisse.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  laden: vi.fn(),
  entfernen: vi.fn(),
  pruefen: vi.fn(),
  sync: vi.fn(),
}));
vi.mock('@/lib/markierungen/eintrag/eintrag.index', () => ({
  ladeEintraege: mocks.laden,
  entferneMarkierung: mocks.entfernen,
}));
vi.mock('@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige', () => ({
  verifiziereBekannteKonflikte: mocks.pruefen,
}));
import { loescheAusgewaehlt } from './konfliktaktionen.loeschen';
const gesetz = { normgeber: 'de-bund', kurztitel: 'BGB' };
const auswahl = { art: 'markierung' as const, gesetz, schluessel: 'fehlt' };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('window', { __TAURI_INTERNALS__: { invoke: mocks.sync } });
  mocks.laden.mockResolvedValue([]);
  mocks.pruefen.mockResolvedValue([]);
  mocks.sync.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());
it.each(['nacheinander', 'gleichzeitig'])(
  'verifiziert bereits gelöschte Markierungen bei %s ausgelösten Aktionen erneut',
  async (modus) => {
    const ergebnisse =
      modus === 'gleichzeitig'
        ? await Promise.all([loescheAusgewaehlt(auswahl), loescheAusgewaehlt(auswahl)])
        : [await loescheAusgewaehlt(auswahl), await loescheAusgewaehlt(auswahl)];
    expect(ergebnisse).toEqual([false, false]);
    expect(mocks.entfernen).not.toHaveBeenCalled();
    expect(mocks.pruefen).toHaveBeenCalledTimes(2);
    expect(mocks.sync).toHaveBeenCalledTimes(2);
  },
);
it('bricht bei einem Ladefehler ohne Löschen oder falsche Synchronisierung ab und erlaubt erneuten Versuch', async () => {
  const fehler = new Error('Lesen fehlgeschlagen');
  mocks.laden.mockRejectedValueOnce(fehler);
  await expect(loescheAusgewaehlt(auswahl)).rejects.toBe(fehler);
  expect(mocks.entfernen).not.toHaveBeenCalled();
  expect(mocks.pruefen).not.toHaveBeenCalled();
  expect(mocks.sync).not.toHaveBeenCalled();
  await expect(loescheAusgewaehlt(auswahl)).resolves.toBe(false);
});
