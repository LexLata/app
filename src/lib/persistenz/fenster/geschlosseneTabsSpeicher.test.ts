// geschlosseneTabsSpeicher.test.ts
//
// Erste Testrunde für diesen Speicher. Nutzt localStorageJSON.ts direkt (kein
// Mock nötig, siehe dessen eigene Testdatei) mit einem In-Memory-localStorage-
// Mock, analog zu fensterSpeicher.test.ts. menuAktivZustandStore.setzeAktiv
// wird gemockt (eigene, hier nicht zu testende Zuständigkeit – der native
// Rust-Push dahinter ist reiner Seiteneffekt, siehe dessen Kopfkommentar);
// geprüft wird hier nur, MIT WELCHEM Aktiv-Zustand dieser Speicher es
// aufruft, nicht was setzeAktiv selbst damit tut.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { describe, it, expect, beforeEach, vi, assert } from 'vitest';
import fc from 'fast-check';

const setzeAktivMock = vi.fn();
vi.mock('@/lib/plattform/menu/menu.index', () => ({
  setzeAktiv: (id: string, aktiv: boolean) => setzeAktivMock(id, aktiv),
}));

import {
  geschlossenenTabPushen,
  geschlossenenTabPoppen,
  geschlosseneTabsMenuStatusSynchronisieren,
} from './geschlosseneTabsSpeicher';
import type { GeschlossenerTab } from './geschlosseneTabsSpeicher';

// Rekonstruiert den historischen Feldnamen ausschließlich für Altformatproben.
const altesKennungsfeld = ['gesetz', 'Id'].join('');

// Muss zur privaten MAX_STAPEL_GROESSE in geschlosseneTabsSpeicher.ts passen
// (bewusst nicht exportiert, siehe dort - kein zweiter Anwendungsfall für
// einen Export, daher hier dupliziert statt die Produktionsdatei dafür zu
// ändern).
const MAX_STAPEL_GROESSE = 10;

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
  setzeAktivMock.mockClear();
});

