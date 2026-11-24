// Prüft Rückgabewerte, Fehlerweitergabe und die Entwicklungs-Ausgabe der Messhelfer.

import { describe, expect, it, vi } from 'vitest';
import { beginneMessabschnitte, messeAsync, messeSync, messeMitHauptfaden } from './perfMessung';

describe('Performance-Messung', () => {
  it('reicht synchrone Werte und Details durch und schreibt die Dauer', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      expect(
        messeSync(
          'beispiel',
          () => 3,
          (wert) => `${wert} Einträge`,
        ),
      ).toBe(3);
      expect(info).toHaveBeenCalledWith(
        expect.stringMatching(/^\[perf\] beispiel: .* ms \(3 Einträge\)$/),
      );
    } finally {
      info.mockRestore();
    }
  });

  it('gibt auch bei synchronen Fehlern die Dauer aus und wirft denselben Fehler', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const fehler = new Error('kaputt');
    try {
      expect(() =>
        messeSync('fehler', () => {
          throw fehler;
        }),
      ).toThrow(fehler);
      expect(info).toHaveBeenCalledWith(expect.stringMatching(/^\[perf\] fehler: .* ms$/));
    } finally {
      info.mockRestore();
    }
  });

  it('wartet auf asynchrone Ergebnisse und meldet deren Dauer', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      await expect(messeAsync('async', async () => 7)).resolves.toBe(7);
      expect(info).toHaveBeenCalledWith(expect.stringMatching(/^\[perf\] async: .* ms$/));
    } finally {
      info.mockRestore();
    }
  });
});

it('trennt Messabschnitte ohne den Ablauf zu verzögern', () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  const zeit = vi.spyOn(performance, 'now');
  zeit.mockReturnValueOnce(10).mockReturnValueOnce(25).mockReturnValueOnce(31);
  try {
    const abschnitt = beginneMessabschnitte('Restore');
    abschnitt('Lesen');
    abschnitt('Tabs');
    expect(info.mock.calls).toEqual([
      ['[perf] Restore: Lesen: 15.0 ms'],
      ['[perf] Restore: Tabs: 6.0 ms'],
    ]);
  } finally {
    info.mockRestore();
    zeit.mockRestore();
  }
});

