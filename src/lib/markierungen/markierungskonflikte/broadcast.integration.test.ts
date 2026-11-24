// Prüft echte Tauri-Zielsemantik für Markierungskonflikt- und Konfliktaktions-Broadcasts.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { emitTo, listen } from '@tauri-apps/api/event';
import { schreibeGesetzKonflikte } from './konfliktspeicher/markierungskonflikteSpeicher.dateiZugriff';
import { loescheAusgewaehlt } from './konfliktaktionen/konfliktaktionen.loeschen';
const speicher = vi.hoisted(() => ({ schreiben: vi.fn(), loeschen: vi.fn() }));
vi.mock('@/lib/persistenz/kern/kern.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/kern/kern.index')>()),
  appDatenSchreiben: speicher.schreiben,
}));
vi.mock('./konfliktaktionen/markierungskonflikteAktionen', () => ({
  loescheMarkierungsDatei: speicher.loeschen,
}));
vi.mock('./konfliktspeicher/markierungskonflikteSpeicher.pruefkette', () => ({
  reiheInPruefungsKetteEin: async (vorgang: () => Promise<void>) => vorgang(),
}));
type Ziel = { kind: 'Any' } | { kind: 'AnyLabel'; label: string };
type Empfang = (event: { payload: unknown }) => void;
let fenster: string;
let naechsteId: number;
let empfaenger: Map<number, { fenster: string; event: string; callback: Empfang }>;
beforeEach(() => {
  vi.clearAllMocks();
  speicher.schreiben.mockResolvedValue(undefined);
  speicher.loeschen.mockResolvedValue(undefined);
  fenster = 'sender';
  naechsteId = 0;
  empfaenger = new Map();
  vi.stubGlobal('window', {
    __TAURI_INTERNALS__: {
      transformCallback: (callback: Empfang) => callback,
      invoke: async (
        befehl: string,
        args: { handler: Empfang; event: string; target: Ziel; payload: unknown; eventId: number },
      ) => {
        if (befehl === 'plugin:event|listen') {
          const id = ++naechsteId;
          empfaenger.set(id, { fenster, event: args.event, callback: args.handler });
          return id;
        }
        if (befehl === 'plugin:event|unlisten') {
          empfaenger.delete(args.eventId);
          return;
        }
        if (befehl === 'plugin:event|emit_to') {
          for (const eintrag of empfaenger.values()) {
            if (
              eintrag.event === args.event &&
              (args.target.kind === 'Any' || args.target.label === eintrag.fenster)
            ) {
              eintrag.callback({ payload: args.payload });
            }
          }
          return;
        }
        throw new Error(befehl);
      },
    },
    __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => {} },
  });
});
afterEach(() => vi.unstubAllGlobals());
async function zweiFenster(event: string) {
  const a = vi.fn();
  const b = vi.fn();
  fenster = 'gesetz-a';
  const abmeldenA = await listen(event, a);
  fenster = 'gesetz-b';
  const abmeldenB = await listen(event, b);
  fenster = 'sender';
  return {
    a,
    b,
    abmelden: async () => {
      await abmeldenA();
      await abmeldenB();
    },
  };
}
it('behandelt AnyLabel exakt: Stern ist kein Broadcast, Any erreicht beide Fenster', async () => {
  const empfang = await zweiFenster('markierungen-geaendert');
  await emitTo('*', 'markierungen-geaendert');
  expect(empfang.a).not.toHaveBeenCalled();
  expect(empfang.b).not.toHaveBeenCalled();
  await emitTo('gesetz-a', 'markierungen-geaendert');
  expect(empfang.a).toHaveBeenCalledOnce();
  expect(empfang.b).not.toHaveBeenCalled();
  await emitTo({ kind: 'Any' }, 'markierungen-geaendert');
  expect(empfang.a).toHaveBeenCalledTimes(2);
  expect(empfang.b).toHaveBeenCalledOnce();
  await empfang.abmelden();
});
it('Schreiben des Markierungskonfliktstands benachrichtigt beide Hauptfenster', async () => {
  const empfang = await zweiFenster('markierungskonflikte-geaendert');
  await schreibeGesetzKonflikte(new Map());
  expect(speicher.schreiben).toHaveBeenCalledOnce();
  expect(empfang.a).toHaveBeenCalledOnce();
  expect(empfang.b).toHaveBeenCalledOnce();
  await empfang.abmelden();
});
it('Löschen per Konfliktaktion benachrichtigt beide Hauptfenster nach dem tatsächlichen Löschen', async () => {
  const empfang = await zweiFenster('markierungen-geaendert');
  const gesetz = { kurztitel: 'BGB', normgeber: 'de-bund' };
  await loescheAusgewaehlt({ art: 'datensatz', gesetz });
  expect(speicher.loeschen).toHaveBeenCalledExactlyOnceWith(gesetz);
  expect(empfang.a).toHaveBeenCalledExactlyOnceWith({ payload: { gesetz } });
  expect(empfang.b).toHaveBeenCalledExactlyOnceWith({ payload: { gesetz } });
  await empfang.abmelden();
});