function tab(overrides: Partial<GeschlossenerTab> = {}): GeschlossenerTab {
  return {
    gesetzesreferenz: gesetzesreferenz({ kurztitel: 'g1' }),
    verlauf: { eintraege: [], position: 0 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// geschlossenenTabPushen / geschlossenenTabPoppen
// ---------------------------------------------------------------------------

describe('geschlossenenTabPoppen', () => {
  it('liefert null, wenn der Stapel leer ist', () => {
    expect(geschlossenenTabPoppen()).toBeNull();
  });

  it('liefert den zuletzt gepushten Tab zurück (LIFO)', () => {
    geschlossenenTabPushen(tab({ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'g1' }) }));
    geschlossenenTabPushen(tab({ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'g2' }) }));

    expect(geschlossenenTabPoppen()?.gesetzesreferenz.kurztitel).toBe('g2');
    expect(geschlossenenTabPoppen()?.gesetzesreferenz.kurztitel).toBe('g1');
    expect(geschlossenenTabPoppen()).toBeNull();
  });

  it('entfernt den gepoppten Tab dauerhaft aus dem Stapel', () => {
    geschlossenenTabPushen(tab({ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'g1' }) }));
    geschlossenenTabPoppen();
    expect(geschlossenenTabPoppen()).toBeNull();
  });

  it('behält den verlauf des Tabs beim Round-Trip bei', () => {
    const t = tab({
      verlauf: {
        eintraege: [{ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'g1' }), xmlId: 'a1' }],
        position: 0,
      },
    });
    geschlossenenTabPushen(t);
    expect(geschlossenenTabPoppen()).toEqual(t);
  });

  it('MUTATIONSTEST: schreibt NICHT in localStorage, wenn beim Poppen nichts vorhanden ist (No-Op-Guard)', () => {
    const setItemSpy = vi.fn();
    const originalSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = (...args: Parameters<Storage['setItem']>) => {
      setItemSpy();
      return originalSetItem(...args);
    };

    expect(geschlossenenTabPoppen()).toBeNull();
    expect(setItemSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Kappungsgrenze (MAX_STAPEL_GROESSE)
// ---------------------------------------------------------------------------

describe('Kappungsgrenze', () => {
  it('verwirft beim Überschreiten der Kappungsgrenze die ältesten Einträge zuerst', () => {
    for (let i = 1; i <= MAX_STAPEL_GROESSE + 2; i++) {
      geschlossenenTabPushen(tab({ gesetzesreferenz: gesetzesreferenz({ kurztitel: `g${i}` }) }));
    }

    const gepoppt: string[] = [];
    let t: GeschlossenerTab | null;
    while ((t = geschlossenenTabPoppen()) !== null) gepoppt.push(t.gesetzesreferenz.kurztitel);

    // die zwei ältesten (g1, g2) wurden verworfen, der Rest bleibt in LIFO-Reihenfolge
    expect(gepoppt).toEqual(['g12', 'g11', 'g10', 'g9', 'g8', 'g7', 'g6', 'g5', 'g4', 'g3']);
  });

  it('der zuletzt gepushte Tab bleibt auch beim Überschreiten der Kappungsgrenze immer erhalten', () => {
    for (let i = 1; i <= MAX_STAPEL_GROESSE + 5; i++) {
      geschlossenenTabPushen(tab({ gesetzesreferenz: gesetzesreferenz({ kurztitel: `g${i}` }) }));
    }
    expect(geschlossenenTabPoppen()?.gesetzesreferenz.kurztitel).toBe(`g${MAX_STAPEL_GROESSE + 5}`);
  });
});

// ---------------------------------------------------------------------------
// menuStatusSynchronisieren (setzeAktiv-Aufrufe)
// ---------------------------------------------------------------------------

describe('Menüstatus-Synchronisierung', () => {
  it('aktiviert "letzter-tab", sobald der erste Tab gepusht wird', () => {
    geschlossenenTabPushen(tab());
    expect(setzeAktivMock).toHaveBeenLastCalledWith('letzter-tab', true);
  });

  it('deaktiviert "letzter-tab", sobald der letzte Tab gepoppt wird', () => {
    geschlossenenTabPushen(tab());
    setzeAktivMock.mockClear();
    geschlossenenTabPoppen();
    expect(setzeAktivMock).toHaveBeenLastCalledWith('letzter-tab', false);
  });

  it('hält "letzter-tab" aktiv, solange nach dem Poppen noch Einträge übrig sind', () => {
    geschlossenenTabPushen(tab({ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'g1' }) }));
    geschlossenenTabPushen(tab({ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'g2' }) }));
    setzeAktivMock.mockClear();
    geschlossenenTabPoppen();
    expect(setzeAktivMock).toHaveBeenLastCalledWith('letzter-tab', true);
  });

  describe('geschlosseneTabsMenuStatusSynchronisieren', () => {
    it('synchronisiert mit "false", wenn beim Mount noch nie ein Tab geschlossen wurde', () => {
      geschlosseneTabsMenuStatusSynchronisieren();
      expect(setzeAktivMock).toHaveBeenCalledWith('letzter-tab', false);
    });

    it('synchronisiert mit "true", wenn bereits Einträge im (persistierten) Stapel liegen', () => {
      geschlossenenTabPushen(tab());
      setzeAktivMock.mockClear();

      geschlosseneTabsMenuStatusSynchronisieren();

      expect(setzeAktivMock).toHaveBeenCalledWith('letzter-tab', true);
    });
  });
});

// ---------------------------------------------------------------------------
// Property: Push/Pop ist LIFO, begrenzt auf die letzten MAX_STAPEL_GROESSE Einträge
// ---------------------------------------------------------------------------

describe('Property: Push/Pop LIFO mit Kappung', () => {
  it('liefert beim Poppen exakt die letzten MAX_STAPEL_GROESSE gepushten Tabs in umgekehrter Reihenfolge zurück', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ minLength: 1 }), { maxLength: 30 }), (kurztitelListe) => {
        localStorage.removeItem('lexlata.geschlosseneTabs');

        for (const id of kurztitelListe) {
          geschlossenenTabPushen(tab({ gesetzesreferenz: gesetzesreferenz({ kurztitel: id }) }));
        }

        const erwartet = kurztitelListe.slice(-MAX_STAPEL_GROESSE).reverse();
        const tatsaechlich: string[] = [];
        let t: GeschlossenerTab | null;
        while ((t = geschlossenenTabPoppen()) !== null)
          tatsaechlich.push(t.gesetzesreferenz.kurztitel);

        expect(tatsaechlich).toEqual(erwartet);
      }),
    );
  });
});

