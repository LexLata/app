// scrollMessungHilfen.test.ts
// Verhaltenstests der Scroll-Messhilfen an durchgerechneten Beispielen.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import * as echt from '@tanstack/react-virtual';
import { afterEach, expect, it, vi } from 'vitest';
import { erstelleTestTextMessung } from '@/test/gesetz/testDarstellung';
import {
  installiereZaehlendesCanvas,
  setzeVirtualizerZaehlerZurueck,
  umhuellteBibliothek,
  virtualizerZaehler,
} from './scrollMessungHilfen';

afterEach(() => {
  vi.unstubAllGlobals();
});

function linkedomFenster() {
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  return window;
}

it('Canvas-Attrappe zählt für einen neuen Text je Wort und für den Wortabstand einen Messaufruf, für die Wiederholung keinen', () => {
  const window = linkedomFenster();
  const zaehler = installiereZaehlendesCanvas(window.HTMLCanvasElement.prototype);
  const messung = erstelleTestTextMessung();
  messung.zeilenFuerText('Der Vertrag ist nichtig', 400, 16);
  // Vier Wörter und einmal das Leerzeichen.
  expect(zaehler.messaufrufe).toBe(5);
  messung.zeilenFuerText('Der Vertrag ist nichtig', 400, 16);
  expect(zaehler.messaufrufe).toBe(5);
});

it('Hülle um useVirtualizer lässt virtuelle Elemente und Positionen unverändert und zählt Aufrufe', async () => {
  const window = linkedomFenster();
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => setTimeout(() => fn(0), 0));
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  const observer = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.ResizeObserver = observer;
  vi.stubGlobal('ResizeObserver', observer);
  const umhuellt = umhuellteBibliothek(echt);
  setzeVirtualizerZaehlerZurueck();
  const ergebnisse: unknown[][] = [];
  for (const bibliothek of [echt, umhuellt]) {
    const container = document.createElement('div');
    document.body.append(container);
    Object.defineProperties(container, {
      offsetHeight: { value: 400 },
      offsetWidth: { value: 800 },
      clientHeight: { value: 400 },
      clientWidth: { value: 800 },
    });
    const getItemKey = (i: number) => `k${i}`;
    let instanz!: ReturnType<typeof echt.useVirtualizer<HTMLDivElement, Element>>;
    function Probe() {
      instanz = bibliothek.useVirtualizer({
        count: 500,
        getScrollElement: () => container,
        getItemKey,
        estimateSize: (i) => 40 + (i % 5) * 10,
        overscan: 2,
      });
      return null;
    }
    const root = createRoot(document.body.appendChild(document.createElement('div')));
    await act(async () => root.render(createElement(Probe)));
    const zeile = document.createElement('div');
    zeile.setAttribute('data-index', '3');
    Object.defineProperty(zeile, 'getBoundingClientRect', { value: () => ({ height: 123 }) });
    container.append(zeile);
    await act(async () => instanz.measureElement(zeile));
    await act(async () => {
      container.scrollTop = 1500;
      container.dispatchEvent(new window.Event('scroll'));
    });
    ergebnisse.push(
      instanz.getVirtualItems().map(({ index, key, start, size }) => [index, key, start, size]),
      [instanz.getTotalSize()],
    );
    await act(async () => root.unmount());
    container.remove();
  }
  expect(ergebnisse[2]).toEqual(ergebnisse[0]);
  expect(ergebnisse[3]).toEqual(ergebnisse[1]);
  expect(ergebnisse[0]?.length).toBeGreaterThan(0);
  expect(virtualizerZaehler.getItemKey).toBeGreaterThanOrEqual(500);
  expect(virtualizerZaehler.hoehenmessungenMitAenderung).toBe(1);
  expect(virtualizerZaehler.neuberechnungen).toBeGreaterThanOrEqual(1);
});
