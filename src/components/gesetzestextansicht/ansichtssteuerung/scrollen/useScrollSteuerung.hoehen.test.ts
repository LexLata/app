// useScrollSteuerung.hoehen.test.ts
// Echte TanStack-Virtualisierung mit kontrollierter DOM-Geometrie.
import { normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { act, createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, assert, expect, it, vi } from 'vitest';
import { erstelleTestTextMessung } from '@/test/gesetz/testDarstellung';
import { schaetzeHoehe } from './virtualizer';
import { useScrollSteuerung } from './useScrollSteuerung';
import type { ScrollSteuerung, ScrollSteuerungOptionen } from './ScrollSteuerung.types';

let abbauen: (() => Promise<void>) | undefined;
afterEach(async () => {
  await abbauen?.();
  abbauen = undefined;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('ungemountete Messhöhe wird bei Größenwechsel durch neue Schätzung ersetzt; zweite Ansicht bleibt getrennt', async () => {
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  const observer = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.ResizeObserver = observer;
  vi.stubGlobal('ResizeObserver', observer);
  const root = createRoot(document.getElementById('root')!);
  abbauen = async () => {
    await act(async () => root.unmount());
  };
  const ansichten: ScrollSteuerung[] = [];
  const optionen = [16, 22].map((schriftgroesse): ScrollSteuerungOptionen => {
    const container = document.createElement('div');
    document.body.append(container);
    Object.defineProperties(container, {
      scrollHeight: { value: 10000 },
      offsetHeight: { value: 100 },
      offsetWidth: { value: 800 },
      clientWidth: { value: 800 },
      clientHeight: { value: 100 },
    });
    container.scrollTop = 0;
    container.scrollTo = (options?: ScrollToOptions | number, y?: number) => {
      container.scrollTop = typeof options === 'number' ? (y ?? 0) : (options?.top ?? 0);
    };
    return {
      containerRef: { current: container },
      sichtbareElemente: Array.from({ length: 100 }, (_, index) => ({
        typ: 'norm',
        data: normaleNorm({
          id: String(index),
          xmlId: String(index),
          bezeichnung: String(index),
          absaetze: [],
        }),
      })),
      eingeklappteUeberschriften: new Set(),
      eingeklappteNormen: new Set(),
      unterArtikelIds: new Set(),
      messung: erstelleTestTextMessung(),
      geometrie: {
        schriftgroesse,
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
  });
  function Probe({ index }: { index: number }) {
    ansichten[index] = useScrollSteuerung(optionen[index]!);
    return null;
  }
  const rendern = async () =>
    act(async () =>
      root.render(
        createElement(
          'div',
          null,
          createElement(Probe, { index: 0 }),
          createElement(Probe, { index: 1 }),
        ),
      ),
    );
  await rendern();
  expect(ansichten[0]!.textListe.zeilen.length).toBeGreaterThan(0);
  const gesamtVorher = ansichten[0]!.textListe.gesamtHoehe;
  const zweiteVorher = ansichten[1]!.textListe.gesamtHoehe;
  const zeile = document.createElement('div');
  zeile.setAttribute('data-index', '0');
  Object.defineProperty(zeile, 'offsetHeight', { value: 300 });
  const container = optionen[0]!.containerRef.current!;
  container.append(zeile);
  await act(async () => ansichten[0]!.textListe.messeZeile(zeile));
  expect(ansichten[0]!.textListe.gesamtHoehe).toBeGreaterThan(gesamtVorher);
  await act(async () => {
    container.scrollTop = 2500;
    container.dispatchEvent(new window.Event('scroll'));
  });
  expect(ansichten[0]!.textListe.zeilen.some((item) => item.index === 0)).toBe(false);
  zeile.remove();
  optionen[0]!.geometrie = { ...optionen[0]!.geometrie, schriftgroesse: 22 };
  await rendern();
  expect(ansichten[0]!.textListe.gesamtHoehe).toBe(zweiteVorher);
  expect(ansichten[1]!.textListe.gesamtHoehe).toBe(zweiteVorher);
  expect(ansichten[0]!.textListe.gesamtHoehe).not.toBe(gesamtVorher);
  const fertig = vi.fn();
  await act(async () =>
    ansichten[0]!.starteAuftrag(
      { art: 'wiederherstellen', elementId: '50', offsetInItem: 17 },
      fertig,
    ),
  );
  optionen[0]!.geometrie = { ...optionen[0]!.geometrie, schriftgroesse: 28 };
  await rendern();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 80));
  });
  expect(fertig).toHaveBeenCalledTimes(1);
  expect(container.scrollTop).toBeCloseTo(50 * Math.round(28 * 1.3 + 20) + 40 + 17);
  expect(ansichten[1]!.textListe.gesamtHoehe).toBe(zweiteVorher);
});

async function echteBreitenAnsicht(
  strict = false,
  testGeometrie: {
    geschaetzteZeilen?: number | ((breite: number) => number);
    zeilenHoeheFuerGeometrie?: (breite: number, schriftgroesse: number) => number;
    browserBegrenzung?: boolean;
    leisteHoehe?: number;
    zeilenHoehe?: number;
    schriftgroesse?: number;
  } = {},
) {
  vi.useFakeTimers();
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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
  let breite = 800;
  let top = 0;
  let grosseErsteZeile = false;
  const andereHoehen = new Map<number, number>();
  let scrollHoehe = 50000;
  const begrenzungen: { vorher: number; erreicht: number }[] = [];
  const scrollEreignisEinplanen = () =>
    requestAnimationFrame(() => container.dispatchEvent(new window.Event('scroll')));
  const begrenzeBrowserposition = () => {
    const maximum = Math.max(0, scrollHoehe - 300);
    if (testGeometrie.browserBegrenzung && top > maximum) {
      begrenzungen.push({ vorher: top, erreicht: maximum });
      top = maximum;
      scrollEreignisEinplanen();
    }
  };
  Object.defineProperties(container, {
    offsetWidth: { get: () => breite },
    clientWidth: { get: () => breite },
    offsetHeight: { value: 300 },
    clientHeight: { value: 300 },
    scrollHeight: { get: () => scrollHoehe },
    scrollTop: {
      get: () => top,
      set: (wert: number) => {
        if (top === wert) return;
        top = testGeometrie.browserBegrenzung
          ? Math.max(0, Math.min(wert, scrollHoehe - 300))
          : wert;
        scrollEreignisEinplanen();
      },
    },
  });
  container.getBoundingClientRect = () =>
    ({ top: 0, bottom: 300, height: 300, width: breite }) as DOMRect;
  container.scrollTo = (options?: ScrollToOptions | number, y?: number) => {
    container.scrollTop = typeof options === 'number' ? (y ?? 0) : (options?.top ?? 0);
  };
  const position = vi.fn();
  const stand = vi.fn();
  const optionen: ScrollSteuerungOptionen = {
    containerRef: { current: container },
    sichtbareElemente: Array.from({ length: 100 }, (_, index) => ({
      typ: 'norm',
      data: normaleNorm({
        id: String(index),
        xmlId: String(index),
        bezeichnung: String(index),
        absaetze: [
          {
            id: `a${index}`,
            saetze: [{ id: `s${index}`, text: 'Rechtstext '.repeat(80), eintraege: [] }],
          },
        ],
      }),
    })),
    eingeklappteUeberschriften: new Set(),
    eingeklappteNormen: new Set(),
    unterArtikelIds: new Set(),
    messung: {
      ...erstelleTestTextMessung(),
      ...(testGeometrie.geschaetzteZeilen === undefined
        ? {}
        : {
            zeilenFuerText: (text: string | undefined, textBreite: number) =>
              text
                ? typeof testGeometrie.geschaetzteZeilen === 'function'
                  ? text.length < 20
                    ? 1
                    : testGeometrie.geschaetzteZeilen(textBreite)
                  : testGeometrie.geschaetzteZeilen!
                : 0,
          }),
    },
    geometrie: {
      schriftgroesse: testGeometrie.schriftgroesse ?? 16,
      zeilenabstand: 1.6,
      randInline: 52,
      maxTextBreite: 'none',
      inhaltEinzug: 12,
      satzNeuZeile: true,
      textAlign: 'left',
      hyphens: 'auto',
      lang: 'de',
    },
    leisteHoehe: testGeometrie.leisteHoehe ?? 0,
    effektiveLeisteHoehe: testGeometrie.leisteHoehe ?? 0,
    onZielVorbereiten() {},
    onScrollStandGeaendert: stand,
    onPositionGeaendert: position,
  };
  let steuerung!: ScrollSteuerung;
  const mountZahlen = new Map<string, number>();
  const ersteRenderHoehen = new Map<string, number>();
  const gesehen = new WeakSet<HTMLElement>();
  function Probe() {
    steuerung = useScrollSteuerung(optionen);
    return createElement(
      'div',
      {
        // Browsergrenze nach dem tatsächlichen DOM-Commit, vor den Layout-Effekten.
        ref: testGeometrie.browserBegrenzung
          ? (dom: HTMLDivElement | null) => {
              if (!dom) return;
              scrollHoehe = steuerung.textListe.gesamtHoehe + 160;
              begrenzeBrowserposition();
            }
          : undefined,
      },
      steuerung.textListe.zeilen.map((zeile) =>
        createElement('div', {
          key: zeile.key,
          'data-index': zeile.index,
          'data-start': zeile.start,
          ref(dom: HTMLDivElement | null) {
            if (dom && !gesehen.has(dom)) {
              gesehen.add(dom);
              if (!ersteRenderHoehen.has(String(zeile.key)))
                ersteRenderHoehen.set(String(zeile.key), zeile.size);
              mountZahlen.set(String(zeile.key), (mountZahlen.get(String(zeile.key)) ?? 0) + 1);
              Object.defineProperty(dom, 'offsetHeight', {
                get: () =>
                  andereHoehen.get(zeile.index) ??
                  testGeometrie.zeilenHoeheFuerGeometrie?.(
                    breite,
                    optionen.geometrie.schriftgroesse,
                  ) ??
                  (grosseErsteZeile && breite >= 600 && zeile.index === 0
                    ? 1300
                    : breite < 600
                      ? 260
                      : (testGeometrie.zeilenHoehe ?? 130)),
              });
              dom.getBoundingClientRect = () =>
                ({
                  top: 40 + Number(dom.getAttribute('data-start')) - container.scrollTop,
                  height: dom.offsetHeight,
                }) as DOMRect;
            }
            steuerung.textListe.messeZeile(dom);
          },
        }),
      ),
    );
  }
  const root = createRoot(container);
  const rendern = async () =>
    act(async () =>
      root.render(
        strict ? createElement(StrictMode, null, createElement(Probe)) : createElement(Probe),
      ),
    );
  const letzteHoehen = new WeakMap<Element, number>();
  const liefereZeilenMessung = () => {
    for (const b of beobachter) {
      const entries = [...b.elemente]
        .filter(
          (el) =>
            el !== container &&
            el.isConnected &&
            letzteHoehen.get(el) !== (el as HTMLElement).offsetHeight,
        )
        .map((el) => {
          const hoehe = (el as HTMLElement).offsetHeight;
          letzteHoehen.set(el, hoehe);
          return {
            target: el,
            borderBoxSize: [{ blockSize: hoehe, inlineSize: breite }],
          } as unknown as ResizeObserverEntry;
        });
      if (entries.length) b.callback(entries, {} as ResizeObserver);
    }
  };
  const tick = async () => {
    await act(async () => liefereZeilenMessung());
    const callbacks = [...frames.values()];
    frames.clear();
    await act(async () => callbacks.forEach((fn) => fn(performance.now() + 1000)));
  };
  const warten = async (ms = 0, anzahl = 6) => {
    await act(async () => vi.advanceTimersByTime(ms));
    for (let i = 0; i < anzahl; i++) await tick();
  };
  await rendern();
  await warten();
  abbauen = async () => {
    await act(async () => root.unmount());
    vi.useRealTimers();
  };
  return {
    container,
    optionen,
    position,
    stand,
    mountZahlen,
    ersteRenderHoehen,
    begrenzungen,
    tick,
    warten,
    rendern,
    get steuerung() {
      return steuerung;
    },
    async scroll(wert: number) {
      await act(async () => {
        container.scrollTop = wert;
      });
      await warten();
    },
    async resize(wert: number) {
      breite = wert;
      await act(async () =>
        beobachter
          .filter((b) => b.elemente.has(container))
          .forEach((b) => b.callback([], {} as ResizeObserver)),
      );
    },
    async messeAndereZeile(index: number, hoehe: number) {
      andereHoehen.set(index, hoehe);
      await warten();
    },
    async messeErsteGrosseZeile() {
      grosseErsteZeile = true;
      await act(async () => liefereZeilenMessung());
      await warten();
    },
    get anker() {
      return this.ermittleAnker(optionen.effektiveLeisteHoehe);
    },
    get textAnker() {
      return this.ermittleAnker(0);
    },
    ermittleAnker(leisteHoehe: number) {
      const zeile = steuerung.textListe.zeilen.find(
        (z) => z.start + z.size > container.scrollTop - 40 + leisteHoehe,
      )!;
      const dom = container.querySelector<HTMLElement>(`[data-index="${zeile.index}"]`)!;
      return { index: zeile.index, dom, top: dom.getBoundingClientRect().top, key: zeile.key };
    },
  };
}

it.each([
  [false, 5500],
  [true, 5500],
  [false, 20000],
  [true, 20000],
] as const)(
  'echter Virtualizer remountet Breitenkeys und hält den Anker in beiden Richtungen (StrictMode: %s, Scrolltop: %s)',
  async (strict, scrollTop) => {
    const h = await echteBreitenAnsicht(strict);
    await h.scroll(scrollTop);
    const anker = h.textAnker;
    expect(anker.index).toBeGreaterThan(8);
    await h.resize(400);
    await h.warten(149, 1);
    expect(String(h.steuerung.textListe.zeilen[0]!.key)).toContain(',696,');
    await h.warten(1, 0);
    expect(h.container.querySelector(`[data-index="${anker.index}"]`)).not.toBeNull();
    await h.warten(0, 25);
    const domNeu = h.container.querySelector<HTMLElement>(`[data-index="${anker.index}"]`);
    expect(domNeu).not.toBeNull();
    expect(domNeu).not.toBe(anker.dom);
    expect(Math.abs(domNeu!.getBoundingClientRect().top - anker.top)).toBeLessThanOrEqual(1);
    expect(String(h.textAnker.key)).toContain(',296,');
    expect(h.position).toHaveBeenCalled();
    const rueckAnker = h.textAnker;
    await h.resize(800);
    await h.warten(150, 25);
    const domZurueck = h.container.querySelector<HTMLElement>(
      `[data-index="${rueckAnker.index}"]`,
    )!;
    expect(domZurueck).not.toBe(rueckAnker.dom);
    expect(Math.abs(domZurueck.getBoundingClientRect().top - rueckAnker.top)).toBeLessThanOrEqual(
      1,
    );
  },
);

it('echter Virtualizer verwirft eine inzwischen ungerenderte breite Messhöhe bei Resize', async () => {
  const h = await echteBreitenAnsicht();
  await h.messeErsteGrosseZeile();
  expect(h.steuerung.textListe.zeilen.find((z) => z.index === 0)?.size).toBe(1300);
  await h.scroll(7500);
  expect(h.steuerung.textListe.zeilen.some((z) => z.index === 0)).toBe(false);
  await h.resize(400);
  await h.warten(150, 25);
  const zeilen = h.steuerung.textListe.zeilen;
  expect(zeilen.some((z) => z.index === 0)).toBe(false);
  const kontext = {
    ...h.optionen.geometrie,
    ...h.optionen,
    textSpalteBreite: 296,
  };
  const schaetzung = schaetzeHoehe(h.optionen.sichtbareElemente[0]!, 16, kontext);
  // Beim Zurückscrollen bleibt die neue Zeile zunächst ungemessen:
  // die frischen Keys müssen bereits die Schätzung statt 1300 px liefern.
  await act(async () => {
    h.container.scrollTop = 0;
  });
  await h.tick();
  const ersterKey = String(h.steuerung.textListe.zeilen.find((z) => z.index === 0)!.key);
  expect(h.ersteRenderHoehen.get(ersterKey)).toBe(schaetzung);
  await h.warten();
  expect(h.steuerung.textListe.zeilen.find((z) => z.index === 0)?.size).toBe(260);
});

it('nach echtem Breitenübergang kompensiert TanStack normale Höhenänderungen wieder', async () => {
  const h = await echteBreitenAnsicht();
  await h.scroll(5500);
  await h.resize(400);
  await h.warten(150, 25);
  const anker = h.anker;
  const vorher = h.container.scrollTop;
  await h.messeAndereZeile(anker.index - 1, 290);
  expect(h.container.scrollTop).toBe(vorher + 30);
  const dom = h.container.querySelector<HTMLElement>(`[data-index="${anker.index}"]`)!;
  expect(Math.abs(dom.getBoundingClientRect().top - anker.top)).toBeLessThanOrEqual(1);
});

it.each([0, 1])(
  'Wachstum der sichtbaren oder nachfolgenden Zeile verschiebt den Anker nicht (Abstand: %s)',
  async (abstand) => {
    // Titel 26 + zwei Zeilen à 32 + Titelabstand 11,2 + Rand 20 = 121,2.
    const h = await echteBreitenAnsicht(false, {
      schriftgroesse: 20,
      geschaetzteZeilen: 2,
      zeilenHoehe: 121.2,
    });
    await h.scroll(5500);
    const anker = h.anker;
    const vorher = h.container.scrollTop;
    await h.messeAndereZeile(anker.index + abstand, 160);
    expect(h.container.scrollTop).toBe(vorher);
    const dom = h.container.querySelector<HTMLElement>(`[data-index="${anker.index}"]`)!;
    expect(Math.abs(dom.getBoundingClientRect().top - anker.top)).toBeLessThanOrEqual(1);
  },
);

it.each([
  { geschaetzteZeilen: 2, leisteHoehe: 0 },
  { geschaetzteZeilen: 10, leisteHoehe: 0 },
  { geschaetzteZeilen: 2, leisteHoehe: 120 },
  { geschaetzteZeilen: 10, leisteHoehe: 120 },
])(
  'Höhenausgleich erhält die Lesestelle bei unterschiedlichen Schätzungen und Leistenhöhen: %j',
  async (geometrie) => {
    const h = await echteBreitenAnsicht(false, geometrie);
    await h.scroll(5500);
    await h.warten(200);
    const anker = h.anker;
    const vorher = h.container.scrollTop;
    expect(anker.index).toBeGreaterThan(0);
    for (const abstand of [0, 1]) {
      await h.messeAndereZeile(anker.index + abstand, 160);
      expect(h.container.scrollTop).toBe(vorher);
      expect(anker.dom.getBoundingClientRect().top).toBeCloseTo(anker.top);
    }
    for (const [hoehe, delta] of [
      [160, 30],
      [100, -30],
    ]) {
      await h.messeAndereZeile(anker.index - 1, hoehe!);
      expect(h.container.scrollTop).toBeCloseTo(vorher + delta!);
      expect(anker.dom.getBoundingClientRect().top).toBeCloseTo(anker.top);
    }
  },
);

it('eine exakt zutreffende Erstschätzung macht späteres Wachstum der sichtbaren Norm nicht zur Erstmessung', async () => {
  // 26 px Titel + zwei Textzeilen zu 32 px + 20 px Abstand = 110 px.
  const h = await echteBreitenAnsicht(false, {
    geschaetzteZeilen: 2,
    zeilenHoehe: 110,
    schriftgroesse: 20,
  });
  await h.scroll(5500);
  await h.warten(200);
  const anker = h.anker;
  const vorher = h.container.scrollTop;
  await h.messeAndereZeile(anker.index, 140);
  expect(h.container.scrollTop).toBe(vorher);
  expect(anker.dom.getBoundingClientRect().top).toBeCloseTo(anker.top);
});

it('Hochscrollen löst keine Nachmess-Kaskade aus; nach der Scrollruhe wird wieder ausgeglichen', async () => {
  const h = await echteBreitenAnsicht(false, { geschaetzteZeilen: 10, leisteHoehe: 120 });
  await h.scroll(5500);
  await h.scroll(h.container.scrollTop - 260);
  const anker = h.anker;
  const vorher = h.container.scrollTop;
  await h.messeAndereZeile(anker.index - 1, 160);
  expect(h.container.scrollTop).toBe(vorher);
  expect(anker.dom.getBoundingClientRect().top).toBeCloseTo(anker.top + 30);
  await h.warten(200);
  await h.messeAndereZeile(anker.index - 1, 190);
  expect(h.container.scrollTop).toBeCloseTo(vorher + 30);
  expect(anker.dom.getBoundingClientRect().top).toBeCloseTo(anker.top + 30);
});

it.each([-80, 80])(
  'echter Keywechsel erhält Nutzerbewegung %s während der weiteren Nachmessung',
  async (bewegung) => {
    const h = await echteBreitenAnsicht();
    await h.scroll(20000);
    const anker = h.anker;
    await h.resize(400);
    await h.warten(150, 0);
    expect(h.container.querySelector(`[data-index="${anker.index}"]`)).not.toBeNull();
    // Native Benutzerbewegung während der weiteren Nachmessung zustellen.
    await act(async () => {
      h.container.scrollTop += bewegung;
      h.container.dispatchEvent(new window.Event('scroll'));
    });
    await h.warten(0, 25);
    const dom = h.container.querySelector<HTMLElement>(`[data-index="${anker.index}"]`);
    expect(dom).not.toBeNull();
    expect(Math.abs(dom!.getBoundingClientRect().top - (anker.top - bewegung))).toBeLessThanOrEqual(
      1,
    );
  },
);

it('P11-A9: echter Höhenausgleich mit gemockter Messung und tatsächlichem Scrollereignis bleibt programmatisch', async () => {
  const h = await echteBreitenAnsicht();
  await h.scroll(500);
  h.stand.mockClear();
  const scrollEreignis = vi.fn();
  h.container.addEventListener('scroll', scrollEreignis);
  // Element 1 [130, 260) liegt über dem Sichtbereich und im Vorlauf (Sichthöhe 300 px); 130 → 300.
  await h.messeAndereZeile(1, 300);
  expect(h.container.scrollTop).toBe(670);
  expect(scrollEreignis).toHaveBeenCalled();
  expect(h.stand).toHaveBeenCalled();
  expect(h.stand.mock.calls.every(([stand]) => !stand.benutzerscrollen)).toBe(true);
  await h.scroll(800);
  expect(h.stand.mock.lastCall?.[0].benutzerscrollen).toBe(true);
});

it('hält beim Wachstum der sichtbaren Norm die Lesestelle auch mit weiteren Erstmessungen', async () => {
  const h = await echteBreitenAnsicht();
  await h.scroll(20000);
  const anker = h.anker;
  await h.messeAndereZeile(anker.index, 160);
  const dom = h.container.querySelector<HTMLElement>(`[data-index="${anker.index}"]`);
  expect(dom).not.toBeNull();
  expect(Math.abs((dom?.getBoundingClientRect().top ?? Infinity) - anker.top)).toBeLessThanOrEqual(
    1,
  );
});

it.each([
  'Breitenwechsel',
  'Minimalmodus',
  'Schriftgrößenwechsel',
  'Zeilenabstandswechsel',
  'Blocksatzwechsel',
  'Silbentrennungswechsel',
  'Satzanordnungswechsel',
] as const)(
  'zeigt den bisherigen Textanker beim %s und in jedem folgenden Bild',
  async (wechsel) => {
    const h = await echteBreitenAnsicht();
    await h.scroll(20000);
    const anker = h.textAnker;
    if (wechsel === 'Breitenwechsel') {
      await h.resize(400);
      await h.warten(150, 0);
    } else {
      const geometrie = h.optionen.geometrie;
      if (wechsel === 'Minimalmodus') geometrie.inhaltEinzug = 0;
      if (wechsel === 'Schriftgrößenwechsel') geometrie.schriftgroesse = 22;
      if (wechsel === 'Zeilenabstandswechsel') geometrie.zeilenabstand = 2;
      if (wechsel === 'Blocksatzwechsel') geometrie.textAlign = 'justify';
      if (wechsel === 'Silbentrennungswechsel') geometrie.hyphens = 'none';
      if (wechsel === 'Satzanordnungswechsel') geometrie.satzNeuZeile = false;
      await h.rendern();
    }
    for (let bild = 0; bild < 12; bild++) {
      const dom = h.container.querySelector<HTMLElement>(`[data-index="${anker.index}"]`);
      assert(dom, `Anker fehlt in Bild ${bild}`);
      expect(
        Math.abs(dom.getBoundingClientRect().top - anker.top),
        `Anker in Bild ${bild}`,
      ).toBeLessThanOrEqual(1);
      await h.tick();
    }
  },
);

it('gibt den örtlichen Resizebereich nach Abbruch für eine neue Lesestelle frei', async () => {
  const h = await echteBreitenAnsicht();
  await h.scroll(20000);
  const alterAnker = h.textAnker;
  await h.resize(400);
  await h.warten(150, 0);
  expect(h.container.querySelector(`[data-index="${alterAnker.index}"]`)).not.toBeNull();
  await act(async () => h.steuerung.storniereFortsetzungen());
  await h.scroll(1000);
  await h.warten(200, 25);
  expect(h.container.querySelector(`[data-index="${alterAnker.index}"]`)).toBeNull();
  expect(h.textAnker.index).toBeLessThan(alterAnker.index);
});

it.each(['vor der Ruhefrist', 'beim verzögerten Keywechsel'] as const)(
  'zeigt echte örtliche Blockhöhen auch bei aktivem Scrollstatus %s',
  async (phase) => {
    const h = await echteBreitenAnsicht();
    await h.scroll(20000);
    await h.resize(400);
    if (phase === 'beim verzögerten Keywechsel') {
      await h.warten(100, 1);
      await act(async () => {
        h.container.scrollTop += 1;
      });
      await h.warten(50, 0);
    }
    for (let bild = 0; bild < 12; bild++) {
      for (const zeile of h.steuerung.textListe.zeilen) {
        const dom = h.container.querySelector<HTMLElement>(`[data-index="${zeile.index}"]`);
        assert(dom);
        expect(zeile.size, `Höhe in Bild ${bild}, Zeile ${zeile.index}`).toBe(dom.offsetHeight);
      }
      await h.tick();
    }
  },
);

it('bündelt die globale Breitenidentität bis zur Ruhe nach dem letzten Ziehschritt', async () => {
  const h = await echteBreitenAnsicht();
  await h.scroll(20000);
  for (const breite of [700, 600, 500, 400]) {
    await h.resize(breite);
    await h.warten(100, 1);
    expect(String(h.steuerung.textListe.zeilen[0]?.key)).toContain(',696,');
  }
  await h.warten(49, 0);
  expect(String(h.steuerung.textListe.zeilen[0]?.key)).toContain(',696,');
  await h.warten(1, 0);
  expect(String(h.steuerung.textListe.zeilen[0]?.key)).toContain(',296,');
});

// Messlauf-Erfassung (Phase 4): Rohdaten an der echten Bibliothek mit kontrollierter Geometrie.
// Titel 26 + zwei Zeilen à 32 + Titelabstand 11,2 + Rand 20 = 121,2 px, gerundet 121 px Schätzung je Norm.
const MESSLAUF_GEOMETRIE = { schriftgroesse: 20, geschaetzteZeilen: 2, zeilenHoehe: 150 };

it('Messlauf-Erfassung paart Schätzung und erste Messung je Element', async () => {
  const h = await echteBreitenAnsicht(false, MESSLAUF_GEOMETRIE);
  const rekorder = h.steuerung.messlauf;
  assert(rekorder);
  const paar = rekorder.rohdaten().hoehen.find((eintrag) => eintrag.elementId === '0');
  // XML-ID und Normbezeichnung machen das Element im XML auffindbar (Element-ID ist zufällig).
  expect(paar).toMatchObject({ art: 'norm', gemessen: 150, xmlId: '0', bezeichnung: '0' });
  expect(paar?.geschaetzt).toBe(121);
  const anzahl = rekorder.rohdaten().hoehen.filter((e) => e.elementId === '0').length;
  await h.messeAndereZeile(0, 170);
  expect(rekorder.rohdaten().hoehen.filter((e) => e.elementId === '0')).toHaveLength(anzahl);
  expect(rekorder.auswerten({ zeilenhoehe: 32 }).schaetzfehler.gesamt.mittel).toBeCloseTo(29);
});

it('Messlauf-Erfassung zählt Aufrufe von Schlüssel- und Schätzfunktion und die Gesamthöhe', async () => {
  const h = await echteBreitenAnsicht(false, MESSLAUF_GEOMETRIE);
  const rekorder = h.steuerung.messlauf;
  assert(rekorder);
  rekorder.zuruecksetzen();
  await h.scroll(5500);
  const { aufrufe, gesamthoehen } = rekorder.rohdaten();
  expect(aufrufe.getItemKey).toBeGreaterThan(0);
  expect(aufrufe.estimateSize).toBeGreaterThan(0);
  expect(gesamthoehen.at(-1)?.hoehe).toBe(h.steuerung.textListe.gesamtHoehe);
});

it('Messlauf-Erfassung zeigt eine Höhenänderung oberhalb des Sichtbereichs als Korrektur', async () => {
  const h = await echteBreitenAnsicht(false, MESSLAUF_GEOMETRIE);
  await h.scroll(5500);
  await h.warten(200);
  const rekorder = h.steuerung.messlauf;
  assert(rekorder);
  rekorder.zuruecksetzen();
  const vorher = h.container.scrollTop;
  await h.messeAndereZeile(h.anker.index - 1, 180);
  expect(h.container.scrollTop).toBe(vorher + 30);
  expect(rekorder.rohdaten().korrekturen.map((k) => k.betrag)).toEqual([30]);
});

it('Messlauf-Erfassung zeigt ein zuklappendes Element nicht als Messlaufereignis', async () => {
  const h = await echteBreitenAnsicht(false, MESSLAUF_GEOMETRIE);
  // Umgebung vorher vollständig messen, damit nur das Zuklappen selbst Ereignisse auslösen könnte.
  for (const top of [4500, 5000, 5500]) await h.scroll(top);
  await h.warten(200);
  const rekorder = h.steuerung.messlauf;
  assert(rekorder);
  rekorder.zuruecksetzen();
  const zeile = h.anker;
  const elementId = String(zeile.index);
  const anker = h.steuerung.erfasseAnker();
  assert(anker);
  await act(async () => h.steuerung.bereiteAuftragVor());
  h.optionen.eingeklappteNormen = new Set([elementId]);
  await h.rendern();
  await act(async () => h.steuerung.starteAuftrag({ art: 'anker-halten', elementId, anker }));
  await h.warten(50, 25);
  expect(String(h.steuerung.textListe.zeilen.find((z) => z.index === zeile.index)?.key)).toContain(
    'zu:',
  );
  const { hoehen, korrekturen } = rekorder.rohdaten();
  expect(hoehen.filter((e) => e.elementId === elementId)).toEqual([]);
  expect(korrekturen).toEqual([]);
});

it('Hook liefert mit und ohne Rekorder dieselben Elemente, Positionen und Korrekturen', async () => {
  const ablauf = async () => {
    const h = await echteBreitenAnsicht(false, MESSLAUF_GEOMETRIE);
    await h.scroll(5500);
    await h.warten(200);
    await h.messeAndereZeile(h.anker.index - 1, 180);
    const ergebnis = {
      scrollTop: h.container.scrollTop,
      gesamtHoehe: h.steuerung.textListe.gesamtHoehe,
      zeilen: h.steuerung.textListe.zeilen.map(({ index, key, start, size }) => ({
        index,
        key,
        start,
        size,
      })),
      rekorder: h.steuerung.messlauf,
    };
    await abbauen?.();
    abbauen = undefined;
    return ergebnis;
  };
  const mit = await ablauf();
  vi.stubEnv('DEV', false);
  const ohne = await ablauf();
  expect(mit.rekorder).toBeDefined();
  expect(ohne.rekorder).toBeUndefined();
  const { rekorder: _mit, ...mitAnsicht } = mit;
  const { rekorder: _ohne, ...ohneAnsicht } = ohne;
  expect(ohneAnsicht).toEqual(mitAnsicht);
});

it('Messlauf-Erfassung: nach dem Verwerfen der Messungen werden gezeichnete Elemente erneut als erste Messung erfasst', async () => {
  const h = await echteBreitenAnsicht(false, MESSLAUF_GEOMETRIE);
  const rekorder = h.steuerung.messlauf;
  assert(rekorder);
  rekorder.zuruecksetzen();
  await act(async () => rekorder.messungenVerwerfen());
  const paar = rekorder.rohdaten().hoehen.find((eintrag) => eintrag.elementId === '0');
  // XML-ID und Normbezeichnung machen das Element im XML auffindbar (Element-ID ist zufällig).
  expect(paar).toMatchObject({ art: 'norm', gemessen: 150, xmlId: '0', bezeichnung: '0' });
  expect(paar?.geschaetzt).toBe(121);
});

it.each([false, true])(
  'hält nahe dem Textende dieselbe Norm über automatische Browserbegrenzung beim Breitenwechsel (StrictMode: %s)',
  async (strict) => {
    const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const h = await echteBreitenAnsicht(strict, {
        schriftgroesse: 20,
        // Unabhängig durchgerechnet: Titel 26 + 2 bzw. 8 Textzeilen à 32 + Absatzabstand 11,2 + Rand 20, gerundet.
        geschaetzteZeilen: (breite) => (breite < 600 ? 8 : 2),
        zeilenHoeheFuerGeometrie: (breite) => (breite < 600 ? 313 : 121),
        browserBegrenzung: true,
      });
      // Norm 90 bei Bildschirmposition 0: 40 + 90 × 121.
      await h.scroll(10930);
      const anker = h.textAnker;
      expect(anker.index).toBe(90);
      expect(anker.top).toBe(0);
      await h.resize(400);
      await h.warten(150, 25);
      expect(h.container.scrollTop).toBe(28210);
      expect(h.textAnker.index).toBe(90);
      expect(h.textAnker.top).toBe(0);
      await h.resize(800);
      await h.warten(150, 0);
      expect(h.begrenzungen.length).toBeGreaterThan(0);
      for (let bild = 0; bild < 25; bild++) {
        const dom = h.container.querySelector<HTMLElement>('[data-index="90"]');
        assert(dom);
        expect(dom.getBoundingClientRect().top).toBe(0);
        await h.tick();
      }
      expect(h.container.scrollTop).toBe(10930);
      expect(warnung).not.toHaveBeenCalled();
    } finally {
      warnung.mockRestore();
    }
  },
);