it('filtert ungültige Tabs und synchronisiert ohne Bereinigung den echten Menüstatus', () => {
  const inhalt = JSON.stringify([null, {}, { [altesKennungsfeld]: '' }]);
  localStorage.setItem('lexlata.geschlosseneTabs', inhalt);
  geschlosseneTabsMenuStatusSynchronisieren();
  expect(setzeAktivMock).toHaveBeenLastCalledWith('letzter-tab', false);
  expect(localStorage.getItem('lexlata.geschlosseneTabs')).toBe(inhalt);
  expect(geschlossenenTabPoppen()).toBeNull();
  expect(localStorage.getItem('lexlata.geschlosseneTabs')).toBe(inhalt);
});
it.each([
  undefined,
  null,
  {},
  { eintraege: [null], position: 0 },
  { eintraege: [{ [altesKennungsfeld]: 'g', xmlId: '' }], position: 0 },
  { eintraege: [], position: 1 },
  { eintraege: [], position: -1 },
  { eintraege: [{ [altesKennungsfeld]: 'g', xmlId: 'a' }], position: 0.5 },
  { eintraege: [{ [altesKennungsfeld]: 'g', xmlId: 'a' }], position: 1 },
])('ersetzt kaputten Verlauf %j durch den vorhandenen leeren Verlauf', (verlauf) => {
  localStorage.setItem(
    'lexlata.geschlosseneTabs',
    JSON.stringify([
      null,
      { gesetzesreferenz: gesetzesreferenz({ kurztitel: 'g' }), verlauf },
      { [altesKennungsfeld]: 7 },
    ]),
  );
  geschlosseneTabsMenuStatusSynchronisieren();
  expect(setzeAktivMock).toHaveBeenLastCalledWith('letzter-tab', true);
  expect(geschlossenenTabPoppen()).toEqual(
    tab({ gesetzesreferenz: gesetzesreferenz({ kurztitel: 'g' }) }),
  );
});
it('liefert aus beliebigem JSON nur Tabs mit gültigem Verlauf', () => {
  fc.assert(
    fc.property(
      fc.oneof(
        fc.jsonValue(),
        fc.array(
          fc.oneof(
            fc.jsonValue(),
            fc.record({
              gesetzesreferenz: fc.record({
                kurztitel: fc.string({ minLength: 1 }),
                normgeber: fc.constantFrom(undefined, 'de-bund', 'de-bw'),
              }),
              verlauf: fc.jsonValue(),
            }),
          ),
        ),
      ),
      (wert) => {
        localStorage.setItem('lexlata.geschlosseneTabs', JSON.stringify(wert));
        const geladen = geschlossenenTabPoppen();
        if (!geladen) return;
        expect(typeof geladen.gesetzesreferenz.kurztitel).toBe('string');
        expect(geladen.gesetzesreferenz.kurztitel.length).toBeGreaterThan(0);
        expect(
          geladen.verlauf.eintraege.every(
            (e) =>
              typeof e.gesetzesreferenz.kurztitel === 'string' &&
              e.gesetzesreferenz.kurztitel.length > 0 &&
              typeof e.xmlId === 'string' &&
              e.xmlId.length > 0,
          ),
        ).toBe(true);
        expect(Number.isInteger(geladen.verlauf.position)).toBe(true);
        expect(geladen.verlauf.position).toBeGreaterThanOrEqual(0);
        expect(geladen.verlauf.position).toBeLessThan(
          Math.max(1, geladen.verlauf.eintraege.length),
        );
      },
    ),
  );
});

it('liest referenzbasierte Einträge verlustfrei ohne beim Lesen zu schreiben', () => {
  const vorher = JSON.stringify([
    {
      gesetzesreferenz: { kurztitel: 'A/B', normgeber: 'de-bund' },
      verlauf: {
        eintraege: [
          { gesetzesreferenz: gesetzesreferenz({ kurztitel: 'X' }), xmlId: 'p1' },
          { gesetzesreferenz: { kurztitel: 'X', normgeber: 'de-bw' }, xmlId: 'p2' },
        ],
        position: 1,
      },
    },
  ]);
  localStorage.setItem('lexlata.geschlosseneTabs', vorher);
  const schreiben = vi.spyOn(localStorage, 'setItem');
  geschlosseneTabsMenuStatusSynchronisieren();
  expect(schreiben).not.toHaveBeenCalled();
  expect(localStorage.getItem('lexlata.geschlosseneTabs')).toBe(vorher);
  expect(geschlossenenTabPoppen()).toEqual({
    gesetzesreferenz: { kurztitel: 'A/B', normgeber: 'de-bund' },
    verlauf: {
      eintraege: [
        { gesetzesreferenz: gesetzesreferenz({ kurztitel: 'X' }), xmlId: 'p1' },
        { gesetzesreferenz: { kurztitel: 'X', normgeber: 'de-bw' }, xmlId: 'p2' },
      ],
      position: 1,
    },
  });
});
it('schreibt ausschließlich Referenzen und erhält fehlende Gesetze', () => {
  const referenz = { kurztitel: 'Fehlt', normgeber: 'de-bw' };
  const gespeichert = {
    gesetzesreferenz: referenz,
    verlauf: { eintraege: [{ gesetzesreferenz: referenz, xmlId: 'p9' }], position: 0 },
  };
  geschlossenenTabPushen(gespeichert);
  expect(JSON.parse(localStorage.getItem('lexlata.geschlosseneTabs')!)).toEqual([gespeichert]);
  expect(geschlossenenTabPoppen()).toEqual(gespeichert);
});

