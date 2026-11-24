// praefixlaufOffline.integration.test.ts
// Echter Offline-Start bis Fehlerbericht und Exit; nur native Dateizugriffe sind ersetzt.
import { beforeEach, expect, it, vi } from 'vitest';
const nativ = vi.hoisted(() => ({ invoke: vi.fn(), lesen: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: nativ.invoke }));
vi.mock('@tauri-apps/plugin-fs', () => ({ readTextFile: nativ.lesen }));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
  resolveResource: async (pfad: string) => pfad,
}));
import { startePraefixlauf } from './praefixlaufStart';

beforeEach(() => {
  nativ.invoke.mockReset();
  nativ.lesen.mockReset();
  nativ.lesen.mockResolvedValue(
    '<importindex version="1"><infos><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit></infos><inhalt><gesetz><kurztitel>A</kurztitel><langtitel>A</langtitel><abrufkennung>https://www.gesetze-im-internet.de/a/</abrufkennung></gesetz></inhalt></importindex>',
  );
});
it.each(['lesen', 'schreiben'] as const)(
  'nennt den schweren Dateifehler beim %s im Abschlussbericht und beendet genau einmal',
  async (fehlerart) => {
    nativ.invoke.mockImplementation(async (befehl: string) => {
      if (befehl === 'praefixlauf_datei_lesen') return null;
      if (befehl === 'praefixlauf_dateistand') return { gesetzesxml: ['A'] };
      if (befehl === 'praefixlauf_arbeitsdatei_lesen') {
        if (fehlerart === 'lesen') throw new Error('Lesefehler');
        return '<gesetz><infos><kurztitel>A</kurztitel><normgeber>de-bund</normgeber></infos><inhalt/></gesetz>';
      }
      if (befehl === 'praefixlauf_datei_schreiben') throw new Error('Schreibfehler');
      if (befehl === 'app_daten_basis_pfad') return '/daten';
    });
    await startePraefixlauf({ modus: 'auswerten', normgeber: 'de-bund' });
    const bericht = nativ.invoke.mock.calls.find(([b]) => b === 'praefixlauf_bericht_schreiben');
    expect(bericht?.[1].inhalt).toContain(fehlerart === 'lesen' ? 'Lesefehler' : 'Schreibfehler');
    expect(bericht?.[1].inhalt).toContain('Erfolgreich gespeichert: 0');
    expect(nativ.invoke.mock.calls.filter(([b]) => b === 'praefixlauf_beenden')).toEqual([
      ['praefixlauf_beenden', { code: 1 }],
    ]);
    expect(nativ.invoke.mock.calls.some(([b]) => b.includes('quelle'))).toBe(false);
  },
);
