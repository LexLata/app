// @vitest-environment jsdom
// importindexErstellungEU.test.ts
// Seitenlauf, Aufbereitung und Bestandsschutz des europäischen Importindex.
import { beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateXML } from 'xmllint-wasm';
import { parseImportindex } from '@/lib/import/importindex/importindex.index';
const m = vi.hoisted(() => ({
  fetch: vi.fn(),
  speichern: vi.fn(),
  abbruch: false,
  banner: {
    pruefeAbbruch: vi.fn(),
    fortschritt: vi.fn(),
    beginneSpeichern: vi.fn(),
    abschliessen: vi.fn(),
  },
}));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: m.fetch }));
vi.mock('@/lib/import/importindex/importindex.index', async (original) => ({
  ...(await original<object>()),
  mitImportindexVorgang: vi.fn(async (_k, _t, arbeit) => arbeit(m.banner)),
  speichereImportindexAktualisierung: m.speichern,
}));
import { bereiteIndexVor, erstelleEuImportindex } from './importindexErstellungEU';
const zeile = (celex: string, typ = 'REG') => ({
  celex: { value: celex },
  typ: { value: `http://publications.europa.eu/resource/authority/resource-type/${typ}` },
  titel: { value: 'Titel (Text von Bedeutung für den EWR)' },
});
const antwort = (bindings: unknown[]) => Response.json({ results: { bindings } });
beforeEach(() => {
  vi.clearAllMocks();
  m.abbruch = false;
  m.banner.pruefeAbbruch.mockImplementation(() => m.abbruch);
  m.speichern.mockResolvedValue({ unveraendert: false });
});
it('dedupliziert, filtert Berichtigungen und markiert beide Kollisionen', () => {
  const result = bereiteIndexVor([
    zeile('32016R0001'),
    zeile('32016R00001'),
    zeile('32016R0001'),
    zeile('32016R0001R(01)'),
    zeile('32004L0038', 'DIR_IMPL'),
  ]);
  expect(result.map((e) => e.kurztitel)).toEqual([
    'DurchfRL 2004/38',
    'VO 2016/1 (32016R00001)',
    'VO 2016/1 (32016R0001)',
  ]);
  expect(result[0]).toMatchObject({ typ: 'durchfuehrungsrichtlinie', langtitel: 'Titel' });
});
it.each([{ rows: [] }, { rows: [zeile('32016R0679')] }])(
  'erhält bei leerem oder unplausiblem Index den Bestand',
  async ({ rows }) => {
    m.fetch.mockResolvedValue(antwort(rows));
    expect(await erstelleEuImportindex()).toMatchObject({ erfolg: false });
    expect(m.speichern).not.toHaveBeenCalled();
  },
);
it('erhält den Bestand bei Abbruch nach Download', async () => {
  m.fetch.mockImplementation(async () => {
    m.abbruch = true;
    return antwort([zeile('32016R0679')]);
  });
  expect(await erstelleEuImportindex()).toEqual({ erfolg: false, fehler: 'Abgebrochen.' });
  expect(m.speichern).not.toHaveBeenCalled();
});
it('lädt weitere Seiten und serialisiert lesbares EU-XML mit typ', async () => {
  const rows = Array.from({ length: 5000 }, (_, i) =>
    zeile(`32016R${String(i + 1).padStart(4, '0')}`),
  );
  m.fetch.mockResolvedValueOnce(antwort(rows)).mockResolvedValueOnce(antwort([]));
  expect(await erstelleEuImportindex()).toEqual({ erfolg: true, anzahl: 5000 });
  expect(decodeURIComponent(m.fetch.mock.calls[1]![0])).toContain(
    'FILTER(STR(?celex) > "32016R5000")',
  );
  const xml = m.speichern.mock.calls[0]![1];
  expect(
    (
      await validateXML({
        xml,
        schema: readFileSync('docs/schema/importindex.rng', 'utf8'),
        extension: 'relaxng',
      })
    ).valid,
  ).toBe(true);
  expect(parseImportindex(xml)[0]).toMatchObject({ typ: 'verordnung' });
  expect(m.banner.abschliessen).toHaveBeenCalledWith(
    'Importindex Europarecht erfolgreich aktualisiert.',
  );
});
it('zeigt Verbindungsfehler ohne Speichern', async () => {
  m.fetch.mockRejectedValue(new TypeError('fetch failed'));
  expect(await erstelleEuImportindex()).toMatchObject({ erfolg: false });
  expect(m.speichern).not.toHaveBeenCalled();
  expect(m.banner.abschliessen.mock.calls[0]![0]).toContain(
    'Keine Verbindung zu publications.europa.eu möglich.',
  );
});
it('gruppiert Mehrfachzeilen vor der Seitengrenze und verliert keinen Folgeakt', async () => {
  const quellzeilen = Array.from({ length: 5001 }, (_, i) =>
    zeile(`32016R${String(i + 1).padStart(4, '0')}`),
  );
  quellzeilen.push(zeile('32016R5000'), zeile('32016R5000'));
  m.fetch.mockImplementation(async (url: string) => {
    const query = new URL(url).searchParams.get('query')!;
    expect(query).toContain('GROUP BY ?celex ORDER BY ?celex LIMIT 5000');
    expect(query).toContain('MIN(STR(?titelRoh))');
    expect(query).toContain('MIN(STR(?typRoh))');
    const anker = /FILTER\(STR\(\?celex\) > "([^"]+)"\)/.exec(query)?.[1] ?? '';
    // Serververtrag: erst pro CELEX gruppieren, dann geordnete Seite begrenzen.
    const gruppiert = [...new Map(quellzeilen.map((z) => [z.celex.value, z])).values()];
    return antwort(gruppiert.filter((z) => z.celex.value > anker).slice(0, 5000));
  });
  expect(await erstelleEuImportindex()).toEqual({ erfolg: true, anzahl: 5001 });
  expect(m.fetch).toHaveBeenCalledTimes(2);
  expect(parseImportindex(m.speichern.mock.calls[0]![1]).map((e) => e.abrufkennung)).toContain(
    '32016R5001',
  );
});
it('beendet eine wiederholte volle Seite statt endlos zu laufen', async () => {
  const rows = Array.from({ length: 5000 }, (_, i) =>
    zeile(`32016R${String(i + 1).padStart(4, '0')}`),
  );
  m.fetch.mockImplementation(async () => antwort(rows));
  expect(await erstelleEuImportindex()).toMatchObject({
    erfolg: false,
    fehler: 'Ungültige Cellar-Seitenfolge.',
  });
  expect(m.fetch).toHaveBeenCalledTimes(2);
  expect(m.speichern).not.toHaveBeenCalled();
});
