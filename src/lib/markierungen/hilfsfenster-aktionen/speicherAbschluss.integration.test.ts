// Prüft echte Speicherabschlüsse und Wiederholungen mit dem bestätigten IPC-Protokoll.
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MarkierungsAktion } from '@/lib/markierungen/eintrag/eintrag.index';
import * as modul from './markierungsUebertragung';
import * as speichern from './kommentarAktionen';
import { speichereVerweismarkierung, speichereKommentar } from './hilfsfenster-aktionen.index';
import { gesetz, norm } from '@/test/markierungen/verweismarkierungAktionenTestAufbau';

import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';
import { markierungsEinzelzugriffFuerTest } from '@/test/markierungen/markierungsEinzelzugriffFuerTest';

const ipc = vi.hoisted(() => ({
  label: 'hilfe',
  listen: vi.fn(),
  emitTo: vi.fn(),
  schreiben: vi.fn(),
  ladeGesetze: vi.fn(),
  kandidaten: vi.fn(),
  importieren: vi.fn(),
}));

vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({
    listen: async (name: string, handler: Empfang) => {
      const { listen } = await import('@tauri-apps/api/event');
      return listen(name, handler, { target: { kind: 'Webview', label: ipc.label } });
    },
  }),
}));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => ({ label: ipc.label }) }));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', () => ({ ladeAlleGesetze: ipc.ladeGesetze }));
vi.mock('@/lib/import/import.index', () => ({
  ladeGesetzeskandidaten: ipc.kandidaten,
  importiereGesetzesreferenz: ipc.importieren,
  baueAktualisierungsNachricht: vi.fn(),
}));
vi.mock('@/lib/markierungen/eintrag/eintrag.index', () => ({
  hinzufuegenMarkierung: ipc.schreiben,
}));
type Empfang = (event: { payload: Record<string, unknown> }) => void;
let empfaenger: Map<string, Empfang[]>;
let abmelden: ReturnType<typeof vi.fn>[];
const kontext = {
  openerLabel: 'main',
  gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
  ausgangsstelle: normAusgangsstelle('§ 1'),
};
const aktion: MarkierungsAktion = {
  art: 'ersetzen',
  gesetz: kontext.gesetz,
  neu: markierungsEintrag({
    bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
    typ: 'kommentar',
    ausgangsstelle: normAusgangsstelle('§ 1'),
    kommentarText: 'neu',
  }),
  rest: [
    markierungsEintrag({
      typ: 'unterstreichung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 4, zeichenbereichEnde: 7 },
        bezugstext: '',
      },
    }),
  ],
  entfernt: [
    markierungsEintrag({
      typ: 'unterstreichung',
      ausgangsstelle: normAusgangsstelle('§ 1'),
      bezug: {
        typ: 'bezugstext' as const,
        textstelle: { pfad: normtextPfad({}), zeichenbereichStart: 0, zeichenbereichEnde: 7 },
        bezugstext: '',
      },
    }),
  ],
};
type Ziel = string | { kind: 'Any' } | { kind: 'AnyLabel' | 'Webview'; label: string };
function senden(ziel: Ziel, event: string, payload: Record<string, unknown>) {
  const target: Exclude<Ziel, string> =
    typeof ziel === 'string' ? { kind: 'AnyLabel', label: ziel } : ziel;
  for (const [adresse, callbacks] of empfaenger) {
    if (
      adresse === `*:${event}` ||
      (target.kind === 'Any'
        ? adresse.endsWith(`:${event}`)
        : adresse === `${target.label}:${event}`)
    ) {
      for (const callback of callbacks) callback({ payload });
    }
  }
}

