// useScrollSteuerung.test.ts
// Gezielte Konkurrenz-/Lebensdauerregressionen mit kontrollierten Frames, Timern und Resize.
import { normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { act, createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, describe, expect, it, vi, assert } from 'vitest';
import type { DarstellungsElement } from '@/lib/domain/gesetzTypes';
import { erstelleTestTextMessung } from '@/test/gesetz/testDarstellung';
import type { ScrollSteuerung, KlappAnker } from './scrollen.index';
import type { ScrollSteuerungOptionen } from './ScrollSteuerung.types';
import { useScrollSteuerung } from './useScrollSteuerung';

const mocks = vi.hoisted(() => ({
  virtualizer: {
    getVirtualItems: () =>
      Array.from({ length: 6 }, (_, index) => ({
        index,
        key: index as string | number,
        start: index * 1000,
        size: 1000,
      })),
    getOffsetForIndex: (index: number) => [index * 1000],
    getTotalSize: () => 6000,
    measureElement: () => {},
    indexFromElement: (dom: HTMLElement) => Number(dom.dataset.index),
    resizeItem: () => {},
    shouldAdjustScrollPositionOnItemSizeChange: (
      _zeile: { key: number; start: number; end: number },
      _delta: number,
      _instanz: {
        scrollOffset: number;
        scrollDirection: null;
        itemSizeCache: Map<number, number>;
      },
    ) => true,
  },
}));
function automatischeKorrekturOberhalbErlaubt() {
  return mocks.virtualizer.shouldAdjustScrollPositionOnItemSizeChange(
    { key: 0, start: 0, end: 1000 },
    30,
    { scrollOffset: 1500, scrollDirection: null, itemSizeCache: new Map() },
  );
}
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (options: { getItemKey(index: number): string | number }) => {
    mocks.virtualizer.getVirtualItems = () =>
      Array.from({ length: 6 }, (_, index) => ({
        index,
        key: options.getItemKey(index),
        start: index * 1000,
        size: 1000,
      }));
    return mocks.virtualizer;
  },
}));
let frames: Map<number, FrameRequestCallback>;
let observerCallback: ResizeObserverCallback;
let id: number;
let cleanup: () => Promise<void>;
beforeEach(() => {
  vi.useFakeTimers();
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  frames = new Map();
  id = 0;
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    frames.set(++id, fn);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (n: number) => frames.delete(n));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        observerCallback = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(async () => {
  await cleanup?.();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function tick(delta = 1000) {
  const callbacks = [...frames.values()];
  frames.clear();
  await act(async () => callbacks.forEach((fn) => fn(performance.now() + delta)));
}
async function timers() {
  await act(async () => vi.advanceTimersByTime(20));
}
async function settle() {
  await timers();
  for (let n = 0; n < 25; n++) await tick();
}
async function render(
  strict = false,
  extra: Partial<ScrollSteuerungOptionen> = {},
  scrollMaximum?: number,
) {
  const root = createRoot(document.getElementById('root')!);
  const container = document.createElement('div');
  let top = 0;
  let rectDelta = 0;
  let breite = 800;
  let keyDelta = false;
  const writes: number[] = [];
  Object.defineProperties(container, {
    clientHeight: { value: 400 },
    clientWidth: { get: () => breite },
    scrollTop: {
      get: () => top,
      set: (value: number) => {
        top = scrollMaximum == null ? value : Math.min(scrollMaximum, Math.max(0, value));
        writes.push(value);
      },
    },
  });
  for (let index = 0; index < 6; index++) {
    const zeile = document.createElement('div');
    zeile.setAttribute('data-index', String(index));
    zeile.getBoundingClientRect = () =>
      ({
        top:
          40 +
          index * 1000 -
          top +
          rectDelta +
          (keyDelta && String(steuerung.textListe.zeilen[0]?.key).includes(',296,') ? 170 : 0),
      }) as DOMRect;
    container.append(zeile);
  }
  container.getBoundingClientRect = () => ({ top: 0, bottom: 400 }) as DOMRect;
  const position = vi.fn();
  const stand = vi.fn();
  const options: ScrollSteuerungOptionen = {
    containerRef: { current: container },
    sichtbareElemente: Array.from({ length: 6 }, (_, index) => ({
      typ: 'norm',
      data: normaleNorm({
        id: String(index),
        xmlId: String(index),
        bezeichnung: String(index),
        absaetze: [],
      }),
    })) as DarstellungsElement[],
    eingeklappteUeberschriften: new Set(),
    eingeklappteNormen: new Set(),
    unterArtikelIds: new Set(),
    messung: erstelleTestTextMessung(),
    geometrie: {
      inhaltEinzug: 12,
      satzNeuZeile: true,
      textAlign: 'left',
      hyphens: 'auto',
      lang: 'de',

      schriftgroesse: 16,
      zeilenabstand: 1.6,
      randInline: 52,
      maxTextBreite: 600,
    },
    leisteHoehe: 0,
    effektiveLeisteHoehe: 0,
    onZielVorbereiten: vi.fn(),
    onScrollStandGeaendert: stand,
    onPositionGeaendert: position,
    ...extra,
  };
  let steuerung!: ScrollSteuerung;
  function Probe() {
    steuerung = useScrollSteuerung(options);
    return null;
  }
  await act(async () =>
    root.render(
      strict ? createElement(StrictMode, null, createElement(Probe)) : createElement(Probe),
    ),
  );
  cleanup = async () => {
    await act(async () => root.unmount());
  };
  return {
    get steuerung() {
      return steuerung;
    },
    async aendereGeometrie(delta: Partial<ScrollSteuerungOptionen['geometrie']>) {
      options.geometrie = { ...options.geometrie, ...delta };
      await act(async () =>
        root.render(
          strict ? createElement(StrictMode, null, createElement(Probe)) : createElement(Probe),
        ),
      );
    },
    async aendereDarstellung() {
      options.geometrie = { ...options.geometrie, schriftgroesse: 24, textAlign: 'justify' };
      await act(async () =>
        root.render(
          strict ? createElement(StrictMode, null, createElement(Probe)) : createElement(Probe),
        ),
      );
    },
    container,
    writes,
    position,
    stand,
    setDelta: (delta: number) => {
      rectDelta = delta;
    },
    setBreite: (wert: number) => {
      breite = wert;
    },
    keyVerschiebtLayout: () => {
      keyDelta = true;
    },
    resize: () => observerCallback([], {} as ResizeObserver),
  };
}
async function start(
  h: Awaited<ReturnType<typeof render>>,
  elementId: string,
  fertig?: () => void,
) {
  await act(async () => {
    h.steuerung.starteAuftrag({ art: 'sichtbar-machen', elementId }, fertig);
  });
}

describe('gemeinsame Scroll-Lebensdauer', () => {
  it('meldet gemessene Titel- und Körpersichtbarkeit im ScrollStand', async () => {
    const h = await render();
    Object.defineProperty(h.container, 'clientTop', { value: 0 });
    const block = h.container.querySelector('[data-index="0"]');
    if (!block) throw new Error('Virtualisierter Testblock fehlt.');
    const titel = document.createElement('div');
    titel.className = 'gt-klapp-zeile';
    titel.getBoundingClientRect = () => ({
      top: 40,
      bottom: 80,
      left: 0,
      right: 100,
      x: 0,
      y: 40,
      width: 100,
      height: 40,
      toJSON: () => ({}),
    });
    const koerper = document.createElement('div');
    koerper.setAttribute('data-scroll-koerper', '');
    koerper.getBoundingClientRect = () => ({
      top: 80,
      bottom: 1000,
      left: 0,
      right: 100,
      x: 0,
      y: 80,
      width: 100,
      height: 920,
      toJSON: () => ({}),
    });
    block.append(titel, koerper);
    await act(async () => h.container.dispatchEvent(new window.Event('scroll')));
    await settle();
    expect(h.stand).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sichtbarkeitsliste: [{ id: '0', titelSichtbar: true, koerperSichtbar: true }],
      }),
    );
  });
  it('neuer Sprung ersetzt die ausstehenden Klappanker-Nachkorrekturen', async () => {
    const h = await render();
    const alt = vi.fn();
    const neu = vi.fn();
    await act(async () => {
      h.steuerung.starteAuftrag(
        {
          art: 'anker-halten',
          elementId: '2',
          anker: { elementId: '2', offsetInItem: 0, bildschirmTop: 500, istFallback: false },
        },
        alt,
      );
    });
    await timers();
    await tick();
    await tick(); // Restore fertig, Delta-Korrektur noch ausstehend.
    await start(h, '4', neu);
    h.writes.length = 0;
    await settle();
    expect(alt).not.toHaveBeenCalled();
    expect(neu).toHaveBeenCalledTimes(1);
    expect(h.writes.every((wert) => wert === 4032)).toBe(true);
    expect(automatischeKorrekturOberhalbErlaubt()).toBe(true);
  });
  it('Stufenauftrag ersetzt die laufende Animation', async () => {
    const h = await render();
    const alt = vi.fn();
    const neu = vi.fn();
    h.container.scrollTop = 1400;
    await start(h, '1', alt);
    await timers();
    await tick(1);
    await act(async () => {
      h.steuerung.starteAuftrag(
        {
          art: 'anker-halten',
          elementId: '3',
          anker: { elementId: '3', offsetInItem: 12, bildschirmTop: 100, istFallback: false },
        },
        neu,
      );
    });
    await settle();
    expect(alt).not.toHaveBeenCalled();
    expect(neu).toHaveBeenCalledTimes(1);
  });
  it('Resize während Sprung schreibt keine konkurrierende Position und hält nach Abschluss wieder einen neuen Anker', async () => {
    const h = await render();
    const fertig = vi.fn();
    await start(h, '3', fertig);
    await timers();
    await act(async () => h.resize());
    await settle();
    expect(fertig).toHaveBeenCalledTimes(1);
    expect(automatischeKorrekturOberhalbErlaubt()).toBe(true);
    await act(async () => h.resize());
    await tick();
    const vorher = h.container.scrollTop;
    h.setDelta(70);
    await act(async () => h.resize());
    await tick();
    expect(h.container.scrollTop).toBe(vorher + 70);
    await act(async () => vi.advanceTimersByTime(150));
    expect(automatischeKorrekturOberhalbErlaubt()).toBe(true);
  });
  it.each(['messung', 'resize', 'animation', 'anker'] as const)(
    'Unmount in Phase %s beendet alle eigenen Fortsetzungen',
    async (phase) => {
      const h = await render();
      const fertig = vi.fn();
      if (phase === 'resize') await act(async () => h.resize());
      else if (phase === 'anker') {
        await act(async () => {
          h.steuerung.starteAuftrag(
            {
              art: 'anker-halten',
              elementId: '2',
              anker: { elementId: '2', offsetInItem: 0, bildschirmTop: 500, istFallback: false },
            },
            fertig,
          );
        });
        await timers();
        await tick();
        await tick();
      } else {
        const nahe = phase === 'animation';
        if (nahe) h.container.scrollTop = 1400;
        await start(h, nahe ? '1' : '4', fertig);
        if (phase === 'animation') await tick(1);
      }
      // Selbst bereits zugestellte alte Framecallbacks prüfen ihre Gültigkeit noch einmal.
      const zugestellt = [...frames.values()];
      await cleanup();
      cleanup = async () => {};
      h.writes.length = 0;
      h.position.mockClear();
      await act(async () => zugestellt.forEach((fn) => fn(performance.now() + 1000)));
      await settle();
      await act(async () => vi.advanceTimersByTime(400));
      expect(h.writes).toEqual([]);
      expect(h.position).not.toHaveBeenCalled();
      expect(fertig).not.toHaveBeenCalled();
      expect(frames.size).toBe(0);
    },
  );
  it('StrictMode lässt aktuelle Wiederherstellung zu und meldet genau einen Erfolg', async () => {
    const h = await render(true);
    const fertig = vi.fn();
    await act(async () => {
      h.steuerung.starteAuftrag(
        { art: 'wiederherstellen', elementId: '2', offsetInItem: 17 },
        fertig,
      );
    });
    await timers();
    expect(h.writes).toEqual([2057]);
    await settle();
    expect(fertig).toHaveBeenCalledTimes(1);
  });
});

