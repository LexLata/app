import { ueberschriftXmlId } from '@/lib/domain/gliederungskennzahl';
import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// @vitest-environment jsdom
import { nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { setzeSuchverzeichnisTestdaten } from '@/test/suchverzeichnis/suchverzeichnisSuchdaten';
// Durchgehende Gesamtabnahme über echte Hauptansicht, Textansicht und App-/Verlaufshooks.
import { act, type ComponentProps } from 'react';
import { useTastenkuerzel } from '@/hooks/eingabe/useTastenkuerzel';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, assert, expect, it, vi } from 'vitest';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { useGesetzOeffnen } from '@/hooks/tabs/useGesetzOeffnen';
import { useAppAktionen } from '@/hooks/useAppAktionen';
import { useLesezeichenUndFavoriten } from '@/hooks/useLesezeichenUndFavoriten';
import { AppOverlayHost } from '@/components/hauptfenster/OverlayHost';
import { HauptansichtFixture } from './HauptansichtFixture';
import { gesetzOeffnenFixture } from './gesetzOeffnenFixture';
import { scrollNachfuehrungMessung, hauptansichtTestBeenden } from './scrollNachfuehrungMessung';
import { gesetzDarstellung, normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { einzelzugriffFuerTest } from '@/test/tabs/einzelzugriffFuerTest';

vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => {} }));
vi.mock('@/lib/plattform/menu/menu.index', () => ({
  setzeAktiv: () => {},
  meldeNormstatus: () => {},
}));
vi.mock(
  '@/lib/plattform/fensterkommunikation/fensterkommunikation.index',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/lib/plattform/fensterkommunikation/fensterkommunikation.index')
    >()),
    hoereGlobal: () => ({ bereit: Promise.resolve(), abmelden: () => {} }),
  }),
);
vi.mock('@/lib/persistenz/nutzerdaten/favoritenSpeicher', () => ({
  ladeFavoriten: async () => ['§ 4'],
}));
vi.mock('@/lib/persistenz/nutzerdaten/lesezeichenSpeicher', () => ({
  ladeLesezeichen: async () => [],
}));
vi.mock('@tanstack/react-virtual', async () => ({
  useVirtualizer: (await import('@/test/hauptfenster/scrollNachfuehrungMessung'))
    .scrollVirtualizerMessung,
}));
const gesetz = gesetzDarstellung({
  elemente: [
    ...['Teil', 'Kapitel'].map((bezeichnung, index) => ({
      typ: 'ueberschrift' as const,
      data: {
        id: '001'.repeat(index + 1),
        xmlId: ueberschriftXmlId('001'.repeat(index + 1)),
        ebene: index + 1,
        gliederungskennzahl: '001'.repeat(index + 1),
        bezeichnung,
      },
    })),
    ...['A', 'B', 'C', 'D', 'E'].map((xmlId, i) => ({
      typ: 'norm' as const,
      data: normaleNorm({ id: xmlId, xmlId, bezeichnung: `§ ${i + 1}`, absaetze: [] }),
    })),
  ],
});
const anderes = { ...gesetz, kurztitel: 'HGB' };
const umfangreichesGesetz = gesetzDarstellung({
  kurztitel: 'TEST',
  elemente: Array.from({ length: 106 }, (_, i) => ({
    typ: 'norm',
    data: normaleNorm({ id: `n${i}`, xmlId: `n${i}`, bezeichnung: `§ ${i}`, absaetze: [] }),
  })),
});
const gesetze = [gesetz, anderes, umfangreichesGesetz];
const nichts = () => {};
let root: Root;
let host: HTMLDivElement;
let tabs: ReturnType<typeof useAppTabs>;
let navigation: ReturnType<typeof useGesetzOeffnen>;
let aktionen: ReturnType<typeof useAppAktionen>;
let overlay: 'verlauf' | 'oeffnen' | null = null;
let frames: FrameRequestCallback[];
let zeichnen: () => void;
let klappstufen: Parameters<
  NonNullable<ComponentProps<typeof HauptansichtFixture>['setKlappstufenStatus']>
