// @vitest-environment jsdom
// Echter App-Start mit Wiederherstellung und Automatik; nur native Grenzen und Uhr sind ersetzt.
import { ausstehendesPromise } from '@/test/plattform/ausstehendesPromise';
import { startaufgabenBefehlsgrenze } from '@/test/start/startaufgabenBefehlsgrenze';
import { STARTAUFGABEN_ANZAHL } from '@/hooks/app-start/startaufgaben';
import { leseSuchverzeichnis } from '@/lib/persistenz/gesetz/gesetz.index';
import { berechneTreffer } from '@/lib/domain/app/oeffnen/oeffnen.index';
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '@/App';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { importindexFixture } from '@/test/import/europaImportFixtures';
import { speichereFensterZustand } from '@/lib/persistenz/fenster/fenster.index';

const nativ = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  lesen: vi.fn(),
  invoke: vi.fn(),
  zeigen: vi.fn(),
  weiter: () => {},
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: nativ.invoke, isTauri: () => true }));
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'macos' }));
vi.mock('@tauri-apps/plugin-deep-link', () => ({ getCurrent: async () => null }));
vi.mock('@tauri-apps/api/app', () => ({ getName: async () => 'LexLata' }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: async () => () => {},
  emitTo: async () => {},
}));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ listen: async () => () => {} }),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    label: 'main',
    show: nativ.zeigen,
    onCloseRequested: async () => () => {},
    onResized: async () => () => {},
    onMoved: async () => () => {},
    onFocusChanged: async () => () => {},
    center: async () => {},
    isFullscreen: async () => false,
    isMaximized: async () => false,
    innerSize: async () => ({ width: 1000, height: 800 }),
    outerPosition: async () => ({ x: 0, y: 0 }),
  }),
}));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
  resolveResource: async (pfad: string) => `/ressourcen/${pfad}`,
}));
vi.mock('@tauri-apps/plugin-fs', async () => {
  const { dateiAttrappen } = await import('@/test/plattform/dateiAttrappen');
  return dateiAttrappen(nativ.dateien, nativ.lesen);
});
const dom = domTestWurzel();
const appUpdateAufrufe = () =>
  nativ.invoke.mock.calls.filter(
    ([name, args]) => name === 'app_update_pruefen' && args?.anlass === 'automatisch',
  );
const automatikAufrufe = () =>
  nativ.invoke.mock.calls.filter(([name]) => name === 'import_aktualisierung_automatisch_starten');
