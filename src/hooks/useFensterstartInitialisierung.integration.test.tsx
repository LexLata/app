import { richteNativeEreignisgrenzeEin } from '@/test/start/nativeEreignisgrenze';
import { geladenesTabGesetz } from '@/test/tabs/tabFabriken';
// Verbindet echte React-Hooks, App-Start und Fenster-Restore bis zum
// nativen show()-Aufruf und zum Wiederöffnen eines erhaltenen geschlossenen Tabs
// samt Verlauf. DOM, IPC und unabhängige Datei-Startaufgaben sind ersetzt.
import { gesetzOeffnenFixture } from '@/test/hauptfenster/gesetzOeffnenFixture';
import { gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import { gesetzesreferenzSchluessel, referenzVon } from '@/lib/domain/gesetzesreferenz';
import { act, StrictMode, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, assert, beforeEach, expect, it, vi } from 'vitest';
import type { Navigationsziel, OeffnenModus } from '@/lib/domain/appTypes';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import {
  geschlossenenTabPushen,
  geschlossenenTabPoppen,
  ladeFensterZustand,
  speichereFensterZustand,
} from '@/lib/persistenz/fenster/fenster.index';
import { useAppAktionen } from './useAppAktionen';
import { useGesetzOeffnen } from './tabs/useGesetzOeffnen';
import { useAppTabs } from './tabs/useAppTabs';
import { useFensterRestore } from './fenster/useFensterRestore';
import { useFensterUebertragung } from './fenster/useFensterUebertragung';
import { useFensterstartInitialisierung } from './useFensterstartInitialisierung';
import {
  ladeAnzeigezeitpunkte,
  merkeAnzeige,
} from '@/lib/persistenz/nutzerdaten/zuletztAngezeigtSpeicher';
import { useZuletztAngezeigt } from './useZuletztAngezeigt';
import { useTiefenLinks } from './useTiefenLinks';
import { getSnapshot } from '@/lib/banner/banner.index';
import { einzelzugriffFuerTest } from '@/test/tabs/einzelzugriffFuerTest';

const native = vi.hoisted(() => ({
  appStartUrls: vi.fn(async (): Promise<string[] | null> => null),
  invoke: vi.fn(),
  senden: vi.fn(),
  show: vi.fn(async () => {}),
  hide: vi.fn(async () => {}),
  onCloseRequested: vi.fn(
    async (_handler: (event: { preventDefault: () => void }) => Promise<void>) => () => {},
  ),
  removeItem: vi.fn(),
  laden: vi.fn(),
  importieren: vi.fn(),
  setItem: vi.fn(),
  destroy: vi.fn(async () => {}),
  center: vi.fn(async () => {}),
  geometrieSchreiben: vi.fn(async () => {}),
  letzteGeometrieLesen: vi.fn(),
  setPosition: vi.fn(async () => {}),
  tabsAnwenden: vi.fn(),
  startPruefung: vi.fn(async () => {}),
  label: 'main',
  uebertragungsEmpfaenger: null as (() => Promise<void>) | null,
  bestaetigungsEmpfaenger: null as
    ((event: { payload: { kennung: string; uebernommen: boolean } }) => void) | null,
  isFullscreen: vi.fn(async () => true),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (name: string, args: unknown) =>
    name === 'gesetz_dateistempel_lesen'
      ? native.laden().then((liste: GesetzDarstellung[]) =>
          liste.map((g) => ({
            name: `${g.kurztitel}_${g.normgeber}.xml`,
            dateistempel: { groesse: '1', aenderungszeit: '1' },
          })),
        )
      : native.invoke(name, args),
  isTauri: () => true,
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    label: native.label,
    show: native.show,
    hide: native.hide,
    onCloseRequested: native.onCloseRequested,
    destroy: native.destroy,
    center: native.center,
    onResized: async () => () => {},
    onMoved: async () => () => {},
    setSize: async () => {},
    setPosition: native.setPosition,
    unmaximize: async () => {},
    innerSize: async () => ({ width: 800, height: 600 }),
    // Fullscreen hat keine zu speichernde Geometrie; kein Dateischreibauftrag.
    isFullscreen: native.isFullscreen,
  }),
}));
vi.mock('@/lib/persistenz/fenster/fenster.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  hauptFensterGeometrieFuerRustSpeichern: native.geometrieSchreiben,
  letzteFensterGeometrieSpeichern: async () => {},
  letzteFensterGeometrieLesen: native.letzteGeometrieLesen,
}));
vi.mock('@tauri-apps/plugin-deep-link', () => ({ getCurrent: native.appStartUrls }));
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'macos' }));
vi.mock(
  '@/lib/plattform/fensterkommunikation/fensterkommunikation.index',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/lib/plattform/fensterkommunikation/fensterkommunikation.index')
    >()),
    hoereImEigenenFenster: (name: string, handler: () => Promise<void>) => {
      if (name === 'tab-uebertragung-eingefuegt') native.uebertragungsEmpfaenger = handler;
      if (name === 'tab-uebertragung-bestaetigt') native.bestaetigungsEmpfaenger = handler as never;
      return { bereit: Promise.resolve(), abmelden: () => {} };
    },
    sendeAnFenster: native.senden,
  }),
);
vi.mock('@/lib/import/import.index', () => ({
  synchronisiereStartupImportindizes: async () => {},
  istImportindexSuchbestandAktuell: () => true,
  sucheKandidatenAlleQuellen: async () => ({ 'de-bund': [], 'de-bw': [], eu: [] }),
  importiereGesetzesreferenz: native.importieren,
}));
vi.mock('@/lib/markierungen/markierungen.index', () => ({
  pruefeMarkierungenBeimStart: native.startPruefung,
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/gesetz/gesetz.index')>()),
  leseGesetz: (ref: Gesetzesreferenz) =>
    einzelzugriffFuerTest(async () => ({
      liste: await native.laden(),
      befunde: [],
      ordnerLesbar: true,
    }))(ref),
  hatNormenOhneTitel: () => false,
  synchronisiereNichtamtlicheTitelFuerGesetze: vi.fn(),
}));

const gesetz: GesetzDarstellung = gesetzMitNormen(['§ 1', '§ 2', '§ 3'], {
  kurztitel: 'BGB',
  langtitel: 'Bürgerliches Gesetzbuch',
  normgeber: 'de-bund',
  hatGliederungsartikel: false,
  kennung: (index) => `bgb-${index + 1}`,
});
let root: Root;
let zustand: ReturnType<typeof useAppTabs>;
let restoreErledigt: boolean;
let startAbgeschlossen: boolean;
let fensterUebertragung: ReturnType<typeof useFensterUebertragung>;
const leseAppStartZiel = vi.fn<
  () => Promise<import('@/lib/domain/app/tiefenLink').OeffentlichesLinkZiel | null>
>(async () => null);
const oeffneTiefenLinkZiel = vi.fn();

