import { startaufgabenBefehlsgrenze } from '@/test/start/startaufgabenBefehlsgrenze';
import { geladenesTabGesetz } from '@/test/tabs/tabFabriken';
import { richteNativeEreignisgrenzeEin } from '@/test/start/nativeEreignisgrenze';
import { gleicheSuchverzeichnisAb } from '@/lib/persistenz/gesetz/gesetz.index';
// Echte Klicks, Dateibefunde, Start/Restore, Tabs und Verlauf; nur native
// Grenzen und unabhängige Startaufgaben sind kontrollierte Testadapter.

import { tabVerlaeufeLesen } from '@/test/hauptfenster/tabVerlaeufeLesen';
import { normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { act, StrictMode, useEffect, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, assert, beforeEach, expect, it, vi } from 'vitest';
import type { OeffnenLinkZiel } from '@/lib/domain/app/tiefenLink';
import { useTiefenLinks } from '@/hooks/useTiefenLinks';
import { useOeffnenLinkNavigation } from '@/hooks/fenster/useOeffnenLinkNavigation';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import vertraege from '@/test/plattform/native-vertraege.json';
import { registrierePruefpflichtigeAenderung } from '@/lib/persistenz/kern/kern.index';
import { alleBannerSchliessen, getSnapshot } from '@/lib/banner/banner.index';
import {
  geschlossenenTabPushen,
  ladeFensterZustand,
  speichereFensterZustand,
} from '@/lib/persistenz/fenster/fenster.index';
import type { InternerNavigationsauftrag } from '@/lib/domain/app/interneNavigation';
import type { AnzeigeKonfliktEintrag } from '@/lib/markierungen/markierungen.index';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { useGesetzVerwaltung } from '@/hooks/tabs/useGesetzVerwaltung';
import { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import { useFensterstartInitialisierung } from '@/hooks/useFensterstartInitialisierung';
import { useFensterRestore } from '@/hooks/fenster/useFensterRestore';
import { oeffneInternesZiel, useInterneNavigation } from '@/hooks/fenster/useInterneNavigation';
import { GesetzZeile } from '@/components/hilfsfenster/markierungskonflikte/KonfliktListe';
import {
  normAusgangsstelle,
  ueberschriftAusgangsstelle,
} from '@/test/markierungen/ausgangsstelleFabrik';

const native = vi.hoisted(() => ({
  invoke: vi.fn(),
  indexLaden: vi.fn(),
  importieren: vi.fn(),
  startIndizes: vi.fn(async () => {}),
  referenzImportieren: vi.fn(),
  label: 'fenster-navigation-test',
  getCurrent: vi.fn(),
  suchfehler: vi.fn(),
  oeffnen: vi.fn(),
  listen: vi.fn(),
  abmelden: vi.fn(),
  show: vi.fn(async () => {}),
  fokus: vi.fn(),
  callbacks: new Set<() => void>(),
  linkCallbacks: new Set<(event: { payload: string[] }) => void>(),
  anmeldungen: [] as (() => void)[],
  listenerVerzoegert: false,
  ordnerFehler: false,
  titelFehler: false,
  titelGate: null as Promise<void> | null,
  ressourcen: new Map<string, string>(),
  ressourcenLesen: vi.fn(),
  schreibenFehler: new Set<string>(),
  reloadFehler: null as 'Ordner' | 'Gesetz' | null,
  dateien: new Map<string, string>(),
  unlesbar: new Set<string>(),
  ordnerGate: null as Promise<void> | null,
  lesenGate: null as Promise<void> | null,
  lesenBegonnen: vi.fn(),
  ordnerLesen: vi.fn(),
  anmeldung: null as string | null,
  kennung: 0,
  neu: true,
  transfer: false,
  letzterTab: false,
  auftrag: null as {
    kennung: number;
    auftrag: InternerNavigationsauftrag | OeffnenLinkZiel;
    neuesFenster: boolean;
  } | null,
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke, isTauri: () => true }));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ listen: native.listen }),
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => {}, emitTo: async () => {} }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    label: native.label,
    show: native.show,
    hide: async () => {},
    onCloseRequested: async () => () => {},
    onResized: async () => () => {},
    onMoved: async () => () => {},
    center: async () => {},
    setSize: async () => {},
    setPosition: async () => {},
    isFullscreen: async () => true,
  }),
}));
vi.mock('@tauri-apps/plugin-deep-link', () => ({ getCurrent: native.getCurrent }));
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'macos' }));
vi.mock('@/lib/plattform/menu/menu.index', () => ({ setzeAktiv: vi.fn() }));
vi.mock('@/lib/import/import.index', async (original) => ({
  ...(await original<typeof import('@/lib/import/import.index')>()),
  synchronisiereStartupImportindizes: native.startIndizes,
  istImportindexSuchbestandAktuell: () => true,
  sucheKandidatenAlleQuellen: native.indexLaden,
  importiereGesetze: native.importieren,
  importiereGesetzesreferenz: native.referenzImportieren,
}));
vi.mock('@/lib/markierungen/markierungen.index', () => ({
  pruefeMarkierungenBeimStart: async () => {},
  pruefeErforderlicheVollpruefung: async () => {},
}));
vi.mock('@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/nutzerdaten/gesetzeskurzbefehlSpeicher')>()),
  ladeAlleGesetzeskurzbefehle: async () => ({}),
}));
vi.mock('@tauri-apps/api/path', () => ({ resolveResource: async (pfad: string) => pfad }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readDir: async (ordner: string) => {
    native.ressourcenLesen(ordner);
    await native.titelGate;
    return [...native.ressourcen.keys()]
      .filter((pfad) => pfad.startsWith(`${ordner}/`))
      .map((pfad) => ({ name: pfad.slice(ordner.length + 1), isDirectory: false }));
  },
  readTextFile: async (pfad: string) => {
    const inhalt = native.ressourcen.get(pfad);
    if (inhalt === undefined) throw new Error('Resource fehlt');
    return inhalt;
  },
}));
vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  sicherstelleOrdner: async () => {},
  appDatenOrdnerLesen: native.ordnerLesen,
  appDatenExistiert: async (pfad: string) =>
    (pfad.startsWith('nichtamtliche-titel') && native.titelFehler) || native.dateien.has(pfad),
  appDatenLesen: async (pfad: string) => {
    if (
      native.unlesbar.has(pfad) ||
      (pfad.startsWith('nichtamtliche-titel/') && native.titelFehler)
    )
      throw new Error('Dateizugriff fehlgeschlagen');
    const inhalt = native.dateien.get(pfad);
    if (inhalt === undefined) throw new Error('Datei fehlt');
    return inhalt;
  },
}));
vi.mock('@/hooks/einstellungen/useUiGroesse', () => ({ useUiSkalierungsFaktor: () => 1 }));
vi.mock('@/hooks/stil/useTextRollen', () => ({
  useTextRollen: () => ({ standardtext: {}, standardtextBetont: {}, fehlertext: {} }),
  useIconGroessen: () => ({ status: 12 }),
}));
vi.mock('@/hooks/stil/useAbstandRollen', () => ({ useAbstandRollen: () => ({ standard: 8 }) }));
vi.mock('@/hooks/stil/useRadiusRollen', () => ({ useRadiusRollen: () => ({ standard: 4 }) }));

const ref = { kurztitel: 'X', normgeber: 'de-bund' };
const norm = (bezeichnung: string): InternerNavigationsauftrag => ({
  gesetz: ref,
  ziel: { type: 'norm', bezeichnung: '§ ' + bezeichnung },
});
const ueberschrift: InternerNavigationsauftrag = {
  gesetz: ref,
  ziel: { type: 'ueberschrift', gliederungskennzahl: '010' },
};
const xml = (
  kurztitel = 'X',
) => `<gesetz id="alt"><infos><kurztitel>${kurztitel}</kurztitel><langtitel>Test</langtitel><normgeber>de-bund</normgeber></infos><inhalt>
<gliederung gliederungskennzahl="010"><bezeichnung>Erster Teil</bezeichnung></gliederung>
<norm id="p1010"><bezeichnung>§ 1010</bezeichnung><text><absatz>Text</absatz></text></norm>
<norm id="p1"><bezeichnung>§ 1</bezeichnung><text><absatz>Text</absatz></text></norm>
</inhalt></gesetz>`;
function importindexMitBGB() {
  return {
    'de-bund': [{ kurztitel: 'BGB', langtitel: 'Test', abrufkennung: 'bgb.xml' }],
    'de-bw': [],
    eu: [],
  };
}