it('ein nach Disconnect zugestellter Resize-Callback startet nach Unmount keinen neuen Auftrag', async () => {
  const h = await render();
  const resizeAlt = observerCallback;
  await cleanup();
  cleanup = async () => {};
  h.writes.length = 0;
  resizeAlt([], {} as ResizeObserver);
  expect(frames.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  await settle();
  expect(h.writes).toEqual([]);
});

it('ein neuer Auftrag aus der Positionsrückmeldung verhindert den überholten Erfolgsabschluss', async () => {
  const h = await render();
  const alt = vi.fn();
  const neu = vi.fn();
  h.position.mockImplementationOnce(() => {
    h.steuerung.starteAuftrag({ art: 'sichtbar-machen', elementId: '4' }, neu);
  });
  await start(h, '2', alt);
  await settle();
  await settle();
  expect(alt).not.toHaveBeenCalled();
  expect(neu).toHaveBeenCalledTimes(1);
  expect(h.container.scrollTop).toBe(4032);
});

async function scroll(h: Awaited<ReturnType<typeof render>>, top: number) {
  await act(async () => {
    h.container.scrollTop = top;
    h.container.dispatchEvent(new window.Event('scroll'));
  });
}
it('Resize erhält zwischenzeitliches Scrollen innerhalb derselben Norm', async () => {
  const h = await render();
  await act(async () => h.resize());
  await tick();
  await act(async () => vi.advanceTimersByTime(150));
  await scroll(h, 100);
  await tick();
  h.setDelta(70);
  await act(async () => h.resize());
  await tick();
  expect(h.container.scrollTop).toBe(170);
});

it.each([false, true])(
  'Scroll/Resize-Konkurrenz vor dem Meldeframe erhält nur Layoutdelta (StrictMode: %s)',
  async (strict) => {
    const h = await render(strict);
    await act(async () => h.resize());
    await tick();
    h.setDelta(70);
    await act(async () => h.resize());
    await scroll(h, 100); // Resizeframe steht vor dem gedrosselten Scrollframe.
    await tick();
    expect(h.container.scrollTop).toBe(170);
    h.stand.mockClear();
    await act(async () => h.container.dispatchEvent(new window.Event('scroll')));
    await tick(); // Native Rückmeldung der eigenen Korrektur ausdrücklich zustellen.
    expect(h.stand.mock.lastCall?.[0].benutzerscrollen).toBe(false);
    await act(async () => h.resize());
    await tick();
    expect(h.container.scrollTop).toBe(170);
    await scroll(h, 70); // Gegenrichtung während der laufenden Resizegeste.
    h.setDelta(110);
    await act(async () => h.resize());
    await tick();
    expect(h.container.scrollTop).toBe(110);
    await act(async () => h.container.dispatchEvent(new window.Event('scroll')));
    await tick();
    await act(async () => vi.advanceTimersByTime(150));
    expect(automatischeKorrekturOberhalbErlaubt()).toBe(true);
    await scroll(h, 1100); // Neuer Index übernimmt vor dem Scrollframe seine Referenz.
    h.setDelta(180);
    await act(async () => h.resize());
    await tick();
    expect(h.container.scrollTop).toBe(1170);
  },
);

it.each(['sichtbar-machen', 'anker-halten'] as const)(
  'neuer %s-Auftrag ersetzt einen bereits zugestellten Resizeframe',
  async (art) => {
    const h = await render(true);
    await act(async () => h.resize());
    await tick();
    h.setDelta(70);
    await act(async () => h.resize());
    const alteFrames = [...frames.values()];
    await act(async () => {
      h.steuerung.starteAuftrag(
        art === 'sichtbar-machen'
          ? { art, elementId: '3' }
          : {
              art,
              elementId: '3',
              anker: { elementId: '3', offsetInItem: 0, bildschirmTop: 100, istFallback: false },
            },
      );
      alteFrames.forEach((fn) => fn(performance.now()));
      h.resize();
    });
    expect(h.writes).toEqual([]);
    await settle();
    await act(async () => h.resize());
    await tick();
    const vorher = h.container.scrollTop;
    h.setDelta(140);
    await act(async () => h.resize());
    await tick();
    expect(h.container.scrollTop).toBe(vorher + 70);
    await act(async () => vi.advanceTimersByTime(150));
    expect(automatischeKorrekturOberhalbErlaubt()).toBe(true);
  },
);

it('StrictMode-Unmount verwirft ausstehende Resizekorrektur und Scrollmeldung', async () => {
  const h = await render(true);
  await act(async () => h.resize());
  await tick();
  h.setDelta(70);
  await act(async () => h.resize());
  await scroll(h, 100);
  const zugestellt = [...frames.values()];
  await cleanup();
  cleanup = async () => {};
  h.writes.length = 0;
  h.position.mockClear();
  await act(async () => zugestellt.forEach((fn) => fn(performance.now())));
  await settle();
  expect(h.writes).toEqual([]);
  expect(h.position).not.toHaveBeenCalled();
  expect(frames.size).toBe(0);
});

it.each([
  [false, 0, 1100, 70],
  [true, 0, 1100, 70],
  [false, 2100, 1100, -70],
  [true, 2100, 1100, -70],
] as const)(
  'Indexwechsel erhält anliegendes Layoutdelta (Scrollframe zuerst: %s, Start: %s, Ziel: %s, Delta: %s)',
  async (scrollframeZuerst, startTop, zielTop, delta) => {
    const h = await render();
    await scroll(h, startTop);
    await tick();
    await act(async () => h.resize());
    await tick();
    h.setDelta(delta);
    if (!scrollframeZuerst) await act(async () => h.resize());
    await scroll(h, zielTop);
    if (scrollframeZuerst) await act(async () => h.resize());
    await tick();
    expect(h.container.scrollTop).toBe(zielTop + delta);
    await act(async () => h.container.dispatchEvent(new window.Event('scroll')));
    await tick();
    await act(async () => h.resize());
    await tick();
    expect(h.container.scrollTop).toBe(zielTop + delta);
  },
);

it.each(['sichtbar-machen', 'wiederherstellen'] as const)(
  'Höhenwechsel während %s verwirft zugestellte Fortsetzungen und führt das gültige Ziel aus',
  async (art) => {
    const h = await render(true);
    const fertig = vi.fn();
    await act(async () =>
      h.steuerung.starteAuftrag(
        art === 'sichtbar-machen'
          ? { art, elementId: '3' }
          : { art, elementId: '3', offsetInItem: 17 },
        fertig,
      ),
    );
    await timers();
    const alteFrames = [...frames.values()];
    await h.aendereDarstellung();
    h.writes.length = 0;
    await act(async () => alteFrames.forEach((fn) => fn(performance.now())));
    expect(h.writes).toEqual([]);
    expect(fertig).not.toHaveBeenCalled();
    await settle();
    expect(fertig).toHaveBeenCalledTimes(1);
    expect(h.container.scrollTop).toBe(art === 'sichtbar-machen' ? 3032 : 3057);
    expect(automatischeKorrekturOberhalbErlaubt()).toBe(true);
    expect(h.position).toHaveBeenCalled();
  },
);

it('Höhenwechsel verwirft zugestellten Resizeframe; nächste Resizekorrektur verwendet frischen Anker', async () => {
  const h = await render();
  await act(async () => h.resize());
  await tick();
  h.setDelta(70);
  await act(async () => h.resize());
  const alt = [...frames.values()];
  await h.aendereDarstellung();
  const nachDarstellung = h.container.scrollTop;
  h.writes.length = 0;
  await act(async () => alt.forEach((fn) => fn(performance.now())));
  expect(h.writes).toEqual([]);
  await act(async () => h.resize());
  await tick();
  h.setDelta(110);
  await act(async () => h.resize());
  await tick();
  expect(h.container.scrollTop).toBe(nachDarstellung + 40);
});

it.each(['neuer-auftrag', 'unmount'] as const)(
  'Höhenwechsel und %s lassen keine überholte Fortsetzung zu',
  async (fall) => {
    const h = await render(true);
    const alt = vi.fn();
    await start(h, '2', alt);
    await timers();
    await h.aendereDarstellung();
    const neu = vi.fn();
    if (fall === 'neuer-auftrag') await start(h, '4', neu);
    else {
      await cleanup();
      cleanup = async () => {};
    }
    h.writes.length = 0;
    await settle();
    expect(alt).not.toHaveBeenCalled();
    if (fall === 'neuer-auftrag') {
      expect(neu).toHaveBeenCalledTimes(1);
      expect(h.writes.every((wert) => wert === 4032)).toBe(true);
    } else expect(h.writes).toEqual([]);
  },
);

it('Breitenbedingter Keywechsel hält den Bildschirmanker nach dem neuen Renderstand', async () => {
  const h = await render();
  await scroll(h, 1100);
  await tick();
  h.keyVerschiebtLayout();
  const dom = h.container.querySelector<HTMLElement>('[data-index="1"]')!;
  const vorher = dom.getBoundingClientRect().top;
  await act(async () => {
    h.setBreite(400);
    h.resize();
  });
  await tick();
  await act(async () => vi.advanceTimersByTime(150));
  for (let i = 0; i < 5; i++) await tick();
  expect(String(h.steuerung.textListe.zeilen[0]!.key)).toContain(',296,');
  expect(Math.abs(dom.getBoundingClientRect().top - vorher)).toBeLessThanOrEqual(1);
  expect(h.container.scrollTop).toBe(1270);
  expect(automatischeKorrekturOberhalbErlaubt()).toBe(true);
});

it.each([false, true])(
  'Resize bündelt jüngste Breite, Scrollen und Darstellungswechsel (StrictMode: %s)',
  async (strict) => {
    const h = await render(strict);
    h.keyVerschiebtLayout();
    await scroll(h, 1100);
    await tick();
    await act(async () => {
      h.setBreite(400);
      h.resize();
    });
    await tick();
    await act(async () => vi.advanceTimersByTime(100));
    await act(async () => {
      h.setBreite(600);
      h.resize();
    });
    await scroll(h, 1200);
    await tick();
    await act(async () => vi.advanceTimersByTime(100));
    await act(async () => {
      h.setBreite(400);
      h.resize();
    });
    await h.aendereDarstellung();
    await scroll(h, 1300);
    await tick();
    await act(async () => vi.advanceTimersByTime(149));
    expect(String(h.steuerung.textListe.zeilen[0]!.key)).toContain(',600,');
    h.position.mockClear();
    await act(async () => vi.advanceTimersByTime(1));
    expect(automatischeKorrekturOberhalbErlaubt()).toBe(false);
    expect(h.position).not.toHaveBeenCalled();
    await scroll(h, h.container.scrollTop - 50); // Dieselbe Nutzerbewegung nach der ersten Korrektur, während der Nachmessung.
    await tick();
    await tick();
    await tick();
    expect(h.container.scrollTop).toBe(1420);
    expect(String(h.steuerung.textListe.zeilen[0]!.key)).toContain('[24,');
    expect(String(h.steuerung.textListe.zeilen[0]!.key)).toContain(',296,12,true,"justify"');
    expect(automatischeKorrekturOberhalbErlaubt()).toBe(true);
    expect(h.position).toHaveBeenCalledTimes(1);
    h.stand.mockClear();
    await act(async () => h.container.dispatchEvent(new window.Event('scroll')));
    await tick();
    expect(h.stand.mock.lastCall?.[0].benutzerscrollen).toBe(false);
    await scroll(h, 1500);
    await tick();
    expect(h.stand.mock.lastCall?.[0].benutzerscrollen).toBe(true);
    expect(h.position).toHaveBeenLastCalledWith({ index: 1, offsetInItem: 460 });
  },
);

it.each(['renderabwarten', 'korrektur'] as const)(
  'neuer Resize während %s ersetzt alte Fortsetzungen und die Breite',
  async (phase) => {
    const h = await render();
    h.keyVerschiebtLayout();
    await scroll(h, 1100);
    await tick();
    await act(async () => {
      h.setBreite(400);
      h.resize();
    });
    await tick();
    await act(async () => vi.advanceTimersByTime(150));
    if (phase === 'korrektur') await tick();
    const alt = [...frames.values()];
    await act(async () => {
      h.setBreite(800);
      h.resize();
    });
    h.writes.length = 0;
    h.position.mockClear();
    await act(async () => alt.forEach((fn) => fn(performance.now())));
    expect(h.writes).toEqual([]);
    expect(h.position).not.toHaveBeenCalled();
    await tick();
    await act(async () => vi.advanceTimersByTime(150));
    for (let n = 0; n < 5; n++) await tick();
    expect(h.container.scrollTop).toBe(1100);
    expect(String(h.steuerung.textListe.zeilen[0]!.key)).toContain(',600,');
    expect(automatischeKorrekturOberhalbErlaubt()).toBe(true);
    expect(h.position).toHaveBeenCalledTimes(1);
  },
);

it('Resize zwischen Breitenfreigabe und Commit erhält den jüngeren Vorgang bei gleicher Breite', async () => {
  const h = await render();
  h.keyVerschiebtLayout();
  await scroll(h, 1100);
  await tick();
  await act(async () => {
    h.setBreite(400);
    h.resize();
  });
  await tick();
  await act(async () => {
    vi.advanceTimersByTime(150);
    h.resize();
  });
  expect(automatischeKorrekturOberhalbErlaubt()).toBe(false);
  await tick();
  h.position.mockClear();
  await act(async () => vi.advanceTimersByTime(149));
  expect(h.position).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(1));
  for (let n = 0; n < 5; n++) await tick();
  expect(h.container.scrollTop).toBe(1270);
  expect(automatischeKorrekturOberhalbErlaubt()).toBe(true);
  expect(h.position).toHaveBeenCalledTimes(1);
});

