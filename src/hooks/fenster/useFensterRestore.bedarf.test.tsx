// @vitest-environment jsdom
// Sitzungsstart über echte Hooks und Persistenz, ersetzt werden nur native Grenzen.
import * as aufbau from '@/test/markierungen/markierungsZusammenspielTestAufbau';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useFensterstartInitialisierung } from '@/hooks/useFensterstartInitialisierung';
import { useTiefenLinks } from '@/hooks/useTiefenLinks';
import { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import { alleBannerSchliessen, getSnapshot, zeigeBanner } from '@/lib/banner/banner.index';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { PhysicalSize } from '@tauri-apps/api/dpi';
import * as tauriFenster from '@tauri-apps/api/window';
import { useFensterRestore } from './useFensterRestore';
import {
  speichereFensterZustand,
  ladeFensterZustand,
} from '@/lib/persistenz/fenster/fenster.index';

const fensterNativ = vi.hoisted(() => ({
  show: vi.fn(async () => {}),
  position: vi.fn(async () => {}),
  groesse: vi.fn(async () => {}),
  schliessen: vi.fn(async () => () => {}),
  links: vi.fn(async (): Promise<string[] | null> => null),
  transport: ((): string | null => null)(),
}));
vi.mock('@tauri-apps/plugin-deep-link', () => ({ getCurrent: fensterNativ.links }));
let startAbgeschlossen = false;
let ersteTitel: string[];
let tabs: ReturnType<typeof useAppTabs>;
let restore: ReturnType<typeof useFensterRestore>;
let root: Root;
function useFensterTest() {
  const appTabs = useAppTabs();
  const fensterRestore = useFensterRestore(
    appTabs.tabs,
    appTabs.aktiverTabId,
    appTabs.tabsRef,
    appTabs.aktiverTabIdRef,
    appTabs.verlaufLesen,
    appTabs.verlaufSetzen,
    appTabs.uebernehmeTabGesetz,
  );
  const geladen = appTabs.holeTabGesetz(appTabs.tabs.find((t) => t.id === appTabs.aktiverTabId));
  const titel = geladen?.elemente[0]?.data.titel;
  useEffect(() => {
    tabs = appTabs;
    restore = fensterRestore;
    if (geladen) ersteTitel.push(titel ?? '');
  });
  return { titel, appTabs, fensterRestore };
}
function Fenster() {
  return <article>{useFensterTest().titel}</article>;
}
function StartFenster() {
  const { titel, appTabs, fensterRestore } = useFensterTest();
  const oeffnung = useGesetzOeffnen({ ...appTabs, verlaufFristStoppen: () => {} });
  const links = useTiefenLinks({
    gesetze: [],
    elementOeffnen: oeffnung.elementOeffnen,
    gesetzesreferenzOeffnen: oeffnung.gesetzesreferenzOeffnen,
  });
  const { startAbgeschlossen: abgeschlossen } = useFensterstartInitialisierung({
    ...appTabs,
    tabWiederherstellen: oeffnung.tabWiederherstellen,
    fensterRestore,
    ...links,
  });
  useEffect(() => {
    startAbgeschlossen = abgeschlossen;
  });
  return <article>{titel}</article>;
}
function gesetzXML(titel: string) {
  return `<gesetz version="1"><infos><kurztitel>${titel}</kurztitel><langtitel>${titel}</langtitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><titel>Erste Norm</titel><text><absatz><satz>Inhalt.</satz></absatz></text></norm></inhalt></gesetz>`;
}
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  aufbau.bereiteNativeAttrappeVor();
  alleBannerSchliessen();
  fensterNativ.links.mockResolvedValue(null);
  fensterNativ.transport = null;
  startAbgeschlossen = false;
  const ursprung =
    aufbau.native.invoke.getMockImplementation() ??
    (async () => {
      throw Error('Native Testgrenze nicht vorbereitet');
    });
  aufbau.native.invoke.mockImplementation(async (name, args) => {
    if (name === 'tab_uebertragung_abholen') return fensterNativ.transport;
    if (name === 'letzter_tab_anfrage_lesen') return false;
    if (['interne_navigation_anzeigen', 'geschlossene_tabs_menu_status'].includes(name))
      return false;
    return ursprung(name, args);
  });
  const ursprungsFenster = tauriFenster.getCurrentWindow();
  vi.spyOn(tauriFenster, 'getCurrentWindow').mockImplementation(() =>
    Object.assign(ursprungsFenster, {
      label: aufbau.native.label,
      onCloseRequested: fensterNativ.schliessen,
      show: fensterNativ.show,
      center: async () => {},
      unmaximize: async () => {},
      setPosition: fensterNativ.position,
      setSize: fensterNativ.groesse,
      innerSize: async () => new PhysicalSize(800, 600),
      isFullscreen: async () => true,
      onResized: async () => () => {},
      onMoved: async () => () => {},
    }),
  );
  ersteTitel = [];
  root = createRoot(document.createElement('main'));
  await act(async () => root.render(<Fenster />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each(['fehlt', 'leer', 'gelöscht'] as const)(
  'lädt nur Tab-Gesetze ohne Suchverzeichnis (%s)',
  async (verzeichnis) => {
    for (const titel of ['BGB', 'StGB', 'Unbenutzt'])
      aufbau.native.texte.set(aufbau.basis + `gesetze/${titel}_de-bund.xml`, gesetzXML(titel));
    if (verzeichnis === 'leer')
      aufbau.native.texte.set(aufbau.basis + 'cache/suchverzeichnis.json', '');
    else aufbau.native.texte.delete(aufbau.basis + 'cache/suchverzeichnis.json');
    speichereFensterZustand('main', {
      geometrie: { breite: 810, hoehe: 620, x: 30, y: 40, maximiert: false },
      tabs: ['BGB', 'StGB'].map((kurztitel) => ({
        gesetzesreferenz: { kurztitel, normgeber: 'de-bund' },
      })),
      aktiverIndex: 1,
    });
    const kurzbefehlPfad = aufbau.basis + 'einstellungen/gesetzeskurzbefehle.xml';
    const kurzbefehle = '<gesetzeskurzbefehle version="1"/>';
    aufbau.native.texte.set(kurzbefehlPfad, kurzbefehle);
    const fs = await import('@tauri-apps/plugin-fs');
    const lesen = vi.spyOn(fs, 'readTextFile');
    await act(async () => {
      await restore.initialRestore(tabs.ladeGesetz, tabs.setTabs, tabs.setAktiverTabId);
    });
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(tabs.tabs.every((t) => t.ladezustand === 'geladen')).toBe(true);
    });
    expect(tabs.tabs.map((t) => t.gesetzesreferenz?.kurztitel)).toEqual(['BGB', 'StGB']);
    expect(tabs.aktiverTabId).toBe(tabs.tabs[1]?.id);
    expect(fensterNativ.groesse).toHaveBeenCalledWith(
      expect.objectContaining({ width: 810, height: 620 }),
    );
    expect(fensterNativ.position).toHaveBeenCalledWith(expect.objectContaining({ x: 30, y: 40 }));
    expect(
      lesen.mock.calls.filter(([p]) => String(p).includes('/gesetze/')).map(([p]) => p),
    ).toEqual([
      aufbau.basis + 'gesetze/StGB_de-bund.xml',
      aufbau.basis + 'gesetze/BGB_de-bund.xml',
    ]);
    expect(lesen.mock.calls.some(([p]) => String(p).endsWith('suchverzeichnis.json'))).toBe(false);
    expect(aufbau.native.texte.get(kurzbefehlPfad)).toBe(kurzbefehle);
  },
);

function speichereTabs(titel: string[], label = 'main') {
  speichereFensterZustand(label, {
    tabs: titel.map((kurztitel) => ({ gesetzesreferenz: { kurztitel, normgeber: 'de-bund' } })),
    aktiverIndex: 0,
  });
}
async function wiederherstellen() {
  await act(async () => {
    await restore.initialRestore(tabs.ladeGesetz, tabs.setTabs, tabs.setAktiverTabId);
  });
}
it.each(['main', 'nebenfenster'])(
  'erhält den aktiven Tab in %s beim Weglassen einer davor fehlenden Referenz',
  async (label) => {
    aufbau.native.label = label;
    speichereFensterZustand(label, {
      tabs: ['Fehlt', 'BGB', 'StGB'].map((kurztitel) => ({
        gesetzesreferenz: { kurztitel, normgeber: 'de-bund' },
      })),
      aktiverIndex: 1,
    });
    for (const titel of ['BGB', 'StGB'])
      aufbau.native.texte.set(aufbau.basis + `gesetze/${titel}_de-bund.xml`, gesetzXML(titel));
    const fs = await import('@tauri-apps/plugin-fs');
    const lesen = vi.spyOn(fs, 'readTextFile');
    await wiederherstellen();
    const aktiv = tabs.tabs.find((tab) => tab.id === tabs.aktiverTabId);
    expect(aktiv?.gesetzesreferenz?.kurztitel).toBe('BGB');
    expect(tabs.holeTabGesetz(aktiv)?.kurztitel).toBe('BGB');
    expect(lesen.mock.calls.filter(([pfad]) => String(pfad).includes('/gesetze/'))[0]?.[0]).toBe(
      aufbau.basis + 'gesetze/BGB_de-bund.xml',
    );
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(tabs.tabs.every((tab) => tab.ladezustand === 'geladen')).toBe(true);
    });
  },
);
it('lässt nachweislich fehlende Referenzen still aus und erhält unlesbare Dateien als Tab', async () => {
  speichereTabs(['Fehlt', 'Defekt']);
  aufbau.native.texte.set(aufbau.basis + 'gesetze/Defekt_de-bund.xml', '<defekt>');
  const fs = await import('@tauri-apps/plugin-fs');
  const lesen = vi.spyOn(fs, 'readTextFile');
  await wiederherstellen();
  expect(tabs.tabs.map((t) => [t.gesetzesreferenz?.kurztitel, t.ladezustand])).toEqual([
    ['Defekt', 'nicht-lesbar'],
  ]);
  expect(lesen.mock.calls.some(([p]) => String(p).includes('Fehlt_'))).toBe(false);
});
it('erhält bei unlesbarem Ordner alle Referenzen', async () => {
  speichereTabs(['BGB', 'StGB']);
  const ursprung =
    aufbau.native.invoke.getMockImplementation() ??
    (async () => {
      throw Error('Native Testgrenze nicht vorbereitet');
    });
  aufbau.native.invoke.mockImplementation(async (name, args) => {
    if (name === 'gesetz_dateistempel_lesen') throw new Error('Ordner unlesbar');
    return ursprung(name, args);
  });
  await wiederherstellen();
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(tabs.tabs.every((t) => t.ladezustand === 'nicht-lesbar')).toBe(true);
  });
  expect(tabs.tabs.map((t) => t.gesetzesreferenz?.kurztitel)).toEqual(['BGB', 'StGB']);
});
it('übernimmt in main nur ohne erhaltene eigene Referenz den alphabetisch ersten fremden Inhalt', async () => {
  speichereTabs(['Fehlt']);
  speichereTabs(['StGB'], 'z-fenster');
  speichereTabs(['BGB'], 'a-fenster');
  for (const titel of ['BGB', 'StGB'])
    aufbau.native.texte.set(aufbau.basis + `gesetze/${titel}_de-bund.xml`, gesetzXML(titel));
  await wiederherstellen();
  expect(tabs.tabs.map((tab) => tab.gesetzesreferenz?.kurztitel)).toEqual(['BGB']);
  expect(ladeFensterZustand('a-fenster')).toBeNull();
  expect(ladeFensterZustand('main')?.tabs.map((tab) => tab.gesetzesreferenz.kurztitel)).toEqual([
    'BGB',
  ]);
  expect(aufbau.native.invoke).toHaveBeenCalledWith('fenster_oeffnen_mit_label', {
    label: 'z-fenster',
    geometrie: null,
  });
});
it('erhält main bei unbekannter eigener Existenz statt einen fremden Inhalt zu übernehmen', async () => {
  speichereTabs(['BGB']);
  speichereTabs(['StGB'], 'anderes');
  const ursprung =
    aufbau.native.invoke.getMockImplementation() ??
    (async () => {
      throw Error('Native Testgrenze nicht vorbereitet');
    });
  aufbau.native.invoke.mockImplementation(async (name, args) => {
    if (name === 'gesetz_dateistempel_lesen') throw Error('Ordner unlesbar');
    return ursprung(name, args);
  });
  await wiederherstellen();
  expect(tabs.tabs.map((tab) => [tab.gesetzesreferenz?.kurztitel, tab.ladezustand])).toEqual([
    ['BGB', 'nicht-lesbar'],
  ]);
  expect(ladeFensterZustand('anderes')?.tabs[0]?.gesetzesreferenz.kurztitel).toBe('StGB');
});
it('zeigt Referenztabs vor dem aktiven Text und speichert beim Hintergrundladen nie eine Teilsitzung', async () => {
  speichereTabs(['BGB', 'StGB']);
  for (const titel of ['BGB', 'StGB'])
    aufbau.native.texte.set(aufbau.basis + `gesetze/${titel}_de-bund.xml`, gesetzXML(titel));
  const fs = await import('@tauri-apps/plugin-fs');
  const original = fs.readTextFile;
  let freigeben!: () => void;
  const sperre = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  let hintergrundFreigeben!: () => void;
  const hintergrundSperre = new Promise<void>((resolve) => {
    hintergrundFreigeben = resolve;
  });
  vi.spyOn(fs, 'readTextFile').mockImplementation(async (...args) => {
    if (String(args[0]).endsWith('BGB_de-bund.xml')) await sperre;
    if (String(args[0]).endsWith('StGB_de-bund.xml')) await hintergrundSperre;
    return original(...args);
  });
  let lauf!: Promise<boolean>;
  await act(async () => {
    lauf = restore.initialRestore(tabs.ladeGesetz, tabs.setTabs, tabs.setAktiverTabId);
  });
  expect(fensterNativ.show).toHaveBeenCalledOnce();
  expect(tabs.tabs.map((t) => t.ladezustand)).toEqual(['ladend', 'ladend']);
  expect(ersteTitel).toEqual([]);
  await act(async () => {
    freigeben();
    await lauf;
  });
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(restore.restoreErledigt).toBe(true);
  });
  expect(tabs.tabs.map((tab) => tab.ladezustand)).toEqual(['geladen', 'ladend']);
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(ladeFensterZustand('main')?.tabs.map((t) => t.gesetzesreferenz.kurztitel)).toEqual([
    'BGB',
    'StGB',
  ]);
  expect(ersteTitel[0]).toBe('Erste Norm');
  await act(async () => {
    hintergrundFreigeben();
  });
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(tabs.tabs.every((tab) => tab.ladezustand === 'geladen')).toBe(true);
  });
});
it('öffnet weitere Fenster ohne auf deren native Erzeugung zu warten', async () => {
  speichereTabs(['BGB']);
  speichereTabs(['StGB'], 'zweites');
  aufbau.native.texte.set(aufbau.basis + 'gesetze/BGB_de-bund.xml', gesetzXML('BGB'));
  aufbau.native.texte.set(aufbau.basis + 'gesetze/StGB_de-bund.xml', gesetzXML('StGB'));
  const ursprung =
    aufbau.native.invoke.getMockImplementation() ??
    (async () => {
      throw Error('Native Testgrenze nicht vorbereitet');
    });
  aufbau.native.invoke.mockImplementation(async (name, args) =>
    name === 'fenster_oeffnen_mit_label' ? new Promise(() => {}) : ursprung(name, args),
  );
  await wiederherstellen();
  expect(restore.restoreErledigt).toBe(true);
  expect(aufbau.native.invoke).toHaveBeenCalledWith('fenster_oeffnen_mit_label', {
    label: 'zweites',
    geometrie: null,
  });
});
it('startet ein neues leeres Fenster ohne Gesetzesdateizugriff', async () => {
  aufbau.native.label = 'neues-fenster';
  aufbau.native.texte.set(aufbau.basis + 'gesetze/BGB_de-bund.xml', gesetzXML('BGB'));
  const fs = await import('@tauri-apps/plugin-fs');
  const lesen = vi.spyOn(fs, 'readTextFile');
  await starteFenster();
  expect(tabs.tabs).toHaveLength(1);
  expect(tabs.tabs[0]?.gesetzesreferenz).toBeUndefined();
  expect(lesen.mock.calls.some(([p]) => String(p).includes('/gesetze/'))).toBe(false);
});
function ohneTitel(titel: string) {
  aufbau.native.texte.set(
    aufbau.basis + `gesetze/${titel}_de-bund.xml`,
    gesetzXML(titel).replace('<titel>Erste Norm</titel>', ''),
  );
  aufbau.native.texte.set(
    `/ressourcen/resources/nichtamtliche-titel/de-bund/${titel}.xml`,
    `<nichtamtlicheTitel version="1"><infos><gesetz normgeber="de-bund">${titel}</gesetz><geaendert>2026-05-26T00:00:00Z</geaendert></infos><inhalt><norm><bezeichnung>§ 1</bezeichnung><titel>Ergänzter Titel</titel></norm></inhalt></nichtamtlicheTitel>`,
  );
}
it('wartet vor der ersten Textanzeige auf den Titelabgleich ohne Gesetzreload', async () => {
  ohneTitel('BGB');
  speichereTabs(['BGB']);
  const fs = await import('@tauri-apps/plugin-fs');
  const original = fs.readTextFile;
  let freigeben!: () => void;
  const sperre = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  const lesen = vi.spyOn(fs, 'readTextFile').mockImplementation(async (...args) => {
    if (String(args[0]).startsWith('/ressourcen/')) await sperre;
    return original(...args);
  });
  let lauf!: Promise<boolean>;
  await act(async () => {
    lauf = restore.initialRestore(tabs.ladeGesetz, tabs.setTabs, tabs.setAktiverTabId);
  });
  await vi.waitFor(() =>
    expect(lesen.mock.calls.some(([p]) => String(p).startsWith('/ressourcen/'))).toBe(true),
  );
  expect(ersteTitel).toEqual([]);
  expect(fensterNativ.show).toHaveBeenCalledOnce();
  await act(async () => {
    freigeben();
    await lauf;
  });
  expect(ersteTitel[0]).toBe('Ergänzter Titel');
  expect(lesen.mock.calls.filter(([p]) => String(p).includes('/gesetze/'))).toHaveLength(1);
});
it.each(['vorher', 'nachher'] as const)(
  'erhält Titelkopien %s einem Kopierfehler und lädt alle Sitzungstabs',
  async (reihenfolge) => {
    const titel =
      reihenfolge === 'vorher' ? ['Fehler', 'Erfolg', 'Danach'] : ['Erfolg', 'Fehler', 'Danach'];
    titel.forEach(ohneTitel);
    speichereTabs(titel);
    const ursprung =
      aufbau.native.invoke.getMockImplementation() ??
      (async () => {
        throw Error('Native Testgrenze nicht vorbereitet');
      });
    aufbau.native.invoke.mockImplementation(async (name, args) => {
      if (name === 'atomar_datei_schreiben' && String(args?.relativerPfad).includes('Fehler_'))
        throw new Error('Kopie fehlgeschlagen');
      return ursprung(name, args);
    });
    await wiederherstellen();
    await vi.waitFor(async () => {
      await act(async () => {});
      expect(tabs.tabs.every((t) => t.ladezustand === 'geladen')).toBe(true);
    });
    expect(tabs.tabs.map((t) => tabs.holeTabGesetz(t)?.elemente[0]?.data.titel)).toEqual(
      titel.map((t) => (t === 'Fehler' ? undefined : 'Ergänzter Titel')),
    );
  },
);