function sperre() {
  let fertig!: () => void;
  const promise = new Promise<void>((resolve) => {
    fertig = resolve;
  });
  return { promise, fertig };
}
registrierePruefpflichtigeAenderung({
  vormerken: async () => 'vorgang',
  abschliessen: async () => {},
});
let root: Root;
let container: HTMLElement;
let zustand: ReturnType<typeof useAppTabs> & ReturnType<typeof useGesetzVerwaltung>;
let gestartet = false;
function Hauptfenster() {
  const importindexVorbereitungRef = useRef<Promise<void> | null>(null);
  const oeffnenLinkAusfuehren = useOeffnenLinkNavigation({
    importindexVorbereitungRef,
    zeigeSuchfehler: native.suchfehler,
  });
  const tabs = useAppTabs();
  const verwaltung = useGesetzVerwaltung(tabs);
  const oeffnen = useGesetzOeffnen({ ...tabs, ...verwaltung, verlaufFristStoppen: () => {} });
  const links = useTiefenLinks({
    elementOeffnen: oeffnen.elementOeffnen,
    gesetzesreferenzOeffnen: oeffnen.gesetzesreferenzOeffnen,
    oeffnenLinkEmpfangen: (auftrag, beimAppStart) =>
      native.invoke('oeffnen_link_navigation_senden', { auftrag, beimAppStart }),
  });
  const restore = useFensterRestore(
    tabs.tabs,
    tabs.aktiverTabId,
    tabs.tabsRef,
    tabs.aktiverTabIdRef,
    tabs.verlaufLesen,
    tabs.verlaufSetzen,
  );
  const { startAbgeschlossen } = useFensterstartInitialisierung({
    importindexVorbereitungRef,
    ladeGesetz: tabs.ladeGesetz,
    tabAusUebertragungUebernehmen: tabs.tabAusUebertragungUebernehmen,
    tabWiederherstellen: oeffnen.tabWiederherstellen,
    setTabs: tabs.setTabs,
    setAktiverTabId: tabs.setAktiverTabId,
    fensterRestore: restore,
    ...links,
  });
  useInterneNavigation({
    gesetzesreferenzOeffnen: (ziel, modus, ausgang, melden) => {
      native.oeffnen(ziel);
      return oeffnen.gesetzesreferenzOeffnen(ziel, modus, ausgang, melden);
    },
    oeffnenLinkAusfuehren,
    startAbgeschlossen,
    tabsRef: tabs.tabsRef,
    aktiverTabIdRef: tabs.aktiverTabIdRef,
    elementOeffnen: (ziel) => {
      native.oeffnen(ziel);
      oeffnen.elementOeffnen(ziel);
    },
  });
  useEffect(() => {
    zustand = { ...tabs, ...verwaltung };
    gestartet = startAbgeschlossen;
  });
  return null;
}
async function rendern(strict = false) {
  await act(async () =>
    root.render(
      strict ? (
        <StrictMode>
          <Hauptfenster />
        </StrictMode>
      ) : (
        <Hauptfenster />
      ),
    ),
  );
}
async function abwarten(pruefen: () => void) {
  await vi.waitFor(async () => {
    await act(async () => {
      await Promise.resolve();
    });
    pruefen();
  });
}
async function senden(auftrag: InternerNavigationsauftrag | OeffnenLinkZiel) {
  await act(async () =>
    'type' in auftrag
      ? native.invoke('oeffnen_link_navigation_senden', { auftrag, beimAppStart: false })
      : oeffneInternesZiel(auftrag),
  );
}
function wecken() {
  for (const callback of native.callbacks) callback();
}
function verlaufZiel(kurztitel: string, xmlId: string, normgeber: string) {
  return { gesetzesreferenz: { kurztitel, normgeber }, xmlId };
}
function verlauf() {
  return Object.values(tabVerlaeufeLesen(zustand)).flatMap((v) => v.eintraege);
}
function schreibeNativeDatei(args: Record<string, unknown>) {
  const pfad = args.relativerPfad as string;
  if (native.schreibenFehler.has(pfad)) throw new Error('Titelkopie fehlgeschlagen');
  native.dateien.set(pfad, args.inhalt as string);
  if (native.reloadFehler === 'Ordner') native.ordnerFehler = true;
  if (native.reloadFehler === 'Gesetz') native.unlesbar.add('gesetze/X_de-bund.xml');
}
function nativeBestaetigung(args: Record<string, unknown>) {
  if (native.anmeldung === args.anmeldung && native.auftrag?.kennung === args.kennung) {
    native.auftrag = null;
    native.neu = false;
  }
}
async function nativeAnzeigen() {
  if (native.kennung === 0) return false;
  await native.show();
  native.fokus(
    native.auftrag && 'type' in native.auftrag.auftrag ? 'hauptfenster' : 'markierungskonflikte',
  );
  return true;
}
function nativeGesetzDateistempel() {
  return [...native.dateien]
    .filter(([pfad]) => pfad.startsWith('gesetze/') && pfad.endsWith('.xml'))
    .map(([pfad, text]) => ({
      name: pfad.slice(8),
      dateistempel: { groesse: String(text.length), aenderungszeit: '1' },
    }));
}