let gesetzOeffnung: ReturnType<typeof useGesetzOeffnen>;
let appAktionen: ReturnType<typeof useAppAktionen>;
function Hauptfenster({
  aktionsGesetze,
  erfasseAnzeige = false,
  elementOeffnen = vi.fn(),
}: {
  aktionsGesetze?: GesetzDarstellung[];
  erfasseAnzeige?: boolean;
  elementOeffnen?: (ziel: Navigationsziel & { modus?: OeffnenModus }) => void;
}) {
  const tabs = useAppTabs();
  const oeffnung = useGesetzOeffnen({
    ...gesetzOeffnenFixture(tabs, aktionsGesetze ?? []),

    ladeGesetz: einzelzugriffFuerTest(async () => ({
      liste: aktionsGesetze ?? (await native.laden()),
      befunde: [],
      ordnerLesbar: true,
    })),
    verlaufFristStoppen: vi.fn(),
  });
  useZuletztAngezeigt(
    erfasseAnzeige
      ? (tabs.holeTabGesetz(tabs.tabs.find((tab) => tab.id === tabs.aktiverTabId)) ?? null)
      : null,
  );
  const tiefenLinks = useTiefenLinks({
    gesetze: aktionsGesetze ?? [],
    elementOeffnen: oeffnung.elementOeffnen,
    gesetzesreferenzOeffnen: oeffnung.gesetzesreferenzOeffnen,
  });
  const aktionen = useAppAktionen({
    uebersichtExportAktionRef: { current: null },
    tabsRef: tabs.tabsRef,
    aktiverTabIdRef: tabs.aktiverTabIdRef,
    tabSchliessen: tabs.tabSchliessen,
    tabWiederherstellen: oeffnung.tabWiederherstellen,
    fensterSchliessen: vi.fn(),
    verlaufNavigieren: tabs.verlaufNavigieren,
    gesetzesreferenzOeffnen: (ziel, modus, _tabId, melden) => {
      elementOeffnen({ ...ziel, modus });
      melden?.(false);
      return () => {};
    },
    gesetzInfoInTabsPatchen: vi.fn(),
    aktivesOverlay: null,
    setAktivesOverlay: vi.fn(),
  });
  useEffect(() => {
    appAktionen = aktionen;
    gesetzOeffnung = oeffnung;
  });
  const uebertragung = useFensterUebertragung({
    tabFuerUebertragungKopieren: tabs.tabFuerUebertragungKopieren,
    tabUebertragungAbschliessen: tabs.tabUebertragungAbschliessen,
    fensterSchliessen: vi.fn(),
    tabAusUebertragungUebernehmen: tabs.tabAusUebertragungUebernehmen,
  });
  const restore = useFensterRestore(
    tabs.tabs,
    tabs.aktiverTabId,
    tabs.tabsRef,
    tabs.aktiverTabIdRef,
    tabs.verlaufLesen,
    tabs.verlaufSetzen,
    tabs.uebernehmeTabGesetz,
  );
  useEffect(() => {
    zustand = tabs;
    fensterUebertragung = uebertragung;
    restoreErledigt = restore.restoreErledigt;
  }, [tabs, uebertragung, restore.restoreErledigt]);
  const { startAbgeschlossen: abgeschlossen } = useFensterstartInitialisierung({
    ladeGesetz: tabs.ladeGesetz,
    tabAusUebertragungUebernehmen: tabs.tabAusUebertragungUebernehmen,
    tabWiederherstellen: oeffnung.tabWiederherstellen,
    setTabs: (neueTabs) => {
      native.tabsAnwenden(neueTabs);
      tabs.setTabs(neueTabs);
    },
    setAktiverTabId: tabs.setAktiverTabId,
    fensterRestore: restore,
    leseAppStartZiel: erfasseAnzeige ? tiefenLinks.leseAppStartZiel : leseAppStartZiel,
    oeffneTiefenLinkZiel: erfasseAnzeige ? tiefenLinks.oeffneTiefenLinkZiel : oeffneTiefenLinkZiel,
  });
  useEffect(() => {
    startAbgeschlossen = abgeschlossen;
  });
  return null;
}

