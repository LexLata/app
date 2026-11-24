import { richteNativeEreignisgrenzeEin } from '@/test/start/nativeEreignisgrenze';
import { referenzVon } from '@/lib/domain/gesetzesreferenz';
vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => {}, emitTo: async () => {} }));
// useGesetzOeffnen.uebertragung.test.tsx
// Echte Tabs, Resolver, Ladeabschlüsse und Referenzimporte durch beide
// Fensterempfänger. Dateizugriff, Netz, BW-Download und native IPC sind simuliert;
// Wartefunktion, Referenzimport und BW-Importweg bleiben echt.
import { gesetzOeffnenFixture } from '@/test/hauptfenster/gesetzOeffnenFixture';
import { tabVerlaeufeLesen } from '@/test/hauptfenster/tabVerlaeufeLesen';
import { gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import { verweisziel } from '@/test/markierungen/verweiszielFabrik';
import { dateiBasis } from '@/lib/persistenz/kern/kern.index';
import { act, createElement, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, assert, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { TabUebertragung } from '@/lib/domain/appTypes';
import { useAppTabs } from './useAppTabs';
import { useGesetzOeffnen } from './useGesetzOeffnen';
import { useFensterUebertragung } from '@/hooks/fenster/useFensterUebertragung';
import { useFensterstartInitialisierung } from '@/hooks/useFensterstartInitialisierung';
import { ladeGesetzBestand } from '@/test/tabs/gesetzBestandAbschluss';

import { alleBannerSchliessen, getSnapshot } from '@/lib/banner/banner.index';
import { einzelzugriffFuerTest } from '@/test/tabs/einzelzugriffFuerTest';

const mocks = vi.hoisted(() => ({
  lesen: vi.fn(),
  importauftrag: vi.fn(),
  invoke: vi.fn(),
  empfaenger: null as (() => Promise<void>) | null,
  uebertragung: null as TabUebertragung | null,
}));
vi.mock('@/lib/import/import.index', async (importOriginal) => {
  const echt = await importOriginal<typeof import('@/lib/import/import.index')>();
  return {
    ...echt,
    synchronisiereStartupImportindizes: async () => {},
  };
});
// Echter Importweg bis zur nativen Grenze: Importindex aus AppData, Netz und Speichern ersetzt.
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: async () => ({ ok: true }) }));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
  resolveResource: async (pfad: string) => pfad,
}));
// TestG steht nur im BW-Importindex; der Bundesindex ist leer, die Europa-Liste ebenfalls.
const IMPORTINDIZES: Record<string, string> = {
  'importindizes/de-bw.xml':
    '<importindex version="1"><infos><verarbeitungszeit>2026-10-26T00:00:00Z</verarbeitungszeit><normgeber>de-bw</normgeber><datenquelle name="landesrecht-bw.de"/></infos><inhalt><gesetz><kurztitel>TestG</kurztitel><langtitel>Testgesetz</langtitel><abrufkennung>TestG</abrufkennung></gesetz></inhalt></importindex>',
  'importindizes/de-bund.xml':
    '<importindex version="1"><infos><verarbeitungszeit>2026-10-26T00:00:00Z</verarbeitungszeit><normgeber>de-bund</normgeber><datenquelle name="gesetze-im-internet.de"/></infos><inhalt></inhalt></importindex>',
  'resources/europa/europaKuratiert.json': '[]',
};
const ressource = (pfad: string) => Object.keys(IMPORTINDIZES).find((name) => pfad.endsWith(name));
const BW_HTML =
  '<html><head><title>Landesrecht BW - TestG | Landesnorm Baden-Württemberg | Gesamtausgabe | Testgesetz (TestG) vom 1. Januar 2000</title><meta charset="utf-8"></head><body><div class="docLayoutText"><h4 style="font-family: Arial">§ 9 Titel</h4><p>Ein erster Satz.</p></div></body></html>';
