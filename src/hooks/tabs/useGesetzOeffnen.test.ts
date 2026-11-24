import { richteNativeEreignisgrenzeEin } from '@/test/start/nativeEreignisgrenze';
import { referenzVon } from '@/lib/domain/gesetzesreferenz';
vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => {} }));
import '@tauri-apps/api/event';
// useGesetzOeffnen.test.ts
// Echte Tabs, strikte Resolver und vollständige Ladeabschlüsse bei Navigation.
import { tabFuerTest } from '@/test/tabs/tabFabriken';
import { gesetzOeffnenFixture } from '@/test/hauptfenster/gesetzOeffnenFixture';
import { tabVerlaeufeLesen } from '@/test/hauptfenster/tabVerlaeufeLesen';
import { gesetzMitNormen, gliederungsartikel } from '@/test/gesetz/gesetzFabriken';
import { verweisziel } from '@/test/markierungen/verweiszielFabrik';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { dateiBasis } from '@/lib/persistenz/kern/kern.index';
import { afterEach, assert, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type { GesetzLadeabschluss } from '@/lib/persistenz/gesetz/gesetz.index';
import { useAppTabs } from './useAppTabs';
import { useGesetzOeffnen } from './useGesetzOeffnen';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { beurteileMarkierungsImport } from '@/lib/markierungen/markierungen.index';
import { useTiefenLinks } from '@/hooks/useTiefenLinks';
import { useAppAktionen } from '@/hooks/useAppAktionen';
import {
  geschlossenenTabPushen,
  geschlossenenTabPoppen,
} from '@/lib/persistenz/fenster/fenster.index';
import { speichereAktivierung } from '@/lib/persistenz/nutzerdaten/aktivierungSpeicher';
import {
  alleBannerSchliessen,
  bannerDauerMs,
  getSnapshot,
  bannerSchliessen,
  subscribe,
} from '@/lib/banner/banner.index';
import { einzelzugriffFuerTest } from '@/test/tabs/einzelzugriffFuerTest';

const importieren = vi.hoisted(() => vi.fn());
vi.mock('@/lib/import/import.index', () => ({ importiereGesetzesreferenz: importieren }));
const linksNative = vi.hoisted(() => ({ getCurrent: vi.fn(), empfangen: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ label: 'main' }) }));
vi.mock('@tauri-apps/plugin-deep-link', () => ({ getCurrent: linksNative.getCurrent }));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    listen: async (_name: string, handler: unknown) => {
      linksNative.empfangen.mockImplementation(handler as () => void);
      return () => {};
    },
  }),
}));
let links: ReturnType<typeof useTiefenLinks>;
function gesetz(normgeber = 'de-bund', ...bezeichnungen: string[]): GesetzDarstellung {
  return gesetzMitNormen(bezeichnungen, {
    normgeber,
    langtitel: 'Testgesetz',
    kennung: (i) => `n${i}`,
  });
}
const bestand = (liste: GesetzDarstellung[]): GesetzLadeabschluss => ({
  liste,
  befunde: [],
  ordnerLesbar: true,
});
function spaeter<T>() {
  let fertig!: (wert: T) => void;
  const promise = new Promise<T>((resolve) => {
    fertig = resolve;
  });
  return { promise, fertig };
}
let root: Root;
let tabs: ReturnType<typeof useAppTabs>;
function ersterTabId() {
  const tab = tabs.tabsRef.current[0];
  assert(tab);
  return tab.id;
}
let navigation: ReturnType<typeof useGesetzOeffnen>;
let aktionen: ReturnType<typeof useAppAktionen>;
let laden: ReturnType<typeof vi.fn<() => Promise<GesetzLadeabschluss>>>;
async function starten(liste: GesetzDarstellung[] = []) {
  const dom = parseHTML('<html><body><main></main></body></html>');
  vi.stubGlobal('window', dom.window);
  richteNativeEreignisgrenzeEin(async () => undefined);
  vi.stubGlobal('document', dom.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  laden = vi.fn(async () => bestand(liste));
  root = createRoot(document.querySelector('main')!);
  function TestApp() {
    tabs = useAppTabs();
    navigation = useGesetzOeffnen({
      ...gesetzOeffnenFixture(tabs, liste),

      ladeGesetz: einzelzugriffFuerTest(laden),
    });
    aktionen = useAppAktionen({
      uebersichtExportAktionRef: { current: null },
      tabsRef: tabs.tabsRef,
      aktiverTabIdRef: tabs.aktiverTabIdRef,
      tabSchliessen: tabs.tabSchliessen,
      tabWiederherstellen: navigation.tabWiederherstellen,
      fensterSchliessen: vi.fn(),
      verlaufNavigieren: tabs.verlaufNavigieren,
      gesetzesreferenzOeffnen: navigation.gesetzesreferenzOeffnen,
      gesetzInfoInTabsPatchen: vi.fn(),
      aktivesOverlay: null,
      setAktivesOverlay: vi.fn(),
    });
    links = useTiefenLinks({
      gesetze: liste,
      elementOeffnen: navigation.elementOeffnen,
      gesetzesreferenzOeffnen: navigation.gesetzesreferenzOeffnen,
    });
    return null;
  }
  await act(async () => {
    root.render(createElement(TestApp));
  });
  await act(async () => vi.dynamicImportSettled());
  if (liste[0])
    act(() => {
      tabs.gesetzOeffnen(liste[0]!, 'start', 'aktiver-tab');
    });
}
async function klick(aktion: () => void) {
  await act(async () => {
    aktion();
  });
}
async function erfolg(g: GesetzDarstellung, lauf?: ReturnType<typeof spaeter<unknown>>) {
  laden.mockResolvedValue(bestand([g]));
  const ergebnis = {
    art: 'erfolg',
    gesetz: g,
    bestandspruefung: bestand([]),
    ladeabschluss: bestand([g]),
  };
  if (lauf) await act(async () => lauf.fertig(ergebnis));
  else importieren.mockResolvedValue(ergebnis);
}
beforeEach(() => {
  vi.clearAllMocks();
  importieren.mockReset();
  importieren.mockReturnValue(new Promise(() => {}));
  alleBannerSchliessen();
  const speicher = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => speicher.get(key) ?? null,
    setItem: (key: string, wert: string) => speicher.set(key, wert),
    removeItem: (key: string) => speicher.delete(key),
  });
});
afterEach(() => {
  if (root) act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Sofortimport und sofort bestimmter Tab', () => {
  it.each(['lesezeichen', 'verweis', 'getaggterVerweis', 'ganzesGesetz'])(
    'startet %s ohne Bestätigung',
    async (art) => {
      const ausgang = gesetz('de-bund', '§ 1');
      const ziel = gesetz('de-bw', '§ 90', '§ 9');
      await starten([ausgang]);
      const lauf = spaeter<unknown>();
      importieren.mockReturnValue(lauf.promise);
      const id = tabs.aktiverTabId!;
      await klick(() => {
        if (art === 'lesezeichen') navigation.handleLesezeichenOeffnen('§ 9', ziel);
        else
          navigation.handleVerweisKlick(
            'start',
            art === 'getaggterVerweis'
              ? { typ: 'getaggterVerweis', zielBezeichnung: '§ 9', zielgesetz: ziel }
              : art === 'ganzesGesetz'
                ? verweisziel({
                    typ: 'ganzesGesetz',
                    gesetz: ziel,
                    verweistextZeichenbereich: [0, 5],
                  })
                : verweisziel({
                    typ: 'zielnormOhneElementstand',
                    gesetz: ziel,
                    bezeichnung: '9',
                    verweistextZeichenbereich: [0, 5],
                  }),
            false,
          );
      });
      expect(importieren).toHaveBeenCalledExactlyOnceWith({
        kurztitel: 'TestG',
        normgeber: 'de-bw',
      });
      // Bis zum erfolgreichen Import bleibt das alte Gesetz sichtbar.
      expect(tabs.holeTabGesetz(tabs.tabsRef.current.find((t) => t.id === id))).toBe(ausgang);
      expect(tabs.tabsRef.current).toHaveLength(1);
      expect(getSnapshot()[0]).toMatchObject({ text: 'TestG wird importiert …', laedt: true });
      expect(getSnapshot()[0]?.aktion).toBeUndefined();
      await erfolg(ziel, lauf);
      expect(tabs.tabsRef.current.find((t) => t.id === id)).toMatchObject({
        gesetzesreferenz: referenzVon(ziel),
        ...(art !== 'ganzesGesetz' ? { initialNorm: 'n1' } : {}),
      });
      expect(getSnapshot()).toEqual([]);
    },
  );
  it.each(['immer-neu', 'bevorzugt-vorhanden', 'aktiver-tab', 'immer-aktiver-tab'] as const)(
    'verändert bis zum Abschluss keinen Tab und öffnet danach nach Modus %s',
    async (modus) => {
      const g = gesetz();
      await starten([g]);
      const id = tabs.aktiverTabId!;
      const lauf = spaeter<unknown>();
      importieren.mockReturnValue(lauf.promise);
      await klick(() =>
        navigation.gesetzesreferenzOeffnen(
          { gesetzesreferenz: { kurztitel: 'TestG', normgeber: 'de-bw' } },
          modus,
        ),
      );
      expect(tabs.tabsRef.current).toHaveLength(1);
      expect(tabs.holeTabGesetz(tabs.tabsRef.current[0])).toBe(g);
      await erfolg(gesetz('de-bw'), lauf);
      expect(tabs.tabsRef.current).toHaveLength(
        modus === 'immer-neu' || modus === 'bevorzugt-vorhanden' ? 2 : 1,
      );
      expect(tabs.aktiverTabIdRef.current === id).toBe(
        modus === 'aktiver-tab' || modus === 'immer-aktiver-tab',
      );
    },
  );
  it('lässt bei zwei Zielen desselben Gesetzes nur die neuere Öffnung abschließen', async () => {
    const ausgang = gesetz('de-bund', '§ 1');
    const ziel = gesetz('de-bw', '§ 9', '§ 10');
    await starten([ausgang]);
    const lauf = spaeter<unknown>();
    importieren.mockReturnValue(lauf.promise);
    await klick(() =>
      navigation.handleVerweisKlick(
        'start',
        verweisziel({
          typ: 'zielnormOhneElementstand',
          gesetz: ziel,
          bezeichnung: '§ 9',
          verweistextZeichenbereich: [0, 2],
        }),
        true,
      ),
    );
    await klick(() =>
      navigation.handleVerweisKlick(
        'start',
        verweisziel({
          typ: 'zielnormOhneElementstand',
          gesetz: ziel,
          bezeichnung: '§ 10',
          verweistextZeichenbereich: [0, 2],
        }),
        true,
      ),
    );
    expect(importieren).toHaveBeenCalledOnce();
    expect(getSnapshot()).toHaveLength(1);
    await erfolg(ziel, lauf);
    expect(tabs.tabsRef.current).toHaveLength(2);
    const neu = tabs.tabsRef.current.find((t) => t.id !== ersterTabId());
    expect(neu?.initialNorm).toBe('n1');
    expect(tabs.aktiverTabIdRef.current).toBe(neu?.id);
    expect(getSnapshot()).toEqual([]);
  });
  it('füllt nach Tabwechsel den Ausgangstab, ohne ihn zu aktivieren, und ignoriert den Mehrfachklick', async () => {
    await starten();
    const ziel = gesetz('de-bw', '§ 9');
    const lauf = spaeter<unknown>();
    importieren.mockReturnValue(lauf.promise);
    const id = tabs.aktiverTabId!;
    await klick(() => navigation.handleLesezeichenOeffnen('§ 9', ziel));
    act(() => tabs.erstelleLeerenTab());
    const leer = tabs.aktiverTabId!;
    await klick(() => navigation.handleLesezeichenOeffnen('§ 9', ziel));
    expect(importieren).toHaveBeenCalledOnce();
    expect(getSnapshot()).toHaveLength(1);
    await erfolg(ziel, lauf);
    expect(tabs.tabsRef.current.find((t) => t.id === id)?.initialNorm).toBe('n0');
    expect(tabs.holeTabGesetz(tabs.tabsRef.current.find((t) => t.id === leer))).toBeUndefined();
    expect(tabs.aktiverTabIdRef.current).toBe(leer);
  });
  it.each([
    ['Verweisklick im neuen Tab', true],
    ['Verweisklick im selben Tab', false],
  ])('E4: %s mehrfach ergibt einen Import, ein Banner und höchstens einen Tab', async (_, neu) => {
    const ausgang = gesetz('de-bund', '§ 1');
    const ziel = gesetz('de-bw', '§ 9');
    await starten([ausgang]);
    const lauf = spaeter<unknown>();
    importieren.mockReturnValue(lauf.promise);
    const verweis = verweisziel({
      typ: 'zielnormOhneElementstand',
      gesetz: ziel,
      bezeichnung: '§ 9',
      verweistextZeichenbereich: [0, 2],
    });
    await klick(() => navigation.handleVerweisKlick('start', verweis, neu));
    await klick(() => navigation.handleVerweisKlick('start', verweis, neu));
    await klick(() => navigation.handleVerweisKlick('start', verweis, neu));
    expect(importieren).toHaveBeenCalledOnce();
    expect(getSnapshot()).toHaveLength(1);
    await erfolg(ziel, lauf);
    expect(tabs.tabsRef.current).toHaveLength(neu ? 2 : 1);
    expect(
      tabs.tabsRef.current.filter((t) => tabs.holeTabGesetz(t) === ziel).map((t) => t.initialNorm),
    ).toEqual(['n0']);
  });
  it('lässt Banner schließen allein die Anzeige beenden', async () => {
    await starten();
    const ziel = gesetz('de-bw');
    const lauf = spaeter<unknown>();
    importieren.mockReturnValue(lauf.promise);
    await klick(() => navigation.handleLesezeichenOeffnen('', ziel));
    bannerSchliessen(getSnapshot()[0]!.id);
    await erfolg(ziel, lauf);
    expect(tabs.holeTabGesetz(tabs.tabsRef.current[0])).toEqual(ziel);
    expect(getSnapshot()).toEqual([]);
  });
});

