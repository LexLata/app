// @vitest-environment jsdom
// Beenden-Anfrage im Hauptfenster und Schließen des letzten Hauptfensters
// (Windows/Linux-Pfad) über echte Hooks und Persistenz; ersetzt werden nur
// die nativen Grenzen samt Rust-Antwort.
import { ausstehendesPromise } from '@/test/plattform/ausstehendesPromise';
import * as aufbau from '@/test/markierungen/markierungsZusammenspielTestAufbau';
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import * as tauriFenster from '@tauri-apps/api/window';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { useFensterRestore } from './useFensterRestore';
import {
  ladeFensterZustand,
  speichereFensterZustand,
} from '@/lib/persistenz/fenster/fenster.index';
import {
  beiSpeicherBatchAbgeschlossen,
  mitSpeicherSammelbatch,
  speichereGesetz,
} from '@/lib/persistenz/gesetz/gesetz.index';

let tabs: ReturnType<typeof useAppTabs>;
let restore: ReturnType<typeof useFensterRestore>;
let root: Root;
let schliessenAnfordern: (() => Promise<void>) | undefined;
let freigabe: () => Promise<boolean>;
let vollbild: boolean;
const zerstoeren = vi.fn(async () => {});

function Fenster() {
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
  useEffect(() => {
    tabs = appTabs;
    restore = fensterRestore;
  });
  return null;
}

function gesetzXML(titel: string) {
  return `<gesetz version="1"><infos><kurztitel>${titel}</kurztitel><langtitel>${titel}</langtitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><titel>Erste Norm</titel><text><absatz><satz>Inhalt.</satz></absatz></text></norm></inhalt></gesetz>`;
}

function senden(name: 'beenden-anfrage' | 'beenden-anfrage-abbruch', id: number) {
  aufbau.native.listener.get('main')?.get(name)?.({ payload: { id } });
}

function antworten() {
  return aufbau.native.invoke.mock.calls.filter(([name]) => name === 'beenden_anfrage_antworten');
}

function gespeicherteTitel() {
  return ladeFensterZustand('main')?.tabs.map((tab) => tab.gesetzesreferenz.kurztitel);
}

async function stgbTabOeffnen() {
  const [bgb] = tabs.tabs;
  if (!bgb?.gesetzesreferenz) throw Error('BGB-Tab fehlt');
  const stgb = {
    ...bgb,
    id: 'neu',
    gesetzesreferenz: { ...bgb.gesetzesreferenz, kurztitel: 'StGB' },
  };
  await act(async () => tabs.setTabs((alt) => [...alt, stgb]));
}

