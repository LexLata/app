// @vitest-environment jsdom
// Beide echten Eingabeformulare begrenzen Wachstum auf die Monitorarbeitsfläche.
import { act, createRef } from 'react';
import { afterEach, assert, beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import KommentarFormular from '@/components/hilfsfenster/kommentar/KommentarFormular';
import VerweismarkierungFormular from '@/components/hilfsfenster/verweismarkierung/VerweismarkierungFormular';

const nativ = vi.hoisted(() => ({
  hoehe: 200,
  breite: 420,
  textHoehe: 4000,
  monitorHoehe: 1000,
  faktor: 2,
  x: 1500,
  y: 1900,
  bewegt: () => {},
  beobachter: new Array<() => void>(),
  setSize: vi.fn(),
  setPosition: vi.fn(),
  abmelden: vi.fn(),
}));
vi.mock('@tauri-apps/api/window', async (original) => ({
  ...(await original<typeof import('@tauri-apps/api/window')>()),
  currentMonitor: async () => ({
    scaleFactor: nativ.faktor,
    workArea: {
      position: { toLogical: () => ({ x: 1000, y: 1000 }) },
      size: { toLogical: () => ({ width: 800, height: nativ.monitorHoehe }) },
    },
  }),
  getCurrentWindow: () => ({
    scaleFactor: async () => nativ.faktor,
    innerSize: async () => ({ toLogical: () => ({ width: nativ.breite, height: nativ.hoehe }) }),
    outerSize: async () => ({
      toLogical: () => ({ width: nativ.breite, height: nativ.hoehe + 28 }),
    }),
    outerPosition: async () => ({ toLogical: () => ({ x: nativ.x, y: nativ.y }) }),
    setSize: nativ.setSize,
    setPosition: nativ.setPosition,
    onMoved: async (fn: () => void) => {
      nativ.bewegt = fn;
      return nativ.abmelden;
    },
  }),
}));
const dom = domTestWurzel();
beforeEach(() => {
  nativ.hoehe = 200;
  nativ.breite = 420;
  nativ.textHoehe = 4000;
  nativ.monitorHoehe = 1000;
  nativ.x = 1500;
  nativ.y = 1900;
  nativ.beobachter = [];
  nativ.setSize.mockReset().mockImplementation(async ({ width, height }) => {
    nativ.breite = width;
    nativ.hoehe = height;
  });
  nativ.setPosition.mockReset().mockImplementation(async ({ x, y }) => {
    nativ.x = x;
    nativ.y = y;
  });
  nativ.abmelden.mockClear();
  vi.spyOn(window, 'innerHeight', 'get').mockImplementation(() => nativ.hoehe);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.querySelector('textarea')) return nativ.textHoehe + 100;
    if (this.querySelector('button')) return 32;
    return 0;
  });
  vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockImplementation(
    () => nativ.textHoehe,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    fn(0);
    return 1;
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(fn: () => void) {
        nativ.beobachter.push(fn);
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => vi.restoreAllMocks());

it.each(['Kommentar', 'Verweis'] as const)(
  '%s bleibt mit langem Text bedienbar, schrumpft und folgt einem kleineren Monitor',
  async (art) => {
    const gemeinsam = {
      kontext: {
        openerLabel: 'main',
        gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
        ausgangsstelle: normAusgangsstelle('§ 1'),
      },
      textbezug: false,
      laeuft: false,
      gespeichert: false,
      uebertragungOffen: false,
      onWiederholen: vi.fn(),
      onTrotzdemSchliessen: vi.fn(),
      inhaltRef: createRef<HTMLDivElement>(),
      onTextbezugChange: vi.fn(),
      onAbbrechen: vi.fn(),
      onFertig: vi.fn(),
      onEnter: vi.fn(),
    };
    const textRef = createRef<HTMLTextAreaElement>();
    const text = '§ 1 BGB; '.repeat(10000);
    await act(async () =>
      dom.root.render(
        art === 'Kommentar' ? (
          <KommentarFormular
            {...gemeinsam}
            kommentarText={text}
            kommentarTextRef={textRef}
            onKommentarTextChange={vi.fn()}
            fehler={null}
          />
        ) : (
          <VerweismarkierungFormular
            {...gemeinsam}
            zitatText={text}
            zitatTextRef={textRef}
            onZitatTextChange={vi.fn()}
            fehler={[]}
            schliessvorgangAktiv={false}
            importFehlgeschlagen={false}
            aktualisierungsHinweis={null}
            onTrotzdemSpeichern={vi.fn()}
            onImportVersuchen={vi.fn()}
          />
        ),
      ),
    );
    await vi.waitFor(() => expect(nativ.setSize).toHaveBeenCalled());
    expect(nativ.hoehe + 28).toBe(800);
    expect(nativ.y + nativ.hoehe + 28).toBeLessThanOrEqual(2000);
    expect(nativ.x + nativ.breite).toBeLessThanOrEqual(1800);
    expect(nativ.setSize.mock.calls.every(([size]) => size.height + 28 <= 800)).toBe(true);
    const scrollbereich = dom.host.querySelector('[role="region"]');
    assert(scrollbereich instanceof HTMLElement);
    expect(scrollbereich.style.overflowY).toBe('auto');
    assert(textRef.current);
    expect(scrollbereich.contains(textRef.current)).toBe(true);
    expect(textRef.current.value).toBe(text);
    const abbrechen = Array.from(dom.host.querySelectorAll('button')).find(
      (b) => b.textContent === 'Abbrechen',
    );
    assert(abbrechen);
    expect(scrollbereich.contains(abbrechen)).toBe(false);
    await act(async () => abbrechen.click());
    expect(gemeinsam.onAbbrechen).toHaveBeenCalledOnce();
    nativ.monitorHoehe = 500;
    await act(async () => nativ.bewegt());
    await vi.waitFor(() => expect(nativ.hoehe + 28).toBe(400));
    expect(nativ.y + nativ.hoehe + 28).toBeLessThanOrEqual(1500);
    nativ.textHoehe = 20;
    await act(async () => nativ.beobachter.forEach((fn) => fn()));
    await vi.waitFor(() => expect(nativ.hoehe + 28).toBeLessThan(400));
    await act(async () => dom.root.unmount());
    expect(nativ.abmelden).toHaveBeenCalledOnce();
  },
);
