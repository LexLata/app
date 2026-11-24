// gesetzSpeicherEreignisse.test.ts
//
// Unit-Tests für die Zähler-/Debounce-Mechanik in gesetzSpeicherEreignisse.ts
// (nachSpeichernPruefen, beiSpeicherBatchAbgeschlossen, istSpeicherBatchRuhig,
// warteAufSpeicherBatchAbschluss). Reine In-Memory-Logik ohne I/O – nichts
// wird gemockt, es werden nur Fake-Timer benötigt (NACHLAUF_MS-Debounce).
//
// Das Modul hält seinen Zustand (betroffeneKurztitel,
// laufendeSpeichervorgaenge, nachlaufTimer, subscriber) als Modul-Singleton –
// über die gesamte Testdatei hinweg EIN Modul-Zustand. Damit sich Tests nicht
// gegenseitig beeinflussen: JEDER Test meldet seine eigenen Subscriber über
// beiSpeicherBatchAbgeschlossen an und meldet sie im selben Test (bzw.
// spätestens in afterEach) wieder ab; außerdem wird nach jedem Test bis zum
// Verstreichen des Nachlauf-Timers vorgespult, damit kein Timer in den
// nächsten Test hinüberläuft.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import {
  beiSpeicherBatchAbgeschlossen,
  istSpeicherBatchRuhig,
  warteAufSpeicherBatchAbschluss,
  nachSpeichernPruefen,
  beiNichtamtlicheTitelGeschrieben,
  meldeNichtamtlicheTitelGeschrieben,
} from './gesetzSpeicherEreignisse';

const NACHLAUF_MS = 200;

