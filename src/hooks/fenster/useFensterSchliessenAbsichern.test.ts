// Sichert die Reihenfolge und Fehlerbehandlung aller Schließwege ab.

import { beforeEach, expect, it, vi } from 'vitest';

let handler: ((event: { preventDefault: () => void }) => Promise<void>) | undefined;
let registrierungFehler: Error | undefined;
let registrierungWartet = false;
let registrierungFreigeben: (() => void) | undefined;
let tauri = true;
const message = vi.fn();
const destroy = vi.fn();
const warten = vi.fn();
const entfernen = vi.fn();
let refs: Array<{ current: unknown }> = [];
let states: unknown[] = [];
let index = 0;
let effekte: Array<() => void | (() => void)> = [];
let aufraeumen: Array<() => void> = [];
let montierterEffekt: (() => void | (() => void)) | undefined;

vi.mock('react', async (importOriginal) => {
  const echt = await importOriginal<typeof import('react')>();
  return {
    ...echt,
    useRef: (wert: unknown) => {
      const i = index++;
      return (refs[i] ??= { current: wert });
    },
    useState: (wert: unknown) => {
      const i = index++;
      if (!(i in states)) states[i] = wert;
      return [
        states[i],
        (neu: unknown) => {
          states[i] = neu;
        },
      ];
    },
    useEffect: (effekt: () => void | (() => void)) => {
      if (!montierterEffekt) {
        montierterEffekt = effekt;
        effekte.push(effekt);
      }
      index = 0;
    },
  };
});
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => tauri }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onCloseRequested: async (fn: typeof handler) => {
      if (registrierungWartet) {
        await new Promise<void>((resolve) => {
          registrierungFreigeben = resolve;
        });
      }
      if (registrierungFehler) throw registrierungFehler;
      handler = fn;
      return entfernen;
    },
    destroy: (...args: unknown[]) => destroy(...args),
  }),
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ message: (...args: unknown[]) => message(...args) }));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', () => ({
  warteAufSpeicherBatchAbschluss: (...args: unknown[]) => warten(...args),
}));

import { useFensterSchliessenAbsichern } from './useFensterSchliessenAbsichern';

function useTestHook(geaendert = false, vorSchliessen?: () => Promise<boolean>) {
  const fehler = vi.fn();
  const speichern = vi.fn().mockResolvedValue(true);
  const ergebnis = useFensterSchliessenAbsichern(geaendert, fehler, speichern, vorSchliessen);
  for (const effekt of effekte.splice(0)) {
    const cleanup = effekt();
    if (cleanup) aufraeumen.push(cleanup);
  }
  return { ergebnis, fehler, speichern };
}

function anfrage() {
  const preventDefault = vi.fn();
  const lauf = handler!({ preventDefault });
  expect(preventDefault).toHaveBeenCalledOnce();
  return lauf;
}

beforeEach(() => {
  refs = [];
  states = [];
  index = 0;
  effekte = [];
  aufraeumen = [];
  montierterEffekt = undefined;
  handler = undefined;
  registrierungFehler = undefined;
  registrierungWartet = false;
  registrierungFreigeben = undefined;
  tauri = true;
  vi.clearAllMocks();
  warten.mockResolvedValue(undefined);
  destroy.mockResolvedValue(undefined);
});

it('wartet auch ohne Textänderung vor destroy und ignoriert parallele Anfragen', async () => {
  let freigeben!: () => void;
  warten.mockReturnValueOnce(
    new Promise<void>((resolve) => {
      freigeben = resolve;
    }),
  );
  useTestHook();
  await vi.waitFor(() => expect(handler).toBeDefined());
  expect(useTestHook().ergebnis.bereit).toBe(true);
  const erste = anfrage();
  await vi.waitFor(() => expect(warten).toHaveBeenCalledOnce());
  await anfrage();
  expect(warten).toHaveBeenCalledOnce();
  expect(destroy).not.toHaveBeenCalled();
  freigeben();
  await erste;
  expect(destroy).toHaveBeenCalledOnce();
});