beforeEach(() => {
  native.label = 'main';
  native.appStartUrls.mockReset().mockResolvedValue(null);
  native.letzteGeometrieLesen.mockReset().mockResolvedValue(undefined);
  native.isFullscreen.mockReset().mockResolvedValue(true);
  startAbgeschlossen = false;
  restoreErledigt = false;
  vi.clearAllMocks();
  native.invoke.mockReset().mockResolvedValue(null);
  native.removeItem.mockReset();
  native.setItem.mockReset();
  leseAppStartZiel.mockReset().mockResolvedValue(null);
  native.laden.mockReset().mockResolvedValue([gesetz]);
  native.importieren.mockReset().mockReturnValue(new Promise(() => {}));
  const { window } = parseHTML('<html><body></body></html>');
  vi.stubGlobal('window', window);
  richteNativeEreignisgrenzeEin(async (command, args) => {
    if (command === 'gesetz_dateistempel_lesen')
      return (await native.laden()).map((g: GesetzDarstellung) => ({
        name: `${g.kurztitel}_${g.normgeber}.xml`,
        dateistempel: { groesse: '1', aenderungszeit: '1' },
      }));
    return native.invoke(command, args);
  });
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const daten = new Map<string, string>();
  native.removeItem.mockImplementation((key: string) => daten.delete(key));
  native.setItem.mockImplementation((key: string, wert: string) => daten.set(key, wert));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => daten.get(key) ?? null,
    setItem: native.setItem,
    removeItem: native.removeItem,
  });
  localStorage.setItem('lexlata.geschlosseneTabs', '[]');
  root = createRoot(document.createElement('div'));
  vi.useFakeTimers();
  vi.setSystemTime(2000000000000);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each([true, false])(
  'erhält geschlossene Tabs, zeigt main einmal und öffnet den Tab samt Verlauf unter StrictMode (Inhalt: %s)',
  async (mitInhalt) => {
    speichereFensterZustand('main', {
      tabs: mitInhalt ? [{ gesetzesreferenz: referenzVon(gesetz) }] : [],
      aktiverIndex: 0,
      geometrie: { breite: 800, hoehe: 600, x: 0, y: 0, maximiert: false },
    });
    const verlauf = {
      eintraege: ['bgb-1', 'bgb-2', 'bgb-3'].map((xmlId) => ({
        gesetzesreferenz: { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber },
        xmlId,
      })),
      position: 1,
    };
    geschlossenenTabPushen({
      gesetzesreferenz: { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber },
      verlauf,
    });
    const gespeicherterStapel = localStorage.getItem('lexlata.geschlosseneTabs');
    native.invoke.mockImplementation((command: string) => {
      return Promise.resolve(command === 'letzter_tab_anfrage_lesen' ? false : null);
    });
    await act(async () =>
      root.render(
        <StrictMode>
          <Hauptfenster />
        </StrictMode>,
      ),
    );
    // Zuerst jeden React-Abschluss anwenden, danach den belegten Startstatus
    // prüfen. Warten innerhalb eines noch offenen act blockiert sonst genau
    // den Commit, dessen Effect diesen Status beobachtet.
    await vi.waitFor(async () => {
      await act(async () => {
        await Promise.resolve();
      });
      expect(startAbgeschlossen).toBe(true);
    });
    expect(native.laden).toHaveBeenCalledTimes(mitInhalt ? 2 : 0);
    expect(native.onCloseRequested).toHaveBeenCalledOnce();
    expect(native.show).toHaveBeenCalledOnce();
    expect(native.hide).not.toHaveBeenCalled();
    expect(restoreErledigt).toBe(true);
    expect(zustand.tabs).toHaveLength(1);
    expect(zustand.holeTabGesetz(zustand.tabs[0])).toBe(mitInhalt ? gesetz : undefined);
    expect(zustand.aktiverTabId).toBe(zustand.tabs[0]!.id);
    // Ohne native Besitzerzuteilung führt dieses Fenster keine gemeinsame Prüfung aus.
    expect(native.startPruefung).not.toHaveBeenCalled();
    expect(native.invoke).toHaveBeenCalledWith('startaufgaben_anmelden', expect.any(Object));
    expect(native.removeItem).not.toHaveBeenCalled();
    expect(localStorage.getItem('lexlata.geschlosseneTabs')).toBe(gespeicherterStapel);
    expect(native.invoke.mock.calls.map(([command]) => command)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^app_start_bereinigung_/)]),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(native.show).toHaveBeenCalledOnce();
    expect(localStorage.getItem('lexlata.geschlosseneTabs')).toBe(gespeicherterStapel);

    const bisherigerTab = zustand.tabs[0]!;
    await act(async () => {
      gesetzOeffnung.tabWiederherstellen();
    });
    expect(zustand.tabs).toHaveLength(2);
    expect(zustand.tabs[0]).toBe(bisherigerTab);
    const wiedergeoeffneterTab = zustand.tabs[1]!;
    expect(wiedergeoeffneterTab.id).not.toBe(bisherigerTab.id);
    expect(zustand.aktiverTabId).toBe(wiedergeoeffneterTab.id);
    expect(zustand.holeTabGesetz(wiedergeoeffneterTab)).toBe(gesetz);
    expect(wiedergeoeffneterTab.initialNorm).toBe('bgb-2');
    expect(zustand.verlaufLesen(wiedergeoeffneterTab.id)).toEqual(verlauf);
    expect(localStorage.getItem('lexlata.geschlosseneTabs')).toBe('[]');

    // Beide Richtungen bleiben nutzbar; der Zeiger stand vor dem Neustart
    // bewusst weder am Anfang noch am Ende des Verlaufs.
    for (const [richtung, erwartet] of [
      ['zurueck', verlauf.eintraege[2]],
      ['vorwaerts', verlauf.eintraege[1]],
      ['vorwaerts', verlauf.eintraege[0]],
    ] as const) {
      await act(async () =>
        zustand.verlaufNavigieren(wiedergeoeffneterTab.id, richtung, (ziel, melden) => {
          expect(ziel).toEqual(erwartet);
          melden(true);
          zustand.verlaufAktivierung(wiedergeoeffneterTab.id, ziel, 'vorgegeben');
          return () => {};
        }),
      );
    }
    expect(zustand.verlaufLesen(wiedergeoeffneterTab.id)).toEqual({
      ...verlauf,
      position: 0,
      aktivesElement: verlauf.eintraege[0],
    });
    expect(native.show).toHaveBeenCalledOnce();
    expect(native.removeItem).not.toHaveBeenCalled();
  },
);

async function starteHauptfenster() {
  await act(async () => root.render(<Hauptfenster />));
  await act(async () => {
    await Promise.resolve();
  });
}

it('entfernt übernommenes main dauerhaft trotz ausstehendem Speichertimer und öffnet seine Tabs im neuen Fenster wieder', async () => {
  const anderesGesetz = { ...gesetz, kurztitel: 'StGB' };
  native.laden.mockResolvedValue([gesetz, anderesGesetz]);
  // Weitere Hauptfenster offen: Schließen wie bisher (fenster/beenden.rs).
  native.invoke.mockImplementation(
    async (befehl: string) => befehl === 'hauptfenster_schliessen_freigeben',
  );
  speichereFensterZustand('fenster-a', {
    tabs: [
      { gesetzesreferenz: referenzVon(gesetz) },
      { gesetzesreferenz: referenzVon(anderesGesetz) },
    ],
    aktiverIndex: 1,
  });
  const weitererZustand = { tabs: [{ gesetzesreferenz: referenzVon(gesetz) }], aktiverIndex: 0 };
  speichereFensterZustand('fenster-b', weitererZustand);
  await starteHauptfenster();
  const aktiverTab = zustand.tabs[1]!;
  const verlauf = {
    eintraege: [
      {
        gesetzesreferenz: {
          kurztitel: anderesGesetz.kurztitel,
          normgeber: anderesGesetz.normgeber,
        },
        xmlId: 'bgb-2',
      },
    ],
    position: 0,
  };
  act(() => zustand.verlaufSetzen(aktiverTab.id, verlauf));
  await act(async () => {
    await native.onCloseRequested.mock.calls[0]![0]({ preventDefault: vi.fn() });
  });
  expect(native.destroy).toHaveBeenCalledOnce();
  expect(ladeFensterZustand('main')).toBeNull();
  // Native Zerstörung und React-Unmount sind getrennt: der Timer darf
  // bereits vor dem Unmount keinen gelöschten Fenstereintrag neu anlegen.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(ladeFensterZustand('main')).toBeNull();
  expect(ladeFensterZustand('fenster-a')).toBeNull();
  expect(ladeFensterZustand('fenster-b')).toEqual(weitererZustand);
  await act(async () => root.unmount());
  root = createRoot(document.createElement('div'));
  native.label = 'fenster-neu';
  native.invoke.mockImplementation(
    async (command: string) => command === 'letzter_tab_anfrage_lesen',
  );
  await starteHauptfenster();
  expect(startAbgeschlossen).toBe(true);
  expect(zustand.tabs).toHaveLength(1);
  expect(zustand.holeTabGesetz(zustand.tabs[0])).toBe(anderesGesetz);
  expect(zustand.tabs[0]!.initialNorm).toBe('bgb-2');
  expect(zustand.verlaufLesen(zustand.tabs[0]!.id)).toEqual(verlauf);
  await act(async () => gesetzOeffnung.tabWiederherstellen());
  expect(
    zustand.tabs.map((tab) =>
      zustand.holeTabGesetz(tab)
        ? gesetzesreferenzSchluessel(geladenesTabGesetz(zustand, tab))
        : undefined,
    ),
  ).toEqual([gesetzesreferenzSchluessel(anderesGesetz), gesetzesreferenzSchluessel(gesetz)]);
  expect(geschlossenenTabPoppen()).toBeNull();
});

