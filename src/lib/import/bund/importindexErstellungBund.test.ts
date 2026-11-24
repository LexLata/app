// importindexErstellungBund.test.ts
// Kurztitelkorrekturen wirken auf den geschriebenen Bundesimportindex.
import { beforeEach, expect, it, vi } from 'vitest';
import { alleBannerSchliessen } from '@/lib/banner/banner.index';

const { fetch, speichern } = vi.hoisted(() => ({ fetch: vi.fn(), speichern: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch }));
vi.mock('@/lib/import/importindex/importindex.index', async (original) => ({
  ...(await original<object>()),
  speichereImportindexAktualisierung: speichern,
}));
import { erstelleBundesImportindex } from './importindexErstellungBund';

function teilliste(eintraege: [kurztitel: string, langtitel: string, verzeichnis: string][]) {
  const absaetze = eintraege
    .map(([k, l, v]) => `<p><a href="./${v}/index.html"><abbr title="${l}">${k}</abbr></a></p>`)
    .join('');
  const html = `<html><body><div id="paddingLR12">${absaetze}</div></body></html>`;
  return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode(html).buffer };
}

beforeEach(() => {
  vi.resetAllMocks();
  alleBannerSchliessen();
  speichern.mockResolvedValue({ unveraendert: false });
  fetch.mockImplementation(async (url: string) =>
    url.endsWith('Teilliste_Z.html')
      ? teilliste([
          ['ZPOEG', 'Gesetz, betreffend die Einführung der Zivilprozeßordnung', 'zpoeg'],
          ['ZPO', 'Zivilprozessordnung', 'zpo'],
        ])
      : teilliste([]),
  );
});

it('schreibt EGZPO statt des Quellkürzels ZPOEG und lässt andere Kurztitel unverändert', async () => {
  expect(await erstelleBundesImportindex()).toMatchObject({ erfolg: true, anzahl: 2 });
  const xml = String(speichern.mock.calls[0]?.[1]);
  const gesetze = [
    ...new DOMParser().parseFromString(xml, 'application/xml').querySelectorAll('gesetz'),
  ];
  expect(
    gesetze.map((g) => [
      g.querySelector('kurztitel')?.textContent,
      g.querySelector('abrufkennung')?.textContent,
    ]),
  ).toEqual([
    ['ZPO', 'zpo'],
    ['EGZPO', 'zpoeg'],
  ]);
});