let abmeldungen: (() => void)[] = [];
function subscriber(): { fn: (b: Gesetzesreferenz[]) => void; aufrufe: Gesetzesreferenz[][] } {
  const aufrufe: Gesetzesreferenz[][] = [];
  const fn = vi.fn((b: Gesetzesreferenz[]) => {
    aufrufe.push([...b]);
  });
  abmeldungen.push(beiSpeicherBatchAbgeschlossen(fn));
  return { fn, aufrufe };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(async () => {
  // Alle in diesem Test angemeldeten Subscriber abmelden, bevor der nächste
  // Test startet, damit sie nicht auf dessen Ereignisse reagieren.
  for (const abmelden of abmeldungen) abmelden();
  abmeldungen = [];
  // Noch ausstehende Timer verstreichen lassen, damit sie nicht in den
  // nächsten Test (mit neu installierten Fake-Timern) hinüberlaufen.
  await vi.runAllTimersAsync();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// nachSpeichernPruefen - Grundverhalten
// ---------------------------------------------------------------------------

describe('nachSpeichernPruefen', () => {
  it('gibt das Ergebnis des übergebenen Vorgangs unverändert zurück', async () => {
    const ergebnis = await nachSpeichernPruefen(gesetzesreferenz({ kurztitel: 'BGB' }), true, () =>
      Promise.resolve(42),
    );
    expect(ergebnis).toBe(42);
  });

  it('dekrementiert den Zähler auch, wenn der Vorgang wirft, und wirft den Fehler weiter', async () => {
    const { fn } = subscriber();
    await expect(
      nachSpeichernPruefen(gesetzesreferenz({ kurztitel: 'BGB' }), true, () =>
        Promise.reject(new Error('kaputt')),
      ),
    ).rejects.toThrow('kaputt');

    // Zähler korrekt wieder auf 0 (sonst würde istSpeicherBatchRuhig ewig
    // false bleiben) - und der Nachlauf wurde trotz Fehler angestoßen:
    expect(istSpeicherBatchRuhig()).toBe(false); // Nachlauf-Timer läuft noch
    await vi.advanceTimersByTimeAsync(NACHLAUF_MS);
    expect(fn).not.toHaveBeenCalled();
  });

  it('inhaltGeaendert=false: die Kurztitel wird NICHT in die Sammelmenge aufgenommen, Subscriber wird nicht benachrichtigt', async () => {
    const { fn } = subscriber();
    await nachSpeichernPruefen(gesetzesreferenz({ kurztitel: 'BGB' }), false, () =>
      Promise.resolve(),
    );
    await vi.advanceTimersByTimeAsync(NACHLAUF_MS);
    expect(fn).not.toHaveBeenCalled();
  });

  it('benachrichtigt Subscriber erst NACH Ablauf der Nachlauf-Frist, nicht sofort', async () => {
    const { fn } = subscriber();
    await nachSpeichernPruefen(gesetzesreferenz({ kurztitel: 'BGB' }), true, () =>
      Promise.resolve(),
    );

    await vi.advanceTimersByTimeAsync(NACHLAUF_MS - 1);
    expect(fn).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith([gesetzesreferenz({ kurztitel: 'BGB' })]);
  });

  it('zwei ÜBERLAPPENDE Vorgänge: der Zähler fällt erst auf 0, wenn BEIDE fertig sind - Subscriber wird einmalig mit BEIDEN Kurztitel benachrichtigt', async () => {
    const { fn } = subscriber();
    let ersterFreigeben!: () => void;
    const ersterVorgang = new Promise<void>((r) => {
      ersterFreigeben = r;
    });

    const p1 = nachSpeichernPruefen(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      true,
      () => ersterVorgang,
    );
    const p2 = nachSpeichernPruefen(gesetzesreferenz({ kurztitel: 'StGB' }), true, () =>
      Promise.resolve(),
    );

    await p2;
    // p2 ist fertig, aber p1 läuft noch -> darf noch NICHT als ruhig gelten:
    await vi.advanceTimersByTimeAsync(NACHLAUF_MS);
    expect(fn).not.toHaveBeenCalled();

    ersterFreigeben();
    await p1;
    await vi.advanceTimersByTimeAsync(NACHLAUF_MS);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith([
      gesetzesreferenz({ kurztitel: 'StGB' }),
      gesetzesreferenz({ kurztitel: 'BGB' }),
    ]);
  });

  it('ein neuer Vorgang, der INNERHALB der Nachlauf-Frist beginnt, verhindert die Benachrichtigung für diese Runde (Sicherheitscheck im Timer-Callback)', async () => {
    const { fn } = subscriber();
    await nachSpeichernPruefen(gesetzesreferenz({ kurztitel: 'BGB' }), true, () =>
      Promise.resolve(),
    );

    // Kurz vor Ablauf der Nachlauf-Frist beginnt ein neuer Vorgang, der
    // LÄNGER als die restliche Frist braucht:
    await vi.advanceTimersByTimeAsync(NACHLAUF_MS - 10);
    let zweitenFreigeben!: () => void;
    const zweiterVorgang = new Promise<void>((r) => {
      zweitenFreigeben = r;
    });
    const p2 = nachSpeichernPruefen(
      gesetzesreferenz({ kurztitel: 'StGB' }),
      true,
      () => zweiterVorgang,
    );

    // Der ursprüngliche Timer verstreicht jetzt, aber laufendeSpeichervorgaenge
    // ist wegen p2 nicht mehr 0 -> keine Benachrichtigung für diese Runde:
    await vi.advanceTimersByTimeAsync(10);
    expect(fn).not.toHaveBeenCalled();

    zweitenFreigeben();
    await p2;
    await vi.advanceTimersByTimeAsync(NACHLAUF_MS);

    // Beide Kurztitel wurden gesammelt und kommen jetzt gemeinsam:
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith([
      gesetzesreferenz({ kurztitel: 'BGB' }),
      gesetzesreferenz({ kurztitel: 'StGB' }),
    ]);
  });

  it('MUTATIONSTEST: property - der Subscriber erhält über beliebig viele überlappende Aufrufe hinweg GENAU die Kurztitel mit inhaltGeaendert=true, keine anderen', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            kurztitel: fc.constantFrom('A', 'B', 'C', 'D'),
            geaendert: fc.boolean(),
          }),
          { minLength: 1, maxLength: 8 },
        ),
        async (vorgaenge) => {
          const { fn } = subscriber();
          await Promise.all(
            vorgaenge.map((v) =>
              nachSpeichernPruefen(gesetzesreferenz({ kurztitel: v.kurztitel }), v.geaendert, () =>
                Promise.resolve(),
              ),
            ),
          );
          await vi.advanceTimersByTimeAsync(NACHLAUF_MS);

          const erwartet = new Set(vorgaenge.filter((v) => v.geaendert).map((v) => v.kurztitel));
          if (erwartet.size === 0) {
            expect(fn).not.toHaveBeenCalled();
          } else {
            expect(fn).toHaveBeenCalledTimes(1);
            expect(fn).toHaveBeenCalledWith(
              [...erwartet].map((kurztitel) => gesetzesreferenz({ kurztitel })),
            );
          }
        },
      ),
      { numRuns: 25 },
    );
  });
});

// ---------------------------------------------------------------------------
// beiSpeicherBatchAbgeschlossen - Abmeldung
// ---------------------------------------------------------------------------