it('erhält einen passenden geladenen Tab und seine Ansicht während frischer Bestandsprüfung', async () => {
  const g = gesetz('de-bund', '§ 9');
  await starten([g]);
  const id = tabs.aktiverTabId!;
  tabs.scrollPositionenRef.current[`${id}-${gesetzesreferenzSchluessel(g)}`] = {
    index: 4,
    offset: 12,
  };
  const lauf = spaeter<GesetzLadeabschluss>();
  laden.mockReturnValue(lauf.promise);
  const bannerZustaende: string[][] = [];
  const abmelden = subscribe(() => bannerZustaende.push(getSnapshot().map((b) => b.text)));
  await klick(() => navigation.handleLesezeichenOeffnen('§ 9', g));
  expect(getSnapshot()).toEqual([]);
  expect(importieren).not.toHaveBeenCalled();
  expect(tabs.holeTabGesetz(tabs.tabsRef.current[0])).toBe(g);
  expect(tabs.scrollPositionenRef.current[`${id}-${gesetzesreferenzSchluessel(g)}`]).toEqual({
    index: 4,
    offset: 12,
  });
  await act(async () => lauf.fertig(bestand([g])));
  expect(tabs.tabsRef.current[0]?.initialNorm).toBe('n0');
  abmelden();
  expect(bannerZustaende.flat()).toEqual([]);
});
it.each(['verweis', 'lesezeichen', 'element'])(
  'öffnet bei fehlendem Normziel das Gesetz modustreu und meldet den Normfehler für fünf Sekunden (%s)',
  async (art) => {
    const g = gesetz('de-bund', '§ 90', '§ 9a');
    await starten([g]);
    const vorher = structuredClone({
      tabs: tabs.tabsRef.current,
      aktiv: tabs.aktiverTabIdRef.current,
      verlauf: tabVerlaeufeLesen(tabs),
    });
    await klick(() => {
      if (art === 'verweis')
        navigation.handleVerweisKlick(
          'start',
          verweisziel({
            typ: 'zielnormOhneElementstand',
            bezeichnung: '§ 9',
            verweistextZeichenbereich: [0, 2],
          }),
          true,
        );
      else if (art === 'lesezeichen') navigation.handleLesezeichenOeffnen('§ 9', g);
      else
        navigation.elementOeffnen({
          gesetz: g,
          xmlId: 'fehlt',
          bezeichnung: '§ 90',
          modus: 'immer-neu',
        });
    });
    if (art === 'lesezeichen') {
      expect({
        tabs: tabs.tabsRef.current,
        aktiv: tabs.aktiverTabIdRef.current,
        verlauf: tabVerlaeufeLesen(tabs),
      }).toEqual(vorher);
    } else {
      expect(tabs.tabsRef.current).toHaveLength(2);
      expect(tabs.aktiverTabIdRef.current).not.toBe(vorher.aktiv);
      expect(
        tabs.tabsRef.current.find((tab) => tab.id === tabs.aktiverTabIdRef.current),
      ).toMatchObject({ gesetzesreferenz: referenzVon(g), initialNorm: 'n0' });
      expect(
        tabs.verlaufLesen(tabs.aktiverTabIdRef.current!)?.eintraege.map((eintrag) => eintrag.xmlId),
      ).toEqual(['n0']);
    }
    expect(getSnapshot()[0]).toMatchObject({
      text: 'Norm nicht gefunden.',
      art: 'bedienhinweis',
    });
  },
);

it('belässt den Tiefenlink-Hinweis bei fehlender Norm ohne automatisches Schließen', async () => {
  const g = gesetz('de-bund', '§ 90');
  await starten([g]);
  await klick(() =>
    navigation.gesetzesreferenzOeffnen(
      { gesetzesreferenz: g, bezeichnung: '§ 9', tiefenlink: true },
      'aktiver-tab',
    ),
  );
  expect(getSnapshot()[0]?.text).toContain('Das Linkziel konnte nicht geöffnet werden.');
  // Tiefenlinkziel fehlt: Bedienhinweis, nichts geöffnet, sofort sichtbar.
  expect(getSnapshot()[0]?.art).toBe('bedienhinweis');
  expect(getSnapshot().map((b) => bannerDauerMs(b))).toEqual([5000]);
});

describe('verlässlicher Bestand und abgeschlossene Fehler', () => {
  it.each(['ordner', 'ziel', 'wurf'])(
    'öffnet keinen erhaltenen Altbestand und importiert nicht nach Lesefehler %s',
    async (art) => {
      const g = gesetz('de-bund', '§ 9');
      await starten([gesetz('de-bund', '§ 90')]);
      if (art === 'wurf') laden.mockRejectedValue(new Error('/privater/pfad'));
      else
        laden.mockResolvedValue({
          liste: [g],
          ordnerLesbar: art !== 'ordner',
          befunde:
            art === 'ziel'
              ? [{ dateiBasis: 'TestG_de-bund', status: 'unlesbar', fehler: 'unlesbar' }]
              : [],
        });
      await klick(() => navigation.handleLesezeichenOeffnen('§ 9', g));
      expect(importieren).not.toHaveBeenCalled();
      expect(tabs.tabsRef.current[0]?.initialNorm).toBe('start');
      expect(getSnapshot()[0]).toMatchObject({ laedt: false, typ: 'warnung' });
      expect(getSnapshot()[0]?.text).not.toBe('Norm nicht gefunden.');
      expect(getSnapshot()[0]?.text).not.toContain('/privater');
      expect(getSnapshot()[0]?.aktion?.label).toBe('Erneut versuchen');
      laden.mockResolvedValue(bestand([g]));
      await klick(() => getSnapshot()[0]!.aktion!.onClick());
      expect(tabs.tabsRef.current[0]?.initialNorm).toBe('n0');
      expect(getSnapshot()).toEqual([]);
    },
  );
  it.each(['ordner', 'ziel', 'wurf'])(
    'behandelt den Ladefehler nach Import %s ohne erfolgreiche Öffnung',
    async (art) => {
      const g = gesetz('de-bw', '§ 9');
      await starten();
      await erfolg(g);
      laden.mockResolvedValueOnce(bestand([]));
      if (art === 'wurf') laden.mockRejectedValueOnce(new Error('intern'));
      else
        laden.mockResolvedValueOnce({
          liste: [g],
          ordnerLesbar: art !== 'ordner',
          befunde:
            art === 'ziel'
              ? [{ dateiBasis: 'TestG_de-bw', status: 'unlesbar', fehler: 'unlesbar' }]
              : [],
        });
      await klick(() => navigation.handleLesezeichenOeffnen('§ 9', g));
      expect(importieren).toHaveBeenCalledOnce();
      // E5: Die Willkommensansicht bleibt; der Fehler erscheint nur als Banner.
      expect(tabs.tabsRef.current).toHaveLength(1);
      expect(tabs.tabsRef.current[0]?.gesetzesreferenz).toBeUndefined();
      expect(tabs.tabsRef.current[0]?.ladezustand).toBeUndefined();
      expect(getSnapshot()).toHaveLength(1);
      expect(getSnapshot()[0]?.aktion?.label).toBe('Erneut versuchen');
      expect(getSnapshot()[0]?.laedt).toBe(false);
      await klick(() => getSnapshot()[0]!.aktion!.onClick());
      expect(tabs.tabsRef.current[0]?.initialNorm).toBe('n0');
      expect(importieren).toHaveBeenCalledOnce();
    },
  );
  it.each(['bestandspruefung', 'ladeabschluss'])(
    'beachtet den Lesebefund im Importergebnis (%s)',
    async (feld) => {
      const g = gesetz('de-bw');
      await starten();
      importieren.mockResolvedValue({
        art: 'erfolg',
        gesetz: g,
        bestandspruefung: bestand([]),
        ladeabschluss: bestand([g]),
        [feld]: { status: 'nicht-lesbar', befunde: [] },
      });
      await klick(() => navigation.handleLesezeichenOeffnen('', g));
      expect(tabs.tabsRef.current).toHaveLength(1);
      expect(tabs.tabsRef.current[0]?.gesetzesreferenz).toBeUndefined();
      expect(tabs.tabsRef.current[0]?.ladezustand).toBeUndefined();
      expect(getSnapshot()[0]?.text).toBe('Das Gesetz konnte nicht verlässlich geladen werden.');
      expect(getSnapshot()[0]?.aktion).toBeDefined();
    },
  );
  it.each(['import', 'nichtVerfuegbar', 'wurf'])(
    'beendet %s verständlich und bietet nur sinnvolle Wiederholung',
    async (art) => {
      await starten();
      const g = gesetz('de-bw', '§ 9');
      if (art === 'wurf') importieren.mockRejectedValue(new Error('private Downloadadresse'));
      else
        importieren.mockResolvedValue({
          art: 'fehler',
          fehler: {
            grund: art === 'import' ? 'netzwerk' : 'nichtVerfuegbar',
            meldung: 'private Downloadadresse',
          },
          bestandspruefung: bestand([]),
          ladeabschluss: bestand([]),
        });
      await klick(() => navigation.handleLesezeichenOeffnen('§ 9', g));
      expect(getSnapshot()[0]?.laedt).toBe(false);
      expect(getSnapshot()[0]?.text).not.toContain('private');
      expect(Boolean(getSnapshot()[0]?.aktion)).toBe(art !== 'nichtVerfuegbar');
      expect(getSnapshot().map((b) => bannerDauerMs(b))).toEqual([undefined]);
      if (art !== 'nichtVerfuegbar') {
        await erfolg(g);
        await klick(() => getSnapshot()[0]!.aktion!.onClick());
        expect(tabs.tabsRef.current[0]?.initialNorm).toBe('n0');
        expect(getSnapshot()).toEqual([]);
      }
    },
  );
  it.each(['§ 90', '§ 9a', '§ 9|§ 9'])(
    'behält den reservierten Tab bei importiertem ungültigem § 9 (%s)',
    async (namen) => {
      const g = gesetz('de-bw', ...namen.split('|'));
      await starten();
      const lauf = spaeter<unknown>();
      importieren.mockReturnValue(lauf.promise);
      await klick(() => navigation.handleLesezeichenOeffnen('§ 9', g));
      await erfolg(g, lauf);
      expect(tabs.holeTabGesetz(tabs.tabsRef.current[0])).toBe(g);
      expect(tabs.tabsRef.current[0]?.initialNorm).toBe('n0');
      expect(tabs.verlaufLesen(ersterTabId())?.eintraege.map((eintrag) => eintrag.xmlId)).toEqual([
        'n0',
      ]);
      expect(getSnapshot()[0]).toMatchObject({
        text: 'Norm nicht gefunden.',
        laedt: false,
        art: 'bedienhinweis',
      });
      expect(getSnapshot()[0]?.aktion).toBeUndefined();
    },
  );
});