beforeEach(() => {
  vi.clearAllMocks();
  alleBannerSchliessen();
  native.label = 'fenster-navigation-test';
  native.getCurrent.mockResolvedValue(null);
  native.indexLaden.mockResolvedValue({ 'de-bund': [], 'de-bw': [], eu: [] });
  native.startIndizes.mockResolvedValue(undefined);
  native.referenzImportieren.mockReset().mockReturnValue(new Promise(() => {}));
  native.importieren.mockResolvedValue({
    erfolgreiche: [],
    fehlgeschlagene: [{ fehler: { meldung: 'Importfehler' } }],
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  native.anmeldung = null;
  native.auftrag = null;
  native.kennung = 0;
  native.neu = true;
  native.transfer = false;
  native.letzterTab = false;
  native.callbacks.clear();
  native.linkCallbacks.clear();
  native.anmeldungen = [];
  native.listenerVerzoegert = false;
  native.ordnerFehler = false;
  native.titelFehler = false;
  native.titelGate = null;
  native.ordnerGate = null;
  native.lesenGate = null;
  native.ressourcen.clear();
  native.schreibenFehler.clear();
  native.reloadFehler = null;
  native.unlesbar.clear();
  native.dateien.clear();
  native.dateien.set('gesetze/X_de-bund.xml', xml());
  native.ordnerLesen.mockImplementation(async (ordner: string) => {
    if (ordner === 'nichtamtliche-titel') {
      if (native.titelFehler) throw new Error('Optionaler Titelordner unlesbar');
      return [...native.dateien.keys()]
        .filter((p) => p.startsWith(`${ordner}/`))
        .map((p) => ({ name: p.slice(ordner.length + 1) }));
    }
    await native.ordnerGate;
    if (native.ordnerFehler) throw new Error('Ordner unlesbar');
    return [...native.dateien.keys()]
      .filter((p) => p.startsWith('gesetze/'))
      .map((p) => ({ name: p.slice(8) }));
  });
  native.listen.mockImplementation(async (name: string, cb: () => void) => {
    if (name === 'tiefenlink-oeffnen') {
      const callback = cb as (event: { payload: string[] }) => void;
      native.linkCallbacks.add(callback);
      return () => native.linkCallbacks.delete(callback);
    }
    if (name !== 'interne-navigation-vorhanden') return () => {};
    if (native.listenerVerzoegert)
      await new Promise<void>((resolve) => native.anmeldungen.push(resolve));
    native.callbacks.add(cb);
    return () => {
      native.abmelden();
      native.callbacks.delete(cb);
    };
  });
  const startaufgaben = startaufgabenBefehlsgrenze(true);
  native.invoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
    if (command.startsWith('startaufgaben_')) return startaufgaben(command);
    if (command === 'gesetz_dateistempel_lesen') {
      await native.ordnerLesen('gesetze');
      return nativeGesetzDateistempel();
    }
    switch (command) {
      case 'datei_sperre_erwerben':
        return 'token';
      case 'atomar_datei_schreiben':
        schreibeNativeDatei(args!);
        return;
      case 'tab_uebertragung_abholen':
        return native.transfer
          ? JSON.stringify({
              gesetzesreferenz: { kurztitel: 'X', normgeber: 'de-bund' },
              initialNorm: 'p1',
            })
          : null;
      case 'letzter_tab_anfrage_lesen':
        return native.letzterTab;
      case 'oeffnen_link_navigation_senden':
      case 'interne_navigation_senden':
        native.auftrag = {
          kennung: ++native.kennung,
          auftrag: args!.auftrag as InternerNavigationsauftrag | OeffnenLinkZiel,
          neuesFenster: native.neu,
        };
        if (native.anmeldung) wecken();
        break;
      case 'interne_navigation_bereit':
        native.anmeldung = args!.bereit === false ? null : (args!.anmeldung as string);
        return native.auftrag;
      case 'interne_navigation_lesen': {
        const snapshot = native.anmeldung === args!.anmeldung ? native.auftrag : null;
        native.lesenBegonnen();
        await native.lesenGate;
        return snapshot;
      }
      case 'interne_navigation_bestaetigen':
        nativeBestaetigung(args!);
        break;
      case 'interne_navigation_abmelden':
        if (native.anmeldung === args!.anmeldung) native.anmeldung = null;
        break;
      case 'interne_navigation_anzeigen':
        return nativeAnzeigen();
    }
    return null;
  });

  const { window } = parseHTML('<html><body></body></html>');
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  richteNativeEreignisgrenzeEin(native.invoke, native.listen);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const daten = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => daten.get(k) ?? null,
    setItem: (k: string, v: string) => daten.set(k, v),
    removeItem: (k: string) => daten.delete(k),
  });
  container = document.createElement('div');
  root = createRoot(container);
  gestartet = false;
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each([true, false])(
  'öffnet nach verzögertem Laden/Listener nur das letzte Ziel im Initial-Tab (StrictMode: %s)',
  async (strict) => {
    const laden = sperre();
    native.ordnerGate = laden.promise;
    native.listenerVerzoegert = true;
    await senden(norm('1'));
    await rendern(strict);
    await senden(norm('1010'));
    await senden(ueberschrift);
    expect(native.anmeldung).toBeNull();
    expect(verlauf()).toEqual([]);
    await act(async () => laden.fertig());
    await abwarten(() => expect(gestartet).toBe(true));
    expect(native.anmeldung).toBeNull();
    expect(verlauf()).toEqual([]);
    await act(async () => {
      for (const fertig of native.anmeldungen) fertig();
    });
    await abwarten(() => expect(native.auftrag).toBeNull());
    expect(zustand.tabs).toHaveLength(1);
    expect(zustand.tabs[0]!.initialNorm).toBe('ueberschrift:010');
    expect(verlauf()).toEqual([verlaufZiel('X', 'ueberschrift:010', 'de-bund')]);
    await act(async () => {
      wecken();
      wecken();
    });
    expect(verlauf()).toHaveLength(1);
    expect(native.callbacks.size).toBe(1);
    expect(native.fokus).toHaveBeenLastCalledWith('markierungskonflikte');
  },
);
it('erhält angewendete Restore-Tabs und öffnet in einem neuen Tab', async () => {
  speichereFensterZustand('fenster-navigation-test', {
    tabs: [{ gesetzesreferenz: { kurztitel: 'X', normgeber: 'de-bund' } }],
    aktiverIndex: 0,
  });
  const zeigen = sperre();
  native.show.mockImplementationOnce(() => zeigen.promise);
  await senden(ueberschrift);
  await rendern(true);
  await abwarten(() => expect(native.show).toHaveBeenCalled());
  expect(native.anmeldung).toBeNull();
  expect(gestartet).toBe(false);
  await act(async () => zeigen.fertig());
  await abwarten(() => expect(native.auftrag).toBeNull());
  expect(zustand.tabs).toHaveLength(2);
  expect(zustand.holeTabGesetz(zustand.tabs[0])?.kurztitel).toBe('X');
  expect(zustand.tabs[1]!.initialNorm).toBe('ueberschrift:010');
  expect(verlauf()).toEqual([
    verlaufZiel('X', 'ueberschrift:010', 'de-bund'),
    verlaufZiel('X', 'ueberschrift:010', 'de-bund'),
  ]);
});
it('verwirft einen während der Übernahme abgelösten Auftrag und bestätigt nur den aktuellen', async () => {
  const lesen = sperre();
  native.lesenGate = lesen.promise;
  await senden(norm('1'));
  await rendern();
  await abwarten(() => expect(native.lesenBegonnen).toHaveBeenCalled());
  await senden(ueberschrift);
  await act(async () => {
    native.lesenGate = null;
    lesen.fertig();
  });
  await abwarten(() => expect(native.auftrag).toBeNull());
  expect(verlauf()).toEqual([verlaufZiel('X', 'ueberschrift:010', 'de-bund')]);
});
it('öffnet bei entfernten Normzielen das Gesetz an der allgemeinen Startstelle und bestätigt den Auftrag', async () => {
  await rendern();
  await abwarten(() => expect(native.anmeldung).not.toBeNull());
  await senden({ gesetz: ref, ziel: { type: 'ueberschrift', gliederungskennzahl: '1010' } });
  await abwarten(() => expect(native.auftrag).toBeNull());
  expect(verlauf()).toEqual([verlaufZiel('X', 'ueberschrift:010', 'de-bund')]);
  expect(
    zustand.holeTabGesetz(zustand.tabs.find((t) => t.id === zustand.aktiverTabId))?.kurztitel,
  ).toBe('X');
  expect(getSnapshot().at(-1)?.text).toBe('Norm nicht gefunden.');
  await senden(norm('999'));
  await abwarten(() => expect(native.auftrag).toBeNull());
  expect(verlauf()).toEqual([verlaufZiel('X', 'ueberschrift:010', 'de-bund')]);
});
it('belegt Ordnerfehler am tatsächlichen Dateizugriff und wartet ohne Wiederholung bis zum erfolgreichen Nachladen', async () => {
  native.ordnerFehler = true;
  await senden(ueberschrift);
  await rendern(true);
  await abwarten(() =>
    expect(getSnapshot().some((b) => /verlässlich|nicht lesbar/.test(b.text))).toBe(true),
  );
  expect(gestartet).toBe(true);
  expect(native.anmeldung).not.toBeNull();
  expect(verlauf()).toEqual([]);
  expect(native.auftrag).not.toBeNull();
  expect(native.ordnerLesen.mock.calls.filter(([ordner]) => ordner === 'gesetze')).toHaveLength(1);
  expect(native.show).toHaveBeenCalledTimes(2);
  native.ordnerFehler = false;
  await act(async () => zustand.gleicheGesetzeAb());
  await abwarten(() => expect(native.auftrag).toBeNull());
  expect(verlauf()).toEqual([verlaufZiel('X', 'ueberschrift:010', 'de-bund')]);
});
it('bestätigt ein einzelnes unlesbares Ziel erst nach dessen erfolgreicher Wiederholung', async () => {
  native.unlesbar.add('gesetze/X_de-bund.xml');
  await senden(ueberschrift);
  await rendern();
  await abwarten(() => expect(native.anmeldung).not.toBeNull());
  expect(native.auftrag).not.toBeNull();
  expect(verlauf()).toEqual([]);
  await abwarten(() =>
    expect(getSnapshot().some((b) => /verlässlich|nicht lesbar/.test(b.text))).toBe(true),
  );
  native.unlesbar.clear();
  await act(async () => zustand.gleicheGesetzeAb());
  await abwarten(() => expect(native.auftrag).toBeNull());
  expect(verlauf()).toHaveLength(1);
});
it('öffnet lesbare andere Ziele trotz einzelner unlesbarer Gesetze und optionaler Titellesefehler', async () => {
  native.dateien.set('gesetze/Y_de-bund.xml', xml('Y'));
  native.unlesbar.add('gesetze/Y_de-bund.xml');
  native.titelFehler = true;
  await senden(ueberschrift);
  await rendern();
  await abwarten(() => expect(native.auftrag).toBeNull());
  expect(verlauf()).toEqual([verlaufZiel('X', 'ueberschrift:010', 'de-bund')]);
});
it('unterscheidet eine gültige leere Sammlung vom Ladefehler', async () => {
  native.dateien.clear();
  await senden(ueberschrift);
  await rendern();
  await abwarten(() => expect(native.auftrag).toBeNull());
  expect(gestartet).toBe(true);
  expect(getSnapshot().some((b) => b.text.includes('nicht mehr vorhanden'))).toBe(true);
  expect(native.anmeldung).not.toBeNull();
  expect(verlauf()).toEqual([]);
});
it('öffnet nach Abmeldung und verspäteter Antwort kein Ziel', async () => {
  const lesen = sperre();
  native.lesenGate = lesen.promise;
  await senden(ueberschrift);
  await rendern();
  await abwarten(() => expect(native.lesenBegonnen).toHaveBeenCalled());
  await act(async () => root.unmount());
  await act(async () => {
    native.lesenGate = null;
    lesen.fertig();
  });
  expect(native.anmeldung).toBeNull();
  expect(verlauf()).toEqual([]);
});
it.each(['transfer', 'letzterTab'] as const)(
  'erhält belegten Startinhalt aus %s vor dem internen Auftrag',
  async (art) => {
    native[art] = true;
    // Der zuletzt geschlossene Tab zeigt ein anderes Gesetz als das Linkziel.
    native.dateien.set('gesetze/Y_de-bund.xml', xml('Y'));
    geschlossenenTabPushen({
      gesetzesreferenz: { kurztitel: 'Y', normgeber: 'de-bund' },
      verlauf: { eintraege: [verlaufZiel('Y', 'p1', 'de-bund')], position: 0 },
    });
    await senden(ueberschrift);
    await rendern(true);
    await abwarten(() => expect(native.auftrag).toBeNull());
    const startinhalt = art === 'transfer' ? 'X' : 'Y';
    // Startinhalt und Linkziel erscheinen beide; ihre Tabfolge hängt bei der
    // Wiederherstellung davon ab, welche Öffnung zuerst geladen hat.
    await abwarten(() =>
      expect(
        zustand.tabs.map((t) => [t.gesetzesreferenz?.kurztitel, t.initialNorm]).sort(),
      ).toEqual(
        [
          [startinhalt, 'p1'],
          ['X', 'ueberschrift:010'],
        ].sort(),
      ),
    );
  },
);
it('behält nach späterem Ordnerlesefehler Bestand und Tab und öffnet bereits geladene Ziele', async () => {
  await senden(norm('1'));
  await rendern();
  await abwarten(() => expect(native.auftrag).toBeNull());
  const tab = zustand.tabs[0];
  const bestand = zustand.holeGeladenes({ kurztitel: 'X', normgeber: 'de-bund' });
  native.ordnerFehler = true;
  await act(async () => zustand.gleicheGesetzeAb());
  expect(zustand.tabs[0]).toBe(tab);
  expect(zustand.holeGeladenes({ kurztitel: 'X', normgeber: 'de-bund' })).toBe(bestand);
  expect(native.anmeldung).not.toBeNull();
  await senden(norm('1010'));
  await senden(ueberschrift);
  await abwarten(() => expect(native.auftrag).toBeNull());
  native.ordnerFehler = false;
  await act(async () => zustand.gleicheGesetzeAb());
  await abwarten(() => expect(native.auftrag).toBeNull());
  expect(verlauf().map((e) => e.xmlId)).toEqual(['ueberschrift:010', 'p1010', 'p1']);
});
it('verarbeitet die gemeinsam mit Rust geprüfte serialisierte Übergabe', async () => {
  native.neu = false;
  native.dateien.set('gesetze/BGB_de-bund.xml', xml('BGB'));
  await senden(vertraege.navigation.auftrag as InternerNavigationsauftrag);
  expect(native.auftrag).toEqual(vertraege.navigation.uebergabe);
  await rendern();
  await abwarten(() => expect(native.auftrag).toBeNull());
  expect(verlauf()).toEqual([verlaufZiel('BGB', 'ueberschrift:010', 'de-bund')]);
  expect(native.invoke).toHaveBeenCalledWith(vertraege.navigation.sendenCommand, {
    auftrag: vertraege.navigation.auftrag,
  });
  expect(native.listen).toHaveBeenCalledWith(
    vertraege.navigation.ereignis.name,
    expect.any(Function),
  );
});
it('lässt einen normalen Fensterstart ohne internen Auftrag leer und zeigt ohne fremde Fokusänderung', async () => {
  await rendern(true);
  await abwarten(() => expect(gestartet).toBe(true));
  expect(zustand.tabs).toHaveLength(1);
  expect(zustand.holeTabGesetz(zustand.tabs[0])).toBeUndefined();
  expect(verlauf()).toEqual([]);
  expect(native.show).toHaveBeenCalledOnce();
  expect(native.fokus).not.toHaveBeenCalled();
});
it.each([true, false])(
  'bestätigt erst nach abgeschlossener optionaler Titelverarbeitung das Ziel (StrictMode: %s)',
  async (strict) => {
    const titel = sperre();
    native.titelGate = titel.promise;
    await senden(ueberschrift);
    await rendern(strict);
    await abwarten(() => expect(native.ressourcenLesen).toHaveBeenCalledOnce());
    expect(gestartet).toBe(true);
    expect(native.anmeldung).not.toBeNull();
    expect(verlauf()).toEqual([]);
    await abwarten(() => expect(native.ressourcenLesen).toHaveBeenCalledOnce());
    await act(async () => titel.fertig());
    await abwarten(() => expect(native.auftrag).toBeNull());
    expect(verlauf()).toHaveLength(1);
    expect(native.ressourcenLesen).toHaveBeenCalledOnce();
  },
);
it('meldet bei technischer Listenerablehnung keine Bereitschaft und behält den Auftrag', async () => {
  const anmelden = native.listen.getMockImplementation()!;
  native.listen.mockImplementation((name: string, cb: () => void) =>
    name === 'interne-navigation-vorhanden'
      ? Promise.reject(new Error('Listener nicht verfügbar'))
      : anmelden(name, cb),
  );
  await senden(ueberschrift);
  await rendern();
  await abwarten(() => expect(gestartet).toBe(true));
  expect(native.anmeldung).toBeNull();
  expect(native.auftrag).not.toBeNull();
  expect(verlauf()).toEqual([]);
});
async function konfliktZeile(
  ueberschrift: boolean,
  zeilenRoot = root,
  zeilenContainer = container,
) {
  const eintrag: AnzeigeKonfliktEintrag = {
    schluessel: 'k',
    ausgangsstelle: ueberschrift ? ueberschriftAusgangsstelle('010') : normAusgangsstelle('§ 1'),
    bezeichnungAnzeige: 'Element',

    markierungstyp: 'kommentar',
    eigenerKonflikt: 'bezugstextFehltOderUnpassend',
    zielKonflikte: [],
  };
  await act(async () =>
    zeilenRoot.render(
      <GesetzZeile
        gesetz={{ gesetz: ref, eintraege: [eintrag] }}
        aufgeklappt
        onAufgeklapptAendern={vi.fn()}
        ausgewaehlt={null}
        onAuswaehlen={vi.fn()}
      />,
    ),
  );
  return [...zeilenContainer.querySelectorAll('div')].find(
    (el) => el.style.cursor === 'pointer' && el.textContent?.includes(': Kommentierter Text'),
  )!;
}
it.each([true, false])(
  'transportiert einen tatsächlichen Konfliktklick strukturiert (Überschrift: %s)',
  async (istUeberschriftfall) => {
    const zeile = await konfliktZeile(istUeberschriftfall);
    await act(async () => zeile.click());
    expect(native.invoke).toHaveBeenCalledWith('interne_navigation_senden', {
      auftrag: istUeberschriftfall
        ? ueberschrift
        : { gesetz: ref, ziel: { type: 'norm', bezeichnung: '§ 1' } },
    });
  },
);
it('zeigt einen technischen Sendefehler an der angeklickten Konfliktzeile', async () => {
  native.invoke.mockRejectedValueOnce(new Error('Fenstererzeugung fehlgeschlagen'));
  const zeile = await konfliktZeile(true);
  await act(async () => zeile.click());
  expect(container.textContent).toContain(
    'Das Ziel konnte nicht an das Hauptfenster übergeben werden.',
  );
});

