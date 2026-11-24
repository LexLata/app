import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn<(command: string, args?: unknown) => Promise<unknown>>();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (command: string, args?: unknown) => invoke(command, args),
}));

import {
  mitAutomatischemImportVorgang,
  mitManuellemImportVorgang,
  versucheGesetzSperreZuErhalten,
  gibGesetzSperreFrei,
} from './importVorgang';

beforeEach(() => vi.clearAllMocks());

describe('Importvorgänge', () => {
  it('gibt die individuelle manuelle Kennung auch nach einem Fehler frei', async () => {
    invoke.mockImplementation(async (command) => {
      if (command === 'import_aktualisierung_starten') return 'vorgang-1';
    });

    await expect(
      mitManuellemImportVorgang(async () => {
        throw new Error('kaputt');
      }),
    ).rejects.toThrow('kaputt');
    expect(invoke).toHaveBeenLastCalledWith('import_aktualisierung_beenden', {
      vorgangskennung: 'vorgang-1',
    });
  });

  it('führt eine zurückgestellte automatische Arbeit nicht aus', async () => {
    invoke.mockResolvedValue(null);
    const arbeit = vi.fn(async () => 'fertig');

    await expect(mitAutomatischemImportVorgang(arbeit)).resolves.toEqual({ gestartet: false });
    expect(arbeit).not.toHaveBeenCalled();
  });
});

it('sperrt und entsperrt die normalisierte vollständige Referenz', async () => {
  invoke.mockResolvedValue(true);
  await versucheGesetzSperreZuErhalten({ kurztitel: 'BGB', normgeber: 'de-bund' });
  await gibGesetzSperreFrei({ kurztitel: 'bgb', normgeber: 'de-bund' });
  expect(invoke).toHaveBeenCalledWith('gesetz_import_sperre_versuchen_zu_erhalten', {
    kurztitel: '["de-bund","bgb"]',
  });
  expect(invoke).toHaveBeenCalledWith('gesetz_import_sperre_freigeben', {
    kurztitel: '["de-bund","bgb"]',
  });
  await versucheGesetzSperreZuErhalten({ kurztitel: 'BGB', normgeber: 'de-bw' });
  expect(invoke).toHaveBeenLastCalledWith('gesetz_import_sperre_versuchen_zu_erhalten', {
    kurztitel: '["de-bw","bgb"]',
  });
});

it('wartet auf die fremde Sperre und gibt nur die danach erworbene Sperre frei', async () => {
  vi.useFakeTimers();
  try {
    invoke
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(undefined);
    const { warteAufGesetzImport } = await import('./importVorgang');
    let fertig = false;
    const warten = warteAufGesetzImport({ kurztitel: 'BGB', normgeber: 'de-bund' }).then(() => {
      fertig = true;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(fertig).toBe(false);
    expect(
      invoke.mock.calls.every(([command]) => command !== 'gesetz_import_sperre_freigeben'),
    ).toBe(true);
    await vi.advanceTimersByTimeAsync(100);
    await warten;
    expect(fertig).toBe(true);
    expect(invoke).toHaveBeenLastCalledWith('gesetz_import_sperre_freigeben', {
      kurztitel: '["de-bund","bgb"]',
    });
  } finally {
    vi.useRealTimers();
  }
});
it('beendet das Warten nach der Höchstdauer ohne Freigabe der fremden Sperre', async () => {
  vi.useFakeTimers();
  try {
    invoke.mockResolvedValue(false);
    const { warteAufGesetzImport } = await import('./importVorgang');
    let ergebnis: boolean | undefined;
    const warten = warteAufGesetzImport({ kurztitel: 'BGB', normgeber: 'de-bund' }, 1_000).then(
      (frei) => {
        ergebnis = frei;
      },
    );
    await vi.advanceTimersByTimeAsync(900);
    expect(ergebnis).toBeUndefined();
    await vi.advanceTimersByTimeAsync(200);
    await warten;
    expect(ergebnis).toBe(false);
    expect(
      invoke.mock.calls.every(([command]) => command !== 'gesetz_import_sperre_freigeben'),
    ).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});
it('wertet einen IPC-Fehler beim Abwarten nicht als freien Importabschluss', async () => {
  invoke.mockRejectedValueOnce(new Error('IPC'));
  const { warteAufGesetzImport } = await import('./importVorgang');
  await expect(warteAufGesetzImport({ kurztitel: 'BGB', normgeber: 'de-bund' })).rejects.toThrow(
    'IPC',
  );
  expect(invoke).toHaveBeenCalledTimes(1);
});
