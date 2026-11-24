// @vitest-environment jsdom
// Nicht animierte Landung mit echter Virtualisierung und kontrollierter DOM-Geometrie.
import { act, useLayoutEffect, useRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { erstelleTestTextMessung } from '@/test/gesetz/testDarstellung';
import { useScrollSteuerung, type ScrollSteuerung } from './scrollen.index';

let host: HTMLDivElement;
let root: Root;
let steuerung: ScrollSteuerung;
let vorgaengerHoehe: number;
let innenabstand: number;
let zielHoehe: number;
let frames: Map<number, FrameRequestCallback>;
const elemente = Array.from({ length: 20 }, (_, index) => ({
  typ: 'norm' as const,
  data: normaleNorm({ id: String(index), xmlId: String(index), absaetze: [] }),
}));
const leer = new Set<string>();
const messung = erstelleTestTextMessung();
function Probe() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [bestaetigen, setBestaetigen] = useState<((hoehe: number) => void) | null>(null);
  const scrollen = useScrollSteuerung({
    containerRef,
    sichtbareElemente: elemente,
    eingeklappteUeberschriften: leer,
    eingeklappteNormen: leer,
    unterArtikelIds: leer,
    messung,
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
    leisteHoehe: 60,
    effektiveLeisteHoehe: 60,
    onZielVorbereiten() {},
    onZielMessen(_id, melden) {
      setBestaetigen(() => melden);
      return () => {};
    },
    onScrollStandGeaendert() {},
    onPositionGeaendert() {},
  });
  useLayoutEffect(() => {
    steuerung = scrollen;
  });
  useLayoutEffect(() => bestaetigen?.(60), [bestaetigen]);
  return (
    <div ref={containerRef} style={{ overflow: 'auto' }}>
      {scrollen.textListe.zeilen.map((zeile) => (
        <div
          key={zeile.key}
          data-index={zeile.index}
          ref={scrollen.textListe.messeZeile}
          style={{ transform: `translateY(${zeile.start}px)` }}
        >
          <div className="gt-klapp-zeile">{zeile.element.data.bezeichnung}</div>
        </div>
      ))}
    </div>
  );
}
beforeEach(() => {
  vorgaengerHoehe = 100;
  innenabstand = 16;
  zielHoehe = 100;
  frames = new Map();
  let nummer = 0;
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nummer, callback);
    return nummer;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.dataset.index === '0') return vorgaengerHoehe;
    if (this.dataset.index === '2') return zielHoehe;
    return this.dataset.index === undefined ? 400 : 100;
  });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(800);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const block = this.closest<HTMLElement>('[data-index]');
    const container = block?.parentElement;
    const start = Number(block?.style.transform.match(/translateY\((-?[\d.]+)px\)/)?.[1] ?? 0);
    const top = block
      ? 40 + start - (container?.scrollTop ?? 0) + (this === block ? 0 : innenabstand)
      : 0;
    return new DOMRect(0, top, 800, this === block ? this.offsetHeight : 24);
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it.each([
  { hoehe: 160, abstand: 16, ziel: 100, scrollTop: 248 },
  { hoehe: 60, abstand: 44, ziel: 180, scrollTop: 176 },
])(
  'landet nach Scrollen bei Vorgängerhöhe $hoehe und Innenabstand $abstand sofort und dauerhaft 8 px unter der Leiste',
  async ({ hoehe, abstand, ziel, scrollTop }) => {
    innenabstand = abstand;
    await act(async () => root.render(<Probe />));
    const container = host.firstElementChild;
    if (!(container instanceof HTMLDivElement)) throw new Error('Scrollbereich fehlt');
    container.scrollTop = 150;
    await act(async () => container.dispatchEvent(new Event('scroll')));
    // Eine Layoutänderung ist noch nicht durch den ResizeObserver gemeldet.
    // Die Landung muss diese Höhe messen, während die Bibliothek noch scrollt.
    vorgaengerHoehe = hoehe;
    zielHoehe = ziel;
    const fertig = vi.fn();
    await act(async () =>
      steuerung.starteAuftrag(
        {
          art: 'sichtbar-machen',
          elementId: '2',
          ausrichtung: 'oben',
          animieren: false,
        },
        fertig,
      ),
    );
    const normzeile = container.querySelector('[data-index="2"] .gt-klapp-zeile');
    if (!normzeile) throw new Error('Normzeile fehlt');
    // 40 Listenabstand + beide Vorgänger + Innenabstand - (60 Leiste + 8 Abstand).
    expect(container.scrollTop).toBe(scrollTop);
    expect(normzeile.getBoundingClientRect().top).toBe(68);
    expect(fertig).toHaveBeenCalledTimes(1);
    await act(async () => container.dispatchEvent(new Event('scroll')));
    const fortsetzungen = [...frames.values()];
    frames.clear();
    await act(async () => fortsetzungen.forEach((callback) => callback(performance.now())));
    await act(async () => vi.advanceTimersByTime(1000));
    expect(container.scrollTop).toBe(scrollTop);
    expect(normzeile.getBoundingClientRect().top).toBe(68);
    expect(fertig).toHaveBeenCalledTimes(1);
  },
);