describe('Aktualität und Reihenfolge', () => {
  it('beendet zwei Ziele im selben Tab in umgekehrter Reihenfolge ohne alte Banner- oder Verlaufseffekte', async () => {
    await starten();
    const a = gesetz('de-bw', '§ 9');
    const b = gesetz('eu', 'Art. 10');
    const alt = spaeter<unknown>();
    const neu = spaeter<unknown>();
    importieren.mockImplementation((ref) =>
      ref.normgeber === 'de-bw' ? alt.promise : neu.promise,
    );
    await klick(() => navigation.handleLesezeichenOeffnen('§ 9', a));
    const altesBanner = getSnapshot()[0]!.id;
    await klick(() => navigation.handleLesezeichenOeffnen('Art. 10', b));
    expect(getSnapshot().some((banner) => banner.id === altesBanner)).toBe(false);
    await erfolg(b, neu);
    const fertig = structuredClone({
      tabs: tabs.tabsRef.current,
      verlauf: tabVerlaeufeLesen(tabs),
    });
    await erfolg(a, alt);
    expect({ tabs: tabs.tabsRef.current, verlauf: tabVerlaeufeLesen(tabs) }).toEqual(fertig);
    expect(getSnapshot()).toEqual([]);
  });
  it.each(['schliessen', 'navigation'])(
    'bewahrt %s vor einem alten Abschluss und einer alten Wiederholungsaktion',
    async (art) => {
      const start = gesetz('de-bund', '§ 1');
      const ziel = gesetz('de-bw', '§ 9');
      await starten([start]);
      importieren.mockResolvedValue({
        art: 'fehler',
        fehler: { grund: 'netzwerk' },
        bestandspruefung: bestand([]),
        ladeabschluss: bestand([]),
      });
      await klick(() => navigation.handleLesezeichenOeffnen('§ 9', ziel));
      const wiederholen = getSnapshot()[0]!.aktion!.onClick;
      act(() => {
        if (art === 'schliessen') tabs.tabSchliessen(tabs.aktiverTabId!);
        else navigation.elementOeffnen({ gesetz: start, xmlId: 'n0', modus: 'immer-aktiver-tab' });
      });
      await klick(wiederholen);
      expect(importieren).toHaveBeenCalledOnce();
      expect(getSnapshot()).toEqual([]);
      expect(Object.keys(tabVerlaeufeLesen(tabs))).toHaveLength(art === 'navigation' ? 1 : 0);
    },
  );
  it('schließt einen laufenden Tab ohne Wiederöffnung oder verwaisten Verlauf', async () => {
    await starten();
    const lauf = spaeter<unknown>();
    importieren.mockReturnValue(lauf.promise);
    const g = gesetz('de-bw', '§ 9');
    await klick(() => navigation.handleLesezeichenOeffnen('§ 9', g));
    const id = tabs.aktiverTabId!;
    act(() => tabs.tabSchliessen(id));
    await erfolg(g, lauf);
    expect(tabs.tabsRef.current.some((t) => t.id === id)).toBe(false);
    expect(tabs.holeTabGesetz(tabs.tabsRef.current[0])).toBeUndefined();
    expect(tabVerlaeufeLesen(tabs)).toEqual({});
    expect(getSnapshot()).toEqual([]);
  });
  it('lässt die Verlaufsfrist des Ausgangstabs während des Imports weiterlaufen', async () => {
    vi.useFakeTimers();
    const start = gesetz('de-bund', '§ 1');
    const g = gesetz('de-bw', '§ 9');
    await starten([start]);
    act(() =>
      tabs.verlaufAktivierung(
        tabs.aktiverTabId!,
        { gesetzesreferenz: start, xmlId: 'n0' },
        'schritt',
      ),
    );
    const lauf = spaeter<unknown>();
    importieren.mockReturnValue(lauf.promise);
    await klick(() => navigation.handleLesezeichenOeffnen('§ 9', g));
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(tabs.verlaufLesen(tabs.aktiverTabId!)?.eintraege).toEqual([
      { gesetzesreferenz: referenzVon(start), xmlId: 'n0' },
    ]);
    await erfolg(g, lauf);
    expect(
      tabs
        .verlaufLesen(tabs.aktiverTabId!)
        ?.eintraege.map((e) => [e.gesetzesreferenz.normgeber, e.xmlId]),
    ).toEqual([
      ['de-bw', 'n0'],
      ['de-bund', 'n0'],
    ]);
  });
});

describe('strikte gemeinsame Zielauflösung und Referenzregressionen', () => {
  it.each([
    ['§ 31', undefined, 'n2'],
    ['31', ['§'], 'n2'],
    ['Art. 31', undefined, 'n3'],
    ['31', ['Art.'], 'n3'],
  ] as const)('öffnet den vollständigen Verweis %s', async (bezeichnung, praefix, xmlId) => {
    const g = gesetz('de-bund', '§ 312', '§ 31a', '§ 31', 'Art. 31');
    await starten([g]);
    const ausgang = tabs.aktiverTabId!;
    await klick(() =>
      navigation.handleVerweisKlick(
        'start',
        verweisziel({
          typ: 'zielnormOhneElementstand',
          bezeichnung: praefix ? `${praefix[0]} ${bezeichnung}` : bezeichnung,
          verweistextZeichenbereich: [0, 5],
        }),
        true,
      ),
    );
    expect(tabs.tabsRef.current.find((t) => t.id === tabs.aktiverTabId)?.initialNorm).toBe(xmlId);
    expect(tabs.verlaufLesen(ausgang)?.eintraege).toContainEqual({
      gesetzesreferenz: { kurztitel: 'TestG', normgeber: 'de-bund' },
      xmlId: 'start',
    });
    expect(tabs.verlaufLesen(tabs.aktiverTabId!)?.eintraege).toEqual([
      { gesetzesreferenz: { kurztitel: 'TestG', normgeber: 'de-bund' }, xmlId },
    ]);
    expect(getSnapshot()).toEqual([]);
  });
  it.each([
    ['§ 90', '§ 9a'],
    ['§ 9', '§ 9'],
    ['Art. 9', '§ 90'],
  ])('weist § 9 ohne Ersatz oder Verlauf bei %s/%s ab', async (a, b) => {
    const g = gesetz('de-bund', a, b);
    await starten([g]);
    const vorher = structuredClone(tabs.tabsRef.current);
    await klick(() => navigation.elementOeffnen({ gesetz: g, bezeichnung: '§ 9' }));
    expect(tabs.tabsRef.current).toEqual(vorher);
    expect(tabVerlaeufeLesen(tabs)).toEqual({});
    expect(getSnapshot()[0]?.text).toBe('Norm nicht gefunden.');
  });
  it.each([false, true])(
    'findet den exakten Treffer unabhängig von Reihenfolge %s',
    async (umgekehrt) => {
      const g = gesetz(
        'de-bund',
        ...(umgekehrt ? ['§ 9', '§ 90', '§ 9a'] : ['§ 90', '§ 9a', '§ 9']),
      );
      await starten([g]);
      await klick(() => navigation.elementOeffnen({ gesetz: g, bezeichnung: '§ 9' }));
      expect(tabs.tabsRef.current.find((t) => t.id === tabs.aktiverTabId)?.initialNorm).toBe(
        umgekehrt ? 'n0' : 'n2',
      );
    },
  );
  it('verwendet Artikelkontext, Canon, Erwägungsgrund und weggefallene Zusammenfassungen', async () => {
    const g = gesetz('de-bund', 'Can. 9', 'E9', 'Art. 229', '§ 9', '§§ 10 bis 12');
    const e = g.elemente[1]!;
    const a = g.elemente[2]!;
    const w = g.elemente[4]!;
    if (e.typ !== 'norm' || a.typ !== 'norm' || w.typ !== 'norm')
      throw new Error('Normen erwartet');
    e.data.art = 'erwaegungsgrund';
    a.data = gliederungsartikel({ ...a.data, art: 'gliederungsartikel', gliederungsEbene: 0 });
    w.data.status = 'weggefallen';
    g.hatGliederungsartikel = true;
    await starten([g]);
    for (const [bezeichnung, xmlId] of [
      ['Can. 9', 'n0'],
      ['E9', 'n1'],
      ['Art. 229', 'n2'],
      ['229 9', 'n3'],
      ['Art. 229 § 9', 'n3'],
      ['229 10', 'n4'],
      ['229 12', 'n4'],
    ]) {
      await klick(() => navigation.elementOeffnen({ gesetz: g, bezeichnung }));
      expect(tabs.tabsRef.current.find((t) => t.id === tabs.aktiverTabId)?.initialNorm).toBe(xmlId);
    }
    for (const bezeichnung of ['Art. 230 § 9', '229 11', '§ 9']) {
      alleBannerSchliessen();
      const vorher = structuredClone(tabs.tabsRef.current);
      await klick(() => navigation.elementOeffnen({ gesetz: g, bezeichnung }));
      expect(tabs.tabsRef.current).toEqual(vorher);
      expect(getSnapshot()[0]?.text).toBe('Norm nicht gefunden.');
    }
  });
  it.each([false, true])(
    'öffnet volle Verweisziele und verwendet den Tab erneut (Gliederungsartikel=%s)',
    async (verschachtelt) => {
      const g = verschachtelt ? gesetz('de-bund', 'Art. 229', '§ 3') : gesetz('de-bund', '§ 433');
      if (verschachtelt) {
        const artikel = g.elemente[0];
        if (artikel?.typ !== 'norm') throw new Error('Gliederungsartikel erwartet');
        artikel.data = gliederungsartikel({
          ...artikel.data,
          art: 'gliederungsartikel',
          gliederungsEbene: 0,
        });
        g.hatGliederungsartikel = true;
      }
      await starten([g]);
      const ziel = verweisziel({
        typ: 'zielnormOhneElementstand',
        bezeichnung: verschachtelt ? 'Art. 229 § 3' : '§ 433',
        verweistextZeichenbereich: [0, 3],
      });
      await klick(() => navigation.handleVerweisKlick('start', ziel, false));
      const tabId = tabs.aktiverTabId;
      const anzahl = tabs.tabsRef.current.length;
      expect(tabs.tabsRef.current.find((tab) => tab.id === tabId)?.initialNorm).toBe(
        verschachtelt ? 'n1' : 'n0',
      );
      await klick(() => navigation.handleVerweisKlick('start', ziel, false));
      expect(tabs.aktiverTabId).toBe(tabId);
      expect(tabs.tabsRef.current).toHaveLength(anzahl);
    },
  );
  it('öffnet bei gleichen Kurztiteln ausschließlich das übergebene Gesetz', async () => {
    const bund = gesetz('de-bund');
    const bw = gesetz('de-bw');
    await starten([bund, bw]);
    await klick(() => navigation.elementOeffnen({ gesetz: bw }));
    expect(tabs.holeTabGesetz(tabs.tabsRef.current.find((t) => t.id === tabs.aktiverTabId))).toBe(
      bw,
    );
  });
  it('behält einen Verweis auf das ganze Gesetz ohne explizite Referenz im Ausgangsgesetz', async () => {
    const bw = gesetz('de-bw');
    await starten([bw, gesetz('de-bund')]);
    await klick(() =>
      navigation.handleVerweisKlick(
        'start',
        verweisziel({ typ: 'ganzesGesetz', gesetz: bw, verweistextZeichenbereich: [0, 2] }),
        false,
      ),
    );
    expect(tabs.holeTabGesetz(tabs.tabsRef.current.find((t) => t.id === tabs.aktiverTabId))).toBe(
      bw,
    );
    expect(importieren).not.toHaveBeenCalled();
  });
  it('öffnet kein namensgleiches Ersatzgesetz aus abweichendem Importergebnis', async () => {
    const bund = gesetz('de-bund');
    const bw = gesetz('de-bw');
    await starten([bund]);
    importieren.mockResolvedValue({
      art: 'erfolg',
      gesetz: bund,
      bestandspruefung: bestand([]),
      ladeabschluss: bestand([bund, bw]),
    });
    laden.mockResolvedValueOnce(bestand([bund])).mockResolvedValueOnce(bestand([bund, bw]));
    await klick(() => navigation.handleLesezeichenOeffnen('', bw));
    expect(tabs.tabsRef.current).toHaveLength(1);
    expect(tabs.holeTabGesetz(tabs.tabsRef.current[0])).toBe(bund);
    expect(getSnapshot()[0]?.typ).toBe('warnung');
  });
  it('prüft XML-ID nach dem Import exakt ohne Bezeichnungsersatz', async () => {
    const g = gesetz('de-bw', '§ 9');
    await starten();
    const lauf = spaeter<unknown>();
    importieren.mockReturnValue(lauf.promise);
    await klick(() =>
      navigation.gesetzesreferenzOeffnen(
        {
          gesetzesreferenz: g,
          bezeichnung: '§ 9',
          xmlId: 'fehlt',
        },
        'immer-neu',
      ),
    );
    await erfolg(g, lauf);
    expect(tabs.holeTabGesetz(tabs.tabsRef.current.find((t) => t.id === tabs.aktiverTabId))).toBe(
      g,
    );
    expect(tabs.tabsRef.current.find((t) => t.id === tabs.aktiverTabId)?.initialNorm).toBe('n0');
    expect(getSnapshot()[0]?.text).toBe('Norm nicht gefunden.');
  });
});

it('trägt beim Verweisklick in einen neuen Tab die Ausgangsnorm im Ausgangstab und das Ziel im Zieltab ein; die Frist läuft weiter', async () => {
  vi.useFakeTimers();
  const start = gesetz('de-bund', '§ 1');
  const g = gesetz('de-bw', '§ 9');
  await starten([start]);
  act(() =>
    tabs.verlaufAktivierung(
      tabs.aktiverTabId!,
      { gesetzesreferenz: start, xmlId: 'alte-norm' },
      'schritt',
    ),
  );
  const lauf = spaeter<unknown>();
  importieren.mockReturnValue(lauf.promise);
  await klick(() =>
    navigation.handleVerweisKlick(
      'start',
      verweisziel({
        typ: 'zielnormOhneElementstand',
        gesetz: g,
        bezeichnung: '§ 9',
        verweistextZeichenbereich: [0, 5],
      }),
      true,
    ),
  );
  act(() => {
    vi.advanceTimersByTime(60000);
  });
  const ausgangstab = tabs.aktiverTabId!;
  const eintrag = (referenz: GesetzDarstellung, xmlId: string) => ({
    gesetzesreferenz: referenzVon(referenz),
    xmlId,
  });
  expect(tabs.verlaufLesen(ausgangstab)?.eintraege).toEqual([eintrag(start, 'alte-norm')]);
  await erfolg(g, lauf);
  const zieltab = tabs.aktiverTabId!;
  expect(zieltab).not.toBe(ausgangstab);
  expect(tabs.verlaufLesen(ausgangstab)?.eintraege).toEqual([
    eintrag(start, 'start'),
    eintrag(start, 'alte-norm'),
  ]);
  expect(tabs.verlaufLesen(zieltab)?.eintraege).toEqual([eintrag(g, 'n0')]);
});

