// @vitest-environment jsdom
// Messlauf Stufe 1, Messebene 2: echte Hauptansicht mit echter, umhüllter Bibliothek.
//
// Begriffe und Grenzen von Stufe 1 siehe Kopf von scrollMessungHilfen.ts. jsdom hat kein Layout;
// Elementhöhen sind deterministisch je Index (80 bis 280 px), der Scrollbereich ist 800 px hoch.
// Renderarbeit misst ein React-Profiler um die ganze Hauptansicht. Ein zweiter Profiler nur um
// die Gesetzestextansicht ist ohne Eingriff in Produktionscode nicht einhängbar (sie liegt im
// Inneren der Hauptansicht); deren Renderarbeit ist daher in der Gesamtzahl enthalten.
// Ohne LEXLATA_MESSUNG=voll: kleine Fassung, ohne Bericht und ohne Zeitgrenzwerte.
import { act, Profiler, useLayoutEffect } from 'react';
import * as echt from '@tanstack/react-virtual';
import { afterEach, assert, beforeEach, expect, it, vi } from 'vitest';
import { nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { createRoot, type Root } from 'react-dom/client';
import { HauptansichtFixture } from '@/test/hauptfenster/HauptansichtFixture';
import { gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { useAppTabs } from '@/hooks/tabs/useAppTabs';
import { useLesezeichenUndFavoriten } from '@/hooks/useLesezeichenUndFavoriten';
import {
  bildKennzahlen,
  echteZeit,
  installiereZaehlendesCanvas,
  ladeMessgesetze,
  medianLauf,
  messumgebung,
  schreibeBericht,
  setzeVirtualizerZaehlerZurueck,
  skalierung,
  virtualizerZaehler,
  VOLLE_MESSUNG,
  type Messgesetz,
} from './scrollMessungHilfen';
import { verteilung } from '@/lib/utils/messlaufKennzahlen';

vi.mock('@tanstack/react-virtual', async (original) => {
  const { umhuellteBibliothek } = await import('./scrollMessungHilfen');
  return umhuellteBibliothek(await original<typeof echt>());
});
vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'macos' }));

const SICHTHOEHE = 800;
let host: HTMLDivElement;
let root: Root;
let tabs: ReturnType<typeof useAppTabs>;
let frames: FrameRequestCallback[];
const render = { commits: 0, dauerMs: 0 };
const nichts = () => {};

function ansichtsEigenschaften(
  steuerung: ReturnType<typeof useAppTabs>,
  lesezeichen: ReturnType<typeof useLesezeichenUndFavoriten>,
) {
  const { verlaufAktivierung, verlaufBedienung } = steuerung;
  return {
    verlaufAktivierung,
    verlaufBedienung,
    tabsteuerung: steuerung,
    lesezeichen,
    minimalistischerModus: false,
    setFavoritenStatus: nichts,
    verlaufSchrittUndOeffnen: nichts,
    navigation: { handleVerweisKlick: nichts, handleLesezeichenOeffnen: nichts },
  };
}

function Probe() {
  const steuerung = useAppTabs();
  const lesezeichen = useLesezeichenUndFavoriten(steuerung);
  useLayoutEffect(() => {
    tabs = steuerung;
  });
  return (
    <Profiler
      id="Hauptansicht"
      onRender={(_id, _phase, dauer) => {
        render.commits++;
        render.dauerMs += dauer;
      }}
    >
      <HauptansichtFixture {...ansichtsEigenschaften(steuerung, lesezeichen)} />
    </Profiler>
  );
}

function istScrollbereich(el: HTMLElement) {
  return el.style.overflow === 'auto';
}
function hoeheVon(el: HTMLElement) {
  const index = el.dataset.index;
  if (index !== undefined) return 80 + ((Number(index) * 37) % 201);
  return istScrollbereich(el) ? SICHTHOEHE : 0;
}

