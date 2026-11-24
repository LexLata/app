// Kombiniert produktive Fensterstartinitialisierung und Tiefenlinkverarbeitung über mehrere Fenster.
// Nur native Zugriffe, Dateisynchronisierung und die Hook-Laufzeit werden ersetzt.
import { tabFuerTest } from '@/test/tabs/tabFabriken';
import { normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { referenzVon } from '@/lib/domain/gesetzesreferenz';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ElementOeffnenParams, Tab, TabUebertragung } from '@/lib/domain/appTypes';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { alleBannerSchliessen } from '@/lib/banner/banner.index';
import { useTiefenLinks } from './useTiefenLinks';
import { useFensterstartInitialisierung } from './useFensterstartInitialisierung';

const umgebung = vi.hoisted(() => ({
  invoke: vi.fn(),
  startPruefung: vi.fn(async () => {}),
  restoreFehler: false,
  titelKandidaten: false,
  label: 'main',
  fensterFehler: false,
  refs: [] as Array<{ current: unknown }>,
  index: 0,
  effekte: [] as Array<() => void | (() => void)>,
  listener: new Map<string, (event: { payload: string[] }) => void>(),
  getCurrent: vi.fn(),
  uebertragungAbholen: vi.fn(),
  letzterTabLesen: vi.fn(),
  synchronisiereIndizes: vi.fn(),
  synchronisiereTitel: vi.fn(),
}));
vi.mock('@/lib/markierungen/markierungen.index', () => ({
  pruefeMarkierungenBeimStart: umgebung.startPruefung,
}));
vi.mock('react', () => ({
  useState: (anfang: unknown) => [typeof anfang === 'function' ? anfang() : anfang, vi.fn()],
  useRef: (current: unknown) => (umgebung.refs[umgebung.index++] ??= { current }),
  useEffect: (effekt: () => void | (() => void)) => umgebung.effekte.push(effekt),
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => {
    if (umgebung.fensterFehler) throw new Error('Keine Tauri-Umgebung');
    const label = umgebung.label;
    return {
      label,
      listen: async (_name: string, handler: (event: { payload: string[] }) => void) => {
        umgebung.listener.set(label, handler);
        return () => {
          if (umgebung.listener.get(label) === handler) umgebung.listener.delete(label);
        };
      },
    };
  },
}));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => {
    if (umgebung.fensterFehler) throw new Error('Keine Tauri-Umgebung');
    const label = umgebung.label;
    return {
      label,
      listen: async (_name: string, handler: (event: { payload: string[] }) => void) => {
        umgebung.listener.set(label, handler);
        return () => {
          if (umgebung.listener.get(label) === handler) umgebung.listener.delete(label);
        };
      },
    };
  },
}));
vi.mock('@tauri-apps/plugin-deep-link', () => ({ getCurrent: umgebung.getCurrent }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: umgebung.invoke, isTauri: () => true }));
vi.mock('@/lib/plattform/tauriHelpers.ts', () => ({
  letzterTabAnfrageLesen: umgebung.letzterTabLesen,
}));
vi.mock('@/lib/import/import.index', () => ({
  synchronisiereStartupImportindizes: umgebung.synchronisiereIndizes,
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', () => ({
  hatNormenOhneTitel: () => umgebung.titelKandidaten,
  synchronisiereNichtamtlicheTitelFuerGesetze: umgebung.synchronisiereTitel,
}));

const bgb: GesetzDarstellung = {
  kurztitel: 'BGB',
  normgeber: 'de-bund',
  langtitel: 'Bürgerliches Gesetzbuch',
  hatGliederungsartikel: false,
  elemente: [
    {
      typ: 'norm',
      data: normaleNorm({ id: 'n1', xmlId: 'bgb-1', bezeichnung: '§ 1', absaetze: [] }),
    },
  ],
};
const uebernommenerTab: Tab = tabFuerTest({
  id: 'behalten',
  gesetz: bgb,
  initialNorm: 'vorherige-norm',
});

