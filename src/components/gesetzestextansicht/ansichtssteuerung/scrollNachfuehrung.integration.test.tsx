// @vitest-environment jsdom
// Prüft Nachführung über Hauptansicht, Textansicht, Verlauf und die bestehenden Speicheranschlüsse
// sowie die Messlauf-Sperre (P5-A2) auf demselben Pfad.
import {
  tabFuerTest,
  holeTabGesetzFuerTest,
  bestandszugriffFuerTest,
} from '@/test/tabs/tabBestandFuerTest';
import { act, useLayoutEffect, useState, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, assert, expect, it, onTestFinished, vi } from 'vitest';
import { Hauptansicht } from '@/components/hauptfenster/Hauptansicht';
import {
  scrollNachfuehrungMessung,
  hauptansichtTestBeenden,
} from '@/test/hauptfenster/scrollNachfuehrungMessung';
import { HauptansichtFixture } from '@/test/hauptfenster/HauptansichtFixture';
import { useVerlaufSteuerung } from '@/hooks/tabs/useVerlaufSteuerung';
import { useLesezeichenUndFavoriten } from '@/hooks/useLesezeichenUndFavoriten';
import { ladeAktivierungXmlId } from '@/lib/persistenz/nutzerdaten/aktivierungSpeicher';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { gesetzDarstellung, gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import type { EinklappZustand, Tab } from '@/lib/domain/appTypes';
import { richteMesskonsoleEin } from '@/lib/utils/speicherMessung';

const speichern = vi.hoisted(() => ({ favorit: vi.fn(), lesezeichen: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => {} }));
vi.mock('@/lib/plattform/menu/menu.index', () => ({
  setzeAktiv: () => {},
  meldeNormstatus: () => {},
}));
vi.mock('@/lib/plattform/fensterkommunikation/fensterkommunikation.index', () => ({
  hoereGlobal: () => ({ bereit: Promise.resolve(), abmelden: () => {} }),
}));
vi.mock('@/lib/persistenz/nutzerdaten/favoritenSpeicher', () => ({
  ladeFavoriten: async () => ['§ 2'],
  umschaltenFavorit: speichern.favorit,
}));
vi.mock('@/lib/persistenz/nutzerdaten/lesezeichenSpeicher', () => ({
  ladeLesezeichen: async () => [],
  umschaltenLesezeichen: speichern.lesezeichen,
}));
vi.mock('@/components/tableiste/Tableiste', () => ({ Tableiste: () => null }));
vi.mock('@tanstack/react-virtual', async () => ({
  useVirtualizer: (await import('@/test/hauptfenster/scrollNachfuehrungMessung'))
    .scrollVirtualizerMessung,
}));
const gesetz = gesetzMitNormen(['§ 1', '§ 2', '§ 3'], {
  kurztitel: gesetzDarstellung().kurztitel,
  langtitel: gesetzDarstellung().langtitel,
  kennung: (i) => `parse-${i + 1}`,
  norm: (i) => ({
    xmlId: `xml-${i + 1}`,
    absaetze: [{ id: `abs-${i}`, saetze: [{ id: `satz-${i}`, text: 'Inhalt.', eintraege: [] }] }],
  }),
});
const eintrag = (xmlId: string) => ({ gesetzesreferenz: gesetz, xmlId });
const schluessel = 'tab-' + gesetzesreferenzSchluessel(gesetz);
let root: Root;
let host: HTMLDivElement;
let verlauf: ReturnType<typeof useVerlaufSteuerung>;
let lesezeichen: ReturnType<typeof useLesezeichenUndFavoriten>;
let favoritenStatus: ComponentProps<typeof Hauptansicht>['status']['favoritenStatus'];
let frames: FrameRequestCallback[];
const tabsRef: { current: Tab[] } = { current: [tabFuerTest({ id: 'tab', gesetz })] };
let einklappZustandRef: { current: Record<string, EinklappZustand> };
let tabTitelJetzt: Record<string, string>;
const scrollPositionenRef: { current: Record<string, { index: number; offset: number }> } = {
  current: {},
};
const nichts = async () => {};
async function starten() {
  function Probe() {
    const [tabs, setTabs] = useState(tabsRef.current);
    const [tabTitel, setTabTitel] = useState<Record<string, string>>({});
    tabTitelJetzt = tabTitel;
    verlauf = useVerlaufSteuerung(tabsRef);
    lesezeichen = useLesezeichenUndFavoriten({
      holeTabGesetz: holeTabGesetzFuerTest,
      tabsRef,
      aktiverTabIdRef: { current: 'tab' },
      einklappZustandRef,
    });
    useLayoutEffect(() => {
      verlauf.verlaufSichtbarkeit('tab');
    }, []);
    return (
      <HauptansichtFixture
        tabsteuerung={{
          holeTabGesetz: holeTabGesetzFuerTest,
          ...bestandszugriffFuerTest,
          tabs,
          setTabs,
          aktiverTabId: 'tab',
          tabTitel,
          setTabTitel,
          setAktiverTabId: nichts,
          tabSchliessen: nichts,
          erstelleLeerenTab: nichts,
          scrollPositionenRef,
          einklappZustandRef,
          verlaufLesen: verlauf.verlaufLesen,
        }}
        lesezeichen={lesezeichen}
        setFavoritenStatus={(s) => {
          favoritenStatus = s;
        }}
        navigation={{ handleVerweisKlick: nichts, handleLesezeichenOeffnen: nichts }}
        verlaufSchrittUndOeffnen={nichts}
        verlaufAktivierung={verlauf.verlaufAktivierung}
        verlaufBedienung={verlauf.verlaufBedienung}
      />
    );
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Probe />));
  await act(async () => vi.dynamicImportSettled());
  await act(async () =>
    verlauf.verlaufSetzen('tab', {
      eintraege: [eintrag('xml-1')],
      position: 0,
      aktivesElement: eintrag('xml-1'),
      rueckkehrmarke: { eintrag: eintrag('xml-3'), position: 0 },
    }),
  );
}
beforeEach(() => {
  tabsRef.current = [tabFuerTest({ id: 'tab', gesetz })];
  frames = [];
  scrollPositionenRef.current = {};
  einklappZustandRef = {
    current: {
      [schluessel]: { ueberschriften: new Set(), normen: new Set(), aktivesElementId: 'parse-1' },
    },
  };
  localStorage.clear();
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  scrollNachfuehrungMessung((fn) => {
    frames.push(fn);
    return frames.length;
  });
});
afterEach(async () => hauptansichtTestBeenden(root, host));
async function scrollen(top = 1040) {
  const block = host.querySelector<HTMLElement>('[data-index]');
  assert(block);
  const container = block.closest<HTMLElement>('[style*="overflow: auto"]');
  assert(container);
  await act(async () => {
    container.scrollTop = top;
    container.dispatchEvent(new Event('scroll'));
  });
  const aktuelleFrames = frames;
  frames = [];
  await act(async () => aktuelleFrames.forEach((fn) => fn(0)));
}
it('P11-A3/A4: Nachführung aktualisiert Verlauf, Speicherung und Favoritenanzeige auf demselben Pfad', async () => {
  await starten();
  const vorher = verlauf.verlaufLesen('tab');
  assert(vorher);
  expect(favoritenStatus.istAktuellFavorit).toBe(false);
  await scrollen();
  await act(async () => vi.advanceTimersByTime(250));
  const nachher = verlauf.verlaufLesen('tab');
  assert(nachher);
  expect(nachher.aktivesElement?.xmlId).toBe('xml-2');
  expect(nachher.eintraege).toBe(vorher.eintraege);
  expect(nachher.rueckkehrmarke).toBeUndefined();
  expect(einklappZustandRef.current[schluessel]?.aktivesElementId).toBe('parse-2');
  expect(ladeAktivierungXmlId(gesetz)).toBe('xml-2');
  expect(favoritenStatus.istAktuellFavorit).toBe(true);
  await act(async () => {
    await lesezeichen.handleFavoritSpeichern();
    await lesezeichen.handleLesezeichenSpeichern();
  });
  expect(speichern.favorit).toHaveBeenCalledWith(gesetz, '§ 2');
  expect(speichern.lesezeichen).toHaveBeenCalledWith(gesetz, '§ 2');
  await act(async () => vi.advanceTimersByTime(59_999));
  expect(verlauf.verlaufLesen('tab')?.eintraege).toBe(vorher.eintraege);
  await act(async () => vi.advanceTimersByTime(1));
  expect(verlauf.verlaufLesen('tab')?.eintraege[0]?.xmlId).toBe('xml-2');
});

