// Messbare DOM-Geometrie und Virtualizer für Hauptansicht-Integrationstests.
import { vi } from 'vitest';
import { act } from 'react';
import type { Root } from 'react-dom/client';
export function scrollNachfuehrungMessung(frame: (fn: FrameRequestCallback) => number) {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
      unobserve() {}
    },
  );
  vi.stubGlobal('requestAnimationFrame', frame);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 400,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get: () => 800,
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const block = this.closest<HTMLElement>('[data-index]');
    const container = block?.closest<HTMLElement>('[style*="overflow: auto"]');
    const top = block ? 40 + Number(block.dataset.index) * 1000 - (container?.scrollTop ?? 0) : 0;
    return {
      top,
      bottom: top + (block ? 30 : 400),
      height: block ? 30 : 400,
      left: 0,
      right: 800,
      width: 800,
      x: 0,
      y: top,
      toJSON() {},
    };
  });
}

export function scrollVirtualizerMessung(o: {
  count: number;
  getItemKey(i: number): string;
  getScrollElement(): HTMLElement | null;
}) {
  return {
    getVirtualItems: () => {
      // Wie der echte Virtualizer nur den sichtbaren Ausschnitt samt Überhang rendern.
      const sichtbar = Math.floor((o.getScrollElement()?.scrollTop ?? 0) / 1000);
      const anfang = Math.max(0, sichtbar - 8);
      const ende = Math.min(o.count, sichtbar + 9);
      return Array.from({ length: Math.max(0, ende - anfang) }, (_, offset) => {
        const index = anfang + offset;
        return { index, key: o.getItemKey(index), start: index * 1000, size: 1000 };
      });
    },
    getTotalSize: () => o.count * 1000,
    getOffsetForIndex: (i: number) => [i * 1000],
    measureElement: () => {},
    indexFromElement: (element: HTMLElement) => Number(element.dataset.index),
    resizeItem: () => {},
  };
}
export async function hauptansichtTestBeenden(root: Root, host: HTMLDivElement) {
  await act(async () => root?.unmount());
  host?.remove();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
}