it('Darstellungswechsel in der Messkorrektur hält den Breitenanker mit neuester Schrift', async () => {
  const h = await render();
  h.keyVerschiebtLayout();
  await scroll(h, 1100);
  await tick();
  await act(async () => {
    h.setBreite(400);
    h.resize();
  });
  await tick();
  await act(async () => vi.advanceTimersByTime(150));
  const alt = [...frames.values()];
  await h.aendereDarstellung();
  await act(async () => alt.forEach((fn) => fn(performance.now())));
  await act(async () => vi.advanceTimersByTime(0));
  for (let n = 0; n < 5; n++) await tick();
  expect(h.container.scrollTop).toBe(1270);
  expect(String(h.steuerung.textListe.zeilen[0]!.key)).toContain('[24,');
  expect(automatischeKorrekturOberhalbErlaubt()).toBe(true);
});

it.each(['timer', 'renderabwarten', 'korrektur'] as const)(
  'Unmount während Breiten%s verhindert Schreibvorgänge und Rückmeldungen',
  async (phase) => {
    const h = await render(true);
    await act(async () => {
      h.setBreite(400);
      h.resize();
    });
    await tick();
    if (phase !== 'timer') await act(async () => vi.advanceTimersByTime(150));
    if (phase === 'korrektur') await tick();
    const alt = [...frames.values()];
    await cleanup();
    cleanup = async () => {};
    h.position.mockClear();
    h.writes.length = 0;
    await act(async () => alt.forEach((fn) => fn(performance.now())));
    await act(async () => vi.advanceTimersByTime(500));
    for (let n = 0; n < 25; n++) await tick();
    expect(h.writes).toEqual([]);
    expect(h.position).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  },
);