// Die gespeicherten Präfixformen aus der Anlage sind auch mit echten Tabs
// auflösbar; der Eingaberundlauf bleibt im zuständigen Bibliothekstest.
it.each(['§31', 'Artikel31', 'Can.31', 'canon31', 'c.31'])(
  'öffnet ein gespeichertes kompaktes Zielnorm %s',
  async (bezeichnung) => {
    const g = gesetz('de-bund', bezeichnung);
    await starten([g]);
    await klick(() =>
      navigation.handleVerweisKlick(
        'start',
        verweisziel({
          typ: 'zielnormOhneElementstand',
          bezeichnung: '31',
          praefix: [bezeichnung.replace('31', '')],
          verweistextZeichenbereich: [0, 2],
        }),
        false,
      ),
    );
    expect(tabs.tabsRef.current.find((t) => t.id === tabs.aktiverTabIdRef.current)).toMatchObject({
      gesetzesreferenz: referenzVon(g),
      initialNorm: 'n0',
    });
  },
);

it('lässt eine alte Wiederholungsaktion keinen bereits gestarteten Wiederholungsversuch ersetzen', async () => {
  const g = gesetz('de-bw', '§ 9');
  await starten();
  importieren.mockResolvedValue({
    art: 'fehler',
    fehler: { grund: 'netzwerk' },
    bestandspruefung: bestand([]),
    ladeabschluss: bestand([]),
  });
  await klick(() => navigation.handleLesezeichenOeffnen('§ 9', g));
  const wiederholen = getSnapshot()[0]!.aktion!.onClick;
  const lauf = spaeter<GesetzLadeabschluss>();
  laden.mockReturnValue(lauf.promise);
  const vorWiederholung = laden.mock.calls.length;
  await klick(() => {
    wiederholen();
    wiederholen();
  });
  expect(laden.mock.calls.length - vorWiederholung).toBe(1);
  expect(getSnapshot()).toEqual([]);
  await act(async () => lauf.fertig(bestand([g])));
  expect(tabs.tabsRef.current[0]?.initialNorm).toBe('n0');
  expect(getSnapshot()).toEqual([]);
});

it.each(['kalt', 'warm'] as const)(
  'öffentlicher %ser Link importiert sofort und prüft die Norm strikt',
  async (art) => {
    await starten();
    const lauf = spaeter<unknown>();
    importieren.mockReturnValue(lauf.promise);
    linksNative.getCurrent.mockResolvedValue(['lexlata://de-bw/TestG/9']);
    await klick(async () => {
      if (art === 'kalt')
        links.oeffneTiefenLinkZiel((await links.leseAppStartZiel())!, [], 'aktiver-tab');
      else linksNative.empfangen({ payload: ['lexlata://de-bw/TestG/9'] });
    });
    expect(importieren).toHaveBeenCalledExactlyOnceWith({ kurztitel: 'TestG', normgeber: 'de-bw' });
    expect(tabs.tabsRef.current).toHaveLength(1);
    expect(tabs.holeTabGesetz(tabs.tabsRef.current[0])).toBeUndefined();
    expect(getSnapshot()[0]).toMatchObject({ text: 'TestG wird importiert …', laedt: true });
    const importiert = gesetz('de-bw', '§ 90');
    await erfolg(importiert, lauf);
    const tabId = tabs.aktiverTabId!;
    expect(tabs.holeTabGesetz(tabs.tabsRef.current.find((t) => t.id === tabId))).toBe(importiert);
    expect(tabs.tabsRef.current.find((t) => t.id === tabId)?.initialNorm).toBe('n0');
    expect(tabs.verlaufLesen(tabId)?.eintraege.map((eintrag) => eintrag.xmlId)).toEqual(['n0']);
    expect(getSnapshot()[0]).toMatchObject({
      text: expect.stringContaining('Das Linkziel konnte nicht geöffnet werden.'),
      laedt: false,
      aktion: undefined,
    });
  },
);

describe('Ausdrückliche Verlaufsnavigation', () => {
  async function verlaufVorbereiten() {
    const start = gesetz('de-bund', '§ 1');
    const ziel = gesetz('de-bw', '§ 90', '§ 9');
    await starten([start]);
    const tabId = tabs.aktiverTabId!;
    act(() => {
      tabs.verlaufHinzufuegen(tabId, {
        gesetzesreferenz: { kurztitel: ziel.kurztitel, normgeber: ziel.normgeber },
        xmlId: 'n1',
      });
      tabs.verlaufHinzufuegen(tabId, {
        gesetzesreferenz: { kurztitel: start.kurztitel, normgeber: start.normgeber },
        xmlId: 'n0',
      });
    });
    return { start, ziel, tabId };
  }
  it('importiert gelöschtes Ziel im aufrufenden Tab, bewegt nur den Zeiger und reaktiviert ihn nicht', async () => {
    const { start, ziel, tabId } = await verlaufVorbereiten();
    const eintraege = tabs.verlaufLesen(tabId)!.eintraege;
    const lauf = spaeter<unknown>();
    importieren.mockReturnValue(lauf.promise);
    await klick(() => aktionen.verlaufSchrittUndOeffnen('zurueck'));
    expect(importieren).toHaveBeenCalledOnce();
    expect(tabs.holeTabGesetz(tabs.tabsRef.current.find((t) => t.id === tabId))).toBe(start);
    expect(tabs.verlaufLesen(tabId)).toEqual({ eintraege, position: 0 });
    act(() => tabs.erstelleLeerenTab());
    const aktiv = tabs.aktiverTabId;
    await erfolg(ziel, lauf);
    expect(tabs.tabsRef.current.find((t) => t.id === tabId)).toMatchObject({
      gesetzesreferenz: referenzVon(ziel),
      initialNorm: 'n1',
    });
    expect(tabs.aktiverTabId).toBe(aktiv);
    expect(tabs.verlaufLesen(tabId)?.position).toBe(0);
    await klick(() => {
      tabs.setAktiverTabId(tabId);
      tabs.verlaufAktivierung(tabId, { gesetzesreferenz: ziel, xmlId: 'n1' }, 'vorgegeben');
    });
    expect(tabs.verlaufLesen(tabId)).toMatchObject({ eintraege, position: 1 });
    laden.mockResolvedValue(bestand([gesetz('de-bund', '§ 1')]));
    await klick(() => aktionen.verlaufSchrittUndOeffnen('vorwaerts'));
    await klick(() =>
      tabs.verlaufAktivierung(
        tabId,
        { gesetzesreferenz: gesetz('de-bund', '§ 1'), xmlId: 'n0' },
        'vorgegeben',
      ),
    );
    expect(tabs.verlaufLesen(tabId)).toMatchObject({ eintraege, position: 0 });
    expect(tabs.tabsRef.current.find((t) => t.id === tabId)?.initialNorm).toBe('n0');
  });
  it('weist fehlende gespeicherte XML-ID nach Import als Normfehler zurück und öffnet das Gesetz ohne neuen Verlauf', async () => {
    const { tabId } = await verlaufVorbereiten();
    const gesetzOhneNorm = gesetz('de-bw', '§ 9');
    const lauf = spaeter<unknown>();
    importieren.mockReturnValue(lauf.promise);
    await klick(() => aktionen.verlaufSchrittUndOeffnen('zurueck'));
    await erfolg(gesetzOhneNorm, lauf);
    expect(tabs.holeTabGesetz(tabs.tabsRef.current.find((t) => t.id === tabId))).toBe(
      gesetzOhneNorm,
    );
    expect(tabs.tabsRef.current.find((t) => t.id === tabId)?.initialNorm).toBe('n0');
    expect(tabs.verlaufLesen(tabId)!.eintraege).toHaveLength(2);
    expect(getSnapshot()[0]).toMatchObject({
      text: 'Norm nicht gefunden.',
      laedt: false,
      aktion: undefined,
      art: 'bedienhinweis',
    });
  });
  it('beachtet echte Lesebefunde und wiederholt ohne Zeigerbewegung oder zusätzlichen Import', async () => {
    const { ziel, tabId } = await verlaufVorbereiten();
    laden.mockResolvedValue({
      liste: [ziel],
      ordnerLesbar: true,
      befunde: [{ dateiBasis: dateiBasis(ziel), status: 'unlesbar', fehler: 'unlesbar' }],
    });
    await klick(() => aktionen.verlaufSchrittUndOeffnen('zurueck'));
    expect(importieren).not.toHaveBeenCalled();
    expect(getSnapshot()[0]?.aktion?.label).toBe('Erneut versuchen');
    laden.mockResolvedValue(bestand([ziel]));
    await klick(() => getSnapshot()[0]!.aktion!.onClick());
    expect(tabs.tabsRef.current.find((t) => t.id === tabId)?.initialNorm).toBe('n1');
    await klick(() =>
      tabs.verlaufAktivierung(tabId, { gesetzesreferenz: ziel, xmlId: 'n1' }, 'vorgegeben'),
    );
    expect(tabs.verlaufLesen(tabId)?.position).toBe(1);
    expect(tabs.verlaufLesen(tabId)!.eintraege).toHaveLength(2);
  });
  it('wiederholt einen Importfehler im ursprünglichen Tab ohne neuen Verlaufseintrag', async () => {
    const { ziel, tabId } = await verlaufVorbereiten();
    importieren.mockResolvedValue({
      art: 'fehler',
      fehler: { grund: 'import' },
      bestandspruefung: bestand([]),
      ladeabschluss: bestand([]),
    });
    await klick(() => aktionen.verlaufSchrittUndOeffnen('zurueck'));
    expect(getSnapshot()[0]?.aktion?.label).toBe('Erneut versuchen');
    const wiederholen = getSnapshot()[0]!.aktion!.onClick;
    const lauf = spaeter<unknown>();
    importieren.mockReturnValue(lauf.promise);
    act(() => tabs.erstelleLeerenTab());
    const aktiv = tabs.aktiverTabId;
    await klick(wiederholen);
    expect(importieren).toHaveBeenCalledTimes(2);
    await erfolg(ziel, lauf);
    expect(tabs.tabsRef.current.find((t) => t.id === tabId)?.initialNorm).toBe('n1');
    expect(tabs.aktiverTabId).toBe(aktiv);
    await klick(() =>
      tabs.verlaufAktivierung(tabId, { gesetzesreferenz: ziel, xmlId: 'n1' }, 'vorgegeben'),
    );
    expect(tabs.verlaufLesen(tabId)?.position).toBe(1);
    expect(tabs.verlaufLesen(tabId)!.eintraege).toHaveLength(2);
    expect(getSnapshot()).toEqual([]);
  });
  it.each(['navigation', 'schliessen'])(
    'entwertet den alten Verlaufauftrag durch %s',
    async (art) => {
      const { start, ziel, tabId } = await verlaufVorbereiten();
      const lauf = spaeter<unknown>();
      importieren.mockReturnValue(lauf.promise);
      await klick(() => aktionen.verlaufSchrittUndOeffnen('zurueck'));
      act(() => {
        if (art === 'schliessen') tabs.tabSchliessen(tabId);
        else navigation.elementOeffnen({ gesetz: start, xmlId: 'n0', modus: 'immer-aktiver-tab' });
      });
      await erfolg(ziel, lauf);
      if (art === 'schliessen') {
        expect(tabs.tabsRef.current.some((t) => t.id === tabId)).toBe(false);
        expect(tabs.verlaufLesen(tabId)).toBeUndefined();
      } else
        expect(tabs.tabsRef.current.find((t) => t.id === tabId)).toMatchObject({
          gesetzesreferenz: referenzVon(start),
          initialNorm: 'n0',
        });
      expect(getSnapshot()).toEqual([]);
    },
  );
});

