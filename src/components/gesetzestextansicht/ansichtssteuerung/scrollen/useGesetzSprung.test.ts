// useGesetzSprung.test.ts
// Kontrollierte Frames prüfen die tatsächliche Hook-Lebensdauer einschließlich StrictMode.
import { normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { act, createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GesetzSprungParams } from './useGesetzSprung';
import { useGesetzSprung } from './useGesetzSprung';

let frames: Map<number, FrameRequestCallback>;
let frameId: number;
let aufraeumen: () => Promise<void>;
beforeEach(() => {
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  frames = new Map();
  frameId = 0;
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    frames.set(++frameId, fn);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
});
afterEach(async () => {
  await aufraeumen?.();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
async function tick() {
  const jetzt = [...frames.values()];
  frames.clear();
  await act(async () => jetzt.forEach((fn) => fn(performance.now() + 1000)));
}
async function render(
  strict = false,
  extra: Partial<GesetzSprungParams> | Record<string, unknown> = {},
) {
  const root = createRoot(document.getElementById('root')!);
  const positionen: number[] = [];
  let top = 0;
  const container = document.createElement('div');
  Object.defineProperties(container, {
    clientHeight: { value: 400 },
    scrollTop: {
      get: () => top,
      set(wert: number) {
        top = wert;
        positionen.push(wert);
      },
    },
  });
  const params = {
    containerRef: { current: container },
    virtualizer: {
      getVirtualItems: () =>
        Array.from({ length: 3 }, (_, index) => ({ index, start: index * 2000 - 40, size: 100 })),
      getOffsetForIndex: (i: number) => [i * 2000],
      getTotalSize: () => 6000,
    },
    leisteHoeheRef: { current: 0 },
    sichtbareElemente: Array.from({ length: 3 }, (_, i) => ({
      typ: 'norm',
      data: normaleNorm({ id: String(i), xmlId: String(i), absaetze: [] }),
    })),
    schriftgroesse: 16,
    kontextAktualisieren: vi.fn(),
    polsterZuruecksetzen: vi.fn(),
    kontextPfadFuerZielSetzen: vi.fn(),
    springeAktivRef: { current: false },
    hoehenKontext: {
      eingeklappteUeberschriften: new Set(),
      eingeklappteNormen: new Set(),
      unterArtikelIds: new Set(),
      zeilenabstand: 1.5,
      textSpalteBreite: 600,
    },
    ...extra,
  } as unknown as GesetzSprungParams;
  let sprung!: ReturnType<typeof useGesetzSprung>;
  function Probe() {
    sprung = useGesetzSprung(params);
    return null;
  }
  await act(async () =>
    root.render(
      strict ? createElement(StrictMode, null, createElement(Probe)) : createElement(Probe),
    ),
  );
  aufraeumen = async () => {
    await act(async () => root.unmount());
  };
  return {
    params,
    positionen,
    springe: (...args: Parameters<typeof sprung.springeZuIndex>) => sprung.springeZuIndex(...args),
  };
}
describe('Scrollauftrags-Lebensdauer', () => {
  it('ersetzt auch die Korrekturframes: ausschließlich B schreibt und meldet Abschluss', async () => {
    const { springe, positionen, params } = await render();
    const a = vi.fn();
    const b = vi.fn();
    springe(1, a);
    springe(2, b);
    positionen.length = 0;
    for (let i = 0; i < 8; i++) await tick();
    expect(positionen.every((p) => p === 3992)).toBe(true);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    expect(params.springeAktivRef.current).toBe(false);
  });
  it('storniert beim Unmount sämtliche ausstehenden Korrekturframes', async () => {
    const { springe, positionen } = await render();
    const fertig = vi.fn();
    springe(1, fertig);
    await aufraeumen();
    aufraeumen = async () => {};
    positionen.length = 0;
    for (let i = 0; i < 8; i++) await tick();
    expect(positionen).toEqual([]);
    expect(fertig).not.toHaveBeenCalled();
    expect(frames.size).toBe(0);
  });
  it('nimmt nach dem StrictMode-Neustart einen gültigen Restore ohne Animation an', async () => {
    const { springe, positionen } = await render(true);
    const fertig = vi.fn();
    springe(1, fertig, 27, 0, false);
    expect(positionen).toEqual([2067]);
    for (let i = 0; i < 8; i++) await tick();
    expect(fertig).toHaveBeenCalledTimes(1);
  });
});

it('eine ausgebliebene Messantwort führt einmal bestmöglich weiter und die späte Antwort positioniert nicht erneut', async () => {
  vi.useFakeTimers();
  let antwort: ((hoehe: number) => void) | undefined;
  const { springe, positionen } = await render(false, {
    zielMessen: (_id, bestaetigen) => {
      antwort = bestaetigen;
      return () => {};
    },
  });
  const fertig = vi.fn();
  springe(1, fertig);
  expect(positionen).toEqual([]);
  await act(async () => vi.advanceTimersByTime(250));
  await tick();
  expect(positionen).toEqual([1992]);
  expect(fertig).toHaveBeenCalledTimes(1);
  antwort?.(700);
  await tick();
  await act(async () => vi.advanceTimersByTime(1000));
  expect(positionen).toEqual([1992]);
  expect(fertig).toHaveBeenCalledTimes(1);
});

it('P3-A6/A8: nicht animierte Landung übernimmt die gemessene Zielhöhe sofort und positioniert danach nicht erneut', async () => {
  let antwort: ((hoehe: number) => void) | undefined;
  const zielUebernehmen = vi.fn();
  const { springe, positionen, params } = await render(false, {
    zielMessen: (_id, bestaetigen) => {
      antwort = bestaetigen;
      return () => {};
    },
    zielUebernehmen,
  });
  const fertig = vi.fn();
  springe(1, fertig, 0, 0, true, 'flush-oben', false);
  expect(positionen).toEqual([]);
  await act(async () => antwort?.(120));
  expect(positionen).toEqual([1872]);
  expect(params.leisteHoeheRef.current).toBe(120);
  expect(zielUebernehmen).toHaveBeenCalledWith('1', 120);
  expect(fertig).toHaveBeenCalledTimes(1);
  await tick();
  antwort?.(180);
  expect(positionen).toEqual([1872]);
});

it('der verdeckte Erstaufbau behält die Frame-Fortsetzung nach bestätigter Zielhöhe', async () => {
  let antwort: ((hoehe: number) => void) | undefined;
  const { springe, positionen } = await render(false, {
    ansichtBereit: false,
    zielMessen: (_id, bestaetigen) => {
      antwort = bestaetigen;
      return () => {};
    },
  });
  springe(1, undefined, 0, 0, true, 'flush-oben', false);
  await act(async () => antwort?.(120));
  expect(positionen).toEqual([]);
  await tick();
  expect(positionen).toEqual([1872]);
});

describe('naher Sprung nach unten zeigt den Titel des nächsten Elements', () => {
  // Sechs aneinanderliegende Normen à 100 px (SCROLL_MARGIN 40 gleicht start -40 aus):
  // Element i reicht von i*100 bis i*100+100. Fenster 400 px, scrollTop 0, Schrift 16.
  // Vorschauabstand unter dem Titel: 0,25 × 16 = 4 px.
  const nahe = (leiste = 0, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    ...extra,
    leisteHoeheRef: { current: leiste },
    virtualizer: {
      getVirtualItems: () =>
        Array.from({ length: 6 }, (_, index) => ({ index, start: index * 100 - 40, size: 100 })),
      getOffsetForIndex: (i: number) => [i * 100 - 40],
      getTotalSize: () => 600,
    },
    // Normen mit Text, aber ohne Titel: eine ungemessene Titelzeile.
    sichtbareElemente: Array.from({ length: 6 }, (_, i) => ({
      typ: 'norm',
      data: normaleNorm({
        id: String(i),
        xmlId: String(i),
        absaetze: [{ id: `a${i}`, saetze: [{ id: `s${i}`, text: 'Inhalt.', eintraege: [] }] }],
      }),
    })),
  });

  it('Unterkante der nächsten Titelzeile (16 px Abstand + 1,3 × Schrift) an der Fensterunterkante', async () => {
    const { springe, positionen } = await render(false, nahe());
    springe(4, undefined, 0, 0, true, undefined, false);
    await tick();
    // Norm 4 endet bei 500, Titelzeile von Norm 5 bei 500 + 16 + 16 × 1,3 = 536,8, plus 4 px
    // Abstand = 540,8; 540,8 - 400 auf ganze Pixel aufgerundet.
    expect(positionen.at(-1)).toBe(141);
  });

  it('mehrzeiliger Titel des nächsten Elements wird vollständig gezeigt', async () => {
    // Zeilenmessung liefert drei Titelzeilen: 500 + 16 + 3 × 20,8 + 4 = 582,4 -> 183.
    const messung = { zeilenFuerText: () => 3, textBreite: () => 30 };
    const { springe, positionen, params } = await render(false, nahe());
    Object.assign(params.hoehenKontext, { messung });
    params.sichtbareElemente.forEach((el) => Object.assign(el.data, { titel: 'Langer Titel' }));
    springe(4, undefined, 0, 0, true, undefined, false);
    await tick();
    expect(positionen.at(-1)).toBe(183);
  });

  it('Vorschauabstand wächst mit der Schriftgröße', async () => {
    // Schrift 24: 500 + 16 + 24 × 1,3 + 0,25 × 24 = 553,2 -> 154.
    const { springe, positionen } = await render(false, nahe(0, { schriftgroesse: 24 }));
    springe(4, undefined, 0, 0, true, undefined, false);
    await tick();
    expect(positionen.at(-1)).toBe(154);
  });

  it('ohne nächstes Element: Unterkante der Norm an der Fensterunterkante', async () => {
    const { springe, positionen } = await render(false, nahe());
    springe(5, undefined, 0, 0, true, undefined, false);
    await tick();
    expect(positionen.at(-1)).toBe(600 - 400);
  });

  it('passt die Vorschau nicht mehr unter die Leiste, nur die Norm vollständig zeigen', async () => {
    // Platz unter der Leiste: 400 - 300 = 100 px – genau die Norm, ohne Vorschau.
    const { springe, positionen } = await render(false, nahe(300));
    springe(4, undefined, 0, 0, true, undefined, false);
    await tick();
    expect(positionen.at(-1)).toBe(500 - 400);
  });
});