it.each(
  (['timer', 'renderabwarten', 'korrektur'] as const).flatMap((phase) =>
    (['sichtbar-machen', 'wiederherstellen', 'anker-halten'] as const).map((art) => ({
      phase,
      art,
    })),
  ),
)(
  'Zielauftrag $art während Breiten$phase hat Vorrang; die aufgeschobene Breite hält danach den Zielanker',
  async ({ phase, art }) => {
    const h = await render(true);
    h.keyVerschiebtLayout();
    await scroll(h, 1100);
    await tick();
    await act(async () => {
      h.setBreite(400);
      h.resize();
    });
    await tick();
    if (phase !== 'timer') await act(async () => vi.advanceTimersByTime(150));
    if (phase === 'korrektur') await tick();
    const alt = [...frames.values()];
    let zielTop = 0;
    const dom = h.container.querySelector<HTMLElement>('[data-index="4"]')!;
    const fertig = vi.fn(() => {
      zielTop = dom.getBoundingClientRect().top;
    });
    await act(async () => {
      h.steuerung.bereiteAuftragVor(); // strukturelles Renderabwarten
      alt.forEach((fn) => fn(performance.now()));
      h.setBreite(600);
      h.resize();
      h.setBreite(400);
      h.resize();
      const auftrag =
        art === 'sichtbar-machen'
          ? { art, elementId: '4' }
          : art === 'wiederherstellen'
            ? { art, elementId: '4', offsetInItem: 17 }
            : {
                art,
                elementId: '4',
                anker: { elementId: '4', bildschirmTop: 100, offsetInItem: 0, istFallback: false },
              };
      h.steuerung.starteAuftrag(auftrag, fertig);
    });
    await settle();
    expect(fertig).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(150));
    for (let n = 0; n < 25; n++) await tick();
    expect(String(h.steuerung.textListe.zeilen[0]!.key)).toContain(',296,');
    expect(Math.abs(dom.getBoundingClientRect().top - zielTop)).toBeLessThanOrEqual(1);
    expect(automatischeKorrekturOberhalbErlaubt()).toBe(true);
  },
);

