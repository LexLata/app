// Nur native Grenzen; React, Einführung, Banner und Dateispeicher laufen echt.
import { vi } from 'vitest';
const io = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  vorLesen: (_pfad: string): Promise<void> | undefined => undefined,
  vorListener: (_name: string): Promise<void> | undefined => undefined,
  callbacks: new Map<number, (event: { payload: unknown }) => void>(),
  listener: new Map<string, Set<(event: { payload: unknown }) => void>>(),
  invoke: vi.fn(),
  confirm: vi.fn(async () => true),
  emitTo: vi.fn(async (..._args: unknown[]) => {}),
  schreiben: vi.fn(async () => {}),
  writeFile: vi.fn(async (_pfad: string, _daten: Uint8Array) => {}),
  save: vi.fn(async () => '/daten/Export.xml'),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: io.invoke, isTauri: () => true }));
vi.mock('@tauri-apps/api/app', () => ({ getName: async () => 'LexLata' }));
vi.mock('@tauri-apps/api/event', () => ({
  emitTo: io.emitTo,
  listen: async (name: string, callback: (event: { payload: unknown }) => void) => {
    await io.vorListener(name);
    const menge = io.listener.get(name) ?? new Set();
    menge.add(callback);
    io.listener.set(name, menge);
    return () => {
      menge.delete(callback);
    };
  },
}));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    label: 'main',
    onDragDropEvent: async (callback: (event: { payload: unknown }) => void) => {
      const menge = io.listener.get('tauri://drag-drop') ?? new Set();
      menge.add(callback);
      io.listener.set('tauri://drag-drop', menge);
      return () => {
        menge.delete(callback);
      };
    },
    listen: async (name: string, callback: (event: { payload: unknown }) => void) => {
      const menge = io.listener.get(name) ?? new Set();
      menge.add(callback);
      io.listener.set(name, menge);
      return () => {
        menge.delete(callback);
      };
    },
  }),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ label: 'main', setCursorIcon: async () => {} }),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ confirm: io.confirm, save: io.save }));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  resolveResource: async (relativ: string) => relativ,
  join: async (...teile: string[]) => teile.join('/'),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  writeFile: io.writeFile,
  writeTextFile: async (pfad: string, xml: string) => {
    io.dateien.set(pfad.replace('/daten/LexLata/', ''), xml);
  },
  readTextFile: async (pfad: string) => {
    await io.vorLesen(pfad);
    const xml = io.dateien.get(pfad.replace('/daten/LexLata/', ''));
    if (xml === undefined) throw new Error('Datei fehlt');
    return xml;
  },
  exists: async (pfad: string) => io.dateien.has(pfad.replace('/daten/LexLata/', '')),
  readDir: async (pfad: string) => {
    const ordner = pfad.replace('/daten/LexLata/', '') + '/';
    return [...io.dateien.keys()]
      .filter((p) => p.startsWith(ordner))
      .map((p) => ({ name: p.slice(ordner.length), isDirectory: false }));
  },
  mkdir: async () => {},
}));
function meldeNativenListenerAb(eventId: number | undefined) {
  const callback = io.callbacks.get(eventId ?? -1);
  if (callback) for (const menge of io.listener.values()) menge.delete(callback);
}
export function nativeAttrappeZuruecksetzen() {
  vi.clearAllMocks();
  Object.defineProperty(window, '__TAURI_EVENT_PLUGIN_INTERNALS__', {
    configurable: true,
    value: { unregisterListener: () => {} },
  });
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    configurable: true,
    value: {
      invoke: io.invoke,
      transformCallback: (callback: (event: { payload: unknown }) => void) => {
        const id = io.callbacks.size + 1;
        io.callbacks.set(id, callback);
        return id;
      },
      unregisterCallback: (id: number) => io.callbacks.delete(id),
    },
  });
  io.dateien.clear();
  io.vorLesen = () => undefined;
  io.vorListener = () => undefined;
  io.listener.clear();
  io.callbacks.clear();
  io.emitTo.mockImplementation(async (...args: unknown[]) => {
    const name = args[1];
    if (typeof name === 'string')
      for (const callback of io.listener.get(name) ?? []) callback({ payload: args[2] });
  });
  io.schreiben.mockReset().mockResolvedValue(undefined);
  io.confirm.mockResolvedValue(true);
  io.invoke.mockImplementation(
    async (
      name: string,
      args: {
        relativerPfad: string;
        inhalt: string;
        event?: string;
        handler?: number;
        eventId?: number;
      },
    ) => {
      if (name === 'plugin:event|listen') {
        await io.vorListener(args.event ?? '');
        if (typeof args.event !== 'string' || typeof args.handler !== 'number')
          throw new Error('Unvollständige native Listeneranmeldung');
        const callback = io.callbacks.get(args.handler);
        if (callback) {
          const menge = io.listener.get(args.event) ?? new Set();
          menge.add(callback);
          io.listener.set(args.event, menge);
        }
        return args.handler;
      }
      if (name === 'plugin:event|unlisten') {
        meldeNativenListenerAb(args.eventId);
        return;
      }
      if (['plugin:event|emit', 'plugin:event|emit_to'].includes(name)) return;
      if (name === 'fenster_alle_positionen') return [];
      if (name === 'gesetz_dateistempel_lesen')
        return [...io.dateien]
          .filter(([pfad]) => pfad.startsWith('gesetze/') && pfad.endsWith('.xml'))
          .map(([pfad, inhalt]) => ({
            name: pfad.slice(8),
            dateistempel: { groesse: String(inhalt.length), aenderungszeit: '1' },
          }));
      if (name === 'datei_sperre_erwerben') return 'token';
      if (
        ['datei_sperre_freigeben', 'menu_item_aktivieren', 'menueleiste_aktivieren'].includes(name)
      )
        return;
      if (name === 'atomar_datei_schreiben') {
        await io.schreiben();
        io.dateien.set(args.relativerPfad, args.inhalt);
        return;
      }
      if (name === 'app_daten_loeschen') {
        await io.schreiben();
        io.dateien.delete(args.relativerPfad);
        return;
      }
      throw new Error(`Unerwarteter nativer Aufruf: ${name}`);
    },
  );
}

export { io };
