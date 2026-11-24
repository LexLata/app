// @vitest-environment jsdom
// useAppAktionen.importbanner.test.tsx
// P1-A9: Banner zum Importende nennt bei Fehlern deren Anzahl.
// Gemockt sind nur Dateisystem und native Tauri-Grenzen.
import { act } from 'react';
import { expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';

const dateien = vi.hoisted(() => new Map<string, string>());
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: async (pfad: string) => {
    const inhalt = dateien.get(pfad);
    if (inhalt === undefined) throw new Error('Datei fehlt');
    return inhalt;
  },
  readFile: async () => {
    throw new Error('Archiv fehlt');
  },
  exists: async () => false,
  readDir: async () => [],
  mkdir: async () => {},
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (name: string) => (name === 'datei_sperre_erwerben' ? 'token' : undefined)),
}));
vi.mock('@tauri-apps/api/event', () => ({
  emitTo: vi.fn(async () => {}),
  listen: async () => () => {},
}));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
}));

import { useAppAktionen } from './useAppAktionen';
import { getSnapshot } from '@/lib/banner/banner.index';
import { leseDateiImportZustand, starteDateiImport } from '@/lib/import-export/import-export.index';

const h = domTestWurzel();

function Pruefling() {
  const ref = { current: null };
  useAppAktionen({
    uebersichtExportAktionRef: ref,
    tabsRef: { current: [] },
    aktiverTabIdRef: ref,
    tabSchliessen: vi.fn(),
    tabWiederherstellen: vi.fn(),
    fensterSchliessen: vi.fn(),
    verlaufNavigieren: vi.fn(),
    gesetzesreferenzOeffnen: vi.fn(),
    gesetzInfoInTabsPatchen: vi.fn(),
    // Ein anderes Overlay ist offen: der Bericht wird per Banner angeboten.
    aktivesOverlay: 'tastenkuerzel',
    setAktivesOverlay: vi.fn(),
  });
  return null;
}

it('P1-A9: Banner zum Importende nennt die Anzahl der Fehler', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  dateien.set('/x/a.xml', '<unbekannt/>');
  dateien.set('/x/b.xml', '<unbekannt/>');
  await act(async () => h.root.render(<Pruefling />));
  await act(async () => {
    expect(starteDateiImport(['/x/a.xml', '/x/b.xml'])).toBe(true);
  });
  await vi.waitFor(() => expect(leseDateiImportZustand().art).toBe('fertig'));
  const banner = getSnapshot().at(-1);
  expect(banner?.text).toMatch(/\b2\b/);
  expect(banner?.aktion).toBeDefined();
});
