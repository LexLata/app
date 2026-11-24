// StrukturKontextLeiste.test.ts
// Auch nach Disconnect zugestellte Messcallbacks gehören nur ihrer Renderlebensdauer.
import { gliederungsartikel } from '@/test/gesetz/gesetzFabriken';
import { act, createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StrukturKontextLeiste } from './ansichtssteuerung.index';
import { type StrukturKontextLeisteProps } from '@/components/gesetzestextansicht/ansichtssteuerung/Ansichtssteuerung.types';
let callbacks: ResizeObserverCallback[];
let frames: Map<number, FrameRequestCallback>;
let cleanup: () => Promise<void>;
beforeEach(() => {
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  callbacks = [];
  frames = new Map();
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    frames.set(++id, fn);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (n: number) => frames.delete(n));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(fn: ResizeObserverCallback) {
        callbacks.push(fn);
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(async () => {
  await cleanup?.();
  vi.unstubAllGlobals();
});
async function render(strict = false, effektiveHoehe = 0) {
  const messen = vi.fn();
  const props: StrukturKontextLeisteProps = {
    schrift: 16,
    skalierungsFaktor: 0.85,
    maxBreite: 720,
    randInline: 52,
    minimalistischerModus: false,
    modell: {
      pfad: [],
      effektiveHoehe,
      hoeheAnimiert: false,
      bereit: true,
      waehleEintrag: vi.fn(),
      meldeGemesseneHoehe: messen,
    },
  };
  const root = createRoot(document.getElementById('root')!);
  await act(async () =>
    root.render(
      strict
        ? createElement(StrictMode, null, createElement(StrukturKontextLeiste, props))
        : createElement(StrukturKontextLeiste, props),
    ),
  );
  cleanup = async () => {
    await act(async () => root.unmount());
  };
  return messen;
}
async function tick() {
  const pending = [...frames.values()];
  frames.clear();
  await act(async () => pending.forEach((fn) => fn(1000)));
}
it('lässt bei leerem Pfad Klicks durch und zeigt keinen Kasten oder Eintrag', async () => {
  await render();
  const flaeche = document.querySelector<HTMLElement>('#root > div');
  expect(flaeche?.style.pointerEvents).toBe('none');
  expect(flaeche?.textContent).toBe('');
  expect(flaeche?.firstElementChild?.children).toHaveLength(0);
});
it.each([0, 60])('behält bei leerem Pfad die Polsterhöhe %s ohne Schattenraum', async (hoehe) => {
  await render(false, hoehe);
  const rahmen = document.querySelector<HTMLElement>('#root > div');
  expect(parseFloat(rahmen?.style.height ?? '')).toBe(hoehe);
  expect(rahmen?.querySelector('[style*="box-shadow"]')).toBeNull();
  expect(rahmen?.firstElementChild?.children).toHaveLength(0);
});
it('Unmount storniert geplante Messframes und ignoriert später zugestellte Resize-Callbacks', async () => {
  const messen = await render();
  expect(messen).toHaveBeenCalledWith(0);
  messen.mockClear();
  callbacks[0]!([], {} as ResizeObserver);
  await cleanup();
  cleanup = async () => {};
  callbacks[0]!([], {} as ResizeObserver);
  expect(frames.size).toBe(0);
  await tick();
  expect(messen).not.toHaveBeenCalled();
});
it('StrictMode hält ausschließlich die aktuelle Messlebensdauer offen', async () => {
  const messen = await render(true);
  expect(messen).toHaveBeenCalledWith(0);
  messen.mockClear();
  expect(callbacks).toHaveLength(2);
  callbacks[0]!([], {} as ResizeObserver);
  expect(frames.size).toBe(0);
  callbacks[1]!([], {} as ResizeObserver);
  await tick();
  expect(messen).toHaveBeenCalledTimes(1);
  expect(messen).toHaveBeenCalledWith(0);
});

it.each([
  [16, 0.85, 720, 13.6],
  [20, 1, 'none', 20],
  [20, 0.7, 800, 14],
] as const)(
  'erhält Umbrucheinzug, Breite und Navigation bei Schrift %s, Faktor %s und Grenze %s',
  async (schrift, skalierungsFaktor, maxBreite, erwartet) => {
    const original = '§ 9999 Abs. 1 I 2 😀';
    const pfad = [
      {
        ebene: 1,
        index: 0,
        ueberschrift: {
          id: 'u',
          xmlId: 'u',
          bezeichnung: 'Teil',
          titel: original,
          ebene: 1,
          gliederungskennzahl: '001',
        },
      },
      {
        ebene: 2,
        index: 1,
        gliederungsartikel: gliederungsartikel({
          art: 'gliederungsartikel',
          ueberschriftartig: false,
          id: 'n',
          xmlId: 'n',
          bezeichnung: 'Art. 2',
          titel: original,
          absaetze: [],
          gliederungsEbene: 2,
        }),
      },
    ];
    const waehleEintrag = vi.fn();
    const root = createRoot(document.getElementById('root')!);
    await act(async () =>
      root.render(
        createElement(StrukturKontextLeiste, {
          schrift,
          skalierungsFaktor,
          maxBreite,
          randInline: 52,
          minimalistischerModus: false,
          modell: {
            pfad,
            effektiveHoehe: 60,
            hoeheAnimiert: false,
            bereit: true,
            waehleEintrag,
            meldeGemesseneHoehe: vi.fn(),
          },
        }),
      ),
    );
    cleanup = async () => {
      await act(async () => root.unmount());
    };
    const eintraege = [...document.querySelectorAll<HTMLElement>('div')].filter(
      (el) => el.style.cursor === 'pointer',
    );
    expect(eintraege).toHaveLength(2);
    const rahmen = document.querySelector<HTMLElement>('#root > div');
    expect(rahmen?.style.height).toBe('66px');
    const kasten = document.querySelector<HTMLElement>('#root > div > div > div');
    expect(kasten?.style.boxShadow).toBe('0 2px 4px var(--strukturkontextleiste-schatten)');
    expect(eintraege[0]?.parentElement?.style.maxWidth).toBe(
      maxBreite === 'none' ? 'none' : `${maxBreite}px`,
    );
    for (const el of eintraege) {
      expect(Number(el.style.lineHeight)).toBe(1.2);
      expect(el.style.paddingInlineStart).toBe('1.2em');
      expect(el.style.textIndent).toBe('-1.2em');
      expect(parseFloat(el.style.fontSize)).toBeCloseTo(erwartet);
    }
    const gruppen = [...document.querySelectorAll('span')].filter(
      (el) => el.style.whiteSpace === 'nowrap',
    );
    expect(document.querySelector<HTMLElement>('#root > div')?.style.pointerEvents).toBe('none');
    expect(document.querySelector<HTMLElement>('#root > div > div')?.style.pointerEvents).toBe(
      'auto',
    );
    expect(gruppen.map((el) => el.textContent)).toEqual([
      '§\u00a09999',
      'Abs.\u00a01',
      'Art.\u00a02',
      '§\u00a09999',
      'Abs.\u00a01',
    ]);
    expect(document.body.textContent).toContain('I 2 😀');
    await act(async () => gruppen[0]!.dispatchEvent(new window.Event('click', { bubbles: true })));
    expect(waehleEintrag).toHaveBeenCalledWith(pfad[0]);
    expect(waehleEintrag.mock.calls[0]![0]).toBe(pfad[0]);
    await act(async () => gruppen[2]!.dispatchEvent(new window.Event('click', { bubbles: true })));
    expect(waehleEintrag.mock.calls[1]![0]).toBe(pfad[1]);
    expect(pfad[0]!.ueberschrift!.titel).toBe(original);
    expect(pfad[1]!.gliederungsartikel!.titel).toBe(original);
  },
);
