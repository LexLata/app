// Prüft bestätigte Hinweisübernahme, Wiederholungen und den abbrechbaren Empfang.
import { afterEach, beforeEach, expect, expectTypeOf, it, vi } from 'vitest';
import {
  empfangeHauptfensterHinweise,
  sendeHauptfensterHinweis,
} from './fensterkommunikation.index';
import type { HauptfensterHinweis } from './hauptfensterHinweise';

const nativ = vi.hoisted(() => ({ invoke: vi.fn(), vorhanden: true, listen: vi.fn() }));
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: () => ({ listen: nativ.listen }) }));
let wecken: () => void;
let listenerAbmelden: ReturnType<typeof vi.fn>;
vi.mock('@tauri-apps/api/core', () => ({ invoke: nativ.invoke, isTauri: () => nativ.vorhanden }));
const hinweis = { text: 'Gespeichert; Prüfung offen.', typ: 'warnung' as const };
let abmelden: (() => void) | undefined;
beforeEach(() => {
  vi.useFakeTimers();
  nativ.vorhanden = true;
  listenerAbmelden = vi.fn();
  nativ.listen.mockReset().mockImplementation(async (_name, handler) => {
    wecken = () => handler({ payload: null });
    return listenerAbmelden;
  });
  nativ.invoke
    .mockReset()
    .mockImplementation(async (command) => (command === 'hauptfenster_hinweise_lesen' ? [] : null));
});
afterEach(async () => {
  abmelden?.();
  abmelden = undefined;
  await vi.advanceTimersByTimeAsync(0);
  vi.useRealTimers();
  vi.restoreAllMocks();
});
async function empfangen(handler: (daten: HauptfensterHinweis) => undefined) {
  const empfang = empfangeHauptfensterHinweise(handler);
  abmelden = empfang.abmelden;
  await empfang.bereit;
  await vi.advanceTimersByTimeAsync(0);
  return empfang;
}
it('übergibt getrennte Kennungen und ausschließlich serialisierbare Hinweisdaten vor Absenderfreigabe', async () => {
  await Promise.all([
    sendeHauptfensterHinweis({ ...hinweis, aktion: () => {} } as typeof hinweis, 'fenster-oeffner'),
    sendeHauptfensterHinweis(hinweis),
  ]);
  const sendungen = nativ.invoke.mock.calls;
  expect(sendungen).toHaveLength(2);
  expect(sendungen[0]).toEqual([
    'hauptfenster_hinweis_senden',
    { kennung: expect.any(String), hinweis, oeffner: 'fenster-oeffner' },
  ]);
  expect(sendungen[1]?.[1].kennung).not.toBe(sendungen[0]?.[1].kennung);
});
it('bestätigt erst nach Übernahme und bestätigt erneute Abrufe ohne doppeltes Banner', async () => {
  const kennung = crypto.randomUUID();
  const uebernommen = vi.fn();
  nativ.invoke.mockImplementation(async (command) => {
    if (command === 'hauptfenster_hinweise_lesen') return [{ kennung, hinweis }];
    if (command === 'hauptfenster_hinweis_bestaetigen') expect(uebernommen).toHaveBeenCalledOnce();
    return null;
  });
  await empfangen(uebernommen);
  await vi.advanceTimersByTimeAsync(500);
  expect(uebernommen).toHaveBeenCalledExactlyOnceWith(hinweis);
  const anmeldung = nativ.invoke.mock.calls.find(([c]) => c === 'hauptfenster_hinweise_bereit')![1];
  expect(nativ.invoke).toHaveBeenCalledWith('hauptfenster_hinweis_bestaetigen', {
    ...anmeldung,
    kennung,
  });
});
it('bestätigt fehlgeschlagene Übernahme nicht und verarbeitet andere parallele Hinweise', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const a = crypto.randomUUID();
  const b = crypto.randomUUID();
  nativ.invoke.mockImplementation(async (command) =>
    command === 'hauptfenster_hinweise_lesen'
      ? [
          { kennung: a, hinweis },
          { kennung: b, hinweis: { ...hinweis, text: 'Zweiter' } },
        ]
      : null,
  );
  await empfangen((daten) => {
    if (daten.text === hinweis.text) throw new Error('Store');
  });
  expect(nativ.invoke).not.toHaveBeenCalledWith(
    'hauptfenster_hinweis_bestaetigen',
    expect.objectContaining({ kennung: a }),
  );
  expect(nativ.invoke).toHaveBeenCalledWith(
    'hauptfenster_hinweis_bestaetigen',
    expect.objectContaining({ kennung: b }),
  );
});
it('wiederholt fehlgeschlagene Bestätigung ohne doppelte Übernahme und beendet anhaltende Kommunikationsfehler', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const kennung = crypto.randomUUID();
  const uebernommen = vi.fn();
  nativ.invoke.mockImplementation(async (command) => {
    if (command === 'hauptfenster_hinweise_lesen') return [{ kennung, hinweis }];
    if (command === 'hauptfenster_hinweis_bestaetigen') throw new Error('IPC');
    return null;
  });
  await empfangen(uebernommen);
  await vi.advanceTimersByTimeAsync(31_000);
  expect(uebernommen).toHaveBeenCalledOnce();
  expect(log).toHaveBeenCalledTimes(2);
  expect(nativ.invoke).toHaveBeenCalledWith('hauptfenster_hinweise_abmelden', expect.any(Object));
  const anzahl = nativ.invoke.mock.calls.length;
  await vi.advanceTimersByTimeAsync(31_000);
  expect(nativ.invoke.mock.calls).toHaveLength(anzahl);
});
it('unterbindet Übernahme und Bestätigung nach Abmeldung während eines Abrufs', async () => {
  let fertig!: (daten: unknown) => void;
  nativ.invoke.mockImplementation(async (command) =>
    command === 'hauptfenster_hinweise_lesen'
      ? new Promise((resolve) => {
          fertig = resolve;
        })
      : null,
  );
  const uebernommen = vi.fn();
  const empfang = await empfangen(uebernommen);
  empfang.abmelden();
  fertig([{ kennung: crypto.randomUUID(), hinweis }]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(uebernommen).not.toHaveBeenCalled();
  expect(nativ.invoke.mock.calls.some(([c]) => c === 'hauptfenster_hinweis_bestaetigen')).toBe(
    false,
  );
});
it('meldet eine verspätete Anmeldung ab und verhindert einen alten StrictMode-Empfänger', async () => {
  let fertig!: () => void;
  nativ.invoke.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        fertig = resolve;
      }),
  );
  const alt = empfangeHauptfensterHinweise(vi.fn());
  await vi.advanceTimersByTimeAsync(0);
  alt.abmelden();
  const neu = empfangeHauptfensterHinweise(vi.fn());
  abmelden = neu.abmelden;
  fertig();
  await Promise.all([alt.bereit, neu.bereit]);
  const commands = nativ.invoke.mock.calls.map(([c]) => c);
  expect(commands.slice(0, 3)).toEqual([
    'hauptfenster_hinweise_bereit',
    'hauptfenster_hinweise_abmelden',
    'hauptfenster_hinweise_bereit',
  ]);
});
it('gibt Annahmefehler weiter und lässt die Browser-Vorschau ohne native Empfangsbefehle laufen', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const fehler = new Error('Annahme');
  nativ.invoke.mockRejectedValueOnce(fehler);
  await expect(sendeHauptfensterHinweis(hinweis)).rejects.toBe(fehler);
  expect(log).toHaveBeenCalledWith('Hauptfenster-Hinweis konnte nicht angenommen werden:', fehler);
  nativ.invoke.mockClear();
  nativ.vorhanden = false;
  await empfangen(vi.fn());
  await vi.advanceTimersByTimeAsync(30_000);
  expect(nativ.invoke).not.toHaveBeenCalled();
});

