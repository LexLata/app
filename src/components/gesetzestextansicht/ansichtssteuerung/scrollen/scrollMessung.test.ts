// scrollMessung.test.ts
// Messlauf Stufe 1, Messebene 1: useScrollSteuerung mit echter, umhüllter Bibliothek.
//
// Begriffe und Grenzen von Stufe 1 siehe Kopf von src/test/scrollen/scrollMessungHilfen.ts.
// Ein Scrollbild ist hier: Scrollposition setzen, 16 ms Uhrzeit, zwei Durchgänge aus
// Höhenmeldung (ResizeObserver) und Animationsbildern. Die „echte“ Höhe eines Elements ist
// deterministisch 90 % seiner ersten Höhenschätzung (Schätzung vermutlich zu hoch, U3); so löst
// jedes neu erscheinende Element genau eine Höhenänderung aus.
// Ohne LEXLATA_MESSUNG=voll: kleine Fassung mit synthetischem Gesetz, ohne Bericht und ohne
// Zeitgrenzwerte. Mit LEXLATA_MESSUNG=voll: BGB (sonst synthetisch, im Bericht vermerkt),
// Aufwärmlauf und drei Wiederholungen (Median), Bericht nach .reports/scrollen-messung.json.
//
// Bibliotheksbefund U1b (@tanstack/virtual-core 3.19.7, src/index.ts; Hülle react-virtual 3.14.22):
// - Bestätigt: Das Memo der Messoptionen hängt an count, paddingStart, scrollMargin, getItemKey,
//   enabled, lanes, laneAssignmentMode und gap, nicht an estimateSize (Zeilen 1549–1576); die
//   Positionstabelle (getMeasurements, Zeile 1597) hängt an diesen Optionen und an
//   itemSizeCacheVersion. Im Ein-Spalten-Pfad läuft sie von pendingMin bis count − 1 und ruft je
//   Element getItemKey und für ungemessene estimateSize auf (Zeilen 1693–1700). resizeItem setzt
//   bei geänderter Höhe pendingMin auf den kleinsten geänderten Index und erhöht
//   itemSizeCacheVersion (Zeilen 2052–2056). measure() existiert (Zeile 2664).
// - Präzisierung gegenüber dem Plan: Die Neuberechnung ist verzögert. Mehrere Höhenänderungen vor
//   dem nächsten Lesezugriff ergeben einen Lauf ab dem kleinsten geänderten Index. Innerhalb eines
//   ResizeObserver-Stapels mit synchroner Scrollkorrektur liest resizeItem die Tabelle aber vor
//   jeder weiteren Messung neu (Zeile 1985), dann entsteht je Messung ein eigener Lauf.
//   resizeItem ruft selbst einmal getItemKey (Zeile 1995). Daher zählt die Messung beides:
//   Höhenmessungen mit Änderung und tatsächlich erkannte Neuberechnungsläufe.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, assert, expect, it, vi } from 'vitest';
import { erstelleTestTextMessung } from '@/test/gesetz/testDarstellung';
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
} from '@/test/scrollen/scrollMessungHilfen';
import { useScrollSteuerung } from './useScrollSteuerung';
import type { ScrollSteuerung, ScrollSteuerungOptionen } from './ScrollSteuerung.types';

vi.mock('@tanstack/react-virtual', async (original) => {
  const { umhuellteBibliothek } = await import('@/test/scrollen/scrollMessungHilfen');
  return umhuellteBibliothek(await original<typeof import('@tanstack/react-virtual')>());
});