it('fragt einmal nach und gibt nach Abbrechen einen neuen Versuch frei', async () => {
  let beantworten!: (wert: string) => void;
  message.mockReturnValueOnce(
    new Promise<string>((resolve) => {
      beantworten = resolve;
    }),
  );
  message.mockResolvedValueOnce('Verwerfen');
  useTestHook(true);
  await vi.waitFor(() => expect(handler).toBeDefined());
  const erste = anfrage();
  await vi.waitFor(() => expect(message).toHaveBeenCalledOnce());
  await anfrage();
  expect(message).toHaveBeenCalledOnce();
  beantworten('Abbrechen');
  await erste;
  expect(warten).not.toHaveBeenCalled();
  await anfrage();
  expect(message).toHaveBeenCalledTimes(2);
  expect(destroy).toHaveBeenCalledOnce();
});

it('speichert aus dem Dialog vor dem Warten und Schließen', async () => {
  message.mockResolvedValue('Speichern');
  let freigeben!: (wert: boolean) => void;
  const { speichern } = useTestHook(true);
  speichern.mockReturnValueOnce(
    new Promise<boolean>((resolve) => {
      freigeben = resolve;
    }),
  );
  await vi.waitFor(() => expect(handler).toBeDefined());
  const lauf = anfrage();
  await vi.waitFor(() => expect(speichern).toHaveBeenCalledOnce());
  expect(message).toHaveBeenCalledWith('Ungespeicherte Änderungen: Wie möchten Sie fortfahren?', {
    title: 'Änderungen speichern?',
    kind: 'warning',
    buttons: { yes: 'Speichern', no: 'Verwerfen', cancel: 'Abbrechen' },
  });
  expect(warten).not.toHaveBeenCalled();
  expect(destroy).not.toHaveBeenCalled();
  freigeben(true);
  await lauf;
  expect(warten).toHaveBeenCalledOnce();
  expect(destroy).toHaveBeenCalledOnce();
});

it('hält nach gescheitertem Speichern offen und erlaubt einen neuen Versuch', async () => {
  message.mockResolvedValue('Speichern');
  const { speichern } = useTestHook(true);
  speichern.mockResolvedValueOnce(false);
  await vi.waitFor(() => expect(handler).toBeDefined());
  await anfrage();
  expect(destroy).not.toHaveBeenCalled();
  expect(warten).not.toHaveBeenCalled();
  expect(useTestHook(true).ergebnis.schliessvorgangAktiv).toBe(false);
  await anfrage();
  expect(destroy).toHaveBeenCalledOnce();
});

it('lässt Escape ohne Speichern und Schließen zu', async () => {
  message.mockResolvedValue('Cancel');
  const { speichern } = useTestHook(true);
  await vi.waitFor(() => expect(handler).toBeDefined());
  await anfrage();
  expect(speichern).not.toHaveBeenCalled();
  expect(warten).not.toHaveBeenCalled();
  expect(destroy).not.toHaveBeenCalled();
});

it('zeigt einen unerwarteten Speicherfehler und erlaubt einen neuen Versuch', async () => {
  message.mockResolvedValue('Speichern');
  const { fehler, speichern } = useTestHook(true);
  speichern.mockRejectedValueOnce(new Error('Speichern'));
  await vi.waitFor(() => expect(handler).toBeDefined());
  await anfrage();
  expect(fehler).toHaveBeenCalledOnce();
  expect(destroy).not.toHaveBeenCalled();
  await anfrage();
  expect(destroy).toHaveBeenCalledOnce();
});

it.each(['Dialog', 'Warten', 'Zerstören'])(
  'zeigt Fehler bei %s und erlaubt erneutes Schließen',
  async (stelle) => {
    message.mockResolvedValue('Verwerfen');
    if (stelle === 'Dialog') message.mockRejectedValueOnce(new Error('Dialog'));
    if (stelle === 'Warten') warten.mockRejectedValueOnce(new Error('Warten'));
    if (stelle === 'Zerstören') destroy.mockRejectedValueOnce(new Error('Zerstören'));
    const { fehler } = useTestHook(true);
    await vi.waitFor(() => expect(handler).toBeDefined());
    await anfrage();
    expect(fehler).toHaveBeenCalledOnce();
    expect(useTestHook(true).ergebnis.schliessvorgangAktiv).toBe(false);
    await anfrage();
    expect(destroy).toHaveBeenCalledTimes(stelle === 'Zerstören' ? 2 : 1);
  },
);

