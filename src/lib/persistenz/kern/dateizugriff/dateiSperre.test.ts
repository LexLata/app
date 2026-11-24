// Prüft den IPC-Vertrag und die Fehlerbehandlung der Dateisperre.
import { beforeEach, expect, it, vi } from 'vitest';
const invoke = vi.fn();
const zeigeBanner = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock('@/lib/banner/banner.index', () => ({
  zeigeBanner: (...args: unknown[]) => zeigeBanner(...args),
}));
import {
  mitDateiSperre,
  mitDateiSperren,
  istDateiSperreWartefrist,
  nachDateiSperrenFreigabe,
  unterbrecheDateiSperre,
} from './dateiSperre';
beforeEach(() => {
  vi.clearAllMocks();
  invoke.mockResolvedValue('token');
});
it('erwirbt vor der Aktion und gibt danach frei; reicht Token und Ergebnis durch', async () => {
  const reihenfolge: string[] = [];
  invoke.mockImplementation(async (command: string) => {
    reihenfolge.push(command);
    return 'token';
  });
  await expect(
    mitDateiSperre('a.xml', async (token) => {
      expect(token).toBe('token');
      reihenfolge.push('aktion');
      return 42;
    }),
  ).resolves.toBe(42);
  expect(reihenfolge).toEqual(['datei_sperre_erwerben', 'aktion', 'datei_sperre_freigeben']);
  expect(invoke).toHaveBeenNthCalledWith(1, 'datei_sperre_erwerben', { relativerPfad: 'a.xml' });
  expect(invoke).toHaveBeenNthCalledWith(2, 'datei_sperre_freigeben', { token: 'token' });
});
it.each([true, false])(
  'unterbricht für die Aktion und meldet nach dem Fortsetzen den Änderungsstand (%s)',
  async (unveraendert) => {
    const reihenfolge: string[] = [];
    invoke.mockImplementation(async (command: string) => {
      reihenfolge.push(command);
      return command === 'datei_sperre_fortsetzen' ? unveraendert : undefined;
    });
    const fehler = Error('lesen');
    await expect(
      unterbrecheDateiSperre('token', async () => {
        reihenfolge.push('aktion');
        throw fehler;
      }),
    ).resolves.toEqual({ unveraendert, erfolg: false, fehler });
    expect(reihenfolge).toEqual(['datei_sperre_unterbrechen', 'aktion', 'datei_sperre_fortsetzen']);
    expect(invoke).toHaveBeenNthCalledWith(1, 'datei_sperre_unterbrechen', { token: 'token' });
    expect(invoke).toHaveBeenNthCalledWith(2, 'datei_sperre_fortsetzen', { token: 'token' });
    invoke.mockResolvedValueOnce(undefined).mockResolvedValueOnce(true);
    await expect(unterbrecheDateiSperre('token', async () => 7)).resolves.toEqual({
      unveraendert: true,
      erfolg: true,
      wert: 7,
    });
  },
);
it('wirft, wenn das Fortsetzen scheitert', async () => {
  invoke.mockResolvedValueOnce(undefined).mockRejectedValueOnce('wartefrist');
  await expect(unterbrecheDateiSperre('token', async () => 1)).rejects.toBe('wartefrist');
});
it('gibt auch nach Aktionsfehler frei', async () => {
  const fehler = new Error('aktion');
  await expect(
    mitDateiSperre('a.xml', async () => {
      throw fehler;
    }),
  ).rejects.toBe(fehler);
  expect(invoke).toHaveBeenCalledTimes(2);
});
it.each(['wartefrist', 'ipc'])(
  'verhindert bei Erwerbsfehler %s Aktion und Freigabe',
  async (fehler) => {
    invoke.mockRejectedValue(fehler);
    const aktion = vi.fn();
    await expect(mitDateiSperre('a.xml', aktion)).rejects.toBe(fehler);
    expect(aktion).not.toHaveBeenCalled();
    expect(invoke).toHaveBeenCalledTimes(1);
    if (fehler === 'wartefrist')
      expect(zeigeBanner).toHaveBeenCalledWith({
        art: 'dateibefunde',
        typ: 'warnung',
        text: 'Die Datei wird noch bearbeitet. Bitte erneut versuchen.',
      });
    else
      expect(zeigeBanner).toHaveBeenCalledWith({
        art: 'dateibefunde',
        typ: 'fehler',
        text: 'Die Dateisperre konnte nicht erworben werden. Bitte erneut versuchen.',
      });
  },
);
it.each([false, true])(
  'Freigabefehler verdeckt Ergebnis/Aktionsfehler nicht (%s)',
  async (scheitert) => {
    invoke.mockResolvedValueOnce('token').mockRejectedValueOnce('freigabe');
    const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fehler = new Error('aktion');
    const ergebnis = mitDateiSperre('a.xml', async () => {
      if (scheitert) throw fehler;
      return 42;
    });
    if (scheitert) await expect(ergebnis).rejects.toBe(fehler);
    else await expect(ergebnis).resolves.toBe(42);
    expect(protokoll).toHaveBeenCalled();
    protokoll.mockRestore();
  },
);

