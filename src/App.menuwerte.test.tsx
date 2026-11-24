// @vitest-environment jsdom
// Prüft die Gesetzesquelle am echten Hauptfenster bis zum nativen Menüaufruf.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act, createElement } from 'react';
import { assert, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import App from './App';
import { setzeSuchverzeichnisTestdaten } from '@/test/suchverzeichnis/suchverzeichnisSuchdaten';
import { gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'linux' }));
vi.mock('@tauri-apps/plugin-deep-link', () => ({
  getCurrent: async () => null,
  onOpenUrl: async () => () => {},
}));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }));
const dom = domTestWurzel();
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  localStorage.clear();
  Element.prototype.scrollIntoView = () => {};
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const bisher = io.invoke.getMockImplementation();
  assert(bisher);
  io.invoke.mockImplementation(async (name, args) => {
    if (name === 'startaufgaben_fortschritt') return 5;
    if (name === 'startaufgaben_lesen') return null;
    if (
      [
        'startaufgaben_anmelden',
        'startaufgaben_abmelden',
        'hauptfenster_hinweise_bereit',
        'hauptfenster_hinweise_abmelden',
        'interne_navigation_bereit',
        'interne_navigation_abmelden',
        'fenster_anzeigen',
        'fenster_menu_status_aktualisieren',
        'fenster_schliessen_angefordert',
        'importindizes_vorbereiten',
      ].includes(name)
    )
      return;
    if (name.startsWith('pruefvorgang_'))
      return { offeneQuellen: 0, offenePruefungen: 0, vollbedarf: false };
    return bisher(name, args);
  });
});
it.each([0, 1])('meldet Gesetze aktualisieren für %s installierte Gesetze', async (anzahl) => {
  setzeSuchverzeichnisTestdaten(anzahl ? [gesetzDarstellung()] : []);
  await act(async () => dom.root.render(createElement(App)));
  await act(async () => vi.dynamicImportSettled());
  await vi.waitFor(() =>
    expect(io.invoke).toHaveBeenCalledWith('menu_item_aktivieren', {
      id: 'gesetze-aktualisieren',
      aktiv: anzahl > 0,
    }),
  );
});
