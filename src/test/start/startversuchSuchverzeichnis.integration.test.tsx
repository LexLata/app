// @vitest-environment jsdom
// Zeitpunkt der gespeicherten Gesetzesliste beim Start; nur native Grenzen ersetzt.
import { startaufgabenGrenze } from './startaufgabenNativeGrenze';
import { expect, it, vi } from 'vitest';

const REF = { kurztitel: 'Probe', normgeber: 'de-bund' };

/** Grenze mit abgeglichenem Suchverzeichnis für das Gesetz „Probe“. */
async function grenzeMitGesetz() {
  const n = startaufgabenGrenze();
  n.dateien.set(
    'gesetze/Probe_de-bund.xml',
    '<gesetz><infos><kurztitel>Probe</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><titel>Titel</titel><text><absatz>Text</absatz></text></norm></inhalt></gesetz>',
  );
  const a = await n.kontext('main');
  await a.persistenz.gleicheSuchverzeichnisAb();
  const { speichereFensterZustand } = await import('@/lib/persistenz/fenster/fenster.index');
  return { n, a, speichereFensterZustand };
}

/** Fenster mit der Startverdrahtung aus App.tsx; `auslöser` wählt den Lesezeitpunkt der Liste. */
async function erzeugeFenster(
  ausloeser: (
    start: { startaufgabenBereit: boolean },
    restore: { fensterSichtbar: boolean },
  ) => boolean,
  beobachte: (start: { startAbgeschlossen: boolean; startaufgabenBereit: boolean }) => void,
) {
  const { createElement, useEffect, useRef } = await import('react');
  const { useAppTabs } = await import('@/hooks/tabs/useAppTabs');
  const { useFensterRestore } = await import('@/hooks/fenster/useFensterRestore');
  const { useFensterstartInitialisierung } = await import('@/hooks/useFensterstartInitialisierung');
  const { useSuchverzeichnis } = await import('@/hooks/useSuchverzeichnis');
  const { useImportindizesBereithalten } = await import('@/hooks/useImportindizesBereithalten');
  const { useFensterVorladen } = await import('@/hooks/useFensterVorladen');
  return function Fenster() {
    const tabs = useAppTabs();
    const restore = useFensterRestore(
      tabs.tabs,
      tabs.aktiverTabId,
      tabs.tabsRef,
      tabs.aktiverTabIdRef,
      tabs.verlaufLesen,
      tabs.verlaufSetzen,
      tabs.uebernehmeTabGesetz,
    );
    const vorbereitung = useRef<Promise<void> | null>(null);
    const start = useFensterstartInitialisierung({
      ...tabs,
      // Dieser Start fordert keine Tabwiederöffnung an.
      tabWiederherstellen: () => {},
      fensterRestore: restore,
      importindexVorbereitungRef: vorbereitung,
      leseAppStartZiel: async () => null,
      oeffneTiefenLinkZiel: () => {},
    });
    const { eintraege } = useSuchverzeichnis(ausloeser(start, restore));
    const indizes = useImportindizesBereithalten(start.startAbgeschlossen, vorbereitung);
    useFensterVorladen(start.startAbgeschlossen, indizes, tabs.vorladen);
    useEffect(() => beobachte(start));
    return createElement('output', null, eintraege.map((e) => e.kurztitel).join(','));
  };
}

it('zeigt nach dem Restorefehler die vorhandene Gesetzesliste ohne einen erfolgreichen Start oder Vorladen vorzutäuschen', async () => {
  const { n, a, speichereFensterZustand } = await grenzeMitGesetz();
  speichereFensterZustand('main', { tabs: [], aktiverIndex: -1 });
  speichereFensterZustand('anderes', { tabs: [{ gesetzesreferenz: REF }], aktiverIndex: 0 });
  n.protokoll.length = 0;
  const { act, createElement } = await import('react');
  const { createRoot } = await import('react-dom/client');
  let anzeigenBegonnen = false;
  let weiter = () => {};
  const warten = new Promise<void>((r) => {
    weiter = r;
  });
  n.anzeigen(async () => {
    anzeigenBegonnen = true;
    await warten;
  });
  const schreiben = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Speicher voll');
  });
  const fehler = vi.spyOn(console, 'error').mockImplementation(() => {});
  const callbacks: IdleRequestCallback[] = [];
  vi.stubGlobal('requestIdleCallback', (callback: IdleRequestCallback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let startAbgeschlossen = true;
  const Fenster = await erzeugeFenster(
    (start) => start.startaufgabenBereit,
    (start) => {
      startAbgeschlossen = start.startAbgeschlossen;
    },
  );
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(Fenster)));
    await vi.waitFor(() => expect(anzeigenBegonnen).toBe(true));
    expect(
      n.protokoll.filter((p) => p.name === 'lesen' && p.pfad === 'cache/suchverzeichnis.json'),
    ).toEqual([]);
    expect(container.textContent).toBe('');
    expect(startAbgeschlossen).toBe(false);
    schreiben.mockRestore();
    await act(async () => weiter());
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(container.textContent).toBe('Probe');
    });
    expect(startAbgeschlossen).toBe(false);
    expect(callbacks).toHaveLength(0);
    expect(a.banner.getSnapshot().some((b) => b.text.includes('nicht wiederhergestellt'))).toBe(
      true,
    );
  } finally {
    weiter();
    schreiben.mockRestore();
    await act(async () => root.unmount());
    fehler.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('zeigt die gespeicherte Gesetzesliste, während das Laden eines Starttabs noch hängt', async () => {
  const { n, speichereFensterZustand } = await grenzeMitGesetz();
  speichereFensterZustand('main', { tabs: [{ gesetzesreferenz: REF }], aktiverIndex: 0 });
  let gesetzGelesen = false;
  let weiter = () => {};
  const warten = new Promise<void>((r) => {
    weiter = r;
  });
  n.vorLesen(async (_label, pfad) => {
    if (pfad !== 'gesetze/Probe_de-bund.xml') return;
    gesetzGelesen = true;
    await warten;
  });
  const { act, createElement } = await import('react');
  const { createRoot } = await import('react-dom/client');
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let startaufgabenBereit = true;
  // Wie App.tsx: Auslöser ist das sichtbare Fenster oder der abgeschlossene Startversuch.
  const Fenster = await erzeugeFenster(
    (start, restore) => start.startaufgabenBereit || restore.fensterSichtbar,
    (start) => {
      startaufgabenBereit = start.startaufgabenBereit;
    },
  );
  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    await act(async () => root.render(createElement(Fenster)));
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(gesetzGelesen).toBe(true);
      expect(container.textContent).toBe('Probe');
    });
    // Das Starttab hängt noch; die Liste kam nicht über den Startabschluss.
    expect(startaufgabenBereit).toBe(false);
  } finally {
    weiter();
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
