// Textpräferenzen erhalten ihre Speicherkeys und verändern keine globale Gesetzestext-CSS.
import { afterEach, describe, expect, it, vi } from 'vitest';

const speicher = vi.hoisted(() => new Map<string, unknown>());
vi.mock('@/hooks/einstellungen/useLocalStorageState', () => ({
  useLocalStorageState: (key: string, standard: unknown) => [
    speicher.get(key) ?? standard,
    vi.fn(),
  ],
}));
// Ausführen statt Überspringen: ein wieder eingeführter globaler CSS-Effekt wäre sichtbar.
vi.mock('react', async (original) => ({
  ...(await original<typeof import('react')>()),
  useEffect: (effekt: () => void) => effekt(),
}));
import { useTextDarstellung } from './useTextDarstellung';
import {
  SCHRIFTART_KEY,
  ZEILENABSTAND_KEY,
  BLOCKSATZ_KEY,
  SATZ_NEU_ZEILE_KEY,
} from '@/lib/einstellungen/einstellungen.index';

afterEach(() => {
  speicher.clear();
  vi.unstubAllGlobals();
});

describe('Textpräferenzen ohne globale Darstellungseffekte', () => {
  it('liefert aktualisierte Speicherwerte ohne globale CSS-Schreiboperation oder Canvaszugriff', () => {
    const setProperty = vi.fn();
    const createElement = vi.fn();
    vi.stubGlobal('document', { documentElement: { style: { setProperty } }, createElement });
    const vorher = useTextDarstellung();
    expect(vorher).toMatchObject({
      schriftart: 'sans',
      zeilenabstand: 1.2,
      blocksatz: true,
      satzNeuZeile: true,
    });
    speicher.set(SCHRIFTART_KEY, 'serif');
    speicher.set(ZEILENABSTAND_KEY, 1.8);
    speicher.set(BLOCKSATZ_KEY, false);
    speicher.set(SATZ_NEU_ZEILE_KEY, false);
    expect(useTextDarstellung()).toMatchObject({
      schriftart: 'serif',
      zeilenabstand: 1.8,
      blocksatz: false,
      satzNeuZeile: false,
    });
    expect(setProperty).not.toHaveBeenCalled();
    expect(createElement).not.toHaveBeenCalled();
  });
});
