// Prüft echte Reichweitenunterschiede der Tauri-Attrappen und Listenerlebensdauer.
import vertraege from '@/test/plattform/native-vertraege.json';
import { beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import type { GlobaleEreignisse, FensterEreignisse } from './ereignisVertraege';
import type { Event, EventCallback } from '@tauri-apps/api/event';
import {
  hoereGlobal,
  hoereImEigenenFenster,
  sendeGlobal,
  sendeAnFenster,
} from './fensterkommunikation.index';

const ipc = vi.hoisted(() => ({ label: 'main', global: vi.fn(), eigen: vi.fn(), emitTo: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: ipc.global, emitTo: ipc.emitTo }));
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: () => ({ listen: ipc.eigen }) }));
type Empfang = { name: string; label?: string; callback: EventCallback<unknown> };
let empfaenge: Empfang[];
function anmelden(label: string | undefined, name: string, callback: EventCallback<unknown>) {
  const empfang = { name, label, callback };
  empfaenge.push(empfang);
  return Promise.resolve(
    vi.fn(() => {
      empfaenge = empfaenge.filter((e) => e !== empfang);
    }),
  );
}
function ausliefern(label: string | undefined, name: string, payload: unknown) {
  for (const e of empfaenge) {
    // Tauri-globales listen empfängt auch an fremde Ziele adressierte Ereignisse.
    if (e.name === name && (!e.label || !label || e.label === label))
      e.callback({ payload } as Event<unknown>);
  }
}
beforeEach(async () => {
  expect(getCurrentWebview().listen).toBe(ipc.eigen);
  empfaenge = [];
  ipc.label = 'main';
  ipc.global.mockReset().mockImplementation((name, cb) => anmelden(undefined, name, cb));
  ipc.eigen.mockReset().mockImplementation((name, cb) => anmelden(ipc.label, name, cb));
  ipc.emitTo
    .mockReset()
    .mockImplementation(async (ziel, name, payload) =>
      ausliefern(typeof ziel === 'string' ? ziel : undefined, name, payload),
    );
});
describe('explizite Ereignisreichweite', () => {
  it('begrenzt gezielte Menüaktionen und Zustandabfragen auf den eigenen Empfänger', async () => {
    const a = vi.fn();
    const b = vi.fn();
    const anfragenA = vi.fn();
    const anfragenB = vi.fn();
    const anmeldungenA = [
      hoereImEigenenFenster('markierung-rueckgaengig-anfrage', a),
      hoereImEigenenFenster('menu-zustand-anfordern', anfragenA),
    ];
    await Promise.all(anmeldungenA.map((e) => e.bereit));
    ipc.label = 'fenster-zwei';
    const anmeldungenB = [
      hoereImEigenenFenster('markierung-rueckgaengig-anfrage', b),
      hoereImEigenenFenster('menu-zustand-anfordern', anfragenB),
    ];
    await Promise.all(anmeldungenB.map((e) => e.bereit));
    await sendeAnFenster('main', 'markierung-rueckgaengig-anfrage', undefined);
    await sendeAnFenster('fenster-zwei', 'menu-zustand-anfordern', undefined);
    expect(a).toHaveBeenCalledOnce();
    expect(b).not.toHaveBeenCalled();
    expect(anfragenA).not.toHaveBeenCalled();
    expect(anfragenB).toHaveBeenCalledOnce();
    for (const e of [...anmeldungenA, ...anmeldungenB]) e.abmelden();
  });
  it('liefert gemeinsame Bestandsmeldungen an beide Fenster; Attrappe zeigt die globale Tauri-Falle', async () => {
    const a = vi.fn();
    const b = vi.fn();
    const erste = hoereGlobal('markierungen-geaendert', (event) => {
      expectTypeOf(event.payload.gesetz.kurztitel).toEqualTypeOf<string>();
      a(event.payload);
    });
    await erste.bereit;
    ipc.label = 'fenster-zwei';
    const zweite = hoereGlobal('markierungen-geaendert', b);
    await zweite.bereit;
    const payload = { gesetz: { kurztitel: 'BGB', normgeber: 'de-bund' as const } };
    await sendeGlobal('markierungen-geaendert', payload);
    expect(a).toHaveBeenCalledWith(payload);
    expect(b).toHaveBeenCalledOnce();
    // Gezielte Sendung erreicht weiterhin beide GLOBALEN Listener – echte Tauri-Semantik.
    await ipc.emitTo('main', 'markierungen-geaendert', payload);
    expect(a).toHaveBeenCalledTimes(2);
    expect(b).toHaveBeenCalledTimes(2);
    erste.abmelden();
    zweite.abmelden();
  });
});
describe('asynchrone Listenerlebensdauer', () => {
  it.each(['global', 'eigen'] as const)(
    'unterbindet Reaktionen nach Cleanup vor fertiger %s-Anmeldung und meldet genau einmal ab',
    async (art) => {
      let fertig!: (fn: () => void) => void;
      let callback!: EventCallback<unknown>;
      ipc[art].mockImplementation((_name, cb) => {
        callback = cb;
        return new Promise<() => void>((r) => {
          fertig = r;
        });
      });
      const handler = vi.fn();
      const anmeldung =
        art === 'global'
          ? hoereGlobal('favoriten-geaendert', handler)
          : hoereImEigenenFenster('menu-zustand-anfordern', handler);
      await vi.waitFor(() => expect(ipc[art]).toHaveBeenCalledOnce());
      anmeldung.abmelden();
      anmeldung.abmelden();
      callback({ payload: undefined } as Event<unknown>);
      expect(handler).not.toHaveBeenCalled();
      const unlisten = vi.fn();
      fertig(unlisten);
      await anmeldung.bereit;
      anmeldung.abmelden();
      expect(unlisten).toHaveBeenCalledOnce();
      callback({ payload: undefined } as Event<unknown>);
      expect(handler).not.toHaveBeenCalled();
    },
  );
  it('räumt fertige Anmeldungen mehrfach folgenlos auf und gibt Anmeldefehler weiter', async () => {
    const handler = vi.fn();
    const unlisten = vi.fn();
    ipc.eigen.mockResolvedValueOnce(unlisten).mockRejectedValueOnce(new Error('IPC'));
    const anmeldung = hoereImEigenenFenster('menu-zustand-anfordern', handler);
    await anmeldung.bereit;
    anmeldung.abmelden();
    anmeldung.abmelden();
    expect(unlisten).toHaveBeenCalledOnce();
    const fehler = hoereImEigenenFenster('menu-zustand-anfordern', handler);
    await expect(fehler.bereit).rejects.toThrow('IPC');
    fehler.abmelden();
  });
});