const oeffnenLink = (suchtext: string): OeffnenLinkZiel => ({ type: 'oeffnen', suchtext });
function installiert(kurztitel: string, normgeber = 'de-bund'): GesetzDarstellung {
  return {
    kurztitel,
    normgeber,
    langtitel: 'Test',
    hatGliederungsartikel: false,
    elemente: [
      {
        typ: 'norm',
        data: normaleNorm({ id: 'norm', xmlId: 'p1', bezeichnung: '§ 1', absaetze: [] }),
      },
    ],
  };
}
it.each([false, true])(
  'Öffnen-Link wartet auf vorbereitete Indizes und exakten Import, öffnet das Ergebnisobjekt (StrictMode %s)',
  async (strict) => {
    native.dateien.set('gesetze/EGStGB_de-bund.xml', xml('EGStGB'));
    const startindex = sperre();
    const index = sperre();
    native.startIndizes.mockImplementationOnce(() => startindex.promise);
    native.indexLaden.mockImplementationOnce(async () => {
      await index.promise;
      return {
        'de-bund': [{ kurztitel: 'StGB', langtitel: 'Test', abrufkennung: 'stgb.xml' }],
        'de-bw': [],
        eu: [],
      };
    });
    const importiert = installiert('StGB');
    native.importieren.mockResolvedValueOnce({ erfolgreiche: [importiert], fehlgeschlagene: [] });
    await senden(oeffnenLink('1 StGB'));
    await rendern(strict);
    await abwarten(() => expect(gestartet).toBe(true));
    expect(native.indexLaden).not.toHaveBeenCalled();
    expect(verlauf()).toEqual([]);
    await act(async () => startindex.fertig());
    await abwarten(() => expect(native.indexLaden).toHaveBeenCalledOnce());
    expect(verlauf()).toEqual([]);
    await act(async () => index.fertig());
    await abwarten(() => expect(native.auftrag).toBeNull());
    expect(native.importieren).toHaveBeenCalledWith(
      [{ kurztitel: 'StGB', abrufkennung: 'stgb.xml' }],
      'de-bund',
      undefined,
      expect.any(Function),
    );
    expect(zustand.tabs).toHaveLength(1);
    expect(zustand.holeTabGesetz(zustand.tabs[0])).toBe(importiert);
    expect(zustand.holeGeladenes(importiert)).toBe(importiert);
    expect(verlauf()).toEqual([verlaufZiel('StGB', 'p1', 'de-bund')]);
    expect(native.suchfehler).not.toHaveBeenCalled();
    expect(native.fokus).toHaveBeenLastCalledWith('hauptfenster');
    await act(async () => {
      wecken();
      wecken();
    });
    expect(native.importieren).toHaveBeenCalledOnce();
    expect(verlauf()).toHaveLength(1);
  },
);
it('Öffnen-Link ignoriert das aktive Gesetz auch bei reiner Normsuche', async () => {
  native.dateien.set('gesetze/A_de-bund.xml', xml('A'));
  await senden(norm('1010'));
  await rendern();
  await abwarten(() => expect(native.auftrag).toBeNull());
  expect(zustand.holeTabGesetz(zustand.tabs[0])?.kurztitel).toBe('X');
  await senden(oeffnenLink('1'));
  await abwarten(() => expect(native.auftrag).toBeNull());
  expect(
    zustand.holeTabGesetz(zustand.tabs.find((t) => t.id === zustand.aktiverTabId))?.kurztitel,
  ).toBe('A');
  expect(verlauf()).toContainEqual({
    gesetzesreferenz: { kurztitel: 'A', normgeber: 'de-bund' },
    xmlId: 'p1',
  });
  expect(native.indexLaden).not.toHaveBeenCalled();
});
it.each(['kein Treffer', 'Fehlerergebnis', 'Ablehnung'] as const)(
  'Öffnen-Link zeigt %s ohne Navigation im kontextfreien Fehleroverlay',
  async (art) => {
    if (art !== 'kein Treffer')
      native.indexLaden.mockResolvedValue({
        'de-bund': [{ kurztitel: 'BGB', langtitel: 'Test', abrufkennung: 'bgb.xml' }],
        'de-bw': [],
        eu: [],
      });
    if (art === 'Ablehnung')
      native.importieren.mockRejectedValueOnce(new Error('Technischer Importfehler'));
    await senden(oeffnenLink('1 BGB'));
    await rendern();
    await abwarten(() => expect(native.auftrag).toBeNull());
    expect(native.suchfehler).toHaveBeenCalledOnce();
    expect(native.suchfehler).toHaveBeenCalledWith({
      suchtext: '1 BGB',
      ohneAktivesGesetz: true,
      meldung:
        art === 'kein Treffer'
          ? 'Kein Treffer für diesen Link.'
          : art === 'Ablehnung'
            ? 'Technischer Importfehler'
            : 'Importfehler',
    });
    expect(verlauf()).toEqual([]);
    expect(zustand.holeTabGesetz(zustand.tabs[0])).toBeUndefined();
  },
);
it.each(['Index', 'Importerfolg', 'Importfehler'] as const)(
  'interner Klick löst wartenden Öffnen-Link bei %s ab, ohne alte Öffnung oder Fehlermeldung',
  async (art) => {
    const gate = sperre();
    const eintraege = {
      'de-bund': [{ kurztitel: 'BGB', langtitel: 'Test', abrufkennung: 'bgb.xml' }],
      'de-bw': [],
      eu: [],
    };
    native.indexLaden.mockImplementation(async () => {
      if (art === 'Index') await gate.promise;
      return eintraege;
    });
    native.importieren.mockImplementation(async () => {
      await gate.promise;
      return {
        erfolgreiche: art === 'Importerfolg' ? [installiert('BGB')] : [],
        fehlgeschlagene: [{ fehler: { meldung: 'alt' } }],
      };
    });
    await senden(oeffnenLink('1 BGB'));
    await rendern(true);
    await abwarten(() =>
      expect(art === 'Index' ? native.indexLaden : native.importieren).toHaveBeenCalledOnce(),
    );
    await senden(ueberschrift);
    await act(async () => gate.fertig());
    await abwarten(() => expect(native.auftrag).toBeNull());
    expect(verlauf()).toEqual([verlaufZiel('X', 'ueberschrift:010', 'de-bund')]);
    expect(native.suchfehler).not.toHaveBeenCalled();
    expect(native.fokus).toHaveBeenLastCalledWith('markierungskonflikte');
  },
);
it('Öffnen-Link löst interne Übergabe während verzögertem Anzeigen ab und bestimmt auch den Fokusabschluss', async () => {
  await rendern();
  await abwarten(() => expect(native.anmeldung).not.toBeNull());
  const zeigen = sperre();
  native.show.mockImplementationOnce(() => zeigen.promise);
  await senden(ueberschrift);
  await abwarten(() => expect(native.show).toHaveBeenCalledTimes(2));
  await senden(oeffnenLink('1 X'));
  await act(async () => zeigen.fertig());
  await abwarten(() => expect(native.auftrag).toBeNull());
  expect(verlauf()).toEqual([verlaufZiel('X', 'p1', 'de-bund')]);
  expect(native.fokus).toHaveBeenLastCalledWith('hauptfenster');
});
it.each(['Index', 'Import'] as const)(
  'Fensterschließen während %s verhindert alte Navigation und altes Fehleroverlay',
  async (art) => {
    const gate = sperre();
    native.indexLaden.mockImplementation(async () => {
      if (art === 'Index') await gate.promise;
      return importindexMitBGB();
    });
    native.importieren.mockImplementation(async () => {
      await gate.promise;
      throw new Error('alter Fehler');
    });
    await senden(oeffnenLink('1 BGB'));
    await rendern(true);
    await abwarten(() =>
      expect(art === 'Index' ? native.indexLaden : native.importieren).toHaveBeenCalledOnce(),
    );
    await act(async () => root.unmount());
    await act(async () => gate.fertig());
    expect(verlauf()).toEqual([]);
    expect(native.suchfehler).not.toHaveBeenCalled();
  },
);
it.each(['Ordner', 'Gesetz'] as const)(
  'Öffnen-Link wartet bei tatsächlichem unlesbarem %s ohne Import oder Fehlertreffer bis zum erneuten Laden',
  async (art) => {
    if (art === 'Ordner') native.ordnerFehler = true;
    else native.unlesbar.add('gesetze/X_de-bund.xml');
    await senden(oeffnenLink('1 X'));
    await rendern(true);
    await abwarten(() =>
      expect(
        getSnapshot().some(
          (b) =>
            /verlässlich/.test(b.text) ||
            b.gliederung?.kategorien.some((k) =>
              k.gruppen.some((g) => g.schluessel === 'nichtLesbar'),
            ),
        ),
      ).toBe(true),
    );
    expect(native.auftrag).not.toBeNull();
    expect(native.indexLaden).not.toHaveBeenCalled();
    expect(native.importieren).not.toHaveBeenCalled();
    expect(native.suchfehler).not.toHaveBeenCalled();
    expect(native.ordnerLesen.mock.calls.filter(([ordner]) => ordner === 'gesetze')).toHaveLength(
      // Der Abgleich reicht seine Auflistung an das Einlesen weiter.
      art === 'Ordner' ? 1 : 3,
    );
    native.ordnerFehler = false;
    native.unlesbar.clear();
    await act(async () => zustand.gleicheGesetzeAb());
    await abwarten(() => expect(native.auftrag).toBeNull());
    expect(verlauf()).toEqual([verlaufZiel('X', 'p1', 'de-bund')]);
  },
);
it.each(['restore', 'transfer'] as const)(
  'Öffnen-Link erhält %s-Startinhalt in eigenem Tab',
  async (art) => {
    if (art === 'restore')
      speichereFensterZustand('fenster-navigation-test', {
        tabs: [{ gesetzesreferenz: { kurztitel: 'X', normgeber: 'de-bund' } }],
        aktiverIndex: 0,
      });
    else native.transfer = true;
    await senden(oeffnenLink('1010 X'));
    await rendern(true);
    await abwarten(() => expect(native.auftrag).toBeNull());
    expect(zustand.tabs).toHaveLength(2);
    expect(zustand.tabs[1]!.initialNorm).toBe('p1010');
    expect(verlauf()).toEqual([
      ...(art === 'restore' ? [verlaufZiel('X', 'ueberschrift:010', 'de-bund')] : []),
      verlaufZiel('X', 'p1010', 'de-bund'),
    ]);
  },
);

