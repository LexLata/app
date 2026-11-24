// @vitest-environment jsdom
// Nur fachliche Ladeauslöser ersetzen den Bestand; neue Objektidentität genügt nicht.
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { useMarkierungenAnzeige } from './useMarkierungenAnzeige';
const io = vi.hoisted(() => ({
  laden: vi.fn().mockResolvedValue([]),
  callback: (_e: unknown) => {},
}));
vi.mock('@/lib/markierungen/markierungen.index', () => ({ ladeMarkierungen: io.laden }));
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (_name, callback) => {
    io.callback = callback;
    return vi.fn();
  }),
}));
it('lädt bei Referenz-, Versions- und Aktivierungswechsel mit dem aktuellen Gesetz, ohne bei Objektwechsel neu zu laden', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.createElement('div'));
  const gesetz = (kurztitel: string): GesetzDarstellung => ({
    kurztitel,
    langtitel: 'G',
    normgeber: 'de-bund',
    elemente: [],
    hatGliederungsartikel: false,
  });
  function Probe({ g, deaktiviert }: { g: GesetzDarstellung; deaktiviert: boolean }) {
    useMarkierungenAnzeige(g, deaktiviert);
    return null;
  }
  const zeichne = async (g: GesetzDarstellung, deaktiviert = false) =>
    act(async () => {
      root.render(createElement(Probe, { g, deaktiviert }));
      await vi.dynamicImportSettled();
    });
  try {
    await zeichne(gesetz('a'));
    expect(io.laden).toHaveBeenCalledTimes(1);
    const aktuell = gesetz('a');
    await zeichne(aktuell);
    expect(io.laden).toHaveBeenCalledTimes(1);
    await act(async () => {
      io.callback({ payload: { gesetz: { kurztitel: 'a', normgeber: 'de-bund' } } });
      await vi.dynamicImportSettled();
    });
    expect(io.laden).toHaveBeenCalledTimes(2);
    expect(io.laden.mock.lastCall?.[0]).toBe(aktuell);
    const anderes = gesetz('b');
    await zeichne(anderes);
    expect(io.laden).toHaveBeenCalledTimes(3);
    expect(io.laden.mock.lastCall?.[0]).toBe(anderes);
    await zeichne(anderes, true);
    expect(io.laden).toHaveBeenCalledTimes(3);
    await zeichne(anderes);
    expect(io.laden).toHaveBeenCalledTimes(4);
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