describe('Ausdrückliche Tabwiederöffnung', () => {
  function geschlossen(g: GesetzDarstellung, xmlId = 'n1', verlaufGesetz = g) {
    const verlauf = {
      eintraege: ['n0', xmlId, 'n2'].map((id) => ({
        gesetzesreferenz: {
          kurztitel: verlaufGesetz.kurztitel,
          normgeber: verlaufGesetz.normgeber,
        },
        xmlId: id,
      })),
      position: 1,
    };
    geschlossenenTabPushen({ gesetzesreferenz: g, verlauf });
    return verlauf;
  }

  it('zeigt den Tab samt vollständigem Verlauf erst nach dem Import und verbraucht den Stapel nur einmal bei Retry', async () => {
    const ziel = gesetz('de-bw', '§ 1', '§ 2', '§ 3');
    await starten();
    const darunter = geschlossen(gesetz('de-bund', '§ 1'));
    const verlauf = geschlossen(ziel);
    const lauf = spaeter<unknown>();
    importieren.mockReturnValue(lauf.promise);
    await klick(aktionen.tabWiederherstellenAktuell);
    expect(tabs.tabs).toHaveLength(1);
    expect(importieren).toHaveBeenCalledExactlyOnceWith({ kurztitel: 'TestG', normgeber: 'de-bw' });
    await act(async () =>
      lauf.fertig({
        art: 'fehler',
        fehler: { grund: 'import' },
        bestandspruefung: bestand([]),
        ladeabschluss: bestand([]),
      }),
    );
    expect(getSnapshot().at(-1)).toMatchObject({
      laedt: false,
      aktion: { label: 'Erneut versuchen' },
    });
    expect(tabs.tabs).toHaveLength(1);
    await erfolg(ziel);
    await klick(() => getSnapshot().at(-1)!.aktion!.onClick());
    expect(tabs.tabs).toHaveLength(2);
    const tabId = tabs.aktiverTabId!;
    expect(tabs.tabsRef.current.find((t) => t.id === tabId)).toMatchObject({
      gesetzesreferenz: referenzVon(ziel),
      initialNorm: 'n1',
    });
    expect(tabs.verlaufLesen(tabId)).toEqual(verlauf);
    expect(geschlossenenTabPoppen()?.verlauf).toEqual(darunter);
    expect(geschlossenenTabPoppen()).toBeNull();
  });

  it('E6: zeigt bei inzwischen fehlendem und nicht importierbarem Gesetz nur ein Banner', async () => {
    const ausgang = gesetz('de-bund', '§ 1');
    await starten([ausgang]);
    geschlossen(gesetz('de-bw', '§ 1', '§ 2'));
    importieren.mockResolvedValue({
      art: 'fehler',
      fehler: { grund: 'nichtVerfuegbar' },
      bestandspruefung: bestand([]),
      ladeabschluss: bestand([]),
    });
    const vorher = structuredClone({
      tabs: tabs.tabsRef.current,
      aktiv: tabs.aktiverTabIdRef.current,
      verlauf: tabVerlaeufeLesen(tabs),
    });
    await klick(aktionen.tabWiederherstellenAktuell);
    expect(importieren).toHaveBeenCalledOnce();
    expect({
      tabs: tabs.tabsRef.current,
      aktiv: tabs.aktiverTabIdRef.current,
      verlauf: tabVerlaeufeLesen(tabs),
    }).toEqual(vorher);
    expect(getSnapshot()).toHaveLength(1);
    expect(getSnapshot()[0]).toMatchObject({ typ: 'warnung', laedt: false, aktion: undefined });
  });

  it.each(['vorhanden', 'fehlt'])(
    'verwendet XML-ID aus einem anderen Verlaufsgesetz bei Wiederimport nicht (%s)',
    async (art) => {
      const ziel = gesetz('de-bw', '§ 1', '§ 2');
      await starten();
      const verlauf = geschlossen(
        ziel,
        art === 'vorhanden' ? 'n1' : 'fehlt',
        gesetz('de-bund', '§ 1'),
      );
      await erfolg(ziel);
      await klick(aktionen.tabWiederherstellenAktuell);
      const tab = tabs.tabsRef.current.find((t) => t.id === tabs.aktiverTabId)!;
      expect(tabs.holeTabGesetz(tab)).toBe(ziel);
      expect(tab.initialNorm).toBe('n0');
      expect(tabs.verlaufLesen(tab.id)).toEqual(verlauf);
      expect(getSnapshot()).toEqual([]);
    },
  );

  it('erhält bei passender Referenz eine fehlende XML-ID als Normfehler und öffnet das Gesetz', async () => {
    const ziel = gesetz('de-bund', '§ 90', '§ 9a');
    await starten();
    const verlauf = geschlossen(ziel, 'fehlt');
    await erfolg(ziel);
    await klick(aktionen.tabWiederherstellenAktuell);
    const tab = tabs.tabsRef.current.find((t) => t.id === tabs.aktiverTabId)!;
    expect(tabs.holeTabGesetz(tab)).toBe(ziel);
    expect(tab.initialNorm).toBe('n0');
    expect(tabs.verlaufLesen(tab.id)).toEqual(verlauf);
    expect(getSnapshot().at(-1)).toMatchObject({
      text: 'Norm nicht gefunden.',
      laedt: false,
      aktion: undefined,
    });
  });

  it('öffnet ohne Normziel das ganze Gesetz und erhält den leeren Verlauf', async () => {
    const ziel = gesetz('de-bund', '§ 1');
    await starten();
    const verlauf = { eintraege: [], position: 0 };
    geschlossenenTabPushen({ gesetzesreferenz: ziel, verlauf });
    await erfolg(ziel);
    await klick(aktionen.tabWiederherstellenAktuell);
    const tab = tabs.tabsRef.current.find((t) => t.id === tabs.aktiverTabId)!;
    expect(tabs.holeTabGesetz(tab)).toBe(ziel);
    expect(tabs.verlaufLesen(tab.id)).toEqual(verlauf);
  });

  it.each(['wechsel', 'navigation', 'schliessen'])(
    'beachtet %s während der Wiederöffnung',
    async (art) => {
      const ziel = gesetz('de-bw', '§ 1', '§ 2', '§ 3');
      const anderes = gesetz('de-bund', '§ 1');
      await starten([anderes]);
      const alterAktiverTab = tabs.aktiverTabId!;
      const verlauf = geschlossen(ziel);
      const lauf = spaeter<unknown>();
      importieren.mockReturnValue(lauf.promise);
      await klick(aktionen.tabWiederherstellenAktuell);
      await klick(() => {
        if (art === 'wechsel') tabs.erstelleLeerenTab();
        else if (art === 'navigation')
          navigation.elementOeffnen({ gesetz: anderes, xmlId: 'n0', modus: 'immer-aktiver-tab' });
        else tabs.tabSchliessen(alterAktiverTab);
      });
      const leer = tabs.aktiverTabId;
      await erfolg(ziel, lauf);
      const tab = tabs.tabsRef.current.find((t) => tabs.holeTabGesetz(t) === ziel);
      if (art === 'navigation') {
        // E3: Die neuere Öffnung gewinnt; der Import endet ohne Anzeige.
        expect(tab).toBeUndefined();
      } else {
        // E1: Ein neuer Tab entsteht trotz Tabwechsel oder geschlossenem Ausgangstab.
        assert(tab);
        expect(tabs.verlaufLesen(tab.id)).toEqual(verlauf);
        if (art === 'wechsel') expect(tabs.aktiverTabId).toBe(leer);
      }
      expect(getSnapshot()).toEqual([]);
    },
  );

  it('öffnet keinen alten Bestand und importiert nicht bei regulärem Ladebefund; Retry behält den Verlauf', async () => {
    const ziel = gesetz('de-bund', '§ 1', '§ 2');
    await starten([ziel]);
    const verlauf = geschlossen(ziel);
    laden.mockResolvedValue({
      liste: [ziel],
      ordnerLesbar: true,
      befunde: [{ dateiBasis: dateiBasis(ziel), status: 'unlesbar', fehler: 'unlesbar' }],
    });
    const vorher = tabs.tabsRef.current;
    await klick(aktionen.tabWiederherstellenAktuell);
    expect(tabs.tabsRef.current).toBe(vorher);
    expect(importieren).not.toHaveBeenCalled();
    laden.mockResolvedValue(bestand([ziel]));
    await klick(() => getSnapshot().at(-1)!.aktion!.onClick());
    const tabId = tabs.aktiverTabId!;
    expect(tabs.tabsRef.current.find((t) => t.id === tabId)).toMatchObject({
      gesetzesreferenz: referenzVon(ziel),
      initialNorm: 'n1',
    });
    expect(tabs.verlaufLesen(tabId)).toEqual(verlauf);
    expect(geschlossenenTabPoppen()).toBeNull();
  });
});

it('öffnet einen früheren Dateibasis-Stapel ohne installierte Gesetzesdatei nach Import', async () => {
  const ziel = gesetz('de-bund', '§ 1', '§ 2');
  await starten();
  localStorage.setItem(
    'lexlata.geschlosseneTabs',
    JSON.stringify([
      {
        gesetzesreferenz: { kurztitel: 'TestG', normgeber: 'de-bund' },
        verlauf: {
          eintraege: [
            { gesetzesreferenz: { kurztitel: 'TestG', normgeber: 'de-bund' }, xmlId: 'n1' },
          ],
          position: 0,
        },
      },
    ]),
  );
  await erfolg(ziel);
  await klick(aktionen.tabWiederherstellenAktuell);
  const tab = tabs.tabsRef.current.find((t) => t.id === tabs.aktiverTabId)!;
  expect(tab).toMatchObject({ gesetzesreferenz: referenzVon(ziel), initialNorm: 'n1' });
  expect(tabs.verlaufLesen(tab.id)).toEqual({
    eintraege: [{ gesetzesreferenz: { kurztitel: 'TestG', normgeber: 'de-bund' }, xmlId: 'n1' }],
    position: 0,
  });
  expect(localStorage.getItem('lexlata.geschlosseneTabs')).toBe('[]');
});

it('öffnet die frische Norm statt sie anhand des alten sichtbaren Bestands abzuweisen', async () => {
  const alt = gesetz('de-bund', '§ 90');
  const frisch = gesetz('de-bund', '§ 9');
  await starten([alt]);
  laden.mockResolvedValue(bestand([frisch]));
  await klick(() => navigation.handleLesezeichenOeffnen('§ 9', alt));
  expect(tabs.tabsRef.current[0]).toMatchObject({
    gesetzesreferenz: referenzVon(frisch),
    initialNorm: 'n0',
  });
  expect(importieren).not.toHaveBeenCalled();
  expect(getSnapshot()).toEqual([]);
});

it.each(['bevorzugt-vorhanden', 'aktiver-tab', 'immer-neu', 'immer-aktiver-tab'] as const)(
  'öffnet nach fehlgeschlagenem Normsprung das geladene Gesetz modustreu (%s)',
  async (modus) => {
    const start = gesetz('de-bund', '§ 1');
    const ziel = gesetz('de-bw', '§ 90');
    await starten([start, ziel]);
    const vorher = structuredClone({
      tabs: tabs.tabsRef.current,
      aktiv: tabs.aktiverTabIdRef.current,
    });
    const pruefung = spaeter<GesetzLadeabschluss>();
    laden.mockReturnValue(pruefung.promise);
    await klick(() =>
      navigation.gesetzesreferenzOeffnen({ gesetzesreferenz: ziel, bezeichnung: '§ 9' }, modus),
    );
    expect(tabs.tabsRef.current).toEqual(vorher.tabs);
    expect(tabs.aktiverTabIdRef.current).toBe(vorher.aktiv);
    expect(getSnapshot()).toEqual([]);
    await act(async () => pruefung.fertig(bestand([start, ziel])));
    const tab = tabs.tabsRef.current.find((tab) => tab.id === tabs.aktiverTabIdRef.current)!;
    expect(tab).toMatchObject({ gesetzesreferenz: referenzVon(ziel), initialNorm: 'n0' });
    expect(tabs.tabsRef.current).toHaveLength(
      modus === 'immer-neu' || modus === 'bevorzugt-vorhanden' ? 2 : 1,
    );
    expect(tabs.verlaufLesen(tab.id)?.eintraege.map((eintrag) => eintrag.xmlId)).toEqual(['n0']);
    expect(importieren).not.toHaveBeenCalled();
    expect(getSnapshot()[0]?.text).toBe('Norm nicht gefunden.');
  },
);

it('ändert bei fehlendem Gesetz keinen Tab und zeigt erst nach zuverlässiger Prüfung den Import', async () => {
  await starten([gesetz('de-bund', '§ 1')]);
  const aktiv = tabs.aktiverTabIdRef.current;
  const pruefung = spaeter<GesetzLadeabschluss>();
  laden.mockReturnValueOnce(pruefung.promise);
  await klick(() =>
    navigation.gesetzesreferenzOeffnen(
      { gesetzesreferenz: gesetz('de-bw'), bezeichnung: '§ 9' },
      'immer-neu',
    ),
  );
  expect(tabs.tabsRef.current).toHaveLength(1);
  expect(tabs.aktiverTabIdRef.current).toBe(aktiv);
  expect(getSnapshot()).toEqual([]);
  expect(importieren).not.toHaveBeenCalled();
  await act(async () => pruefung.fertig(bestand([])));
  expect(importieren).toHaveBeenCalledOnce();
  expect(getSnapshot()[0]).toMatchObject({ text: 'TestG wird importiert …', laedt: true });
});

