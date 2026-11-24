// @vitest-environment jsdom
// farbschemaAnwendung.test.ts
// Prüft Farbschemawechsel bis zur nativen Fenstergrenze, auch ohne Einstellungs-Hook.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FARBSCHEMA_KEY } from '@/lib/einstellungen/einstellungen.index';

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn<(_command: string, _daten: Record<string, unknown>) => Promise<void>>(
    async () => undefined,
  ),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke, isTauri: () => true }));
vi.mock('@/lib/plattform/tauriHelpers', () => ({ istMobilePlattform: async () => false }));

let dunkel: boolean;
let systemWechsel: (() => void) | undefined;
let abmelden: (() => void) | undefined;

beforeEach(() => {
  vi.resetModules();
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
  localStorage.clear();
  dunkel = false;
  systemWechsel = undefined;
  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return dunkel;
    },
    addEventListener: (_: string, listener: () => void) => {
      systemWechsel = listener;
    },
    removeEventListener: () => {
      systemWechsel = undefined;
    },
  }));
});

afterEach(() => {
  abmelden?.();
  abmelden = undefined;
  vi.unstubAllGlobals();
});

it.each(['hell', 'dunkel', 'system'] as const)(
  'wendet %s vor Abschluss des Fensterstarts nativ und im Dokument an',
  async (farbschema) => {
    dunkel = true;
    localStorage.setItem(FARBSCHEMA_KEY, farbschema);
    const { initialisiereFensterFarbschema } = await import('./farbschemaAnwendung');
    abmelden = await initialisiereFensterFarbschema();
    expect(document.documentElement.dataset.farbschema).toBe(
      farbschema === 'hell' ? 'hell' : 'dunkel',
    );
    expect(invoke).toHaveBeenCalledWith('fenster_farbschema_anwenden', {
      farbschema,
      dunkel: farbschema !== 'hell',
    });
    expect(invoke).toHaveBeenCalledWith('system_theme_melden', { dunkel: true });
  },
);

it('übernimmt Änderungen aus einem anderen Fenster und das Zurücksetzen der Einstellung', async () => {
  const { initialisiereFensterFarbschema } = await import('./farbschemaAnwendung');
  abmelden = await initialisiereFensterFarbschema();
  localStorage.setItem(FARBSCHEMA_KEY, 'dunkel');
  window.dispatchEvent(new StorageEvent('storage', { key: FARBSCHEMA_KEY, newValue: 'dunkel' }));
  await vi.waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('fenster_farbschema_anwenden', {
      farbschema: 'dunkel',
      dunkel: true,
    }),
  );
  expect(document.documentElement.dataset.farbschema).toBe('dunkel');
  localStorage.clear();
  window.dispatchEvent(new StorageEvent('storage', { key: null }));
  await vi.waitFor(() =>
    expect(invoke).toHaveBeenLastCalledWith('fenster_farbschema_anwenden', {
      farbschema: 'system',
      dunkel: false,
    }),
  );
});

it('folgt Systemwechseln nur bei System und meldet den Systemwert unabhängig vom App-Schema', async () => {
  const { initialisiereFensterFarbschema, farbschemaAnwenden } =
    await import('./farbschemaAnwendung');
  abmelden = await initialisiereFensterFarbschema();
  dunkel = true;
  systemWechsel?.();
  await vi.waitFor(() => expect(document.documentElement.dataset.farbschema).toBe('dunkel'));
  localStorage.setItem(FARBSCHEMA_KEY, 'hell');
  await farbschemaAnwenden('hell');
  invoke.mockClear();
  systemWechsel?.();
  await vi.waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('system_theme_melden', { dunkel: true }),
  );
  expect(invoke).not.toHaveBeenCalledWith('fenster_farbschema_anwenden', expect.anything());
  expect(document.documentElement.dataset.farbschema).toBe('hell');
});

it('serialisiert schnelle Wechsel und setzt nach einem nativen Fehler spätere Änderungen fort', async () => {
  const { farbschemaAnwenden } = await import('./farbschemaAnwendung');
  let freigeben: (() => void) | undefined;
  invoke.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        freigeben = resolve;
      }),
  );
  const ersterWechsel = farbschemaAnwenden('dunkel');
  const zweiterWechsel = farbschemaAnwenden('hell');
  await vi.waitFor(() => expect(freigeben).toBeDefined());
  expect(invoke).toHaveBeenCalledTimes(1);
  freigeben?.();
  await Promise.all([ersterWechsel, zweiterWechsel]);
  expect(invoke.mock.calls.map(([_, daten]) => daten)).toEqual([
    { farbschema: 'dunkel', dunkel: true },
    { farbschema: 'hell', dunkel: false },
  ]);
  const melden = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  invoke.mockRejectedValueOnce(new Error('Fenster geschlossen'));
  await farbschemaAnwenden('dunkel');
  await farbschemaAnwenden('hell');
  expect(melden).toHaveBeenCalled();
  expect(invoke).toHaveBeenLastCalledWith('fenster_farbschema_anwenden', {
    farbschema: 'hell',
    dunkel: false,
  });
  melden.mockRestore();
});

it('behält eine explizite Sitzungswahl bei, wenn localStorage nicht verfügbar ist', async () => {
  const { initialisiereFensterFarbschema, farbschemaAnwenden } =
    await import('./farbschemaAnwendung');
  const lesen = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('Storage gesperrt');
  });
  try {
    abmelden = await initialisiereFensterFarbschema();
    await farbschemaAnwenden('dunkel');
    invoke.mockClear();
    systemWechsel?.();
    await vi.waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('system_theme_melden', { dunkel: false }),
    );
    expect(invoke).not.toHaveBeenCalledWith('fenster_farbschema_anwenden', expect.anything());
    expect(document.documentElement.dataset.farbschema).toBe('dunkel');
  } finally {
    lesen.mockRestore();
  }
});
