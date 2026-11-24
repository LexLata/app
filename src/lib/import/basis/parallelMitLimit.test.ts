// parallelMitLimit.test.ts
//
// Tests für parallelMitLimit.ts (kolokiert, Vitest). Reine, dateizugriffsfreie
// Nebenläufigkeits-Steuerung (Worker-Pool) – geprüft wird über echte
// (kurze) Timer statt Fake-Timern, da die eigentliche Aussage ("nie mehr als
// `limit` gleichzeitig aktiv") den tatsächlichen Interleaving-Ablauf von
// Promise-Auflösung braucht, den Fake-Timer künstlich verzerren würden.

import { describe, it, expect } from 'vitest';
import { parallelMitLimit } from './parallelMitLimit';

describe('parallelMitLimit', () => {
  it('ruft fn für JEDES Item genau einmal auf', async () => {
    const verarbeitet: number[] = [];
    await parallelMitLimit([1, 2, 3, 4, 5], 2, async (item) => {
      verarbeitet.push(item);
    });
    expect(verarbeitet.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('überschreitet die Nebenläufigkeitsgrenze `limit` nie', async () => {
    let aktiv = 0;
    let maxAktiv = 0;
    const items = Array.from({ length: 8 }, (_, i) => i);
    await parallelMitLimit(items, 3, async () => {
      aktiv++;
      maxAktiv = Math.max(maxAktiv, aktiv);
      await new Promise((r) => setTimeout(r, 5));
      aktiv--;
    });
    expect(maxAktiv).toBeLessThanOrEqual(3);
    expect(maxAktiv).toBeGreaterThan(1); // stellt sicher, dass wirklich parallelisiert wurde
  });

  it('EDGE CASE: limit > items.length begrenzt sich effektiv auf items.length (nicht mehr Worker als Items)', async () => {
    let aktiv = 0;
    let maxAktiv = 0;
    await parallelMitLimit([1, 2], 10, async () => {
      aktiv++;
      maxAktiv = Math.max(maxAktiv, aktiv);
      await new Promise((r) => setTimeout(r, 5));
      aktiv--;
    });
    expect(maxAktiv).toBe(2);
  });

  it('EDGE CASE: limit=0 verhält sich wie limit=1 (mindestens ein Worker, kein Deadlock)', async () => {
    let aktiv = 0;
    let maxAktiv = 0;
    const verarbeitet: number[] = [];
    await parallelMitLimit([1, 2, 3], 0, async (item) => {
      aktiv++;
      maxAktiv = Math.max(maxAktiv, aktiv);
      await new Promise((r) => setTimeout(r, 1));
      aktiv--;
      verarbeitet.push(item);
    });
    expect(maxAktiv).toBe(1);
    expect(verarbeitet.sort()).toEqual([1, 2, 3]);
  });

  it('EDGE CASE: negatives limit verhält sich ebenfalls wie limit=1 (kein Absturz)', async () => {
    const verarbeitet: number[] = [];
    await parallelMitLimit([1, 2], -5, async (item) => {
      verarbeitet.push(item);
    });
    expect(verarbeitet.sort()).toEqual([1, 2]);
  });

  it('leeres items-Array ruft fn nie auf und löst dennoch auf', async () => {
    let calls = 0;
    await parallelMitLimit([], 5, async () => {
      calls++;
    });
    expect(calls).toBe(0);
  });

  it('ein Fehler in fn wird propagiert (kein stilles Verschlucken)', async () => {
    const verarbeitet: number[] = [];
    await expect(
      parallelMitLimit([1, 2, 3], 2, async (item) => {
        if (item === 2) throw new Error('Test-Fehler');
        await new Promise((resolve) => setTimeout(resolve, item === 1 ? 5 : 1));
        verarbeitet.push(item);
      }),
    ).rejects.toThrow('Test-Fehler');
    expect(verarbeitet.sort()).toEqual([1, 3]);
  });
});

it('führt nach einem Rohwertfehler alle übrigen Aufträge aus und liefert dessen Meldung als Error', async () => {
  const verarbeitet: number[] = [];
  await expect(
    parallelMitLimit([1, 2], 1, async (item) => {
      if (item === 1) throw 'Download gescheitert';
      verarbeitet.push(item);
    }),
  ).rejects.toMatchObject({ message: 'Download gescheitert', cause: 'Download gescheitert' });
  expect(verarbeitet).toEqual([2]);
});