const SICHTHOEHE = 800;
let abbauen: (() => Promise<void>) | undefined;
afterEach(async () => {
  await abbauen?.();
  abbauen = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function baueAnsicht(elemente: Messgesetz['elemente']) {
  vi.useFakeTimers();
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const canvas = installiereZaehlendesCanvas(window.HTMLCanvasElement.prototype);
  let nummer = 0;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    frames.set(++nummer, fn);
    return nummer;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const beobachter: { callback: ResizeObserverCallback; elemente: Set<Element> }[] = [];
  class Observer {
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
  }
  window.ResizeObserver = Observer;
  vi.stubGlobal('ResizeObserver', Observer);
  const container = document.createElement('div');
  document.body.append(container);
  let top = 0;
  let steuerung!: ScrollSteuerung;
  const maxTop = () => Math.max(0, steuerung.textListe.gesamtHoehe + 40 - SICHTHOEHE);
  Object.defineProperties(container, {
    offsetWidth: { value: 1000 },
    clientWidth: { value: 1000 },
    offsetHeight: { value: SICHTHOEHE },
    clientHeight: { value: SICHTHOEHE },
    scrollHeight: { get: () => steuerung.textListe.gesamtHoehe + 40 },
    scrollTop: {
      get: () => top,
      set: (wert: number) => {
        const neu = Math.min(Math.max(0, wert), maxTop());
        if (top === neu) return;
        top = neu;
        requestAnimationFrame(() => container.dispatchEvent(new window.Event('scroll')));
      },
    },
  });
  Object.defineProperty(container, 'getBoundingClientRect', {
    value: () => ({ top: 0, bottom: SICHTHOEHE, height: SICHTHOEHE, width: 1000 }),
  });
  container.scrollTo = (options?: ScrollToOptions | number, y?: number) => {
    container.scrollTop = typeof options === 'number' ? (y ?? 0) : (options?.top ?? 0);
  };
  const messung = erstelleTestTextMessung();
  const optionen: ScrollSteuerungOptionen = {
    containerRef: { current: container },
    sichtbareElemente: elemente,
    eingeklappteUeberschriften: new Set(),
    eingeklappteNormen: new Set(),
    unterArtikelIds: new Set(),
    messung,
    geometrie: {
      schriftgroesse: 16,
      zeilenabstand: 1.6,
      randInline: 52,
      maxTextBreite: 600,
      inhaltEinzug: 12,
      satzNeuZeile: true,
      textAlign: 'left',
      hyphens: 'auto',
      lang: 'de',
    },
    leisteHoehe: 0,
    effektiveLeisteHoehe: 0,
    onZielVorbereiten() {},
    onScrollStandGeaendert() {},
    onPositionGeaendert() {},
  };
  const echteHoehen = new Map<number, number>();
  const gesehen = new WeakSet<HTMLElement>();
  function Probe() {
    steuerung = useScrollSteuerung(optionen);
    return createElement(
      'div',
      null,
      steuerung.textListe.zeilen.map((zeile) =>
        createElement('div', {
          key: zeile.key,
          'data-index': zeile.index,
          'data-start': zeile.start,
          ref(dom: HTMLDivElement | null) {
            if (!dom) return;
            if (!gesehen.has(dom)) {
              gesehen.add(dom);
              if (!echteHoehen.has(zeile.index))
                echteHoehen.set(zeile.index, Math.max(20, Math.round(zeile.size * 0.9)));
              Object.defineProperty(dom, 'offsetHeight', {
                get: () => echteHoehen.get(zeile.index) ?? 0,
              });
              Object.defineProperty(dom, 'getBoundingClientRect', {
                value: () => ({
                  top: 40 + Number(dom.getAttribute('data-start')) - container.scrollTop,
                  height: dom.offsetHeight,
                }),
              });
            }
            steuerung.textListe.messeZeile(dom);
          },
        }),
      ),
    );
  }
  const root = createRoot(container);
  const letzteHoehen = new WeakMap<Element, number>();
  const tick = async () => {
    await act(async () => {
      for (const b of beobachter) {
        const entries = [...b.elemente]
          .filter((el): el is HTMLElement => el instanceof window.HTMLElement)
          .filter(
            (el) => el !== container && el.isConnected && letzteHoehen.get(el) !== el.offsetHeight,
          )
          .map((el) => {
            const hoehe = el.offsetHeight;
            letzteHoehen.set(el, hoehe);
            return {
              target: el,
              borderBoxSize: [{ blockSize: hoehe, inlineSize: 1000 }],
            };
          });
        if (entries.length) Reflect.apply(b.callback, undefined, [entries, {}]);
      }
    });
    const callbacks = [...frames.values()];
    frames.clear();
    await act(async () => callbacks.forEach((fn) => fn(performance.now())));
  };
  const warten = async (ms: number, anzahl: number) => {
    await act(async () => vi.advanceTimersByTime(ms));
    for (let i = 0; i < anzahl; i++) await tick();
  };
  await act(async () => root.render(createElement(Probe)));
  await warten(200, 6);
  const canvasBeimAufbau = canvas.messaufrufe;
  abbauen = async () => {
    await act(async () => root.unmount());
    container.remove();
  };
  return {
    messung,
    canvasBeimAufbau,
    get scrollTop() {
      return top;
    },
    maxTop,
    async springe(ziel: number) {
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          container.scrollTop = ziel === Infinity ? maxTop() : ziel;
        });
        await warten(300, 6);
      }
    },
    /** Ein Scrollbild; liefert Bildzeit sowie Bibliotheks- und Canvas-Zähler dieses Bildes. */
    async bild(delta: number) {
      setzeVirtualizerZaehlerZurueck();
      const canvasVorher = canvas.messaufrufe;
      const start = echteZeit();
      await act(async () => {
        container.scrollTop = top + delta;
      });
      await warten(16, 2);
      return {
        zeitMs: echteZeit() - start,
        zaehler: { ...virtualizerZaehler },
        canvas: canvas.messaufrufe - canvasVorher,
      };
    },
  };
}