it('setzt eine bewusste Anfrage nach close-Fehler zurück', async () => {
  message.mockResolvedValue('Verwerfen');
  const { ergebnis } = useTestHook(true);
  await vi.waitFor(() => expect(handler).toBeDefined());
  expect(await ergebnis.bewusstSchliessen(async () => false)).toBe(false);
  await anfrage();
  expect(message).toHaveBeenCalledOnce();
});

it('behandelt ein Ereignis vor der Rückgabe von close als bewusste Anfrage', async () => {
  const { ergebnis } = useTestHook(true);
  await vi.waitFor(() => expect(handler).toBeDefined());
  await ergebnis.bewusstSchliessen(async () => {
    await anfrage();
    return true;
  });
  expect(message).not.toHaveBeenCalled();
  expect(destroy).toHaveBeenCalledOnce();
});

it('hält die bewusste Anfrage nach erfolgreicher close-Rückgabe bis zum Ereignis aktiv', async () => {
  const { ergebnis } = useTestHook(true);
  await vi.waitFor(() => expect(handler).toBeDefined());
  expect(await ergebnis.bewusstSchliessen(async () => true)).toBe(true);
  expect(useTestHook(true).ergebnis.schliessvorgangAktiv).toBe(true);
  await anfrage();
  expect(message).not.toHaveBeenCalled();
  expect(destroy).toHaveBeenCalledOnce();
});

it('setzt die bewusste Anfrage auch nach einer Ausnahme vor dem Ereignis zurück', async () => {
  message.mockResolvedValue('Verwerfen');
  const { ergebnis } = useTestHook(true);
  await vi.waitFor(() => expect(handler).toBeDefined());
  await expect(
    ergebnis.bewusstSchliessen(async () => {
      throw new Error('close');
    }),
  ).rejects.toThrow('close');
  await anfrage();
  expect(message).toHaveBeenCalledOnce();
});

it('meldet eine Registrierung nach Cleanup sofort wieder ab', async () => {
  registrierungWartet = true;
  useTestHook();
  await vi.waitFor(() => expect(registrierungFreigeben).toBeDefined());
  for (const cleanup of aufraeumen) cleanup();
  registrierungFreigeben!();
  await vi.waitFor(() => expect(entfernen).toHaveBeenCalledOnce());
  expect(useTestHook().ergebnis.bereit).toBe(false);
});

it('hält das Formular bei Registrierungsfehler gesperrt und erlaubt Browser-Entwicklung', async () => {
  registrierungFehler = new Error('Registrierung');
  const { fehler } = useTestHook();
  await vi.waitFor(() => expect(fehler).toHaveBeenCalledOnce());
  expect(useTestHook().ergebnis.bereit).toBe(false);
  expect(useTestHook().ergebnis.registrierungsFehler).toBeTruthy();
  refs = [];
  states = [];
  tauri = false;
  expect(useTestHook().ergebnis.bereit).toBe(true);
});

it.each(['nativ', 'bewusst'])(
  'hält bei abgelehnter Vorprüfung %s ohne Dialog offen',
  async (weg) => {
    const vorSchliessen = vi.fn().mockResolvedValue(false);
    const { ergebnis } = useTestHook(true, vorSchliessen);
    const schliessen = vi.fn().mockResolvedValue(true);
    await vi.waitFor(() => expect(handler).toBeDefined());
    if (weg === 'nativ') await anfrage();
    else expect(await ergebnis.bewusstSchliessen(schliessen)).toBe(false);
    expect(vorSchliessen).toHaveBeenCalledOnce();
    expect(schliessen).not.toHaveBeenCalled();
    expect(message).not.toHaveBeenCalled();
    expect(warten).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
    expect(ergebnis.istSchliessvorgangAktiv()).toBe(false);
  },
);

it.each(['nativ', 'bewusst'])(
  'sperrt parallele Anfragen während der Vorprüfung %s',
  async (weg) => {
    let freigeben!: (wert: boolean) => void;
    const vorSchliessen = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          freigeben = resolve;
        }),
    );
    const { ergebnis } = useTestHook(false, vorSchliessen);
    await vi.waitFor(() => expect(handler).toBeDefined());
    const lauf =
      weg === 'nativ'
        ? anfrage()
        : ergebnis.bewusstSchliessen(async () => {
            await anfrage();
            return true;
          });
    await anfrage();
    expect(await ergebnis.bewusstSchliessen(async () => true)).toBe(false);
    expect(vorSchliessen).toHaveBeenCalledOnce();
    expect(destroy).not.toHaveBeenCalled();
    freigeben(true);
    await lauf;
    expect(vorSchliessen).toHaveBeenCalledOnce();
    expect(warten).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  },
);