it('unterscheidet die Wartefrist von sonstigen Fehlern', () => {
  expect(istDateiSperreWartefrist('wartefrist')).toBe(true);
  expect(istDateiSperreWartefrist('ipc')).toBe(false);
  expect(istDateiSperreWartefrist(new Error('wartefrist'))).toBe(false);
});

it('dedupliziert und sortiert gemeinsame Sperren und gibt sie rückwärts frei', async () => {
  invoke.mockImplementation(async (command: string, args: { relativerPfad?: string }) =>
    command === 'datei_sperre_erwerben' ? `token:${args.relativerPfad}` : undefined,
  );
  await expect(
    mitDateiSperren(['b.xml', 'a.xml', 'b.xml'], async (tokens) => {
      expect([...tokens]).toEqual([
        ['a.xml', 'token:a.xml'],
        ['b.xml', 'token:b.xml'],
      ]);
      return 42;
    }),
  ).resolves.toBe(42);
  expect(invoke.mock.calls).toEqual([
    ['datei_sperre_erwerben', { relativerPfad: 'a.xml' }],
    ['datei_sperre_erwerben', { relativerPfad: 'b.xml' }],
    ['datei_sperre_freigeben', { token: 'token:b.xml' }],
    ['datei_sperre_freigeben', { token: 'token:a.xml' }],
  ]);
});
it('gibt bereits erworbene gemeinsame Sperren nach Timeout frei', async () => {
  invoke
    .mockResolvedValueOnce('a-token')
    .mockRejectedValueOnce('wartefrist')
    .mockResolvedValueOnce(undefined);
  const aktion = vi.fn();
  await expect(mitDateiSperren(['b', 'a'], aktion)).rejects.toBe('wartefrist');
  expect(aktion).not.toHaveBeenCalled();
  expect(invoke).toHaveBeenLastCalledWith('datei_sperre_freigeben', { token: 'a-token' });
});

it('gegenseitige Verweise warten bei identischen Quellen ohne Deadlock', async () => {
  const gehalten = new Set<string>();
  const wartende = new Map<string, (() => void)[]>();
  const aktiv: string[] = [];
  invoke.mockImplementation(
    async (befehl: string, args: { relativerPfad?: string; token?: string }) => {
      const pfad = args.relativerPfad ?? args.token!;
      if (befehl === 'datei_sperre_erwerben') {
        if (gehalten.has(pfad))
          await new Promise<void>((resolve) => {
            const queue = wartende.get(pfad) ?? [];
            queue.push(resolve);
            wartende.set(pfad, queue);
          });
        else gehalten.add(pfad);
        return pfad;
      }
      const naechster = wartende.get(pfad)?.shift();
      if (naechster) naechster();
      else gehalten.delete(pfad);
    },
  );
  const bearbeiten = async (name: string) => {
    expect(aktiv).toEqual([]);
    aktiv.push(name);
    expect([...gehalten].sort()).toEqual(['gesetz-a', 'gesetz-b']);
    await Promise.resolve();
    aktiv.pop();
    return name;
  };
  expect(
    await Promise.all([
      mitDateiSperren(['gesetz-b', 'gesetz-a'], () => bearbeiten('A verweist auf B')),
      mitDateiSperren(['gesetz-a', 'gesetz-b'], () => bearbeiten('B verweist auf A')),
    ]),
  ).toEqual(['A verweist auf B', 'B verweist auf A']);
  expect(gehalten.size).toBe(0);
});