let canvas: { messaufrufe: number };
let beobachter: { callback: ResizeObserverCallback; elemente: Set<Element> }[];
const gemeldet = new WeakMap<Element, number>();
/** Meldet wie ein ResizeObserver jede neue oder geänderte Höhe einer gezeichneten Zeile. */
function hoehenMelden() {
  for (const b of beobachter) {
    const eintraege = [...b.elemente]
      .filter((el): el is HTMLElement => el instanceof HTMLElement && el.isConnected)
      .filter((el) => el.dataset.index !== undefined && gemeldet.get(el) !== hoeheVon(el))
      .map((el) => {
        gemeldet.set(el, hoeheVon(el));
        return {
          target: el,
          borderBoxSize: [{ blockSize: hoeheVon(el), inlineSize: 1000 }],
        };
      });
    if (eintraege.length) Reflect.apply(b.callback, undefined, [eintraege, {}]);
  }
}
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  localStorage.clear();
  frames = [];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Element.prototype.scrollIntoView = nichts;
  beobachter = [];
  const Beobachter = class {
    eintrag: (typeof beobachter)[number];
    constructor(callback: ResizeObserverCallback) {
      this.eintrag = { callback, elemente: new Set() };
      beobachter.push(this.eintrag);
    }
    observe(element: Element) {
      this.eintrag.elemente.add(element);
    }
    unobserve(element: Element) {
      this.eintrag.elemente.delete(element);
    }
    disconnect() {
      this.eintrag.elemente.clear();
    }
  };
  vi.stubGlobal('ResizeObserver', Beobachter);
  // Die Bibliothek nimmt den ResizeObserver aus dem Fenster des Scrollbereichs.
  vi.spyOn(window, 'ResizeObserver', 'get').mockReturnValue(Beobachter);
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => frames.push(fn));
  vi.stubGlobal('cancelAnimationFrame', nichts);
  canvas = installiereZaehlendesCanvas(HTMLCanvasElement.prototype);
  for (const [name, wert] of [
    ['offsetHeight', hoeheVon],
    ['clientHeight', hoeheVon],
    ['offsetWidth', () => 1000],
    ['clientWidth', () => 1000],
    ['scrollHeight', (el: HTMLElement) => (istScrollbereich(el) ? 50_000_000 : 0)],
  ] as const) {
    vi.spyOn(HTMLElement.prototype, name, 'get').mockImplementation(function (this: HTMLElement) {
      return wert(this);
    });
  }
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const block = this.closest<HTMLElement>('[data-index]');
    const container = this.closest<HTMLElement>('[style*="overflow: auto"]');
    const start = Number(block?.style.transform.match(/translateY\((-?[\d.]+)px\)/)?.[1] ?? 0);
    const top = block ? 40 + start - (container?.scrollTop ?? 0) : 0;
    const height = hoeheVon(block ?? this);
    return {
      top,
      bottom: top + height,
      height,
      left: 0,
      right: 1000,
      width: 1000,
      x: 0,
      y: top,
      toJSON() {},
    };
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function framesAusfuehren() {
  await act(async () => hoehenMelden());
  const jetzt = frames;
  frames = [];
  await act(async () => jetzt.forEach((fn) => fn(performance.now())));
}

async function oeffne(elemente: Messgesetz['elemente']) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<Probe />));
  await act(async () => tabs.gesetzOeffnen(gesetzDarstellung({ elemente })));
  await act(async () => vi.dynamicImportSettled());
  for (let i = 0; i < 5; i++) await framesAusfuehren();
  const container = host
    .querySelector<HTMLElement>('[style*="overflow: auto"] [data-index]')
    ?.closest<HTMLElement>('[style*="overflow: auto"]');
  assert(container, 'Scrollbereich der Gesetzestextansicht fehlt');
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  return container;
}

async function bild(container: HTMLElement, delta: number) {
  setzeVirtualizerZaehlerZurueck();
  const vorher = { ...render, canvas: canvas.messaufrufe };
  const start = echteZeit();
  await act(async () => {
    container.scrollTop = Math.max(0, container.scrollTop + delta);
    container.dispatchEvent(new Event('scroll'));
  });
  await act(async () => vi.advanceTimersByTime(16));
  await framesAusfuehren();
  return {
    zeitMs: echteZeit() - start,
    zaehler: { ...virtualizerZaehler },
    canvas: canvas.messaufrufe - vorher.canvas,
    commits: render.commits - vorher.commits,
    renderMs: render.dauerMs - vorher.dauerMs,
  };
}

const BILDER = VOLLE_MESSUNG ? 300 : 10;
const SZENARIEN = [
  { name: 'S1 Lesen', start: 0.5, delta: 7 },
  { name: 'S2 Überfliegen', start: 0, delta: 33 },
  { name: 'S4 Hochscrollen', start: 1, delta: -33 },
] as const;

async function messe(szenario: (typeof SZENARIEN)[number], gesetz: Messgesetz) {
  const container = await oeffne(gesetz.elemente);
  if (szenario.start > 0) {
    // Ziel aus der Gesamthöhe der Liste (Höhe des inneren Listenelements).
    const liste = container.querySelector<HTMLElement>('[data-index]')?.parentElement;
    const gesamt = Number.parseFloat(liste?.style.height ?? '0') || 0;
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        container.scrollTop = Math.max(0, gesamt * szenario.start - SICHTHOEHE);
        container.dispatchEvent(new Event('scroll'));
      });
      await act(async () => vi.advanceTimersByTime(300));
      for (let j = 0; j < 5; j++) await framesAusfuehren();
    }
  }
  const bilder = [];
  for (let i = 0; i < BILDER; i++) bilder.push(await bild(container, szenario.delta));
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  return {
    ...bildKennzahlen(bilder),
    commitsJeBild: verteilung(bilder.map((b) => b.commits)),
    renderzeitHauptansichtMsJeBild: verteilung(bilder.map((b) => b.renderMs)),
  };
}

