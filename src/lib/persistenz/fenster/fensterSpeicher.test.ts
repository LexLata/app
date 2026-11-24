// fensterSpeicher.test.ts
//
// Erste Testrunde für diesen Speicher. Nutzt localStorageJSON.ts direkt
// (kein Mock nötig, siehe dessen eigene Testdatei) mit einem In-Memory-
// localStorage-Mock, analog zum bestehenden Muster in
// aktivierungSpeicher.test.ts / localStorageJSON.test.ts.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';
import { fensterRestorePlanErstellen } from '@/lib/domain/app/fensterRestorePlan';
import {
  ladeFensterZustand,
  alleFensterLabels,
  speichereFensterZustand,
  entferneFensterZustand,
  uebernehmeFensterZustandNachMain,
} from './fensterSpeicher';
import type { GespeichertesFenster } from './fensterSpeicher';

beforeEach(() => {
  const speicher = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => speicher.get(key) ?? null,
    setItem: (key: string, wert: string) => void speicher.set(key, wert),
    removeItem: (key: string) => void speicher.delete(key),
    clear: () => speicher.clear(),
    key: (i: number) => Array.from(speicher.keys())[i] ?? null,
    get length() {
      return speicher.size;
    },
  } as Storage;
});

function zustand(overrides: Partial<GespeichertesFenster> = {}): GespeichertesFenster {
  return {
    tabs: [
      { gesetzesreferenz: gesetzesreferenz({ kurztitel: 'g1' }) },
      { gesetzesreferenz: gesetzesreferenz({ kurztitel: 'g2' }) },
      { gesetzesreferenz: gesetzesreferenz({ kurztitel: 'g3' }) },
    ],
    aktiverIndex: 0,
    ...overrides,
  };
}

describe('uebernehmeFensterZustandNachMain', () => {
  it('überträgt den validierten Zustand in einer Map-Schreiboperation und erhält fremde Rohwerte', () => {
    const geometrie = { breite: 810, hoehe: 610, x: -100, y: 40, maximiert: false };
    const fremd = { tabs: 'kaputt', weitereDaten: true };
    localStorage.setItem(
      'lexlata.fenster',
      JSON.stringify({
        main: zustand({ tabs: [] }),
        quelle: {
          tabs: [null, { gesetzesreferenz: gesetzesreferenz({ kurztitel: 'g2' }) }],
          aktiverIndex: 1,
          geometrie,
        },
        fremd,
        anderes: zustand(),
      }),
    );
    const schreiben = vi.spyOn(localStorage, 'setItem');
    uebernehmeFensterZustandNachMain('quelle');
    expect(schreiben).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('lexlata.fenster')!)).toEqual({
      main: {
        tabs: [{ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'g2' }) }],
        aktiverIndex: 0,
        geometrie,
      },
      fremd,
      anderes: zustand(),
    });
    const nachUebernahme = localStorage.getItem('lexlata.fenster');
    uebernehmeFensterZustandNachMain('quelle');
    uebernehmeFensterZustandNachMain('main');
    expect(localStorage.getItem('lexlata.fenster')).toBe(nachUebernahme);
    expect(schreiben).toHaveBeenCalledTimes(1);
  });

  it('meldet Schreibfehler und erhält die gesamte bisherige Map', () => {
    speichereFensterZustand('main', zustand({ tabs: [] }));
    speichereFensterZustand('quelle', zustand());
    const vorher = localStorage.getItem('lexlata.fenster');
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('voll');
    });
    expect(() => uebernehmeFensterZustandNachMain('quelle')).toThrow(
      'Fensterzustand konnte nicht übernommen werden',
    );
    expect(localStorage.getItem('lexlata.fenster')).toBe(vorher);
  });
});

// ---------------------------------------------------------------------------
// ladeFensterZustand / speichereFensterZustand
// ---------------------------------------------------------------------------

describe('ladeFensterZustand', () => {
  it('liefert null, wenn für das Label kein Zustand gespeichert ist', () => {
    expect(ladeFensterZustand('haupt')).toBeNull();
  });

  it('REGRESSIONSTEST: das Label "__proto__" wird wie jedes andere Label persistiert (Prototype-Pollution-Schutz)', () => {
    // Ohne den ohneObjectPrototype-Schutz in ladeAlle() würde
    // speichereFensterZustand('__proto__', z) auf dem internen {} keine
    // eigene Property anlegen, sondern das Prototype-Objekt ersetzen – der
    // Zustand ginge beim anschließenden JSON.stringify stillschweigend
    // verloren (siehe localStorageJSON.test.ts::ohneObjectPrototype).
    const z = zustand();
    speichereFensterZustand('__proto__', z);
    expect(ladeFensterZustand('__proto__')).toEqual(z);
  });

  it('liefert den zuvor gespeicherten Zustand eines Fensters zurück', () => {
    const z = zustand();
    speichereFensterZustand('haupt', z);
    expect(ladeFensterZustand('haupt')).toEqual(z);
  });

  it('behält die geometrie mit, wenn sie beim Speichern gesetzt war', () => {
    const z = zustand({ geometrie: { breite: 800, hoehe: 600, x: 0, y: 0, maximiert: false } });
    speichereFensterZustand('haupt', z);
    expect(ladeFensterZustand('haupt')?.geometrie).toEqual(z.geometrie);
  });
});