it('eine nicht mehr messbare Breitenreferenz beendet die begrenzte Korrektur ohne instabile Tabmeldung', async () => {
  const h = await render();
  const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await act(async () => {
    h.setBreite(400);
    h.resize();
  });
  await tick();
  await act(async () => vi.advanceTimersByTime(150));
  h.container.querySelectorAll('[data-index]').forEach((dom) => dom.remove());
  h.position.mockClear();
  for (let n = 0; n < 25; n++) await tick();
  expect(warnung).toHaveBeenCalledTimes(1);
  expect(h.position).not.toHaveBeenCalled();
  expect(automatischeKorrekturOberhalbErlaubt()).toBe(true);
  expect(frames.size).toBe(0);
  warnung.mockRestore();
});

it('Layoutänderungen starten die Zielmessung höchstens einmal neu und entwerten deren alte Antwort', async () => {
  const antworten: ((hoehe: number) => void)[] = [];
  const h = await render(false, {
    onZielMessen: (_id, bestaetigen) => {
      antworten.push(bestaetigen);
      return () => {};
    },
  });
  const fertig = vi.fn();
  await start(h, '4', fertig);
  await h.aendereGeometrie({ schriftgroesse: 18 });
  await h.aendereGeometrie({ schriftgroesse: 20 });
  expect(antworten).toHaveLength(2);
  await act(async () => antworten[0]?.(700));
  await tick();
  expect(h.writes).toEqual([]);
  await act(async () => antworten[1]?.(60));
  await settle();
  expect(h.writes).toEqual([3972]);
  expect(fertig).toHaveBeenCalledTimes(1);
});

