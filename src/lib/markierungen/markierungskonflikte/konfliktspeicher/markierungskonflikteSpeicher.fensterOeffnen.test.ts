// markierungskonflikteSpeicher.fensterOeffnen.test.ts
//
// Unit-Tests für planeFensterOeffnen aus
// markierungskonflikteSpeicher.fensterOeffnen.ts. Fake-Timer nötig, da die
// Funktion selbst NICHT awaited werden kann (bewusst "fire and forget",
// siehe Kopfkommentar dort) und intern in 50ms-Schritten pollt.
//
// '@/lib/persistenz/gesetz/gesetz.index' (istSpeicherBatchRuhig)
// und '@tauri-apps/api/core' (invoke) werden gemockt – beides reine
// Fremdabhängigkeiten ohne eigene, hier relevante Logik.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const istSpeicherBatchRuhig = vi.fn<() => boolean>();
vi.mock('@/lib/persistenz/gesetz/gesetz.index', () => ({
  istSpeicherBatchRuhig: () => istSpeicherBatchRuhig(),
}));

const invoke = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

import { planeFensterOeffnen } from './markierungskonflikteSpeicher.fensterOeffnen';

beforeEach(() => {
  vi.useFakeTimers();
  istSpeicherBatchRuhig.mockReset();
  invoke.mockReset();
  invoke.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('planeFensterOeffnen', () => {
  it('sofort ruhig (Batch fertig, Kette unverändert) -> öffnet das Fenster ohne Wartezeit', async () => {
    istSpeicherBatchRuhig.mockReturnValue(true);
    const kette = Promise.resolve();
    planeFensterOeffnen(() => kette);

    await vi.advanceTimersByTimeAsync(0);

    expect(invoke).toHaveBeenCalledWith('markierungskonflikte_fenster_oeffnen');
  });

  it('noch NICHT ruhig (Speicher-Batch läuft) -> wartet in 50ms-Schritten, bis istSpeicherBatchRuhig() true liefert', async () => {
    istSpeicherBatchRuhig.mockReturnValueOnce(false).mockReturnValue(true);
    const kette = Promise.resolve();
    planeFensterOeffnen(() => kette);

    // Nach 0ms noch nicht ruhig -> noch kein invoke:
    await vi.advanceTimersByTimeAsync(0);
    expect(invoke).not.toHaveBeenCalled();

    // Nach dem 50ms-Poll-Intervall ist istSpeicherBatchRuhig() jetzt true:
    await vi.advanceTimersByTimeAsync(50);
    expect(invoke).toHaveBeenCalledWith('markierungskonflikte_fenster_oeffnen');
  });

  it('istSpeicherBatchRuhig() bereits true, aber die Kette wechselt noch (neuer Lauf startet mitten im Poll) -> wartet, bis Referenz stabil bleibt', async () => {
    istSpeicherBatchRuhig.mockReturnValue(true);
    const refs = [Promise.resolve(), Promise.resolve(), Promise.resolve()];
    let idx = 0;
    const holeAktuelleKette = vi.fn(() => refs[Math.min(idx++, refs.length - 1)]!);

    planeFensterOeffnen(holeAktuelleKette);

    // 1. Durchlauf: referenz = refs[0], Vergleichsaufruf liefert refs[1] -> nicht stabil.
    await vi.advanceTimersByTimeAsync(0);
    expect(invoke).not.toHaveBeenCalled();

    // 2. Durchlauf (nach 50ms): referenz = refs[2], Vergleichsaufruf liefert
    // ebenfalls refs[2] (Array-Ende erreicht) -> jetzt stabil -> öffnet Fenster.
    await vi.advanceTimersByTimeAsync(50);
    expect(invoke).toHaveBeenCalledWith('markierungskonflikte_fenster_oeffnen');
  });

  it('nie ruhig -> öffnet das Fenster trotzdem spätestens nach dem 30s-Timeout (kein unbegrenztes Warten)', async () => {
    istSpeicherBatchRuhig.mockReturnValue(false);
    const kette = Promise.resolve();
    planeFensterOeffnen(() => kette);

    await vi.advanceTimersByTimeAsync(29_000);
    expect(invoke).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    expect(invoke).toHaveBeenCalledWith('markierungskonflikte_fenster_oeffnen');
  });

  it('invoke schlägt fehl (nicht in Tauri-Umgebung) -> Fehler wird still abgefangen, kein unhandled rejection', async () => {
    istSpeicherBatchRuhig.mockReturnValue(true);
    invoke.mockRejectedValue(new Error('nicht in Tauri-Umgebung'));
    const kette = Promise.resolve();

    expect(() => planeFensterOeffnen(() => kette)).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);

    expect(invoke).toHaveBeenCalledWith('markierungskonflikte_fenster_oeffnen');
  });
});
