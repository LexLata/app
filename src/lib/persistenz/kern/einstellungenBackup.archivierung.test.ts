// Echte Archivierungslogik prüft auch nach zwischenzeitlichem Austausch erneut.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({
  lesen: vi.fn(),
  existiert: vi.fn(),
  invoke: vi.fn(),
  melden: vi.fn(),
}));
vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  appDatenLesen: io.lesen,
  appDatenExistiert: io.existiert,
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: io.invoke }));
vi.mock('@/lib/persistenz/kern/persistenzMeldung', () => ({ meldePersistenzBefund: io.melden }));
vi.mock('@/lib/persistenz/kern/kern.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/kern/kern.index')>()),
  ...(await import('@/lib/persistenz/kern/appDatenLesenGeschuetzt')),
  EINSTELLUNGEN_ORDNER: 'einstellungen',
  appDatenLesen: io.lesen,
  appDatenExistiert: io.existiert,
  mitDateiSperre: async (_pfad: string, aktion: (token: string) => Promise<unknown>) =>
    aktion('token'),
}));
import { sichereBeiUngueltigemInhalt } from '@/lib/persistenz/kern/kern.index';
import { stelleEinstellungenAusBackupWiederHer } from '@/lib/einstellungen/einstellungen.index';
import { FARBSCHEMA_KEY } from '@/lib/einstellungen/einstellungen.index';
const gueltig =
  '<einstellungen version="1"><verarbeitungszeit>2026-10-16T12:00:00Z</verarbeitungszeit><farbschema>dunkel</farbschema></einstellungen>';
beforeEach(() => {
  vi.clearAllMocks();
  const werte = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => werte.get(key) ?? null,
    setItem: (key: string, wert: string) => werte.set(key, wert),
    removeItem: (key: string) => werte.delete(key),
  });
  io.existiert.mockResolvedValue(true);
  io.invoke.mockResolvedValue({ status: 'archiviert', sicherungspfad: 'archiv.xml' });
});
afterEach(() => vi.unstubAllGlobals());
it.each(['', '  \n\t'])('archiviert auch leere Backups (%s)', async (inhalt) => {
  io.lesen.mockResolvedValueOnce(inhalt);
  expect(await stelleEinstellungenAusBackupWiederHer()).toBe('nichts-zu-tun');
  expect(io.invoke).toHaveBeenCalledWith(
    'archiviere_beschaedigte_datei',
    expect.objectContaining({ erwarteterInhalt: inhalt, token: 'token' }),
  );
});
it('behält die bisherige Leerbehandlung anderer Lader', async () => {
  expect(await sichereBeiUngueltigemInhalt('anderes.xml', '  ', () => false)).toEqual({
    status: 'leer',
  });
  expect(io.invoke).not.toHaveBeenCalled();
});
it.each([true, false])(
  'prüft ausgetauschte Datei erneut vollständig (gültig: %s)',
  async (neuGueltig) => {
    const neu = neuGueltig ? gueltig : gueltig.replace('version="1"', 'version="2"');
    io.lesen.mockResolvedValueOnce('<defekt>').mockResolvedValueOnce(neu);
    io.invoke.mockResolvedValueOnce({ status: 'veraendert', sicherungspfad: null });
    expect(await stelleEinstellungenAusBackupWiederHer()).toBe(
      neuGueltig ? 'wiederhergestellt' : 'nichts-zu-tun',
    );
    expect(io.invoke).toHaveBeenCalledTimes(neuGueltig ? 1 : 2);
    expect(localStorage.getItem(FARBSCHEMA_KEY)).toBe(neuGueltig ? 'dunkel' : null);
  },
);
it('behandelt fehlendes Backup als normalen Start', async () => {
  io.lesen.mockRejectedValueOnce(new Error('fehlt'));
  io.existiert.mockResolvedValueOnce(false);
  expect(await stelleEinstellungenAusBackupWiederHer()).toBe('nichts-zu-tun');
  expect(io.invoke).not.toHaveBeenCalled();
});
