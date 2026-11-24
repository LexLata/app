// markierungSpeicher.ereignisse.test.ts
//
// Unit-Tests für die beiden Subscriber-Kanäle in
// markierungSpeicher.ereignisse.ts (beiMarkierungGeaendert/
// meldeMarkierungGeaendert, beiMarkierungenBulkGeaendert/
// meldeMarkierungenBulkGeaendert). Reine In-Memory-Logik ohne I/O und ohne
// Batch/Debounce (siehe gesetzSpeicherEreignisse.test.ts für das Gegenstück
// MIT Debounce) – jede Meldung geht sofort synchron an alle Subscriber.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { describe, it, expect, vi } from 'vitest';
import {
  beiMarkierungGeaendert,
  meldeMarkierungGeaendert,
  beiMarkierungenBulkGeaendert,
  meldeMarkierungenBulkGeaendert,
} from './markierungSpeicher.ereignisse';

describe('beiMarkierungGeaendert', () => {
  it('benachrichtigt einen angemeldeten Subscriber sofort und synchron mit Kurztitel + Schlüssel', () => {
    const fn = vi.fn();
    const abmelden = beiMarkierungGeaendert(fn);
    void meldeMarkierungGeaendert(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      'norm:§ 1|unterstreichung|z:0-5',
    );
    expect(fn).toHaveBeenCalledExactlyOnceWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      'norm:§ 1|unterstreichung|z:0-5',
    );
    abmelden();
  });

  it('mehrere Subscriber werden unabhängig voneinander benachrichtigt', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const abmelden1 = beiMarkierungGeaendert(fn1);
    const abmelden2 = beiMarkierungGeaendert(fn2);

    void meldeMarkierungGeaendert(gesetzesreferenz({ kurztitel: 'GG' }), 'Art. 1|kommentar|z:0-3');

    expect(fn1).toHaveBeenCalledExactlyOnceWith(
      gesetzesreferenz({ kurztitel: 'GG' }),
      'Art. 1|kommentar|z:0-3',
    );
    expect(fn2).toHaveBeenCalledExactlyOnceWith(
      gesetzesreferenz({ kurztitel: 'GG' }),
      'Art. 1|kommentar|z:0-3',
    );
    abmelden1();
    abmelden2();
  });

  it('die zurückgegebene Abmeldefunktion verhindert weitere Aufrufe des Subscribers', () => {
    const fn = vi.fn();
    const abmelden = beiMarkierungGeaendert(fn);
    abmelden();

    void meldeMarkierungGeaendert(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      'norm:§ 1|unterstreichung|z:0-5',
    );

    expect(fn).not.toHaveBeenCalled();
  });

  it('meldeMarkierungGeaendert ohne jeden Subscriber wirft nicht', () => {
    expect(
      () =>
        void meldeMarkierungGeaendert(
          gesetzesreferenz({ kurztitel: 'BGB' }),
          'norm:§ 1|unterstreichung|z:0-5',
        ),
    ).not.toThrow();
  });

  it('ein Subscriber am Bulk-Kanal wird NICHT über diesen Kanal benachrichtigt (getrennte Subscriber-Mengen)', () => {
    const bulkFn = vi.fn();
    const abmelden = beiMarkierungenBulkGeaendert(bulkFn);
    void meldeMarkierungGeaendert(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      'norm:§ 1|unterstreichung|z:0-5',
    );
    expect(bulkFn).not.toHaveBeenCalled();
    abmelden();
  });
});

describe('beiMarkierungenBulkGeaendert', () => {
  it('benachrichtigt einen angemeldeten Subscriber sofort und synchron mit der Kurztitel', () => {
    const fn = vi.fn();
    const abmelden = beiMarkierungenBulkGeaendert(fn);
    void meldeMarkierungenBulkGeaendert(gesetzesreferenz({ kurztitel: 'BGB' }));
    expect(fn).toHaveBeenCalledExactlyOnceWith(gesetzesreferenz({ kurztitel: 'BGB' }));
    abmelden();
  });

  it('mehrere Subscriber werden unabhängig voneinander benachrichtigt', () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    const abmelden1 = beiMarkierungenBulkGeaendert(fn1);
    const abmelden2 = beiMarkierungenBulkGeaendert(fn2);

    void meldeMarkierungenBulkGeaendert(gesetzesreferenz({ kurztitel: 'GG' }));

    expect(fn1).toHaveBeenCalledExactlyOnceWith(gesetzesreferenz({ kurztitel: 'GG' }));
    expect(fn2).toHaveBeenCalledExactlyOnceWith(gesetzesreferenz({ kurztitel: 'GG' }));
    abmelden1();
    abmelden2();
  });

  it('die zurückgegebene Abmeldefunktion verhindert weitere Aufrufe des Subscribers', () => {
    const fn = vi.fn();
    const abmelden = beiMarkierungenBulkGeaendert(fn);
    abmelden();

    void meldeMarkierungenBulkGeaendert(gesetzesreferenz({ kurztitel: 'BGB' }));

    expect(fn).not.toHaveBeenCalled();
  });

  it('meldeMarkierungenBulkGeaendert ohne jeden Subscriber wirft nicht', () => {
    expect(() =>
      meldeMarkierungenBulkGeaendert(gesetzesreferenz({ kurztitel: 'BGB' })),
    ).not.toThrow();
  });
});

