// Gemeinsame native Dateisystem-, Ereignis- und Netzgrenzen für echte Suchansichten und OeffnenLinkaufträge.
import { vi } from 'vitest';
import { europaRessourceFixture } from './europaImportFixtures';

const io = vi.hoisted(() => ({
  lokal: new Map<string, string>(),
  lesen: vi.fn(),
  ressourcen: vi.fn(),
  netz: vi.fn(),
  fehler: false,
  listener: new Map<string, (e: { payload: { kategorie: string; absender: string } }) => void>(),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (name: string) =>
    name === 'gesetz_dateistempel_lesen'
      ? []
      : name === 'gesetz_import_sperre_versuchen_zu_erhalten'
        ? true
        : undefined,
}));
vi.mock('@tauri-apps/api/event', () => ({
  listen: async (
    name: string,
    handler: typeof io.listener extends Map<string, infer H> ? H : never,
  ) => {
    io.listener.set(name, handler);
    return () => io.listener.delete(name);
  },
  emitTo: async () => {},
}));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: io.netz }));
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'macos' }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ label: 'main', setFocus: async () => {} }),
}));
vi.mock('@/lib/plattform/dateipfade', () => ({ ressourcenPfad: async (p: string) => p }));
vi.mock('@/lib/persistenz/kern/kern.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/kern/kern.index')>()),
  appDatenLesen: io.lesen,
  appDatenSchreiben: async (p: string, xml: string) => {
    io.lokal.set(p, xml);
  },
  sicherstelleOrdner: async () => {},
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: io.ressourcen,
  exists: async () => true,
  readDir: async () => [],
}));
export function bereiteImportindexDateienVor() {
  io.fehler = false;
  io.lokal.clear();
  for (const name of ['de-bund.xml', 'de-bw.xml', 'eu.xml'])
    io.lokal.set(`importindizes/${name}`, europaRessourceFixture(name));
  io.lokal.set('importindizes/de-bund.xml', europaRessourceFixture('de-bund.xml'));
  io.lesen.mockReset().mockImplementation(async (p: string) => {
    const text = io.lokal.get(p);
    if (text === undefined) throw Error(p);
    return text;
  });
  io.ressourcen.mockReset().mockImplementation(async (p: string) => {
    if (io.fehler && p.includes('praefixstrukturen')) throw Error('Präfixfehler');
    if (p.includes('praefixstrukturen'))
      return `<praefixstrukturen version="1"><infos><verarbeitungszeit>2026-10-01T00:00:00Z</verarbeitungszeit><normgeber>${p.endsWith('de-bund.xml') ? 'de-bund' : 'de-bw'}</normgeber></infos><inhalt/></praefixstrukturen>`;
    return europaRessourceFixture(p);
  });
  io.netz.mockReset().mockRejectedValue(Error('Kein Netz'));
}

export { io };
