// praefixlaufUmgebung.integration.test.ts
// Kern und Adapter mit echten Quellenoperationen, aber gefaktem HTTP/WebView.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({
  invoke: vi.fn(),
  fetch: vi.fn(),
  erreichbar: vi.fn(),
  kandidaten: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: f.invoke }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: f.fetch }));
vi.mock('@/lib/import/basis/basis.index', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  pruefeQuelleErreichbar: f.erreichbar,
}));
vi.mock('@/lib/import/importindex/importindex.index', () => ({
  alleImportindexEintraege: f.kandidaten,
}));
vi.mock('fflate', () => ({ unzipSync: () => ({ 'gesetz.xml': new TextEncoder().encode('roh') }) }));
vi.mock('@/lib/import/bund/bund.index', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  importiereBundXML: () => ({ xmlString: 'konvertiert' }),
}));
vi.mock('@/lib/import/bw/bw.index', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  parseGeladenesGesetz: () => ({ xmlString: 'konvertiert' }),
}));
vi.mock('@/lib/import/importabschluss/importabschluss.index', () => ({
  taggeGesetzesXML: async () => 'getaggt',
}));
vi.mock('@/lib/darstellung/darstellung.index', () => ({
  parseGesetzesXML: () => ({ kurztitel: 'G', elemente: [] }),
}));
import { fuehrePraefixlaufAus } from './praefixlauf';
import { erzeugeTauriPraefixlaufUmgebung } from './praefixlaufUmgebung';
afterEach(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.stubGlobal('window', { __TAURI_INTERNALS__: { invoke: f.invoke } });
  vi.clearAllMocks();
  f.kandidaten.mockResolvedValue(
    ['A', 'B', 'C'].map((kurztitel) => ({ kurztitel, langtitel: '', abrufkennung: kurztitel })),
  );
  f.fetch.mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
  f.erreichbar.mockResolvedValue({});
  f.invoke.mockImplementation(async (command: string) =>
    command === 'praefixlauf_dateistand'
      ? { quellen: [], gesetzesxml: [] }
      : command === 'lade_gesetz_html_bw'
        ? '<html/>'
        : null,
  );
});
it.each(['de-bund', 'de-bw'] as const)(
  'prüft %s einmal vorab und speichert mehrere Gesetze ausschließlich über Repository-Commands',
  async (normgeber) => {
    const u = await erzeugeTauriPraefixlaufUmgebung();
    u.pause = async () => {};
    if (normgeber === 'de-bund') f.fetch.mockRejectedValueOnce(new Error('Download direkt'));
    else {
      let fehlgeschlagen = false;
      f.invoke.mockImplementation(async (command: string) => {
        if (command === 'praefixlauf_dateistand') return { quellen: [], gesetzesxml: [] };
        if (command !== 'lade_gesetz_html_bw') return null;
        if (!fehlgeschlagen) {
          fehlgeschlagen = true;
          throw new Error('Download direkt');
        }
        return '<html/>';
      });
    }
    const bericht = await fuehrePraefixlaufAus({ modus: 'praefix', normgeber, anzahl: 2 }, u);
    expect(f.erreichbar).toHaveBeenCalledTimes(1);
    expect(bericht.gespeichert).toBe(2);
    expect(bericht.fehlgeschlagen).toHaveLength(1);
    expect(
      f.invoke.mock.calls.filter(([c]) => c === 'praefixlauf_arbeitsdatei_schreiben'),
    ).toHaveLength(4);
    expect(
      f.invoke.mock.calls.every(([c]) =>
        [
          'praefixlauf_datei_lesen',
          'praefixlauf_datei_schreiben',
          'praefixlauf_arbeitsdatei_schreiben',
          'praefixlauf_arbeitsdatei_loeschen',
          'praefixlauf_dateistand',
          'praefixlauf_ausgabe',
          'lade_gesetz_html_bw',
        ].includes(c),
      ),
    ).toBe(true);
  },
);