type Ansicht = Awaited<ReturnType<typeof baueAnsicht>>;
type Bild = Awaited<ReturnType<Ansicht['bild']>>;

// Der Kurzlauf muss in S1 (7 px je Bild) mindestens ein neu eingeblendetes Element messen;
// mit 12 Bildern (84 px) hing das von der Elementfolge in der Mitte des Messgesetzes ab.
const BILDER = VOLLE_MESSUNG ? 300 : 40;
const S3_HOECHSTBILDER = VOLLE_MESSUNG ? 2000 : 40;
const WIEDERHOLUNGEN = VOLLE_MESSUNG ? 3 : 1;

async function bilder(ansicht: Ansicht, anzahl: number, delta: number) {
  const ergebnis: Bild[] = [];
  for (let i = 0; i < anzahl; i++) ergebnis.push(await ansicht.bild(delta));
  return ergebnis;
}

async function durchlauf(ansicht: Ansicht) {
  const ergebnis: Bild[] = [];
  while (ansicht.scrollTop < ansicht.maxTop() && ergebnis.length < S3_HOECHSTBILDER)
    ergebnis.push(await ansicht.bild(2000));
  return { ergebnis, begrenzt: ansicht.scrollTop < ansicht.maxTop() };
}

type Szenario = (a: Ansicht) => Promise<Kennzahlen & Record<string, unknown>>;
type Kennzahlen = ReturnType<typeof bildKennzahlen>;
const SZENARIEN: [string, Szenario][] = [
  [
    'S1 Lesen',
    async (a) => {
      await a.springe(a.maxTop() / 2);
      return bildKennzahlen(await bilder(a, BILDER, 7));
    },
  ],
  ['S2 Überfliegen', async (a) => bildKennzahlen(await bilder(a, BILDER, 33))],
  [
    // Hauptkennzahlen gelten für den ersten Durchlauf; der zweite steht gesondert.
    'S3 Durchlauf',
    async (a) => {
      const erster = await durchlauf(a);
      const messstand = a.messung.holeMessstand();
      await a.springe(0);
      const zweiter = await durchlauf(a);
      const k1 = bildKennzahlen(erster.ergebnis);
      const k2 = bildKennzahlen(zweiter.ergebnis);
      return {
        ...k1,
        zweiterDurchlauf: k2,
        canvasMessaufrufeBeimAufbau: a.canvasBeimAufbau,
        cacheWirksamkeit: k1.canvasMessaufrufeSumme
          ? k2.canvasMessaufrufeSumme / k1.canvasMessaufrufeSumme
          : 0,
        zwischenspeicherNachVollaufbau: {
          spaltenEintraege: messstand.spalten.eintraege,
          zeilenEintraege: messstand.zeilen.eintraege,
          grenze: messstand.grenze,
        },
        begrenztAufBilder: erster.begrenzt || zweiter.begrenzt ? S3_HOECHSTBILDER : 0,
      };
    },
  ],
  [
    'S4 Hochscrollen',
    async (a) => {
      await a.springe(Infinity);
      return bildKennzahlen(await bilder(a, BILDER, -33));
    },
  ],
];

async function messeSzenario(szenario: Szenario, gesetz: Messgesetz) {
  const laeufe = [];
  for (let i = 0; i < WIEDERHOLUNGEN + (VOLLE_MESSUNG ? 1 : 0); i++) {
    const ansicht = await baueAnsicht(gesetz.elemente);
    const lauf = await szenario(ansicht);
    await abbauen?.();
    abbauen = undefined;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (VOLLE_MESSUNG && i === 0) continue; // Aufwärmlauf
    laeufe.push(lauf);
  }
  return medianLauf(laeufe, (k) => k.bildzeitMs.median);
}

function istEndlich(wert: unknown): boolean {
  if (typeof wert === 'number') return Number.isFinite(wert);
  if (wert && typeof wert === 'object') return Object.values(wert).every(istEndlich);
  return true;
}

