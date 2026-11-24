// Validiert die tatsächlich an die Dateilogik übergebene Backup-Datei gegen RelaxNG.
import { afterEach, expect, it, vi } from 'vitest';
import { pruefeSchema } from '@/../scripts/automatisch/schema-hilfe';
import { meldeEinstellungenGeaendert } from '@/lib/einstellungen/einstellungenBackup';
const schreiben = vi.hoisted(() => vi.fn());
vi.mock('@/lib/persistenz/kern/kern.index', () => ({
  EINSTELLUNGEN_ORDNER: 'einstellungen',
  appDatenSchreiben: schreiben,
  appDatenLoeschen: vi.fn(),
  meldePersistenzBefund: vi.fn(),
  mitDateiSperre: async (_pfad: string, aktion: (token: string) => Promise<void>) =>
    aktion('token'),
}));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('schreibt Einstellungen mit Zeitstempel und Sonderzeichen im unveränderten Schema', async () => {
  vi.useFakeTimers();
  const werte = new Map([
    ['lexlata.farbschema', 'dunkel'],
    ['lexlata.schriftart', 'A & B < C'],
    ['lexlata.nachbereitungBeiImport', 'saetze-und-verweise'],
  ]);
  vi.stubGlobal('localStorage', { getItem: (key: string) => werte.get(key) ?? null });
  meldeEinstellungenGeaendert();
  await vi.advanceTimersByTimeAsync(1000);
  expect(schreiben).toHaveBeenCalledTimes(1);
  const aufruf = schreiben.mock.calls[0];
  if (!aufruf) throw new Error('Backup wurde nicht geschrieben');
  const [pfad, xml, token] = aufruf;
  expect([pfad, token]).toEqual(['einstellungen/einstellungen-backup.xml', 'token']);
  expect((await pruefeSchema('einstellungen', xml)).valid).toBe(true);
});
it.each(['true', 'false', 'anderer-wert'])(
  'beschränkt Seitenleisten-Tastenkürzel im Schema auf Ja/Nein: %s',
  async (wert) => {
    const xml = `<einstellungen version="1"><verarbeitungszeit>2026-11-15T00:00:00Z</verarbeitungszeit><seitenleistenTastenkuerzel>${wert}</seitenleistenTastenkuerzel></einstellungen>`;
    expect((await pruefeSchema('einstellungen', xml)).valid).toBe(wert !== 'anderer-wert');
  },
);

it.each(['true', 'false', 'anderer-wert'])(
  'beschränkt „Automatisch nach Updates suchen“ im Schema auf Ja/Nein: %s',
  async (wert) => {
    const xml = `<einstellungen version="1"><verarbeitungszeit>2026-11-22T00:00:00Z</verarbeitungszeit><appUpdatesAutomatischSuchen>${wert}</appUpdatesAutomatischSuchen></einstellungen>`;
    expect((await pruefeSchema('einstellungen', xml)).valid).toBe(wert !== 'anderer-wert');
  },
);

it('erlaubt den alten Seitenleisten-Tag nur noch als Erweiterung', async () => {
  const xml =
    '<einstellungen version="1"><verarbeitungszeit>2026-11-15T00:00:00Z</verarbeitungszeit><tastaturHinweiseAusblenden>alt</tastaturHinweiseAusblenden></einstellungen>';
  expect((await pruefeSchema('einstellungen', xml)).valid).toBe(true);
});
