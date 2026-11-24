// praefixlaufStart.integration.test.ts
// Tatsächlicher Adapter-Diagnoseweg bleibt bis Terminalabschluss vor dem Exit offen.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { fuehrePraefixlaufAus } from './praefixstruktur/praefixstruktur.index';

type PraefixlaufUmgebung = Parameters<typeof fuehrePraefixlaufAus>[1];
const f = vi.hoisted(() => ({ invoke: vi.fn(), taggen: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: f.invoke }));
vi.mock('@/lib/import/bund/bund.index', () => ({
  ladeUndEntpackeVonGesetzeImInternet: async () => ({ xmlString: 'roh' }),
  importiereBundXML: () => ({ xmlString: 'konvertiert' }),
}));
vi.mock('@/lib/import/importindex/importindex.index', () => ({
  alleImportindexEintraege: vi.fn(),
}));
vi.mock('@/lib/import/basis/basis.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  pruefeErreichbarkeit: vi.fn(),
}));
vi.mock('@/lib/darstellung/darstellung.index', () => ({
  parseGesetzesXML: () => ({ kurztitel: 'GG', elemente: [] }),
}));
vi.mock('@/lib/import/importabschluss/importabschluss.index', () => ({
  taggeGesetzesXML: f.taggen,
  mitReferenzKontext: async (arbeit: (kontext: object) => Promise<unknown>) => arbeit({}),
}));
vi.mock('./praefixstruktur/praefixstruktur.index', async (original) => {
  const { erzeugeTauriPraefixlaufUmgebung } =
    await original<typeof import('./praefixstruktur/praefixstruktur.index')>();
  return {
    erzeugeTauriPraefixlaufUmgebung,
    fuehrePraefixlaufAus: async (_: unknown, umgebung: PraefixlaufUmgebung) => {
      await umgebung.ladeGesetz('de-bund', { kurztitel: 'GG', langtitel: '', abrufkennung: 'gg' });
      return { gespeichert: 1, teilerfolge: [], fehlgeschlagen: [] };
    },
  };
});
import { startePraefixlauf } from './praefixlaufStart';
beforeEach(() => {
  vi.clearAllMocks();
  f.taggen.mockImplementation(
    async (
      _xml,
      _kurztitel,
      _normgeber,
      _kontext,
      empfangen: (meldung: { text: string }) => void,
    ) => {
      await Promise.resolve();
      empfangen({ text: 'Tagging-Diagnose' });
      return 'getaggt';
    },
  );
});
afterEach(() => vi.restoreAllMocks());
it.each([false, true])(
  'wartet Tagger-Diagnose vor Exit ab und berücksichtigt Ausgabefehler (%s)',
  async (fehler) => {
    let abschliessen!: () => void;
    let ablehnen!: (grund: Error) => void;
    const diagnoseAusgabe = new Promise<void>((resolve, reject) => {
      abschliessen = resolve;
      ablehnen = reject;
    });
    f.invoke.mockImplementation(async (command: string, args: { zeile?: string }) => {
      if (command === 'praefixlauf_ausgabe' && args.zeile === 'Tagging-Diagnose')
        await diagnoseAusgabe;
    });
    const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
    const lauf = startePraefixlauf({ modus: 'praefix', normgeber: 'de-bund', anzahl: 1 });
    try {
      await vi.waitFor(() =>
        expect(f.invoke).toHaveBeenCalledWith('praefixlauf_ausgabe', {
          zeile: 'Tagging-Diagnose',
          art: 'ergebnis',
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(f.invoke.mock.calls.filter(([command]) => command === 'praefixlauf_beenden')).toEqual(
        [],
      );
    } finally {
      if (fehler) ablehnen(new Error('Diagnoseausgabe gescheitert'));
      else abschliessen();
      await lauf;
    }
    expect(f.invoke.mock.calls.filter(([command]) => command === 'praefixlauf_beenden')).toEqual([
      ['praefixlauf_beenden', { code: fehler ? 1 : 0 }],
    ]);
    if (fehler)
      expect(protokoll).toHaveBeenCalledWith(
        'Präfixlauf-Ausgabe fehlgeschlagen:',
        expect.any(Error),
      );
  },
);