it(
  'Messebene 1: S1–S4 liefern für alle drei Gesetzesgrößen endliche Kennzahlen einschließlich Neuberechnungen',
  { timeout: VOLLE_MESSUNG ? 3_600_000 : 60_000 },
  async () => {
    const { quelle, gesetze } = ladeMessgesetze();
    const szenarien = [];
    for (const [name, szenario] of SZENARIEN) {
      const jeGroesse: Record<string, Awaited<ReturnType<Szenario>>> = {};
      for (const gesetz of gesetze) jeGroesse[gesetz.name] = await messeSzenario(szenario, gesetz);
      const mittel = (f: (k: Kennzahlen) => number) =>
        Object.fromEntries(Object.entries(jeGroesse).map(([g, k]) => [g, f(k)]));
      szenarien.push({
        name,
        parameter: Object.fromEntries(gesetze.map((g) => [g.name, g.elemente.length])),
        kennzahlen: {
          jeGroesse,
          skalierung: {
            bildzeitMedian: skalierung(mittel((k) => k.bildzeitMs.median)),
            getItemKeyJeBild: skalierung(mittel((k) => k.getItemKeyJeBild.mittel)),
            estimateSizeJeBild: skalierung(mittel((k) => k.estimateSizeJeBild.mittel)),
            getItemKeyJeNeuberechnung: skalierung(
              mittel((k) => k.neuberechnung.getItemKeyJeNeuberechnung),
            ),
          },
        },
      });
    }
    for (const s of szenarien) {
      expect(istEndlich(s.kennzahlen.jeGroesse), s.name).toBe(true);
      const gross = s.kennzahlen.jeGroesse['100 %'];
      assert(gross, s.name);
      expect(gross.bilder, s.name).toBeGreaterThan(0);
      expect(gross.neuberechnung.hoehenmessungenJeBild.maximum, s.name).toBeGreaterThan(0);
      expect(Number.isFinite(s.kennzahlen.skalierung.getItemKeyJeBild['100 % / 5 %'])).toBe(true);
    }
    if (!VOLLE_MESSUNG) return;
    const hinweise = [
      `Gesetzesquelle: ${quelle}${quelle === 'BGB' ? '' : ' (BGB-Datei fehlt)'}.`,
      `Je Szenario Aufwärmlauf und ${WIEDERHOLUNGEN} Wiederholungen; berichtet wird der Medianlauf (mittlerer Median der Bildzeit).`,
      `S3 je Durchlauf höchstens ${S3_HOECHSTBILDER} Bilder; zweiter Durchlauf nach Sprung an den Anfang.`,
      'Echte Elementhöhe = 90 % der ersten Höhenschätzung; Canvas-Attrappe 0,5·Schriftgröße je Zeichen.',
      'Cache-Wirksamkeit = Canvas-Messaufrufe Durchlauf 2 / Durchlauf 1; 0 bei leerem Durchlauf 1 (die Höhenschätzung misst beim Aufbau alle Texte, siehe canvasMessaufrufeBeimAufbau).',
      'Zeiten in der Hülle schließen den Messaufwand der Hülle (performance.now je Aufruf) ein.',
      'Bibliotheksbefund U1b: siehe Kopfkommentar von scrollMessung.test.ts; bestätigt, mit Präzisierung: Neuberechnung verzögert und zusammengefasst ab kleinstem geänderten Index, im synchronen ResizeObserver-Stapel aber je Messung.',
    ];
    const zusammenfassung = szenarien
      .map((s) => {
        const zeilen = Object.entries(s.kennzahlen.jeGroesse).map(([g, k]) => {
          return `  ${g} (${s.parameter[g]} Elemente): Bild Median ${k.bildzeitMs.median.toFixed(2)} ms, p95 ${k.bildzeitMs.p95.toFixed(2)} ms; getItemKey/Bild ${k.getItemKeyJeBild.mittel.toFixed(0)}, estimateSize/Bild ${k.estimateSizeJeBild.mittel.toFixed(0)}, Canvas/Bild ${k.canvasMessaufrufeJeBild.mittel.toFixed(1)}; Neuberechnungen/Bild ${k.neuberechnung.neuberechnungsLaeufeJeBild.mittel.toFixed(2)} à ${k.neuberechnung.getItemKeyJeNeuberechnung.toFixed(0)} Keys`;
        });
        const sk = s.kennzahlen.skalierung.getItemKeyJeBild;
        return `${s.name}\n${zeilen.join('\n')}\n  Skalierung getItemKey/Bild: 25/5 ${sk['25 % / 5 %'].toFixed(2)}, 100/5 ${sk['100 % / 5 %'].toFixed(2)}`;
      })
      .join('\n');
    await schreibeBericht(
      'scrollen-messung',
      {
        stufe: 1,
        erstelltAm: new Date().toISOString(),
        umgebung: { ...messumgebung(quelle), messebene: 1 },
        szenarien,
        hinweise,
      },
      `Scroll-Messung Stufe 1, Messebene 1 (useScrollSteuerung)\n${zusammenfassung}\n${hinweise.join('\n')}`,
    );
  },
);
