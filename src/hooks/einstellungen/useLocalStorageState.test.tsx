// @vitest-environment jsdom
// Fensterereignisse nutzen aktuelle Parser und Standardwerte ohne neue Anmeldung.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import fc from 'fast-check';
import { expect, it, vi } from 'vitest';
import { useLocalStorageState } from './useLocalStorageState';

it('übernimmt für beliebige Werte den aktuellen Parser und Standardwert bei stabilem Abonnement', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const anmelden = vi.spyOn(window, 'addEventListener');
  const abmelden = vi.spyOn(window, 'removeEventListener');
  try {
    await fc.assert(
      fc.asyncProperty(fc.integer(), fc.integer(), async (basis, aktuell) => {
        const root = createRoot(document.createElement('div'));
        let wert: number | undefined;
        function Probe({ standard }: { standard: number }) {
          [wert] = useLocalStorageState('probe', standard, {
            parse: (roh) => Number(roh) + standard,
          });
          return null;
        }
        const anzahl = () => anmelden.mock.calls.filter(([name]) => name === 'storage').length;
        const ende = () => abmelden.mock.calls.filter(([name]) => name === 'storage').length;
        try {
          await act(async () => root.render(<Probe standard={basis} />));
          const vorher = anzahl();
          const vorherEnde = ende();
          await act(async () => root.render(<Probe standard={aktuell} />));
          await act(async () =>
            window.dispatchEvent(new StorageEvent('storage', { key: 'probe', newValue: '3' })),
          );
          expect(wert).toBe(3 + aktuell);
          await act(async () =>
            window.dispatchEvent(new StorageEvent('storage', { key: 'probe', newValue: null })),
          );
          expect(wert).toBe(aktuell);
          expect(anzahl()).toBe(vorher);
          expect(ende()).toBe(vorherEnde);
        } finally {
          await act(async () => root.unmount());
        }
      }),
      { numRuns: 30 },
    );
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
