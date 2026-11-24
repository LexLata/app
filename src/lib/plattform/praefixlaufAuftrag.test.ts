// praefixlaufAuftrag.test.ts
// Desktop-Auftragsgrenze gegen Browser, Mobile und fehlerhafte native Antworten.
import { beforeEach, expect, it, vi } from 'vitest';
const nativ = vi.hoisted(() => ({ tauri: true, mobile: false, invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => nativ.tauri, invoke: nativ.invoke }));
vi.mock('./tauriHelpers', () => ({ istMobilePlattform: async () => nativ.mobile }));
import { holePraefixlaufAuftrag } from './praefixlaufAuftrag';
beforeEach(() => {
  vi.clearAllMocks();
  nativ.tauri = true;
  nativ.mobile = false;
});
it.each(['browser', 'mobile'])('fragt in %s keinen Auftrag ab', async (plattform) => {
  nativ.tauri = plattform !== 'browser';
  nativ.mobile = plattform === 'mobile';
  expect(await holePraefixlaufAuftrag()).toBeNull();
  expect(nativ.invoke).not.toHaveBeenCalled();
});
it('reicht gültige Antwort unverändert weiter', async () => {
  const auftrag = { modus: 'praefix', normgeber: 'de-bund', anzahl: 10, kurztitel: ['GG'] };
  nativ.invoke.mockResolvedValue(auftrag);
  expect(await holePraefixlaufAuftrag()).toBe(auftrag);
});
it.each([
  null,
  undefined,
  {},
  { modus: 'praefix', normgeber: 'eu', anzahl: 1 },
  { modus: 'praefix', normgeber: 'de-bund', anzahl: 0 },
  { modus: 'praefix', normgeber: 'de-bund', anzahl: 1, kurztitel: [''] },
  { modus: 'praefix', normgeber: 'de-bw', anzahl: 1, gescheitert: 'ja' },
  { modus: 'praefix', normgeber: 'de-bw', anzahl: 1, gescheitert: true, kurztitel: ['A'] },
])('startet mit ungültiger Antwort %j keinen Lauf', async (antwort) => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  nativ.invoke.mockResolvedValue(antwort);
  expect(await holePraefixlaufAuftrag()).toBeNull();
  if (antwort !== null) expect(log).toHaveBeenCalled();
  log.mockRestore();
});

it('übernimmt einen gültigen Wiederholungsauftrag', async () => {
  const auftrag = { modus: 'praefix', normgeber: 'de-bw', anzahl: 10, gescheitert: true };
  nativ.invoke.mockResolvedValue(auftrag);
  expect(await holePraefixlaufAuftrag()).toBe(auftrag);
});

it.each(['quelldateien', 'gesetzesxml'])('akzeptiert EU nur für %s', async (modus) => {
  const auftrag = { modus, normgeber: 'eu', anzahl: 1 };
  nativ.invoke.mockResolvedValue(auftrag);
  expect(await holePraefixlaufAuftrag()).toBe(auftrag);
});
it.each([
  { modus: 'unbekannt', normgeber: 'de-bund', anzahl: 1 },
  { modus: 'praefix', normgeber: 'bund', anzahl: 1 }, // normgeber-negativ: alte Entwicklerquelle.
  { modus: 'praefix', normgeber: 'bw', anzahl: 1 }, // normgeber-negativ: alte Entwicklerquelle.
  {
    modus: 'praefix',
    normgeber: 'Bund' /* normgeber-negativ: Konkreter alter Wert zur Ablehnungsprüfung. */,
    anzahl: 1,
  },
  { modus: 'praefix', normgeber: 'europarat', anzahl: 1 },
  { modus: 'praefix', normgeber: 'eu', anzahl: 1 },
  { modus: 'auswerten', normgeber: 'eu' },
  { modus: 'praefix', normgeber: 'de-bund', anzahl: 1, neu: true },
  { modus: 'gesetzesxml', normgeber: 'de-bw', anzahl: 1, gescheitert: true },
  { modus: 'auswerten', normgeber: 'de-bund', anzahl: 1 },
])('verweigert unvereinbare Modusoptionen %j', async (auftrag) => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  nativ.invoke.mockResolvedValue(auftrag);
  expect(await holePraefixlaufAuftrag()).toBeNull();
  log.mockRestore();
});
it('akzeptiert die Auswertung ohne Anzahl', async () => {
  const auftrag = { modus: 'auswerten', normgeber: 'de-bw' };
  nativ.invoke.mockResolvedValue(auftrag);
  expect(await holePraefixlaufAuftrag()).toBe(auftrag);
});

it('begrenzt den Präfixlauf auch typseitig auf Bund und BW', () => {
  type Auftrag = import('./praefixlaufAuftrag').PraefixlaufAuftrag;
  // @ts-expect-error EU hat keinen Präfixlauf.
  const ungueltig: Auftrag = { modus: 'praefix', normgeber: 'eu', anzahl: 1 };
  expect(ungueltig.normgeber).toBe('eu');
});

it.each(['de-bund', 'de-bw', 'eu'] as const)(
  'übernimmt gültige Beschaffungsoptionen für %s',
  async (normgeber) => {
    for (const modus of ['quelldateien', 'gesetzesxml'] as const) {
      const auftrag = { modus, normgeber, anzahl: Number.MAX_SAFE_INTEGER, kurztitel: ['A'] };
      nativ.invoke.mockResolvedValue(auftrag);
      expect(await holePraefixlaufAuftrag()).toBe(auftrag);
    }
    for (const modus of ['quelldateien', 'gesetzesxml'] as const) {
      const auftrag = { modus, normgeber, anzahl: 2, neu: true };
      nativ.invoke.mockResolvedValue(auftrag);
      expect(await holePraefixlaufAuftrag()).toBe(auftrag);
    }
  },
);

it('übernimmt Debug als bestätigte Option und verweigert andere Werte', async () => {
  const auftrag = { modus: 'praefix', normgeber: 'de-bund', anzahl: 1, debug: true };
  nativ.invoke.mockResolvedValue(auftrag);
  expect(await holePraefixlaufAuftrag()).toEqual(auftrag);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    for (const debug of [false, '1', 1]) {
      nativ.invoke.mockResolvedValue({ ...auftrag, debug });
      expect(await holePraefixlaufAuftrag()).toBeNull();
    }
  } finally {
    log.mockRestore();
  }
});