it.each(['einzel', 'bulk'] as const)(
  'isoliert fehlerhafte %s-Subscriber nach erfolgreicher Speicherung',
  (art) => {
    const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
    const anmelden = art === 'einzel' ? beiMarkierungGeaendert : beiMarkierungenBulkGeaendert;
    const abmelden1 = anmelden(() => {
      throw new Error('Subscriberfehler');
    });
    const weiterer = vi.fn();
    const abmelden2 = anmelden(weiterer);
    try {
      expect(() =>
        art === 'einzel'
          ? meldeMarkierungGeaendert(gesetzesreferenz({ kurztitel: 'BGB' }), 'ziel')
          : meldeMarkierungenBulkGeaendert(gesetzesreferenz({ kurztitel: 'BGB' })),
      ).not.toThrow();
      expect(weiterer).toHaveBeenCalledOnce();
      expect(protokoll).toHaveBeenCalled();
    } finally {
      abmelden1();
      abmelden2();
      protokoll.mockRestore();
    }
  },
);

it('ordnet Einzel- und Bulkereignisse ihren eigenen Vorgangsverweisen zu', () => {
  const einzeln = vi.fn();
  const bulk = vi.fn();
  const ab1 = beiMarkierungGeaendert(einzeln);
  const ab2 = beiMarkierungenBulkGeaendert(bulk);
  try {
    void meldeMarkierungGeaendert(gesetzesreferenz({ kurztitel: 'BGB' }), 'kenn', 'v1');
    void meldeMarkierungenBulkGeaendert(gesetzesreferenz({ kurztitel: 'BGB' }), 'v2');
    expect(einzeln).toHaveBeenCalledExactlyOnceWith(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      'kenn',
      'v1',
    );
    expect(bulk).toHaveBeenCalledExactlyOnceWith(gesetzesreferenz({ kurztitel: 'BGB' }), 'v2');
  } finally {
    ab1();
    ab2();
  }
});

it('gibt asynchrone Prüffehler getrennt zurück und benachrichtigt weitere Subscriber', async () => {
  const fehler = new Error('Prüfung');
  const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
  const ab1 = beiMarkierungenBulkGeaendert(async () => {
    throw fehler;
  });
  const weiterer = vi.fn(async () => {});
  const ab2 = beiMarkierungenBulkGeaendert(weiterer);
  try {
    expect(
      await meldeMarkierungenBulkGeaendert(gesetzesreferenz({ kurztitel: 'BGB' }), 'v1'),
    ).toEqual([fehler]);
    expect(weiterer).toHaveBeenCalledExactlyOnceWith(gesetzesreferenz({ kurztitel: 'BGB' }), 'v1');
  } finally {
    ab1();
    ab2();
    protokoll.mockRestore();
  }
});

it('hält den ausdrücklichen Empfänger bis zum späteren Ereignisbefund offen', async () => {
  const { erzeugeAktionsMeldungsSammlung } = await import('@/lib/domain/app/aktionsMeldung');
  const sammlung = erzeugeAktionsMeldungsSammlung();
  let freigeben!: () => void;
  const wartet = new Promise<void>((resolve) => {
    freigeben = resolve;
  });
  const abmelden = beiMarkierungenBulkGeaendert(async (_gesetz, _vorgang, empfangen) => {
    await wartet;
    empfangen?.({
      text: 'Später Prüfbefund',
      typ: 'warnung',
      art: 'hinweis',
      anlass: 'pruefabschluss',
      aenderungsstand: 'vollstaendig',
    });
  });
  try {
    void meldeMarkierungenBulkGeaendert(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      'v1',
      sammlung.meldungEmpfangen,
    );
    let fertig = false;
    const abschluss = sammlung.warteAufAbschluss(1000).then(() => {
      fertig = true;
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(fertig).toBe(false);
    freigeben();
    await abschluss;
    expect(sammlung.meldungen().map((m) => m.text)).toEqual(['Später Prüfbefund']);
  } finally {
    abmelden();
    freigeben();
  }
});

it('liefert einen synchron geworfenen Rohwert als Fehler und benachrichtigt weitere Empfänger', async () => {
  const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
  const weiter = vi.fn();
  const abmeldenFehler = beiMarkierungGeaendert(() => {
    throw 'Empfang gescheitert';
  });
  const abmeldenWeiter = beiMarkierungGeaendert(weiter);
  try {
    const fehler = await meldeMarkierungGeaendert(gesetzesreferenz({ kurztitel: 'BGB' }), 'test');
    expect(fehler).toEqual([expect.objectContaining({ message: 'Empfang gescheitert' })]);
    expect(fehler[0]).toBeInstanceOf(Error);
    expect(weiter).toHaveBeenCalledOnce();
  } finally {
    abmeldenFehler();
    abmeldenWeiter();
    protokoll.mockRestore();
  }
});