it('speichert nach Unmount eines übernommenen Fensters keinen veralteten Tabstand', async () => {
  native.invoke.mockResolvedValue(false);
  speichereFensterZustand('fenster-a', {
    tabs: [{ gesetzesreferenz: referenzVon(gesetz) }],
    aktiverIndex: 0,
  });
  await starteHauptfenster();
  await act(async () => root.unmount());
  native.setItem.mockClear();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(native.setItem).not.toHaveBeenCalled();
});

it('verwirft eine beim Schließen noch laufende Geometrieabfrage', async () => {
  // Weitere Hauptfenster offen: Schließen wie bisher (fenster/beenden.rs).
  native.invoke.mockImplementation(
    async (befehl: string) => befehl === 'hauptfenster_schliessen_freigeben',
  );
  speichereFensterZustand('fenster-a', {
    tabs: [{ gesetzesreferenz: referenzVon(gesetz) }],
    aktiverIndex: 0,
  });
  await starteHauptfenster();
  let beendeAbfrage!: (wert: boolean) => void;
  native.isFullscreen.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        beendeAbfrage = resolve;
      }),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(250);
  });
  await act(async () => {
    await native.onCloseRequested.mock.calls[0]![0]({ preventDefault: vi.fn() });
  });
  await act(async () => {
    beendeAbfrage(true);
  });
  expect(ladeFensterZustand('main')).toBeNull();
});