async function zeit(ms: number) {
  await act(async () => vi.advanceTimersByTimeAsync(ms));
}
beforeEach(async () => {
  await import('@tauri-apps/api/event');
  await import('@tauri-apps/api/window');
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.stubGlobal('__TAURI_EVENT_PLUGIN_INTERNALS__', { unregisterListener: () => {} });
  vi.stubGlobal('__TAURI_INTERNALS__', {
    transformCallback: () => 1,
    unregisterCallback: () => {},
    invoke: nativ.invoke,
  });
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-04T12:00:00Z'));
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('einfuehrung.abgeschlossen', 'true');
  localStorage.setItem('lexlata.autoAktualisierungIntervall', 'woechentlich');
  speichereFensterZustand('main', {
    tabs: [{ gesetzesreferenz: { normgeber: 'de-bund', kurztitel: 'TestG' } }],
    aktiverIndex: 0,
  });
  nativ.dateien.clear();
  nativ.dateien.set(
    'gesetze/TestG_de-bund.xml',
    '<gesetz version="1"><infos><normgeber>de-bund</normgeber><kurztitel>TestG</kurztitel><langtitel>Starttestgesetz</langtitel><verarbeitungszeit>2026-10-01T12:00:00Z</verarbeitungszeit></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><titel>Anwendung</titel><text><absatz><satz>Wiederhergestellter Gesetzestext.</satz></absatz></text></norm></inhalt></gesetz>',
  );
  for (const normgeber of ['de-bund', 'de-bw']) {
    nativ.dateien.set(
      `/ressourcen/resources/praefixstrukturen/${normgeber}.xml`,
      `<praefixstrukturen version="1"><infos><normgeber>${normgeber}</normgeber><verarbeitungszeit>2026-10-01T00:00:00Z</verarbeitungszeit></infos><inhalt /></praefixstrukturen>`,
    );
  }
  nativ.lesen.mockImplementation(async (pfad: string) => {
    if (pfad.endsWith('europaKuratiert.json')) return '[]';
    if (pfad.includes('/importindizes/')) {
      const quelle = pfad.endsWith('de-bund.xml')
        ? 'de-bund'
        : pfad.endsWith('de-bw.xml')
          ? 'de-bw'
          : 'eu';
      return importindexFixture(quelle, '');
    }
    const inhalt = nativ.dateien.get(pfad.replace('/daten/LexLata/', ''));
    if (inhalt === undefined) throw new Error(`Datei fehlt: ${pfad}`);
    return inhalt;
  });
  const warten = new Promise<null>((resolve) => {
    nativ.weiter = () => resolve(null);
  });
  const startaufgaben = startaufgabenBefehlsgrenze();
  nativ.invoke.mockImplementation(
    async (name: string, args?: { relativerPfad: string; inhalt: string }) => {
      if (name.startsWith('startaufgaben_')) return startaufgaben(name);
      if (name.startsWith('pruefvorgang_'))
        return { offeneQuellen: 0, offenePruefungen: 0, vollbedarf: false };
      if (name === 'tab_uebertragung_abholen') return warten;
      const festeAntworten: Record<string, unknown> = {
        hauptfenster_hinweise_lesen: [],
        app_update_zustand: { art: 'ruhe', folge: 0 },
        app_update_pruefen: { ergebnis: 'aktuell' },
      };
      if (name in festeAntworten) return festeAntworten[name];
      if (name === 'interne_navigation_anzeigen' || name === 'letzter_tab_anfrage_lesen')
        return false;
      if (name === 'import_aktualisierung_automatisch_starten') return 'automatik';
      if (name === 'gesetz_dateistempel_lesen')
        return [...nativ.dateien]
          .filter(([p]) => p.startsWith('gesetze/') && p.endsWith('.xml'))
          .map(([p, t]) => ({
            name: p.slice(8),
            dateistempel: { groesse: String(t.length), aenderungszeit: '1' },
          }));
      if (name === 'datei_sperre_erwerben') return 'dateisperre';
      if (name === 'datei_sperre_fortsetzen') return true;
      if (name === 'plugin:event|listen') return 1;
      if (name === 'interne_navigation_bereit' || name === 'interne_navigation_lesen') return null;
      if (name === 'atomar_datei_schreiben') {
        if (!args) throw new Error('Schreibargumente fehlen.');
        nativ.dateien.set(args.relativerPfad, args.inhalt);
        return;
      }
      if (
        [
          'menu_item_aktivieren',
          'menueleiste_aktivieren',
          'hauptfenster_hinweise_bereit',
          'hauptfenster_hinweise_abmelden',
          'datei_sperre_freigeben',
          'datei_sperre_unterbrechen',
          'fenster_menu_status_aktualisieren',
          'interne_navigation_abmelden',
          'import_aktualisierung_beenden',
          'plugin:event|unlisten',
        ].includes(name)
      )
        return;
      throw new Error(`Unerwarteter nativer Befehl: ${name}`);
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  localStorage.clear();
});
it('stellt App-Fenster und Gesetzestab wieder her und startet die Automatik erst zehn Sekunden nach dem tatsächlichen Startabschluss', async () => {
  const fehlerprotokoll = vi.spyOn(console, 'error');
  const gesetzaktualisierung = ausstehendesPromise<null>();
  const nativBisher = nativ.invoke.getMockImplementation();
  if (!nativBisher) throw Error('Native Testgrenze fehlt');
  nativ.invoke.mockImplementation(async (name, args) => {
    if (name === 'import_aktualisierung_automatisch_starten') return gesetzaktualisierung.promise;
    return nativBisher(name, args);
  });
  await act(async () => dom.root.render(<App />));
  await act(async () => {
    await vi.waitFor(() =>
      expect(nativ.invoke).toHaveBeenCalledWith('tab_uebertragung_abholen', { label: 'main' }),
    );
  });
  await zeit(3_600_000);
  expect(nativ.zeigen).not.toHaveBeenCalled();
  expect(automatikAufrufe()).toHaveLength(0);
  expect(nativ.dateien.has('cache/suchverzeichnis.json')).toBe(false);
  await act(async () => nativ.weiter());
  expect(nativ.zeigen).toHaveBeenCalledOnce();
  expect(dom.host.textContent).toContain('TestG');
  expect(dom.host.querySelector('[data-tab-id]')?.textContent).toContain('TestG');
  expect(automatikAufrufe()).toHaveLength(0);
  await zeit(9_999);
  const verzeichnis = await leseSuchverzeichnis();
  expect(verzeichnis.abgeglichen).toBe(true);
  expect(berechneTreffer('1 TestG', verzeichnis.eintraege, null, null)).toMatchObject([
    { art: 'installiert', gesetzesreferenz: { kurztitel: 'TestG' }, norm: { xmlId: 'p1' } },
  ]);
  expect(automatikAufrufe()).toHaveLength(0);
  await zeit(1);
  expect(automatikAufrufe()).toHaveLength(1);
  const gemeinsameAbschluesse = nativ.invoke.mock.calls.filter(
    ([name]) => name === 'startaufgaben_abschliessen',
  );
  expect(gemeinsameAbschluesse.map(([, args]) => args.schritt)).toEqual([0, 1, 2, 3, 4]);
  expect(gemeinsameAbschluesse).toHaveLength(STARTAUFGABEN_ANZAHL);
  expect(appUpdateAufrufe()).toHaveLength(0);

  await act(async () => gesetzaktualisierung.resolve(null));
  expect(appUpdateAufrufe()).toHaveLength(1);
  expect(fehlerprotokoll).not.toHaveBeenCalled();
});
it('stellt bei nicht lesbarem Gesetzordner Referenztabs wieder her und bewahrt alle Gesetzdateien', async () => {
  const vorher = [...nativ.dateien].filter(([pfad]) => pfad.startsWith('gesetze/'));
  const nativBisher = nativ.invoke.getMockImplementation();
  nativ.invoke.mockImplementation(async (name, args) => {
    if (name === 'gesetz_dateistempel_lesen') throw new Error('Ordner gesperrt');
    return nativBisher?.(name, args);
  });
  await act(async () => dom.root.render(<App />));
  await act(async () => {
    await vi.waitFor(() =>
      expect(nativ.invoke).toHaveBeenCalledWith('tab_uebertragung_abholen', { label: 'main' }),
    );
  });
  await act(async () => nativ.weiter());
  await zeit(100);
  expect(nativ.zeigen).toHaveBeenCalledOnce();
  expect(dom.host.querySelector('[data-tab-id]')?.textContent).toContain('TestG');
  expect([...nativ.dateien].filter(([pfad]) => pfad.startsWith('gesetze/'))).toEqual(vorher);
  expect(
    nativ.invoke.mock.calls.some(
      ([name]) => name === 'app_daten_loeschen' || name === 'archiviere_beschaedigte_datei',
    ),
  ).toBe(false);
});
