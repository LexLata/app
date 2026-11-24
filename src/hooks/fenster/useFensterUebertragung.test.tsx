// @vitest-environment jsdom
// Eingehende Übertragungen verwenden aktuelle Übernahmefunktionen ohne Anmeldelücke.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useFensterUebertragung } from './useFensterUebertragung';
const mocks = vi.hoisted(() => ({ anmelden: vi.fn(), abholen: vi.fn(), abmelden: vi.fn() }));
vi.mock('@/lib/plattform/fensterkommunikation/fensterkommunikation.index', () => ({
  hoereImEigenenFenster: mocks.anmelden,
  sendeAnFenster: vi.fn(),
}));
vi.mock('@/lib/plattform/tauriHelpers', () => ({
  fensterVordergrundHolen: vi.fn(),
}));
it('ruft nach erneutem Render den aktuellen Handler auf und behält den Listener', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const root = createRoot(document.createElement('div'));
  let ereignis!: () => Promise<void>;
  mocks.anmelden.mockImplementation((_name, handler) => {
    if (_name === 'tab-uebertragung-eingefuegt') ereignis = handler;
    return { bereit: Promise.resolve(), abmelden: mocks.abmelden };
  });
  const uebertragung = { tabId: 'probe' };
  mocks.abholen.mockResolvedValue(uebertragung);
  const vorher = vi.fn();
  const aktuell = vi.fn();
  function Probe({ handler }: { handler: typeof vorher }) {
    useFensterUebertragung({
      tabFuerUebertragungKopieren: () => null,
      tabUebertragungAbschliessen: vi.fn(),
      fensterSchliessen: vi.fn(),
      tabAusUebertragungUebernehmen: handler,
    });
    return null;
  }
  try {
    await act(async () => root.render(<Probe handler={vorher} />));
    await act(async () => root.render(<Probe handler={aktuell} />));
    await act(async () => ereignis());
    expect(aktuell).toHaveBeenCalledWith(uebertragung, true, undefined);
    expect(vorher).not.toHaveBeenCalled();
    expect(mocks.anmelden).toHaveBeenCalledTimes(2);
    expect(mocks.abmelden).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});

vi.mock('@/lib/plattform/fensterUebergabe', async (original) => ({
  ...(await original<typeof import('@/lib/plattform/fensterUebergabe')>()),
  tabUebertragungAbholen: mocks.abholen,
}));