it('zieht einen übernommenen Tab mit Sitzungszustand in ein neues Fenster und erhält den verbleibenden main-Tab', async () => {
  native.invoke.mockResolvedValue(false);
  speichereFensterZustand('fenster-a', {
    tabs: [{ gesetzesreferenz: referenzVon(gesetz) }, { gesetzesreferenz: referenzVon(gesetz) }],
    aktiverIndex: 1,
  });
  await starteHauptfenster();
  const verbleibenderTab = zustand.tabs[0]!;
  const tab = zustand.tabs[1]!;
  const key = tab.id + '-' + gesetzesreferenzSchluessel(gesetz);
  const verlauf = {
    eintraege: [
      {
        gesetzesreferenz: { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber },
        xmlId: 'bgb-2',
      },
    ],
    position: 0,
  };
  const scrollPosition = { index: 2, offset: 37 };
  act(() => zustand.verlaufSetzen(tab.id, verlauf));
  zustand.scrollPositionenRef.current[key] = scrollPosition;
  zustand.einklappZustandRef.current[key] = {
    ueberschriften: new Set(),
    normen: new Set(['bgb-1']),
    aktivesElementId: 'bgb-2',
  };
  native.invoke.mockClear();
  let abschluss: Promise<void> | undefined;
  await act(async () => {
    abschluss = fensterUebertragung.handleTabHerausziehen(tab.id);
  });
  const ablegen = native.invoke.mock.calls.find(
    ([command]) => command === 'tab_uebertragung_ablegen',
  )!;
  const ziel = ablegen[1] as { label: string; payload: string };
  expect(native.invoke).toHaveBeenCalledWith('fenster_oeffnen_mit_label', {
    label: ziel.label,
    geometrie: null,
  });
  await act(async () =>
    native.bestaetigungsEmpfaenger!({
      payload: { kennung: JSON.parse(ziel.payload).transport.kennung, uebernommen: true },
    }),
  );
  await act(async () => abschluss);
  expect(zustand.tabs).toEqual([verbleibenderTab]);
  expect(zustand.aktiverTabId).toBe(verbleibenderTab.id);
  expect(localStorage.getItem('lexlata.geschlosseneTabs')).toBe('[]');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(ladeFensterZustand('main')?.tabs).toEqual([{ gesetzesreferenz: referenzVon(gesetz) }]);
  await act(async () => root.unmount());
  root = createRoot(document.createElement('div'));
  native.label = ziel.label;
  native.invoke.mockImplementation(async (command: string) =>
    command === 'tab_uebertragung_abholen' ? ziel.payload : false,
  );
  await starteHauptfenster();
  expect(zustand.tabs).toHaveLength(1);
  const angekommen = zustand.tabs[0]!;
  expect(zustand.holeTabGesetz(angekommen)).toBe(gesetz);
  expect(zustand.aktiverTabId).toBe(angekommen.id);
  expect(zustand.verlaufLesen(angekommen.id)).toEqual(verlauf);
  expect(
    zustand.scrollPositionenRef.current[angekommen.id + '-' + gesetzesreferenzSchluessel(gesetz)],
  ).toEqual(scrollPosition);
  expect(
    zustand.einklappZustandRef.current[angekommen.id + '-' + gesetzesreferenzSchluessel(gesetz)],
  ).toEqual({
    ueberschriften: new Set(),
    normen: new Set(['bgb-1']),
    aktivesElementId: 'bgb-2',
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(ladeFensterZustand(ziel.label)?.tabs).toEqual([{ gesetzesreferenz: referenzVon(gesetz) }]);
  expect(ladeFensterZustand('main')?.tabs).toEqual([{ gesetzesreferenz: referenzVon(gesetz) }]);
  expect(localStorage.getItem('lexlata.geschlosseneTabs')).toBe('[]');
});

it.each([
  { mitMain: false, mitWeiterem: false },
  { mitMain: true, mitWeiterem: false },
  { mitMain: false, mitWeiterem: true },
  { mitMain: true, mitWeiterem: true },
])(
  'übernimmt vor Tabanwendung und weiteren Fenstern; zweiter Start erhält den Bestand (%j)',
  async ({ mitMain, mitWeiterem }) => {
    const geometrie = { breite: 920, hoehe: 710, x: 70, y: -20, maximiert: false };
    const anderesGesetz = { ...gesetz, kurztitel: 'StGB' };
    native.laden.mockResolvedValue([gesetz, anderesGesetz]);
    if (mitMain) speichereFensterZustand('main', { tabs: [], aktiverIndex: -1 });
    const quelle = {
      tabs: [
        { gesetzesreferenz: referenzVon(gesetz) },
        { gesetzesreferenz: referenzVon(anderesGesetz) },
      ],
      aktiverIndex: 1,
      geometrie,
    };
    const weitererZustand = { tabs: [{ gesetzesreferenz: referenzVon(gesetz) }], aktiverIndex: 0 };
    // Speicherreihenfolge absichtlich entgegen der stabilen Auswahl.
    if (mitWeiterem) speichereFensterZustand('fenster-b', weitererZustand);
    speichereFensterZustand('fenster-a', quelle);
    native.setItem.mockClear();
    native.invoke.mockImplementation(async (command: string) => {
      if (command === 'fenster_oeffnen_mit_label') {
        expect(ladeFensterZustand('main')).toEqual(quelle);
        expect(ladeFensterZustand('fenster-a')).toBeNull();
      }
      return false;
    });
    const speicherSchreiben = native.setItem.getMockImplementation()!;
    native.setItem.mockImplementationOnce((key: string, wert: string) => {
      // Noch kein übernommener Tab angewendet, solange die Map nicht geschrieben ist.
      expect(native.tabsAnwenden).not.toHaveBeenCalled();
      expect(zustand.holeTabGesetz(zustand.tabs[0])).toBeUndefined();
      speicherSchreiben(key, wert);
    });
    await starteHauptfenster();
    expect(startAbgeschlossen).toBe(true);
    expect(restoreErledigt).toBe(true);
    expect(
      zustand.tabs.map((tab) =>
        zustand.holeTabGesetz(tab)
          ? gesetzesreferenzSchluessel(geladenesTabGesetz(zustand, tab))
          : undefined,
      ),
    ).toEqual([gesetzesreferenzSchluessel(gesetz), gesetzesreferenzSchluessel(anderesGesetz)]);
    expect(zustand.aktiverTabId).toBe(zustand.tabs[1]!.id);
    expect(native.setItem).toHaveBeenCalledTimes(1);
    expect(native.geometrieSchreiben).toHaveBeenCalledWith(geometrie);
    expect(native.geometrieSchreiben.mock.invocationCallOrder[0]!).toBeLessThan(
      native.show.mock.invocationCallOrder[0]!,
    );
    expect(native.show).toHaveBeenCalledOnce();
    const oeffnungsAufrufe = mitWeiterem
      ? [['fenster_oeffnen_mit_label', { label: 'fenster-b', geometrie: null }]]
      : [];
    expect(
      native.invoke.mock.calls.filter(([command]) => command === 'fenster_oeffnen_mit_label'),
    ).toEqual(oeffnungsAufrufe);
    expect(ladeFensterZustand('fenster-b')).toEqual(mitWeiterem ? weitererZustand : null);
    const vorNeustart = localStorage.getItem('lexlata.fenster');
    // Direkt neu starten, ohne einen regulären Speichertimer auszuführen.
    await act(async () => root.unmount());
    root = createRoot(document.createElement('div'));
    native.invoke.mockClear();
    await starteHauptfenster();
    expect(localStorage.getItem('lexlata.fenster')).toBe(vorNeustart);
    expect(
      zustand.tabs.map((tab) =>
        zustand.holeTabGesetz(tab)
          ? gesetzesreferenzSchluessel(geladenesTabGesetz(zustand, tab))
          : undefined,
      ),
    ).toEqual([gesetzesreferenzSchluessel(gesetz), gesetzesreferenzSchluessel(anderesGesetz)]);
    expect(
      native.invoke.mock.calls.filter(([command]) => command === 'fenster_oeffnen_mit_label'),
    ).toEqual(oeffnungsAufrufe);
  },
);

it('erhält die gewählte eigene Geometrie beim sofortigen zweiten Start ohne Quellgeometrie', async () => {
  const geometrie = { breite: 920, hoehe: 710, x: 70, y: -20, maximiert: false };
  const fallback = { ...geometrie, x: 300, y: 200 };
  native.letzteGeometrieLesen.mockResolvedValue(fallback);
  speichereFensterZustand('main', { tabs: [], aktiverIndex: -1, geometrie });
  speichereFensterZustand('fenster-a', {
    tabs: [{ gesetzesreferenz: referenzVon(gesetz) }],
    aktiverIndex: 0,
  });
  native.setItem.mockClear();
  await starteHauptfenster();
  expect(native.setPosition).toHaveBeenLastCalledWith(expect.objectContaining({ x: 70, y: -20 }));
  expect(native.geometrieSchreiben).toHaveBeenCalledWith(geometrie);
  expect(native.setItem).toHaveBeenCalledTimes(1);
  expect(ladeFensterZustand('fenster-a')).toBeNull();
  // Ohne Speichertimer unmittelbar neu starten; die abweichende Datei bleibt vorhanden.
  await act(async () => root.unmount());
  root = createRoot(document.createElement('div'));
  native.setPosition.mockClear();
  await starteHauptfenster();
  expect(native.setPosition).toHaveBeenLastCalledWith(expect.objectContaining({ x: 70, y: -20 }));
  expect(ladeFensterZustand('main')?.geometrie).toEqual(geometrie);
  expect(native.setItem).toHaveBeenCalledTimes(1);
});

it('zeigt Übernahmefehler sichtbar und erhält Zustände nach Timern und Schließen bei gesperrtem Normalstart', async () => {
  speichereFensterZustand('main', { tabs: [], aktiverIndex: -1 });
  speichereFensterZustand('fenster-a', {
    tabs: [{ gesetzesreferenz: referenzVon(gesetz) }],
    aktiverIndex: 0,
  });
  speichereFensterZustand('fenster-b', {
    tabs: [{ gesetzesreferenz: referenzVon(gesetz) }],
    aktiverIndex: 0,
  });
  speichereFensterZustand('fenster-leer', { tabs: [], aktiverIndex: -1 });
  const vorher = localStorage.getItem('lexlata.fenster');
  const stapel = localStorage.getItem('lexlata.geschlosseneTabs');
  const speicherSchreiben = native.setItem.getMockImplementation()!;
  // Weitere Hauptfenster offen: Schließen wie bisher (fenster/beenden.rs).
  native.invoke.mockImplementation(
    async (befehl: string) => befehl === 'hauptfenster_schliessen_freigeben',
  );
  leseAppStartZiel.mockResolvedValue({ kurztitel: 'BGB', normgeber: 'de-bund', bezeichnung: '1' });
  native.setItem.mockImplementation(() => {
    throw new Error('Speicher voll');
  });
  const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await starteHauptfenster();
    expect(native.show).toHaveBeenCalledOnce();
    expect(native.center).toHaveBeenCalledOnce();
    expect(getSnapshot()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          typ: 'fehler',
          text: expect.stringMatching(/Fenster.*nicht wiederhergestellt.*erneuten App-Start/),
        }),
      ]),
    );
    expect(restoreErledigt).toBe(false);
    expect(startAbgeschlossen).toBe(false);
    expect(zustand.tabs).toHaveLength(1);
    expect(zustand.holeTabGesetz(zustand.tabs[0])).toBeUndefined();
    expect(native.tabsAnwenden).not.toHaveBeenCalled();
    expect(oeffneTiefenLinkZiel).not.toHaveBeenCalled();
    expect(native.invoke.mock.calls.map(([command]) => command)).not.toContain(
      'fenster_oeffnen_mit_label',
    );
    expect(native.invoke.mock.calls.map(([command]) => command)).not.toContain(
      'letzter_tab_anfrage_lesen',
    );
    expect(native.geometrieSchreiben).not.toHaveBeenCalled();
    // Schreibschutz wieder aufheben: Timer/Schließen dürfen auch jetzt nichts verändern.
    const schreiben = native.setItem.mockClear().mockImplementation(speicherSchreiben);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    await act(async () => {
      await native.onCloseRequested.mock.calls[0]![0]({ preventDefault: vi.fn() });
    });
    expect(native.destroy).toHaveBeenCalledOnce();
    expect(schreiben).not.toHaveBeenCalled();
    expect(localStorage.getItem('lexlata.fenster')).toBe(vorher);
    expect(localStorage.getItem('lexlata.geschlosseneTabs')).toBe(stapel);
  } finally {
    protokoll.mockRestore();
  }
});