it.each(['Index', 'Import'] as const)(
  'neuer Öffnen-Link während %s ersetzt die alte Suche',
  async (art) => {
    const gate = sperre();
    native.indexLaden.mockImplementation(async () => {
      if (art === 'Index') await gate.promise;
      return importindexMitBGB();
    });
    native.importieren.mockImplementation(async () => {
      await gate.promise;
      return { erfolgreiche: [installiert('BGB')], fehlgeschlagene: [] };
    });
    await senden(oeffnenLink('1 BGB'));
    await rendern(true);
    await abwarten(() =>
      expect(art === 'Index' ? native.indexLaden : native.importieren).toHaveBeenCalledOnce(),
    );
    await senden(oeffnenLink('1010 X'));
    await act(async () => gate.fertig());
    await abwarten(() => expect(native.auftrag).toBeNull());
    expect(verlauf()).toEqual([verlaufZiel('X', 'p1010', 'de-bund')]);
    expect(native.suchfehler).not.toHaveBeenCalled();
    expect(native.importieren).toHaveBeenCalledTimes(art === 'Index' ? 0 : 1);
  },
);
it.each(['leer', 'restore', 'transfer'] as const)(
  'tatsächlicher App-Start-Öffnen-Link erhält %s und öffnet genau einmal',
  async (art) => {
    native.label = 'main';
    native.getCurrent.mockResolvedValue(['lexlata://oeffnen/1010%20X']);
    if (art === 'restore')
      speichereFensterZustand('main', {
        tabs: [{ gesetzesreferenz: { kurztitel: 'X', normgeber: 'de-bund' } }],
        aktiverIndex: 0,
      });
    if (art === 'transfer') native.transfer = true;
    await rendern(true);
    await abwarten(() => expect(gestartet).toBe(true));
    await abwarten(() => expect(native.auftrag).toBeNull());
    expect(native.getCurrent).toHaveBeenCalledOnce();
    expect(
      native.invoke.mock.calls.filter(([cmd]) => cmd === 'oeffnen_link_navigation_senden'),
    ).toEqual([
      [
        'oeffnen_link_navigation_senden',
        { auftrag: { type: 'oeffnen', suchtext: '1010 X' }, beimAppStart: true },
      ],
    ]);
    expect(zustand.tabs).toHaveLength(art === 'leer' ? 1 : 2);
    expect(verlauf()).toEqual([
      ...(art === 'restore' ? [verlaufZiel('X', 'ueberschrift:010', 'de-bund')] : []),
      verlaufZiel('X', 'p1010', 'de-bund'),
    ]);
    expect(native.fokus).toHaveBeenLastCalledWith('hauptfenster');
  },
);

it.each([
  ['Normlink', 'lexlata://de-bund/X/1010'],
  ['Öffnen-Link', 'lexlata://oeffnen/1010%20X'],
] as const)(
  'erhält bei echtem App-Start-%s übernommene Tabs und nutzt ohne Restore den Anfangstab',
  async (_art, url) => {
    native.label = 'main';
    native.dateien.set('gesetze/Y_de-bund.xml', xml('Y'));
    native.getCurrent.mockResolvedValue([url]);
    speichereFensterZustand('fenster-a', {
      tabs: [
        { gesetzesreferenz: { kurztitel: 'Y', normgeber: 'de-bund' } },
        { gesetzesreferenz: { kurztitel: 'X', normgeber: 'de-bund' } },
      ],
      aktiverIndex: 0,
    });
    await rendern(true);
    await abwarten(() => {
      expect(gestartet).toBe(true);
      expect(native.auftrag).toBeNull();
      expect(zustand.tabs).toHaveLength(3);
    });
    expect(ladeFensterZustand('fenster-a')).toBeNull();
    expect(ladeFensterZustand('main')?.tabs).toEqual([
      { gesetzesreferenz: { kurztitel: 'Y', normgeber: 'de-bund' } },
      { gesetzesreferenz: { kurztitel: 'X', normgeber: 'de-bund' } },
    ]);
    expect(zustand.tabs.map((tab) => zustand.holeTabGesetz(tab)?.kurztitel)).toEqual([
      'Y',
      'X',
      'X',
    ]);
    expect(zustand.tabs[2]!.initialNorm).toBe('p1010');
    expect(zustand.aktiverTabId).toBe(zustand.tabs[2]!.id);
    expect(verlauf()).toEqual([
      verlaufZiel('Y', 'ueberschrift:010', 'de-bund'),
      verlaufZiel('X', 'ueberschrift:010', 'de-bund'),
      verlaufZiel('X', 'p1010', 'de-bund'),
    ]);
    expect(native.invoke.mock.calls.some(([cmd]) => cmd === 'fenster_oeffnen_mit_label')).toBe(
      false,
    );
    expect(native.getCurrent).toHaveBeenCalledOnce();

    // Frischer Start ohne gespeicherte Fenster verwendet denselben öffentlichen Link.
    await act(async () => root.unmount());
    localStorage.removeItem('lexlata.fenster');
    native.auftrag = null;
    native.kennung = 0;
    native.neu = true;
    root = createRoot(container);
    await rendern(true);
    await abwarten(() => {
      expect(gestartet).toBe(true);
      expect(native.auftrag).toBeNull();
      expect(zustand.tabs[0]!.initialNorm).toBe('p1010');
    });
    expect(zustand.tabs).toHaveLength(1);
    expect(verlauf()).toEqual([verlaufZiel('X', 'p1010', 'de-bund')]);
  },
);

it.each([
  ['Normlink', 'lexlata://de-bund/X/1010'],
  ['Öffnen-Link', 'lexlata://oeffnen/1010%20X'],
] as const)(
  'verarbeitet einen echten Link bei laufender App-%s nach Übernahme ohne erneutes Restore',
  async (art, url) => {
    native.label = 'main';
    native.neu = false;
    native.dateien.set('gesetze/Y_de-bund.xml', xml('Y'));
    speichereFensterZustand('fenster-a', {
      tabs: [
        { gesetzesreferenz: { kurztitel: 'Y', normgeber: 'de-bund' } },
        { gesetzesreferenz: { kurztitel: 'X', normgeber: 'de-bund' } },
      ],
      aktiverIndex: 1,
    });
    await rendern(true);
    await abwarten(() => expect(gestartet).toBe(true));
    const ids = zustand.tabs.map((tab) => tab.id);
    await act(async () => {
      for (const callback of native.linkCallbacks) callback({ payload: [url] });
    });
    await abwarten(() => {
      expect(native.auftrag).toBeNull();
      expect(zustand.tabs[1]!.initialNorm).toBe('p1010');
    });
    expect(zustand.tabs.map((tab) => tab.id)).toEqual(ids);
    expect(zustand.tabs.map((tab) => zustand.holeTabGesetz(tab)?.kurztitel)).toEqual(['Y', 'X']);
    expect(native.getCurrent).toHaveBeenCalledOnce();
    expect(verlauf()).toEqual([
      verlaufZiel('Y', 'ueberschrift:010', 'de-bund'),
      verlaufZiel('X', 'p1010', 'de-bund'),
      verlaufZiel('X', 'ueberschrift:010', 'de-bund'),
    ]);
    if (art === 'Öffnen-Link')
      expect(native.invoke).toHaveBeenCalledWith('oeffnen_link_navigation_senden', {
        auftrag: oeffnenLink('1010 X'),
        beimAppStart: false,
      });
  },
);

it.each([true, false])(
  'erreicht nach Übernahme und erneutem Öffnen des Konfliktfensters das vorhandene Ziel (Überschrift: %s)',
  async (ueberschrift) => {
    native.label = 'main';
    native.neu = false;
    native.dateien.set('gesetze/Y_de-bund.xml', xml('Y'));
    speichereFensterZustand('fenster-a', {
      tabs: [
        { gesetzesreferenz: { kurztitel: 'Y', normgeber: 'de-bund' } },
        { gesetzesreferenz: { kurztitel: 'X', normgeber: 'de-bund' } },
      ],
      aktiverIndex: 0,
    });
    await rendern(true);
    await abwarten(() => expect(gestartet).toBe(true));
    const ids = zustand.tabs.map((tab) => tab.id);
    for (let oeffnung = 0; oeffnung < 2; oeffnung++) {
      const zeilenContainer = document.createElement('div');
      const zeilenRoot = createRoot(zeilenContainer);
      try {
        const zeile = await konfliktZeile(ueberschrift, zeilenRoot, zeilenContainer);
        await act(async () => zeile.click());
        await abwarten(() => {
          expect(native.auftrag).toBeNull();
          expect(zustand.tabs[1]!.initialNorm).toBe(ueberschrift ? 'ueberschrift:010' : 'p1');
        });
        expect(zustand.tabs.map((tab) => tab.id)).toEqual(ids);
        expect(zustand.tabs.map((tab) => zustand.holeTabGesetz(tab)?.kurztitel)).toEqual([
          'Y',
          'X',
        ]);
        expect(zustand.aktiverTabId).toBe(ids[1]);
      } finally {
        await act(async () => zeilenRoot.unmount());
      }
    }
    expect(native.oeffnen).toHaveBeenCalledTimes(2);
    expect(native.invoke.mock.calls.some(([cmd]) => cmd === 'fenster_oeffnen_mit_label')).toBe(
      false,
    );
    expect(ladeFensterZustand('fenster-a')).toBeNull();
    expect(native.fokus).toHaveBeenLastCalledWith('markierungskonflikte');
  },
);