it.each([false, true])(
  'hält nahe dem Textende dieselbe Norm über automatische Browserbegrenzung beim Verkleinern der Schrift (StrictMode: %s)',
  async (strict) => {
    const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const h = await echteBreitenAnsicht(strict, {
        schriftgroesse: 40,
        geschaetzteZeilen: 2,
        // Titel + zwei Textzeilen + Absatzabstand + Rand:
        // 40 px: 52 + 128 + 22,4 + 20 = gerundet 222;
        // 20 px: 26 + 64 + 11,2 + 20 = gerundet 121.
        zeilenHoeheFuerGeometrie: (_breite, schrift) => (schrift === 40 ? 222 : 121),
        browserBegrenzung: true,
      });
      // Norm 90 bei Bildschirmposition 0: 40 + 90 × 222.
      await h.scroll(20020);
      expect(h.textAnker.index).toBe(90);
      expect(h.textAnker.top).toBe(0);
      const alterSchluessel = h.textAnker.key;
      const breiteVorher = h.container.clientWidth;
      const begrenzungenVorher = h.begrenzungen.length;

      h.optionen.geometrie.schriftgroesse = 20;
      await h.rendern();
      expect(h.container.clientWidth).toBe(breiteVorher);
      expect(h.begrenzungen.length).toBeGreaterThan(begrenzungenVorher);
      expect(h.textAnker.key).not.toBe(alterSchluessel);
      for (let bild = 0; bild < 25; bild++) {
        const dom = h.container.querySelector<HTMLElement>('[data-index="90"]');
        assert(dom);
        expect(dom.offsetHeight).toBe(121);
        expect(dom.getBoundingClientRect().top).toBe(0);
        await h.tick();
      }
      await h.warten(150, 25);
      expect(h.textAnker.index).toBe(90);
      expect(h.textAnker.top).toBe(0);
      // Dieselbe Norm und Bildschirmposition: 40 + 90 × 121.
      expect(h.container.scrollTop).toBe(10930);
      expect(warnung).not.toHaveBeenCalled();
    } finally {
      warnung.mockRestore();
    }
  },
);
