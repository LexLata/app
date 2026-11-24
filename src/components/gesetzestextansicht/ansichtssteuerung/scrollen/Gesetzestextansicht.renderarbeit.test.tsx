// @vitest-environment jsdom
// Renderarbeit beim Scrollen: Ein Scrollschritt, der weder Kontextpfad noch
// Leistenanimation ändert, darf keine nachgelagerte Neuberechnung der
// Gesetzestextansicht auslösen (wertgleiche Meldung). Gemessen über den React-Profiler:
// Neuberechnungen aus Layout-Effekten erscheinen dort als Phase „nested-update“.
// Ersetzt sind nur Browsergeometrie, ResizeObserver und requestAnimationFrame.
import { act, Profiler } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, assert, beforeEach, expect, it, vi } from 'vitest';
import { Gesetzestextansicht } from '@/components/gesetzestextansicht/Gesetzestextansicht';
import { gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import { nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';

vi.mock('@tauri-apps/plugin-os', () => ({ platform: () => 'macos' }));

const SICHTHOEHE = 800;
let host: HTMLDivElement;
let root: Root;
let frames: FrameRequestCallback[];
let phasen: string[];

function istScrollbereich(el: HTMLElement) {
  return el.style.overflow === 'auto';
}
function hoeheVon(el: HTMLElement) {
  if (el.dataset.index !== undefined) return 120;
  return istScrollbereich(el) ? SICHTHOEHE : 0;
}

beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  frames = [];
  phasen = [];
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Element.prototype.scrollIntoView = () => {};
  const Beobachter = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  vi.stubGlobal('ResizeObserver', Beobachter);
  vi.spyOn(window, 'ResizeObserver', 'get').mockReturnValue(Beobachter);
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => frames.push(fn));
  vi.stubGlobal('cancelAnimationFrame', () => {});
  for (const [name, wert] of [
    ['offsetHeight', hoeheVon],
    ['clientHeight', hoeheVon],
    ['offsetWidth', () => 1000],
    ['clientWidth', () => 1000],
    ['scrollHeight', (el: HTMLElement) => (istScrollbereich(el) ? 1_000_000 : 0)],
  ] as const) {
    vi.spyOn(HTMLElement.prototype, name, 'get').mockImplementation(function (this: HTMLElement) {
      return wert(this);
    });
  }
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function framesAusfuehren() {
  for (let i = 0; i < 5; i++) {
    const jetzt = frames;
    frames = [];
    await act(async () => jetzt.forEach((fn) => fn(performance.now())));
  }
}

async function oeffne() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const gesetz = gesetzMitNormen(Array.from({ length: 200 }, (_, i) => `§ ${i + 1}`));
  await act(async () =>
    root.render(
      <Profiler id="Gesetzestextansicht" onRender={(_id, phase) => phasen.push(phase)}>
        <Gesetzestextansicht gesetz={gesetz} />
      </Profiler>,
    ),
  );
  await act(async () => vi.dynamicImportSettled());
  await framesAusfuehren();
  const container = host
    .querySelector<HTMLElement>('[style*="overflow: auto"] [data-index]')
    ?.closest<HTMLElement>('[style*="overflow: auto"]');
  assert(container, 'Scrollbereich der Gesetzestextansicht fehlt');
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  return container;
}

async function scrolle(container: HTMLElement, delta: number) {
  await act(async () => {
    container.scrollTop += delta;
    container.dispatchEvent(new Event('scroll'));
  });
  await act(async () => vi.advanceTimersByTime(16));
  await framesAusfuehren();
}

it('Scrollen ohne Wechsel des Kontextpfads löst keine nachgelagerte Neuberechnung der Ansicht aus', async () => {
  const container = await oeffne();
  // Erste Schritte setzen die Leistenanimation in Gang; danach bleibt alles wertgleich.
  for (let i = 0; i < 3; i++) await scrolle(container, 7);
  phasen = [];
  for (let i = 0; i < 10; i++) await scrolle(container, 7);
  expect(phasen.length).toBeGreaterThan(0);
  expect(phasen.filter((p) => p === 'nested-update')).toEqual([]);
});
