// Charakterisiert die Neuberechnung bei geänderter Buttonbreite und Resize.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { expect, it, vi } from 'vitest';
import { useTableisteScrollFades } from './useTableisteScrollFades';

it('berechnet nach einer Breitenänderung auch bei späterem Resize mit der aktuellen Breite', async () => {
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let resize = () => {};
  const disconnect = vi.fn();
  const observe = vi.fn();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    callback();
    return 1;
  });
  const leiste = document.createElement('div');
  const tab = document.createElement('div');
  tab.setAttribute('data-tab-id', 'tab');
  Object.defineProperty(tab, 'offsetWidth', { value: 80 });
  leiste.append(tab);
  let breite = 100;
  Object.defineProperties(leiste, {
    clientWidth: { get: () => breite },
    scrollWidth: { value: 120 },
    scrollLeft: { value: 0 },
  });
  const leisteRef = { current: leiste };
  const tabs: [] = [];
  let ergebnis: ReturnType<typeof useTableisteScrollFades>;
  function Test({ buttonBreite }: { buttonBreite: number }) {
    ergebnis = useTableisteScrollFades({
      leisteRef,
      tabs,
      aktiverTabId: null,
      neuerTabButtonBreite: buttonBreite,
    });
    return null;
  }
  const root = createRoot(document.getElementById('root')!);
  try {
    await act(async () => root.render(createElement(Test, { buttonBreite: 10 })));
    expect(ergebnis!.neuerTabButtonPasstInline).toBe(true);
    await act(async () => root.render(createElement(Test, { buttonBreite: 10 })));
    expect(observe).toHaveBeenCalledTimes(1);
    await act(async () => root.render(createElement(Test, { buttonBreite: 30 })));
    expect(ergebnis!.neuerTabButtonPasstInline).toBe(false);
    breite = 105;
    await act(async () => resize());
    expect(ergebnis!.neuerTabButtonPasstInline).toBe(false);
  } finally {
    await act(async () => root.unmount());
    expect(disconnect).toHaveBeenCalled();
    vi.unstubAllGlobals();
  }
});
