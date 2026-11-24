// Native Dateigrenzen für durchgängige Einstellungenimportproben. Fachliche Module bleiben echt.
import { vi } from 'vitest';
const io = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  archive: new Map<string, Uint8Array>(),
  invoke: vi.fn(),
  banner: vi.fn(),
  dialog: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: io.invoke }));
vi.mock('@tauri-apps/api/event', () => ({
  emitTo: vi.fn(async () => {}),
  listen: async () => () => {},
}));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: io.dialog }));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: io.banner,
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: async (pfad: string) => {
    const xml = io.dateien.get(pfad.replace('/daten/LexLata/', ''));
    if (xml === undefined) throw new Error('Datei fehlt');
    return xml;
  },
  readFile: async (pfad: string) => {
    const daten = io.archive.get(pfad);
    if (!daten) throw new Error('Archiv fehlt');
    return daten;
  },
  exists: async (pfad: string) => io.dateien.has(pfad.replace('/daten/LexLata/', '')),
  readDir: async () => [],
  mkdir: async () => {},
}));

export { io };

export const fehlerEntfernen = new Set<string>();
export const fehlerSetzen = new Set<string>();
/** Jeder Test beginnt mit einem gesunden Backupabschluss, damit die vorhandene
 * Fehlerdrosselung unabhängig von der Reihenfolge der Proben geprüft wird. */
export async function richteEinstellungenImportProbeEin() {
  const { importierePfade } = await import('@/test/import/dateiImportTesthilfe');
  const { meldeEinstellungenGeaendert } = await import('@/lib/einstellungen/einstellungen.index');
  const FARBE = 'lexlata.farbschema';
  vi.useFakeTimers();
  vi.clearAllMocks();
  io.dateien.clear();
  io.archive.clear();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  fehlerEntfernen.clear();
  fehlerSetzen.clear();
  const werte = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => werte.get(key) ?? null,
    setItem: (key: string, wert: string) => {
      if (fehlerSetzen.has(key)) throw new Error('Setzen verweigert');
      werte.set(key, wert);
    },
    removeItem: (key: string) => {
      if (fehlerEntfernen.has(key)) throw new Error('Entfernen verweigert');
      werte.delete(key);
    },
  });
  io.invoke.mockImplementation(
    async (name: string, args: { relativerPfad: string; inhalt: string }) => {
      if (name === 'datei_sperre_erwerben') return 'token';
      if (name === 'datei_sperre_freigeben') return;
      if (name === 'atomar_datei_schreiben') {
        io.dateien.set(args.relativerPfad, args.inhalt);
        return;
      }
      if (name === 'app_daten_loeschen') {
        io.dateien.delete(args.relativerPfad);
        return;
      }
      throw new Error(`Unerwarteter nativer Aufruf: ${name}`);
    },
  );
  await importierePfade([]);
  localStorage.setItem(FARBE, 'hell');
  meldeEinstellungenGeaendert(FARBE);
  await vi.advanceTimersByTimeAsync(1000);
  localStorage.removeItem(FARBE);
  io.dateien.clear();
  vi.clearAllMocks();
}
