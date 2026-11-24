// cellar.test.ts
// Auswahl und HTTP-Fehlervertrag der Cellar-Quelle.
import { describe, expect, it, vi } from 'vitest';
const http = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => http);
import { ladeFormex, waehleKonsolidierung } from './cellar';
describe('Cellar', () => {
  it('sortiert selbst, entfernt Dubletten und ignoriert zukünftige Fassungen', () => {
    expect(
      waehleKonsolidierung(
        [
          { celex: 'neu', datum: '2025-01-01' },
          { celex: 'alt', datum: '2020-01-01' },
          { celex: 'neu', datum: '2025-01-01' },
          { celex: 'morgen', datum: '2027-01-01' },
        ],
        '2026-10-20',
      ),
    ).toEqual({ celex: 'neu', datum: '2025-01-01' });
    expect(waehleKonsolidierung([], '2026-10-20')).toBeUndefined();
  });
  it('unterscheidet fehlendes Format, Serverfehler und Verbindungsausfall', async () => {
    http.fetch.mockResolvedValueOnce(new Response('', { status: 404 }));
    expect(await ladeFormex('32016R0679')).toEqual({ fehlt: true });
    http.fetch.mockResolvedValueOnce(new Response('', { status: 406 }));
    expect(await ladeFormex('32016R0679')).toEqual({ fehlt: true });
    http.fetch.mockResolvedValueOnce(new Response('', { status: 500 }));
    expect(await ladeFormex('32016R0679')).toMatchObject({ fehler: { grund: 'download' } });
    http.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await ladeFormex('32016R0679')).toMatchObject({ fehler: { grund: 'keineVerbindung' } });
  });
});

it('folgt Cellar-Redirects ausschließlich über HTTPS und stoppt fremde Hosts', async () => {
  http.fetch.mockReset();
  http.fetch.mockResolvedValueOnce(
    new Response(null, {
      status: 303,
      headers: { location: 'http://publications.europa.eu/resource/cellar/id/zip' },
    }),
  );
  http.fetch.mockResolvedValueOnce(
    new Response(new Uint8Array([1]), { headers: { 'content-type': 'application/zip' } }),
  );
  expect(await ladeFormex('12016E/TXT')).toMatchObject({ zip: new Uint8Array([1]) });
  expect(http.fetch.mock.calls.map(([url]) => url)).toEqual([
    'https://publications.europa.eu/resource/celex/12016E%2FTXT',
    'https://publications.europa.eu/resource/cellar/id/zip',
  ]);
  expect(http.fetch.mock.calls[0]?.[1]).toMatchObject({ maxRedirections: 0 });
  http.fetch.mockReset();
  http.fetch.mockResolvedValueOnce(
    new Response(null, { status: 302, headers: { location: 'https://fremd.example/zip' } }),
  );
  expect(await ladeFormex('32016R0679')).toMatchObject({ fehler: { grund: 'download' } });
  expect(http.fetch).toHaveBeenCalledTimes(1);
});

it('wendet den optionalen Timeout an und bewahrt den Standard', async () => {
  const { timeoutSignal } = await import('@/lib/import/basis/basis.index');
  const timeout = vi.spyOn(AbortSignal, 'timeout');
  timeoutSignal();
  timeoutSignal(60_000);
  expect(timeout.mock.calls.slice(-2)).toEqual([[30_000], [60_000]]);
  timeout.mockRestore();
});