it('P11-A3: eine zweite Nachführung beginnt die vollen 60 Sekunden erneut', async () => {
  await starten();
  await scrollen();
  await act(async () => vi.advanceTimersByTime(250));
  await act(async () => vi.advanceTimersByTime(40_000));
  await scrollen(2040);
  await act(async () => vi.advanceTimersByTime(250));
  expect(verlauf.verlaufLesen('tab')?.aktivesElement?.xmlId).toBe('xml-3');
  await act(async () => vi.advanceTimersByTime(59_999));
  expect(verlauf.verlaufLesen('tab')?.eintraege.map((e) => e.xmlId)).toEqual(['xml-1']);
  await act(async () => vi.advanceTimersByTime(1));
  expect(verlauf.verlaufLesen('tab')?.eintraege.map((e) => e.xmlId)).toEqual(['xml-3', 'xml-1']);
});

it('P11-A8: Klappen vor Ablauf lässt aktives Element, Marke und Verlauf des echten Besitzers unangetastet', async () => {
  await starten();
  await scrollen();
  const titel = host.querySelectorAll<HTMLElement>('.gt-klapp-zeile')[2];
  assert(titel);
  await act(async () => titel.click());
  const vorher = verlauf.verlaufLesen('tab');
  assert(vorher);
  expect(vorher.aktivesElement?.xmlId).toBe('xml-3');
  await act(async () => vi.advanceTimersByTime(250));
  expect(verlauf.verlaufLesen('tab')).toBe(vorher);
  expect(ladeAktivierungXmlId(gesetz)).toBe('xml-3');
});