it.each(['nativ', 'bewusst'])(
  'gibt nach fehlerhafter Vorprüfung %s den nächsten Versuch frei',
  async (weg) => {
    const vorSchliessen = vi
      .fn()
      .mockRejectedValueOnce(new Error('Vorprüfung'))
      .mockResolvedValue(true);
    const { ergebnis, fehler } = useTestHook(false, vorSchliessen);
    await vi.waitFor(() => expect(handler).toBeDefined());
    const schliessen = async () => {
      await anfrage();
      return true;
    };
    if (weg === 'nativ') await anfrage();
    else expect(await ergebnis.bewusstSchliessen(schliessen)).toBe(false);
    expect(fehler).toHaveBeenCalledOnce();
    expect(ergebnis.istSchliessvorgangAktiv()).toBe(false);
    expect(destroy).not.toHaveBeenCalled();
    if (weg === 'nativ') await anfrage();
    else expect(await ergebnis.bewusstSchliessen(schliessen)).toBe(true);
    expect(destroy).toHaveBeenCalledOnce();
  },
);

it('nutzt die aktuelle Vorprüfung ohne neue Registrierung', async () => {
  const zuerst = vi.fn().mockResolvedValue(true);
  useTestHook(false, zuerst);
  await vi.waitFor(() => expect(handler).toBeDefined());
  const urspruenglicherHandler = handler;
  const aktuell = vi.fn().mockResolvedValue(false);
  useTestHook(false, aktuell);
  await anfrage();
  expect(handler).toBe(urspruenglicherHandler);
  expect(zuerst).not.toHaveBeenCalled();
  expect(aktuell).toHaveBeenCalledOnce();
  expect(destroy).not.toHaveBeenCalled();
});

it('fragt nach Änderungen, die während der Vorprüfung entstehen', async () => {
  let freigeben!: (wert: boolean) => void;
  const vorSchliessen = () =>
    new Promise<boolean>((resolve) => {
      freigeben = resolve;
    });
  useTestHook(false, vorSchliessen);
  await vi.waitFor(() => expect(handler).toBeDefined());
  const lauf = anfrage();
  useTestHook(true, vorSchliessen);
  message.mockResolvedValue('Abbrechen');
  freigeben(true);
  await lauf;
  expect(message).toHaveBeenCalledOnce();
  expect(destroy).not.toHaveBeenCalled();
});

it('prüft bei bewusst ausgelöstem Ereignis einmal vor dem Schließen ohne zweite Speicherfrage', async () => {
  const vorSchliessen = vi.fn().mockResolvedValue(true);
  const { ergebnis } = useTestHook(true, vorSchliessen);
  await vi.waitFor(() => expect(handler).toBeDefined());
  await ergebnis.bewusstSchliessen(async () => {
    await anfrage();
    return true;
  });
  expect(vorSchliessen).toHaveBeenCalledOnce();
  expect(message).not.toHaveBeenCalled();
  expect(warten).toHaveBeenCalledOnce();
  expect(destroy).toHaveBeenCalledOnce();
});

it('räumt eine späte erste Registrierung auch bei StrictMode-Wiederholung auf', async () => {
  registrierungWartet = true;
  useTestHook();
  await vi.waitFor(() => expect(registrierungFreigeben).toBeDefined());
  for (const cleanup of aufraeumen) cleanup();
  registrierungWartet = false;
  const zweitesCleanup = montierterEffekt!();
  await vi.waitFor(() => expect(handler).toBeDefined());
  registrierungFreigeben!();
  await vi.waitFor(() => expect(entfernen).toHaveBeenCalledOnce());
  expect(useTestHook().ergebnis.bereit).toBe(true);
  await anfrage();
  expect(destroy).toHaveBeenCalledOnce();
  zweitesCleanup!();
  expect(entfernen).toHaveBeenCalledTimes(2);
});