it('erhält referenzbasierten Bestand beim regulären Schreiben und behält seinen Verlauf', () => {
  const alter = {
    gesetzesreferenz: { kurztitel: 'X', normgeber: 'de-bund' },
    verlauf: {
      eintraege: [
        { gesetzesreferenz: { kurztitel: 'X', normgeber: 'de-bw' }, xmlId: 'p2' },
        { gesetzesreferenz: { kurztitel: 'X', normgeber: 'de-bund' }, xmlId: 'p1' },
      ],
      position: 1,
    },
  };
  localStorage.setItem('lexlata.geschlosseneTabs', JSON.stringify([alter]));
  geschlossenenTabPushen(tab());
  const gespeichert = JSON.parse(localStorage.getItem('lexlata.geschlosseneTabs')!);
  expect(gespeichert[0]).toEqual({
    gesetzesreferenz: { kurztitel: 'X', normgeber: 'de-bund' },
    verlauf: {
      eintraege: [
        { gesetzesreferenz: { kurztitel: 'X', normgeber: 'de-bw' }, xmlId: 'p2' },
        { gesetzesreferenz: { kurztitel: 'X', normgeber: 'de-bund' }, xmlId: 'p1' },
      ],
      position: 1,
    },
  });
  expect(JSON.stringify(gespeichert)).not.toContain(altesKennungsfeld);
});
it.each([
  { [altesKennungsfeld]: 'keineDateibasis' },
  { gesetzesreferenz: gesetzesreferenz({ kurztitel: '' }) },
  {
    gesetzesreferenz: { kurztitel: 'X' },
    [altesKennungsfeld]: 'X_de-bund',
  },
  { gesetzesreferenz: { kurztitel: 'X', normgeber: 7 } },
])('verwirft ungültige Referenz %j ohne Heuristik und Schreibzugriff', (ungueltig) => {
  const vorher = JSON.stringify([{ ...ungueltig, verlauf: { eintraege: [], position: 0 } }]);
  localStorage.setItem('lexlata.geschlosseneTabs', vorher);
  geschlosseneTabsMenuStatusSynchronisieren();
  expect(setzeAktivMock).toHaveBeenLastCalledWith('letzter-tab', false);
  expect(geschlossenenTabPoppen()).toBeNull();
  expect(localStorage.getItem('lexlata.geschlosseneTabs')).toBe(vorher);
});

it('speichert weder aktive Stelle noch Rückkehrmarke', () => {
  const eintrag = { gesetzesreferenz: gesetzesreferenz({ kurztitel: 'g1' }), xmlId: 'p1' };
  geschlossenenTabPushen(
    tab({
      verlauf: {
        eintraege: [eintrag],
        position: 0,
        aktivesElement: eintrag,
        rueckkehrmarke: { eintrag, position: 0 },
      },
    }),
  );
  const gespeichert = localStorage.getItem('lexlata.geschlosseneTabs');
  assert(gespeichert);
  expect(JSON.parse(gespeichert)[0].verlauf).toEqual({
    eintraege: [eintrag],
    position: 0,
  });
});

it('kürzt geladene Verläufe auf die neuesten 100 und begrenzt den Zeiger', () => {
  const eintraege = Array.from({ length: 105 }, (_, i) => ({
    gesetzesreferenz: gesetzesreferenz({ kurztitel: 'g1' }),
    xmlId: String(i),
  }));
  const erster = eintraege[0];
  assert(erster);
  localStorage.setItem(
    'lexlata.geschlosseneTabs',
    JSON.stringify([
      tab({
        verlauf: {
          eintraege,
          position: 104,
          aktivesElement: eintraege[0],
          rueckkehrmarke: { eintrag: erster, position: 0 },
        },
      }),
    ]),
  );
  expect(geschlossenenTabPoppen()?.verlauf).toEqual({
    eintraege: eintraege.slice(0, 100),
    position: 99,
  });
});