const warte = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  zerstoeren.mockClear();
  freigabe = async () => true;
  vollbild = true;
  aufbau.bereiteNativeAttrappeVor();
  const ursprung = aufbau.native.invoke.getMockImplementation() ?? (async () => {});
  aufbau.native.invoke.mockImplementation(async (name, args) => {
    if (['tab_uebertragung_abholen', 'letzter_tab_anfrage_lesen'].includes(name)) return null;
    if (['interne_navigation_anzeigen', 'geschlossene_tabs_menu_status'].includes(name))
      return false;
    if (name === 'beenden_anfrage_antworten') return;
    if (name === 'hauptfenster_schliessen_freigeben') return freigabe();
    return ursprung(name, args);
  });
  const ursprungsFenster = tauriFenster.getCurrentWindow();
  vi.spyOn(tauriFenster, 'getCurrentWindow').mockImplementation(() =>
    Object.assign(ursprungsFenster, {
      label: 'main',
      onCloseRequested: async (handler: (event: { preventDefault(): void }) => Promise<void>) => {
        schliessenAnfordern = () => handler({ preventDefault: () => {} });
        return () => {};
      },
      destroy: zerstoeren,
      show: async () => {},
      center: async () => {},
      unmaximize: async () => {},
      setPosition: async () => {},
      setSize: async () => {},
      innerSize: async () => new PhysicalSize(800, 600),
      outerPosition: async () => new PhysicalPosition(0, 0),
      isMaximized: async () => false,
      isFullscreen: async () => vollbild,
      onResized: async () => () => {},
      onMoved: async () => () => {},
    }),
  );
  for (const titel of ['BGB', 'StGB'])
    aufbau.native.texte.set(aufbau.basis + `gesetze/${titel}_de-bund.xml`, gesetzXML(titel));
  speichereFensterZustand('main', {
    tabs: [{ gesetzesreferenz: { kurztitel: 'BGB', normgeber: 'de-bund' } }],
    aktiverIndex: 0,
  });
  root = createRoot(document.createElement('main'));
  await act(async () => root.render(<Fenster />));
  await act(async () => {
    await restore.initialRestore(tabs.ladeGesetz, tabs.setTabs, tabs.setAktiverTabId);
  });
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(tabs.tabs.every((tab) => tab.ladezustand === 'geladen')).toBe(true);
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('antwortet erst nach laufendem Gesetz-Speichervorgang, behält die Sitzung und speichert nach Abbruch wieder', async () => {
  let speichernFreigeben!: () => void;
  const speichervorgang = mitSpeicherSammelbatch(
    () => new Promise<void>((resolve) => (speichernFreigeben = resolve)),
  );

  await act(async () => senden('beenden-anfrage', 7));
  await act(async () => warte(100));
  expect(antworten()).toEqual([]);

  await act(async () => {
    speichernFreigeben();
    await speichervorgang;
  });
  await vi.waitFor(() =>
    expect(antworten()).toEqual([['beenden_anfrage_antworten', { id: 7, bereit: true }]]),
  );
  // Anders als beim Schließen bleibt der Fensterzustand erhalten.
  expect(gespeicherteTitel()).toEqual(['BGB']);

  // Vorbereitet: Änderungen werden nicht mehr gespeichert …
  await stgbTabOeffnen();
  await act(async () => warte(400));
  expect(gespeicherteTitel()).toEqual(['BGB']);
  // Neue Gesetz-Speichervorgänge (z. B. Hintergrundaktualisierung) beginnen nicht mehr.
  const spaeterBegonnen = vi.fn(async () => {});
  const spaeterVorgang = mitSpeicherSammelbatch(spaeterBegonnen);
  await act(async () => warte(100));
  expect(spaeterBegonnen).not.toHaveBeenCalled();

  // … nach der Abbruchnachricht wieder.
  await act(async () => senden('beenden-anfrage-abbruch', 7));
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(gespeicherteTitel()).toEqual(['BGB', 'StGB']);
  });
  await act(async () => spaeterVorgang);
  expect(spaeterBegonnen).toHaveBeenCalledOnce();
});

it.each([false, true])(
  'arbeitet nach Abbruch der Vorbereitung weiter (mit neuer Anfrage: %s)',
  async (neueAnfrage) => {
    const batch = ausstehendesPromise<void>();
    const speichervorgang = mitSpeicherSammelbatch(() => batch.promise);
    await act(async () => senden('beenden-anfrage', 10));
    expect(antworten()).toEqual([]);
    await act(async () => {
      if (neueAnfrage) senden('beenden-anfrage', 11);
      senden('beenden-anfrage-abbruch', 10);
    });

    await stgbTabOeffnen();
    await act(async () => {
      batch.resolve();
      await speichervorgang;
    });
    if (neueAnfrage) {
      await vi.waitFor(() =>
        expect(antworten()).toEqual([['beenden_anfrage_antworten', { id: 11, bereit: true }]]),
      );
      await act(async () => senden('beenden-anfrage-abbruch', 11));
    } else {
      expect(antworten()).toEqual([]);
    }
    await vi.waitFor(() => expect(gespeicherteTitel()).toEqual(['BGB', 'StGB']));
    expect(antworten()).toEqual(
      neueAnfrage ? [['beenden_anfrage_antworten', { id: 11, bereit: true }]] : [],
    );
  },
);

it('speichert einen während der letzten Geometriespeicherung geöffneten und aktivierten Tab vor der Antwort', async () => {
  const schreibenBegonnen = ausstehendesPromise<void>();
  const schreibenFertig = ausstehendesPromise<void>();
  const nativ = aufbau.native.invoke.getMockImplementation();
  if (!nativ) throw Error('Native Testgrenze fehlt');
  vollbild = false;
  aufbau.native.invoke.mockImplementation(async (name, args) => {
    if (
      name === 'atomar_datei_schreiben' &&
      args?.relativerPfad === 'einstellungen/letzte-fenster-geometrie.json'
    ) {
      schreibenBegonnen.resolve();
      await schreibenFertig.promise;
    }
    return nativ(name, args);
  });
  await act(async () => senden('beenden-anfrage', 15));
  await schreibenBegonnen.promise;
  expect(antworten()).toEqual([]);
  await stgbTabOeffnen();
  await act(async () => tabs.setAktiverTabId('neu'));

  await act(async () => schreibenFertig.resolve());

  expect(antworten()).toEqual([['beenden_anfrage_antworten', { id: 15, bereit: true }]]);
  expect(gespeicherteTitel()).toEqual(['BGB', 'StGB']);
  expect(ladeFensterZustand('main')?.aktiverIndex).toBe(1);
});