// Gesetz und Verlauf dürfen auseinanderfallen: Öffnen eines ganzen Gesetzes
// und fehlgeschlagene Verlaufsschritte schreiben keinen neuen Eintrag.
it.each([false, true])(
  'öffnet Tabgesetz B regulär bei A am Zeiger (fehlgeschlagener Schritt: %s)',
  async (fehlgeschlagen) => {
    await act(async () => root.render(<Hauptfenster />));
    const anderes = { ...gesetz, kurztitel: 'B' };
    await act(async () => zustand.gesetzOeffnen(gesetz, 'bgb-2', 'aktiver-tab'));
    const tabId = zustand.aktiverTabId!;
    const referenz = { kurztitel: gesetz.kurztitel, normgeber: gesetz.normgeber };
    await act(async () =>
      zustand.verlaufHinzufuegen(tabId, { gesetzesreferenz: referenz, xmlId: 'bgb-2' }),
    );
    await act(async () => zustand.gesetzOeffnen(anderes, undefined, 'immer-aktiver-tab'));
    if (fehlgeschlagen) {
      await act(async () =>
        zustand.verlaufHinzufuegen(tabId, {
          gesetzesreferenz: { kurztitel: 'B', normgeber: 'de-bund' },
          xmlId: 'bgb-3',
        }),
      );
      const oeffnen = vi.fn();
      await act(async () =>
        root.render(<Hauptfenster aktionsGesetze={[anderes]} elementOeffnen={oeffnen} />),
      );
      await act(async () => appAktionen.verlaufSchrittUndOeffnen('zurueck'));
      expect(oeffnen).toHaveBeenCalledExactlyOnceWith({
        gesetzesreferenz: referenz,
        xmlId: 'bgb-2',
        modus: 'immer-aktiver-tab',
        ohneVerlauf: true,
      });
      expect(zustand.verlaufLesen(tabId)!.position).toBe(0);
    }
    const verlauf = structuredClone(zustand.verlaufLesen(tabId));
    await act(async () => zustand.tabSchliessen(tabId));
    native.laden.mockResolvedValue([anderes]);
    await act(async () => gesetzOeffnung.tabWiederherstellen());
    const wieder = zustand.tabs.find((tab) => tab.id === zustand.aktiverTabId)!;
    expect(zustand.holeTabGesetz(wieder)).toBe(anderes);
    expect(wieder.initialNorm).toBe(fehlgeschlagen ? 'bgb-3' : 'bgb-1');
    expect(zustand.verlaufLesen(wieder.id)).toEqual(verlauf);
  },
);

it.each(['bgb-2', 'fehlt'])(
  'verwendet bei passender Referenz ausschließlich das XML-ID-Ziel %s',
  async (xmlId) => {
    await act(async () => root.render(<Hauptfenster />));
    const referenz = { kurztitel: 'bgb', normgeber: 'de-bund' };
    const verlauf = { eintraege: [{ gesetzesreferenz: referenz, xmlId }], position: 0 };
    geschlossenenTabPushen({
      gesetzesreferenz: { kurztitel: 'BGB', normgeber: 'de-bund' },
      verlauf,
    });
    const vorher = zustand.tabs;
    await act(async () => gesetzOeffnung.tabWiederherstellen());
    if (xmlId === 'fehlt') {
      expect(zustand.tabs).toHaveLength(vorher.length + 1);
      const wieder = zustand.tabs.find((tab) => tab.id === zustand.aktiverTabId)!;
      expect(zustand.holeTabGesetz(wieder)).toBe(gesetz);
      expect(wieder.initialNorm).toBe('bgb-1');
      expect(zustand.verlaufLesen(wieder.id)).toEqual(verlauf);
      expect(getSnapshot().at(-1)?.text).toBe('Norm nicht gefunden.');
    } else {
      const wieder = zustand.tabs.find((tab) => tab.id === zustand.aktiverTabId)!;
      expect(zustand.holeTabGesetz(wieder)).toBe(gesetz);
      expect(wieder.initialNorm).toBe(xmlId);
      expect(zustand.verlaufLesen(wieder.id)).toEqual(verlauf);
    }
  },
);

it('öffnet Verlauf nach Gesetzesreferenz und trennt gleiche Kurztitel', async () => {
  await act(async () => root.render(<Hauptfenster />));
  const tabId = zustand.aktiverTabId!;
  const bund = { ...gesetz, kurztitel: 'X' };
  const bw = { ...bund, normgeber: 'de-bw' };
  await act(async () => {
    zustand.verlaufHinzufuegen(tabId, {
      gesetzesreferenz: { kurztitel: 'x', normgeber: 'de-bund' },
      xmlId: 'bgb-2',
    });
    zustand.verlaufHinzufuegen(tabId, {
      gesetzesreferenz: { kurztitel: 'X', normgeber: 'de-bw' },
      xmlId: 'bgb-3',
    });
  });
  const oeffnen = vi.fn();
  await act(async () =>
    root.render(<Hauptfenster aktionsGesetze={[bw, bund]} elementOeffnen={oeffnen} />),
  );
  await act(async () => appAktionen.verlaufSchrittUndOeffnen('zurueck'));
  expect(oeffnen).toHaveBeenCalledExactlyOnceWith({
    gesetzesreferenz: { kurztitel: 'x', normgeber: 'de-bund' },
    xmlId: 'bgb-2',
    modus: 'immer-aktiver-tab',
    ohneVerlauf: true,
  });
  expect(zustand.verlaufLesen(tabId)!.eintraege).toHaveLength(2);
});

it('importiert beim automatischen Startrestore kein gelöschtes Gesetz und verbraucht keinen geschlossenen Tab', async () => {
  native.laden.mockResolvedValue([]);
  native.invoke.mockResolvedValue(false);
  speichereFensterZustand('main', {
    tabs: [{ gesetzesreferenz: referenzVon(gesetz) }],
    aktiverIndex: 0,
  });
  const verlauf = { eintraege: [], position: 0 };
  geschlossenenTabPushen({ gesetzesreferenz: gesetz, verlauf });
  const stapel = localStorage.getItem('lexlata.geschlosseneTabs');
  await starteHauptfenster();
  expect(startAbgeschlossen).toBe(true);
  expect(native.importieren).not.toHaveBeenCalled();
  expect(zustand.tabs).toHaveLength(1);
  expect(zustand.holeTabGesetz(zustand.tabs[0])).toBeUndefined();
  expect(localStorage.getItem('lexlata.geschlosseneTabs')).toBe(stapel);
});

