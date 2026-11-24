// @vitest-environment jsdom
// Prüft echte Erstabfrage, Präferenzspeicher und Restore bis zur nativen Dekoration.
import { act, useEffect, useRef, StrictMode } from 'react';
import { alleBannerSchliessen, bannerDauerMs, getSnapshot } from '@/lib/banner/banner.index';
import { beforeEach, expect, it, vi } from 'vitest';
import App from '@/App';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { useFensterRestore } from '@/hooks/fenster/useFensterRestore';
import {
  linuxTitelleistenPraeferenzSofortAnwenden,
  linuxTitelleistenPraeferenzLesen,
} from '@/hooks/einstellungen/useLinuxTitelleistenPraeferenz';
import { LINUX_TITELLEISTEN_KEY } from '@/lib/einstellungen/einstellungen.index';
import { exportiere, loeseImportKonflikt } from '@/lib/import-export/import-export.index';

const nativ = vi.hoisted(() => ({
  hinweiseAktiv: false,
  empfang: new Map<string, () => void>(),
  invoke: vi.fn(),
  xml: '',
  plattform: 'linux',
  setDecorations: vi.fn(),
  show: vi.fn(),
}));
vi.mock('@/lib/plattform/tauriHelpers', () => ({
  holePlattform: async () => nativ.plattform,
  nativeDateiSpeichern: async () => '/export/Einstellungen.xml',
}));
vi.mock('@/lib/plattform/dateipfade', () => ({
  downloadsOrdner: async () => '/export',
  verbindeDateipfad: async (ordner: string, name: string) => `${ordner}/${name}`,
  ermittleDateiordner: async () => '/export',
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  writeTextFile: async (_pfad: string, xml: string) => {
    nativ.xml = xml;
  },
}));
vi.mock('@/hooks/utils/usePlattform', () => ({
  usePlattform: () => ({ istLinux: nativ.plattform === 'linux' }),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: nativ.invoke,
  isTauri: () => nativ.hinweiseAktiv,
}));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    listen: async (name: string, callback: () => void) => {
      nativ.empfang.set(name, callback);
      return () => nativ.empfang.delete(name);
    },
  }),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    label: 'main',
    setDecorations: nativ.setDecorations,
    show: nativ.show,
    onCloseRequested: async () => () => {},
  }),
}));
vi.mock('@/lib/persistenz/fenster/fenster.index', () => ({
  ladeFensterZustand: () => null,
  alleFensterLabels: () => [],
  letzteFensterGeometrieLesen: async () => undefined,
  geschlosseneTabsMenuStatusSynchronisieren: vi.fn(),
}));
vi.mock('@/lib/plattform/menu/menu.index', () => ({
  setzeAktiv: vi.fn(),
  meldeGesetzOffenStatus: vi.fn(),
  registriereMenuZustandAnfrageListener: () => () => {},
}));
vi.mock('@/hooks/tabs/useAppTabs', () => ({
  useAppTabs: () => ({
    holeTabGesetz: () => undefined,
    tabs: [],
    tabsRef: { current: [] },
    aktiverTabIdRef: { current: null },
    verlaufLesen: () => undefined,
  }),
}));
vi.mock('@/hooks/tabs/useGesetzVerwaltung', () => ({
  useGesetzVerwaltung: () => ({ gesetze: [] }),
}));
vi.mock('@/hooks/useLesezeichenUndFavoriten', () => ({
  useLesezeichenUndFavoriten: () => ({
    lesezeichen: [],
  }),
}));
vi.mock('@/hooks/markierungen/useMarkierungen', () => ({ useMarkierungen: () => ({}) }));
vi.mock('@/hooks/markierungen/useVerweismarkierungUndKommentarHilfsfenster', () => ({
  useVerweismarkierungUndKommentarHilfsfenster: () => ({}),
}));
vi.mock('@/hooks/fenster/useFensterUebertragung', () => ({ useFensterUebertragung: () => ({}) }));
vi.mock('@/hooks/tabs/useGesetzOeffnen', () => ({ useGesetzOeffnen: () => ({}) }));
vi.mock('@/hooks/useAppAktionen', () => ({ useAppAktionen: () => ({}) }));
vi.mock('@/hooks/useTiefenLinks', () => ({ useTiefenLinks: () => ({}) }));
vi.mock('@/hooks/useFensterstartInitialisierung', () => ({
  useFensterstartInitialisierung: () => true,
}));
vi.mock('@/hooks/fenster/useOeffnenLinkNavigation', () => ({ useOeffnenLinkNavigation: vi.fn() }));
vi.mock('@/hooks/fenster/useInterneNavigation', () => ({ useInterneNavigation: vi.fn() }));
vi.mock('@/hooks/useHintergrundAktualisierung', () => ({
  useHintergrundAktualisierung: vi.fn(() => false),
}));
vi.mock('@/hooks/utils/useTextauswahl', () => ({ useTextauswahl: vi.fn() }));
vi.mock('@/hooks/einfuehrung/useEinfuehrungsAblauf', () => ({ useEinfuehrungsAblauf: () => ({}) }));
vi.mock('@/hooks/eingabe/useTastenkuerzel', () => ({ useTastenkuerzel: vi.fn() }));
vi.mock('@/hooks/eingabe/useMenueEvents', () => ({ useMenueEvents: vi.fn() }));
vi.mock('@/components/tableiste/Tableiste', () => ({ Tableiste: () => null }));
vi.mock('@/components/hauptfenster/Willkommensansicht', () => ({ Willkommensansicht: () => null }));
vi.mock('@/components/hauptfenster/OverlayHost', () => ({ AppOverlayHost: () => null }));
vi.mock('@/components/hauptfenster/BannerHost', () => ({ BannerHost: () => null }));

