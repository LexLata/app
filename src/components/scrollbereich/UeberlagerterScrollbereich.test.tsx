// @vitest-environment jsdom
// Browser-Geometrie simulieren; die echte Liste per Scrollbar und Tastatur bedienen.
import { act, createRef } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { domTestWurzel } from '@/test/plattform/domTestWurzel';
import { UeberlagerterScrollbereich } from '@/components/scrollbereich/UeberlagerterScrollbereich';
const dom = domTestWurzel();
let messen: () => void;
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        messen = callback;
      }
      observe() {}
      disconnect() {}
    },
  );
});
function rollenElement(rolle: string) {
  const element = dom.host.querySelector<HTMLDivElement>(`[role="${rolle}"]`);
  if (!element) throw new Error(`Element fehlt: ${rolle}`);
  return element;
}
async function liste(hoehe: number, gesamt: number) {
  await act(async () =>
    dom.root.render(
      <UeberlagerterScrollbereich beschriftung="Ergebnisse">
        <div />
      </UeberlagerterScrollbereich>,
    ),
  );
  const bereich = rollenElement('region');
  Object.defineProperties(bereich, {
    clientHeight: { configurable: true, value: hoehe },
    scrollHeight: { configurable: true, value: gesamt },
  });
  await act(async () => messen());
  return bereich;
}
it('bietet die Scrollbar nur bei überlangem Inhalt und folgt dem Scrollen', async () => {
  const bereich = await liste(200, 800);
  const leiste = rollenElement('scrollbar');
  expect(leiste.getAttribute('aria-valuemax')).toBe('600');
  bereich.scrollTop = 300;
  await act(async () => bereich.dispatchEvent(new Event('scroll')));
  expect(leiste.getAttribute('aria-valuenow')).toBe('300');
  await liste(200, 100);
  expect(dom.host.querySelector('[role="scrollbar"]')).toBeNull();
});
it('scrollt mit Ende, Anfang und seitenweise innerhalb der Liste', async () => {
  const bereich = await liste(200, 800);
  const leiste = rollenElement('scrollbar');
  for (const [key, erwartet] of [
    ['End', 600],
    ['Home', 0],
    ['PageDown', 200],
  ] as const) {
    await act(async () =>
      leiste.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })),
    );
    expect(bereich.scrollTop).toBe(erwartet);
    await act(async () => bereich.dispatchEvent(new Event('scroll')));
  }
});

it('lässt den Scrollgriff greifen und bis ans Listenende ziehen', async () => {
  const bereich = await liste(200, 800);
  const leiste = rollenElement('scrollbar');
  leiste.setPointerCapture = vi.fn();
  function zeiger(typ: string, y: number, ziel: Element) {
    const ereignis = new MouseEvent(typ, { clientY: y, bubbles: true });
    Object.defineProperty(ereignis, 'pointerId', { value: 1 });
    return act(async () => ziel.dispatchEvent(ereignis));
  }
  const griff = leiste.firstElementChild;
  if (!griff) throw new Error('Scrollgriff fehlt');
  await zeiger('pointerdown', 10, griff);
  await zeiger('pointermove', 85, leiste);
  expect(bereich.scrollTop).toBe(300);
  await zeiger('pointermove', 160, leiste);
  expect(bereich.scrollTop).toBe(600);
  await zeiger('pointerup', 160, leiste);
  await zeiger('pointermove', 10, leiste);
  expect(bereich.scrollTop).toBe(600);
});

it('erhält die übergebene Referenz und Layoutvorgaben am echten Scrollcontainer', async () => {
  const ref = createRef<HTMLDivElement>();
  await act(async () =>
    dom.root.render(
      <UeberlagerterScrollbereich
        beschriftung="Gesetzestext"
        ref={ref}
        style={{ overflowAnchor: 'none' }}
      >
        <div />
      </UeberlagerterScrollbereich>,
    ),
  );
  expect(ref.current).toBe(rollenElement('region'));
  expect(ref.current?.style.overflowAnchor).toBe('none');
});
