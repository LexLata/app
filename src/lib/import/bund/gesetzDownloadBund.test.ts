// gesetzDownloadBund.test.ts
// Konkrete Downloadursachen und eine gemeinsame Frist für Request und Body.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const { fetch } = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch }));
import { ladeUndEntpackeVonGesetzeImInternet } from './gesetzDownloadBund';
const allgemein = 'Gesetz konnte nicht heruntergeladen werden.';
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { onLine: true });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each([404, 500])('erhält HTTP %s als konkreten Downloadfehler', async (status) => {
  fetch.mockResolvedValue(new Response(null, { status }));
  expect(await ladeUndEntpackeVonGesetzeImInternet('G', allgemein)).toEqual({
    fehler: `${allgemein} HTTP ${status}.`,
    fehlerGrund: 'download',
  });
});
it.each(['fetch', 'body'])(
  'erkennt die Zeitüberschreitung bei %s mit demselben Signal und ohne Wartezeit',
  async (phase) => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const abbrechen = async () => {
      controller.abort(new DOMException('Frist abgelaufen', 'TimeoutError'));
      throw 'Request canceled';
    };
    fetch.mockImplementation(
      phase === 'fetch' ? abbrechen : async () => ({ ok: true, arrayBuffer: abbrechen }),
    );
    const ergebnis = await ladeUndEntpackeVonGesetzeImInternet('G', allgemein);
    expect(timeout).toHaveBeenCalledExactlyOnceWith(30_000);
    expect(fetch).toHaveBeenCalledWith('https://www.gesetze-im-internet.de/g/xml.zip', {
      signal: controller.signal,
    });
    expect(ergebnis).toMatchObject({ fehlerGrund: 'keineVerbindung' });
    expect(ergebnis.fehler).toContain('Zeitüberschreitung');
    expect(ergebnis.fehler).toContain('Request canceled');
    expect(ergebnis.fehler).toContain('Frist abgelaufen');
  },
);
it.each([
  new TypeError('DNS fehlgeschlagen'),
  'error sending request for url (https://www.gesetze-im-internet.de/g/xml.zip)',
])('erhält die Ursache eines Verbindungsfehlers: %s', async (ursache) => {
  fetch.mockRejectedValue(ursache);
  const ergebnis = await ladeUndEntpackeVonGesetzeImInternet('G', allgemein);
  expect(ergebnis.fehlerGrund).toBe('keineVerbindung');
  expect(ergebnis.fehler).toContain(String(ursache));
});
it.each(['fetch', 'body'])('erhält sonstige Fehlerursachen bei %s', async (phase) => {
  const ursache = 'TLS-Daten unvollständig';
  const fehler = async () => {
    throw ursache;
  };
  fetch.mockImplementation(
    phase === 'fetch' ? fehler : async () => ({ ok: true, arrayBuffer: fehler }),
  );
  const ergebnis = await ladeUndEntpackeVonGesetzeImInternet('G', allgemein);
  expect(ergebnis.fehlerGrund).toBe('download');
  expect(ergebnis.fehler).toContain(ursache);
});
it.each([true, false])(
  'erhält Berechtigungsfehler auch offline=%s und bei inzwischen abgelaufener Frist',
  async (offline) => {
    vi.stubGlobal('navigator', { onLine: !offline });
    const controller = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const ursache =
      'url not allowed on the configured scope: https://www.gesetze-im-internet.de/g/xml.zip';
    fetch.mockImplementation(async () => {
      controller.abort(new DOMException('Timeout', 'TimeoutError'));
      throw ursache;
    });
    const ergebnis = await ladeUndEntpackeVonGesetzeImInternet('G', allgemein);
    expect(ergebnis.fehlerGrund).toBe('download');
    expect(ergebnis.fehler).toContain(ursache);
    expect(ergebnis.fehler).not.toContain('Zeitüberschreitung');
  },
);