const dom = domTestWurzel();
beforeEach(() => {
  localStorage.clear();
  alleBannerSchliessen();
  nativ.hinweiseAktiv = false;
  nativ.empfang.clear();
  nativ.invoke
    .mockReset()
    .mockImplementation(async (command: string) =>
      command === 'gesetz_dateistempel_lesen' ? [] : false,
    );
  nativ.plattform = 'linux';
  nativ.xml = '';
  nativ.setDecorations.mockReset().mockResolvedValue(undefined);
  nativ.show.mockReset().mockResolvedValue(undefined);
});
const abfrage = () => dom.host.querySelector('[data-overlay-aktiv]');
it.each(['eigene', 'nativ'] as const)(
  'führt die Erstabfrage für %s bis zum nativen Aufruf fort',
  async (wahl) => {
    await act(async () => dom.root.render(<App />));
    expect(abfrage()).not.toBeNull();
    const text = wahl === 'eigene' ? 'Eigene Titelleiste' : 'Native Titelleiste';
    const button = [...dom.host.querySelectorAll('button')].find((b) => b.textContent === text)!;
    await act(async () => button.click());
    expect(localStorage.getItem(LINUX_TITELLEISTEN_KEY)).toBe(wahl);
    expect(linuxTitelleistenPraeferenzLesen()).toBe(wahl);
    expect(nativ.setDecorations).toHaveBeenCalledExactlyOnceWith(wahl === 'nativ');
    expect(abfrage()).toBeNull();
  },
);
it.each([null, 'custom', 'ungültig', ''])(
  'zeigt bei fehlendem oder ungültigem Rohwert %s die Erstabfrage',
  async (roh) => {
    if (roh !== null) localStorage.setItem(LINUX_TITELLEISTEN_KEY, roh);
    await act(async () => dom.root.render(<App />));
    expect(linuxTitelleistenPraeferenzLesen()).toBeNull();
    expect(abfrage()).not.toBeNull();
    expect(localStorage.getItem(LINUX_TITELLEISTEN_KEY)).toBe(roh);
    expect(nativ.setDecorations).not.toHaveBeenCalled();
  },
);
it.each(['eigene', 'nativ', 'custom', 'ungültig', ''])(
  'erhält den Rohwert %s beim XML-Austausch und wertet ihn ohne Übernahme aus',
  async (roh) => {
    localStorage.setItem(LINUX_TITELLEISTEN_KEY, roh);
    expect(await exportiere(new Set(['einstellungen']), {})).toBe('exportiert');
    const xml = nativ.xml;
    expect(xml).toContain(`<linuxTitelleistenPraeferenz>${roh}</linuxTitelleistenPraeferenz>`);
    localStorage.clear();
    await loeseImportKonflikt(
      { art: 'einstellungen', anzeigename: 'Einstellungen', importInhalt: xml },
      'ersetzen',
    );
    expect(localStorage.getItem(LINUX_TITELLEISTEN_KEY)).toBe(roh);
    await act(async () => dom.root.render(<App />));
    const gueltig = roh === 'eigene' || roh === 'nativ';
    expect(linuxTitelleistenPraeferenzLesen()).toBe(gueltig ? roh : null);
    expect(abfrage() === null).toBe(gueltig);
  },
);
function Restore() {
  const { initialRestore } = useFensterRestore(
    [],
    null,
    { current: [] },
    { current: null },
    () => undefined,
    vi.fn(),
  );
  const gestartet = useRef(false);
  useEffect(() => {
    if (!gestartet.current) {
      gestartet.current = true;
      void initialRestore(async () => ({ status: 'fehlt', befunde: [] }), vi.fn(), vi.fn());
    }
  }, [initialRestore]);
  return null;
}
it.each(['eigene', 'nativ', 'custom', null])(
  'verwendet beim Linux-Fensterstart %s und zeigt erst danach das Fenster',
  async (roh) => {
    if (roh !== null) localStorage.setItem(LINUX_TITELLEISTEN_KEY, roh);
    await act(async () => dom.root.render(<Restore />));
    if (roh === 'eigene') {
      expect(nativ.setDecorations).toHaveBeenCalledExactlyOnceWith(false);
      expect(nativ.setDecorations.mock.invocationCallOrder[0]).toBeLessThan(
        nativ.show.mock.invocationCallOrder[0]!,
      );
    } else expect(nativ.setDecorations).not.toHaveBeenCalled();
    expect(nativ.show).toHaveBeenCalledOnce();
  },
);
it.each(['macos', 'windows'])(
  'wendet die Linux-Wahl außerhalb von Linux (%s) nicht sofort an',
  async (plattform) => {
    nativ.plattform = plattform;
    localStorage.setItem(LINUX_TITELLEISTEN_KEY, 'eigene');
    await act(async () => dom.root.render(<App />));
    expect(abfrage()).toBeNull();
    await linuxTitelleistenPraeferenzSofortAnwenden();
    expect(nativ.setDecorations).not.toHaveBeenCalled();
  },
);