it('wartet bei installiertem AEUV auf den verzögerten EUV-Importvorschlag', async () => {
  native.dateien.set(
    'gesetze/AEUV_eu.xml',
    xml('AEUV').replace('<normgeber>de-bund</normgeber>', '<normgeber>eu</normgeber>'),
  );
  const index = sperre();
  native.indexLaden.mockImplementation(async () => {
    await index.promise;
    return {
      'de-bund': [],
      'de-bw': [],
      eu: [{ kurztitel: 'EUV', langtitel: 'Test', abrufkennung: 'euv.xml' }],
    };
  });
  const importiert = installiert('EUV', 'eu');
  native.importieren.mockResolvedValue({ erfolgreiche: [importiert], fehlgeschlagene: [] });
  await senden(oeffnenLink('1 euv'));
  await rendern(true);
  await abwarten(() => expect(native.indexLaden).toHaveBeenCalledOnce());
  expect(verlauf()).toEqual([]);
  await act(async () => index.fertig());
  await abwarten(() => expect(native.auftrag).toBeNull());
  expect(native.importieren).toHaveBeenCalledWith(
    [{ kurztitel: 'EUV', abrufkennung: 'euv.xml' }],
    'eu',
    undefined,
    expect.any(Function),
  );
  expect(zustand.holeTabGesetz(zustand.tabs[0])).toBe(importiert);
  expect(verlauf()).toEqual([verlaufZiel('EUV', 'p1', 'eu')]);
});
it('Öffnen-Link mit Gesetzesangabe ignoriert einen anderen aktiven Tab', async () => {
  native.dateien.set('gesetze/A_de-bund.xml', xml('A'));
  await senden(norm('1010'));
  await rendern();
  await abwarten(() => expect(native.auftrag).toBeNull());
  await senden(oeffnenLink('1010 A'));
  await abwarten(() => expect(native.auftrag).toBeNull());
  expect(
    zustand.holeTabGesetz(zustand.tabs.find((t) => t.id === zustand.aktiverTabId))?.kurztitel,
  ).toBe('A');
  expect(verlauf()).toContainEqual({
    gesetzesreferenz: { kurztitel: 'A', normgeber: 'de-bund' },
    xmlId: 'p1010',
  });
});
it('optionale Titellesefehler sperren den verlässlichen Suchauftrag nicht', async () => {
  native.titelFehler = true;
  await senden(oeffnenLink('1010 X'));
  await rendern(true);
  await abwarten(() => expect(native.auftrag).toBeNull());
  expect(verlauf()).toEqual([verlaufZiel('X', 'p1010', 'de-bund')]);
  expect(native.suchfehler).not.toHaveBeenCalled();
});
it('auch ein anderes unlesbares Gesetz sperrt die kontextfreie Trefferwahl bis zum neuen Ladeabschluss', async () => {
  native.dateien.set('gesetze/A_de-bund.xml', xml('A'));
  native.unlesbar.add('gesetze/A_de-bund.xml');
  await senden(oeffnenLink('1'));
  await rendern(true);
  await abwarten(() => expect(gestartet).toBe(true));
  expect(native.auftrag).not.toBeNull();
  expect(verlauf()).toEqual([]);
  expect(native.suchfehler).not.toHaveBeenCalled();
  native.unlesbar.clear();
  await act(async () => zustand.gleicheGesetzeAb());
  await abwarten(() => expect(native.auftrag).toBeNull());
  expect(verlauf()).toEqual([verlaufZiel('A', 'p1', 'de-bund')]);
});

it('Import ohne gesuchte Norm öffnet das zurückgegebene Gesetz ohne neuen Normfilter', async () => {
  const importiert = installiert('BGB');
  native.indexLaden.mockResolvedValue({
    'de-bund': [{ kurztitel: 'BGB', langtitel: 'Test', abrufkennung: 'bgb.xml' }],
    'de-bw': [],
    eu: [],
  });
  native.importieren.mockResolvedValue({ erfolgreiche: [importiert], fehlgeschlagene: [] });
  await senden(oeffnenLink('999 BGB'));
  await rendern(true);
  await abwarten(() => expect(native.auftrag).toBeNull());
  expect(zustand.holeTabGesetz(zustand.tabs[0])).toBe(importiert);
  expect(zustand.tabs[0]!.initialNorm).toBe('p1');
  expect(verlauf()).toEqual([verlaufZiel('BGB', 'p1', 'de-bund')]);
  expect(native.suchfehler).not.toHaveBeenCalled();
});
it.each(['Startvorbereitung', 'Indexprüfung'] as const)(
  'technische Ablehnung bei %s zeigt Fehlermeldung ohne Öffnung',
  async (art) => {
    if (art === 'Startvorbereitung')
      native.startIndizes.mockRejectedValueOnce(new Error('Startindizes unlesbar'));
    else native.indexLaden.mockRejectedValueOnce(new Error('Indizes unlesbar'));
    await senden(oeffnenLink('999 BGB'));
    await rendern(true);
    await abwarten(() => expect(native.auftrag).toBeNull());
    expect(native.suchfehler).toHaveBeenCalledWith({
      suchtext: '999 BGB',
      ohneAktivesGesetz: true,
      meldung: 'Importangebote konnten nicht geladen werden.',
    });
    expect(native.importieren).not.toHaveBeenCalled();
    expect(verlauf()).toEqual([]);
  },
);

it.each(['Erfolg', 'Fehler'] as const)(
  'importiert bei verlässlichem Reload während OeffnenLinkimport nur einmal (%s)',
  async (art) => {
    const importGate = sperre();
    const importiert = installiert('BGB');
    native.indexLaden.mockResolvedValue({
      'de-bund': [{ kurztitel: 'BGB', langtitel: 'Test', abrufkennung: 'bgb.xml' }],
      'de-bw': [],
      eu: [],
    });
    native.importieren.mockImplementation(async () => {
      await importGate.promise;
      return {
        erfolgreiche: art === 'Erfolg' ? [importiert] : [],
        fehlgeschlagene: [{ fehler: { meldung: 'Ursprünglicher Importfehler' } }],
      };
    });
    await senden(oeffnenLink('1 BGB'));
    await rendern(true);
    await abwarten(() => expect(native.importieren).toHaveBeenCalledOnce());
    await act(async () => zustand.gleicheGesetzeAb());
    expect(Boolean(zustand.holeGeladenes({ kurztitel: 'BGB', normgeber: 'de-bund' }))).toBe(false);
    await act(async () => importGate.fertig());
    await abwarten(() => expect(native.auftrag).toBeNull());
    expect(native.importieren).toHaveBeenCalledOnce();
    if (art === 'Erfolg') {
      expect(zustand.holeTabGesetz(zustand.tabs[0])).toBe(importiert);
      expect(verlauf()).toEqual([verlaufZiel('BGB', 'p1', 'de-bund')]);
      expect(native.oeffnen).toHaveBeenCalledOnce();
      expect(native.suchfehler).not.toHaveBeenCalled();
    } else {
      expect(verlauf()).toEqual([]);
      expect(native.suchfehler).toHaveBeenCalledOnce();
      expect(native.suchfehler).toHaveBeenCalledWith({
        suchtext: '1 BGB',
        ohneAktivesGesetz: true,
        meldung: 'Ursprünglicher Importfehler',
      });
    }
  },
);

it.each(['Ordner', 'Gesetz'] as const)(
  'öffnet bei während Import unzuverlässig gewordenem %s kein altes Importziel',
  async (art) => {
    const gate = sperre();
    native.indexLaden.mockResolvedValue({
      'de-bund': [{ kurztitel: 'BGB', langtitel: 'Test', abrufkennung: 'bgb.xml' }],
      'de-bw': [],
      eu: [],
    });
    native.importieren.mockImplementation(async () => {
      await gate.promise;
      return { erfolgreiche: [installiert('BGB')], fehlgeschlagene: [] };
    });
    await senden(oeffnenLink('1 BGB'));
    await rendern(true);
    await abwarten(() => expect(native.importieren).toHaveBeenCalledOnce());
    if (art === 'Ordner') native.ordnerFehler = true;
    else {
      native.unlesbar.add('gesetze/X_de-bund.xml');
      native.dateien.set('gesetze/X_de-bund.xml', xml('X') + ' ');
    }
    await act(async () => zustand.gleicheGesetzeAb());
    await act(async () => gate.fertig());
    expect(native.auftrag).not.toBeNull();
    expect(native.importieren).toHaveBeenCalledOnce();
    expect(verlauf()).toEqual([]);
    expect(native.suchfehler).not.toHaveBeenCalled();
    // Nach erfolgreichem Nachladen wird ausschließlich ein neuerer Auftrag ausgeführt.
    await senden(oeffnenLink('1010 X'));
    native.ordnerFehler = false;
    native.unlesbar.clear();
    await act(async () => zustand.gleicheGesetzeAb());
    await abwarten(() => expect(native.auftrag).toBeNull());
    expect(verlauf()).toEqual([verlaufZiel('X', 'p1010', 'de-bund')]);
    expect(native.importieren).toHaveBeenCalledOnce();
  },
);
it('berücksichtigt nach Indexwarten den währenddessen tatsächlich neu geladenen Bestand', async () => {
  const index = sperre();
  native.indexLaden.mockImplementation(async () => {
    await index.promise;
    return {
      'de-bund': [{ kurztitel: 'BGB', langtitel: 'Test', abrufkennung: 'bgb.xml' }],
      'de-bw': [],
      eu: [],
    };
  });
  await senden(oeffnenLink('1010 BGB'));
  await rendern(true);
  await abwarten(() => expect(native.indexLaden).toHaveBeenCalledOnce());
  native.dateien.set('gesetze/BGB_de-bund.xml', xml('BGB'));
  await act(async () => {
    await zustand.gleicheGesetzeAb();
    await gleicheSuchverzeichnisAb();
  });
  await act(async () => index.fertig());
  await abwarten(() => expect(native.auftrag).toBeNull());
  expect(native.indexLaden).toHaveBeenCalledOnce();
  expect(native.importieren).not.toHaveBeenCalled();
  expect(verlauf()).toEqual([verlaufZiel('BGB', 'p1010', 'de-bund')]);
});