it('verhindert doppelte Reaktionen bei echtem React-StrictMode mit verspäteter Anmeldung', async () => {
  const { parseHTML } = await import('linkedom');
  const { act, createElement, StrictMode, useEffect } = await import('react');
  const { createRoot } = await import('react-dom/client');
  const { window: testFenster, document: testDokument } = parseHTML(
    '<html><body><div id="root"></div></body></html>',
  );
  vi.stubGlobal('window', testFenster);
  vi.stubGlobal('document', testDokument);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const handler = vi.fn();
  const ausstehend: Array<{ callback: EventCallback<unknown>; fertig: (fn: () => void) => void }> =
    [];
  ipc.eigen.mockImplementation(
    (_name, callback) =>
      new Promise<() => void>((fertig) => {
        ausstehend.push({ callback, fertig });
      }),
  );
  function Probe() {
    useEffect(() => {
      const anmeldung = hoereImEigenenFenster('markierung-rueckgaengig-anfrage', handler);
      void anmeldung.bereit.catch(console.error);
      return anmeldung.abmelden;
    }, []);
    return null;
  }
  const root = createRoot(testDokument.getElementById('root')!);
  try {
    await act(async () => {
      root.render(createElement(StrictMode, null, createElement(Probe)));
    });
    expect(ausstehend).toHaveLength(2);
    const unlisten = [vi.fn(), vi.fn()];
    await act(async () => {
      ausstehend.forEach((e, index) => e.fertig(unlisten[index]!));
    });
    expect(unlisten[0]).toHaveBeenCalledOnce();
    expect(unlisten[1]).not.toHaveBeenCalled();
    for (const e of ausstehend) e.callback({ payload: undefined } as Event<unknown>);
    expect(handler).toHaveBeenCalledOnce();
    await act(async () => {
      root.unmount();
    });
    expect(unlisten[1]).toHaveBeenCalledOnce();
    for (const e of ausstehend) e.callback({ payload: undefined } as Event<unknown>);
    expect(handler).toHaveBeenCalledOnce();
  } finally {
    vi.unstubAllGlobals();
  }
});

it('unterbindet weitere Reaktionen und führt Cleanup fort, wenn die native Abmeldung scheitert', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const handler = vi.fn();
  let callback!: EventCallback<unknown>;
  const fehler = new Error('Native Abmeldung');
  ipc.eigen.mockImplementation((_name, cb) => {
    callback = cb;
    return Promise.resolve(() => {
      throw fehler;
    });
  });
  const anmeldung = hoereImEigenenFenster('menu-zustand-anfordern', handler);
  await anmeldung.bereit;
  try {
    expect(anmeldung.abmelden).not.toThrow();
    callback({ payload: undefined } as Event<unknown>);
    expect(handler).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(
      'Fensterlistener konnte nicht nativ abgemeldet werden:',
      fehler,
    );
  } finally {
    log.mockRestore();
  }
});

it('verwendet native Ereignisnamen und Nutzlasten am tatsächlichen Empfang', async () => {
  expectTypeOf<{ normgeber: 'de-bund' }[]>().not.toMatchTypeOf<
    GlobaleEreignisse['gesetze-geloescht']
  >();
  expectTypeOf<{ kurztitel: string; normgeber: number }[]>().not.toMatchTypeOf<
    GlobaleEreignisse['gesetze-geloescht']
  >();
  expectTypeOf<string>().not.toMatchTypeOf<FensterEreignisse['tiefenlink-oeffnen']>();
  const undo = vi.fn();
  const zustand = vi.fn();
  const links = vi.fn();
  const geloescht = vi.fn();
  const anmeldungen = [
    hoereImEigenenFenster('markierung-rueckgaengig-anfrage', undo),
    hoereImEigenenFenster('menu-zustand-anfordern', zustand),
    hoereImEigenenFenster('tiefenlink-oeffnen', links),
    hoereGlobal('gesetze-geloescht', geloescht),
  ];
  await Promise.all(anmeldungen.map((a) => a.bereit));
  for (const [vertrag, handler] of [
    [vertraege.ereignisse.undo, undo],
    [vertraege.ereignisse.zustandsanfrage, zustand],
    [vertraege.ereignisse.tiefenlink, links],
    [vertraege.ereignisse.loeschung, geloescht],
  ] as const) {
    ausliefern('main', vertrag.name, vertrag.payload);
    expect(handler).toHaveBeenCalledWith({ payload: vertrag.payload });
  }
  await sendeGlobal('gesetze-geloescht', [{ kurztitel: 'BGB', normgeber: 'de-bund' }]);
  expect(ipc.emitTo).toHaveBeenCalledWith(
    { kind: 'Any' },
    vertraege.ereignisse.loeschung.name,
    vertraege.ereignisse.loeschung.payload,
  );
  for (const a of anmeldungen) a.abmelden();
});