it('gibt den Absender erst nach nativer Annahme frei und begrenzt einen unbeantworteten Annahmeversuch', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  let annehmen!: () => void;
  nativ.invoke.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        annehmen = resolve;
      }),
  );
  let freigegeben = false;
  const sendung = sendeHauptfensterHinweis(hinweis).then(() => {
    freigegeben = true;
  });
  await vi.advanceTimersByTimeAsync(1000);
  expect(freigegeben).toBe(false);
  annehmen();
  await sendung;
  expect(freigegeben).toBe(true);
  nativ.invoke.mockImplementationOnce(() => new Promise(() => {}));
  const unbeantwortet = expect(sendeHauptfensterHinweis(hinweis)).rejects.toThrow(
    'Zeitüberschreitung',
  );
  await vi.advanceTimersByTimeAsync(30_000);
  await unbeantwortet;
  expect(nativ.invoke).toHaveBeenCalledTimes(2);
});
it('begrenzt einen unbeantworteten Abruf ohne parallele Abrufe oder weitere Übernahme', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const uebernehmen = vi.fn();
  nativ.invoke.mockImplementation(async (command) =>
    command === 'hauptfenster_hinweise_lesen' ? new Promise(() => {}) : null,
  );
  await empfangen(uebernehmen);
  await vi.advanceTimersByTimeAsync(31_000);
  expect(nativ.invoke.mock.calls.filter(([c]) => c === 'hauptfenster_hinweise_lesen')).toHaveLength(
    1,
  );
  expect(nativ.invoke).toHaveBeenCalledWith('hauptfenster_hinweise_abmelden', expect.any(Object));
  expect(uebernehmen).not.toHaveBeenCalled();
});
it('liest nicht vor Bereitschaft und gibt den endgültigen Anmeldefehler mit Cleanup weiter', async () => {
  nativ.invoke.mockRejectedValueOnce(new Error('Nicht bereit'));
  const empfang = empfangeHauptfensterHinweise(vi.fn());
  abmelden = empfang.abmelden;
  await expect(empfang.bereit).rejects.toThrow('Nicht bereit');
  await vi.advanceTimersByTimeAsync(31_000);
  expect(nativ.invoke.mock.calls.map(([c]) => c)).toEqual([
    'hauptfenster_hinweise_bereit',
    'hauptfenster_hinweise_abmelden',
  ]);
});

