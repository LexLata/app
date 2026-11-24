// @vitest-environment jsdom
import { act, useLayoutEffect, useRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { createRoot } from 'react-dom/client';
import { useAdaptivesLeistenLayout } from './useAdaptivesLeistenLayout';

afterEach(() => vi.unstubAllGlobals());
it('übernimmt einen Spaltenwechsel ohne Folgebild und veröffentlicht gleiche Maße nicht erneut', async () => {
  let hoehe = 600;
  let melden: ResizeObserverCallback = () => {};
  const frames: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => frames.push(fn));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const observer: ResizeObserver = { observe() {}, unobserve() {}, disconnect() {} };
  vi.stubGlobal('ResizeObserver', function (callback: ResizeObserverCallback) {
    melden = callback;
    return observer;
  });
  const staende = vi.fn();
  function Probe() {
    const ref = useRef<HTMLDivElement>(null);
    const layout = useAdaptivesLeistenLayout(ref, 80, 11);
    useLayoutEffect(() => {
      staende(layout.zweiSpaltig);
    });
    return (
      <div
        ref={(el) => {
          ref.current = el;
          if (el)
            Object.defineProperty(el, 'clientHeight', { get: () => hoehe, configurable: true });
        }}
        data-spalten={layout.zweiSpaltig ? 2 : 1}
      />
    );
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Probe />));
    expect(host.firstElementChild?.getAttribute('data-spalten')).toBe('2');
    hoehe = 2500;
    await act(async () => melden([], observer));
    expect(host.firstElementChild?.getAttribute('data-spalten')).toBe('1');
    const anzahl = staende.mock.calls.length;
    await act(async () => melden([], observer));
    await act(async () => frames.splice(0).forEach((fn) => fn(0)));
    expect(staende).toHaveBeenCalledTimes(anzahl);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('nutzt die halbe Zusatzhöhe einer Folgekopfzeile tatsächlich und erhält die Mindesthöhe', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  function Probe() {
    const ref = useRef<HTMLDivElement>(null);
    const layout = useAdaptivesLeistenLayout(ref, 3, 11, 0, {
      erlaubteTeilungen: [],
      zusatzabstaende: [0, 0, 0],
      hoehenFaktoren: [1, 0.5, 1],
    });
    return (
      <div
        ref={(el) => {
          ref.current = el;
          if (el) Object.defineProperty(el, 'clientHeight', { value: 88 });
        }}
        data-zeilenabstand={layout.lineHeight}
        data-scroll={layout.scroll}
      />
    );
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Probe />));
    // 2 * 25,7 + (12,1 + (25,7 - 12,1) / 2) = 70,3; verfügbar: 72.
    expect(host.firstElementChild?.getAttribute('data-zeilenabstand')).toBe('1.7');
    expect(host.firstElementChild?.getAttribute('data-scroll')).toBe('false');
  } finally {
    await act(async () => root.unmount());
  }
});