it('verwirft eine alte Leertrefferentscheidung nach Reload vor dem Fehleroverlay', async () => {
  const gate = sperre();
  const invoke = native.invoke.getMockImplementation()!;
  let indexAbgeschlossen = false;
  let pruefungen = 0;
  let fehlerPruefungWartet = false;
  native.indexLaden.mockImplementation(async () => {
    indexAbgeschlossen = true;
    return { 'de-bund': [], 'de-bw': [], eu: [] };
  });
  native.invoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
    if (command === 'gesetz_dateistempel_lesen') {
      await native.ordnerLesen('gesetze');
      return nativeGesetzDateistempel();
    }
    if (command === 'interne_navigation_lesen' && indexAbgeschlossen && ++pruefungen === 2) {
      native.lesenGate = gate.promise;
      fehlerPruefungWartet = true;
    }
    return invoke(command, args);
  });
  await senden(oeffnenLink('1010 BGB'));
  await rendern(true);
  await abwarten(() => expect(fehlerPruefungWartet).toBe(true));
  native.dateien.set('gesetze/BGB_de-bund.xml', xml('BGB'));
  await act(async () => {
    await zustand.gleicheGesetzeAb();
    await gleicheSuchverzeichnisAb();
  });
  await act(async () => {
    native.lesenGate = null;
    gate.fertig();
  });
  await abwarten(() => expect(native.auftrag).toBeNull());
  expect(native.suchfehler).not.toHaveBeenCalled();
  expect(native.importieren).not.toHaveBeenCalled();
  // Auch die neue Auswahl nach dem Reload prüft weitere namensgleiche Angebote.
  expect(native.indexLaden).toHaveBeenCalledTimes(2);
  expect(verlauf()).toEqual([verlaufZiel('BGB', 'p1010', 'de-bund')]);
});

it.each([
  [norm('1010'), 'p1010'],
  [ueberschrift, 'ueberschrift:010'],
  [oeffnenLink('1010 X'), 'p1010'],
] as const)(
  'schließt trotz realem optionalem Titelkopierfehler Start und Navigation ab (%j)',
  async (auftrag, xmlId) => {
    titelRessource('X');
    native.schreibenFehler.add('nichtamtliche-titel/X_de-bund-nichtamtliche-titel.xml');
    await senden(auftrag);
    await rendern(true);
    // Die native Bestätigung kann vor Reacts Übernahme des Tabzustands eintreffen.
    // Der Test ist erst abgeschlossen, wenn auch die Navigation sichtbar übernommen ist.
    await abwarten(() => {
      expect(native.auftrag).toBeNull();
      expect(gestartet).toBe(true);
      expect(zustand.tabs[0]!.initialNorm).toBe(xmlId);
      expect(verlauf()).toEqual([
        { gesetzesreferenz: { kurztitel: 'X', normgeber: 'de-bund' }, xmlId },
      ]);
    });
    expect(
      getSnapshot().filter(
        (banner) => banner.text.includes('Titel') && banner.text.includes('„X“'),
      ),
    ).toHaveLength(1);
    expect(zustand.holeTabGesetz(zustand.tabs[0])?.kurztitel).toBe('X');
  },
);

function titelRessource(kurztitel: string) {
  native.ressourcen.set(
    `resources/nichtamtliche-titel/de-bund/${kurztitel}.xml`,
    `<nichtamtlicheTitel><infos><gesetz normgeber="de-bund">${kurztitel}</gesetz></infos><inhalt><norm><bezeichnung>§ 1</bezeichnung><titel>Zusatz ${kurztitel}</titel></norm></inhalt></nichtamtlicheTitel>`,
  );
}
it('behandelt fehlenden optionalen Ordner und fehlende mitgelieferte Datei ohne Banner', async () => {
  const lesen = native.ordnerLesen.getMockImplementation()!;
  native.ordnerLesen.mockImplementation((ordner: string) =>
    ordner === 'nichtamtliche-titel' ? Promise.reject(new Error('Ordner fehlt')) : lesen(ordner),
  );
  await senden(norm('1'));
  await rendern(true);
  await abwarten(() => expect(native.auftrag).toBeNull());
  expect(getSnapshot()).toEqual([]);
  expect(verlauf()).toHaveLength(1);
});
it.each(['vorher', 'nachher'] as const)(
  'erhält erfolgreiche Titelkopien %s einem Kopierfehler über Sitzungstabs ohne Reload',
  async (reihenfolge) => {
    native.dateien.clear();
    const fehlerName = reihenfolge === 'vorher' ? 'Y' : 'A';
    const titelpfad = (name: string) =>
      `nichtamtliche-titel/${name}_de-bund-nichtamtliche-titel.xml`;
    // Der übertragene Tab X gleicht seine Titel bereits im Einzelzugriff ab.
    // Der anschließende Sammellauf prüft A vor Y: der Fehler liegt vor oder
    // nach der dort verbleibenden erfolgreichen Kopie. Die Dateieinfügung ist unerheblich.
    const namen = ['Y', 'A', 'X'];
    for (const name of namen) {
      native.dateien.set(`gesetze/${name}_de-bund.xml`, xml(name));
      titelRessource(name);
    }
    native.schreibenFehler.add(titelpfad(fehlerName));
    speichereFensterZustand('fenster-navigation-test', {
      tabs: ['X', 'A', 'Y'].map((kurztitel) => ({
        gesetzesreferenz: { kurztitel, normgeber: 'de-bund' },
      })),
      aktiverIndex: 0,
    });
    await senden(ueberschrift);
    await rendern(true);
    await abwarten(() => {
      expect(native.auftrag).toBeNull();
      expect(zustand.tabs.every((t) => t.ladezustand === 'geladen')).toBe(true);
    });
    expect(
      native.invoke.mock.calls
        .filter(([command]) => command === 'atomar_datei_schreiben')
        .map(([, args]) => args.relativerPfad),
    ).toEqual(expect.arrayContaining(['X', 'A', 'Y'].map(titelpfad)));
    expect(native.dateien.has(titelpfad(fehlerName))).toBe(false);
    expect(native.ordnerLesen.mock.calls.filter(([ordner]) => ordner === 'gesetze')).toHaveLength(
      6,
    );
    for (const name of ['A', 'X', 'Y'].filter((name) => name !== fehlerName)) {
      expect(native.dateien.has(titelpfad(name))).toBe(true);
      expect(
        zustand.tabs
          .map((t) => zustand.holeTabGesetz(t))
          .find((gesetz) => gesetz?.kurztitel === name)
          ?.elemente.find((el) => el.typ === 'norm' && el.data.xmlId === 'p1')?.data,
      ).toMatchObject({ titel: `Zusatz ${name}`, titelIstNichtamtlich: true });
    }
    expect(zustand.tabs).toHaveLength(4);
    expect(zustand.tabs[0]!.initialNorm).toBe('ueberschrift:010');
    expect(zustand.tabs[3]!.initialNorm).toBe('ueberschrift:010');
    expect(
      getSnapshot().filter((banner) => banner.text.includes(`Titel für „${fehlerName}“`)),
    ).toHaveLength(1);
  },
);
it.each(['Ordner', 'Gesetz'] as const)(
  'zeigt nach erfolgreichem Einzelzugriff trotz anschließendem %sfehler Titel ohne Gesetzreload',
  async (art) => {
    titelRessource('X');
    native.reloadFehler = art;
    await senden(ueberschrift);
    await rendern(true);
    await abwarten(() => {
      expect(native.auftrag).toBeNull();
      expect(gestartet).toBe(true);
    });
    expect(verlauf()).toEqual([verlaufZiel('X', 'ueberschrift:010', 'de-bund')]);
    expect(
      zustand.holeTabGesetz(zustand.tabs[0])?.elemente.find((el) => el.data.xmlId === 'p1')?.data
        .titel,
    ).toBe('Zusatz X');
    expect(native.ordnerLesen.mock.calls.filter(([ordner]) => ordner === 'gesetze')).toHaveLength(
      1,
    );
  },
);