it('schließt asynchrone Empfänger und Aktionscallbacks im Hinweisvertrag aus', () => {
  expectTypeOf<(hinweis: HauptfensterHinweis) => Promise<void>>().not.toMatchTypeOf<
    Parameters<typeof empfangeHauptfensterHinweise>[0]
  >();
  expectTypeOf<keyof HauptfensterHinweis>().toEqualTypeOf<'text' | 'typ' | 'meldungen'>();
});

it('begrenzt auch einen ganzen Abruf mit mehreren unbeantworteten Bestätigungen', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  nativ.invoke.mockImplementation(async (command) => {
    if (command === 'hauptfenster_hinweise_lesen')
      return [
        { kennung: crypto.randomUUID(), hinweis },
        { kennung: crypto.randomUUID(), hinweis },
      ];
    if (command === 'hauptfenster_hinweis_bestaetigen') return new Promise(() => {});
    return null;
  });
  await empfangen(vi.fn());
  await vi.advanceTimersByTimeAsync(31_000);
  expect(nativ.invoke).toHaveBeenCalledWith('hauptfenster_hinweise_abmelden', expect.any(Object));
  expect(
    nativ.invoke.mock.calls.filter(([c]) => c === 'hauptfenster_hinweis_bestaetigen'),
  ).toHaveLength(1);
});

