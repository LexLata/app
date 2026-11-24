// @vitest-environment jsdom
// Übernahmebestätigung und Transportfehler dürfen die Tabquelle nicht vorzeitig entfernen.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { TabUebertragung } from '@/lib/domain/appTypes';
import { useFensterUebertragung } from './useFensterUebertragung';

const native = {
  invoke: io.invoke,
  senden: io.emitTo,
  abholen: vi.fn(),
};
async function ereignis(name: string, payload?: unknown) {
  for (const handler of io.listener.get(name) ?? []) handler({ payload });
}
let root: Root;
let hook: ReturnType<typeof useFensterUebertragung>;
let snapshot: TabUebertragung;
const abschliessen = vi.fn();
const schliessen = vi.fn();
const uebernehmen = vi.fn();
function payload(): TabUebertragung {
  const ablage = native.invoke.mock.calls.find(([name]) => name === 'tab_uebertragung_ablegen')!;
  return JSON.parse(ablage[1].payload);
}
async function bestaetigen(uebernommen: boolean, kennung = payload().transport!.kennung) {
  await act(async () => ereignis('tab-uebertragung-bestaetigt', { kennung, uebernommen }));
}
let erledigt = false;
function starteUebertragung(neu: boolean) {
  erledigt = false;
  const abschluss = neu
    ? hook.handleTabHerausziehen('tab')
    : hook.handleTabInFensterAufnehmen('tab', 'ziel');
  return abschluss.then(() => {
    erledigt = true;
  });
}
beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.resetAllMocks();
  nativeAttrappeZuruecksetzen();
  native.invoke.mockImplementation(async (name) =>
    name === 'tab_uebertragung_abholen' ? JSON.stringify(await native.abholen()) : undefined,
  );
  native.senden.mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  snapshot = {
    gesetzesreferenz: { kurztitel: 'BGB', normgeber: 'de-bund' },
    verlauf: { eintraege: [], position: 0 },
  };
  uebernehmen.mockReturnValue(true);
  abschliessen.mockReturnValue(false);
  schliessen.mockResolvedValue(undefined);
  root = createRoot(document.createElement('div'));
  function Probe() {
    hook = useFensterUebertragung({
      tabFuerUebertragungKopieren: () => snapshot,
      tabUebertragungAbschliessen: abschliessen,
      fensterSchliessen: schliessen,
      tabAusUebertragungUebernehmen: uebernehmen,
    });
    return null;
  }
  await act(async () => root.render(<Probe />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it.each([false, true])(
  'entfernt die Quelle erst nach passender Bestätigung (neues Fenster %s)',
  async (neu) => {
    const abschluss = starteUebertragung(neu);
    await act(async () => {});
    expect(erledigt).toBe(false);
    expect(abschliessen).not.toHaveBeenCalled();
    await bestaetigen(true, 'fremde-kennung');
    expect(abschliessen).not.toHaveBeenCalled();
    await bestaetigen(true);
    await abschluss;
    expect(erledigt).toBe(true);
    expect(abschliessen).toHaveBeenCalledExactlyOnceWith('tab');
    expect(schliessen).not.toHaveBeenCalled();
    await bestaetigen(true);
    expect(abschliessen).toHaveBeenCalledTimes(1);
  },
);
it('schließt das leere Quellfenster erst nach bestätigter letzter Tabentfernung', async () => {
  abschliessen.mockReturnValue(true);
  const abschluss = starteUebertragung(false);
  await act(async () => {});
  expect(schliessen).not.toHaveBeenCalled();
  await bestaetigen(true);
  expect(abschliessen).toHaveBeenCalledBefore(schliessen);
  expect(schliessen).toHaveBeenCalledOnce();
  await abschluss;
});
it('erhält die Quelle bei verweigerter Übernahme', async () => {
  const abschluss = starteUebertragung(false);
  await act(async () => {});
  await bestaetigen(false);
  await abschluss;
  expect(erledigt).toBe(true);
  expect(abschliessen).not.toHaveBeenCalled();
});
it.each(['tab_uebertragung_ablegen', 'fenster_oeffnen_mit_label', 'ereignis'])(
  'erhält die Quelle bei Fehler an %s',
  async (stufe) => {
    const fehler = new Error(stufe);
    if (stufe === 'ereignis') native.senden.mockRejectedValueOnce(fehler);
    else
      native.invoke.mockImplementation(async (name) => {
        if (name === stufe) throw fehler;
      });
    await act(async () => {
      if (stufe === 'ereignis') await hook.handleTabInFensterAufnehmen('tab', 'ziel');
      else await hook.handleTabHerausziehen('tab');
    });
    expect(abschliessen).not.toHaveBeenCalled();
    expect(schliessen).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      'Tab konnte nicht übertragen werden; Quelltab bleibt erhalten:',
      fehler,
    );
  },
);
it('verhindert paralleles Ziehen desselben Tabs und entfernt keine inzwischen geänderte Quelle', async () => {
  const abschluss = starteUebertragung(false);
  await act(async () => {});
  const doppelt = hook.handleTabInFensterAufnehmen('tab', 'anderes-ziel');
  await act(async () => {});
  expect(
    native.invoke.mock.calls.filter(([name]) => name === 'tab_uebertragung_ablegen'),
  ).toHaveLength(1);
  snapshot = { gesetzesreferenz: { kurztitel: 'GG', normgeber: 'de-bund' } };
  await bestaetigen(true);
  await Promise.all([abschluss, doppelt]);
  expect(abschliessen).not.toHaveBeenCalled();
});
it('erhält die Quelle nach 30 Sekunden und ignoriert verspätete Bestätigung', async () => {
  const abschluss = starteUebertragung(false);
  await act(async () => {});
  expect(erledigt).toBe(false);
  await act(async () => vi.advanceTimersByTimeAsync(30_000));
  await abschluss;
  expect(erledigt).toBe(true);
  await bestaetigen(true);
  expect(abschliessen).not.toHaveBeenCalled();
  expect(native.invoke).toHaveBeenCalledWith('tab_uebertragung_verwerfen', {
    label: 'ziel',
    payload: JSON.stringify(payload()),
  });
});
it.each([true, false])(
  'bestätigt das tatsächliche Übernahmeergebnis ohne Sammelladen (%s)',
  async (erfolg) => {
    uebernehmen.mockReturnValue(erfolg);
    native.abholen.mockResolvedValue({
      ...snapshot,
      transport: { kennung: 'empfang', quellLabel: 'anderes', gueltigBis: Date.now() + 30_000 },
    });
    hook.fremdVorschauIndexRef.current = 2;
    await act(async () => ereignis('tab-uebertragung-eingefuegt'));
    expect(uebernehmen).toHaveBeenCalledWith(expect.anything(), true, 2);
    expect(native.senden).toHaveBeenCalledWith('anderes', 'tab-uebertragung-bestaetigt', {
      kennung: 'empfang',
      uebernommen: erfolg,
    });
  },
);
it.each(['abgelaufen', 'lesefehler', 'ausnahme'])(
  'übernimmt bei %s nicht und bestätigt den Fehlschlag',
  async (art) => {
    if (art === 'lesefehler') uebernehmen.mockResolvedValue(false);
    if (art === 'ausnahme') uebernehmen.mockRejectedValue(new Error('Lesen'));
    native.abholen.mockResolvedValue({
      ...snapshot,
      transport: {
        kennung: 'empfang',
        quellLabel: 'anderes',
        gueltigBis: Date.now() + (art === 'abgelaufen' ? -1 : 30_000),
      },
    });
    await act(async () => ereignis('tab-uebertragung-eingefuegt'));
    if (art === 'abgelaufen') expect(uebernehmen).not.toHaveBeenCalled();
    expect(native.senden).toHaveBeenCalledWith('anderes', 'tab-uebertragung-bestaetigt', {
      kennung: 'empfang',
      uebernommen: false,
    });
  },
);

it('sichert die Einfügeposition vor verzögerter nativer Abholung', async () => {
  let abholen!: (wert: TabUebertragung) => void;
  native.abholen.mockReturnValue(
    new Promise((resolve) => {
      abholen = resolve;
    }),
  );
  hook.fremdVorschauIndexRef.current = 3;
  await ereignis('tab-uebertragung-eingefuegt');
  hook.fremdVorschauIndexRef.current = null;
  await act(async () => {
    abholen(snapshot);
  });
  expect(uebernehmen).toHaveBeenCalledWith(snapshot, true, 3);
});

it('beendet die öffentliche Zusage beim Abbau und entfernt die Quelle nicht', async () => {
  const abschluss = starteUebertragung(false);
  await act(async () => {});
  expect(erledigt).toBe(false);
  await act(async () => root.unmount());
  await abschluss;
  expect(erledigt).toBe(true);
  expect(abschliessen).not.toHaveBeenCalled();
});
it('beendet nach Frist auch bei blockiertem Ablegen und öffnet nach dessen spätem Abschluss kein Fenster', async () => {
  let freigeben!: () => void;
  native.invoke.mockImplementation((name) =>
    name === 'tab_uebertragung_ablegen'
      ? new Promise<void>((resolve) => {
          freigeben = resolve;
        })
      : Promise.resolve(),
  );
  const abschluss = starteUebertragung(true);
  await act(async () => {});
  await act(async () => vi.advanceTimersByTimeAsync(30_000));
  await abschluss;
  expect(erledigt).toBe(true);
  await act(async () => freigeben());
  expect(native.invoke.mock.calls.some(([name]) => name === 'fenster_oeffnen_mit_label')).toBe(
    false,
  );
  expect(abschliessen).not.toHaveBeenCalled();
});