// Hält genau eine native Antwort mitsamt ihrem vor der Ablösung gelesenen Stand fest.
function halteAntwort(pruefen: () => boolean) {
  const gate = sperre();
  const invoke = native.invoke.getMockImplementation()!;
  let wartet = false;
  native.invoke.mockImplementation(async (command: string, args?: Record<string, unknown>) => {
    if (command === 'gesetz_dateistempel_lesen') {
      await native.ordnerLesen('gesetze');
      return nativeGesetzDateistempel();
    }
    const antwort = invoke(command, args);
    if (command === 'interne_navigation_lesen' && !wartet && pruefen()) {
      wartet = true;
      await gate.promise;
    }
    return antwort;
  });
  return { ...gate, wartet: () => wartet };
}
function bereiteImportVor(art: 'Erfolg' | 'Fehler' = 'Erfolg') {
  native.indexLaden.mockResolvedValue({
    'de-bund': [{ kurztitel: 'BGB', langtitel: 'Test', abrufkennung: 'bgb.xml' }],
    'de-bw': [],
    eu: [],
  });
  native.importieren.mockResolvedValue({
    erfolgreiche: art === 'Erfolg' ? [installiert('BGB')] : [],
    fehlgeschlagene: [{ fehler: { meldung: 'Alter Importfehler' } }],
  });
}
it('verwirft die letzte alte Aktualitätsantwort nach abgeschlossenem BGB-Import und echtem Konfliktklick', async () => {
  bereiteImportVor();
  const antwort = halteAntwort(() => native.importieren.mock.calls.length === 1);
  await senden(oeffnenLink('1 BGB'));
  await rendern(true);
  await abwarten(() => expect(antwort.wartet()).toBe(true));
  expect(native.importieren).toHaveResolved();
  const zeilenContainer = document.createElement('div');
  const zeilenRoot = createRoot(zeilenContainer);
  try {
    const zeile = await konfliktZeile(true, zeilenRoot, zeilenContainer);
    await act(async () => zeile.click());
  } finally {
    await act(async () => zeilenRoot.unmount());
  }
  await act(async () => antwort.fertig());
  await abwarten(() => expect(native.auftrag).toBeNull());
  expect(verlauf()).toEqual([verlaufZiel('X', 'ueberschrift:010', 'de-bund')]);
  expect(
    zustand.tabs.flatMap((tab) =>
      zustand.holeTabGesetz(tab) ? [geladenesTabGesetz(zustand, tab).kurztitel] : [],
    ),
  ).toEqual(['X']);
  expect(native.suchfehler).not.toHaveBeenCalled();
});
it.each([
  [norm('1'), ueberschrift, 'ueberschrift:010'],
  [ueberschrift, norm('1010'), 'p1010'],
  [oeffnenLink('1 X'), oeffnenLink('1010 X'), 'p1010'],
  [norm('1'), oeffnenLink('1010 X'), 'p1010'],
  [oeffnenLink('1 X'), ueberschrift, 'ueberschrift:010'],
] as const)('verwirft die letzte Antwort bei Ablösung %j durch %j', async (alt, neu, xmlId) => {
  // Erstes Lesen, Prüfung vor/nach Anzeigen und Zielprüfung; Öffnen-Links
  // prüfen zusätzlich nach Vorbereitung und unmittelbar vor der Trefferwahl.
  const antwort = halteAntwort(
    () => native.lesenBegonnen.mock.calls.length === ('type' in alt ? 6 : 4),
  );
  await senden(alt);
  await rendern();
  await abwarten(() => expect(antwort.wartet()).toBe(true));
  expect(verlauf()).toEqual([]);
  await senden(neu);
  await act(async () => antwort.fertig());
  await abwarten(() => expect(native.auftrag).toBeNull());
  expect(verlauf()).toEqual([
    { gesetzesreferenz: { kurztitel: 'X', normgeber: 'de-bund' }, xmlId },
  ]);
  expect(native.oeffnen).toHaveBeenCalledOnce();
  expect(native.oeffnen).toHaveBeenCalledWith(
    expect.objectContaining(
      'ziel' in neu && neu.ziel.type === 'norm' ? { bezeichnung: neu.ziel.bezeichnung } : { xmlId },
    ),
  );
  expect(native.suchfehler).not.toHaveBeenCalled();
});
it.each(['Importfehler', 'Leertreffer'] as const)(
  'zeigt nach Ablösung während letzter Antwort kein altes %s-Overlay',
  async (art) => {
    if (art === 'Importfehler') bereiteImportVor('Fehler');
    let pruefungen = 0;
    const antwort = halteAntwort(
      () =>
        (art === 'Importfehler'
          ? native.importieren.mock.calls.length > 0
          : native.indexLaden.mock.calls.length > 0) && ++pruefungen === 2,
    );
    await senden(oeffnenLink('1 BGB'));
    await rendern(true);
    await abwarten(() => expect(antwort.wartet()).toBe(true));
    await senden(ueberschrift);
    await act(async () => antwort.fertig());
    await abwarten(() => expect(native.auftrag).toBeNull());
    expect(verlauf()).toEqual([verlaufZiel('X', 'ueberschrift:010', 'de-bund')]);
    expect(native.suchfehler).not.toHaveBeenCalled();
  },
);
it.each(['Erfolg', 'Fehler'] as const)(
  'führt trotz doppelter Benachrichtigungen während Import und letzter Antwort nur einmal aus (%s)',
  async (art) => {
    bereiteImportVor(art);
    const importGate = sperre();
    const importieren = native.importieren.getMockImplementation()!;
    let importAbgeschlossen = false;
    native.importieren.mockImplementation(async (...args: unknown[]) => {
      await importGate.promise;
      const ergebnis = await importieren(...args);
      importAbgeschlossen = true;
      return ergebnis;
    });
    let pruefungen = 0;
    const antwort = halteAntwort(
      () => importAbgeschlossen && ++pruefungen === (art === 'Erfolg' ? 1 : 2),
    );
    await senden(oeffnenLink('1 BGB'));
    await rendern(true);
    await abwarten(() => expect(native.importieren).toHaveBeenCalledOnce());
    await act(async () => {
      wecken();
      wecken();
      importGate.fertig();
    });
    await abwarten(() => expect(antwort.wartet()).toBe(true));
    const wiederholung = halteAntwort(() => true);
    await act(async () => {
      wecken();
      wecken();
      antwort.fertig();
    });
    await abwarten(() => expect(wiederholung.wartet()).toBe(true));
    expect(native.oeffnen).not.toHaveBeenCalled();
    expect(native.suchfehler).not.toHaveBeenCalled();
    expect(native.importieren).toHaveBeenCalledOnce();
    await act(async () => wiederholung.fertig());
    await abwarten(() => expect(native.auftrag).toBeNull());
    expect(native.importieren).toHaveBeenCalledOnce();
    if (art === 'Erfolg') {
      expect(verlauf()).toEqual([verlaufZiel('BGB', 'p1', 'de-bund')]);
      expect(native.oeffnen).toHaveBeenCalledOnce();
      expect(native.suchfehler).not.toHaveBeenCalled();
    } else {
      expect(verlauf()).toEqual([]);
      expect(native.suchfehler).toHaveBeenCalledOnce();
      expect(native.suchfehler).toHaveBeenCalledWith({
        suchtext: '1 BGB',
        meldung: 'Alter Importfehler',
        ohneAktivesGesetz: true,
      });
    }
  },
);
it.each(['Erfolg', 'Fehler'] as const)(
  'verhindert nach Fensterzerstörung während wiederholter Aktualitätsabfrage späte Wirkung (%s)',
  async (art) => {
    bereiteImportVor(art);
    let pruefungen = 0;
    const erste = halteAntwort(
      () => native.importieren.mock.calls.length > 0 && ++pruefungen === (art === 'Erfolg' ? 1 : 2),
    );
    await senden(oeffnenLink('1 BGB'));
    await rendern(true);
    await abwarten(() => expect(erste.wartet()).toBe(true));
    const wiederholung = halteAntwort(() => true);
    await act(async () => {
      wecken();
      erste.fertig();
    });
    await abwarten(() => expect(wiederholung.wartet()).toBe(true));
    expect(verlauf()).toEqual([]);
    expect(native.suchfehler).not.toHaveBeenCalled();
    const gelesen = native.lesenBegonnen.mock.calls.length;
    await act(async () => root.unmount());
    expect(native.anmeldung).toBeNull();
    expect(native.callbacks.size).toBe(0);
    await act(async () => {
      wecken();
      wiederholung.fertig();
    });
    expect(verlauf()).toEqual([]);
    expect(native.suchfehler).not.toHaveBeenCalled();
    expect(native.lesenBegonnen).toHaveBeenCalledTimes(gelesen);
    expect(native.auftrag).not.toBeNull();
    expect(native.importieren).toHaveBeenCalledOnce();
  },
);

it('wählt beim Zuklappen auch den gesetzesweiten Titeldateikonflikt ab', async () => {
  const auswaehlen = vi.fn();
  const aufklappen = vi.fn();
  await act(async () =>
    root.render(
      <GesetzZeile
        gesetz={{ gesetz: ref, eintraege: [], nichtamtlicheTitelXmlFehlt: true }}
        aufgeklappt
        onAufgeklapptAendern={aufklappen}
        ausgewaehlt={{ art: 'nichtamtlicheTitelXmlFehlt', gesetz: ref }}
        onAuswaehlen={auswaehlen}
      />,
    ),
  );
  const kopf = [...container.querySelectorAll('div')].find(
    (el) => el.style.cursor === 'pointer' && el.textContent === ref.kurztitel,
  )!;
  await act(async () => kopf.click());
  expect(auswaehlen).toHaveBeenCalledExactlyOnceWith(null);
  expect(aufklappen).toHaveBeenCalledExactlyOnceWith(ref, false);
});

it('trennt zwei Markierungen jeweils einmal und ihre eigenen/Zielkonflikte niemals', async () => {
  const eintrag: AnzeigeKonfliktEintrag = {
    schluessel: 'mehrere',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    bezeichnungAnzeige: '§ 1',
    markierungstyp: 'verweismarkierung',
    eigenerKonflikt: 'bezugstextFehltOderUnpassend',
    zielKonflikte: [
      {
        typ: 'zielNormUnpassend',
        gesetz: ref,
        bezeichnungenAnzeige: [{ bezeichnung: '§ 2' }],
      },
      {
        typ: 'zielNormFehlt',
        gesetz: { kurztitel: 'StGB', normgeber: 'de-bund' },
        bezeichnungenAnzeige: [{ bezeichnung: '§ 3' }],
      },
    ],
  };
  const auswaehlen = vi.fn();
  await act(async () =>
    root.render(
      <GesetzZeile
        gesetz={{ gesetz: ref, eintraege: [eintrag, { ...eintrag, schluessel: 'zweite' }] }}
        aufgeklappt
        onAufgeklapptAendern={vi.fn()}
        ausgewaehlt={null}
        onAuswaehlen={auswaehlen}
      />,
    ),
  );
  expect(
    [...container.querySelectorAll('div')].filter(
      (el) => el.style.borderTop === '1px solid var(--trenner-ebene)',
    ),
  ).toHaveLength(2);
  const gruppen = [...container.querySelectorAll('ul')];
  expect(gruppen).toHaveLength(2);
  for (const [index, gruppe] of gruppen.entries()) {
    expect(gruppe.querySelectorAll('li')).toHaveLength(3);
    for (const punkt of gruppe.querySelectorAll('li')) {
      await act(async () => (punkt.querySelector('[title]') as HTMLElement).click());
      expect(auswaehlen).toHaveBeenLastCalledWith(
        expect.objectContaining({
          art: 'zeile',
          gesetz: ref,
          eintrag: expect.objectContaining({ schluessel: index === 0 ? 'mehrere' : 'zweite' }),
        }),
      );
    }
  }
});

it.each(['vor', 'nach'] as const)(
  'zeigt den wartenden Wiederimport aus letzterTab zusätzlich zum internen Auftrag %s dem Fensterstart (kein E3)',
  async (reihenfolge) => {
    native.letzterTab = true;
    const verlauf = { eintraege: [verlaufZiel('Y', 'p1', 'de-bund')], position: 0 };
    geschlossenenTabPushen({ gesetzesreferenz: { kurztitel: 'Y', normgeber: 'de-bund' }, verlauf });
    let fertig: ((wert: unknown) => void) | undefined;
    native.referenzImportieren.mockReturnValue(
      new Promise((resolve) => {
        fertig = resolve;
      }),
    );
    if (reihenfolge === 'vor') await senden(ueberschrift);
    await rendern(true);
    await abwarten(() => expect(gestartet).toBe(true));
    if (reihenfolge === 'nach') await senden(ueberschrift);
    await abwarten(() => expect(native.auftrag).toBeNull());
    const stand = () =>
      zustand.tabs.map((t) => [
        t.gesetzesreferenz?.kurztitel,
        t.initialNorm,
        zustand.verlaufLesen(t.id),
      ]);
    const linkziel = [
      'X',
      'ueberschrift:010',
      { eintraege: [verlaufZiel('X', 'ueberschrift:010', 'de-bund')], position: 0 },
    ];
    // Das Linkziel belegt den leeren Starttab, solange der Import wartet.
    expect(stand()).toEqual([linkziel]);
    await abwarten(() => expect(native.referenzImportieren).toHaveBeenCalledOnce());
    native.dateien.set('gesetze/Y_de-bund.xml', xml('Y'));
    const gesetz = { kurztitel: 'Y', normgeber: 'de-bund' };
    const bestand = { liste: [], befunde: [], ordnerLesbar: true };
    assert(fertig);
    const abschliessen = fertig;
    await act(async () =>
      abschliessen({ art: 'erfolg', gesetz, bestandspruefung: bestand, ladeabschluss: bestand }),
    );
    // Die Wiederherstellung erscheint als eigener Tab mit ihrem Verlauf.
    await abwarten(() => expect(stand()).toEqual([linkziel, ['Y', 'p1', verlauf]]));
    expect(native.referenzImportieren).toHaveBeenCalledOnce();
  },
);