it.each(['wechsel', 'navigation', 'schliessen'] as const)(
  'beachtet %s während der bannerlosen Vorprüfung eines vorhandenen Gesetzes',
  async (art) => {
    const alt = gesetz('de-bund', '§ 90');
    const frisch = gesetz('de-bund', '§ 9');
    await starten([alt]);
    const id = tabs.aktiverTabIdRef.current!;
    const pruefung = spaeter<GesetzLadeabschluss>();
    laden.mockReturnValueOnce(pruefung.promise).mockResolvedValue(bestand([alt]));
    await klick(() => navigation.handleLesezeichenOeffnen('§ 9', alt));
    expect(getSnapshot()).toEqual([]);
    await klick(() => {
      if (art === 'wechsel') tabs.erstelleLeerenTab();
      else if (art === 'navigation')
        navigation.elementOeffnen({ gesetz: alt, xmlId: 'n0', modus: 'immer-aktiver-tab' });
      else tabs.tabSchliessen(id);
    });
    const aktiv = tabs.aktiverTabIdRef.current;
    await act(async () => pruefung.fertig(bestand([frisch])));
    const tab = tabs.tabsRef.current.find((t) => t.id === id);
    if (art === 'wechsel')
      expect(tab).toMatchObject({ gesetzesreferenz: referenzVon(frisch), initialNorm: 'n0' });
    else if (art === 'navigation')
      expect(tab).toMatchObject({ gesetzesreferenz: referenzVon(alt), initialNorm: 'n0' });
    else expect(tab).toBeUndefined();
    expect(tabs.aktiverTabIdRef.current).toBe(aktiv);
    expect(getSnapshot()).toEqual([]);
    expect(importieren).not.toHaveBeenCalled();
  },
);

it('lässt umgekehrte Vorprüfungsabschlüsse weder das neue Ziel noch dessen Fehlerbanner verändern', async () => {
  const alt = gesetz('de-bund', '§ 90');
  await starten([alt]);
  const erstePruefung = spaeter<GesetzLadeabschluss>();
  const zweitePruefung = spaeter<GesetzLadeabschluss>();
  laden.mockReturnValueOnce(erstePruefung.promise).mockReturnValueOnce(zweitePruefung.promise);
  await klick(() => navigation.handleLesezeichenOeffnen('§ 9', alt));
  await klick(() => navigation.handleLesezeichenOeffnen('§ 10', alt));
  await act(async () => zweitePruefung.fertig({ liste: [], ordnerLesbar: false, befunde: [] }));
  const banner = getSnapshot()[0]!;
  await act(async () => erstePruefung.fertig(bestand([gesetz('de-bund', '§ 9')])));
  expect(getSnapshot()).toEqual([banner]);
  expect(tabs.tabsRef.current[0]?.initialNorm).toBe('start');
  laden.mockResolvedValue(bestand([gesetz('de-bund', '§ 10')]));
  await klick(() => banner.aktion!.onClick());
  expect(tabs.holeTabGesetz(tabs.tabsRef.current[0])?.elemente[0]?.data.bezeichnung).toBe('§ 10');
  expect(getSnapshot()).toEqual([]);
});

it.each(['bevorzugt-vorhanden', 'aktiver-tab', 'immer-neu', 'immer-aktiver-tab'] as const)(
  'hält nach Vorprüfung die Tabwahl für ein bereits anderweitig geöffnetes Gesetz ein (%s)',
  async (modus) => {
    const start = gesetz('de-bund', '§ 1');
    const ziel = gesetz('de-bw', '§ 9');
    await starten([start, ziel]);
    const ausgangId = tabs.aktiverTabIdRef.current!;
    let zielId!: string;
    act(() => {
      zielId = tabs.gesetzOeffnen(ziel, 'alt', 'immer-neu');
      tabs.setAktiverTabId(ausgangId);
    });
    await klick(() =>
      navigation.gesetzesreferenzOeffnen({ gesetzesreferenz: ziel, bezeichnung: '§ 9' }, modus),
    );
    const tab = tabs.tabsRef.current.find((t) => t.id === tabs.aktiverTabIdRef.current)!;
    expect(tab).toMatchObject({ gesetzesreferenz: referenzVon(ziel), initialNorm: 'n0' });
    if (modus === 'immer-aktiver-tab') expect(tab.id).toBe(ausgangId);
    else if (modus === 'immer-neu') {
      expect(tab.id).not.toBe(ausgangId);
      expect(tab.id).not.toBe(zielId);
    } else expect(tab.id).toBe(zielId);
    expect(tabs.tabsRef.current).toHaveLength(modus === 'immer-neu' ? 3 : 2);
    expect(importieren).not.toHaveBeenCalled();
    expect(getSnapshot()).toEqual([]);
  },
);

it.each(['xml', 'mehrdeutig', 'fehlend'] as const)(
  'öffnet bei frisch ungültigem Normziel das Gesetz mit Hinweis (%s)',
  async (art) => {
    const alt = gesetz('de-bund', '§ 9');
    await starten([alt]);
    const vorher = structuredClone({
      tabs: tabs.tabsRef.current,
      aktiv: tabs.aktiverTabIdRef.current,
      verlauf: tabVerlaeufeLesen(tabs),
    });
    laden.mockResolvedValue(
      bestand([art === 'mehrdeutig' ? gesetz('de-bund', '§ 9', '§ 9') : gesetz('de-bund', '§ 90')]),
    );
    await klick(() =>
      navigation.gesetzesreferenzOeffnen(
        {
          gesetzesreferenz: alt,
          ...(art === 'xml' ? { xmlId: 'fehlt', bezeichnung: '§ 90' } : { bezeichnung: '§ 9' }),
        },
        'immer-neu',
      ),
    );
    expect(tabs.tabsRef.current).toHaveLength(2);
    expect(tabs.tabsRef.current[0]?.id).toBe(vorher.tabs[0]?.id);
    const tab = tabs.tabsRef.current.find((tab) => tab.id === tabs.aktiverTabIdRef.current)!;
    expect(tab).toMatchObject({ gesetzesreferenz: referenzVon(alt), initialNorm: 'n0' });
    expect(tabs.verlaufLesen(tab.id)?.eintraege.map((eintrag) => eintrag.xmlId)).toEqual(['n0']);
    expect(getSnapshot()[0]?.text).toBe('Norm nicht gefunden.');
    expect(importieren).not.toHaveBeenCalled();
  },
);

it('überholt während der Vorprüfung keine spätere Navigation im anderweitig geöffneten Zieltab', async () => {
  const start = gesetz('de-bund', '§ 1');
  const ziel = gesetz('de-bw', '§ 9', '§ 10');
  await starten([start, ziel]);
  const ausgangId = tabs.aktiverTabIdRef.current!;
  let zielId!: string;
  act(() => {
    zielId = tabs.gesetzOeffnen(ziel, 'alt', 'immer-neu');
    tabs.setAktiverTabId(ausgangId);
  });
  const pruefung = spaeter<GesetzLadeabschluss>();
  laden.mockReturnValueOnce(pruefung.promise);
  await klick(() => navigation.handleLesezeichenOeffnen('§ 9', ziel));
  await klick(() => {
    tabs.setAktiverTabId(zielId);
    navigation.elementOeffnen({ gesetz: ziel, xmlId: 'n1', modus: 'immer-aktiver-tab' });
  });
  const vorher = structuredClone(tabs.tabsRef.current.find((t) => t.id === zielId));
  await act(async () => pruefung.fertig(bestand([start, ziel])));
  expect(tabs.tabsRef.current.find((t) => t.id === zielId)).toEqual(vorher);
  expect(tabs.aktiverTabIdRef.current).toBe(zielId);
  expect(getSnapshot()).toEqual([]);
});

it('dedupliziert Mehrfachklicks während der bannerlosen Bestandsprüfung samt erfolgreichem Verlauf', async () => {
  const g = gesetz('de-bund', '§ 9');
  await starten([g]);
  const pruefung = spaeter<GesetzLadeabschluss>();
  laden.mockReturnValue(pruefung.promise);
  const klicken = () =>
    navigation.handleVerweisKlick(
      'start',
      verweisziel({
        typ: 'zielnormOhneElementstand',
        bezeichnung: '§ 9',
        verweistextZeichenbereich: [0, 2],
      }),
      false,
    );
  await klick(() => {
    klicken();
    klicken();
  });
  expect(laden).toHaveBeenCalledOnce();
  expect(tabs.tabsRef.current).toHaveLength(1);
  expect(getSnapshot()).toEqual([]);
  await act(async () => pruefung.fertig(bestand([g])));
  expect(tabs.tabsRef.current[0]?.initialNorm).toBe('n0');
  expect(tabs.verlaufLesen(ersterTabId())?.eintraege).toEqual(
    ['n0', 'start'].map((xmlId) => ({
      gesetzesreferenz: { kurztitel: 'TestG', normgeber: 'de-bund' },
      xmlId,
    })),
  );
  expect(importieren).not.toHaveBeenCalled();
  expect(getSnapshot()).toEqual([]);
});

it('öffnet ein zuvor ungeladenes Gesetz bei frisch fehlender Norm mit Hinweis', async () => {
  const ausgang = gesetz('de-bund', '§ 1');
  const ziel = gesetz('de-bw', '§ 90');
  await starten([ausgang]);
  laden.mockResolvedValue(bestand([ausgang, ziel]));
  await klick(() =>
    navigation.gesetzesreferenzOeffnen(
      { gesetzesreferenz: ziel, bezeichnung: '§ 9' },
      'aktiver-tab',
    ),
  );
  expect(getSnapshot()[0]?.text).toBe('Norm nicht gefunden.');
  expect(importieren).not.toHaveBeenCalled();
  expect(tabs.holeTabGesetz(tabs.tabsRef.current[0])).toBe(ziel);
  expect(tabs.tabsRef.current[0]?.initialNorm).toBe('n0');
});
it('E3: öffnet von zwei Zielen für neue Tabs nur das neuere, auch bei umgekehrtem Abschluss', async () => {
  const ausgang = gesetz('de-bund', '§ 1');
  const ziel = gesetz('de-bw', '§ 9', '§ 10');
  await starten([ausgang, ziel]);
  const a = spaeter<GesetzLadeabschluss>();
  const b = spaeter<GesetzLadeabschluss>();
  laden.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  await klick(() =>
    navigation.gesetzesreferenzOeffnen({ gesetzesreferenz: ziel, bezeichnung: '§ 9' }, 'immer-neu'),
  );
  await klick(() =>
    navigation.gesetzesreferenzOeffnen(
      { gesetzesreferenz: ziel, bezeichnung: '§ 10' },
      'immer-neu',
    ),
  );
  await act(async () => b.fertig(bestand([ausgang, ziel])));
  await act(async () => a.fertig(bestand([ausgang, ziel])));
  expect(
    tabs.tabsRef.current.filter((t) => tabs.holeTabGesetz(t) === ziel).map((t) => t.initialNorm),
  ).toEqual(['n1']);
});

it('überholt keinen erst während der Vorprüfung neu geöffneten Zieltab', async () => {
  const ausgang = gesetz('de-bund', '§ 1');
  const ziel = gesetz('de-bw', '§ 9', '§ 10');
  await starten([ausgang, ziel]);
  const lauf = spaeter<GesetzLadeabschluss>();
  laden.mockReturnValueOnce(lauf.promise);
  await klick(() =>
    navigation.gesetzesreferenzOeffnen(
      { gesetzesreferenz: ziel, bezeichnung: '§ 9' },
      'aktiver-tab',
    ),
  );
  await klick(() => navigation.elementOeffnen({ gesetz: ziel, xmlId: 'n1', modus: 'immer-neu' }));
  const neuerTab = tabs.aktiverTabId!;
  expect(tabs.tabsRef.current.find((t) => t.id === neuerTab)?.initialNorm).toBe('n1');
  await act(async () => lauf.fertig(bestand([ausgang, ziel])));
  expect(tabs.tabsRef.current.find((t) => t.id === neuerTab)?.initialNorm).toBe('n1');
});

it.each(['navigation', 'schliessen'] as const)(
  'E1/E3: behandelt %s im Ausgangstab während der Prüfung eines neuen Tabs',
  async (art) => {
    const ausgang = gesetz('de-bund', '§ 1');
    const ziel = gesetz('de-bw', '§ 9', '§ 10');
    await starten([ausgang, ziel]);
    const id = tabs.aktiverTabIdRef.current!;
    const pruefung = spaeter<GesetzLadeabschluss>();
    laden.mockReturnValue(pruefung.promise);
    for (const bezeichnung of ['§ 9', '§ 10'])
      await klick(() =>
        navigation.gesetzesreferenzOeffnen({ gesetzesreferenz: ziel, bezeichnung }, 'immer-neu'),
      );
    expect(tabs.tabsRef.current).toHaveLength(1);
    await klick(() => {
      if (art === 'schliessen') tabs.tabSchliessen(id);
      else navigation.elementOeffnen({ gesetz: ausgang, xmlId: 'n0', modus: 'immer-aktiver-tab' });
    });
    const vorher = structuredClone({
      tabs: tabs.tabsRef.current,
      aktiv: tabs.aktiverTabIdRef.current,
      verlauf: tabVerlaeufeLesen(tabs),
    });
    await act(async () => pruefung.fertig(bestand([ausgang, ziel])));
    if (art === 'navigation')
      // E3: Die neuere Navigation gewinnt; die Prüfungen enden ohne Anzeige.
      expect({
        tabs: tabs.tabsRef.current,
        aktiv: tabs.aktiverTabIdRef.current,
        verlauf: tabVerlaeufeLesen(tabs),
      }).toEqual(vorher);
    // E1: Bei „neuer Tab“ entsteht der neue Tab trotz geschlossenem Ausgangstab.
    else
      expect(
        tabs.tabsRef.current
          .filter((t) => tabs.holeTabGesetz(t) === ziel)
          .map((t) => t.initialNorm),
      ).toEqual(['n1']);
    expect(getSnapshot()).toEqual([]);
  },
);