describe('beiSpeicherBatchAbgeschlossen', () => {
  it('die zurückgegebene Abmeldefunktion verhindert weitere Aufrufe des Subscribers', async () => {
    const fn = vi.fn();
    const abmelden = beiSpeicherBatchAbgeschlossen(fn);
    abmelden();

    await nachSpeichernPruefen(gesetzesreferenz({ kurztitel: 'BGB' }), true, () =>
      Promise.resolve(),
    );
    await vi.advanceTimersByTimeAsync(NACHLAUF_MS);

    expect(fn).not.toHaveBeenCalled();
  });

  it('mehrere Subscriber werden unabhängig voneinander benachrichtigt', async () => {
    const { fn: fn1 } = subscriber();
    const { fn: fn2 } = subscriber();

    await nachSpeichernPruefen(gesetzesreferenz({ kurztitel: 'BGB' }), true, () =>
      Promise.resolve(),
    );
    await vi.advanceTimersByTimeAsync(NACHLAUF_MS);

    expect(fn1).toHaveBeenCalledTimes(1);
    expect(fn2).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// istSpeicherBatchRuhig / warteAufSpeicherBatchAbschluss
// ---------------------------------------------------------------------------

describe('istSpeicherBatchRuhig', () => {
  it('ist true, wenn kein Vorgang läuft und kein Nachlauf-Timer aussteht', () => {
    expect(istSpeicherBatchRuhig()).toBe(true);
  });

  it('ist false, während ein Vorgang läuft', async () => {
    let freigeben!: () => void;
    const vorgang = new Promise<void>((r) => {
      freigeben = r;
    });
    const p = nachSpeichernPruefen(gesetzesreferenz({ kurztitel: 'BGB' }), true, () => vorgang);
    expect(istSpeicherBatchRuhig()).toBe(false);
    freigeben();
    await p;
    await vi.advanceTimersByTimeAsync(NACHLAUF_MS);
  });

  it('ist false während der Nachlauf-Frist, selbst nachdem der Zähler bereits auf 0 gefallen ist', async () => {
    await nachSpeichernPruefen(gesetzesreferenz({ kurztitel: 'BGB' }), true, () =>
      Promise.resolve(),
    );
    expect(istSpeicherBatchRuhig()).toBe(false);
    await vi.advanceTimersByTimeAsync(NACHLAUF_MS);
    expect(istSpeicherBatchRuhig()).toBe(true);
  });
});

describe('warteAufSpeicherBatchAbschluss', () => {
  it('kehrt sofort zurück, wenn gerade kein Batch aktiv ist', async () => {
    const spy = vi.fn();
    await warteAufSpeicherBatchAbschluss().then(spy);
    expect(spy).toHaveBeenCalled();
  });

  it('wartet, bis ein laufender Vorgang UND der anschließende Nachlauf-Timer abgeschlossen sind', async () => {
    let freigeben!: () => void;
    const vorgang = new Promise<void>((r) => {
      freigeben = r;
    });
    const p = nachSpeichernPruefen(gesetzesreferenz({ kurztitel: 'BGB' }), true, () => vorgang);

    let fertig = false;
    const wartend = warteAufSpeicherBatchAbschluss().then(() => {
      fertig = true;
    });

    // Vorgang läuft noch -> warteAufSpeicherBatchAbschluss darf noch nicht
    // durch sein (Pollintervall 20ms):
    await vi.advanceTimersByTimeAsync(100);
    expect(fertig).toBe(false);

    freigeben();
    await p;
    // Zähler ist jetzt 0, aber der Nachlauf-Timer (200ms) steht noch aus:
    await vi.advanceTimersByTimeAsync(20);
    expect(fertig).toBe(false);

    await vi.advanceTimersByTimeAsync(NACHLAUF_MS);
    await wartend;
    expect(fertig).toBe(true);
  });

  it('wartet nach dem Nachlauf auch auf eine asynchrone Batch-Benachrichtigung', async () => {
    let benachrichtigungFreigeben!: () => void;
    const benachrichtigung = new Promise<void>((resolve) => {
      benachrichtigungFreigeben = resolve;
    });
    abmeldungen.push(beiSpeicherBatchAbgeschlossen(() => benachrichtigung));
    await nachSpeichernPruefen(gesetzesreferenz({ kurztitel: 'BGB' }), true, () =>
      Promise.resolve(),
    );

    let fertig = false;
    const wartend = warteAufSpeicherBatchAbschluss().then(() => {
      fertig = true;
    });
    await vi.advanceTimersByTimeAsync(NACHLAUF_MS + 20);
    expect(istSpeicherBatchRuhig()).toBe(false);
    expect(fertig).toBe(false);

    benachrichtigungFreigeben();
    await vi.advanceTimersByTimeAsync(20);
    await wartend;
    expect(istSpeicherBatchRuhig()).toBe(true);
    expect(fertig).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// beiNichtamtlicheTitelGeschrieben / meldeNichtamtlicheTitelGeschrieben
// ---------------------------------------------------------------------------
//
// Eigener, unabhängiger Subscriber-Kanal (siehe Kopfkommentar in der
// Quelldatei) – KEIN Batch/Debounce, jede Meldung geht sofort synchron an
// alle Subscriber.

describe('beiNichtamtlicheTitelGeschrieben', () => {
  it('benachrichtigt einen angemeldeten Subscriber sofort und synchron', () => {
    const fn = vi.fn();
    const abmelden = beiNichtamtlicheTitelGeschrieben(fn);
    meldeNichtamtlicheTitelGeschrieben(gesetzesreferenz({ kurztitel: 'BGB' }));
    expect(fn).toHaveBeenCalledExactlyOnceWith(gesetzesreferenz({ kurztitel: 'BGB' }));
    abmelden();
  });

  it('meldet eine Titelarchivierung sofort, ohne den Gesetzbestand-Batch auszulösen', async () => {
    const titelFn = vi.fn();
    const { fn: gesetzFn } = subscriber();
    abmeldungen.push(beiNichtamtlicheTitelGeschrieben(titelFn));
    // Derselbe Kanal wird nach bestätigtem Schreiben oder Entfernen verwendet.
    meldeNichtamtlicheTitelGeschrieben(gesetzesreferenz({ kurztitel: 'GG' }));
    expect(titelFn).toHaveBeenCalledExactlyOnceWith(gesetzesreferenz({ kurztitel: 'GG' }));
    expect(istSpeicherBatchRuhig()).toBe(true);
    await vi.advanceTimersByTimeAsync(NACHLAUF_MS);
    expect(gesetzFn).not.toHaveBeenCalled();
  });

  it('mehrere Subscriber werden unabhängig voneinander benachrichtigt', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const abmelden1 = beiNichtamtlicheTitelGeschrieben(fn1);
    const abmelden2 = beiNichtamtlicheTitelGeschrieben(fn2);

    meldeNichtamtlicheTitelGeschrieben(gesetzesreferenz({ kurztitel: 'GG' }));

    expect(fn1).toHaveBeenCalledExactlyOnceWith(gesetzesreferenz({ kurztitel: 'GG' }));
    expect(fn2).toHaveBeenCalledExactlyOnceWith(gesetzesreferenz({ kurztitel: 'GG' }));
    abmelden1();
    abmelden2();
  });

  it('die zurückgegebene Abmeldefunktion verhindert weitere Aufrufe des Subscribers', () => {
    const fn = vi.fn();
    const abmelden = beiNichtamtlicheTitelGeschrieben(fn);
    abmelden();

    meldeNichtamtlicheTitelGeschrieben(gesetzesreferenz({ kurztitel: 'BGB' }));

    expect(fn).not.toHaveBeenCalled();
  });

  it('meldeNichtamtlicheTitelGeschrieben ohne jeden Subscriber wirft nicht', () => {
    expect(() =>
      meldeNichtamtlicheTitelGeschrieben(gesetzesreferenz({ kurztitel: 'BGB' })),
    ).not.toThrow();
  });
});

it('trennt namengleiche Normgeber und fasst Schreibweisen derselben Referenz zusammen', async () => {
  const fn = vi.fn();
  abmeldungen.push(beiSpeicherBatchAbgeschlossen(fn));
  await nachSpeichernPruefen({ kurztitel: 'BGB', normgeber: 'de-bund' }, true, async () => {});
  await nachSpeichernPruefen({ kurztitel: 'BGB', normgeber: 'de-bw' }, true, async () => {});
  await nachSpeichernPruefen({ kurztitel: 'bgb', normgeber: 'de-bund' }, true, async () => {});
  await vi.advanceTimersByTimeAsync(NACHLAUF_MS);
  expect(fn).toHaveBeenCalledExactlyOnceWith([
    { kurztitel: 'BGB', normgeber: 'de-bund' },
    { kurztitel: 'BGB', normgeber: 'de-bw' },
  ]);
});

it('führt Vorgangsverweise verschiedener Änderungen im Batch zusammen', async () => {
  const fn = vi.fn();
  abmeldungen.push(beiSpeicherBatchAbgeschlossen(fn));
  await nachSpeichernPruefen(gesetzesreferenz({ kurztitel: 'BGB' }), true, async () => {}, {
    pruefvorgang: 'v1',
  });
  await nachSpeichernPruefen(gesetzesreferenz({ kurztitel: 'BGB' }), true, async () => {}, {
    pruefvorgang: 'v2',
  });
  await nachSpeichernPruefen(gesetzesreferenz({ kurztitel: 'GG' }), false, async () => {}, {
    pruefvorgang: 'unveraendert',
  });
  await vi.advanceTimersByTimeAsync(NACHLAUF_MS);
  expect(fn).toHaveBeenCalledExactlyOnceWith(
    [gesetzesreferenz({ kurztitel: 'BGB' })],
    ['v1', 'v2'],
  );
});
it('ordnet ein Titelereignis seinem vorgemerkten Vorgang zu', () => {
  const fn = vi.fn();
  const abmelden = beiNichtamtlicheTitelGeschrieben(fn);
  try {
    meldeNichtamtlicheTitelGeschrieben(gesetzesreferenz({ kurztitel: 'BGB' }), 'v1');
    expect(fn).toHaveBeenCalledExactlyOnceWith(gesetzesreferenz({ kurztitel: 'BGB' }), 'v1');
  } finally {
    abmelden();
  }
});

it.each(['synchron', 'asynchron'] as const)(
  'ordnet %s abgelehnte Batchbenachrichtigung den vorab registrierten Besitzern zu',
  async (art) => {
    const { erzeugeAktionsMeldungsSammlung } = await import('@/lib/domain/app/aktionsMeldung');
    const a = erzeugeAktionsMeldungsSammlung();
    const b = erzeugeAktionsMeldungsSammlung();
    const nachbar = subscriber();
    abmeldungen.push(
      beiSpeicherBatchAbgeschlossen(() => {
        if (art === 'synchron') throw Error('Batchtransport');
        return Promise.reject(Error('Batchtransport'));
      }),
    );
    await nachSpeichernPruefen(gesetzesreferenz({ kurztitel: 'BGB' }), true, async () => {}, {
      pruefvorgang: 'a',
      meldungEmpfangen: a.meldungEmpfangen,
    });
    await nachSpeichernPruefen(gesetzesreferenz({ kurztitel: 'HGB' }), true, async () => {}, {
      pruefvorgang: 'b',
      meldungEmpfangen: b.meldungEmpfangen,
    });
    expect(a.hatOffeneFolgelaeufe()).toBe(true);
    expect(b.hatOffeneFolgelaeufe()).toBe(true);
    await vi.advanceTimersByTimeAsync(NACHLAUF_MS);
    await a.warteAufAbschluss(1000);
    await b.warteAufAbschluss(1000);
    for (const sammlung of [a, b])
      expect(sammlung.meldungen()).toEqual([
        expect.objectContaining({
          anlass: 'pruefabschluss',
          text: expect.stringContaining('Batchtransport'),
        }),
      ]);
    expect(nachbar.fn).toHaveBeenCalledTimes(1);
  },
);

it.each(['synchron', 'asynchron'] as const)(
  'meldet %s abgelehnte Titelbenachrichtigung nur ihrem Besitzer',
  async (art) => {
    const { erzeugeAktionsMeldungsSammlung } = await import('@/lib/domain/app/aktionsMeldung');
    const a = erzeugeAktionsMeldungsSammlung();
    const b = erzeugeAktionsMeldungsSammlung();
    const nachbar = vi.fn();
    abmeldungen.push(
      beiNichtamtlicheTitelGeschrieben((gesetz) => {
        if (gesetz.kurztitel !== 'BGB') return;
        if (art === 'synchron') throw Error('Titeltransport');
        return Promise.reject(Error('Titeltransport'));
      }),
      beiNichtamtlicheTitelGeschrieben(nachbar),
    );
    meldeNichtamtlicheTitelGeschrieben(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      'a',
      a.meldungEmpfangen,
    );
    meldeNichtamtlicheTitelGeschrieben(
      gesetzesreferenz({ kurztitel: 'HGB' }),
      'b',
      b.meldungEmpfangen,
    );
    await a.warteAufAbschluss(1000);
    await b.warteAufAbschluss(1000);
    expect(a.meldungen()).toEqual([
      expect.objectContaining({ text: expect.stringContaining('Titeltransport') }),
    ]);
    expect(b.meldungen()).toEqual([]);
    expect(nachbar).toHaveBeenCalledTimes(2);
  },
);
