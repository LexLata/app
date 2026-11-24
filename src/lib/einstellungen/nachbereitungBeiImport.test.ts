// nachbereitungBeiImport.test.ts
// Alle vier Modi und defensiver Standard ohne zusätzliche Zustandsquelle.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { leseNachbereitungBeiImport } from './nachbereitungBeiImport';
afterEach(() => vi.unstubAllGlobals());
describe('Nachbereitungseinstellung', () => {
  it.each(['aus', 'verweise', 'saetze', 'saetze-und-verweise'] as const)('liest %s', (wert) => {
    const getItem = vi.fn(() => wert);
    vi.stubGlobal('localStorage', { getItem });
    expect(leseNachbereitungBeiImport()).toBe(wert);
    expect(getItem).toHaveBeenCalledWith('lexlata.nachbereitungBeiImport');
  });
  it.each([null, 'true', 'false', '1', ''])('verwendet Aus für %s', (wert) => {
    vi.stubGlobal('localStorage', { getItem: () => wert });
    expect(leseNachbereitungBeiImport()).toBe('aus');
  });
  it('verwendet Aus bei nicht verfügbarem Speicher', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('gesperrt');
      },
    });
    expect(leseNachbereitungBeiImport()).toBe('aus');
  });
});