it('liest im Leerlauf und nach letzter Bestätigung auch nach langer Zeit nicht erneut', async () => {
  await empfangen(vi.fn());
  await vi.advanceTimersByTimeAsync(120_000);
  expect(nativ.invoke.mock.calls.filter(([c]) => c === 'hauptfenster_hinweise_lesen')).toHaveLength(
    1,
  );
  const kennung = crypto.randomUUID();
  nativ.invoke.mockImplementation(async (command) =>
    command === 'hauptfenster_hinweise_lesen' ? [{ kennung, hinweis }] : null,
  );
  wecken();
  await vi.advanceTimersByTimeAsync(0);
  const anzahl = nativ.invoke.mock.calls.length;
  await vi.advanceTimersByTimeAsync(120_000);
  expect(nativ.invoke.mock.calls).toHaveLength(anzahl);
});
it('registriert den Fensterlistener vor Bereitschaft und räumt ihn auch bei Abmeldung auf', async () => {
  await empfangen(vi.fn());
  expect(nativ.listen).toHaveBeenCalledWith(
    'hauptfenster-hinweise-verfuegbar',
    expect.any(Function),
  );
  expect(nativ.listen.mock.invocationCallOrder[0]).toBeLessThan(
    nativ.invoke.mock.invocationCallOrder[0]!,
  );
  abmelden!();
  await vi.advanceTimersByTimeAsync(0);
  expect(listenerAbmelden).toHaveBeenCalledOnce();
  wecken();
  const anzahl = nativ.invoke.mock.calls.length;
  await vi.advanceTimersByTimeAsync(1000);
  expect(nativ.invoke.mock.calls).toHaveLength(anzahl);
});
it('bündelt Weckereignisse während eines Abrufs und liest danach einmal erneut', async () => {
  let fertig!: (daten: unknown) => void;
  nativ.invoke.mockImplementation(async (command) =>
    command === 'hauptfenster_hinweise_lesen'
      ? new Promise((resolve) => {
          fertig = resolve;
        })
      : null,
  );
  await empfangen(vi.fn());
  for (let i = 0; i < 20; i++) wecken();
  await vi.advanceTimersByTimeAsync(0);
  expect(nativ.invoke.mock.calls.filter(([c]) => c === 'hauptfenster_hinweise_lesen')).toHaveLength(
    1,
  );
  nativ.invoke.mockImplementation(async (command) =>
    command === 'hauptfenster_hinweise_lesen' ? [] : null,
  );
  fertig([]);
  await vi.advanceTimersByTimeAsync(0);
  expect(nativ.invoke.mock.calls.filter(([c]) => c === 'hauptfenster_hinweise_lesen')).toHaveLength(
    2,
  );
  await vi.advanceTimersByTimeAsync(120_000);
  expect(nativ.invoke.mock.calls.filter(([c]) => c === 'hauptfenster_hinweise_lesen')).toHaveLength(
    2,
  );
});

