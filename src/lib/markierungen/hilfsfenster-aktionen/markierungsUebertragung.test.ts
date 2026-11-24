import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
// Prüft den begrenzten Transport unabhängig von Speicherung und UI.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarkierungsAktion } from '@/lib/markierungen/eintrag/eintrag.index';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

const ipc = vi.hoisted(() => ({ label: 'hilfe', listen: vi.fn(), emitTo: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: ipc.emitTo }));
vi.mock('@tauri-apps/api/webview', () => ({ getCurrentWebview: () => ({ listen: ipc.listen }) }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ label: ipc.label }) }));
type Nachricht = { payload: Record<string, unknown> };
type Empfang = (event: Nachricht) => void;
let empfaenger: Map<string, Empfang[]>;
let abmelden: ReturnType<typeof vi.fn>[];
let modul: typeof import('./markierungsUebertragung');
const aktion: MarkierungsAktion = {
  art: 'kommentarBearbeiten',
  gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
  ziel: { ausgangsstelle: normAusgangsstelle('§ 1') },
  vorher: { elementstand: testElementstand(), kommentarText: 'alt' },
  nachher: { elementstand: testElementstand(), kommentarText: 'neu' },
};
function sende(label: string, event: string, payload: Record<string, unknown>) {
  for (const callback of empfaenger.get(`${label}:${event}`) ?? []) callback({ payload });
}
async function tick(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms);
}
async function hauptfenster(callback = vi.fn()) {
  ipc.label = 'main';
  const unlisten = await modul.registriereMarkierungsHistorienEmpfang(callback);
  ipc.label = 'hilfe';
  return { callback, unlisten };
}
beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  empfaenger = new Map();
  abmelden = [];
  ipc.label = 'hilfe';
  ipc.listen.mockReset().mockImplementation(async (event: string, callback: Empfang) => {
    const key = `${ipc.label}:${event}`;
    empfaenger.set(key, [...(empfaenger.get(key) ?? []), callback]);
    const unlisten = vi.fn(() =>
      empfaenger.set(
        key,
        (empfaenger.get(key) ?? []).filter((c) => c !== callback),
      ),
    );
    abmelden.push(unlisten);
    return unlisten;
  });
  ipc.emitTo
    .mockReset()
    .mockImplementation(async (label: string, event: string, payload: Record<string, unknown>) =>
      sende(label, event, payload),
    );
  modul = await import('./markierungsUebertragung');
});
afterEach(() => {
  vi.useRealTimers();
});
describe('bestätigte Markierungsübertragung', () => {
  it('bricht den ersten Abschluss vor Fristende ab und räumt spät angemeldete Listener auf', async () => {
    let resolve!: (unlisten: () => void) => void;
    ipc.listen.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const ref = modul.erzeugeMarkierungsUebertragung(aktion, 'main');
    const controller = new AbortController();
    const abmeldenAbbruch = vi.spyOn(controller.signal, 'removeEventListener');
    const finish = modul.schliesseMarkierungsSpeicherungAb(ref, controller.signal);
    await tick(50);
    controller.abort();
    await tick();
    expect(await finish).toEqual({ art: 'uebertragungOffen', uebertragung: ref });
    expect(() => modul.wiederholeMarkierungsUebertragung(ref)).toThrow();
    const unlisten = vi.fn();
    resolve(unlisten);
    await tick();
    expect(unlisten).toHaveBeenCalledOnce();
    expect(ipc.emitTo).not.toHaveBeenCalled();
    expect(abmeldenAbbruch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('beginnt bei bereits abgebrochenem Aufrufer keine Übertragungsrunde', async () => {
    const ref = modul.erzeugeMarkierungsUebertragung(aktion, 'main');
    const controller = new AbortController();
    controller.abort();
    expect(await modul.schliesseMarkierungsSpeicherungAb(ref, controller.signal)).toEqual({
      art: 'uebertragungOffen',
      uebertragung: ref,
    });
    expect(ipc.listen).not.toHaveBeenCalled();
    expect(ipc.emitTo).not.toHaveBeenCalled();
    expect(() => modul.wiederholeMarkierungsUebertragung(ref)).toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('beendet bei hängendem Versand sofort das Warten und ignoriert späte Bestätigung', async () => {
    ipc.emitTo.mockImplementation(() => new Promise(() => {}));
    const ref = modul.erzeugeMarkierungsUebertragung(aktion, 'main');
    const controller = new AbortController();
    const finish = modul.schliesseMarkierungsSpeicherungAb(ref, controller.signal);
    await tick(50);
    expect(ipc.emitTo).toHaveBeenCalledOnce();
    controller.abort();
    await tick();
    expect(await finish).toEqual({ art: 'uebertragungOffen', uebertragung: ref });
    sende('hilfe', 'markierung-historie-bestaetigt', {
      kennung: ref.kennung,
      empfaengerLabel: 'main',
    });
    await tick(5000);
    expect(ipc.emitTo).toHaveBeenCalledOnce();
    expect(abmelden[0]).toHaveBeenCalledOnce();
    expect(() => modul.wiederholeMarkierungsUebertragung(ref)).toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('entfernt den Abbruchlistener nach Bestätigung und erhält den bekannten Auftrag', async () => {
    await hauptfenster();
    const ref = modul.erzeugeMarkierungsUebertragung(aktion, 'main');
    const controller = new AbortController();
    const abmeldenAbbruch = vi.spyOn(controller.signal, 'removeEventListener');
    expect(await modul.schliesseMarkierungsSpeicherungAb(ref, controller.signal)).toEqual({
      art: 'erfolg',
    });
    expect(abmeldenAbbruch).toHaveBeenCalledOnce();
    controller.abort();
    expect(await modul.wiederholeMarkierungsUebertragung(ref)).toBe('bestaetigt');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('bestätigt erst nach synchroner Aufnahme und räumt auf', async () => {
    const { callback, unlisten } = await hauptfenster();
    const ref = modul.erzeugeMarkierungsUebertragung(aktion, 'main');
    expect(await modul.schliesseMarkierungsSpeicherungAb(ref)).toEqual({ art: 'erfolg' });
    expect(callback).toHaveBeenCalledExactlyOnceWith(aktion);
    expect(await modul.wiederholeMarkierungsUebertragung(ref)).toBe('bestaetigt');
    expect(ipc.emitTo).toHaveBeenCalledTimes(2);
    unlisten();
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['Nachricht', 'Bestätigung'])(
    'wiederholt bei verlorener %s dieselbe Kennung und Aktion',
    async (art) => {
      const { callback } = await hauptfenster();
      let verloren = false;
      ipc.emitTo.mockImplementation(async (label, event, payload) => {
        if (
          !verloren &&
          ((art === 'Nachricht' && label === 'main') ||
            (art === 'Bestätigung' && label === 'hilfe'))
        ) {
          verloren = true;
          return;
        }
        sende(label, event, payload);
      });
      const ref = modul.erzeugeMarkierungsUebertragung(aktion, 'main');
      const promise = modul.wiederholeMarkierungsUebertragung(ref);
      await tick(1200);
      expect(await promise).toBe('bestaetigt');
      const nachrichten = ipc.emitTo.mock.calls.filter((call) => call[0] === 'main');
      expect(nachrichten).toHaveLength(2);
      expect(nachrichten[0]?.[2]).toEqual(nachrichten[1]?.[2]);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it('behält angenommene Kennungen nach Undo und erneuter Registrierung', async () => {
    const stack: MarkierungsAktion[] = [];
    const callback = vi.fn((a) => stack.push(a));
    const { unlisten } = await hauptfenster(callback);
    const ref = modul.erzeugeMarkierungsUebertragung(aktion, 'main');
    await modul.wiederholeMarkierungsUebertragung(ref);
    const payload = ipc.emitTo.mock.calls.find((call) => call[0] === 'main')![2];
    stack.pop();
    unlisten();
    await hauptfenster(callback);
    sende('main', 'markierung-historie-uebertragen', payload);
    expect(stack).toEqual([]);
    expect(callback).toHaveBeenCalledTimes(1);
  });
  it('teilt parallele Runden und meldet einen geschlossenen Empfänger offen', async () => {
    const ref = modul.erzeugeMarkierungsUebertragung(aktion, 'main');
    const first = modul.wiederholeMarkierungsUebertragung(ref);
    expect(modul.wiederholeMarkierungsUebertragung(ref)).toBe(first);
    await tick(5000);
    expect(await first).toBe('offen');
    expect(ipc.emitTo).toHaveBeenCalledTimes(3);
    expect(vi.getTimerCount()).toBe(0);
    const finish = modul.schliesseMarkierungsSpeicherungAb(ref);
    await tick(5000);
    expect(await finish).toEqual({ art: 'uebertragungOffen', uebertragung: ref });
  });
  it.each(['Anmeldung', 'Versand'])(
    'begrenzt hängenden %s und ignoriert späte Antworten',
    async (art) => {
      if (art === 'Anmeldung') ipc.listen.mockImplementation(() => new Promise(() => {}));
      else ipc.emitTo.mockImplementation(() => new Promise(() => {}));
      const ref = modul.erzeugeMarkierungsUebertragung(aktion, 'main');
      const promise = modul.wiederholeMarkierungsUebertragung(ref);
      await tick(5000);
      expect(await promise).toBe('offen');
      expect(vi.getTimerCount()).toBe(0);
      sende('hilfe', 'markierung-historie-bestaetigt', {
        kennung: ref.kennung,
        empfaengerLabel: 'main',
      });
      const next = modul.wiederholeMarkierungsUebertragung(ref);
      await tick(5000);
      expect(await next).toBe('offen');
    },
  );
  it('akzeptiert Bestätigung auch bei hängendem Versand', async () => {
    await hauptfenster();
    const original = ipc.emitTo.getMockImplementation()!;
    ipc.emitTo.mockImplementation((label, event, payload) => {
      void original(label, event, payload);
      return label === 'main' ? new Promise(() => {}) : Promise.resolve();
    });
    const ref = modul.erzeugeMarkierungsUebertragung(aktion, 'main');
    expect(await modul.wiederholeMarkierungsUebertragung(ref)).toBe('bestaetigt');
  });
  it('ignoriert falsche Kennung und Empfänger', async () => {
    const ref = modul.erzeugeMarkierungsUebertragung(aktion, 'main');
    const p = modul.wiederholeMarkierungsUebertragung(ref);
    await tick();
    sende('hilfe', 'markierung-historie-bestaetigt', {
      kennung: 'falsch',
      empfaengerLabel: 'main',
    });
    sende('hilfe', 'markierung-historie-bestaetigt', {
      kennung: ref.kennung,
      empfaengerLabel: 'anderes',
    });
    await tick(5000);
    expect(await p).toBe('offen');
  });
  it('verwirft laufende Aufträge und meldet spät registrierte Listener ab', async () => {
    let resolve!: (unlisten: () => void) => void;
    ipc.listen.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const ref = modul.erzeugeMarkierungsUebertragung(aktion, 'main');
    const p = modul.wiederholeMarkierungsUebertragung(ref);
    await tick();
    modul.verwerfeMarkierungsUebertragung(ref);
    modul.verwerfeMarkierungsUebertragung(ref);
    expect(await p).toBe('offen');
    const unlisten = vi.fn();
    resolve(unlisten);
    await tick();
    expect(unlisten).toHaveBeenCalledOnce();
    expect(ipc.emitTo).not.toHaveBeenCalled();
    expect(() => modul.wiederholeMarkierungsUebertragung(ref)).toThrow();
    expect(() => modul.wiederholeMarkierungsUebertragung({ kennung: 'unbekannt' })).toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('merkt eine vor Übernahme werfende Aktion nicht als angenommen', async () => {
    const callback = vi.fn().mockImplementationOnce(() => {
      throw new Error('vor Mutation');
    });
    await hauptfenster(callback);
    const ref = modul.erzeugeMarkierungsUebertragung(aktion, 'main');
    const p = modul.wiederholeMarkierungsUebertragung(ref);
    await tick(1200);
    expect(await p).toBe('bestaetigt');
    expect(callback).toHaveBeenCalledTimes(2);
  });
  it('speichert einen unveränderten Snapshot und toleriert Transportfehler', async () => {
    const original = structuredClone(aktion);
    const ref = modul.erzeugeMarkierungsUebertragung(original, 'main');
    if (original.art === 'kommentarBearbeiten') original.nachher.kommentarText = 'später';
    ipc.emitTo.mockRejectedValue(new Error('IPC'));
    const p = modul.wiederholeMarkierungsUebertragung(ref);
    await tick(5000);
    expect(await p).toBe('offen');
    expect(ipc.emitTo.mock.calls[0]?.[2].aktion).toEqual(aktion);
  });
  it('meldet eine erst nach Fristende registrierte Bestätigung sofort ab', async () => {
    let resolve!: (unlisten: () => void) => void;
    ipc.listen.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const ref = modul.erzeugeMarkierungsUebertragung(aktion, 'main');
    const p = modul.wiederholeMarkierungsUebertragung(ref);
    await tick(5000);
    expect(await p).toBe('offen');
    const unlisten = vi.fn();
    resolve(unlisten);
    await tick();
    expect(unlisten).toHaveBeenCalledOnce();
    expect(ipc.emitTo).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('verhindert doppelte Übernahme durch gleichzeitig angemeldete Empfänger', async () => {
    const first = await hauptfenster();
    const second = await hauptfenster();
    const ref = modul.erzeugeMarkierungsUebertragung(aktion, 'main');
    expect(await modul.wiederholeMarkierungsUebertragung(ref)).toBe('bestaetigt');
    expect(first.callback).toHaveBeenCalledOnce();
    expect(second.callback).not.toHaveBeenCalled();
    first.unlisten();
    second.unlisten();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('nimmt vor abgeschlossener Registrierung und für andere Empfänger nichts an', async () => {
    let callback!: Empfang;
    let resolve!: (unlisten: () => void) => void;
    ipc.listen.mockImplementation((_event, empfang) => {
      callback = empfang;
      return new Promise((r) => {
        resolve = r;
      });
    });
    ipc.label = 'main';
    const uebernehme = vi.fn();
    const anmeldung = modul.registriereMarkierungsHistorienEmpfang(uebernehme);
    await tick();
    const payload = { kennung: 'test', senderLabel: 'hilfe', empfaengerLabel: 'main', aktion };
    callback({ payload });
    expect(uebernehme).not.toHaveBeenCalled();
    const unlisten = vi.fn();
    resolve(unlisten);
    const abmelden = await anmeldung;
    callback({ payload: { ...payload, empfaengerLabel: 'anderes' } });
    expect(uebernehme).not.toHaveBeenCalled();
    abmelden();
    callback({ payload });
    expect(uebernehme).not.toHaveBeenCalled();
    expect(unlisten).toHaveBeenCalledOnce();
    expect(ipc.emitTo).not.toHaveBeenCalled();
  });
  it('behandelt fehlgeschlagene Listeneranmeldung als offen', async () => {
    ipc.listen.mockRejectedValue(new Error('Listener'));
    const ref = modul.erzeugeMarkierungsUebertragung(aktion, 'main');
    expect(await modul.schliesseMarkierungsSpeicherungAb(ref)).toEqual({
      art: 'uebertragungOffen',
      uebertragung: ref,
    });
    expect(vi.getTimerCount()).toBe(0);
  });
  it('wiederholt nach offenem Ergebnis und Undo ohne erneuten Historieneintrag', async () => {
    const stack: MarkierungsAktion[] = [];
    const callback = vi.fn((a: MarkierungsAktion) => stack.push(a));
    const { unlisten } = await hauptfenster(callback);
    const transport = ipc.emitTo.getMockImplementation()!;
    ipc.emitTo.mockImplementation(async (label, event, payload) => {
      if (label !== 'hilfe') await transport(label, event, payload);
    });
    const ref = modul.erzeugeMarkierungsUebertragung(aktion, 'main');
    const first = modul.wiederholeMarkierungsUebertragung(ref);
    await tick(5000);
    expect(await first).toBe('offen');
    stack.pop();
    unlisten();
    await hauptfenster(callback);
    ipc.emitTo.mockImplementation(transport);
    expect(await modul.wiederholeMarkierungsUebertragung(ref)).toBe('bestaetigt');
    expect(stack).toEqual([]);
    expect(callback).toHaveBeenCalledOnce();
    const payloads = ipc.emitTo.mock.calls
      .filter((call) => call[0] === 'main')
      .map((call) => call[2]);
    expect(payloads).toHaveLength(4);
    for (const payload of payloads) expect(payload).toEqual(payloads[0]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
