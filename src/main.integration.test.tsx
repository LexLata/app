// main.integration.test.tsx
// Startablauf mit echter React-Root, sichtbarer Fehleransicht und erst nach
// erfolgreichem Laden montierter Fachwurzel. Native Grenzen bleiben Attrappen.
import { act, useEffect } from 'react';
import { parseHTML } from 'linkedom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Root } from 'react-dom/client';

const start = vi.hoisted(() => ({
  label: '',
  invoke: vi.fn().mockResolvedValue(undefined),
  laden: vi.fn(),
  kontext: vi.fn(),
  initialisieren: vi.fn(),
  vorbereiten: vi.fn().mockResolvedValue(undefined),
  show: vi.fn().mockResolvedValue(undefined),
  close: vi.fn().mockResolvedValue(undefined),
  createRoot: vi.fn(),
  root: undefined as Root | undefined,
}));
vi.mock('react-dom/client', async (original) => {
  const echt = await original<typeof import('react-dom/client')>();
  return {
    default: {
      createRoot: (container: HTMLElement) => {
        start.createRoot(container);
        start.root = echt.createRoot(container);
        return start.root;
      },
    },
  };
});
vi.mock('@/components/hilfsfenster/hilfsfenster.index', async (original) => ({
  ...(await original<typeof import('@/components/hilfsfenster/hilfsfenster.index')>()),
  ladeHilfsfensterWurzel: start.laden,
}));
vi.mock('@/lib/markierungen/markierungen.index', () => ({
  initialisiereMarkierungen: start.initialisieren,
  bereiteMarkierungsStartPruefungVor: start.vorbereiten,
}));
vi.mock('@/App', () => ({
  default: () => {
    throw new Error('Ersatz-Hauptansicht');
  },
}));
vi.mock('@/lib/plattform/tauriHelpers', () => ({
  holePlattform: async () => {},
  istMobilePlattform: async () => false,
}));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ label: start.label, show: start.show, close: start.close }),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: start.invoke, isTauri: () => true }));
vi.mock('@/hooks/einstellungen/useAppAkzentfarbe', () => ({ useAppAkzentfarbe: () => {} }));
vi.mock('@/lib/plattform/fensterkommunikation/fensterkommunikation.index', () => ({
  hoereImEigenenFenster: () => ({ bereit: Promise.resolve(), abmelden: () => {} }),
}));
vi.mock('@/index.css', () => ({}));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeSchemaversionBannerEinmal: () => {},
}));

beforeEach(() => {
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  window.matchMedia = (media) => ({
    media,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => true,
    matches: true,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  vi.stubGlobal('window', window);
  vi.stubGlobal('document', window.document);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
});
afterEach(async () => {
  await act(async () => start.root?.unmount());
  start.root = undefined;
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
});

it.each(['kommentar-1', 'verweismarkierung-1', 'einstellungen', 'markierungskonflikte'])(
  'zeigt %s nach Ladefehlern und holt dessen Kontext erst nach Erfolg ab',
  async (label) => {
    start.label = label;
    start.laden
      .mockRejectedValueOnce(new Error('Erster Fehler'))
      .mockRejectedValueOnce(new Error('Zweiter Fehler'));
    await act(async () => {
      await import('./main');
    });
    await vi.waitFor(() => expect(start.show).toHaveBeenCalled());
    expect(start.invoke).toHaveBeenCalledWith('fenster_farbschema_anwenden', {
      farbschema: 'system',
      dunkel: true,
    });
    expect(start.invoke.mock.invocationCallOrder[0]!).toBeLessThan(
      start.show.mock.invocationCallOrder[0]!,
    );
    expect(document.documentElement.getAttribute('data-farbschema')).toBe('dunkel');
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    expect(start.kontext).not.toHaveBeenCalled();
    await act(async () => document.querySelector('button')!.click());
    expect(start.laden).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    expect(start.kontext).not.toHaveBeenCalled();
    const escape = new window.Event('keydown');
    Object.assign(escape, { key: 'Escape' });
    window.dispatchEvent(escape);
    await vi.waitFor(() => expect(start.close).toHaveBeenCalledTimes(1));
    function Fachwurzel() {
      useEffect(() => {
        start.kontext();
      }, []);
      return <div>Fachwurzel</div>;
    }
    let fertig!: (wurzel: typeof Fachwurzel) => void;
    start.laden.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          fertig = resolve;
        }),
    );
    await act(async () => {
      document.querySelector('button')!.click();
      document.querySelector('button')!.click();
    });
    expect(start.laden).toHaveBeenCalledTimes(3);
    expect(start.kontext).not.toHaveBeenCalled();
    await act(async () => fertig(Fachwurzel));
    expect(document.body.textContent).toContain('Fachwurzel');
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(start.kontext).toHaveBeenCalled();
    expect(start.laden.mock.calls.map(([ziel]) => ziel)).toEqual([label, label, label]);
    expect(start.createRoot).toHaveBeenCalledTimes(1);
    expect(start.initialisieren).toHaveBeenCalledTimes(1);
    expect(start.vorbereiten).toHaveBeenCalledTimes(1);
  },
);

it.each(['kommentar-1', 'verweismarkierung-1', 'einstellungen', 'markierungskonflikte'])(
  'startet %s mit echter gemeinsamer Markierungsinitialisierung ohne verdeckten Dateilese-/Bannerweg',
  async (label) => {
    start.label = label;
    const echt = await vi.importActual<typeof import('@/lib/markierungen/markierungen.index')>(
      '@/lib/markierungen/markierungen.index',
    );
    start.initialisieren.mockImplementationOnce(echt.initialisiereMarkierungen);
    start.vorbereiten.mockImplementationOnce(echt.bereiteMarkierungsStartPruefungVor);
    start.laden.mockResolvedValueOnce(() => <div>Hilfsfenster bereit</div>);
    await act(async () => {
      await import('./main');
    });
    await vi.waitFor(() => expect(document.body.textContent).toContain('Hilfsfenster bereit'));
    expect(start.invoke.mock.calls.map(([befehl]) => befehl)).toEqual([
      'fenster_farbschema_anwenden',
      'system_theme_melden',
    ]);
    const { getSnapshot } = await import('@/lib/banner/banner.index');
    expect(getSnapshot()).toEqual([]);
  },
);

vi.mock('@/lib/plattform/praefixlaufAuftrag', () => ({ holePraefixlaufAuftrag: async () => null }));