it('P5-A2: Messlauf lässt aktives Element, Verlauf und Positionen unberührt und stellt Scrollposition und Tab-Bezeichnung wieder her', async () => {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => 3000,
  });
  onTestFinished(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
  });
  await starten();
  await scrollen();
  // Nachführung (250 ms) und Verlaufsübernahme (60 s) vor dem Lauf abschließen.
  await act(async () => vi.advanceTimersByTime(250));
  await act(async () => vi.advanceTimersByTime(60_000));
  const container = host
    .querySelector<HTMLElement>('[data-index]')
    ?.closest<HTMLElement>('[style*="overflow: auto"]');
  assert(container);
  const vorher = {
    verlauf: verlauf.verlaufLesen('tab'),
    aktiv: einklappZustandRef.current[schluessel]?.aktivesElementId,
    aktivierung: ladeAktivierungXmlId(gesetz),
    positionen: structuredClone(scrollPositionenRef.current),
    scrollTop: container.scrollTop,
    tabTitel: tabTitelJetzt.tab,
  };
  expect(vorher.aktiv).toBe('parse-2');
  expect(vorher.tabTitel).toBeTruthy();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  richteMesskonsoleEin();
  let ergebnis: unknown;
  let fertig = false;
  void globalThis
    .lexlataScrollMesslauf?.({ szenarien: ['S1'], wiederholungen: 1, dauerSekunden: 0.5 })
    .then((wert) => {
      ergebnis = wert;
      fertig = true;
    });
  let zeit = 0;
  const tabTitelWaehrend = new Set<string | undefined>();
  const scrollstaende = new Set<number>();
  for (let bild = 0; bild < 500 && !fertig; bild++) {
    const aktuelleFrames = frames;
    frames = [];
    await act(async () => aktuelleFrames.forEach((fn) => fn((zeit += 16))));
    await act(async () => vi.advanceTimersByTime(16));
    tabTitelWaehrend.add(tabTitelJetzt.tab);
    scrollstaende.add(container.scrollTop);
  }
  expect(fertig).toBe(true);
  expect(ergebnis).toMatchObject({ stufe: 2, szenarien: [{ name: 'S1 Lesen' }] });
  expect(scrollstaende.size).toBeGreaterThan(10);
  await act(async () => vi.advanceTimersByTime(60_000));
  expect(verlauf.verlaufLesen('tab')).toBe(vorher.verlauf);
  expect(einklappZustandRef.current[schluessel]?.aktivesElementId).toBe(vorher.aktiv);
  expect(ladeAktivierungXmlId(gesetz)).toBe(vorher.aktivierung);
  expect(scrollPositionenRef.current).toEqual(vorher.positionen);
  expect(container.scrollTop).toBe(vorher.scrollTop);
  expect([...tabTitelWaehrend]).toEqual([vorher.tabTitel]);
  expect(tabTitelJetzt.tab).toBe(vorher.tabTitel);
});