it('hält den vorherigen Textanker schon beim ersten Umbruch einer eingeblendeten Leiste', async () => {
  const h = await render();
  await scroll(h, 1200);
  h.setDelta(90); // Der Browser bricht bereits vor der Observerzustellung um.
  h.setBreite(400);
  await act(async () => h.resize());
  await settle();
  await act(async () => vi.advanceTimersByTime(160));
  await settle();
  expect(h.container.scrollTop).toBe(1290);
});

it('behandelt automatische Höhenkorrekturen vor der Resizezustellung nicht als Nutzerbewegung', async () => {
  const h = await render();
  await scroll(h, 1200);
  h.setDelta(90);
  h.container.scrollTop = 1290;
  h.setBreite(400);
  await act(async () => h.resize());
  await settle();
  await act(async () => vi.advanceTimersByTime(160));
  await settle();
  expect(h.container.scrollTop).toBe(1290);
});

it('hält beim Wechsel des Minimalmodus den vorherigen Textanker auch ohne Containerresize', async () => {
  const h = await render();
  await scroll(h, 1200);
  h.setDelta(90);
  await h.aendereGeometrie({ inhaltEinzug: 0 });
  await settle();
  await act(async () => vi.advanceTimersByTime(160));
  await settle();
  expect(h.container.scrollTop).toBe(1290);
});

describe('Klappanker des aktiven Elements', () => {
  it('hält die sichtbare aktive Norm unmittelbar ohne Timer an ihrer Bildschirmposition', async () => {
    const h = await render();
    Object.defineProperty(h.container, 'clientTop', { value: 0 });
    const block = h.container.querySelector('[data-index="0"]');
    if (!block) throw new Error('Testblock fehlt');
    const zeile = document.createElement('div');
    zeile.className = 'gt-klapp-zeile';
    zeile.getBoundingClientRect = () => klappRect(40, 70);
    block.append(zeile);
    const anker = h.steuerung.erfasseKlappAnker('0', 'auf');
    expect(anker).toMatchObject({
      elementId: '0',
      bildschirmTop: 40,
      offsetInItem: 0,
      haltung: 'stelle',
    });
    if (!anker) throw new Error('Klappanker fehlt');
    h.setDelta(160);
    await act(async () =>
      h.steuerung.starteAuftrag(h.steuerung.erstelleKlappAuftrag(anker, { zielId: '0' }, 'auf')),
    );
    expect(block.getBoundingClientRect().top).toBe(40);
  });
});

it.each<['auf' | 'zu', string, boolean, string, number]>([
  ['auf', '0', true, '0', 260],
  ['zu', '0', true, '0', 0],
  ['auf', '0', false, '2', 0],
  ['auf', 'fehlt', true, '2', 0],
])(
  'Klappanker %s bei %s mit Normtext %s verwendet %s und Offset %s',
  async (richtung, aktiv, koerperSichtbar, erwartet, offset) => {
    const h = await render(false, { leisteHoehe: 100 });
    Object.defineProperty(h.container, 'clientTop', { value: 0 });
    h.container.scrollTop = 200;
    const block = h.container.querySelector('[data-index="0"]');
    if (!block) throw new Error('Testblock fehlt');
    const zeile = document.createElement('div');
    zeile.className = 'gt-klapp-zeile';
    zeile.getBoundingClientRect = () => klappRect(-160, -120);
    block.append(zeile);
    if (koerperSichtbar) {
      const text = document.createElement('div');
      text.setAttribute('data-scroll-koerper', '');
      text.getBoundingClientRect = () => klappRect(-120, 840);
      block.append(text);
    }
    expect(h.steuerung.erfasseKlappAnker(aktiv, richtung)).toMatchObject({
      elementId: erwartet,
      offsetInItem: offset,
    });
  },
);