function TestFenster(
  label: string,
  art: 'leer' | 'uebertragung' | 'restore' = 'leer',
  strictMode = false,
  liste: GesetzDarstellung[] = [bgb],
) {
  umgebung.label = label;
  umgebung.refs = [];
  umgebung.index = 0;
  umgebung.effekte = [];
  umgebung.uebertragungAbholen.mockResolvedValue(
    art === 'uebertragung' ? { gesetzesreferenz: referenzVon(bgb) } : null,
  );
  let tabs: Tab[] = [{ id: 'leer' }];
  const verlauf: string[] = [];
  const oeffnen = vi.fn((params: ElementOeffnenParams) => {
    const tab = tabFuerTest({ id: 'link', gesetz: params.gesetz, initialNorm: params.xmlId });
    tabs = params.modus === 'immer-neu' ? [...tabs, tab] : [tab];
    if (!params.ohneVerlauf && params.xmlId) verlauf.push(params.xmlId);
  });
  const uebernehmen = vi.fn(async (_daten: TabUebertragung) => {
    tabs = [uebernommenerTab];
    return true;
  });
  const laden = vi.fn(async () => ({
    status: 'geladen' as const,
    gesetz: liste[0] ?? bgb,
    befunde: [],
  }));
  const restore = vi.fn(async () => {
    if (umgebung.restoreFehler) throw new Error('Restore fehlgeschlagen');
    if (art === 'restore') {
      await laden();
      tabs = [uebernommenerTab];
    }
    return art === 'restore';
  });
  const tabWiederherstellen = vi.fn();
  const links = useTiefenLinks({
    gesetze: [bgb],
    elementOeffnen: oeffnen,
    gesetzesreferenzOeffnen: (ziel, modus) => {
      if (ziel.gesetzesreferenz?.kurztitel.toLowerCase() === 'bgb' && ziel.bezeichnung === '1')
        oeffnen({ gesetz: bgb, xmlId: 'bgb-1', modus });
    },
  });
  useFensterstartInitialisierung({
    ladeGesetz: laden,
    tabAusUebertragungUebernehmen: uebernehmen,
    tabWiederherstellen,
    setTabs: vi.fn(),
    setAktiverTabId: vi.fn(),
    fensterRestore: {
      initialRestore: restore,
      restoreErledigt: false,
      fensterSichtbar: false,
      fensterSchliessen: vi.fn(),
      beiLadefehlerAnzeigen: vi.fn(),
    },
    ...links,
  });
  const effekte = [...umgebung.effekte];
  const cleanup = effekte.map((effekt) => effekt());
  if (strictMode) {
    cleanup.forEach((fn) => fn?.());
    effekte.forEach((effekt) => effekt());
  }
  return {
    oeffnen,
    restore,
    laden,
    uebernehmen,
    tabWiederherstellen,
    verlauf,
    tabs: () => tabs,
    unmount: () => cleanup.forEach((fn) => fn?.()),
  };
}

async function starteFenster(
  label: string,
  art: 'leer' | 'uebertragung' | 'restore' = 'leer',
  strictMode = false,
) {
  const fenster = TestFenster(label, art, strictMode);
  await vi.waitFor(() => expect(umgebung.letzterTabLesen).toHaveBeenCalledTimes(1));
  // Letzte asynchrone Fortsetzung (Linköffnung) vollständig abarbeiten.
  await Promise.resolve();
  umgebung.letzterTabLesen.mockClear();
  return fenster;
}

beforeEach(() => {
  vi.clearAllMocks();
  alleBannerSchliessen();
  umgebung.synchronisiereTitel.mockReset().mockResolvedValue(false);
  umgebung.listener.clear();
  umgebung.invoke.mockReset();
  umgebung.restoreFehler = false;
  umgebung.titelKandidaten = false;
  umgebung.fensterFehler = false;
  umgebung.getCurrent.mockResolvedValue(null);
  umgebung.letzterTabLesen.mockResolvedValue(false);
  umgebung.synchronisiereIndizes.mockResolvedValue(undefined);
});

