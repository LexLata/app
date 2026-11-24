// internetVerbindung.test.ts
//
// Prüft die zentrale Verbindungserkennung und den BW-Vorabcheck anhand der
// Fehlertexte von tauri-plugin-http 2.8.0 und Tauri 2.12.0. Berechtigungs-
// abweisungen bleiben auch offline sichtbar; HTTP-Antworten belegen Erreichbarkeit.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { istVerbindungsFehler, pruefeErreichbarkeit, timeoutSignal } from './internetVerbindung';

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: fetchMock }));

const URL_BW = 'https://www.landesrecht-bw.de/';
const NETZWERKFEHLER = `error sending request for url (${URL_BW})`;
const BERECHTIGUNGSFEHLER = [
  `url not allowed on the configured scope: ${URL_BW}`,
  'http.fetch not allowed. Permissions associated with this command: http:allow-fetch, http:default',
  'http.fetch_send not allowed on window "main", webview "main", URL: local',
  'http.fetch not allowed on origin [local]. Please create a capability that has this origin on the context field.',
  'http.fetch explicitly denied on origin local',
  'command not allowed on any window/webview/URL context',
  'Command plugin:http|fetch not allowed by ACL',
];
const ABBRUCHFEHLER = ['Request canceled', 'Request cancelled'];

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('navigator', { onLine: true });
});
afterEach(() => vi.unstubAllGlobals());

describe('istVerbindungsFehler', () => {
  it.each([true, undefined])('erkennt native Netzwerkfehler bei navigator=%s', (online) => {
    vi.stubGlobal('navigator', online === undefined ? undefined : { onLine: online });
    expect(istVerbindungsFehler(NETZWERKFEHLER)).toBe(true);
  });

  it.each(ABBRUCHFEHLER)('erkennt den nativen/JS-Abbruch %s', (fehler) => {
    expect(istVerbindungsFehler(fehler)).toBe(true);
  });

  it.each([
    new Error(NETZWERKFEHLER),
    new TypeError('Failed to fetch'),
    new Error('NetworkError when attempting to fetch resource.'),
    new DOMException('The operation was aborted.', 'AbortError'),
    new DOMException('The operation timed out.', 'TimeoutError'),
  ])('erhält die Erkennung vorhandener Error-/DOMException-Fälle: %s', (fehler) => {
    expect(istVerbindungsFehler(fehler)).toBe(true);
  });

  it.each([true, false])('grenzt Berechtigungen vor dem Offline-Signal ab (%s)', (online) => {
    vi.stubGlobal('navigator', { onLine: online });
    for (const meldung of BERECHTIGUNGSFEHLER) {
      expect(istVerbindungsFehler(meldung), meldung).toBe(false);
      expect(istVerbindungsFehler(new Error(meldung)), meldung).toBe(false);
    }
  });

  it.each([
    'unbekannter nativer Fehler',
    'invalid HTTP header value',
    'scheme ftp not supported',
    'error sending request for url ohne Klammern',
    'Request canceled: unbekannter Zusatz',
    { message: NETZWERKFEHLER },
    null,
  ])('klassifiziert unbekannte Texte/Objekte nicht pauschal: %s', (fehler) => {
    expect(istVerbindungsFehler(fehler)).toBe(false);
  });

  it('erhält das Offline-Signal für Fehler ohne Berechtigungsabweisung', () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(istVerbindungsFehler('unbekannter Fehler')).toBe(true);
  });

  it('verwendet die gemeinsame Frist von 30 Sekunden', () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const signal = timeoutSignal();
    expect(timeout).toHaveBeenCalledWith(30_000);
    expect(signal.aborted).toBe(false);
    timeout.mockRestore();
  });
});

describe('pruefeErreichbarkeit', () => {
  it.each([NETZWERKFEHLER, ...ABBRUCHFEHLER, new DOMException('Timeout', 'TimeoutError')])(
    'liefert den Verbindungstext für %s',
    async (fehler) => {
      fetchMock.mockRejectedValue(fehler);
      await expect(pruefeErreichbarkeit(URL_BW)).resolves.toEqual({
        fehler: 'Keine Verbindung zu landesrecht-bw.de möglich. Bitte später erneut versuchen.',
      });
    },
  );

  it.each([200, 404, 500])('wertet HTTP %s als Erreichbarkeit', async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    await expect(pruefeErreichbarkeit(URL_BW)).resolves.toEqual({});
    expect(fetchMock).toHaveBeenCalledWith(URL_BW, { signal: expect.any(AbortSignal) });
  });

  it.each([true, false])('wirft Berechtigungsfehler unverändert weiter (%s)', async (online) => {
    vi.stubGlobal('navigator', { onLine: online });
    for (const meldung of BERECHTIGUNGSFEHLER) {
      for (const fehler of [meldung, new Error(meldung)]) {
        fetchMock.mockRejectedValue(fehler);
        await expect(pruefeErreichbarkeit(URL_BW)).rejects.toBe(fehler);
      }
    }
  });

  it('wirft unbekannte native Fehler unverändert weiter', async () => {
    const fehler = 'invalid HTTP header value';
    fetchMock.mockRejectedValue(fehler);
    await expect(pruefeErreichbarkeit(URL_BW)).rejects.toBe(fehler);
  });
});
