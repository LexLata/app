// Prüft den tatsächlichen Fensteröffnungsaufruf des Restore-Hooks gegen native Testdaten.
import { gesetzesreferenz, gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import vertraege from '@/test/plattform/native-vertraege.json';
import { useFensterRestore } from './useFensterRestore';

const zustand = vi.hoisted(() => ({ mitGeometrie: true }));
vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useEffect: vi.fn(),
  useRef: (current: unknown) => ({ current }),
  useState: () => [false, vi.fn()],
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    label: 'main',
    onCloseRequested: async () => () => {},
    show: vi.fn(),
    center: vi.fn(),
  }),
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', () => ({
  pruefeGesetzExistenz: async () => 'vorhanden',
}));
vi.mock('@/lib/persistenz/fenster/fenster.index', () => ({
  ladeFensterZustand: (label: string) =>
    label === 'main'
      ? null
      : {
          tabs: [{ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'BGB' }) }],
          aktiverIndex: 0,
          geometrie: zustand.mitGeometrie ? vertraege.fenster.geometrie : undefined,
        },
  alleFensterLabels: () => ['main', 'fenster-a', 'fenster-vertrag'],
  letzteFensterGeometrieLesen: async () => undefined,
  uebernehmeFensterZustandNachMain: vi.fn(),
  hauptFensterGeometrieFuerRustSpeichern: vi.fn(async () => {}),
}));
vi.mock('@/lib/persistenz/nutzerdaten/aktivierungSpeicher', () => ({
  ladeAktivierungXmlId: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(invoke).mockReset().mockResolvedValue(undefined);
});
it.each([true, false])(
  'übergibt gespeicherte Geometrie bzw. null an den nativen Command: %s',
  async (mitGeometrie) => {
    zustand.mitGeometrie = mitGeometrie;
    const restore = useFensterRestore(
      [],
      null,
      { current: [] },
      { current: null },
      () => undefined,
      vi.fn(),
    );
    const setTabs = vi.fn();
    const wiederhergestellt = await restore.initialRestore(
      async () => ({
        status: 'geladen',
        befunde: [],
        gesetz: gesetzDarstellung({
          kurztitel: 'BGB',
          langtitel: 'Bürgerliches Gesetzbuch',
          hatGliederungsartikel: false,
          elemente: [],
        }),
      }),
      setTabs,
      vi.fn(),
    );
    expect(wiederhergestellt).toBe(true);
    expect(setTabs).toHaveBeenCalledTimes(2);
    expect(setTabs.mock.calls[0]![0]).toEqual([
      expect.objectContaining({
        gesetzesreferenz: expect.objectContaining(gesetzesreferenz({ kurztitel: 'BGB' })),
      }),
    ]);
    const oeffnungsAufrufe = vi
      .mocked(invoke)
      .mock.calls.filter(([command]) => command === vertraege.fenster.oeffnenCommand);
    expect(oeffnungsAufrufe).toEqual([
      [
        vertraege.fenster.oeffnenCommand,
        {
          label: 'fenster-vertrag',
          geometrie: mitGeometrie ? vertraege.fenster.geometrie : vertraege.fenster.ohneGeometrie,
        },
      ],
    ]);
  },
);
