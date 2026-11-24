// Prüft Geometrie und Anzeige mit einem zustandsbehafteten nativen Fensteradapter.
import { gesetzesreferenz, gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { beforeEach, expect, it, vi } from 'vitest';
import type { FensterGeometrie } from '@/lib/persistenz/fenster/fenster.index';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { useFensterRestore } from './useFensterRestore';

const adapter = vi.hoisted(() => ({
  maximiert: true,
  geometrie: undefined as FensterGeometrie | undefined,
  fallback: undefined as FensterGeometrie | undefined,
  aufrufe: [] as string[],
  breite: 1920,
  hoehe: 1080,
  x: 0,
  y: 0,
  groessenfehler: false,
  uebernommeneGeometrie: undefined as FensterGeometrie | undefined,
}));
vi.mock('react', () => ({
  useCallback: (fn: unknown) => fn,
  useEffect: vi.fn(),
  useRef: (current: unknown) => ({ current }),
  useState: () => [false, vi.fn()],
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async () => false) }));
vi.mock('@/lib/plattform/tauriHelpers', () => ({ holePlattform: async () => 'macos' }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    label: 'main',
    onCloseRequested: async () => () => {},
    unmaximize: async () => {
      adapter.aufrufe.push('unmaximize');
      adapter.maximiert = false;
    },
    maximize: async () => {
      adapter.aufrufe.push('maximize');
      adapter.maximiert = true;
    },
    setSize: async (groesse: { width: number; height: number }) => {
      adapter.aufrufe.push('setSize');
      if (adapter.groessenfehler) throw new Error('Größe konnte nicht gesetzt werden');
      if (!adapter.maximiert) {
        adapter.breite = groesse.width;
        adapter.hoehe = groesse.height;
      }
    },
    setPosition: async (position: { x: number; y: number }) => {
      adapter.aufrufe.push('setPosition');
      if (!adapter.maximiert) {
        adapter.x = position.x;
        adapter.y = position.y;
      }
    },
    innerSize: async () => {
      adapter.aufrufe.push('innerSize');
      return { width: adapter.breite, height: adapter.hoehe };
    },
    show: async () => {
      adapter.aufrufe.push('show');
    },
  }),
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', () => ({
  pruefeGesetzExistenz: async () => 'vorhanden',
}));
vi.mock('@/lib/persistenz/fenster/fenster.index', () => ({
  ladeFensterZustand: (label: string) =>
    label === 'main'
      ? { tabs: [], aktiverIndex: 0, geometrie: adapter.geometrie }
      : {
          tabs: [{ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'BGB' }) }],
          aktiverIndex: 0,
          geometrie: adapter.uebernommeneGeometrie,
        },
  alleFensterLabels: () => (adapter.uebernommeneGeometrie ? ['main', 'fenster-a'] : ['main']),
  letzteFensterGeometrieLesen: async () => adapter.fallback,
  uebernehmeFensterZustandNachMain: vi.fn(),
  hauptFensterGeometrieFuerRustSpeichern: vi.fn(async () => {}),
}));

const ziel = { breite: 800, hoehe: 600, x: -40, y: 20, maximiert: false };
const gesetz: GesetzDarstellung = gesetzDarstellung({
  kurztitel: 'BGB',
  langtitel: 'BGB',
  elemente: [],
  hatGliederungsartikel: false,
});
beforeEach(() => {
  Object.assign(adapter, {
    maximiert: true,
    geometrie: ziel,
    fallback: undefined,
    aufrufe: [],
    breite: 1920,
    hoehe: 1080,
    x: 0,
    y: 0,
    groessenfehler: false,
    uebernommeneGeometrie: undefined,
  });
});
function useTestRestore() {
  return useFensterRestore([], null, { current: [] }, { current: null }, () => undefined, vi.fn());
}
it.each(['eigene', 'Fallback', 'übernommene'] as const)(
  'hebt alte Maximierung vor Größe, Position und Anzeige auf: %s-Geometrie',
  async (quelle) => {
    if (quelle === 'Fallback') {
      adapter.geometrie = undefined;
      adapter.fallback = ziel;
    }
    if (quelle === 'übernommene') {
      adapter.geometrie = { ...ziel, breite: 1920, maximiert: true };
      adapter.uebernommeneGeometrie = ziel;
    }
    await useTestRestore().initialRestore(
      async () => ({ status: 'geladen', gesetz, befunde: [] }),
      vi.fn(),
      vi.fn(),
    );
    expect(adapter.aufrufe).toEqual(['unmaximize', 'setSize', 'setPosition', 'innerSize', 'show']);
    expect(adapter.maximiert).toBe(false);
    expect([adapter.breite, adapter.hoehe, adapter.x, adapter.y]).toEqual([
      ziel.breite,
      ziel.hoehe,
      ziel.x,
      ziel.y,
    ]);
  },
);
it.each(['eigene', 'übernommene'] as const)(
  'maximiert den nicht maximierten Ausgangszustand nach Größe und Position vor der Anzeige: %s-Geometrie',
  async (quelle) => {
    adapter.maximiert = false;
    adapter.geometrie = { ...ziel, maximiert: true };
    if (quelle === 'übernommene') {
      adapter.uebernommeneGeometrie = adapter.geometrie;
      adapter.geometrie = ziel;
    }
    await useTestRestore().initialRestore(
      async () => ({ status: 'geladen', gesetz, befunde: [] }),
      vi.fn(),
      vi.fn(),
    );
    expect(adapter.aufrufe).toEqual(['setSize', 'setPosition', 'maximize', 'innerSize', 'show']);
    expect(adapter.maximiert).toBe(true);
  },
);
it('zeigt das Fenster auch nach einem Fehler beim Anwenden der Geometrie', async () => {
  adapter.groessenfehler = true;
  await useTestRestore().initialRestore(
    async () => ({ status: 'fehlt', befunde: [] }),
    vi.fn(),
    vi.fn(),
  );
  expect(adapter.aufrufe).toContain('setSize');
  expect(adapter.aufrufe.at(-1)).toBe('show');
});