it('setzt den App-Start-Menüwunsch für einen gelöschten geschlossenen Tab im Initial-Tab über Sofortimport fort', async () => {
  native.label = 'fenster-neu';
  native.laden.mockResolvedValue([]);
  native.invoke.mockImplementation(
    async (command: string) => command === 'letzter_tab_anfrage_lesen',
  );
  const verlauf = {
    eintraege: [{ gesetzesreferenz: { kurztitel: 'BGB', normgeber: 'de-bund' }, xmlId: 'bgb-2' }],
    position: 0,
  };
  geschlossenenTabPushen({ gesetzesreferenz: gesetz, verlauf });
  let fertig!: (wert: unknown) => void;
  native.importieren.mockReturnValue(
    new Promise((resolve) => {
      fertig = resolve;
    }),
  );
  await starteHauptfenster();
  expect(zustand.tabs).toHaveLength(1);
  const tabId = zustand.tabs[0]!.id;
  expect(zustand.holeTabGesetz(zustand.tabs[0])).toBeUndefined();
  expect(native.importieren).toHaveBeenCalledExactlyOnceWith({
    kurztitel: 'BGB',
    normgeber: 'de-bund',
  });
  native.laden.mockResolvedValue([gesetz]);
  const bestand = { liste: [gesetz], befunde: [], ordnerLesbar: true };
  await act(async () =>
    fertig({
      art: 'erfolg',
      gesetz,
      bestandspruefung: { ...bestand, liste: [] },
      ladeabschluss: bestand,
    }),
  );
  expect(zustand.tabs[0]).toMatchObject({
    gesetzesreferenz: referenzVon(gesetz),
    initialNorm: 'bgb-2',
  });
  expect(zustand.verlaufLesen(tabId)).toEqual(verlauf);
  expect(geschlossenenTabPoppen()).toBeNull();
});

it('zeigt einen neu übertragenen Tab ohne Sammellauf sofort ladend', async () => {
  native.label = 'gesetz-neu';
  const transport = {
    gesetzesreferenz: referenzVon(gesetz),
    scrollPosition: { index: 1, offset: 19 },
    transport: { kennung: 'frueh', quellLabel: 'quelle', gueltigBis: Date.now() + 30_000 },
  };
  native.invoke.mockImplementation(async (command: string) =>
    command === 'tab_uebertragung_abholen' ? JSON.stringify(transport) : false,
  );
  let einzelFertig = (_liste: GesetzDarstellung[]) => {};
  native.laden.mockResolvedValueOnce([gesetz]).mockImplementationOnce(
    () =>
      new Promise<GesetzDarstellung[]>((resolve) => {
        einzelFertig = resolve;
      }),
  );
  await act(async () => root.render(<Hauptfenster />));
  expect(native.show).toHaveBeenCalledOnce();
  expect(native.senden).toHaveBeenCalledWith('quelle', 'tab-uebertragung-bestaetigt', {
    kennung: 'frueh',
    uebernommen: true,
  });
  expect(startAbgeschlossen).toBe(true);
  expect(zustand.tabs[0]).toMatchObject({
    gesetzesreferenz: referenzVon(gesetz),
    ladezustand: 'ladend',
    ausstehendeAnsicht: { scrollPosition: { index: 1, offset: 19 } },
  });
  await act(async () => einzelFertig([gesetz]));
  expect(zustand.tabs[0]?.ladezustand).toBe('geladen');
  expect(native.laden).toHaveBeenCalledTimes(2);
  expect(startAbgeschlossen).toBe(true);
  expect(native.show).toHaveBeenCalledOnce();
});

it.each([
  ['BGB', false, true],
  ['Fehlend', false, false],
  ['BGB', true, false],
] as const)(
  'bestätigt im neuen Fenster %s (abgelaufen %s) mit dem tatsächlichen Ergebnis',
  async (kurztitel, abgelaufen, erwartet) => {
    const uebertragung = {
      gesetzesreferenz: { kurztitel, normgeber: 'de-bund' },
      transport: {
        kennung: 'beimAppStart',
        quellLabel: 'quelle',
        gueltigBis: Date.now() + (abgelaufen ? -1 : 30_000),
      },
    };
    native.invoke.mockImplementation(async (command: string) =>
      command === 'tab_uebertragung_abholen' ? JSON.stringify(uebertragung) : false,
    );
    await starteHauptfenster();
    expect(native.senden).toHaveBeenCalledWith('quelle', 'tab-uebertragung-bestaetigt', {
      kennung: 'beimAppStart',
      uebernommen: erwartet,
    });
    expect(zustand.tabs.some((tab) => zustand.holeTabGesetz(tab)?.kurztitel === kurztitel)).toBe(
      erwartet,
    );
  },
);

it.each(['main', 'fenster-zwei'] as const)(
  'legt beim Wiederherstellen in %s je Tab das Startelement in den Verlauf',
  async (label) => {
    native.label = label;
    const anderes = { ...gesetz, kurztitel: 'Zweites' };
    native.laden.mockResolvedValue([gesetz, anderes]);
    const { speichereAktivierung } =
      await import('@/lib/persistenz/nutzerdaten/aktivierungSpeicher');
    const gespeichert = gesetz.elemente[1];
    assert(gespeichert);
    speichereAktivierung(gesetz, gespeichert);
    speichereFensterZustand(label, {
      tabs: [{ gesetzesreferenz: referenzVon(gesetz) }, { gesetzesreferenz: referenzVon(anderes) }],
      aktiverIndex: 1,
    });
    await act(async () =>
      root.render(
        <StrictMode>
          <Hauptfenster />
        </StrictMode>,
      ),
    );
    expect(zustand.tabs).toHaveLength(2);
    expect(zustand.tabs.map((tab) => tabsVerlauf(tab.id))).toEqual([['bgb-2'], ['bgb-1']]);
    function tabsVerlauf(id: string) {
      return zustand.verlaufLesen(id)?.eintraege.map((e) => e.xmlId);
    }
  },
);

