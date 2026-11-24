// useMarkierungenAnzeige.lebensdauer.test.ts
// Kontrollierte Import- und Registrierungsabschlüsse prüfen die Effektlebensdauer.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';

function spaeter<T>() {
  let fertig!: (wert: T) => void;
  let ablehnen!: (fehler: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    fertig = resolve;
    ablehnen = reject;
  });
  return { promise, fertig, ablehnen };
}
let aufraeumen: () => Promise<void>;
const { laden, ereignis } = vi.hoisted(() => ({
  laden: vi.fn().mockResolvedValue([]),
  ereignis: { importiert: Promise.resolve(), listen: vi.fn() },
}));
vi.mock('@tauri-apps/api/event', async () => {
  await ereignis.importiert;
  return { listen: (...args: unknown[]) => ereignis.listen(...args) };
});
vi.mock('@/lib/markierungen/markierungen.index', () => ({ ladeMarkierungen: laden }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});
afterEach(async () => {
  await aufraeumen?.();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
async function render(markierungenDeaktiviert = false) {
  const importiert = spaeter<void>();
  const registrierungen: Array<{
    callback: (event: { payload: { gesetz: Gesetzesreferenz } }) => void;
    ende: ReturnType<typeof spaeter<() => void>>;
  }> = [];
  const listen = vi.fn((_name: string, callback: (typeof registrierungen)[number]['callback']) => {
    const ende = spaeter<() => void>();
    registrierungen.push({ callback, ende });
    return ende.promise;
  });
  ereignis.importiert = importiert.promise;
  ereignis.listen = listen;
  const { useMarkierungenAnzeige } = await import('./useMarkierungenAnzeige');
  const root = createRoot(document.getElementById('root')!);
  const entfernen = vi.fn();
  window.getSelection = () => ({ removeAllRanges: entfernen }) as unknown as Selection;
  function Probe({
    titel = 'Test',
    normgeber = 'de-bund',
  }: {
    titel?: string;
    normgeber?: string;
  }) {
    useMarkierungenAnzeige(
      {
        kurztitel: titel,
        normgeber,
        elemente: [],
      } as unknown as GesetzDarstellung,
      markierungenDeaktiviert,
    );
    return null;
  }
  const anzeigen = async (titel = 'Test', normgeber = 'de-bund') => {
    await act(async () => root.render(createElement(Probe, { titel, normgeber })));
  };
  await anzeigen();
  aufraeumen = async () => {
    await act(async () => root.unmount());
    aufraeumen = async () => {};
  };
  return { importiert, registrierungen, listen, entfernen, anzeigen };
}
describe('Markierungslistener-Lebensdauer', () => {
  it('beginnt nach Effektende keinen verspätet importierten Listener', async () => {
    const h = await render();
    await aufraeumen();
    await act(async () => {
      h.importiert.fertig();
      await vi.dynamicImportSettled();
    });
    expect(h.listen).not.toHaveBeenCalled();
  });
  it.each(['Unmount', 'Gesetzwechsel', 'Normgeberwechsel'])(
    'meldet während listen beendete Registrierung bei %s genau einmal ab',
    async (ende) => {
      const h = await render();
      await act(async () => {
        h.importiert.fertig();
        await vi.dynamicImportSettled();
      });
      const alt = h.registrierungen[0]!;
      if (ende === 'Unmount') await aufraeumen();
      if (ende === 'Gesetzwechsel') await h.anzeigen('Neu');
      if (ende === 'Normgeberwechsel') await h.anzeigen('Test', 'land');
      const abmelden = vi.fn();
      await act(async () => alt.ende.fertig(abmelden));
      const vorher = laden.mock.calls.length;
      await act(async () =>
        alt.callback({ payload: { gesetz: { kurztitel: 'Test', normgeber: 'de-bund' } } }),
      );
      expect(abmelden).toHaveBeenCalledOnce();
      expect(h.entfernen).not.toHaveBeenCalled();
      expect(laden).toHaveBeenCalledTimes(vorher);
      await aufraeumen();
      expect(abmelden).toHaveBeenCalledOnce();
    },
  );
  it('räumt registrierte Listener auf und behält den Gesetzesfilter einschließlich Normgeber', async () => {
    const h = await render();
    await act(async () => {
      h.importiert.fertig();
      await vi.dynamicImportSettled();
    });
    const aktuell = h.registrierungen[0]!;
    const abmelden = vi.fn();
    await act(async () => aktuell.ende.fertig(abmelden));
    await act(async () => {
      aktuell.callback({ payload: { gesetz: { kurztitel: 'Test', normgeber: 'land' } } });
      aktuell.callback({ payload: { gesetz: { kurztitel: 'Anderes', normgeber: 'de-bund' } } });
    });
    expect(h.entfernen).not.toHaveBeenCalled();
    await act(async () =>
      aktuell.callback({ payload: { gesetz: { kurztitel: 'Test', normgeber: 'de-bund' } } }),
    );
    expect(h.entfernen).toHaveBeenCalledOnce();
    await aufraeumen();
    expect(abmelden).toHaveBeenCalledOnce();
    aktuell.callback({ payload: { gesetz: { kurztitel: 'Test', normgeber: 'de-bund' } } });
    expect(h.entfernen).toHaveBeenCalledOnce();
  });
  it('erhält die Registrierungsfehlermeldung', async () => {
    const h = await render();
    const fehler = new Error('Registrierung fehlgeschlagen');
    const meldung = vi.spyOn(console, 'error').mockImplementation(() => {});
    await act(async () => {
      h.importiert.fertig();
      await vi.dynamicImportSettled();
    });
    await act(async () => h.registrierungen[0]!.ende.ablehnen(fehler));
    expect(meldung).toHaveBeenCalledWith(
      'Listener für Markierungs-Updates konnte nicht eingerichtet werden:',
      fehler,
    );
  });
  it('hört auch bei deaktivierten Markierungen zu, ohne Markierungen zu laden', async () => {
    const h = await render(true);
    await act(async () => {
      h.importiert.fertig();
      await vi.dynamicImportSettled();
    });
    expect(h.listen).toHaveBeenCalledOnce();
    const abmelden = vi.fn();
    await act(async () => h.registrierungen[0]!.ende.fertig(abmelden));
    await act(async () =>
      h.registrierungen[0]!.callback({
        payload: { gesetz: { kurztitel: 'Test', normgeber: 'de-bund' } },
      }),
    );
    expect(laden).not.toHaveBeenCalled();
    expect(h.entfernen).toHaveBeenCalledOnce();
  });
});