it('E3: verwirft die ältere Öffnung samt Normfehler und aktiviert nach Tabwechsel nicht', async () => {
  const ausgang = gesetz('de-bund', '§ 1');
  const ziel = gesetz('de-bw', '§ 9');
  await starten([ausgang, ziel]);
  const a = spaeter<GesetzLadeabschluss>();
  const b = spaeter<GesetzLadeabschluss>();
  laden.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  for (const bezeichnung of ['§ 8', '§ 9'])
    await klick(() =>
      navigation.gesetzesreferenzOeffnen({ gesetzesreferenz: ziel, bezeichnung }, 'immer-neu'),
    );
  await klick(() => tabs.erstelleLeerenTab());
  const aktiv = tabs.aktiverTabIdRef.current;
  await act(async () => a.fertig(bestand([ausgang, ziel])));
  expect(getSnapshot()).toEqual([]);
  expect(tabs.tabsRef.current).toHaveLength(2);
  await act(async () => b.fertig(bestand([ausgang, ziel])));
  expect(
    tabs.tabsRef.current.filter((t) => tabs.holeTabGesetz(t) === ziel).map((t) => t.initialNorm),
  ).toEqual(['n0']);
  expect(tabs.aktiverTabIdRef.current).toBe(aktiv);
  expect(getSnapshot()).toEqual([]);
});

it.each(['aktiver-tab', 'immer-aktiver-tab'] as const)(
  'lässt beim ungeladenen Gesetz das alte Gesetz samt Ansicht bis zum Abschluss sichtbar (%s)',
  async (modus) => {
    const ausgang = gesetz('de-bund', '§ 1');
    const ziel = gesetz('de-bw');
    await starten([ausgang]);
    const id = tabs.aktiverTabIdRef.current!;
    const position = { index: 3, offset: 21 };
    tabs.scrollPositionenRef.current[id + '-' + gesetzesreferenzSchluessel(ausgang)] = position;
    const vorher = structuredClone(tabs.tabsRef.current);
    const pruefung = spaeter<GesetzLadeabschluss>();
    laden.mockReturnValueOnce(pruefung.promise);
    await klick(() => navigation.gesetzesreferenzOeffnen({ gesetzesreferenz: ziel }, modus));
    expect(tabs.tabsRef.current).toEqual(vorher);
    expect(tabs.aktiverTabIdRef.current).toBe(id);
    expect(getSnapshot()).toEqual([]);
    await act(async () => pruefung.fertig(bestand([ausgang])));
    expect(tabs.tabsRef.current).toEqual(vorher);
    expect(tabs.holeTabGesetz(tabs.tabsRef.current[0])).toBe(ausgang);
    expect(
      tabs.scrollPositionenRef.current[id + '-' + gesetzesreferenzSchluessel(ausgang)],
    ).toEqual(position);
    expect(getSnapshot()[0]).toMatchObject({ text: 'TestG wird importiert …', laedt: true });
    expect(importieren).toHaveBeenCalledOnce();
  },
);

it('E3: lässt nach einer älteren Navigation im Ausgangstab nur die neuere Öffnung im neuen Tab wirken', async () => {
  const ausgang = gesetz('de-bund', '§ 1');
  const ziel = gesetz('de-bw', '§ 9', '§ 10');
  await starten([ausgang, ziel]);
  const a = spaeter<GesetzLadeabschluss>();
  const b = spaeter<GesetzLadeabschluss>();
  laden.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
  await klick(() =>
    navigation.gesetzesreferenzOeffnen(
      { gesetzesreferenz: ziel, bezeichnung: '§ 9' },
      'aktiver-tab',
    ),
  );
  await klick(() =>
    navigation.gesetzesreferenzOeffnen(
      { gesetzesreferenz: ziel, bezeichnung: '§ 10' },
      'immer-neu',
    ),
  );
  await act(async () => a.fertig(bestand([ausgang, ziel])));
  await act(async () => b.fertig(bestand([ausgang, ziel])));
  expect(tabs.holeTabGesetz(tabs.tabsRef.current[0])).toBe(ausgang);
  expect(
    tabs.tabsRef.current.filter((t) => tabs.holeTabGesetz(t) === ziel).map((t) => t.initialNorm),
  ).toEqual(['n1']);
});

it.each([
  ['externes Gesetz', true],
  ['externes Gesetz', false],
  ['Ausgangsgesetz', true],
  ['Ausgangsgesetz', false],
] as const)('öffnet das gespeicherte ganze %s (mit Bezugstext=%s)', async (art, mitBezugstext) => {
  const ausgang = gesetz('de-bund', '§ 1');
  const ziel = art === 'Ausgangsgesetz' ? ausgang : gesetz('de-bw', '§ 90');
  await starten([ausgang, ...(ziel === ausgang ? [] : [ziel])]);
  const xml = `<markierungen version="1"><infos><gesetz normgeber="de-bund">TestG</gesetz></infos>
    <inhalt><verweismarkierung><bezeichnung>§ 1</bezeichnung>
    ${mitBezugstext ? '<textstelle><zeichenbereich start="0" ende="2"/></textstelle><bezugstext>GG</bezugstext>' : '<elementstand><textlaenge>42</textlaenge></elementstand>'}
    <verweisinhalt><verweistext>GG</verweistext><verweisziel>
    <gesetz normgeber="${ziel.normgeber}">TestG</gesetz><verweistextZeichenbereich start="0" ende="2"/>
    </verweisziel></verweisinhalt></verweismarkierung></inhalt></markierungen>`;
  const zielnorm = beurteileMarkierungsImport(xml, ausgang).eintraege[0]!.verweisinhalt!
    .verweisziele[0]!;
  expect(zielnorm).toMatchObject({ typ: 'ganzesGesetz' });
  expect(zielnorm.elementstand).toBeUndefined();
  await klick(() => navigation.handleVerweisKlick('n0', zielnorm, false));
  const tab = tabs.tabsRef.current.find((t) => t.id === tabs.aktiverTabId)!;
  expect(tabs.holeTabGesetz(tab)).toBe(ziel);
  expect(tab.initialNorm).toBe(ziel === ausgang ? 'start' : 'n0');
  expect(
    tabs.verlaufLesen(tab.id)?.eintraege.map((e) => [e.gesetzesreferenz.normgeber, e.xmlId]),
  ).toEqual(
    ziel === ausgang
      ? undefined // V10: vorhandenes Gesetz ohne Ziel wird nur aktiviert.
      : [
          ['de-bw', 'n0'],
          ['de-bund', 'n0'],
        ],
  );
  expect(importieren).not.toHaveBeenCalled();
});

function aktiveTabId(): string {
  const id = tabs.aktiverTabId;
  assert(id);
  return id;
}

describe('Phase 5: Startelement und bestätigte Verlaufsnavigation', () => {
  it('trägt ohne Ziel das erste Element beim erstmaligen Zeigen ein', async () => {
    const g = gesetz('de-bund', '§ 1', '§ 2');
    await starten();
    await klick(() => navigation.elementOeffnen({ gesetz: g, modus: 'aktiver-tab' }));
    expect(tabs.verlaufLesen(aktiveTabId())?.eintraege.map((e) => e.xmlId)).toEqual(['n0']);
  });

  it('bestätigt zwei direkt aufeinanderfolgende Zurück-Befehle erst nach ihren Ladeabschlüssen', async () => {
    const g = gesetz('de-bund', '§ 1', '§ 2', '§ 3');
    await starten([g]);
    const id = aktiveTabId();
    await klick(() =>
      tabs.verlaufSetzen(id, {
        eintraege: ['n2', 'n1', 'n0'].map((xmlId) => ({ gesetzesreferenz: g, xmlId })),
        position: 0,
      }),
    );
    const erster = spaeter<GesetzLadeabschluss>();
    const zweiter = spaeter<GesetzLadeabschluss>();
    laden.mockReturnValueOnce(erster.promise).mockReturnValueOnce(zweiter.promise);
    await klick(() => {
      aktionen.verlaufSchrittUndOeffnen('zurueck');
      aktionen.verlaufSchrittUndOeffnen('zurueck');
    });
    expect(tabs.verlaufLesen(id)?.position).toBe(0);
    expect(laden).toHaveBeenCalledTimes(1);
    await klick(() => erster.fertig(bestand([g])));
    await klick(() =>
      tabs.verlaufAktivierung(id, { gesetzesreferenz: g, xmlId: 'n1' }, 'vorgegeben'),
    );
    expect(tabs.verlaufLesen(id)?.position).toBe(1);
    expect(laden).toHaveBeenCalledTimes(2);
    await klick(() => zweiter.fertig(bestand([g])));
    await klick(() =>
      tabs.verlaufAktivierung(id, { gesetzesreferenz: g, xmlId: 'n0' }, 'vorgegeben'),
    );
    expect(tabs.verlaufLesen(id)?.position).toBe(2);
    expect(tabs.tabsRef.current.find((t) => t.id === id)?.initialNorm).toBe('n0');
  });
});

it.each(['synchron', 'synchron-immer-aktiver-tab', 'asynchron'] as const)(
  'bewahrt zwei tabbezogene Stellen ohne Ziel (%s)',
  async (weg) => {
    const g = gesetz('de-bund', '§ 1', '§ 2', '§ 3');
    await starten([g]);
    const erste = g;
    await klick(() => {
      tabs.setTabs([
        tabFuerTest({ id: 'eins', gesetz: erste }, tabs),
        tabFuerTest({ id: 'zwei', gesetz: erste }, tabs),
      ]);
      tabs.setAktiverTabId('zwei');
      for (const [index, id] of ['eins', 'zwei'].entries()) {
        const key = id + '-' + gesetzesreferenzSchluessel(g);
        tabs.einklappZustandRef.current[key] = {
          aktivesElementId: index ? 'n1' : 'n0',
          normen: new Set(['n0']),
          ueberschriften: new Set(),
        };
        tabs.scrollPositionenRef.current[key] = { index, offset: index + 15 };
        tabs.verlaufSetzen(id, {
          eintraege: [{ gesetzesreferenz: g, xmlId: index ? 'n1' : 'n0' }],
          position: 0,
        });
      }
      const gespeichert = g.elemente[2];
      assert(gespeichert);
      speichereAktivierung(g, gespeichert);
    });
    const ansichten = { ...tabs.einklappZustandRef.current };
    const positionen = { ...tabs.scrollPositionenRef.current };
    const verläufe = tabVerlaeufeLesen(tabs);
    for (const id of ['eins', 'zwei']) {
      await klick(() => tabs.setAktiverTabId(id));
      await klick(() => {
        if (weg === 'synchron' || weg === 'synchron-immer-aktiver-tab')
          navigation.elementOeffnen({
            gesetz: g,
            modus: weg === 'synchron' ? 'aktiver-tab' : 'immer-aktiver-tab',
          });
        else navigation.gesetzesreferenzOeffnen({ gesetzesreferenz: g }, 'aktiver-tab');
      });
      expect(tabs.aktiverTabId).toBe(id);
      expect(tabs.tabsRef.current.find((t) => t.id === id)?.initialNorm).toBeUndefined();
      expect(tabs.holeTabGesetz(tabs.tabsRef.current.find((t) => t.id === id))).toBe(erste);
      expect(tabs.einklappZustandRef.current).toEqual(ansichten);
      expect(tabs.scrollPositionenRef.current).toEqual(positionen);
      expect(tabVerlaeufeLesen(tabs)).toEqual(verläufe);
    }
  },
);

