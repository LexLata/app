// navigationAnsicht.tsx
// Gemeinsame Bedien- und Geometriefixture für Navigations- und Klappprüfungen.
import {
  act,
  useMemo,
  type ReactNode,
  type RefObject,
  type CSSProperties,
  useLayoutEffect,
} from 'react';
import type { DarstellungsElement } from '@/lib/domain/gesetzTypes';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, vi } from 'vitest';
import { gesetzDarstellung, normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { erstelleTestTextMessung } from '@/test/gesetz/testDarstellung';
export const geometrie = {
  groesse: 100,
  gesamt: 3000,
  normHoehe: 0,
  leiste: 60,
  count: 0,
  key: (_i: number): string => '',
};
export const useTestVirtualizer = (o: { count: number; getItemKey(i: number): string }) => {
  geometrie.count = o.count;
  geometrie.key = o.getItemKey;
  return useMemo(
    () => ({
      getVirtualItems: () =>
        Array.from({ length: geometrie.count }, (_, index) => ({
          index,
          key: geometrie.key(index),
          start: index * geometrie.groesse,
          size: geometrie.groesse,
        })),
      getOffsetForIndex: (i: number) => [i * geometrie.groesse],
      getTotalSize: () => geometrie.gesamt,
      measureElement() {},
      indexFromElement: (element: HTMLElement) => Number(element.dataset.index),
      resizeItem() {},
    }),
    [],
  );
};
const elemente = Array.from({ length: 20 }, (_, i) =>
  i === 4 || i === 10
    ? {
        typ: 'ueberschrift' as const,
        data: {
          id: `u${i}`,
          xmlId: `u${i}`,
          ebene: 1,
          bezeichnung: `Kapitel ${i}`,
          gliederungskennzahl: `${i}`,
        },
      }
    : {
        typ: 'norm' as const,
        data: normaleNorm({ id: `n${i}`, xmlId: `n${i}`, bezeichnung: `§ ${i}`, absaetze: [] }),
      },
);
export function richteNavigationAnsichtEin<T extends Parameters<typeof zeichneNavigationText>[0]>(
  useAnsicht: (o: ReturnType<typeof ansichtsOptionen>) => T,
  zeichneLeiste: (ansicht: T) => ReactNode,
) {
  let aktuelleAnsicht: T | undefined;
  let root: Root;
  let host: HTMLDivElement;
  let frames: Map<number, FrameRequestCallback>;
  let laufendeId: number;
  let groessenMelden: (() => void)[];
  beforeEach(() => {
    geometrie.normHoehe = 0;
    geometrie.leiste = 60;
    geometrie.groesse = 100;
    geometrie.gesamt = 3000;
    frames = new Map();
    groessenMelden = [];
    laufendeId = 0;
    vi.useFakeTimers();
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
      frames.set(++laufendeId, fn);
      return laufendeId;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private callback: ResizeObserverCallback) {}
        observe(element: HTMLElement) {
          let letzteHoehe = -1;
          const melden = () => {
            if (letzteHoehe === element.offsetHeight) return;
            letzteHoehe = element.offsetHeight;
            this.callback([], this);
          };
          groessenMelden.push(melden);
          melden();
        }
        disconnect() {}
        unobserve() {}
      },
    );
    Object.defineProperties(HTMLElement.prototype, {
      clientHeight: { configurable: true, get: () => 400 },
      clientWidth: { configurable: true, get: () => 800 },
      offsetHeight: {
        configurable: true,
        get() {
          return this.textContent ? geometrie.leiste : 0;
        },
      },
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const block = this.closest<HTMLElement>('[data-index]');
      const top = block
        ? 40 + Number(block.dataset.index) * geometrie.groesse - container().scrollTop
        : 0;
      return {
        top,
        bottom: top + (block ? geometrie.normHoehe || geometrie.groesse - 20 : 400),
        height: block ? geometrie.groesse - 20 : 400,
        left: 0,
        right: 800,
        width: 800,
        x: 0,
        y: top,
        toJSON() {},
      };
    });
  });
  afterEach(async () => {
    await act(async () => root?.unmount());
    host?.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  async function starten(initialNorm?: string, framesAbwarten = true) {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    function Probe() {
      const ansicht = useAnsicht(ansichtsOptionen(initialNorm));
      useLayoutEffect(() => {
        aktuelleAnsicht = ansicht;
      });
      return zeichneNavigationText(ansicht, zeichneLeiste(ansicht));
    }

    await act(async () => root.render(<Probe />));
    if (framesAbwarten) await abwarten();
    return async (ziel: string) => {
      initialNorm = ziel;
      await act(async () => root.render(<Probe />));
    };
  }
  async function abwarten() {
    await act(async () => vi.advanceTimersByTime(1000));
    for (let i = 0; i < 8; i++) {
      await act(async () => groessenMelden.forEach((melden) => melden()));
      const aktuell = [...frames.values()];
      frames.clear();
      await act(async () => aktuell.forEach((fn) => fn(performance.now() + 1000)));
    }
  }

  function container() {
    const dom = host.querySelector<HTMLDivElement>('div');
    if (!dom) throw new Error('Textcontainer fehlt');
    return dom;
  }
  return {
    get ansicht() {
      if (!aktuelleAnsicht) throw new Error('Ansicht fehlt');
      return aktuelleAnsicht;
    },
    starten,
    abwarten,
    container,
    get frames() {
      return frames;
    },
    get host() {
      return host;
    },
  };
}
function ansichtsOptionen(initialNorm?: string) {
  const stil = { textAlign: 'left', hyphens: 'auto' } satisfies CSSProperties;
  return {
    gesetz: gesetzDarstellung({ elemente }),
    initialNorm,
    schriftgroesse: 16,
    zeilenabstand: 1.2,
    messung: erstelleTestTextMessung(),
    strukturKontextLeisteGroesse: 0.85,
    inhaltEinzug: 12,
    satzNeuZeile: true,
    ...stil,
    lang: 'de',
  };
}
export const leistenProps = {
  schrift: 16,
  skalierungsFaktor: 0.85,
  maxBreite: 720,
  randInline: 52,
  minimalistischerModus: false,
};
export function zeichneNavigationText(
  ansicht: {
    containerRef: RefObject<HTMLDivElement | null>;
    textListe: {
      zeilen: readonly { key: string | number; index: number; element: DarstellungsElement }[];
    };
  },
  leiste: ReactNode,
) {
  return (
    <>
      <div ref={ansicht.containerRef}>
        {ansicht.textListe.zeilen.map((z) => (
          <div key={z.key} data-index={z.index}>
            <div className="gt-klapp-zeile">{z.element.data.bezeichnung}</div>
          </div>
        ))}
      </div>
      {leiste}
    </>
  );
}