async function tick(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms);
}
async function registrieren() {
  ipc.label = 'main';
  const uebernahme = vi.fn();
  await modul.registriereMarkierungsHistorienEmpfang(uebernahme);
  ipc.label = 'hilfe';
  return uebernahme;
}
beforeEach(async () => {
  vi.useFakeTimers();
  empfaenger = new Map();
  abmelden = [];
  ipc.label = 'hilfe';
  let naechsteId = 0;
  const nativeAbmeldungen = new Map<number, () => void>();
  vi.stubGlobal('window', {
    __TAURI_INTERNALS__: {
      transformCallback: (callback: Empfang) => callback,
      invoke: async (
        befehl: string,
        args: {
          event: string;
          handler: Empfang;
          eventId: number;
          target: Exclude<Ziel, string>;
          payload: Record<string, unknown>;
        },
      ) => {
        if (befehl === 'plugin:event|listen') {
          const id = ++naechsteId;
          nativeAbmeldungen.set(
            id,
            await ipc.listen(
              args.event,
              args.handler,
              args.target.kind === 'Any' ? '*' : args.target.label,
            ),
          );
          return id;
        }
        if (befehl === 'plugin:event|unlisten') {
          nativeAbmeldungen.get(args.eventId)?.();
          return;
        }
        if (befehl === 'plugin:event|emit_to')
          return ipc.emitTo(args.target, args.event, args.payload);
        throw new Error(befehl);
      },
    },
    __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
  });

  ipc.ladeGesetze.mockReset().mockResolvedValue([gesetz('BGB', [norm('1')])]);
  ipc.kandidaten.mockReset().mockResolvedValue([gesetzesreferenz({ kurztitel: 'BGB' })]);
  ipc.importieren.mockReset();
  ipc.schreiben.mockReset().mockResolvedValue({ erfolgreich: true, aktion });
  ipc.listen
    .mockReset()
    .mockImplementation(async (event: string, callback: Empfang, label: string = ipc.label) => {
      const key = `${label}:${event}`;
      empfaenger.set(key, [...(empfaenger.get(key) ?? []), callback]);
      const fn = vi.fn(() =>
        empfaenger.set(
          key,
          (empfaenger.get(key) ?? []).filter((c) => c !== callback),
        ),
      );
      abmelden.push(fn);
      return fn;
    });
  ipc.emitTo
    .mockReset()
    .mockImplementation(async (label, event, payload) => senden(label, event, payload));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('tatsächlicher Speicherabschluss', () => {
  it('erreicht zwei unterschiedlich benannte Hauptfenster mit dem Anzeige-Broadcast', async () => {
    const { listen } = await import('@tauri-apps/api/event');
    const gesetzA = vi.fn();
    const gesetzB = vi.fn();
    ipc.label = 'gesetz-a';
    const abmeldenA = await listen('markierungen-geaendert', gesetzA);
    ipc.label = 'gesetz-b';
    const abmeldenB = await listen('markierungen-geaendert', gesetzB);
    const uebernahme = await registrieren();
    const ergebnis = speichern.speichereKommentar(
      kontext,
      markierungsEinzelzugriffFuerTest,
      'Kommentar',
      false,
    );
    await tick();
    expect(await ergebnis).toEqual({ art: 'erfolg' });
    expect(gesetzA).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ payload: { gesetz: kontext.gesetz } }),
    );
    expect(gesetzB).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ payload: { gesetz: kontext.gesetz } }),
    );
    expect(uebernahme).toHaveBeenCalledExactlyOnceWith(aktion);
    await abmeldenA();
    await abmeldenB();
  });
  it('meldet erst nach Historienbestätigung Erfolg und sendet die tatsächlich gespeicherte Aktion', async () => {
    const uebernahme = await registrieren();
    const ergebnis = speichern.speichereKommentar(
      kontext,
      markierungsEinzelzugriffFuerTest,
      'Eingabe',
      false,
    );
    await tick();
    expect(await ergebnis).toEqual({ art: 'erfolg' });
    expect(uebernahme).toHaveBeenCalledExactlyOnceWith(aktion);
    expect(ipc.emitTo).toHaveBeenCalledWith({ kind: 'Any' }, 'markierungen-geaendert', {
      gesetz: kontext.gesetz,
    });
    expect(ipc.emitTo.mock.calls.some(([, event]) => event === 'markierung-aktion')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('wiederholt nach verlorenen Bestätigungen ohne erneutes Schreiben und ohne Doppelübernahme', async () => {
    const uebernahme = await registrieren();
    ipc.emitTo.mockImplementation(async (label, event, payload) => {
      if (event !== 'markierung-historie-bestaetigt') senden(label, event, payload);
    });
    const runde = speichern.speichereKommentar(
      kontext,
      markierungsEinzelzugriffFuerTest,
      'Eingabe',
      false,
    );
    await vi.dynamicImportSettled();
    await tick(3200);
    const ergebnis = await runde;
    expect(ergebnis.art).toBe('uebertragungOffen');
    if (ergebnis.art !== 'uebertragungOffen') throw new Error('Offener Auftrag erwartet');
    ipc.emitTo.mockImplementation(async (label, event, payload) => senden(label, event, payload));
    const wiederholung = modul.wiederholeMarkierungsUebertragung(ergebnis.uebertragung);
    await tick();
    expect(await wiederholung).toBe('bestaetigt');
    expect(uebernahme).toHaveBeenCalledExactlyOnceWith(aktion);
    expect(ipc.schreiben).toHaveBeenCalledOnce();
    expect(
      ipc.emitTo.mock.calls.filter(([, event]) => event === 'markierungen-geaendert'),
    ).toHaveLength(2);
    modul.verwerfeMarkierungsUebertragung(ergebnis.uebertragung);
  });
  it.each(['fehler', 'haengt'])(
    'Historienbestätigung bleibt unabhängig vom Anzeige-Broadcast (%s)',
    async (art) => {
      const uebernahme = await registrieren();
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      ipc.emitTo.mockImplementation(async (label, event, payload) => {
        if (event === 'markierungen-geaendert') {
          if (art === 'fehler') throw new Error('Broadcast');
          return new Promise(() => {});
        }
        senden(label, event, payload);
      });
      const ergebnis = speichern.speichereKommentar(
        kontext,
        markierungsEinzelzugriffFuerTest,
        'Eingabe',
        false,
      );
      await tick();
      expect(await ergebnis).toEqual({ art: 'erfolg' });
      expect(uebernahme).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
      if (art === 'fehler') expect(log).toHaveBeenCalled();
      log.mockRestore();
    },
  );
  it('beginnt keinen Auftrag nach einem Speicherfehler', async () => {
    ipc.schreiben.mockRejectedValue(new Error('Schreiben'));
    await expect(
      speichern.speichereKommentar(kontext, markierungsEinzelzugriffFuerTest, 'Eingabe', false),
    ).rejects.toThrow('Schreiben');
    expect(ipc.listen).not.toHaveBeenCalled();
    expect(ipc.emitTo).not.toHaveBeenCalled();
  });
});

describe('öffentliche Speicherwege und erstes Abbruchsignal', () => {
  it.each(['Kommentar', 'Verweis'] as const)(
    '%s bleibt gespeichert, Abbruch beendet nur den Transport',
    async (art) => {
      const controller = new AbortController();
      const runde =
        art === 'Kommentar'
          ? speichereKommentar(
              kontext,
              markierungsEinzelzugriffFuerTest,
              'Kommentar',
              false,
              controller.signal,
            )
          : speichereVerweismarkierung(
              kontext,
              markierungsEinzelzugriffFuerTest,
              '§ 1 BGB',
              false,
              true,
              new Map(),
              undefined,
              controller.signal,
            );
      await vi.dynamicImportSettled();
      await tick(50);
      expect(ipc.schreiben).toHaveBeenCalledOnce();
      expect(ipc.schreiben.mock.calls[0]![1].typ).toBe(
        art === 'Kommentar' ? 'kommentar' : 'verweismarkierung',
      );
      expect(ipc.listen).toHaveBeenCalledOnce();
      controller.abort();
      await tick();
      const ergebnis = await runde;
      expect(ergebnis.art).toBe('uebertragungOffen');
      if (ergebnis.art !== 'uebertragungOffen') throw new Error('Auftrag erwartet');
      expect(() => modul.wiederholeMarkierungsUebertragung(ergebnis.uebertragung)).toThrow();
      expect(abmelden[0]).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
      expect(ipc.schreiben).toHaveBeenCalledOnce();
    },
  );
  it.each(['Kommentar', 'Verweis'] as const)(
    '%s räumt den Auftrag bei später Schreibbestätigung nach Abbruch ohne Transport auf',
    async (art) => {
      let bestaetige!: (wert: unknown) => void;
      ipc.schreiben.mockImplementation(
        () =>
          new Promise((resolve) => {
            bestaetige = resolve;
          }),
      );
      const controller = new AbortController();
      const runde =
        art === 'Kommentar'
          ? speichereKommentar(
              kontext,
              markierungsEinzelzugriffFuerTest,
              'Kommentar',
              false,
              controller.signal,
            )
          : speichereVerweismarkierung(
              kontext,
              markierungsEinzelzugriffFuerTest,
              '§ 1',
              false,
              true,
              new Map(),
              undefined,
              controller.signal,
            );
      await vi.dynamicImportSettled();
      await tick();
      expect(ipc.schreiben).toHaveBeenCalledOnce();
      controller.abort();
      bestaetige({ erfolgreich: true, aktion });
      await tick();
      const ergebnis = await runde;
      expect(ergebnis.art).toBe('uebertragungOffen');
      if (ergebnis.art !== 'uebertragungOffen') throw new Error('Auftrag erwartet');
      expect(() => modul.wiederholeMarkierungsUebertragung(ergebnis.uebertragung)).toThrow();
      expect(ipc.listen).not.toHaveBeenCalled();
      expect(ipc.emitTo).toHaveBeenCalledExactlyOnceWith(
        { kind: 'Any' },
        'markierungen-geaendert',
        {
          gesetz: kontext.gesetz,
        },
      );
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it('löst beim erneuten Verweisversand keine Normen oder Importe erneut auf', async () => {
    const uebernahme = await registrieren();
    ipc.emitTo.mockImplementation(async (label, event, payload) => {
      if (event !== 'markierung-historie-bestaetigt') senden(label, event, payload);
    });
    const runde = speichereVerweismarkierung(
      kontext,
      markierungsEinzelzugriffFuerTest,
      '§ 1 BGB',
      false,
      true,
      new Map(),
    );
    await vi.dynamicImportSettled();
    await tick(3200);
    const ergebnis = await runde;
    expect(ergebnis.art).toBe('uebertragungOffen');
    if (ergebnis.art !== 'uebertragungOffen') throw new Error('Auftrag erwartet');
    expect(ipc.ladeGesetze).toHaveBeenCalledTimes(2);
    expect(ipc.kandidaten).toHaveBeenCalledOnce();
    ipc.emitTo.mockImplementation(async (label, event, payload) => senden(label, event, payload));
    const wiederholung = modul.wiederholeMarkierungsUebertragung(ergebnis.uebertragung);
    await tick();
    expect(await wiederholung).toBe('bestaetigt');
    expect(ipc.ladeGesetze).toHaveBeenCalledTimes(2);
    expect(ipc.kandidaten).toHaveBeenCalledOnce();
    expect(ipc.schreiben).toHaveBeenCalledOnce();
    expect(ipc.importieren).not.toHaveBeenCalled();
    expect(uebernahme).toHaveBeenCalledExactlyOnceWith(aktion);
    modul.verwerfeMarkierungsUebertragung(ergebnis.uebertragung);
  });
});

// Bestehende Szenarioattrappe des früheren Sammelwegs nur im Testzugang.
vi.mock('@/test/tabs/gesetzSpeicherTestzugang', async (original) => ({
  ...(await original<typeof import('@/test/tabs/gesetzSpeicherTestzugang')>()),
  ladeAlleGesetze: ipc.ladeGesetze,
}));