function klappRect(top: number, bottom: number): DOMRect {
  return {
    top,
    bottom,
    left: 0,
    right: 100,
    width: 100,
    height: bottom - top,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}

it.each([
  [100, 500, 100],
  [100, -500, 0],
  [0, 500, 0],
])(
  'P2-A7: Scrollgrenze %s klemmt Änderung %s bei %s und beendet die Korrektur',
  async (maximum, delta, erwartet) => {
    const h = await render(false, {}, maximum);
    const fertig = vi.fn();
    h.setDelta(delta);
    const anker: KlappAnker = {
      elementId: '0',
      offsetInItem: 0,
      bildschirmTop: 40,
      istFallback: false,
      haltung: 'stelle',
    };
    await act(async () =>
      h.steuerung.starteAuftrag({ art: 'anker-halten', elementId: '0', anker }, fertig),
    );
    for (let n = 0; n < 19; n++) await tick();
    expect(fertig).toHaveBeenCalledTimes(1);
    expect(h.container.scrollTop).toBe(erwartet);
    expect(frames.size).toBe(0);
  },
);

it('misst für den aktiven Klappanker ausschließlich das benötigte Element', async () => {
  const h = await render();
  Object.defineProperty(h.container, 'clientTop', { value: 0 });
  h.container.scrollTop = 900;
  for (const index of [0, 1]) {
    const block = h.container.querySelector(`[data-index="${index}"]`);
    if (!block) throw new Error('Testblock fehlt');
    const zeile = document.createElement('div');
    zeile.className = 'gt-klapp-zeile';
    zeile.getBoundingClientRect =
      index === 0
        ? () => {
            throw new Error('Unbenötigte Normzeile wurde gemessen');
          }
        : () => klappRect(140, 170);
    block.append(zeile);
  }
  expect(h.steuerung.erfasseKlappAnker('1', 'auf')).toMatchObject({
    elementId: '1',
    bildschirmTop: 140,
  });
});

it.each([0, 1, 3])(
  'P3-A3: Normzeile %s px unter der Leiste wählt den passenden Klappauftrag',
  async (abstand) => {
    const h = await render(false, { leisteHoehe: 100 });
    Object.defineProperty(h.container, 'clientTop', { value: 0 });
    const block = h.container.querySelector('[data-index="0"]');
    if (!block) throw new Error('Testblock fehlt');
    const zeile = document.createElement('div');
    zeile.className = 'gt-klapp-zeile';
    zeile.getBoundingClientRect = () => klappRect(100 + abstand, 140 + abstand);
    block.append(zeile);
    const anker = h.steuerung.erfasseKlappAnker('0', 'zu');
    if (!anker) throw new Error('Klappanker fehlt');
    const auftrag = h.steuerung.erstelleKlappAuftrag(anker, { zielId: '1' }, 'zu');
    expect(auftrag).toMatchObject(
      abstand < 2
        ? { art: 'sichtbar-machen', elementId: '1', ausrichtung: 'oben', animieren: false }
        : { art: 'anker-halten', elementId: '1' },
    );
  },
);

it.each([0, 100])(
  'P3-A4: nicht animiertes Anlegen respektiert die Scrollgrenze %s ohne spätere Änderung',
  async (maximum) => {
    const h = await render(
      false,
      {
        onZielMessen: (_id, bestaetigen) => {
          bestaetigen(120);
          return () => {};
        },
      },
      maximum,
    );
    const anker: KlappAnker = {
      elementId: '0',
      bildschirmTop: -100,
      offsetInItem: 0,
      istFallback: false,
      haltung: 'sichtbar-machen',
      ausrichtung: 'oben',
      animieren: false,
    };
    const fertig = vi.fn();
    await act(async () =>
      h.steuerung.starteAuftrag(
        h.steuerung.erstelleKlappAuftrag(anker, { zielId: '1' }, 'zu'),
        fertig,
      ),
    );
    expect(h.container.scrollTop).toBe(maximum);
    expect(fertig).toHaveBeenCalledTimes(1);
    await tick();
    expect(h.container.scrollTop).toBe(maximum);
  },
);

it('P5-A1/A8: schnelle Wiederholung hält das noch ausstehende Ankerziel statt der Zwischenposition', async () => {
  const h = await render();
  const anker: KlappAnker = {
    elementId: '0',
    bildschirmTop: 40,
    offsetInItem: 17,
    istFallback: false,
    haltung: 'stelle',
  };
  const block = h.container.querySelector('[data-index="0"]');
  assert(block);
  block.remove(); // Das Ziel wird beim ersten Auftrag noch nicht gerendert.
  h.setDelta(160);
  await act(async () => h.steuerung.starteAuftrag({ art: 'anker-halten', elementId: '0', anker }));
  h.container.append(block);
  h.setDelta(240); // Noch nicht korrigierter Umbruch vor dem zweiten Klappen.
  const weiter = h.steuerung.erfasseKlappAnker('0', 'auf');
  expect(weiter).toMatchObject(anker);
  if (!weiter) throw new Error('Klappanker fehlt');
  const alt = [...frames.values()];
  await act(async () => {
    h.steuerung.bereiteAuftragVor();
    h.steuerung.starteAuftrag(h.steuerung.erstelleKlappAuftrag(weiter, { zielId: '0' }, 'auf'));
  });
  expect(h.container.scrollTop).toBe(240);
  h.writes.length = 0;
  h.stand.mockClear();
  await act(async () => alt.forEach((fn) => fn(performance.now())));
  expect(h.writes).toEqual([]);
  expect(h.stand).not.toHaveBeenCalled();
  await settle();
  expect(h.container.scrollTop).toBe(240);
});

it.each(['auf', 'zu'] as const)(
  'P5-A2/A3/A8: %s übernimmt laufende Zielmessung, Ausrichtung und Animation; alte Antworten ändern keine Position oder Leiste',
  async (richtung) => {
    const antworten: ((hoehe: number) => void)[] = [];
    const uebernehmen = vi.fn();
    const h = await render(false, {
      onZielMessen: (_id, bestaetigen) => {
        antworten.push(bestaetigen);
        return () => {};
      },
      onZielUebernehmen: uebernehmen,
    });
    await act(async () =>
      h.steuerung.starteAuftrag({
        art: 'sichtbar-machen',
        elementId: '3',
        ausrichtung: 'oben',
        animieren: false,
      }),
    );
    const anker = h.steuerung.erfasseKlappAnker('3', richtung);
    expect(anker).toMatchObject({
      elementId: '3',
      haltung: 'sichtbar-machen',
      ausrichtung: 'oben',
      animieren: false,
    });
    if (!anker) throw new Error('Klappanker fehlt');
    await act(async () => {
      h.steuerung.bereiteAuftragVor();
      h.steuerung.starteAuftrag(h.steuerung.erstelleKlappAuftrag(anker, { zielId: '2' }, richtung));
    });
    await start(h, '4'); // Ein neuer Sprung ersetzt auch den übernommenen Klappauftrag.
    await act(async () => {
      antworten[0]?.(200);
      antworten[1]?.(300);
    });
    await tick();
    expect(h.writes).toEqual([]);
    expect(uebernehmen).not.toHaveBeenCalled();
    await act(async () => antworten[2]?.(60));
    await settle();
    expect(h.writes).toEqual([3972]);
    expect(uebernehmen).toHaveBeenCalledExactlyOnceWith('4', 60);
  },
);

it('P5-A3: Klappen während Animation behält den Auftrag ohne feste Ausrichtung und mit Animation', async () => {
  const h = await render();
  h.container.scrollTop = 1400;
  await start(h, '1');
  await tick(1);
  const anker = h.steuerung.erfasseKlappAnker('1', 'auf');
  expect(anker).toMatchObject({ elementId: '1', haltung: 'sichtbar-machen' });
  if (!anker) throw new Error('Klappanker fehlt');
  expect(h.steuerung.erstelleKlappAuftrag(anker, { zielId: '2' }, 'auf')).toEqual({
    art: 'sichtbar-machen',
    elementId: '2',
    ausrichtung: undefined,
    animieren: undefined,
  });
  const alt = [...frames.values()];
  await act(async () => {
    h.steuerung.bereiteAuftragVor();
    h.steuerung.starteAuftrag(h.steuerung.erstelleKlappAuftrag(anker, { zielId: '1' }, 'auf'));
  });
  h.writes.length = 0;
  await act(async () => alt.forEach((fn) => fn(performance.now() + 1000)));
  expect(h.writes).toEqual([]);
  await settle();
  expect(h.container.scrollTop).toBe(1032);
});

it.each(['rueckfall', 'anderes-element', 'wiederherstellen', 'nutzerscrollen'] as const)(
  'P5-A4/A5: %s übernimmt kein altes Ankerziel und misst die aktive Norm neu',
  async (fall) => {
    const h = await render();
    Object.defineProperty(h.container, 'clientTop', { value: 0 });
    const block = h.container.querySelector('[data-index="0"]');
    assert(block);
    const normzeile = document.createElement('div');
    normzeile.className = 'gt-klapp-zeile';
    normzeile.getBoundingClientRect = () => klappRect(40, 70);
    block.append(normzeile);
    await act(async () =>
      h.steuerung.starteAuftrag(
        fall === 'wiederherstellen'
          ? { art: 'wiederherstellen', elementId: '0', offsetInItem: 17 }
          : {
              art: 'anker-halten',
              elementId: fall === 'anderes-element' ? '1' : '0',
              anker: {
                elementId: '0',
                bildschirmTop: 200,
                offsetInItem: 17,
                istFallback: fall === 'rueckfall',
              },
            },
      ),
    );
    if (fall === 'nutzerscrollen')
      await act(async () => h.container.dispatchEvent(new window.Event('wheel')));
    expect(h.steuerung.erfasseKlappAnker('0', 'auf')).toMatchObject({
      elementId: '0',
      bildschirmTop: 40,
      offsetInItem: 0,
      istFallback: false,
      haltung: 'stelle',
    });
  },
);

it.each(['auf', 'zu'] as const)(
  'P5-A2: %s während nicht animiertem Anlegen landet mit acht Pixeln Abstand zur neuesten Zielhöhe',
  async (richtung) => {
    const antworten: ((hoehe: number) => void)[] = [];
    const h = await render(false, {
      onZielMessen: (_id, bestaetigen) => {
        antworten.push(bestaetigen);
        return () => {};
      },
    });
    await act(async () =>
      h.steuerung.starteAuftrag({
        art: 'sichtbar-machen',
        elementId: '3',
        ausrichtung: 'oben',
        animieren: false,
      }),
    );
    const anker = h.steuerung.erfasseKlappAnker('3', richtung);
    if (!anker) throw new Error('Klappanker fehlt');
    await act(async () => {
      h.steuerung.bereiteAuftragVor();
      h.steuerung.starteAuftrag(h.steuerung.erstelleKlappAuftrag(anker, { zielId: '2' }, richtung));
      antworten[1]?.(120);
    });
    const block = h.container.querySelector('[data-index="2"]');
    assert(block);
    expect(block.getBoundingClientRect().top).toBe(128);
    h.writes.length = 0;
    await act(async () => antworten[0]?.(300));
    await settle();
    expect(h.writes).toEqual([]);
    expect(block.getBoundingClientRect().top).toBe(128);
  },
);