describe.each(['zurueck', 'vorwaerts', 'overlay'] as const)(
  'Verzögerter Abschluss: %s',
  (befehl) => {
    it.each(['fehlendes-ziel', 'ladefehler', 'neue-navigation'] as const)(
      'ändert bei %s keinen bestätigten Verlauf und gibt die nächste Eingabe frei',
      async (fehler) => {
        const g = gesetz('de-bund', '§ 1', '§ 2', '§ 3');
        await starten([g]);
        const id = aktiveTabId();
        const eintrag = (xmlId: string) => ({ gesetzesreferenz: g, xmlId });
        const vorher = {
          eintraege: ['n2', 'n1', 'n0'].map(eintrag),
          position: 1,
          aktivesElement: eintrag('n1'),
          rueckkehrmarke: { eintrag: eintrag('n0'), position: 1 },
        };
        await klick(() => tabs.verlaufSetzen(id, vorher));
        const langsam = spaeter<GesetzLadeabschluss>();
        laden.mockReturnValueOnce(langsam.promise);
        await klick(() => {
          if (befehl === 'overlay')
            tabs.verlaufNavigieren(id, eintrag('n0'), (ziel, melden) =>
              navigation.gesetzesreferenzOeffnen(
                { ...ziel, ohneVerlauf: true },
                'immer-aktiver-tab',
                id,
                melden,
              ),
            );
          else aktionen.verlaufSchrittUndOeffnen(befehl);
        });
        expect(tabs.verlaufLesen(id)).toBe(vorher);
        if (fehler === 'neue-navigation')
          await klick(() =>
            navigation.elementOeffnen({ gesetz: g, xmlId: 'n2', modus: 'immer-aktiver-tab' }),
          );
        const bestaetigt = tabs.verlaufLesen(id);
        await klick(() =>
          langsam.fertig(
            fehler === 'ladefehler'
              ? { liste: [], befunde: [], ordnerLesbar: false }
              : bestand([
                  {
                    ...g,
                    elemente:
                      fehler === 'fehlendes-ziel'
                        ? g.elemente.filter((el) => el.data.xmlId === 'n1')
                        : g.elemente,
                  },
                ]),
          ),
        );
        expect(tabs.verlaufLesen(id)).toBe(bestaetigt);
        if (fehler === 'neue-navigation')
          expect(tabs.tabsRef.current.find((t) => t.id === id)?.initialNorm).toBe('n2');
        laden.mockResolvedValue(bestand([g]));
        await klick(() => aktionen.verlaufSchrittUndOeffnen('zurueck'));
        if (fehler !== 'neue-navigation')
          await klick(() => tabs.verlaufAktivierung(id, eintrag('n0'), 'vorgegeben'));
        expect(tabs.verlaufLesen(id)?.position).toBe(fehler === 'neue-navigation' ? 0 : 2);
      },
    );
  },
);

it('verwirft eine wartende Befehlsreihe beim Schließen und blockiert keinen neuen Tab', async () => {
  const g = gesetz('de-bund', '§ 1', '§ 2', '§ 3');
  await starten([g]);
  const id = aktiveTabId();
  await klick(() =>
    tabs.verlaufSetzen(id, {
      eintraege: ['n2', 'n1', 'n0'].map((xmlId) => ({ gesetzesreferenz: g, xmlId })),
      position: 0,
    }),
  );
  const langsam = spaeter<GesetzLadeabschluss>();
  laden.mockReturnValueOnce(langsam.promise);
  await klick(() => {
    aktionen.verlaufSchrittUndOeffnen('zurueck');
    aktionen.verlaufSchrittUndOeffnen('zurueck');
    tabs.tabSchliessen(id);
  });
  await klick(() => langsam.fertig(bestand([g])));
  expect(tabs.verlaufLesen(id)).toBeUndefined();
  expect(laden).toHaveBeenCalledTimes(1);
  await klick(() => {
    navigation.elementOeffnen({ gesetz: g, xmlId: 'n0', modus: 'aktiver-tab' });
    navigation.elementOeffnen({ gesetz: g, xmlId: 'n1', modus: 'aktiver-tab' });
  });
  await klick(() => aktionen.verlaufSchrittUndOeffnen('zurueck'));
  await klick(() =>
    tabs.verlaufAktivierung(aktiveTabId(), { gesetzesreferenz: g, xmlId: 'n0' }, 'vorgegeben'),
  );
  expect(tabs.verlaufLesen(aktiveTabId())?.position).toBe(1);
});

it.each(['erstes', 'gespeicherte-norm', 'gespeicherte-ueberschrift', 'ausdruecklich'] as const)(
  'trägt das aufgelöste Startelement auch nach Laden ein: %s',
  async (art) => {
    const g = gesetz('de-bund', '§ 1', '§ 2');
    const kopf = {
      typ: 'ueberschrift' as const,
      data: {
        id: 'kopf',
        xmlId: 'ueberschrift:001',
        gliederungskennzahl: '001',
        ebene: 1,
        bezeichnung: 'Teil',
      },
    };
    g.elemente.push(kopf);
    await starten();
    if (art === 'gespeicherte-norm') {
      const gespeichert = g.elemente[1];
      assert(gespeichert);
      speichereAktivierung(g, gespeichert);
    }
    if (art === 'gespeicherte-ueberschrift') speichereAktivierung(g, kopf);
    laden.mockResolvedValue(bestand([g]));
    await klick(() =>
      navigation.gesetzesreferenzOeffnen(
        { gesetzesreferenz: g, xmlId: art === 'ausdruecklich' ? 'n1' : undefined },
        'immer-aktiver-tab',
      ),
    );
    const erwartet =
      art === 'gespeicherte-ueberschrift' ? 'ueberschrift:001' : art === 'erstes' ? 'n0' : 'n1';
    expect(tabs.tabsRef.current.find((t) => t.id === tabs.aktiverTabId)?.initialNorm).toBe(
      erwartet,
    );
    expect(tabs.verlaufLesen(aktiveTabId())?.eintraege.map((e) => e.xmlId)).toEqual([erwartet]);
  },
);

it('P6-A10: reiht abgewichen zweimal Zurück und zweimal Vorwärts erst nach Öffnen und Echo', async () => {
  const g = gesetz('de-bund', '§ 1', '§ 2', '§ 3', '§ 4');
  await starten([g]);
  const id = aktiveTabId();
  const eintrag = (xmlId: string) => ({ gesetzesreferenz: g, xmlId });
  await klick(() => {
    tabs.verlaufSetzen(id, { eintraege: ['n1', 'n0'].map(eintrag), position: 0 });
    tabs.verlaufAktivierung(id, eintrag('n3'), 'schritt');
  });
  const eins = spaeter<GesetzLadeabschluss>();
  const zwei = spaeter<GesetzLadeabschluss>();
  laden.mockReturnValueOnce(eins.promise).mockReturnValueOnce(zwei.promise);
  await klick(() => {
    aktionen.verlaufSchrittUndOeffnen('zurueck');
    aktionen.verlaufSchrittUndOeffnen('zurueck');
  });
  await klick(() => eins.fertig(bestand([g])));
  expect(laden).toHaveBeenCalledTimes(1);
  expect(tabs.verlaufLesen(id)?.rueckkehrmarke).toBeUndefined();
  await klick(() => tabs.verlaufAktivierung(id, eintrag('n1'), 'vorgegeben'));
  expect(laden).toHaveBeenCalledTimes(2);
  expect(tabs.verlaufLesen(id)?.rueckkehrmarke?.eintrag.xmlId).toBe('n3');
  await klick(() => zwei.fertig(bestand([g])));
  expect(tabs.verlaufLesen(id)?.position).toBe(0);
  await klick(() => tabs.verlaufAktivierung(id, eintrag('n0'), 'vorgegeben'));
  expect(tabs.verlaufLesen(id)?.position).toBe(1);
  laden.mockResolvedValue(bestand([g]));
  await klick(() => {
    aktionen.verlaufSchrittUndOeffnen('vorwaerts');
    aktionen.verlaufSchrittUndOeffnen('vorwaerts');
  });
  expect(tabs.verlaufLesen(id)?.position).toBe(1);
  await klick(() => tabs.verlaufAktivierung(id, eintrag('n1'), 'vorgegeben'));
  expect(tabs.verlaufLesen(id)?.position).toBe(0);
  expect(tabs.verlaufLesen(id)?.rueckkehrmarke?.eintrag.xmlId).toBe('n3');
  await klick(() => tabs.verlaufAktivierung(id, eintrag('n3'), 'vorgegeben'));
  expect(tabs.verlaufLesen(id)?.rueckkehrmarke).toBeUndefined();
  expect(tabs.verlaufLesen(id)?.eintraege.map((e) => e.xmlId)).toEqual(['n1', 'n0']);
});

it.each(['zurueck', 'vorwaerts'] as const)(
  'P6-A9: ein echter Schritt entwertet den verzögerten Öffnungsabschluss bei %s',
  async (richtung) => {
    const g = gesetz('de-bund', '§ 1', '§ 2', '§ 3');
    await starten([g]);
    const id = aktiveTabId();
    const eintrag = (xmlId: string) => ({ gesetzesreferenz: g, xmlId });
    await klick(() => {
      tabs.verlaufSetzen(id, {
        eintraege: ['n2', 'n1', 'n0'].map(eintrag),
        position: 1,
        rueckkehrmarke: { eintrag: eintrag('n0'), position: 1 },
      });
      tabs.verlaufAktivierung(id, eintrag('n1'), 'vorgegeben');
    });
    const altesZiel = tabs.tabsRef.current.find((t) => t.id === id)?.initialNorm;
    const langsam = spaeter<GesetzLadeabschluss>();
    laden.mockReturnValueOnce(langsam.promise);
    await klick(() => aktionen.verlaufSchrittUndOeffnen(richtung));
    await klick(() => tabs.verlaufAktivierung(id, eintrag('n2'), 'schritt'));
    const nachSchritt = tabs.verlaufLesen(id);
    await klick(() => langsam.fertig(bestand([g])));
    expect(tabs.verlaufLesen(id)).toBe(nachSchritt);
    expect(nachSchritt?.position).toBe(1);
    expect(nachSchritt?.aktivesElement?.xmlId).toBe('n2');
    expect(nachSchritt?.rueckkehrmarke).toBeUndefined();
    expect(tabs.tabsRef.current.find((t) => t.id === id)?.initialNorm).toBe(altesZiel);
  },
);

// Echte Öffnungssteuerung mit Tabs und Resolver; nur native Eingänge und Import sind extern ersetzt.
it.each(['kalt', 'warm'] as const)(
  'meldet im %sen Link ein fehlendes Ziel ohne Normgeberalias',
  async (art) => {
    await starten([gesetz('de-bund', '§ 433')]);
    importieren.mockResolvedValue({
      art: 'fehler',
      fehler: { grund: 'nichtVerfuegbar', meldung: 'Nicht verfügbar' },
      bestandspruefung: bestand([]),
      ladeabschluss: bestand([]),
    });
    linksNative.getCurrent.mockResolvedValue(['lexlata://Bund/TestG/433']);
    await act(async () => {
      if (art === 'kalt') {
        const ziel = await links.leseAppStartZiel();
        assert(ziel);
        links.oeffneTiefenLinkZiel(ziel, []);
      } else linksNative.empfangen({ payload: ['lexlata://Bund/TestG/433'] });
    });
    expect(importieren).toHaveBeenCalledWith({ kurztitel: 'TestG', normgeber: 'bund' });
    expect(
      getSnapshot().some(
        (b) =>
          b.text.includes('Das Linkziel konnte nicht geöffnet werden.') &&
          b.text.includes('lexlata://de-bund/bgb/433'),
      ),
    ).toBe(true);
  },
);

it.each(['', ' gesetz="TestG" normgeber="de-bund"'])(
  'öffnet einen gelesenen Eigenverweis mit Attributen %j im aktuellen Gesetz',
  async (attribute) => {
    const gelesen = parseGesetzesXML(
      `<gesetz version="1"><infos><kurztitel>TestG</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="start"><bezeichnung>§ 1</bezeichnung><text>Siehe <verweis${attribute} norm="§ 2">§ 2</verweis>.</text></norm><norm id="ziel"><bezeichnung>§ 2</bezeichnung><text>Ziel.</text></norm></inhalt></gesetz>`,
    );
    assert(gelesen);
    const norm = gelesen.elemente[0];
    assert(norm);
    assert(norm.typ === 'norm');
    const verweis = norm.data.getaggteVerweise?.[0];
    assert(verweis);
    expect(verweis.zielgesetz).toEqual(
      attribute ? { kurztitel: 'TestG', normgeber: 'de-bund' } : undefined,
    );
    await starten([gelesen, { ...gesetz('de-bw', '§ 2'), kurztitel: 'AnderesG' }]);
    await klick(() =>
      navigation.handleVerweisKlick('start', { typ: 'getaggterVerweis', ...verweis }, false),
    );
    const tab = tabs.tabsRef.current.find((t) => t.id === tabs.aktiverTabId);
    assert(tab);
    expect(tabs.holeTabGesetz(tab)).toMatchObject({ kurztitel: 'TestG', normgeber: 'de-bund' });
    expect(tab.initialNorm).toBe('ziel');
    expect(importieren).not.toHaveBeenCalled();
    expect(getSnapshot()).toEqual([]);
  },
);

it.each([
  [['Anlage 1', '§ 1'], 'n1'],
  [['Anlage 1', 'Art. 1'], 'n1'],
  [['Anlage 1', '§ 2'], 'n0'],
  [['§ 1', 'Art. 1', 'Anlage 1'], null],
] as const)(
  'öffnet Lesezeichen 1 bei %j am eindeutigen vorrangigen Ziel',
  async (bezeichnungen, xmlId) => {
    const g = gesetz('de-bund', ...bezeichnungen);
    await starten([g]);
    await klick(() => navigation.handleLesezeichenOeffnen('1', g));
    const tab = tabs.tabsRef.current.find((t) => t.id === tabs.aktiverTabIdRef.current);
    assert(tab);
    if (xmlId) expect(tab.initialNorm).toBe(xmlId);
    else expect(getSnapshot().at(-1)?.text).toBe('Norm nicht gefunden.');
  },
);
