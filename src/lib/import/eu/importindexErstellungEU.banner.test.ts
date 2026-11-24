// importindexErstellungEU.banner.test.ts
// Echte Prozessbanner und Abbruchaktion beim EU-Indexlauf, ohne Dateischreiben.
import { beforeEach, expect, it, vi } from 'vitest';
import { getSnapshot, alleBannerSchliessen } from '@/lib/banner/banner.index';
const m = vi.hoisted(() => ({ fetch: vi.fn(), speichern: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: m.fetch }));
vi.mock('@/lib/import/importindex/importindex.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  speichereImportindexAktualisierung: m.speichern,
}));
import { erstelleEuImportindex } from './importindexErstellungEU';
beforeEach(() => {
  vi.clearAllMocks();
  alleBannerSchliessen();
});
it('bietet während des Downloads Abbrechen und erhält den Bestand', async () => {
  let fertig!: (r: Response) => void;
  m.fetch.mockReturnValue(
    new Promise<Response>((resolve) => {
      fertig = resolve;
    }),
  );
  const lauf = erstelleEuImportindex();
  const banner = getSnapshot().find((b) => b.text.includes('Europarecht'))!;
  expect(banner.aktion?.label).toBe('Abbrechen');
  banner.aktion!.onClick();
  fertig(Response.json({ results: { bindings: [] } }));
  expect(await lauf).toEqual({ erfolg: false, fehler: 'Abgebrochen.' });
  expect(m.speichern).not.toHaveBeenCalled();
});
it('schließt bei Verbindungsfehler mit verständlicher Meldung ab', async () => {
  m.fetch.mockRejectedValue(new TypeError('fetch failed'));
  expect(await erstelleEuImportindex()).toMatchObject({ erfolg: false });
  const banner = getSnapshot().find((b) => b.text.includes('Keine Verbindung'))!;
  expect(banner.typ).toBe('fehler');
  expect(banner.aktion).toBeUndefined();
});
it('schließt einen plausiblen Lauf mit Erfolg und ohne Abbruchaktion ab', async () => {
  const bindings = Array.from({ length: 1000 }, (_, i) => ({
    celex: { value: `32016R${String(i + 1).padStart(4, '0')}` },
    typ: { value: 'http://publications.europa.eu/resource/authority/resource-type/REG' },
    titel: { value: 'Verordnung' },
  }));
  m.fetch.mockResolvedValue(Response.json({ results: { bindings } }));
  m.speichern.mockResolvedValue({ unveraendert: false });
  expect(await erstelleEuImportindex()).toEqual({ erfolg: true, anzahl: 1000 });
  const banner = getSnapshot().find(
    (b) => b.text === 'Importindex Europarecht erfolgreich aktualisiert.',
  )!;
  expect(banner).toBeDefined();
  expect(banner.aktion).toBeUndefined();
});