it('übernimmt eine Präferenz aus einem anderen Fenster ohne neue Liveanwendung der Dekoration', async () => {
  localStorage.setItem(LINUX_TITELLEISTEN_KEY, 'nativ');
  await act(async () => dom.root.render(<App />));
  localStorage.setItem(LINUX_TITELLEISTEN_KEY, 'eigene');
  await act(async () =>
    window.dispatchEvent(
      new StorageEvent('storage', {
        key: LINUX_TITELLEISTEN_KEY,
        oldValue: 'nativ',
        newValue: 'eigene',
      }),
    ),
  );
  expect(linuxTitelleistenPraeferenzLesen()).toBe('eigene');
  expect(abfrage()).toBeNull();
  expect(nativ.setDecorations).not.toHaveBeenCalled();
});

it('übernimmt im echten App-Einstieg genau einmal und bestätigt erst den sichtbaren Bannerbestand', async () => {
  nativ.hinweiseAktiv = true;
  const kennung = crypto.randomUUID();
  const hinweis = { text: 'Gespeichert; Prüfung offen.', typ: 'warnung' };
  let bestaetigungen = 0;
  nativ.invoke.mockImplementation(async (command: string) => {
    if (command === 'gesetz_dateistempel_lesen') return [];
    if (command === 'hauptfenster_hinweise_lesen') return [{ kennung, hinweis }];
    if (command === 'hauptfenster_hinweis_bestaetigen') {
      expect(getSnapshot()).toHaveLength(1);
      expect(getSnapshot()[0]).toMatchObject(hinweis);
      expect(getSnapshot().map((b) => bannerDauerMs(b))).toEqual([undefined]);
      bestaetigungen++;
    }
    return false;
  });
  await act(async () =>
    dom.root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  );
  await vi.waitFor(() => expect(bestaetigungen).toBeGreaterThan(0));
  await act(async () =>
    dom.root.render(
      <StrictMode>
        <App key="neuer-empfang" />
      </StrictMode>,
    ),
  );
  await vi.waitFor(() => expect(bestaetigungen).toBeGreaterThan(1));
  expect(getSnapshot()).toHaveLength(1);
  await act(async () => dom.root.render(null));
  expect(nativ.invoke).toHaveBeenCalledWith('hauptfenster_hinweise_abmelden', expect.any(Object));
});

it('übernimmt im echten App-Einstieg einen später geweckten Hinweis und entfernt den Empfang beim Schließen', async () => {
  nativ.hinweiseAktiv = true;
  const hinweis = { text: 'Späterer Sicherungshinweis', typ: 'warnung' };
  const kennung = crypto.randomUUID();
  let offen = false;
  let bestaetigt = false;
  nativ.invoke.mockImplementation(async (command: string) => {
    if (command === 'gesetz_dateistempel_lesen') return [];
    if (command === 'hauptfenster_hinweise_lesen') return offen ? [{ kennung, hinweis }] : [];
    if (command === 'hauptfenster_hinweis_bestaetigen') {
      expect(getSnapshot()).toHaveLength(1);
      expect(getSnapshot()[0]).toMatchObject(hinweis);
      offen = false;
      bestaetigt = true;
    }
    return null;
  });
  await act(async () =>
    dom.root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  );
  await vi.waitFor(() =>
    expect(nativ.invoke).toHaveBeenCalledWith('hauptfenster_hinweise_lesen', expect.any(Object)),
  );
  expect(getSnapshot()).toHaveLength(0);
  await act(async () => {
    offen = true;
    nativ.empfang.get('hauptfenster-hinweise-verfuegbar')!();
  });
  await vi.waitFor(() => expect(bestaetigt).toBe(true));
  expect(getSnapshot()).toHaveLength(1);
  await act(async () => dom.root.render(null));
  expect(nativ.empfang.has('hauptfenster-hinweise-verfuegbar')).toBe(false);
});
