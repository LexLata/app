// Prüft den gemeinsamen lokalen Speicher zuletzt angezeigter Gesetze.
import { assert, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { ladeAnzeigezeitpunkte, merkeAnzeige } from './zuletztAngezeigtSpeicher';

const a = gesetzesreferenz({ kurztitel: 'A' });
const b = gesetzesreferenz({ kurztitel: 'B' });
const schluessel = gesetzesreferenzSchluessel;
const speicherKey = 'lexlata.zuletztAngezeigt';
beforeEach(() => {
  const daten = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => daten.get(key) ?? null,
    setItem: vi.fn((key: string, wert: string) => daten.set(key, wert)),
    clear: () => daten.clear(),
  });
  vi.useFakeTimers();
  vi.setSystemTime(1000);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('lädt ohne Daten leer und speichert beide Gesetze mit dem zuletzt angezeigten zuerst', () => {
  expect(ladeAnzeigezeitpunkte().size).toBe(0);
  merkeAnzeige(a);
  vi.setSystemTime(2000);
  merkeAnzeige(b);
  expect(ladeAnzeigezeitpunkte()).toEqual(
    new Map([
      [schluessel(a), 1000],
      [schluessel(b), 2000],
    ]),
  );
  const inhalt = localStorage.getItem(speicherKey);
  assert(inhalt !== null);
  expect(JSON.parse(inhalt)).toEqual({
    [schluessel(a)]: 1000,
    [schluessel(b)]: 2000,
  });
  localStorage.clear();
  expect(ladeAnzeigezeitpunkte().size).toBe(0);
});
it.each([1000, 500])(
  'ordnet auch bei gleicher oder zurückgestellter Uhr (%s) das neue Gesetz zuletzt ein',
  (zeit) => {
    merkeAnzeige(a);
    vi.setSystemTime(zeit);
    merkeAnzeige(b);
    expect(ladeAnzeigezeitpunkte().get(schluessel(b))).toBe(1001);
  },
);
it('schreibt das bereits jüngste Gesetz auch bei fortgeschrittener Uhr nicht erneut', () => {
  merkeAnzeige(a);
  vi.mocked(localStorage.setItem).mockClear();
  vi.setSystemTime(3000);
  merkeAnzeige(a);
  expect(localStorage.setItem).not.toHaveBeenCalled();
  expect(ladeAnzeigezeitpunkte().get(schluessel(a))).toBe(1000);
});
it('behält nach 101 Anzeigen genau die jüngsten 100 Gesetze', () => {
  for (let i = 0; i < 101; i++) merkeAnzeige(gesetzesreferenz({ kurztitel: `G${i}` }));
  const zeitpunkte = ladeAnzeigezeitpunkte();
  expect(zeitpunkte.size).toBe(100);
  expect(zeitpunkte.has(schluessel(gesetzesreferenz({ kurztitel: 'G0' })))).toBe(false);
  expect(zeitpunkte.get(schluessel(gesetzesreferenz({ kurztitel: 'G100' })))).toBe(1100);
});
it.each(['kein JSON', 'null', '[]', '12', '"Text"'])(
  'ignoriert unbrauchbare gespeicherte Inhalte: %s',
  (inhalt) => {
    localStorage.setItem(speicherKey, inhalt);
    expect(ladeAnzeigezeitpunkte().size).toBe(0);
  },
);
it('ignoriert ungültige Schlüssel und Zeitpunkte und erhält gültige Einträge ohne Prototypänderung', () => {
  localStorage.setItem(speicherKey, `{"__proto__":123,"ungueltig":100,"x":0}`);
  expect(ladeAnzeigezeitpunkte().size).toBe(0);
  const daten = Object.fromEntries([
    [schluessel(a), 1000],
    ['__proto__', 123],
    ['ungueltig', 2000],
    ...[0, -1, null, '2000', true, {}, []].map((wert, i) => [
      schluessel(gesetzesreferenz({ kurztitel: `F${i}` })),
      wert,
    ]),
  ]);
  localStorage.setItem(speicherKey, JSON.stringify(daten));
  expect(ladeAnzeigezeitpunkte()).toEqual(new Map([[schluessel(a), 1000]]));
  localStorage.setItem(speicherKey, `{"[\\"de-bund\\",\\"unendlich\\"]":1e400}`);
  expect(ladeAnzeigezeitpunkte().size).toBe(0);
  const protoGesetz = gesetzesreferenz({ kurztitel: '__proto__' });
  merkeAnzeige(protoGesetz);
  expect(ladeAnzeigezeitpunkte().get(schluessel(protoGesetz))).toBe(1000);
  expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  expect(Object.prototype).not.toHaveProperty('polluted');
});
it('bleibt bei fehlendem localStorage folgenlos', () => {
  vi.stubGlobal('localStorage', undefined);
  expect(() => merkeAnzeige(a)).not.toThrow();
  expect(ladeAnzeigezeitpunkte().size).toBe(0);
});
it('erhält bei einem Schreibfehler den gültigen bisherigen Stand', () => {
  merkeAnzeige(a);
  vi.mocked(localStorage.setItem).mockImplementation(() => {
    throw new Error('Speicher voll');
  });
  expect(() => merkeAnzeige(b)).not.toThrow();
  expect(ladeAnzeigezeitpunkte()).toEqual(new Map([[schluessel(a), 1000]]));
});
it('liest Änderungen anderer Aufrufer bei jedem Laden frisch ein', () => {
  merkeAnzeige(a);
  const vorher = ladeAnzeigezeitpunkte();
  merkeAnzeige(b);
  expect(vorher.has(schluessel(b))).toBe(false);
  expect(ladeAnzeigezeitpunkte().get(schluessel(b))).toBe(1001);
});

it.each([2 ** 53, Number.MAX_VALUE])(
  'erhält bei extremen Zeitwerten (%s) Rangfolge und Gleichrangigkeit',
  (zeitpunkt) => {
    const c = gesetzesreferenz({ kurztitel: 'C' });
    const d = gesetzesreferenz({ kurztitel: 'D' });
    localStorage.setItem(
      speicherKey,
      JSON.stringify({
        [schluessel(a)]: 500,
        [schluessel(b)]: zeitpunkt,
        [schluessel(c)]: zeitpunkt,
      }),
    );
    merkeAnzeige(d);
    const werte = ladeAnzeigezeitpunkte();
    expect(werte.get(schluessel(b))).toBe(werte.get(schluessel(c)));
    expect(werte.get(schluessel(b))).toBeGreaterThan(werte.get(schluessel(a)) ?? 0);
    expect(werte.get(schluessel(d))).toBeGreaterThan(werte.get(schluessel(b)) ?? 0);
    merkeAnzeige(a);
    expect(ladeAnzeigezeitpunkte().get(schluessel(a))).toBeGreaterThan(
      werte.get(schluessel(d)) ?? 0,
    );
  },
);