async function starteFenster() {
  await act(async () => root.render(<StartFenster />));
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(startAbgeschlossen).toBe(true);
  });
}
it('liest im vollständigen Fensterstart nur Sitzungsgesetze und lässt Gesetzeskurzbefehle unverändert', async () => {
  for (const titel of ['BGB', 'StGB', 'Unbenutzt'])
    aufbau.native.texte.set(aufbau.basis + `gesetze/${titel}_de-bund.xml`, gesetzXML(titel));
  const pfad = aufbau.basis + 'einstellungen/gesetzeskurzbefehle.xml';
  const kurzbefehle =
    '<gesetzeskurzbefehle version="1"><kurzbefehl><gesetz normgeber="de-bund">Fehlend</gesetz><taste primaer="true">z</taste></kurzbefehl></gesetzeskurzbefehle>';
  aufbau.native.texte.set(pfad, kurzbefehle);
  aufbau.native.texte.delete(aufbau.basis + 'cache/suchverzeichnis.json');
  speichereTabs(['BGB']);
  const fs = await import('@tauri-apps/plugin-fs');
  const lesen = vi.spyOn(fs, 'readTextFile');
  await starteFenster();
  expect(tabs.holeTabGesetz(tabs.tabs[0])?.kurztitel).toBe('BGB');
  expect(lesen.mock.calls.filter(([p]) => String(p).includes('/gesetze/')).map(([p]) => p)).toEqual(
    [aufbau.basis + 'gesetze/BGB_de-bund.xml'],
  );
  expect(aufbau.native.texte.get(pfad)).toBe(kurzbefehle);
});
it('öffnet Tiefenlinks beim App-Start und bei laufendem Fenster ohne Sammelbestand', async () => {
  aufbau.native.texte.set(aufbau.basis + 'gesetze/BGB_de-bund.xml', gesetzXML('BGB'));
  aufbau.native.texte.set(aufbau.basis + 'gesetze/StGB_de-bund.xml', gesetzXML('StGB'));
  fensterNativ.links.mockResolvedValue(['lexlata://de-bund/bgb/1']);
  await starteFenster();
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(tabs.holeTabGesetz(tabs.tabs[0])?.kurztitel).toBe('BGB');
  });
  await act(async () => {
    aufbau.native.listener.get('main')?.get('tiefenlink-oeffnen')?.({
      payload: ['lexlata://de-bund/stgb/1'],
    });
  });
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(tabs.holeTabGesetz(tabs.tabs.find((t) => t.id === tabs.aktiverTabId))?.kurztitel).toBe(
      'StGB',
    );
  });
});
it('startet mit einem herausgezogenen Tab ohne weitere Gesetzesdateien zu lesen', async () => {
  aufbau.native.label = 'herausgezogener-tab';
  aufbau.native.texte.set(aufbau.basis + 'gesetze/BGB_de-bund.xml', gesetzXML('BGB'));
  aufbau.native.texte.set(aufbau.basis + 'gesetze/Unbenutzt_de-bund.xml', gesetzXML('Unbenutzt'));
  fensterNativ.transport = JSON.stringify({
    gesetzesreferenz: { kurztitel: 'BGB', normgeber: 'de-bund' },
    initialNorm: 'p1',
  });
  const fs = await import('@tauri-apps/plugin-fs');
  const lesen = vi.spyOn(fs, 'readTextFile');
  await starteFenster();
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(tabs.holeTabGesetz(tabs.tabs[0])?.kurztitel).toBe('BGB');
  });
  expect(lesen.mock.calls.filter(([p]) => String(p).includes('/gesetze/')).map(([p]) => p)).toEqual(
    [aufbau.basis + 'gesetze/BGB_de-bund.xml'],
  );
});
it('zeigt einen bereits vorhandenen Titellesebefund beim Start nicht doppelt', async () => {
  ohneTitel('BGB');
  speichereTabs(['BGB']);
  const pfad = aufbau.basis + 'nichtamtliche-titel/BGB_de-bund-nichtamtliche-titel.xml';
  aufbau.native.texte.set(pfad, '<nichtamtlicheTitel version="1"/>');
  const text =
    'Die Titeldatei für „BGB“ konnte nicht gelesen werden. Ihre Titel werden derzeit nicht angezeigt.';
  zeigeBanner({ art: 'systemfehler', typ: 'fehler', text });
  const fs = await import('@tauri-apps/plugin-fs');
  const original = fs.readTextFile;
  vi.spyOn(fs, 'readTextFile').mockImplementation(async (...args) => {
    if (args[0] === pfad) throw new Error('Titel unlesbar');
    return original(...args);
  });
  await wiederherstellen();
  expect(tabs.holeTabGesetz(tabs.tabs[0])?.kurztitel).toBe('BGB');
  expect(getSnapshot().filter((b) => b.text === text)).toHaveLength(1);
});