>[0];
async function starten() {
  function Probe() {
    tabs = useAppTabs();
    navigation = useGesetzOeffnen({
      ...gesetzOeffnenFixture(tabs, gesetze),

      ladeGesetz: einzelzugriffFuerTest(async () => ({
        liste: gesetze,
        befunde: [],
        ordnerLesbar: true,
      })),
    });
    aktionen = useAppAktionen({
      uebersichtExportAktionRef: { current: null },
      ...tabs,
      ...navigation,
      fensterSchliessen: nichts,
      aktivesOverlay: null,
      setAktivesOverlay: nichts,
    });
    const lesezeichen = useLesezeichenUndFavoriten(tabs);
    useTastenkuerzel({
      ...tabs,
      ...navigation,
      ...aktionen,
      gesetzeskurzbefehle: {},
      gesetze: alsSuchverzeichniseintraege(gesetze),
      lesezeichenEintraege: [],
      setAktivesOverlay: nichts,
      setOeffnenOverlayInitial: nichts,
      handleFavoritSpeichern: nichts,
      handleLesezeichenSpeichern: nichts,
      handleAlleLesezeichenEntfernen: nichts,
      handleUnterstreichen: nichts,
      handleHervorheben: nichts,
      handleVerweismarkierungAnfrage: nichts,
      handleKommentarAnfrage: nichts,
      handleMarkierungRueckgaengig: nichts,
      handleMarkierungWiederholen: nichts,
      handleZuklappen: () => klappstufen.zuklappen(),
      handleAufklappen: () => klappstufen.aufklappen(),
      einfuehrungAktiv: false,
      einfuehrungTeilaktion: 0,
    });
    return (
      <>
        <HauptansichtFixture
          seitenleistenTastenkuerzel
          tabsteuerung={tabs}
          lesezeichen={lesezeichen}
          setFavoritenStatus={nichts}
          setKlappstufenStatus={(s) => {
            klappstufen = s;
          }}
          navigation={navigation}
          verlaufSchrittUndOeffnen={aktionen.verlaufSchrittUndOeffnen}
          verlaufAktivierung={tabs.verlaufAktivierung}
          verlaufBedienung={tabs.verlaufBedienung}
        />
        <AppOverlayHost
          ladeGesetz={tabs.ladeGesetz}
          einklappZustandRef={tabs.einklappZustandRef}
          aktivesOverlay={overlay}
          onSchliessen={() => {
            overlay = null;
            zeichnen();
          }}
          textDarstellung={{
            schriftgroesse: 19,
            silbentrennung: true,
            schriftart: 'sans',
            zeilenabstand: 1.6,
            blocksatz: false,
            satzNeuZeile: true,
          }}
          suchverzeichniseintraege={alsSuchverzeichniseintraege(gesetze)}
          aktiverTab={tabs.tabs.find((t) => t.id === tabs.aktiverTabId) ?? null}
          gesetzeskurzbefehle={{}}
          oeffnenOverlayInitial="5"
          verlauf={tabs.verlaufLesen(id())}
          verlaufNavigieren={tabs.verlaufNavigieren}
          elementOeffnen={navigation.elementOeffnen}
          gesetzesreferenzOeffnen={navigation.gesetzesreferenzOeffnen}
          minimalistischerModus
          onVolltextModusWechseln={nichts}
          onLoeschen={async () => {}}
          onUebersichtExportAktionAnmelden={() => {}}
          onExportieren={async () => {}}
          onDateienAbgelegt={nichts}
          onGesetzeskurzbefehleGeaendert={nichts}
          onNeuLadenNachImport={async () => {}}
          onInfoAktualisiert={nichts}
          onDateiImportSchliessen={nichts}
        />
      </>
    );
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  zeichnen = () => root.render(<Probe />);
  await act(async () => zeichnen());
}
function id() {
  assert(tabs.aktiverTabId);
  return tabs.aktiverTabId;
}
function stand(liste: string[], position: number, tabId = id()) {
  const verlauf = tabs.verlaufLesen(tabId);
  assert(verlauf);
  expect(verlauf.eintraege.map((e) => `${e.gesetzesreferenz.kurztitel}:${e.xmlId}`)).toEqual(liste);
  expect(verlauf.position).toBe(position);
}
async function taste(key: string, optionen: KeyboardEventInit = {}) {
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key, ...optionen })));
}
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  setzeSuchverzeichnisTestdaten(gesetze);
  localStorage.clear();
  overlay = null;
  frames = [];
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLElement.prototype.scrollIntoView = () => {};
  scrollNachfuehrungMessung((fn) => {
    frames.push(fn);
    return frames.length;
  });
});
afterEach(async () => hauptansichtTestBeenden(root, host));
it('prüft die gesamte Bedienfolge mit Liste und Zeiger nach jedem Schritt', async () => {
  await starten();
  // Anderen Tab zuvor wirklich öffnen/schließen; dessen vollständiger Verlauf wird später wiederhergestellt.
  await act(async () =>
    navigation.elementOeffnen({ gesetz: anderes, xmlId: 'B', modus: 'immer-neu' }),
  );
  await act(async () => navigation.elementOeffnen({ gesetz: anderes, xmlId: 'D' }));
  await act(async () => aktionen.verlaufSchrittUndOeffnen('zurueck'));
  stand(['HGB:D', 'HGB:B'], 1);
  await act(async () => tabs.tabSchliessen(id()));
  await act(async () => navigation.elementOeffnen({ gesetz, xmlId: 'A' }));
  await act(async () => vi.dynamicImportSettled());
  const quelle = id();
  const k = gesetz.kurztitel;
  const a = [`${k}:A`];
  stand(a, 0);
  await taste('ArrowDown', { altKey: true });
  stand(a, 0);
  expect(tabs.verlaufLesen(quelle)?.aktivesElement?.xmlId).toBe('B');
  await taste('ArrowDown', { altKey: true });
  stand(a, 0);
  expect(tabs.verlaufLesen(quelle)?.aktivesElement?.xmlId).toBe('C');
  await act(async () => {
    overlay = 'oeffnen';
    zeichnen();
  });
  await taste('Enter');
  const sprung = [`${k}:E`, `${k}:C`, ...a];
  stand(sprung, 0);
  await taste('ArrowLeft', { altKey: true });
  stand(sprung, 1);
  await taste('ArrowLeft', { altKey: true });
  stand(sprung, 2);
  await taste('ArrowRight', { altKey: true });
  stand(sprung, 1);
  const favorit = Array.from(host.querySelectorAll('button')).find((b) =>
    b.title.replaceAll('\u00a0', ' ').includes('§ 4'),
  );
  assert(favorit);
  await act(async () => favorit.click());
  const favoritenSprung = [`${k}:D`, `${k}:C`, `${k}:E`, ...a];
  stand(favoritenSprung, 0);
  await taste('ArrowLeft', { metaKey: true });
  stand(favoritenSprung, 0);
  await taste('ArrowLeft', { metaKey: true });
  // Der laufende D-Sprung bleibt beim Klappen erhalten; keine Nachführung nach A.
  const elternSprung = [`${k}:ueberschrift:001001`, ...favoritenSprung];
  stand(elternSprung, 0);
  await act(async () => {
    overlay = 'verlauf';
    zeichnen();
  });
  const zeile = Array.from(document.querySelectorAll<HTMLElement>('[data-overlay-aktiv] *')).find(
    (e) => e.textContent?.replaceAll('\u00a0', ' ') === '§ 1',
  );
  assert(zeile);
  await act(async () => zeile.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
  stand(elternSprung, 4);
  await taste('T', { metaKey: true, shiftKey: true, code: 'KeyT' });
  stand(['HGB:D', 'HGB:B'], 1);
  stand(elternSprung, 4, quelle);
  const wiederhergestellt = id();
  expect(wiederhergestellt).not.toBe(quelle);
  // Zuerst die echte Positionskorrektur beim Wiederherstellen abschließen.
  await act(async () => vi.advanceTimersByTime(300));
  for (let i = 0; frames.length > 0 && i < 30; i++) {
    const bereit = frames;
    frames = [];
    await act(async () => bereit.forEach((fn) => fn(performance.now() + 1000)));
  }
  // Bereitgehaltene Tabansichten hängen verdeckt mit im DOM; gescrollt wird die sichtbare.
  const container = Array.from(host.querySelectorAll<HTMLElement>('[data-index]'))
    .map((block) => block.closest<HTMLElement>('[style*="overflow: auto"]'))
    .find((c) => c && !c.closest('[style*="display: none"]'));
  assert(container);
  await act(async () => {
    container.scrollTop = 6040;
    container.dispatchEvent(new Event('scroll'));
  });
  const ausstehend = frames;
  frames = [];
  await act(async () => ausstehend.forEach((fn) => fn(0)));
  await act(async () => vi.advanceTimersByTime(250));
  expect(tabs.verlaufLesen(wiederhergestellt)?.aktivesElement?.xmlId).toBe('E');
  stand(['HGB:D', 'HGB:B'], 1);
  stand(elternSprung, 4, quelle);
});

it('behält nach 105 echten Zielsprüngen genau die neuesten 100 Einträge nur dieses Tabs', async () => {
  await starten();
  await act(async () => navigation.elementOeffnen({ gesetz, xmlId: 'B' }));
  const andererTab = id();
  const vorher = tabs.verlaufLesen(andererTab);
  await act(async () =>
    navigation.elementOeffnen({ gesetz: umfangreichesGesetz, xmlId: 'n0', modus: 'immer-neu' }),
  );
  for (let i = 1; i <= 105; i++) {
    await act(async () =>
      navigation.elementOeffnen({ gesetz: umfangreichesGesetz, xmlId: `n${i}` }),
    );
  }
  stand(
    Array.from({ length: 100 }, (_, i) => `TEST:n${105 - i}`),
    0,
  );
  expect(tabs.verlaufLesen(id())?.aktivesElement?.xmlId).toBe('n105');
  expect(tabs.verlaufLesen(andererTab)).toBe(vorher);
  stand([`${gesetz.kurztitel}:B`], 0, andererTab);
});

it('übernimmt ein Öffnungsziel im bereitgehaltenen Tab erst bei der Aktivierung und führt den Verlauf wie bisher', async () => {
  await starten();
  await act(async () => navigation.elementOeffnen({ gesetz, xmlId: 'A' }));
  await act(async () => vi.dynamicImportSettled());
  const quelle = id();
  const k = gesetz.kurztitel;
  await taste('ArrowDown', { altKey: true });
  expect(tabs.verlaufLesen(quelle)?.aktivesElement?.xmlId).toBe('B');
  const textbereich = host.querySelector('[aria-label="Gesetzestext"]');
  assert(textbereich);
  await act(async () =>
    navigation.elementOeffnen({ gesetz: anderes, xmlId: 'C', modus: 'immer-neu' }),
  );
  expect(id()).not.toBe(quelle);
  expect(textbereich.isConnected).toBe(true);
  await act(async () => navigation.elementOeffnen({ gesetz, xmlId: 'D' }));
  await act(async () => vi.advanceTimersByTime(300));
  for (let i = 0; frames.length > 0 && i < 30; i++) {
    const bereit = frames;
    frames = [];
    await act(async () => bereit.forEach((fn) => fn(performance.now() + 1000)));
  }
  expect(id()).toBe(quelle);
  // Dieselbe bereitgehaltene Ansicht, kein Neuaufbau.
  expect(host.querySelector('[aria-label="Gesetzestext"]:not([style*="display: none"] *)')).toBe(
    textbereich,
  );
  // V2 Ziel eingetragen, V4 verlassene Stelle B nachgetragen, V12 Echo ohne weiteren Eintrag.
  stand([`${k}:D`, `${k}:B`, `${k}:A`], 0, quelle);
  expect(tabs.verlaufLesen(quelle)?.aktivesElement?.xmlId).toBe('D');
  expect(tabs.tabs.find((t) => t.id === quelle)?.initialNorm).toBeUndefined();
});

it('nutzt bei ⌥← die verlassene Ansicht weiter und aktiviert das Verlaufsziel statt ihres zuletzt aktiven Elements', async () => {
  await starten();
  await act(async () => navigation.elementOeffnen({ gesetz, xmlId: 'A' }));
  await act(async () => vi.dynamicImportSettled());
  const tab = id();
  await act(async () =>
    navigation.elementOeffnen({ gesetz: anderes, xmlId: 'C', modus: 'aktiver-tab' }),
  );
  await act(async () => vi.dynamicImportSettled());
  const liste = ['HGB:C', `${gesetz.kurztitel}:A`];
  async function abwarten() {
    await act(async () => vi.advanceTimersByTime(300));
    for (let i = 0; frames.length > 0 && i < 30; i++) {
      const bereit = frames;
      frames = [];
      await act(async () => bereit.forEach((fn) => fn(performance.now() + 1000)));
    }
  }
  const sichtbarerTextbereich = () =>
    host.querySelector('[aria-label="Gesetzestext"]:not([style*="display: none"] *)');
  await abwarten();
  await taste('ArrowLeft', { altKey: true });
  await abwarten();
  const textbereich = sichtbarerTextbereich();
  assert(textbereich);
  // Ein Schritt in der Ansicht des ersten Gesetzes: Sie wird mit B als aktivem Element verlassen.
  await taste('ArrowDown', { altKey: true });
  await abwarten();
  expect(tabs.verlaufLesen(tab)?.aktivesElement?.xmlId).toBe('B');
  await taste('ArrowRight', { altKey: true });
  await abwarten();
  stand(liste, 0, tab);
  expect(sichtbarerTextbereich()).not.toBe(textbereich);
  await taste('ArrowLeft', { altKey: true });
  await abwarten();
  stand(liste, 1, tab);
  expect(sichtbarerTextbereich()).toBe(textbereich);
  expect(tabs.verlaufLesen(tab)?.aktivesElement?.xmlId).toBe('A');
  const ansichtsschluessel = Object.keys(tabs.einklappZustandRef.current).find(
    (k) => k.startsWith(tab) && !k.includes('"hgb"'),
  );
  assert(ansichtsschluessel);
  expect(tabs.einklappZustandRef.current[ansichtsschluessel]?.aktivesElementId).toBe('A');
});

it('springt im Verlauf zwischen zwei Gesetzen desselben Tabs mehrfach hin und zurück', async () => {
  await starten();
  await act(async () => navigation.elementOeffnen({ gesetz, xmlId: 'A' }));
  await act(async () => vi.dynamicImportSettled());
  const tab = id();
  await act(async () =>
    navigation.elementOeffnen({ gesetz: anderes, xmlId: 'C', modus: 'aktiver-tab' }),
  );
  await act(async () => vi.dynamicImportSettled());
  expect(id()).toBe(tab);
  const liste = ['HGB:C', `${gesetz.kurztitel}:A`];
  stand(liste, 0);
  async function abwarten() {
    await act(async () => vi.advanceTimersByTime(300));
    for (let i = 0; frames.length > 0 && i < 30; i++) {
      const bereit = frames;
      frames = [];
      await act(async () => bereit.forEach((fn) => fn(performance.now() + 1000)));
    }
  }
  await abwarten();
  for (let runde = 0; runde < 3; runde++) {
    await taste('ArrowLeft', { altKey: true });
    await abwarten();
    stand(liste, 1, tab);
    expect(tabs.tabs.find((t) => t.id === tab)?.gesetzesreferenz?.kurztitel).toBe(gesetz.kurztitel);
    await taste('ArrowRight', { altKey: true });
    await abwarten();
    stand(liste, 0, tab);
    expect(tabs.tabs.find((t) => t.id === tab)?.gesetzesreferenz?.kurztitel).toBe('HGB');
  }
});

it('P5-A8: Nachführung, schnelles Klappen und neuer Sprung erhalten Verlauf, Position und Leiste ohne alte Rückmeldungen', async () => {
  await starten();
  await act(async () => navigation.elementOeffnen({ gesetz, xmlId: 'A' }));
  await act(async () => vi.dynamicImportSettled());
  async function abwarten() {
    await act(async () => vi.advanceTimersByTime(300));
    for (let i = 0; frames.length > 0 && i < 30; i++) {
      const bereit = frames;
      frames = [];
      await act(async () => bereit.forEach((fn) => fn(performance.now() + 1000)));
    }
  }
  await abwarten();
  const container = host
    .querySelector<HTMLElement>('[data-index]')
    ?.closest<HTMLElement>('[style*="overflow: auto"]');
  assert(container);
  let top = container.scrollTop;
  const positionen: number[] = [];
  Object.defineProperty(container, 'scrollTop', {
    configurable: true,
    get: () => top,
    set: (wert: number) => {
      top = wert;
      positionen.push(wert);
    },
  });
  await act(async () => {
    container.scrollTop = 3040;
    container.dispatchEvent(new Event('scroll'));
  });
  const scrollFrames = frames;
  frames = [];
  await act(async () => scrollFrames.forEach((fn) => fn(performance.now())));
  // Noch innerhalb der 250-ms-Ruhefrist: Klappen führt vorab von A nach B.
  await taste('ArrowLeft', { metaKey: true });
  expect(tabs.verlaufLesen(id())?.aktivesElement?.xmlId).toBe('B');
  await taste('ArrowLeft', { metaKey: true });
  const k = gesetz.kurztitel;
  stand([`${k}:ueberschrift:001001`, `${k}:B`, `${k}:A`], 0);
  const alteFrames = frames;
  expect(alteFrames.length).toBeGreaterThan(0);
  frames = [];
  await act(async () => navigation.elementOeffnen({ gesetz, xmlId: 'E' }));
  const leiste = host.querySelector('[style*="overflow: hidden"][style*="z-index: 1"]');
  assert(leiste);
  const leisteVorher = leiste.textContent;
  positionen.length = 0;
  await act(async () => alteFrames.forEach((fn) => fn(performance.now() + 1000)));
  expect(positionen).toEqual([]);
  expect(leiste.textContent).toBe(leisteVorher);
  await abwarten();
  stand([`${k}:E`, `${k}:ueberschrift:001001`, `${k}:B`, `${k}:A`], 0);
  expect(tabs.verlaufLesen(id())?.aktivesElement?.xmlId).toBe('E');
  expect(container.scrollTop).toBe(6032);
  const erreicht = container.scrollTop;
  await act(async () => alteFrames.forEach((fn) => fn(performance.now() + 2000)));
  await abwarten();
  expect(container.scrollTop).toBe(erreicht);
  expect(positionen.every((wert) => wert === erreicht)).toBe(true);
});