it('holt Hinweise nach verspäteter Listeneranmeldung initial und während Bereitschaft nicht vorzeitig ab', async () => {
  let listenerFertig!: () => void;
  let bereitFertig!: () => void;
  nativ.listen.mockImplementationOnce((_name, handler) => {
    wecken = () => handler({ payload: null });
    return new Promise((resolve) => {
      listenerFertig = () => resolve(listenerAbmelden);
    });
  });
  const kennung = crypto.randomUUID();
  nativ.invoke.mockImplementation(async (command) => {
    if (command === 'hauptfenster_hinweise_bereit')
      return new Promise<void>((resolve) => {
        bereitFertig = resolve;
      });
    return command === 'hauptfenster_hinweise_lesen' ? [{ kennung, hinweis }] : null;
  });
  const uebernehmen = vi.fn();
  const empfang = empfangeHauptfensterHinweise(uebernehmen);
  abmelden = empfang.abmelden;
  await vi.advanceTimersByTimeAsync(0);
  expect(nativ.invoke).not.toHaveBeenCalled();
  wecken();
  listenerFertig();
  await vi.advanceTimersByTimeAsync(0);
  wecken();
  expect(nativ.invoke.mock.calls.map(([c]) => c)).toEqual(['hauptfenster_hinweise_bereit']);
  bereitFertig();
  await empfang.bereit;
  await vi.advanceTimersByTimeAsync(0);
  expect(uebernehmen).toHaveBeenCalledExactlyOnceWith(hinweis);
  await vi.advanceTimersByTimeAsync(120_000);
  expect(nativ.invoke.mock.calls.filter(([c]) => c === 'hauptfenster_hinweise_lesen')).toHaveLength(
    1,
  );
});
it('entfernt einen verspäteten Listener bei frühem StrictMode-Cleanup vor neuer Bereitschaft', async () => {
  let listenerFertig!: () => void;
  const alterListenerAbmelden = vi.fn();
  nativ.listen.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        listenerFertig = () => resolve(alterListenerAbmelden);
      }),
  );
  const alt = empfangeHauptfensterHinweise(vi.fn());
  await vi.advanceTimersByTimeAsync(0);
  alt.abmelden();
  const neu = empfangeHauptfensterHinweise(vi.fn());
  abmelden = neu.abmelden;
  listenerFertig();
  await Promise.all([alt.bereit, neu.bereit]);
  await vi.advanceTimersByTimeAsync(0);
  expect(alterListenerAbmelden).toHaveBeenCalledOnce();
  expect(nativ.invoke.mock.calls.map(([c]) => c)).toEqual([
    'hauptfenster_hinweise_bereit',
    'hauptfenster_hinweise_lesen',
  ]);
  expect(alterListenerAbmelden.mock.invocationCallOrder[0]).toBeLessThan(
    nativ.invoke.mock.invocationCallOrder[0]!,
  );
});
it('meldet nach Listenerfehler keine Bereitschaft und entfernt den fehlgeschlagenen Empfang', async () => {
  nativ.listen.mockRejectedValueOnce(new Error('Listener'));
  const empfang = empfangeHauptfensterHinweise(vi.fn());
  abmelden = empfang.abmelden;
  await expect(empfang.bereit).rejects.toThrow('Listener');
  await vi.advanceTimersByTimeAsync(120_000);
  expect(nativ.invoke.mock.calls.map(([c]) => c)).toEqual(['hauptfenster_hinweise_abmelden']);
});
it('endet nach erfolgreicher wiederholter Bestätigung ohne Timer und verarbeitet spätere Hinweise', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const uebernehmen = vi.fn();
  let bestaetigungen = 0;
  const kennung = crypto.randomUUID();
  nativ.invoke.mockImplementation(async (command) => {
    if (command === 'hauptfenster_hinweise_lesen') return [{ kennung, hinweis }];
    if (command === 'hauptfenster_hinweis_bestaetigen' && ++bestaetigungen === 1)
      throw new Error('Bestätigung');
    return null;
  });
  await empfangen(uebernehmen);
  await vi.advanceTimersByTimeAsync(250);
  expect(uebernehmen).toHaveBeenCalledOnce();
  expect(bestaetigungen).toBe(2);
  expect(vi.getTimerCount()).toBe(0);
  const zweiter = crypto.randomUUID();
  nativ.invoke.mockImplementation(async (command) =>
    command === 'hauptfenster_hinweise_lesen' ? [{ kennung: zweiter, hinweis }] : null,
  );
  wecken();
  await vi.advanceTimersByTimeAsync(0);
  expect(uebernehmen).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
});

it('entfernt bei Abmeldung auch den Fristtimer eines unbeantworteten Abrufs', async () => {
  nativ.invoke.mockImplementation(async (command) =>
    command === 'hauptfenster_hinweise_lesen' ? new Promise(() => {}) : null,
  );
  const empfang = await empfangen(vi.fn());
  expect(vi.getTimerCount()).toBe(1);
  empfang.abmelden();
  await vi.advanceTimersByTimeAsync(0);
  expect(listenerAbmelden).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

it('beendet nach Abmeldung während der Übernahme auch die bereits abgebrochene Bestätigung', async () => {
  const kennung = crypto.randomUUID();
  nativ.invoke.mockImplementation(async (command) =>
    command === 'hauptfenster_hinweise_lesen' ? [{ kennung, hinweis }] : null,
  );
  const uebernehmen = vi.fn(() => {
    abmelden!();
    return undefined;
  });
  await empfangen(uebernehmen);
  await vi.advanceTimersByTimeAsync(0);
  expect(uebernehmen).toHaveBeenCalledOnce();
  expect(
    nativ.invoke.mock.calls.some(([command]) => command === 'hauptfenster_hinweis_bestaetigen'),
  ).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
});