it('kennzeichnet fehlende Hauptfadenmessung und erhält das Ergebnis', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.stubGlobal('PerformanceObserver', undefined);
  try {
    await expect(messeMitHauptfaden('Start', async () => 9)).resolves.toBe(9);
    expect(info).toHaveBeenCalledWith(
      '[perf] Hauptfaden Start: Long-Task-API nicht verfügbar; WebView-Profil nötig',
    );
  } finally {
    info.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('meldet die längste erfasste Aufgabe und erhält denselben Fehler', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  const trennen = vi.fn();
  vi.stubGlobal(
    'PerformanceObserver',
    class {
      static supportedEntryTypes = ['longtask'];
      observe() {}
      takeRecords() {
        return [{ duration: 60 }, { duration: 91 }, { duration: 55 }];
      }
      disconnect = trennen;
    },
  );
  const fehler = new Error('unverändert');
  try {
    await expect(
      messeMitHauptfaden('Start', async () => {
        throw fehler;
      }),
    ).rejects.toBe(fehler);
    expect(info).toHaveBeenCalledWith(
      '[perf] Hauptfaden Start: längste erfasste Aufgabe ab 50 ms: 91.0 ms',
    );
    expect(trennen).toHaveBeenCalledOnce();
  } finally {
    info.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('führt den Ablauf auch bei gescheiterter Hauptfadenbeobachtung unverändert aus', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.stubGlobal(
    'PerformanceObserver',
    class {
      static supportedEntryTypes = ['longtask'];
      observe() {
        throw new Error('WebView unterstützt Beobachtung nicht');
      }
      disconnect() {}
    },
  );
  try {
    await expect(messeMitHauptfaden('Start', async () => 42)).resolves.toBe(42);
  } finally {
    info.mockRestore();
    vi.unstubAllGlobals();
  }
});

it.each(['synchron', 'asynchron'])(
  'rechnet Detailberechnung nicht in die ausgewiesene Funktionsdauer ein: %s',
  async (modus) => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    let jetzt = 10;
    const zeit = vi.spyOn(performance, 'now').mockImplementation(() => jetzt);
    const ablauf = () => {
      jetzt = 25;
      return 9;
    };
    const detail = (wert: number) => {
      jetzt = 125;
      return `${wert} Einträge`;
    };
    try {
      const ergebnis =
        modus === 'synchron'
          ? messeSync('Funktionsdauer', ablauf, detail)
          : await messeAsync('Funktionsdauer', async () => ablauf(), detail);
      expect(ergebnis).toBe(9);
      expect(info).toHaveBeenCalledWith('[perf] Funktionsdauer: 15.0 ms (9 Einträge)');
    } finally {
      info.mockRestore();
      zeit.mockRestore();
    }
  },
);

it.each([true, false])(
  'misst Ereignisspannen nur im Entwicklungsbetrieb: %s',
  async (entwicklung) => {
    vi.stubEnv('DEV', entwicklung);
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const zeit = vi.spyOn(performance, 'now').mockReturnValue(10);
    try {
      const { beginneMessspanne } = await import('./perfMessung');
      const ende = beginneMessspanne('Ereignis');
      zeit.mockReturnValue(35);
      ende(() => {
        zeit.mockReturnValue(1000);
        return 'fertig';
      });
      ende('doppelt');
      expect(info.mock.calls).toEqual(entwicklung ? [['[perf] Ereignis: 25.0 ms (fertig)']] : []);
      if (!entwicklung) expect(zeit).not.toHaveBeenCalled();
    } finally {
      info.mockRestore();
      zeit.mockRestore();
      vi.unstubAllEnvs();
    }
  },
);

it('beendet den Tabwechsel erst nach zwei Bildern und meldet den größten Bildabstand', async () => {
  const { starteTabwechselMessung, messeSichtbareDarstellung, messeAufruf } =
    await import('./perfMessung');
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  let jetzt = 0;
  const zeit = vi.spyOn(performance, 'now').mockImplementation(() => jetzt);
  const bilder = new Map<number, FrameRequestCallback>();
  let nummer = 0;
  vi.stubGlobal('requestAnimationFrame', (fn: FrameRequestCallback) => {
    bilder.set(++nummer, fn);
    return nummer;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => bilder.delete(id));
  const bild = (zeitpunkt: number) => {
    jetzt = zeitpunkt;
    const wartend = [...bilder.values()];
    bilder.clear();
    wartend.forEach((fn) => fn(zeitpunkt));
  };
  try {
    starteTabwechselMessung();
    expect(
      messeAufruf('Struktur', () => {
        jetzt = 5;
        return 7;
      }),
    ).toBe(7);
    messeSichtbareDarstellung(() => 'Gesetz');
    bild(20);
    expect(info).not.toHaveBeenCalled();
    bild(50);
    expect(info.mock.calls).toEqual([
      ['[perf] Tabwechsel gesamt: 50.0 ms (Gesetz; größter Bildabstand 30.0 ms)'],
      ['[perf] Struktur: 5.0 ms; 1 Aufrufe'],
    ]);
    expect(bilder.size).toBe(0);
  } finally {
    info.mockRestore();
    zeit.mockRestore();
    vi.unstubAllGlobals();
  }
});

it('führt alle Messhelfer im Produktionszweig ohne Ausgabe, Zeitabfrage oder Bildbeobachtung aus', async () => {
  vi.stubEnv('DEV', false);
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  const zeit = vi.spyOn(performance, 'now');
  const bild = vi.fn();
  vi.stubGlobal('requestAnimationFrame', bild);
  const detail = vi.fn(() => 'Detail');
  try {
    const { messeAufruf, starteTabwechselMessung, messeSichtbareDarstellung } =
      await import('./perfMessung');
    expect(messeSync('Sync', () => 3, detail)).toBe(3);
    await expect(messeAsync('Async', async () => 4, detail)).resolves.toBe(4);
    await expect(messeMitHauptfaden('Hauptfaden', async () => 5)).resolves.toBe(5);
    beginneMessabschnitte('Abschnitt')('Ende');
    expect(messeAufruf('Aufruf', () => 6)).toBe(6);
    starteTabwechselMessung();
    messeSichtbareDarstellung(detail)();
    expect(info).not.toHaveBeenCalled();
    expect(zeit).not.toHaveBeenCalled();
    expect(bild).not.toHaveBeenCalled();
    expect(detail).not.toHaveBeenCalled();
  } finally {
    info.mockRestore();
    zeit.mockRestore();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
});