it(
  'Messebene 2: Hauptansicht liefert für S1, S2 und S4 endliche Kennzahlen mit Renderarbeit je Bild',
  { timeout: VOLLE_MESSUNG ? 3_600_000 : 60_000 },
  async () => {
    const { quelle, gesetze } = ladeMessgesetze();
    const wiederholungen = VOLLE_MESSUNG ? 3 : 1;
    const szenarien = [];
    for (const szenario of SZENARIEN) {
      const jeGroesse: Record<string, Awaited<ReturnType<typeof messe>>> = {};
      for (const gesetz of gesetze) {
        const laeufe = [];
        if (VOLLE_MESSUNG) await messe(szenario, gesetz); // Aufwärmlauf
        for (let i = 0; i < wiederholungen; i++) laeufe.push(await messe(szenario, gesetz));
        jeGroesse[gesetz.name] = medianLauf(laeufe, (k) => k.bildzeitMs.median);
      }
      const mittel = (f: (k: ReturnType<typeof bildKennzahlen>) => number) =>
        Object.fromEntries(Object.entries(jeGroesse).map(([g, k]) => [g, f(k)]));
      szenarien.push({
        name: szenario.name,
        parameter: {
          pxJeBild: szenario.delta,
          bilder: BILDER,
          ...Object.fromEntries(gesetze.map((g) => [g.name, g.elemente.length])),
        },
        kennzahlen: {
          jeGroesse,
          skalierung: {
            bildzeitMedian: skalierung(mittel((k) => k.bildzeitMs.median)),
            getItemKeyJeBild: skalierung(mittel((k) => k.getItemKeyJeBild.mittel)),
          },
        },
      });
    }
    for (const s of szenarien) {
      const gross = s.kennzahlen.jeGroesse['100 %'];
      assert(gross, s.name);
      expect(gross.bilder, s.name).toBe(BILDER);
      expect(Number.isFinite(gross.bildzeitMs.median), s.name).toBe(true);
      expect(Number.isFinite(gross.renderzeitHauptansichtMsJeBild.mittel), s.name).toBe(true);
    }
    // Neu erscheinende Zeilen werden während der Bewegung gemessen (mindestens beim Überfliegen).
    const ueberfliegen = szenarien.find((s) => s.name === 'S2 Überfliegen');
    expect(
      ueberfliegen?.kennzahlen.jeGroesse['100 %']?.neuberechnung.hoehenmessungenJeBild.maximum,
    ).toBeGreaterThan(0);
    if (!VOLLE_MESSUNG) return;
    const hinweise = [
      `Gesetzesquelle: ${quelle}${quelle === 'BGB' ? '' : ' (BGB-Datei fehlt)'}.`,
      `Je Szenario und Größe Aufwärmlauf und ${wiederholungen} Wiederholungen (berichtet wird der Medianlauf nach Median der Bildzeit).`,
      'S3 entfällt in Messebene 2 (Laufzeit); Cache-Wirksamkeit misst Messebene 1.',
      'Kein eigener Profiler um die Gesetzestextansicht (kein Einhängepunkt ohne Produktionscode); Renderzeit gilt für die ganze Hauptansicht im React-Entwicklungsbau.',
      'Elementhöhen deterministisch 80–280 px je Index; jsdom ohne Layout.',
    ];
    const zusammenfassung = szenarien
      .map(
        (s) =>
          `${s.name}\n${Object.entries(s.kennzahlen.jeGroesse)
            .map(
              ([g, k]) =>
                `  ${g}: Bild Median ${k.bildzeitMs.median.toFixed(2)} ms, p95 ${k.bildzeitMs.p95.toFixed(2)} ms; Commits/Bild ${k.commitsJeBild.mittel.toFixed(2)}, Render/Bild ${k.renderzeitHauptansichtMsJeBild.mittel.toFixed(2)} ms; getItemKey/Bild ${k.getItemKeyJeBild.mittel.toFixed(0)}`,
            )
            .join('\n')}`,
      )
      .join('\n');
    await schreibeBericht(
      'scrollen-messung-ansicht',
      {
        stufe: 1,
        erstelltAm: new Date().toISOString(),
        umgebung: { ...messumgebung(quelle), messebene: 2 },
        szenarien,
        hinweise,
      },
      `Scroll-Messung Stufe 1, Messebene 2 (Hauptansicht)\n${zusammenfassung}\n${hinweise.join('\n')}`,
    );
  },
);