// ---------------------------------------------------------------------------
// speichereFensterZustand - mehrere Fenster
// ---------------------------------------------------------------------------

describe('speichereFensterZustand', () => {
  it('speichert mehrere Fenster nebeneinander, ohne sich gegenseitig zu überschreiben', () => {
    speichereFensterZustand('haupt', zustand({ aktiverIndex: 0 }));
    speichereFensterZustand('zweit', zustand({ aktiverIndex: 1 }));

    expect(ladeFensterZustand('haupt')?.aktiverIndex).toBe(0);
    expect(ladeFensterZustand('zweit')?.aktiverIndex).toBe(1);
  });

  it('überschreibt den Zustand eines Fensters bei erneutem Speichern unter demselben Label', () => {
    speichereFensterZustand('haupt', zustand({ aktiverIndex: 0 }));
    speichereFensterZustand('haupt', zustand({ aktiverIndex: 2 }));
    expect(ladeFensterZustand('haupt')?.aktiverIndex).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// alleFensterLabels
// ---------------------------------------------------------------------------

describe('alleFensterLabels', () => {
  it('liefert eine leere Liste, wenn keine Fenster gespeichert sind', () => {
    expect(alleFensterLabels()).toEqual([]);
  });

  it('liefert die Labels aller gespeicherten Fenster', () => {
    speichereFensterZustand('haupt', zustand());
    speichereFensterZustand('zweit', zustand());
    expect(alleFensterLabels().sort()).toEqual(['haupt', 'zweit']);
  });
});

// ---------------------------------------------------------------------------
// entferneFensterZustand
// ---------------------------------------------------------------------------

describe('entferneFensterZustand', () => {
  it('entfernt den Zustand des angegebenen Fensters', () => {
    speichereFensterZustand('haupt', zustand());
    entferneFensterZustand('haupt');
    expect(ladeFensterZustand('haupt')).toBeNull();
  });

  it('lässt andere Fenster beim Entfernen unangetastet', () => {
    speichereFensterZustand('haupt', zustand({ aktiverIndex: 0 }));
    speichereFensterZustand('zweit', zustand({ aktiverIndex: 1 }));
    entferneFensterZustand('haupt');
    expect(ladeFensterZustand('zweit')?.aktiverIndex).toBe(1);
  });

  it('MUTATIONSTEST: schreibt NICHT erneut in localStorage, wenn das Label gar nicht vorhanden ist (No-Op-Guard)', () => {
    speichereFensterZustand('haupt', zustand());
    const setItemSpy = vi.fn();
    const originalSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (...args: Parameters<Storage['setItem']>) => {
      setItemSpy();
      return originalSetItem(...args);
    };

    entferneFensterZustand('nicht-vorhanden');

    expect(setItemSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Property: speichern -> laden ist ein Round-Trip für beliebige Zustände
// ---------------------------------------------------------------------------

describe('Property: speichereFensterZustand/ladeFensterZustand Round-Trip', () => {
  it('lädt exakt den zuvor gespeicherten Zustand zurück, für beliebige Label/Tabs/Index-Kombinationen', () => {
    const zustandArb = fc
      .array(
        fc.record({
          gesetzesreferenz: fc
            .record({ kurztitel: fc.string({ minLength: 1 }) })
            .map(gesetzesreferenz),
        }),
        { maxLength: 15 },
      )
      .chain((tabs) =>
        fc.record({
          tabs: fc.constant(tabs),
          aktiverIndex: fc.integer({ min: -1, max: tabs.length - 1 }),
        }),
      );

    fc.assert(
      fc.property(fc.string({ minLength: 1 }), zustandArb, (label, z) => {
        speichereFensterZustand(label, z);
        expect(ladeFensterZustand(label)).toEqual(z);
      }),
    );
  });
});

describe('geprüfte Fensterdaten', () => {
  function roh(wert: unknown): void {
    localStorage.setItem('lexlata.fenster', JSON.stringify({ main: wert }));
  }
  it.each([
    null,
    {},
    { tabs: null },
    { tabs: [null, { gesetzesreferenz: gesetzesreferenz({ kurztitel: '' }) }] },
  ])('verwirft unbrauchbare Fensterdaten %j', (wert) => {
    roh(wert);
    expect(ladeFensterZustand('main')).toBeNull();
    expect(alleFensterLabels()).toEqual([]);
  });
  it.each([
    [2, 1],
    [1, 1],
    [-1, -1],
    ['kaputt', 0],
    [99, 1],
    [-2, 0],
    [0.5, 0],
  ])('ordnet Index %j nach dem Filtern zu', (index, erwartet) => {
    roh({
      tabs: [
        { gesetzesreferenz: gesetzesreferenz({ kurztitel: 'a' }) },
        null,
        { gesetzesreferenz: gesetzesreferenz({ kurztitel: 'b' }) },
      ],
      aktiverIndex: index,
    });
    const vorher = localStorage.getItem('lexlata.fenster');
    expect(ladeFensterZustand('main')).toEqual({
      tabs: [
        { gesetzesreferenz: gesetzesreferenz({ kurztitel: 'a' }) },
        { gesetzesreferenz: gesetzesreferenz({ kurztitel: 'b' }) },
      ],
      aktiverIndex: erwartet,
    });
    expect(localStorage.getItem('lexlata.fenster')).toBe(vorher);
  });
  it('erhält eine gültige leere Liste und ignoriert kaputte Geometrie', () => {
    roh({ tabs: [], aktiverIndex: 0, geometrie: { breite: -1 } });
    expect(ladeFensterZustand('main')).toEqual({ tabs: [], aktiverIndex: -1 });
  });
  it('erhält gültige Fenster samt negativer Geometrie und verändert fremde Rohwerte nicht', () => {
    const geometrie = { breite: 800, hoehe: 600, x: -800, y: -600, maximiert: false };
    const main = {
      tabs: [null, { gesetzesreferenz: gesetzesreferenz({ kurztitel: 'a' }) }],
      aktiverIndex: 1,
      geometrie,
    };
    const fremd = { tabs: 'beschädigt' };
    localStorage.setItem('lexlata.fenster', JSON.stringify({ main, fremd }));
    expect(alleFensterLabels()).toEqual(['main']);
    expect(ladeFensterZustand('main')).toEqual({
      tabs: [{ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'a' }) }],
      aktiverIndex: 0,
      geometrie,
    });
    speichereFensterZustand('zweit', zustand());
    expect(JSON.parse(localStorage.getItem('lexlata.fenster')!)).toMatchObject({ main, fremd });
  });
  it('liefert für beliebiges JSON ausschließlich wiederherstellbare Zustände', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.jsonValue(),
          fc.record({
            tabs: fc.array(
              fc.oneof(
                fc.jsonValue(),
                fc.record({
                  gesetzesreferenz: fc.record({ kurztitel: fc.string({ minLength: 1 }) }),
                }),
              ),
            ),
            aktiverIndex: fc.oneof(fc.jsonValue(), fc.integer({ min: -1, max: 20 })),
            geometrie: fc.jsonValue(),
          }),
        ),
        (wert) => {
          roh(wert);
          const geladen = ladeFensterZustand('main');
          if (geladen) {
            expect(
              geladen.tabs.every(
                (t) =>
                  typeof t.gesetzesreferenz.kurztitel === 'string' &&
                  t.gesetzesreferenz.kurztitel.length > 0,
              ),
            ).toBe(true);
            expect(Number.isInteger(geladen.aktiverIndex)).toBe(true);
            expect(geladen.aktiverIndex).toBeGreaterThanOrEqual(-1);
            expect(geladen.aktiverIndex).toBeLessThan(geladen.tabs.length);
          }
          expect(() =>
            fensterRestorePlanErstellen({
              fensterLabel: 'main',
              eigenerZustand: geladen,
              existenzFuerReferenz: () => 'fehlt',
              andereFensterZustaende: [{ label: 'zweit', zustand: geladen }],
              letzteFensterGeometrieFallback: undefined,
            }),
          ).not.toThrow();
        },
      ),
    );
  });
});

it.each([{ kurztitel: 'BGB', normgeber: 'de-bund' }, gesetzesreferenz({ kurztitel: 'BGB' })])(
  'speichert und lädt die Gesetzesreferenz %j unverändert',
  (gesetzesreferenz) => {
    const gespeichert = { tabs: [{ gesetzesreferenz }], aktiverIndex: 0 };
    speichereFensterZustand('referenzfenster', gespeichert);
    expect(ladeFensterZustand('referenzfenster')).toEqual(gespeichert);
  },
);

it('lädt einen Fensterzustand mit alter Überschrift-ID über den bisherigen Restore ohne Sprungziel', () => {
  const referenz = gesetzesreferenz({ kurztitel: 'BGB' });
  localStorage.setItem(
    'lexlata.fenster',
    JSON.stringify({
      main: {
        tabs: [{ gesetzesreferenz: referenz, initialNorm: '010', aktivesElementXmlId: '010' }],
        aktiverIndex: 0,
      },
    }),
  );
  const geladen = ladeFensterZustand('main');
  expect(geladen).toEqual({ tabs: [{ gesetzesreferenz: referenz }], aktiverIndex: 0 });
  const plan = fensterRestorePlanErstellen({
    fensterLabel: 'main',
    eigenerZustand: geladen,
    existenzFuerReferenz: () => 'vorhanden',
    andereFensterZustaende: [],
    letzteFensterGeometrieFallback: undefined,
  });
  expect(plan.wiederherzustellendeTabs).toEqual([{ gesetzesreferenz: referenz }]);
});
