// @vitest-environment jsdom
// messlaufUmgebungsprotokoll.test.ts
// Verankerungsprobe und Umgebungsprotokoll in der Testumgebung (ohne Layout).
import { afterEach, expect, it, vi } from 'vitest';
import { erstelleUmgebungsprotokoll, pruefeVerankerung } from './messlaufUmgebungsprotokoll';

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

it('ohne CSS-Unterstützung liefert die Verankerungsprobe „unbekannt“', async () => {
  vi.stubGlobal('CSS', undefined);
  await expect(pruefeVerankerung('auto')).resolves.toBe('unbekannt');
  expect(document.body.children).toHaveLength(0);
});

it('ohne Layout liefert die Verankerungsprobe „unbekannt“ und entfernt ihren Probe-Container', async () => {
  vi.stubGlobal('CSS', { supports: () => true });
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    queueMicrotask(() => fn(0));
    return 1;
  });
  const anhaengen = vi.spyOn(document.body, 'append');
  await expect(pruefeVerankerung('auto')).resolves.toBe('unbekannt');
  await expect(pruefeVerankerung('none')).resolves.toBe('unbekannt');
  expect(anhaengen).toHaveBeenCalledTimes(2);
  expect(document.body.children).toHaveLength(0);
});

it('Umgebungsprotokoll nennt Bildwiederholrate, Gesetz, Einstellungen und CSS-Unterstützung', async () => {
  vi.stubGlobal('CSS', { supports: (eigenschaft: string) => eigenschaft === 'overflow-anchor' });
  const protokoll = await erstelleUmgebungsprotokoll({
    bildperiodeMs: 16,
    gesetz: 'BGB',
    elementzahl: 2839,
    einstellungen: { silbentrennung: 'auto' },
  });
  expect(protokoll).toMatchObject({
    userAgent: navigator.userAgent,
    pixeldichte: window.devicePixelRatio,
    fenstergroesse: { breite: window.innerWidth, hoehe: window.innerHeight },
    bildwiederholrateHz: 62.5,
    gesetz: 'BGB',
    elementzahl: 2839,
    einstellungen: { silbentrennung: 'auto' },
    cssUnterstuetzung: { overflowAnchor: true, contentVisibility: false },
  });
});