describe('App-Start in mehreren Hauptfenstern', () => {
  it.each(['uebertragung', 'restore'] as const)(
    'wiederholt den verarbeiteten Link bei laufender App im späteren Fenster (%s) nicht',
    async (art) => {
      const main = await starteFenster('main');
      const url = 'lexlata://de-bund/bgb/1';
      umgebung.getCurrent.mockResolvedValue([url]);
      umgebung.listener.get('main')!({ payload: [url] });
      expect(main.oeffnen).toHaveBeenCalledOnce();
      expect(main.verlauf).toEqual(['bgb-1']);
      umgebung.getCurrent.mockClear();
      const spaeter = await starteFenster('gesetz-spaeter', art);
      expect(spaeter.oeffnen).not.toHaveBeenCalled();
      expect(spaeter.tabs()).toEqual([uebernommenerTab]);
      expect(spaeter.verlauf).toEqual([]);
      expect(spaeter.restore.mock.calls[0]).toEqual([
        expect.any(Function),
        expect.any(Function),
        expect.any(Function),
      ]);
      expect(umgebung.getCurrent).not.toHaveBeenCalled();
    },
  );

  it('übernimmt nach geschlossenem main keinen alten Link, empfängt aber neue Links bei laufender App', async () => {
    await starteFenster('main');
    const handler = umgebung.listener.get('main')!;
    const url = 'lexlata://de-bund/bgb/1';
    umgebung.getCurrent.mockResolvedValue([url]);
    handler({ payload: [url] });
    umgebung.listener.delete('main');
    umgebung.getCurrent.mockClear();
    const neu = await starteFenster('gesetz-neu');
    expect(neu.oeffnen).not.toHaveBeenCalled();
    expect(umgebung.getCurrent).not.toHaveBeenCalled();
    umgebung.listener.get('gesetz-neu')!({ payload: [url] });
    expect(neu.oeffnen).toHaveBeenCalledOnce();
    expect(neu.verlauf).toEqual(['bgb-1']);
  });

  it.each(['lexlata://de-bund/fehlend/1', 'lexlata://de-bund/bgb/999'])(
    'wiederholt einen alten fehlenden Link %s in Hilfsfenstern nicht',
    async (url) => {
      const main = await starteFenster('main');
      umgebung.getCurrent.mockResolvedValue([url]);
      umgebung.listener.get('main')!({ payload: [url] });
      expect(main.oeffnen).not.toHaveBeenCalled();
      umgebung.getCurrent.mockClear();
      const neben = await starteFenster('gesetz-restore', 'restore');
      expect(neben.oeffnen).not.toHaveBeenCalled();
      expect(umgebung.getCurrent).not.toHaveBeenCalled();
    },
  );

  it('öffnet den echten Link beim App-Start in main genau einmal neben mehreren wiederhergestellten Fenstern und unter StrictMode', async () => {
    umgebung.getCurrent.mockResolvedValue(['lexlata://de-bund/bgb/1']);
    const main = await starteFenster('main', 'restore', true);
    const a = await starteFenster('gesetz-a', 'restore', true);
    const b = await starteFenster('gesetz-b', 'restore');
    expect(umgebung.getCurrent).toHaveBeenCalledOnce();
    expect(main.laden).toHaveBeenCalledOnce();
    expect(main.restore).toHaveBeenCalledOnce();
    expect(main.oeffnen).toHaveBeenCalledExactlyOnceWith({
      gesetz: bgb,
      xmlId: 'bgb-1',
      modus: 'immer-neu',
    });
    expect(main.tabs()).toEqual([
      uebernommenerTab,
      tabFuerTest({ id: 'link', gesetz: bgb, initialNorm: 'bgb-1' }),
    ]);
    expect(a.oeffnen).not.toHaveBeenCalled();
    expect(b.oeffnen).not.toHaveBeenCalled();
    expect(a.tabs()).toEqual([uebernommenerTab]);
    expect(b.tabs()).toEqual([uebernommenerTab]);
    expect([...main.verlauf, ...a.verlauf, ...b.verlauf]).toEqual(['bgb-1']);
  });

  it('erhält den normalen Start ohne Link und den StrictMode-Schutz', async () => {
    const main = await starteFenster('main', 'restore', true);
    expect(main.laden).toHaveBeenCalledOnce();
    expect(main.restore).toHaveBeenCalledOnce();
    expect(main.tabs()).toEqual([uebernommenerTab]);
    expect(main.oeffnen).not.toHaveBeenCalled();
    expect(main.verlauf).toEqual([]);
  });

  it.each(['fenster', 'plugin'])(
    'führt bei einem %s-Zugriffsfehler den normalen Restore folgenlos weiter',
    async (quelle) => {
      if (quelle === 'fenster') umgebung.fensterFehler = true;
      else umgebung.getCurrent.mockRejectedValue(new Error('Plugin fehlt'));
      const main = await starteFenster('main', 'restore');
      expect(main.tabs()).toEqual([uebernommenerTab]);
      expect(main.oeffnen).not.toHaveBeenCalled();
    },
  );
});

it('wiederholt den fehlgeschlagenen Restore auch unter StrictMode nicht', async () => {
  umgebung.restoreFehler = true;
  const main = TestFenster('main', 'restore', true);
  await vi.waitFor(() => expect(main.restore).toHaveBeenCalledTimes(1));
  expect(umgebung.startPruefung).not.toHaveBeenCalled();
  expect(main.restore).toHaveBeenCalledTimes(1);
});
it('setzt nach echtem Unmount während der Linkabholung den Restore nicht fort', async () => {
  let weiter!: (links: string[] | null) => void;
  umgebung.getCurrent.mockImplementationOnce(
    () =>
      new Promise<string[] | null>((resolve) => {
        weiter = resolve;
      }),
  );
  const main = TestFenster('main', 'restore');
  await vi.waitFor(() => expect(umgebung.getCurrent).toHaveBeenCalledOnce());
  main.unmount();
  weiter(null);
  await Promise.resolve();
  await Promise.resolve();
  expect(umgebung.startPruefung).not.toHaveBeenCalled();
  expect(main.laden).not.toHaveBeenCalled();
  expect(main.restore).not.toHaveBeenCalled();
  expect(umgebung.uebertragungAbholen).not.toHaveBeenCalled();
});

// Titelabgleich, langsame Titeldateien und Kopierfehler werden mit echten
// Einzelzugriffen in useFensterRestore.bedarf.test.tsx geprüft.

vi.mock('@/lib/plattform/fensterUebergabe', async (original) => ({
  ...(await original<typeof import('@/lib/plattform/fensterUebergabe')>()),
  tabUebertragungAbholen: umgebung.uebertragungAbholen,
}));