// Ausdrückliche Empfänger gehören ausschließlich zum jeweiligen Vorgang.
it.each(['wartefrist', 'ipc'])(
  'meldet Erwerbsfehler %s ausdrücklich statt per Banner',
  async (fehler) => {
    invoke.mockRejectedValue(fehler);
    const meldungEmpfangen = vi.fn();
    const aktion = vi.fn();
    await expect(mitDateiSperre('a.xml', aktion, meldungEmpfangen)).rejects.toBe(fehler);
    expect(aktion).not.toHaveBeenCalled();
    expect(meldungEmpfangen).toHaveBeenCalledWith(
      expect.objectContaining({
        anlass: 'dateisperre',
        art: 'fehler',
        aenderungsstand: 'keine',
        text:
          fehler === 'wartefrist'
            ? 'Die Datei wird noch bearbeitet. Bitte erneut versuchen.'
            : 'Die Dateisperre konnte nicht erworben werden. Bitte erneut versuchen.',
      }),
    );
    expect(zeigeBanner).not.toHaveBeenCalled();
  },
);
it('reicht den Empfänger auch durch gemeinsame Sperren und wahrt den ursprünglichen Fehler', async () => {
  invoke
    .mockResolvedValueOnce('a-token')
    .mockRejectedValueOnce('wartefrist')
    .mockResolvedValueOnce(undefined);
  const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
  const meldungEmpfangen = vi.fn(() => {
    throw new Error('Meldung');
  });
  await expect(mitDateiSperren(['b', 'a'], vi.fn(), meldungEmpfangen)).rejects.toBe('wartefrist');
  expect(meldungEmpfangen).toHaveBeenCalledTimes(1);
  expect(invoke).toHaveBeenLastCalledWith('datei_sperre_freigeben', { token: 'a-token' });
  expect(zeigeBanner).not.toHaveBeenCalled();
  expect(protokoll).toHaveBeenCalled();
  protokoll.mockRestore();
});

it.each([false, true])(
  'meldet Änderungen nach der letzten gemeinsamen Freigabe auch bei späterem Aktionsfehler (%s)',
  async (scheitert) => {
    const gehalten = new Set<string>();
    invoke.mockImplementation(
      async (befehl: string, args: { relativerPfad?: string; token?: string }) => {
        if (befehl === 'datei_sperre_erwerben') {
          const token = args.relativerPfad ?? '';
          gehalten.add(token);
          return token;
        }
        gehalten.delete(args.token ?? '');
      },
    );
    const melden = vi.fn(async () => {
      expect([...gehalten]).toEqual([]);
    });
    const fehler = new Error('Schreiben nach Sicherung');
    const ergebnis = mitDateiSperren(['b', 'a'], async (tokens) => {
      const token = tokens.get('b');
      if (!token) throw new Error('Sperre fehlt.');
      nachDateiSperrenFreigabe(token, melden);
      nachDateiSperrenFreigabe(token, melden);
      expect(melden).not.toHaveBeenCalled();
      if (scheitert) throw fehler;
      return 42;
    });
    if (scheitert) await expect(ergebnis).rejects.toBe(fehler);
    else await expect(ergebnis).resolves.toBe(42);
    expect(melden).toHaveBeenCalledTimes(1);
  },
);

it('führt nach gescheiterter Freigabe keine Abschlussmeldung aus und verwirft die Registrierung', async () => {
  invoke.mockResolvedValueOnce('token').mockRejectedValueOnce('freigabe');
  const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
  const melden = vi.fn(async () => {});
  await mitDateiSperre('a', async (token) => nachDateiSperrenFreigabe(token, melden));
  expect(melden).not.toHaveBeenCalled();
  expect(() => nachDateiSperrenFreigabe('token', melden)).toThrow('nicht aktiv');
  expect(protokoll).toHaveBeenCalled();
  protokoll.mockRestore();
});
