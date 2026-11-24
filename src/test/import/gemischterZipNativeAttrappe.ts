// Native Datei- und Prüfvorgangsgrenzen der gemischten ZIP-Gesamtabnahme.
import { gesetzDateistempelAttrappe } from '@/test/plattform/dateiAttrappen';
import { vi } from 'vitest';
const io = vi.hoisted(() => ({
  listener: new Map<string, (event: { payload: unknown }) => void>(),
  dateien: new Map<string, string>(),
  archive: new Map<string, Uint8Array>(),
  invoke: vi.fn(),
  emit: vi.fn(),
  quellen: new Set<string>(),
  pruefungen: new Set<string>(),
  vollbedarf: false,
  schreibfehler: '',
  ereignisfehler: '',
  nummer: 0,
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: io.invoke, isTauri: () => false }));
vi.mock('@tauri-apps/api/event', () => ({
  emitTo: io.emit,
  listen: async (name: string, callback: (event: { payload: unknown }) => void) => {
    io.listener.set(name, callback);
    return () => io.listener.delete(name);
  },
}));
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'macos' }));
vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: async ({ defaultPath }: { defaultPath: string }) => defaultPath,
}));
vi.mock('@tauri-apps/api/path', () => ({
  downloadDir: async () => '/export',
  dirname: async (pfad: string) => pfad.slice(0, pfad.lastIndexOf('/')),
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
  resolveResource: async (pfad: string) => pfad,
}));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ label: 'main' }) }));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    listen: async (name: string, callback: (event: { payload: unknown }) => void) => {
      io.listener.set(name, callback);
      return () => io.listener.delete(name);
    },
  }),
}));
const relativ = (pfad: string) => pfad.replace('/daten/LexLata/', '');
vi.mock('@tauri-apps/plugin-fs', () => ({
  writeFile: async (pfad: string, inhalt: Uint8Array) => io.archive.set(pfad, inhalt),
  writeTextFile: async (pfad: string, inhalt: string) => io.dateien.set(relativ(pfad), inhalt),
  readTextFile: async (pfad: string) => {
    const xml = io.dateien.get(relativ(pfad));
    if (xml === undefined) throw Error(`Datei fehlt: ${pfad}`);
    return xml;
  },
  readFile: async (pfad: string) => {
    const zip = io.archive.get(pfad);
    if (!zip) throw Error('Archiv fehlt');
    return zip;
  },
  exists: async (pfad: string) => io.dateien.has(relativ(pfad)),
  mkdir: async () => {},
  readDir: async (pfad: string) =>
    [...io.dateien.keys()]
      .filter(
        (p) =>
          p.startsWith(relativ(pfad) + '/') && !p.slice(relativ(pfad).length + 1).includes('/'),
      )
      .map((p) => ({ name: p.slice(relativ(pfad).length + 1), isFile: true })),
}));
function aktualisiereVorgang(name: string, id: string) {
  if (name === 'pruefvorgang_quelle_abschliessen' && io.quellen.delete(id)) io.pruefungen.add(id);
  if (name === 'pruefvorgang_teilpruefung_abschliessen') io.pruefungen.delete(id);
  if (name === 'pruefvorgang_abbrechen') io.quellen.delete(id);
  if (name === 'pruefvorgang_fehler') {
    io.quellen.delete(id);
    io.pruefungen.delete(id);
    io.vollbedarf = true;
  }
}
function pruefvorgang(name: string, vorgaenge: string[]) {
  if (name === 'pruefvorgang_registrieren') {
    const id = `v-${++io.nummer}`;
    io.quellen.add(id);
    return id;
  }
  for (const id of vorgaenge) aktualisiereVorgang(name, id);
  if (name === 'pruefvorgang_vollbedarf') io.vollbedarf = true;
  if (name === 'pruefvorgang_vollpruefung_abschliessen') {
    io.pruefungen.clear();
    io.vollbedarf = false;
  }
  if (name === 'pruefvorgang_wiederholung_uebernehmen') return false;
  return {
    offeneQuellen: io.quellen.size,
    offenePruefungen: io.pruefungen.size,
    vollbedarf: io.vollbedarf,
  };
}
export function vorbereiten() {
  vi.clearAllMocks();
  io.listener.clear();
  io.dateien.clear();
  io.archive.clear();
  io.quellen.clear();
  io.pruefungen.clear();
  io.vollbedarf = false;
  io.nummer = 0;
  io.schreibfehler = '';
  io.ereignisfehler = '';
  localStorage.clear();
  io.emit.mockImplementation(async (_ziel, name, payload) => {
    io.listener.get(name)?.({ payload });
    if (name === io.ereignisfehler) throw Error('Broadcast verweigert');
  });
  io.invoke.mockImplementation(
    async (
      name: string,
      args: {
        relativerPfad?: string;
        inhalt?: string;
        erwarteterInhalt?: string;
        vorgaenge?: string[];
      },
    ) => {
      const pfad = args?.relativerPfad ?? '';
      if (name === 'gesetz_dateistempel_lesen') return gesetzDateistempelAttrappe(io.dateien);
      if (name === 'atomar_datei_schreiben') {
        if (pfad === io.schreibfehler) throw Error('Schreiben verweigert');
        io.dateien.set(pfad, args.inhalt ?? '');
        return;
      }
      if (name === 'archiviere_beschaedigte_datei') {
        if (io.dateien.get(pfad) !== args.erwarteterInhalt)
          return { status: 'veraendert', sicherungspfad: null };
        io.dateien.set(pfad + '.sicherung', args.erwarteterInhalt ?? '');
        io.dateien.delete(pfad);
        return { status: 'archiviert', sicherungspfad: pfad + '.sicherung' };
      }
      if (name === 'datei_sperre_erwerben' || name === 'import_aktualisierung_starten')
        return `token-${++io.nummer}`;
      if (
        name === 'gesetz_import_sperre_versuchen_zu_erhalten' ||
        name === 'datei_sperre_fortsetzen'
      )
        return true;
      if (name.startsWith('pruefvorgang_')) return pruefvorgang(name, args?.vorgaenge ?? []);
      if (
        [
          'datei_sperre_freigeben',
          'datei_sperre_unterbrechen',
          'import_aktualisierung_beenden',
          'gesetz_import_sperre_freigeben',
          'hauptfenster_hinweis_senden',
        ].includes(name)
      )
        return;
      throw Error(`Unerwarteter nativer Aufruf: ${name}`);
    },
  );
}

export { io };
