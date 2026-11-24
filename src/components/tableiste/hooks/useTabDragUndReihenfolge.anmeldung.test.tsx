// @vitest-environment jsdom
// useTabDragUndReihenfolge.anmeldung.test.tsx
// Die Pointer-Anmeldung bleibt bei neuen Parametern bis zum Unmount erhalten.
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useTabDragUndReihenfolge } from './useTabDragUndReihenfolge';

it('meldet bei neuen Parametern nicht neu an und räumt beim Unmount auf', () => {
  document.body.innerHTML = '<main></main>';
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const anmelden = vi.spyOn(window, 'addEventListener');
  const abmelden = vi.spyOn(window, 'removeEventListener');
  const stoppen = vi.fn();
  const leisteRef = { current: null };
  const tabTitelRef = { current: {} };
  function Probe() {
    useTabDragUndReihenfolge({
      tabs: [],
      leisteRef,
      tabTitelRef,
      onTabAktivieren: vi.fn(),
      onTabsNeuAnordnen: vi.fn(),
      onTabHerausziehen: vi.fn(),
      onTabInFensterAufnehmen: vi.fn(),
      dragBewegungMelden: vi.fn(),
      dragEndeVorbereiten: () => vi.fn(),
      autoScrollBeiCursorAktualisieren: vi.fn(),
      autoScrollStoppen: stoppen,
    });
    return null;
  }
  const root = createRoot(document.querySelector('main')!);
  try {
    act(() => root.render(<Probe />));
    const pointerAnmeldungen = () =>
      anmelden.mock.calls.filter(([art]) => art.startsWith('pointer'));
    expect(pointerAnmeldungen()).toHaveLength(3);
    act(() => root.render(<Probe />));
    expect(pointerAnmeldungen()).toHaveLength(3);
    expect(stoppen).not.toHaveBeenCalled();
    act(() => root.unmount());
    expect(abmelden.mock.calls.filter(([art]) => art.startsWith('pointer'))).toHaveLength(3);
    expect(stoppen).toHaveBeenCalledTimes(1);
  } finally {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

vi.mock('@/lib/plattform/tauriHelpers.ts', () => ({
  alleFensterPositionenLesen: async () => [
    { label: 'ziel', x: 1500, y: 0, breite: 500, hoehe: 500 },
  ],
}));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ label: 'quelle' }) }));
it.each([1600, 2200])(
  'verschiebt den letzten Tab nur in ein bestehendes Fenster (Bildschirm-X %s)',
  async (screenX) => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const aufnehmen = vi.fn();
    const herausziehen = vi.fn();
    let hook!: ReturnType<typeof useTabDragUndReihenfolge>;
    function Probe() {
      hook = useTabDragUndReihenfolge({
        tabs: [{ id: 'letzter' }],
        leisteRef: { current: null },
        tabTitelRef: { current: {} },
        onTabAktivieren: vi.fn(),
        onTabsNeuAnordnen: vi.fn(),
        onTabHerausziehen: herausziehen,
        onTabInFensterAufnehmen: aufnehmen,
        dragBewegungMelden: vi.fn(),
        dragEndeVorbereiten: () => vi.fn(),
        autoScrollBeiCursorAktualisieren: vi.fn(),
        autoScrollStoppen: vi.fn(),
      });
      return null;
    }
    const root = createRoot(document.createElement('div'));
    try {
      await act(async () => root.render(<Probe />));
      hook.onTabPointerDown(
        { button: 0, clientX: 10, preventDefault: vi.fn() } as never,
        'letzter',
      );
      const bewegen = () =>
        window.dispatchEvent(
          new MouseEvent('pointermove', { clientX: 1200, clientY: 20, screenX, screenY: 20 }),
        );
      await act(async () => {
        bewegen();
      });
      await act(async () => {
        bewegen();
      });
      await act(async () => {
        window.dispatchEvent(
          new MouseEvent('pointerup', { clientX: 1200, clientY: 20, screenX, screenY: 20 }),
        );
      });
      if (screenX === 1600) expect(aufnehmen).toHaveBeenCalledExactlyOnceWith('letzter', 'ziel');
      else expect(aufnehmen).not.toHaveBeenCalled();
      expect(herausziehen).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  },
);