// Prüfbedarf-Empfänger der Markierungen ist hier nicht gestartet.
vi.mock('@/lib/persistenz/kern/kern.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/kern/kern.index')>()),
  merkePruefpflichtigeAenderungVor: async () => 'vorgang',
  schliessePruefpflichtigeQuelleAb: async () => true,
}));
// Übrige AppData-Dateien (etwa das Suchverzeichnis) bleiben im Testlauf flüchtig erhalten.
const appDaten = vi.hoisted(() => new Map<string, string>());
const relativ = (pfad: string) => pfad.replace('/daten/LexLata/', '');
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: async (pfad: string) => ressource(pfad) !== undefined || appDaten.has(relativ(pfad)),
  mkdir: async () => {},
  readDir: async () => [],
  readTextFile: async (pfad: string) => {
    const name = ressource(pfad);
    if (name) return IMPORTINDIZES[name];
    const gespeichert = appDaten.get(relativ(pfad));
    if (gespeichert !== undefined) return gespeichert;
    // Der Suchverzeichnisabgleich des Imports liest den Gesetzesbestand als XML.
    const gesetz = dateien.find((g) => pfad.endsWith(`gesetze/${dateiBasis(g)}.xml`));
    if (gesetz) return gesetzesXML(gesetz);
    throw new Error('fehlt');
  },
}));
function gesetzesXML(gesetz: GesetzDarstellung): string {
  const normen = gesetz.elemente
    .flatMap((e) => (e.typ === 'norm' ? [e.data] : []))
    .map((n) => `<norm id="${n.xmlId}"><bezeichnung>${n.bezeichnung}</bezeichnung></norm>`);
  return `<gesetz><infos><kurztitel>${gesetz.kurztitel}</kurztitel><langtitel>${gesetz.langtitel}</langtitel><normgeber>${gesetz.normgeber}</normgeber></infos><inhalt>${normen.join('')}</inhalt></gesetz>`;
}
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/gesetz/gesetz.index')>()),
  ladeAlleGesetze: mocks.lesen,
  leseGesetz: (ref: Gesetzesreferenz) => einzelzugriffFuerTest(ladeGesetzBestand)(ref),
  hatNormenOhneTitel: () => false,
  synchronisiereNichtamtlicheTitelFuerGesetze: async () => false,
}));
vi.mock('@/lib/markierungen/markierungen.index', () => ({
  pruefeMarkierungenBeimStart: async () => {},
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('@/lib/plattform/tauriHelpers', async (original) => ({
  ...(await original<typeof import('@/lib/plattform/tauriHelpers')>()),
  menuItemAktivieren: async () => {},

  letzterTabAnfrageLesen: async () => false,
  fensterVordergrundHolen: async () => {},
}));
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    listen: async (_name: string, empfaenger: () => Promise<void>) => {
      if (_name === 'tab-uebertragung-eingefuegt') mocks.empfaenger = empfaenger;
      return () => {};
    },
  }),
}));
function gesetz(normgeber: string, bezeichnungen = ['§ 90', '§ 9']): GesetzDarstellung {
  return gesetzMitNormen(bezeichnungen, {
    normgeber,
    langtitel: 'Testgesetz',
    kennung: (i) => `n${i}`,
  });
}
function spaeter<T>() {
  let fertig!: (wert: T) => void;
  const promise = new Promise<T>((resolve) => {
    fertig = resolve;
  });
  return { promise, fertig };
}
const ausgang = gesetz('de-bund', ['§ 1']);
const ziel = gesetz('de-bw');
const roots: Root[] = [];
let dateien: GesetzDarstellung[];
let gesperrt: boolean;
let downloads: number;
let download: ReturnType<typeof spaeter<void>>;
let lesefehler: boolean;
type Fenster = {
  tabs: ReturnType<typeof useAppTabs>;
  navigation: ReturnType<typeof useGesetzOeffnen>;
  laden: typeof ladeGesetzBestand;
};
async function starten(art: 'quelle' | 'bestehend' | 'neu', laden?: typeof ladeGesetzBestand) {
  const fenster = { laden } as Fenster;
  function TestFenster() {
    const tabs = useAppTabs();
    const gesetzeRef = useRef(art === 'quelle' ? [ausgang] : []);
    const navigation = useGesetzOeffnen({
      ...gesetzOeffnenFixture(tabs, gesetzeRef.current),

      ladeGesetz: einzelzugriffFuerTest(fenster.laden ?? ladeGesetzBestand),
    });
    Object.assign(fenster, { tabs, navigation });
    return art === 'quelle' ? null : createElement(Empfaenger, { tabs, navigation, gesetzeRef });
  }
  function Empfaenger({
    tabs,
    navigation,
  }: {
    tabs: Fenster['tabs'];
    navigation: Fenster['navigation'];
    gesetzeRef: React.RefObject<GesetzDarstellung[]>;
  }) {
    useFensterUebertragung({
      tabFuerUebertragungKopieren: tabs.tabFuerUebertragungKopieren,
      tabUebertragungAbschliessen: tabs.tabUebertragungAbschliessen,
      fensterSchliessen: vi.fn(),
      tabAusUebertragungUebernehmen: tabs.tabAusUebertragungUebernehmen,
    });
    useFensterstartInitialisierung({
      ladeGesetz: tabs.ladeGesetz,
      tabAusUebertragungUebernehmen: tabs.tabAusUebertragungUebernehmen,
      tabWiederherstellen: navigation.tabWiederherstellen,
      setTabs: tabs.setTabs,
      setAktiverTabId: tabs.setAktiverTabId,
      fensterRestore: {
        initialRestore: async () => false,
        beiLadefehlerAnzeigen: async () => {},
      } as unknown as Parameters<typeof useFensterstartInitialisierung>[0]['fensterRestore'],
      leseAppStartZiel: async () => null,
      oeffneTiefenLinkZiel: () => {},
    });
    // Bestehende Fenster sind bereits gestartet, bevor die Übertragung ankommt.
    return null;
  }
  const host = document.createElement('main');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => root.render(createElement(TestFenster)));
  if (art === 'quelle')
    act(() => {
      fenster.tabs.gesetzOeffnen(ausgang, 'n0', 'aktiver-tab');
    });
  return fenster;
}
async function schritt(arbeit: () => unknown | Promise<unknown>) {
  await act(async () => {
    await arbeit();
    // Der echte Importweg lädt Netz- und Plattformmodule erst bei Bedarf.
    await vi.dynamicImportSettled();
  });
}
async function uebernehmen(quelle: Fenster, art: 'bestehend' | 'neu', vorher?: Fenster) {
  await schritt(() => {
    mocks.uebertragung = quelle.tabs.tabFuerUebertragungKopieren(
      quelle.tabs.aktiverTabIdRef.current!,
    );
    quelle.tabs.tabUebertragungAbschliessen(quelle.tabs.aktiverTabIdRef.current!);
  });
  const fenster = vorher ?? (await starten(art));
  if (art === 'bestehend') await schritt(() => mocks.empfaenger!());
  return fenster;
}
async function importAbschliessen() {
  await schritt(() => download.fertig());
  await schritt(async () => {
    vi.advanceTimersByTime(100);
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  const dom = parseHTML('<html><body></body></html>');
  vi.stubGlobal('window', dom.window);
  richteNativeEreignisgrenzeEin(mocks.invoke);
  vi.stubGlobal('document', dom.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  alleBannerSchliessen();
  dateien = [ausgang];
  appDaten.clear();
  gesperrt = false;
  downloads = 0;
  lesefehler = false;
  download = spaeter<void>();
  mocks.uebertragung = null;
  mocks.empfaenger = null;
  mocks.lesen.mockImplementation(async (melden) => {
    melden?.(
      lesefehler ? [{ status: 'unlesbar', dateiBasis: dateiBasis(ziel), fehler: '/privat' }] : [],
    );
    return dateien;
  });
  mocks.invoke.mockImplementation(async (command, args) => {
    if (command === 'gesetz_dateistempel_lesen')
      return dateien.map((g) => ({
        name: dateiBasis(g) + '.xml',
        dateistempel: { groesse: '1', aenderungszeit: '1' },
      }));
    if (command === 'gesetz_import_sperre_versuchen_zu_erhalten') {
      if (gesperrt) return false;
      gesperrt = true;
      return true;
    }
    if (command === 'gesetz_import_sperre_freigeben') gesperrt = false;
    // Jeder Importauftrag registriert genau einen manuellen Importvorgang.
    if (command === 'import_aktualisierung_starten') {
      mocks.importauftrag();
      return 'vorgang';
    }
    if (command === 'datei_sperre_erwerben') return 'token';
    if (command === 'lade_gesetz_html_bw') {
      downloads++;
      await download.promise;
      return BW_HTML;
    }
    if (command === 'atomar_datei_schreiben') {
      if (args.relativerPfad === 'gesetze/TestG_de-bw.xml') dateien = [ausgang, ziel];
      else appDaten.set(args.relativerPfad, args.inhalt);
    }
    if (command.startsWith('pruefvorgang_'))
      return { offeneQuellen: 0, offenePruefungen: 0, vollbedarf: false };
  });
});
afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it.each(['bestehend', 'neu'] as const)(
  'erhält den wartenden Import im Quelltab, wenn die Datei für das %s Fenster noch fehlt',
  async (art) => {
    const quelle = await starten('quelle');
    const vorher = art === 'bestehend' ? await starten(art) : undefined;
    await schritt(() =>
      quelle.navigation.handleVerweisKlick(
        'n0',
        verweisziel({
          typ: 'zielnormOhneElementstand',
          gesetz: ziel,
          bezeichnung: '§ 9',
          verweistextZeichenbereich: [0, 2],
        }),
        false,
      ),
    );
    const tab = quelle.tabs.tabsRef.current[0]!;
    await schritt(() => {
      mocks.uebertragung = quelle.tabs.tabFuerUebertragungKopieren(tab.id);
    });
    const empfaenger = vorher ?? (await starten(art));
    if (art === 'bestehend') await schritt(() => mocks.empfaenger!());
    // Laufende Öffnungen werden nicht übergeben; das Zielfenster zeigt das Ziel nicht.
    expect(empfaenger.tabs.tabsRef.current.some((t) => t.initialNorm === 'n1')).toBe(false);
    expect(quelle.tabs.tabsRef.current[0]).toBe(tab);
    expect(downloads).toBe(1);
    await importAbschliessen();
    expect(quelle.tabs.tabsRef.current[0]?.initialNorm).toBe('n1');
    expect(getSnapshot()).toEqual([]);
  },
);
it.each(['bestehend', 'neu'] as const)(
  'öffnet nach Übertragung des Ausgangstabs in das %s Fenster während des Imports nichts (E2)',
  async (art) => {
    const quelle = await starten('quelle');
    const vorher = art === 'bestehend' ? await starten(art) : undefined;
    await schritt(() => quelle.navigation.handleLesezeichenOeffnen('§ 9', ziel));
    await schritt(() => {
      mocks.uebertragung = quelle.tabs.tabFuerUebertragungKopieren(
        quelle.tabs.aktiverTabIdRef.current!,
      );
      quelle.tabs.tabUebertragungAbschliessen(quelle.tabs.aktiverTabIdRef.current!);
    });
    await importAbschliessen();
    const empfaenger = vorher ?? (await starten(art));
    if (vorher) await schritt(() => mocks.empfaenger!());
    const zeigtZiel = (f: Fenster) =>
      f.tabs.tabsRef.current.some((t) => f.tabs.holeTabGesetz(t) === ziel);
    // Der übertragene Tab lädt sein Gesetz im Zielfenster eigenständig nach.
    await vi.waitFor(async () => {
      await schritt(() => {});
      expect(
        empfaenger.tabs.tabsRef.current.find((t) => empfaenger.tabs.holeTabGesetz(t)),
      ).toMatchObject({ gesetzesreferenz: referenzVon(ausgang), initialNorm: 'n0' });
    });
    expect(zeigtZiel(quelle)).toBe(false);
    expect(zeigtZiel(empfaenger)).toBe(false);
    // Der Import läuft trotzdem zu Ende.
    expect(downloads).toBe(1);
    expect(dateien).toContain(ziel);
    expect(getSnapshot()).toEqual([]);
  },
);
it.each(['navigation', 'schliessen'] as const)(
  'erhält %s im Ziel vor dem verspäteten fremden Abschluss und alten Timer',
  async (aktion) => {
    const quelle = await starten('quelle');
    await schritt(() =>
      quelle.navigation.handleVerweisKlick(
        'n0',
        verweisziel({
          typ: 'zielnormOhneElementstand',
          gesetz: ziel,
          bezeichnung: '§ 9',
          verweistextZeichenbereich: [0, 2],
        }),
        false,
      ),
    );
    act(() =>
      quelle.tabs.verlaufAktivierung(
        quelle.tabs.aktiverTabIdRef.current!,
        { gesetzesreferenz: ausgang, xmlId: 'n0' },
        'schritt',
      ),
    );
    const empfaenger = await uebernehmen(quelle, 'neu');
    const id = empfaenger.tabs.aktiverTabIdRef.current!;
    await schritt(() => {
      if (aktion === 'schliessen') empfaenger.tabs.tabSchliessen(id);
      else
        empfaenger.navigation.elementOeffnen({
          gesetz: ausgang,
          xmlId: 'n0',
          modus: 'immer-aktiver-tab',
        });
    });
    const stand = structuredClone(tabVerlaeufeLesen(empfaenger.tabs));
    const tabstand = structuredClone(empfaenger.tabs.tabsRef.current);
    await importAbschliessen();
    await schritt(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(empfaenger.tabs.tabsRef.current).toEqual(tabstand);
    expect(tabVerlaeufeLesen(empfaenger.tabs)).toEqual(stand);
    expect(tabVerlaeufeLesen(quelle.tabs)).toEqual({});
    expect(getSnapshot()).toEqual([]);
    expect(downloads).toBe(1);
  },
);
it('wiederholt nach regulärem Ladebefund im Ausgangstab ohne erneuten Import', async () => {
  const quelle = await starten('quelle');
  const id = quelle.tabs.aktiverTabIdRef.current;
  await schritt(() => quelle.navigation.handleLesezeichenOeffnen('§ 9', ziel));
  lesefehler = true;
  await importAbschliessen();
  expect(getSnapshot()[0]).toMatchObject({
    laedt: false,
    text: 'Das Gesetz konnte nicht verlässlich geladen werden.',
  });
  expect(quelle.tabs.holeTabGesetz(quelle.tabs.tabsRef.current[0])).toBe(ausgang);
  const wiederholen = getSnapshot()[0]!.aktion!.onClick;
  lesefehler = false;
  await schritt(wiederholen);
  expect(quelle.tabs.tabsRef.current.find((t) => t.id === id)).toMatchObject({
    gesetzesreferenz: referenzVon(ziel),
    initialNorm: 'n1',
  });
  expect(downloads).toBe(1);
  expect(getSnapshot()).toEqual([]);
});
it('ignoriert den wiederholten Klick während verspäteter Prüfung und importiert einmal (E4)', async () => {
  const quelle = await starten('quelle');
  const ersterBestand = spaeter<Awaited<ReturnType<typeof ladeGesetzBestand>>>();
  quelle.laden = vi
    .fn()
    .mockReturnValueOnce(ersterBestand.promise)
    .mockImplementation(ladeGesetzBestand);
  act(() => quelle.tabs.setTabs([...quelle.tabs.tabsRef.current]));
  const referenz = verweisziel({
    typ: 'zielnormOhneElementstand',
    gesetz: ziel,
    bezeichnung: '§ 9',
    verweistextZeichenbereich: [0, 2] as [number, number],
  });
  await schritt(() => quelle.navigation.handleVerweisKlick('n0', referenz, true));
  await schritt(() => quelle.navigation.handleVerweisKlick('n0', referenz, true));
  expect(quelle.tabs.tabsRef.current).toHaveLength(1);
  await schritt(() => ersterBestand.fertig({ liste: [ausgang], befunde: [], ordnerLesbar: true }));
  await importAbschliessen();
  expect(downloads).toBe(1);
  expect(mocks.importauftrag).toHaveBeenCalledTimes(1);
  const zieltabs = quelle.tabs.tabsRef.current.filter((t) => quelle.tabs.holeTabGesetz(t) === ziel);
  expect(zieltabs.map((t) => t.initialNorm)).toEqual(['n1']);
  expect(quelle.tabs.verlaufLesen(zieltabs[0]!.id)?.eintraege).toEqual([
    { gesetzesreferenz: { kurztitel: 'TestG', normgeber: 'de-bw' }, xmlId: 'n1' },
  ]);
});

it.each(['ordner', 'ziel', 'wurf'] as const)(
  'öffnet mit echtem Ladevertrag keinen Altbestand nach anfänglichem Lesefehler %s',
  async (art) => {
    const quelle = await starten('quelle');
    mocks.lesen.mockImplementation(async (melden) => {
      if (art === 'wurf') throw new Error('/privater/pfad');
      melden?.(
        art === 'ordner'
          ? [{ status: 'ordner_unlesbar', fehler: 'intern' }]
          : [{ status: 'unlesbar', dateiBasis: dateiBasis(ausgang), fehler: 'intern' }],
      );
      return [ausgang];
    });
    await schritt(() => quelle.navigation.handleLesezeichenOeffnen('§ 9', ausgang));
    expect(mocks.importauftrag).not.toHaveBeenCalled();
    expect(quelle.tabs.holeTabGesetz(quelle.tabs.tabsRef.current[0])).toBe(ausgang);
    expect(tabVerlaeufeLesen(quelle.tabs)).toEqual({});
    expect(getSnapshot()[0]).toMatchObject({
      laedt: false,
      text: 'Das Gesetz konnte nicht verlässlich geladen werden.',
    });
    expect(getSnapshot()[0]?.aktion?.label).toBe('Erneut versuchen');
    const frisch = gesetz('de-bund', ['§ 9']);
    mocks.lesen.mockImplementation(async (melden) => {
      melden?.([]);
      return [frisch];
    });
    await schritt(() => getSnapshot()[0]!.aktion!.onClick());
    expect(quelle.tabs.tabsRef.current[0]).toMatchObject({
      gesetzesreferenz: referenzVon(frisch),
      initialNorm: 'n0',
    });
    expect(mocks.importauftrag).not.toHaveBeenCalled();
    expect(getSnapshot()).toEqual([]);
  },
);

it('öffnet das importierte Gesetz und meldet das fehlende Normziel', async () => {
  const quelle = await starten('quelle');
  await schritt(() => quelle.navigation.handleLesezeichenOeffnen('§ 8', ziel));
  await importAbschliessen();
  const tab = quelle.tabs.tabsRef.current[0];
  assert(tab);
  expect(quelle.tabs.holeTabGesetz(tab)).toBe(ziel);
  expect(tab.initialNorm).toBe('n0');
  expect(dateien).toContain(ziel);
  expect(getSnapshot()[0]).toMatchObject({ text: 'Norm nicht gefunden.', laedt: false });
  expect(getSnapshot()[0]?.aktion).toBeUndefined();
});

it('übergibt bei Übertragung während der Prüfung nur den Tab, nicht die laufende Öffnung (E2)', async () => {
  const quelle = await starten('quelle');
  const empfaenger = await starten('bestehend');
  dateien = [ausgang, ziel];
  const pruefung = spaeter<Awaited<ReturnType<typeof ladeGesetzBestand>>>();
  quelle.laden = vi.fn().mockReturnValue(pruefung.promise);
  act(() => {
    quelle.tabs.gesetzOeffnen(ziel, 'n0', 'immer-aktiver-tab');
  });
  await schritt(() => quelle.navigation.handleLesezeichenOeffnen('§ 9', ziel));
  await uebernehmen(quelle, 'bestehend', empfaenger);
  const uebernommen = () =>
    empfaenger.tabs.tabsRef.current.find((t) => empfaenger.tabs.holeTabGesetz(t));
  expect(uebernommen()).toMatchObject({ gesetzesreferenz: referenzVon(ziel), initialNorm: 'n0' });
  await schritt(() => pruefung.fertig({ liste: [ziel], befunde: [], ordnerLesbar: true }));
  expect(uebernommen()?.initialNorm).toBe('n0');
  expect(quelle.tabs.holeTabGesetz(quelle.tabs.tabsRef.current[0])).toBeUndefined();
  expect(mocks.importauftrag).not.toHaveBeenCalled();
  expect(getSnapshot()).toEqual([]);
});

it('öffentlicher Referenzauftrag verwendet den echten Import- und Ladevertrag', async () => {
  const fenster = await starten('quelle');
  await schritt(() =>
    fenster.navigation.gesetzesreferenzOeffnen(
      {
        gesetzesreferenz: { kurztitel: 'TestG', normgeber: 'de-bw' },
        bezeichnung: '9',
      },
      'immer-neu',
    ),
  );
  expect(downloads).toBe(1);
  // Während des Imports bleibt das bisherige Gesetz sichtbar; erst der Erfolg öffnet den Tab.
  expect(fenster.tabs.tabsRef.current).toHaveLength(1);
  await importAbschliessen();
  const tabId = fenster.tabs.aktiverTabId!;
  expect(fenster.tabs.tabsRef.current.find((t) => t.id === tabId)).toMatchObject({
    gesetzesreferenz: referenzVon(ziel),
    initialNorm: 'n1',
  });
  expect(fenster.tabs.verlaufLesen(tabId)?.eintraege).toEqual([
    { gesetzesreferenz: { kurztitel: 'TestG', normgeber: 'de-bw' }, xmlId: 'n1' },
  ]);
});
it('nicht unterstützter Normgeber wechselt im echten Referenzimport keine Quelle', async () => {
  const fenster = await starten('quelle');
  await schritt(() =>
    fenster.navigation.gesetzesreferenzOeffnen(
      { gesetzesreferenz: { kurztitel: 'TestG', normgeber: 'BY' }, bezeichnung: '9' },
      'immer-neu',
    ),
  );
  expect(mocks.importauftrag).not.toHaveBeenCalled();
  expect(getSnapshot()[0]).toMatchObject({
    text: '‚TestG‘ ist für den Import nicht verfügbar.',
    laedt: false,
  });
  expect(getSnapshot()[0]?.aktion).toBeUndefined();
  expect(fenster.tabs.tabsRef.current).toHaveLength(1);
  expect(fenster.tabs.holeTabGesetz(fenster.tabs.tabsRef.current[0])).toBe(ausgang);
});

it.each(['bestehend', 'neu'] as const)(
  'öffnet den neuen Tab trotz Übertragung des Ausgangstabs in das %s Fenster im Quellfenster (E2)',
  async (art) => {
    const quelle = await starten('quelle');
    const vorher = art === 'bestehend' ? await starten(art) : undefined;
    const pruefung = spaeter<Awaited<ReturnType<typeof ladeGesetzBestand>>>();
    quelle.laden = vi.fn().mockReturnValue(pruefung.promise);
    act(() => quelle.tabs.setTabs([...quelle.tabs.tabsRef.current]));
    await schritt(() =>
      quelle.navigation.gesetzesreferenzOeffnen(
        { gesetzesreferenz: ausgang, bezeichnung: '§ 9' },
        'immer-neu',
      ),
    );
    expect(quelle.tabs.tabsRef.current).toHaveLength(1);
    expect(getSnapshot()).toEqual([]);
    const frisch = gesetz('de-bund', ['§ 9']);
    dateien = [frisch];
    const empfaenger = await uebernehmen(quelle, art, vorher);
    await schritt(() => pruefung.fertig({ liste: [frisch], ordnerLesbar: true, befunde: [] }));
    // Das Zielfenster erhält nur den übertragenen Tab, keinen weiteren aus der Öffnung.
    expect(empfaenger.tabs.tabsRef.current).toHaveLength(art === 'bestehend' ? 2 : 1);
    const geoeffnet = quelle.tabs.tabsRef.current.find(
      (t) => quelle.tabs.holeTabGesetz(t) === frisch,
    );
    expect(geoeffnet).toMatchObject({ gesetzesreferenz: referenzVon(frisch), initialNorm: 'n0' });
    expect(quelle.tabs.verlaufLesen(geoeffnet!.id)?.eintraege).toEqual([
      { gesetzesreferenz: { kurztitel: 'TestG', normgeber: 'de-bund' }, xmlId: 'n0' },
    ]);
    expect(mocks.importauftrag).not.toHaveBeenCalled();
    expect(getSnapshot()).toEqual([]);
  },
);

describe('Fehlerbanner nach Wegfall des Ausgangstabs', () => {
  async function fehlerbannerNachOeffnung(neuerTab: boolean) {
    const quelle = await starten('quelle');
    // Zweiter Tab, damit das Schließen des Ausgangstabs das Fenster nicht leert.
    const ausgangsTabId = quelle.tabs.tabsRef.current[0]?.id;
    assert(ausgangsTabId);
    act(() => {
      quelle.tabs.erstelleLeerenTab();
    });
    act(() => quelle.tabs.setAktiverTabId(ausgangsTabId));
    await schritt(() =>
      quelle.navigation.handleVerweisKlick(
        'n0',
        verweisziel({
          typ: 'zielnormOhneElementstand',
          gesetz: ziel,
          bezeichnung: '§ 9',
          verweistextZeichenbereich: [0, 2],
        }),
        neuerTab,
      ),
    );
    lesefehler = true;
    await importAbschliessen();
    expect(getSnapshot().map((b) => b.aktion?.label)).toEqual(['Erneut versuchen']);
    return { quelle, ausgangsTabId };
  }
  async function ausgangstabEntfernen(
    quelle: Fenster,
    ausgangsTabId: string,
    weg: 'geschlossen' | 'gezogen',
  ) {
    if (weg === 'geschlossen') await schritt(() => quelle.tabs.tabSchliessen(ausgangsTabId));
    else
      await schritt(() => {
        mocks.uebertragung = quelle.tabs.tabFuerUebertragungKopieren(ausgangsTabId);
        quelle.tabs.tabUebertragungAbschliessen(ausgangsTabId);
      });
    expect(quelle.tabs.tabsRef.current.some((t) => t.id === ausgangsTabId)).toBe(false);
  }

  it.each(['geschlossen', 'gezogen'] as const)(
    'schließt das Banner der Öffnung im selben Tab, wenn der Ausgangstab %s wird',
    async (weg) => {
      const { quelle, ausgangsTabId } = await fehlerbannerNachOeffnung(false);
      await ausgangstabEntfernen(quelle, ausgangsTabId, weg);
      expect(getSnapshot()).toEqual([]);
    },
  );

  it.each(['geschlossen', 'gezogen'] as const)(
    'behält das Banner der Öffnung in neuem Tab, wenn der Ausgangstab %s wird',
    async (weg) => {
      const { quelle, ausgangsTabId } = await fehlerbannerNachOeffnung(true);
      await ausgangstabEntfernen(quelle, ausgangsTabId, weg);
      expect(getSnapshot().map((b) => b.aktion?.label)).toEqual(['Erneut versuchen']);
      // Die Wiederholung öffnet weiterhin einen neuen Tab in diesem Fenster.
      lesefehler = false;
      const wiederholen = getSnapshot()[0]?.aktion?.onClick;
      assert(wiederholen);
      await schritt(wiederholen);
      expect(quelle.tabs.tabsRef.current.some((t) => quelle.tabs.holeTabGesetz(t) === ziel)).toBe(
        true,
      );
      expect(getSnapshot()).toEqual([]);
    },
  );
});

vi.mock('@/lib/plattform/fensterUebergabe', async (original) => ({
  ...(await original<typeof import('@/lib/plattform/fensterUebergabe')>()),
  tabUebertragungAbholen: async () => {
    const wert = mocks.uebertragung;
    mocks.uebertragung = null;
    return wert;
  },
}));

// Bestehende Szenarioattrappe des früheren Sammelwegs nur im Testzugang.
vi.mock('@/test/tabs/gesetzSpeicherTestzugang', async (original) => ({
  ...(await original<typeof import('@/test/tabs/gesetzSpeicherTestzugang')>()),
  ladeAlleGesetze: mocks.lesen,
}));
