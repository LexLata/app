import { nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { geladenesTabGesetz } from '@/test/tabs/tabFabriken';
// @vitest-environment jsdom
// Echte Öffnungs-, Verlaufs- und Ansichtshooks: Nachtragen vor dem Neueinhäng-Echo.
import { gesetzOeffnenFixture } from '@/test/hauptfenster/gesetzOeffnenFixture';
import { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, assert, beforeEach, expect, it, vi } from 'vitest';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import { useAnsichtssteuerung } from '@/components/gesetzestextansicht/ansichtssteuerung/ansichtssteuerung.index';
import { erstelleTestTextMessung } from '@/test/gesetz/testDarstellung';
import { verlaufPfeilzustaende } from '@/lib/domain/app/tabVerlauf';
import { gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type { GesetzLadeabschluss } from '@/lib/persistenz/gesetz/gesetz.index';
import type { Tab } from '@/lib/domain/appTypes';
import { einzelzugriffFuerTest } from '@/test/tabs/einzelzugriffFuerTest';

const importieren = vi.hoisted(() => vi.fn());
vi.mock('@/lib/import/import.index', () => ({ importiereGesetzesreferenz: importieren }));
// Keine Scrollgeometrie erforderlich: geprüft werden echte Aktivierungsechos.
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: () => ({ getVirtualItems: () => [], getTotalSize: () => 0 }),
}));
const gesetz = (kurztitel: string): GesetzDarstellung =>
  gesetzMitNormen(['§ 1', '§ 2', '§ 3', '§ 4', '§ 5', '§ 6', '§ 7'], {
    normgeber: 'de-bund',
    kurztitel,
    langtitel: '',
    hatGliederungsartikel: false,
    kennung: ['A', 'B', 'C', 'D', 'E', 'F', 'Z'],
  });