it('wartet auf einen gewöhnlichen Gesetz-Speichervorgang und seine Benachrichtigung', async () => {
  const geschrieben = ausstehendesPromise<void>();
  const schreiben = ausstehendesPromise<void>();
  const vorgemerkt = ausstehendesPromise<void>();
  const benachrichtigung = ausstehendesPromise<void>();
  const nativ = aufbau.native.invoke.getMockImplementation();
  if (!nativ) throw Error('Native Testgrenze fehlt');
  aufbau.native.invoke.mockImplementation(async (name, args) => {
    if (
      name === 'atomar_datei_schreiben' &&
      typeof args === 'object' &&
      args !== null &&
      'relativerPfad' in args &&
      typeof args.relativerPfad === 'string' &&
      args.relativerPfad.startsWith('gesetze/')
    ) {
      geschrieben.resolve();
      await schreiben.promise;
    }
    return nativ(name, args);
  });
  const abmelden = beiSpeicherBatchAbgeschlossen(() => {
    vorgemerkt.resolve();
    return benachrichtigung.promise;
  }, true);
  try {
    const vorgang = speichereGesetz({ kurztitel: 'StGB', normgeber: 'de-bund' }, gesetzXML('StGB'));
    await geschrieben.promise;
    await act(async () => senden('beenden-anfrage', 13));
    expect(antworten()).toEqual([]);
    schreiben.resolve();
    await vorgang;
    await vorgemerkt.promise;
    expect(antworten()).toEqual([]);
    benachrichtigung.resolve();
    await vi.waitFor(() =>
      expect(antworten()).toEqual([['beenden_anfrage_antworten', { id: 13, bereit: true }]]),
    );
  } finally {
    schreiben.resolve();
    benachrichtigung.resolve();
    abmelden();
  }
});

it('lehnt ab, wenn der Fensterzustand nicht gespeichert werden kann, und gibt das Speichern frei', async () => {
  const konsole = vi.spyOn(console, 'error').mockImplementation(() => {});
  const schreiben = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
    throw new Error('Speicher voll');
  });
  await act(async () => senden('beenden-anfrage', 14));
  expect(antworten()).toEqual([['beenden_anfrage_antworten', { id: 14, bereit: false }]]);
  expect(konsole).toHaveBeenCalled();
  schreiben.mockRestore();

  await mitSpeicherSammelbatch(async () => {});
  await stgbTabOeffnen();
  await vi.waitFor(() => expect(gespeicherteTitel()).toEqual(['BGB', 'StGB']));
});

/** Wie Rust beim letzten Hauptfenster: Anfrage an dieses Fenster, Antwort abwarten. */
function letztesHauptfensterMitAntwort(): Promise<boolean> {
  return new Promise((resolve) => {
    aufbau.native.invoke.mockImplementationOnce(async (name, args) => {
      expect(name).toBe('beenden_anfrage_antworten');
      expect(args).toEqual({ id: 3, bereit: true });
      resolve(false);
    });
    senden('beenden-anfrage', 3);
  });
}

async function schliessen() {
  const anfordern = schliessenAnfordern;
  if (!anfordern) throw Error('onCloseRequested nicht angemeldet');
  await act(async () => anfordern());
}

it('letztes Hauptfenster: Beenden-Anfrage statt Schließen, Sitzung bleibt erhalten', async () => {
  freigabe = letztesHauptfensterMitAntwort;
  await schliessen();

  expect(zerstoeren).not.toHaveBeenCalled();
  expect(gespeicherteTitel()).toEqual(['BGB']);
});

it('letztes Hauptfenster: Abbruch lässt das Fenster offen und speichert weiter', async () => {
  freigabe = async () => {
    await letztesHauptfensterMitAntwort();
    senden('beenden-anfrage-abbruch', 3);
    return false;
  };
  await schliessen();
  expect(zerstoeren).not.toHaveBeenCalled();

  await stgbTabOeffnen();
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(gespeicherteTitel()).toEqual(['BGB', 'StGB']);
  });
});

it('bei weiteren Hauptfenstern schließt das Fenster wie bisher', async () => {
  await schliessen();

  expect(zerstoeren).toHaveBeenCalledOnce();
  expect(gespeicherteTitel()).toBeUndefined();
});