function anzeigeSchreibzugriffe() {
  return native.setItem.mock.calls.filter(([key]) => key === 'lexlata.zuletztAngezeigt');
}
function anzeigezeit(gesetz: GesetzDarstellung) {
  return ladeAnzeigezeitpunkte().get(gesetzesreferenzSchluessel(gesetz));
}
it('erfasst echte Öffnung, Tabwechsel, Gesetzeswechsel, Wiederöffnen und das nach Schließen angezeigte Gesetz', async () => {
  const anderes = { ...gesetz, kurztitel: 'StGB' };
  native.laden.mockResolvedValue([gesetz, anderes]);
  await act(async () =>
    root.render(<Hauptfenster erfasseAnzeige aktionsGesetze={[gesetz, anderes]} />),
  );
  expect(anzeigeSchreibzugriffe()).toHaveLength(0);
  await act(async () => gesetzOeffnung.elementOeffnen({ gesetz }));
  expect(anzeigezeit(gesetz)).toBe(2000000000000);
  const ersterTab = zustand.aktiverTabId;
  assert(ersterTab);
  await act(async () => gesetzOeffnung.elementOeffnen({ gesetz: anderes, modus: 'immer-neu' }));
  const zweiterTab = zustand.aktiverTabId;
  assert(zweiterTab);
  expect(anzeigezeit(anderes)).toBe(2000000000001);
  await act(async () => zustand.setAktiverTabId(ersterTab));
  expect(anzeigezeit(gesetz)).toBe(2000000000002);
  // Derselbe Öffnungsweg verarbeitet Verweise und Gesetzeskurzbefehle im aktiven Tab.
  await act(async () =>
    gesetzOeffnung.elementOeffnen({ gesetz: anderes, modus: 'immer-aktiver-tab' }),
  );
  expect(zustand.aktiverTabId).toBe(ersterTab);
  expect(anzeigezeit(anderes)).toBe(2000000000003);
  await act(async () => gesetzOeffnung.elementOeffnen({ gesetz, modus: 'immer-aktiver-tab' }));
  await act(async () => zustand.tabSchliessen(ersterTab));
  expect(zustand.aktiverTabId).toBe(zweiterTab);
  expect(anzeigezeit(anderes)).toBe(2000000000005);
  await act(async () => gesetzOeffnung.tabWiederherstellen());
  expect(zustand.holeTabGesetz(zustand.tabs.find((tab) => tab.id === zustand.aktiverTabId))).toBe(
    gesetz,
  );
  expect(anzeigezeit(gesetz)).toBe(2000000000006);
});
it('ignoriert gleiche Gesetze und Neuladen und überbrückt beim echten Wiederöffnen A → leer → A gegenüber dem zweiten Fenster', async () => {
  const b = { ...gesetz, kurztitel: 'B' };
  const c = { ...gesetz, kurztitel: 'C' };
  await act(async () =>
    root.render(<Hauptfenster erfasseAnzeige aktionsGesetze={[gesetz, b, c]} />),
  );
  await act(async () => gesetzOeffnung.elementOeffnen({ gesetz }));
  const ersterTab = zustand.aktiverTabId;
  assert(ersterTab);
  await act(async () => gesetzOeffnung.elementOeffnen({ gesetz, modus: 'immer-neu' }));
  await act(async () => zustand.setAktiverTabId(ersterTab));
  await act(async () =>
    zustand.gesetzeAktualisierenInTabs(
      [{ ...gesetz, langtitel: 'Neuer Titel' }],
      [referenzVon(gesetz)],
    ),
  );
  expect(zustand.tabs.find((tab) => tab.id === ersterTab)?.reloadVersion).toBe(1);
  expect(anzeigeSchreibzugriffe()).toHaveLength(1);
  merkeAnzeige(b);
  const stand = ladeAnzeigezeitpunkte();
  const tabId = zustand.aktiverTabId;
  assert(tabId);
  await act(async () => zustand.tabSchliessen(tabId));
  await act(async () => root.render(<Hauptfenster erfasseAnzeige />));
  let ladenAbschliessen: ((gesetze: GesetzDarstellung[]) => void) | undefined;
  native.laden.mockReturnValueOnce(
    new Promise((resolve) => {
      ladenAbschliessen = resolve;
    }),
  );
  await act(async () => gesetzOeffnung.tabWiederherstellen());
  expect(ladeAnzeigezeitpunkte()).toEqual(stand);
  const abschliessen = ladenAbschliessen;
  assert(abschliessen);
  await act(async () => abschliessen([gesetz]));
  expect(
    zustand.holeTabGesetz(zustand.tabs.find((tab) => tab.id === zustand.aktiverTabId)),
  ).toEqual(gesetz);
  expect(ladeAnzeigezeitpunkte()).toEqual(stand);
  expect(anzeigeSchreibzugriffe()).toHaveLength(2);
  await act(async () =>
    root.render(<Hauptfenster erfasseAnzeige aktionsGesetze={[gesetz, b, c]} />),
  );
  await act(async () => gesetzOeffnung.elementOeffnen({ gesetz: c, modus: 'immer-aktiver-tab' }));
  expect(anzeigezeit(c)).toBe(2000000000002);
  await act(async () => gesetzOeffnung.elementOeffnen({ gesetz, modus: 'immer-aktiver-tab' }));
  expect(anzeigezeit(gesetz)).toBe(2000000000003);
});
it.each([false, true])(
  'erfasst beim echten App-Start das aktive wiederhergestellte Gesetz ohne Neuschreiben des jüngsten (vorhanden: %s)',
  async (vorhanden) => {
    const inaktivesGesetz = { ...gesetz, kurztitel: 'Inaktiv' };
    native.laden.mockResolvedValue([inaktivesGesetz, gesetz]);
    speichereFensterZustand('main', {
      tabs: [
        { gesetzesreferenz: referenzVon(inaktivesGesetz) },
        { gesetzesreferenz: referenzVon(gesetz) },
      ],
      aktiverIndex: 1,
    });
    if (vorhanden) merkeAnzeige(gesetz);
    native.setItem.mockClear();
    await act(async () => root.render(<Hauptfenster erfasseAnzeige />));
    expect(startAbgeschlossen).toBe(true);
    expect(anzeigezeit(gesetz)).toBe(2000000000000);
    expect(anzeigezeit(inaktivesGesetz)).toBeUndefined();
    expect(anzeigeSchreibzugriffe()).toHaveLength(vorhanden ? 0 : 1);
  },
);
it('erfasst einen App-Start-Link über echte App-Start-, Link- und Öffnungshooks', async () => {
  native.appStartUrls.mockResolvedValue(['lexlata://de-bund/bgb/2']);
  await act(async () => root.render(<Hauptfenster erfasseAnzeige />));
  expect(startAbgeschlossen).toBe(true);
  expect(zustand.tabs.find((tab) => tab.id === zustand.aktiverTabId)).toMatchObject({
    gesetzesreferenz: referenzVon(gesetz),
    initialNorm: 'bgb-2',
  });
  expect(anzeigezeit(gesetz)).toBe(2000000000000);
  expect(anzeigeSchreibzugriffe()).toHaveLength(1);
});

it('erfasst das über den echten Übernahmehook aktivierte Gesetz eines übertragenen Tabs', async () => {
  await act(async () => root.render(<Hauptfenster erfasseAnzeige />));
  await act(async () =>
    zustand.tabAusUebertragungUebernehmen({ gesetzesreferenz: referenzVon(gesetz) }, true),
  );
  expect(anzeigezeit(gesetz)).toBe(2000000000000);
  expect(anzeigeSchreibzugriffe()).toHaveLength(1);
});