const g = gesetz('BGB');
const h = gesetz('HGB');
const eintrag = (xmlId: string, gesetzesreferenz = g) => ({
  gesetzesreferenz: {
    kurztitel: gesetzesreferenz.kurztitel,
    normgeber: gesetzesreferenz.normgeber,
  },
  xmlId,
});
const bestand = (liste = [g, h]): GesetzLadeabschluss => ({
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
let navigation: ReturnType<typeof useGesetzOeffnen>;
let laden: ReturnType<typeof vi.fn<() => Promise<GesetzLadeabschluss>>>;
let echos: string[];
function Ansicht({ tab }: { tab: Tab }) {
  assert(tabs.holeTabGesetz(tab));
  useAnsichtssteuerung({
    gesetz: geladenesTabGesetz(tabs, tab),
    initialAktivesElementId: tab.initialNorm,
    messung: erstelleTestTextMessung(),
    inhaltEinzug: 12,
    satzNeuZeile: true,
    textAlign: 'left',
    hyphens: 'auto',
    lang: 'de',
    strukturKontextLeisteGroesse: 1,
    onAktivierung: ({ xmlId, art }) => {
      echos.push(`${tabs.holeTabGesetz(tab)?.kurztitel}:${xmlId}:${art}`);
      tabs.verlaufAktivierung(tab.id, eintrag(xmlId, geladenesTabGesetz(tabs, tab)), art);
    },
  });
  return null;
}
async function starten(liste = [g, h]) {
  laden = vi.fn(async () => bestand(liste));
  function Probe() {
    const aktuelleTabs = useAppTabs();
    const aktuelleNavigation = useGesetzOeffnen({
      ...gesetzOeffnenFixture(aktuelleTabs, liste),

      ladeGesetz: einzelzugriffFuerTest(laden),
    });
    useLayoutEffect(() => {
      tabs = aktuelleTabs;
      navigation = aktuelleNavigation;
    });
    const tab = aktuelleTabs.tabs.find((t) => t.id === aktuelleTabs.aktiverTabId);
    return tab && aktuelleTabs.holeTabGesetz(tab) ? (
      <Ansicht
        key={`${tab.id}-${geladenesTabGesetz(aktuelleTabs, tab).kurztitel}-${tab.reloadVersion}`}
        tab={tab}
      />
    ) : null;
  }
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Probe />));
  await act(async () => navigation.elementOeffnen({ gesetz: g, xmlId: 'A' }));
}
function id() {
  assert(tabs.aktiverTabId);
  return tabs.aktiverTabId;
}
function liste(tabId = id()) {
  return tabs
    .verlaufLesen(tabId)
    ?.eintraege.map((e) => `${e.gesetzesreferenz.kurztitel}:${e.xmlId}`);
}
async function schritte(...xmlIds: string[]) {
  for (const xmlId of xmlIds)
    await act(async () =>
      tabs.verlaufAktivierung(
        id(),
        eintrag(xmlId, tabs.holeTabGesetz(tabs.tabsRef.current.find((t) => t.id === id()))),
        'schritt',
      ),
    );
}
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  echos = [];
  importieren.mockReset();
});
afterEach(async () => {
  await act(async () => root?.unmount());
  vi.unstubAllGlobals();
});
it('P7-A1/A2/A3/A6: trägt nur D vor dem Gesetzeswechsel-Echo nach und navigiert zurück/vorwärts', async () => {
  await starten();
  await schritte('B', 'C', 'D');
  const tabId = id();
  const vorher = tabs.verlaufLesen(tabId);
  assert(vorher);
  await act(async () =>
    tabs.verlaufSetzen(tabId, {
      ...vorher,
      rueckkehrmarke: { position: 0, eintrag: eintrag('F') },
    }),
  );
  await act(async () =>
    navigation.elementOeffnen({ gesetz: h, xmlId: 'Z', modus: 'immer-aktiver-tab' }),
  );
  expect(liste()).toEqual(['HGB:Z', 'BGB:D', 'BGB:A']);
  expect(echos).toContain('HGB:Z:vorgegeben');
  expect(tabs.verlaufLesen(tabId)?.aktivesElement).toEqual(eintrag('Z', h));
  expect(tabs.verlaufLesen(tabId)?.rueckkehrmarke).toBeUndefined();
  expect(verlaufPfeilzustaende(tabs.verlaufLesen(tabId))).toEqual({
    kannZurueck: true,
    kannVorwaerts: false,
  });
  const oeffnen = (ziel: ReturnType<typeof eintrag>, melden: (erfolg: boolean) => void) =>
    navigation.gesetzesreferenzOeffnen(
      { ...ziel, ohneVerlauf: true },
      'immer-aktiver-tab',
      tabId,
      melden,
    );
  await act(async () => tabs.verlaufNavigieren(tabId, 'zurueck', oeffnen));
  expect(tabs.verlaufLesen(tabId)?.aktivesElement).toEqual(eintrag('D'));
  expect(verlaufPfeilzustaende(tabs.verlaufLesen(tabId))).toEqual({
    kannZurueck: true,
    kannVorwaerts: true,
  });
  await act(async () => tabs.verlaufNavigieren(tabId, 'vorwaerts', oeffnen));
  expect(tabs.verlaufLesen(tabId)?.aktivesElement).toEqual(eintrag('Z', h));
  expect(liste()).toEqual(['HGB:Z', 'BGB:D', 'BGB:A']);
});
it('P7-A6/A9: verwendet nach verzögertem Import die erst während des Ladens aktive Stelle', async () => {
  await starten([g]);
  await schritte('B');
  const importLauf = spaeter<Awaited<ReturnType<typeof importieren>>>();
  importieren.mockReturnValue(importLauf.promise);
  await act(async () =>
    navigation.gesetzesreferenzOeffnen({ gesetzesreferenz: h, xmlId: 'Z' }, 'immer-aktiver-tab'),
  );
  expect(importieren).toHaveBeenCalledOnce();
  await schritte('C', 'D');
  laden.mockResolvedValue(bestand());
  await act(async () =>
    importLauf.fertig({
      art: 'erfolg',
      gesetz: h,
      bestandspruefung: bestand([g]),
      ladeabschluss: bestand(),
    }),
  );
  expect(liste()).toEqual(['HGB:Z', 'BGB:D', 'BGB:A']);
  expect(echos).toContain('HGB:Z:vorgegeben');
});
it.each(['bevorzugt-vorhanden', 'immer-neu'] as const)(
  'P7-A5: bestimmt die verlassene Stelle im Zieltab (%s)',
  async (modus) => {
    await starten();
    const quelle = id();
    await schritte('D');
    await act(async () => navigation.elementOeffnen({ gesetz: h, xmlId: 'A', modus: 'immer-neu' }));
    const ziel = id();
    await schritte('F');
    await act(async () => tabs.setAktiverTabId(quelle));
    await schritte('D');
    const quellVerlauf = tabs.verlaufLesen(quelle);
    await act(async () => navigation.elementOeffnen({ gesetz: h, xmlId: 'Z', modus }));
    expect(tabs.verlaufLesen(quelle)).toBe(quellVerlauf);
    expect(liste()).toEqual(modus === 'immer-neu' ? ['HGB:Z'] : ['HGB:Z', 'HGB:F', 'HGB:A']);
    expect(id() === ziel).toBe(modus === 'bevorzugt-vorhanden');
  },
);
it.each([false, true])(
  'P7-A4: ersetzt beim Verweisklick die aktive Stelle durch die Ausgangsnorm (anderer Tab: %s)',
  async (andererTab) => {
    await starten();
    const quelle = id();
    await schritte('D');
    if (andererTab) {
      await act(async () =>
        navigation.elementOeffnen({ gesetz: h, xmlId: 'A', modus: 'immer-neu' }),
      );
      await schritte('F');
      await act(async () => tabs.setAktiverTabId(quelle));
      await schritte('D');
    }
    await act(async () =>
      navigation.handleVerweisKlick(
        'E',
        { typ: 'getaggterVerweis', zielgesetz: andererTab ? h : g, zielBezeichnung: '§ 7' },
        false,
      ),
    );
    expect(liste(quelle)).toEqual(andererTab ? ['BGB:E', 'BGB:A'] : ['BGB:Z', 'BGB:E', 'BGB:A']);
    if (andererTab) expect(liste()).toEqual(['HGB:Z', 'HGB:A']);
  },
);
it('P7-A7: trägt einen Sprung auf die bereits aktive Stelle nicht ein und bewahrt die Liste', async () => {
  await starten();
  await schritte('D');
  const vorher = tabs.verlaufLesen(id())?.eintraege;
  await act(async () => navigation.elementOeffnen({ gesetz: g, xmlId: 'D' }));
  expect(tabs.verlaufLesen(id())?.eintraege).toBe(vorher);
  expect(liste()).toEqual(['BGB:A']);
});
it.each([
  ['neuer Tab', false, false],
  ['vorhandener Tab', true, false],
  ['Ganzgesetz in neuem Tab', false, true],
] as const)(
  'trägt die per Schritt aktive Ausgangsnorm bei Verweis nach: %s',
  async (_name, vorhanden, ganzesGesetz) => {
    await starten();
    const quelle = id();
    if (vorhanden) {
      await act(async () =>
        navigation.elementOeffnen({ gesetz: h, xmlId: 'A', modus: 'immer-neu' }),
      );
      await schritte('F');
      await act(async () => tabs.setAktiverTabId(quelle));
    }
    await schritte('E');
    await act(async () =>
      navigation.handleVerweisKlick(
        'E',
        ganzesGesetz
          ? { typ: 'ganzesGesetz', gesetz: h, verweistextZeichenbereich: [0, 1] }
          : { typ: 'getaggterVerweis', zielgesetz: h, zielBezeichnung: '§ 7' },
        !vorhanden,
      ),
    );
    expect(liste(quelle)).toEqual(['BGB:E', 'BGB:A']);
    expect(liste()).toEqual(ganzesGesetz ? ['HGB:A'] : vorhanden ? ['HGB:Z', 'HGB:A'] : ['HGB:Z']);
  },
);
it.each([false, true])(
  'trägt bei unverändertem Ziel im anderen Tab auch keine Ausgangsnorm ein (Ganzgesetz: %s)',
  async (ganzesGesetz) => {
    await starten();
    const quelle = id();
    await act(async () => navigation.elementOeffnen({ gesetz: h, xmlId: 'A', modus: 'immer-neu' }));
    const ziel = id();
    await schritte('Z');
    await act(async () => tabs.setAktiverTabId(quelle));
    await schritte('D');
    const quellListe = tabs.verlaufLesen(quelle)?.eintraege;
    const zielListe = tabs.verlaufLesen(ziel)?.eintraege;
    await act(async () =>
      navigation.handleVerweisKlick(
        'E',
        ganzesGesetz
          ? { typ: 'ganzesGesetz', gesetz: h, verweistextZeichenbereich: [0, 1] }
          : { typ: 'getaggterVerweis', zielgesetz: h, zielBezeichnung: '§ 7' },
        false,
      ),
    );
    expect(tabs.verlaufLesen(quelle)?.eintraege).toBe(quellListe);
    expect(tabs.verlaufLesen(ziel)?.eintraege).toBe(zielListe);
  },
);
