// localStorageJSON.test.ts
//
// Bisher gab es KEINE dedizierte Testdatei für diesen Helper – die Abdeckung
// kam nur zufällig über Konsumenten-Tests (aktivierungSpeicher.test.ts etc.)
// zustande, die localStorage stets nur mit gültigen, zum jeweiligen Guard
// passenden Werten befüllen. Dadurch überlebten 7 Mutanten (siehe
// Mutation-Testing-Analyse im Chatverlauf):
//   - ladeJSON, Zeile 15 (`if (!roh) return fallback`): mit dem hier
//     verwendeten permissiven Guard sichtbar, mit den bisherigen (null-
//     ablehnenden) Consumer-Guards zufällig maskiert.
//   - istRecord, Zeile 33: die Fälle null/Array/Primitive, die die drei
//     Teilbedingungen tatsächlich auseinanderziehen, kamen in keinem
//     Consumer-Testpfad vor (dort wird immer nur ein gültiges Objekt
//     gespeichert).
// Zusätzlich unentdeckt (Status "NoCoverage", nicht "Survived", aber
// derselbe Befund): der catch-Zweig in ladeJSON (kaputtes JSON) wurde bisher
// von keinem Test überhaupt erreicht.

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { ladeJSON, speichereJSON, istRecord, ohneObjectPrototype } from './localStorageJSON';

describe('ladeJSON', () => {
  // Kein globales localStorage in der Node-Testumgebung (siehe
  // setupNode.ts) – einfacher In-Memory-Mock genügt hier, analog zum
  // bestehenden Muster in aktivierungSpeicher.test.ts.
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

  it('lädt einen gespeicherten Wert zurück, wenn er den Guard erfüllt', () => {
    localStorage.setItem('k', JSON.stringify({ a: 1 }));
    expect(ladeJSON('k', {}, istRecord)).toEqual({ a: 1 });
  });

  it('liefert den Fallback, wenn der gespeicherte Wert den Guard nicht erfüllt', () => {
    localStorage.setItem('k', JSON.stringify([1, 2, 3]));
    expect(ladeJSON('k', { fallback: true }, istRecord)).toEqual({ fallback: true });
  });

  it('liefert den Fallback bei kaputtem JSON (catch-Zweig)', () => {
    localStorage.setItem('k', '{nicht valides json');
    expect(ladeJSON('k', 'FALLBACK', (w): w is string => typeof w === 'string')).toBe('FALLBACK');
  });

  it('liefert den Fallback bei fehlendem Key – auch mit einem Guard, der null akzeptieren würde', () => {
    // MUTATIONSTEST: deckt den `if (!roh) return fallback`-Kurzschluss ab
    // (Zeile 15). Mit einem null-ablehnenden Guard (wie istRecord) wäre das
    // Ergebnis zufällig identisch, da JSON.parse(null) klaglos zu `null`
    // parst und istGueltig(null) ohnehin false liefert. Mit einem
    // permissiven Guard wird der Unterschied sichtbar: ohne den
    // Kurzschluss würde `null` statt des Fallbacks zurückgegeben.
    const permissiverGuard = (_wert: unknown): _wert is unknown => true;
    expect(ladeJSON('fehlt', 'FALLBACK', permissiverGuard)).toBe('FALLBACK');
  });
});

describe('speichereJSON', () => {
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

  it('rundtrippt einen Wert über JSON.stringify/parse', () => {
    speichereJSON('k', { a: 1, b: [1, 2] });
    expect(JSON.parse(localStorage.getItem('k')!)).toEqual({ a: 1, b: [1, 2] });
  });
});

describe('Property: istRecord', () => {
  // Alles, was KEIN reines "Objekt-aber-kein-Array" ist, muss false liefern.
  // Deckt die Kombinatorik der drei &&-verknüpften Teilbedingungen ab
  // (Zeile 33), insbesondere null und Arrays, die vorher in keinem Testpfad
  // vorkamen.
  it('ist false für alles, was kein reines Objekt ist', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.array(fc.anything()),
          fc.constant(null),
          fc.constant(undefined),
          fc.string(),
          fc.integer(),
          fc.boolean(),
        ),
        (wert) => {
          expect(istRecord(wert)).toBe(false);
        },
      ),
    );
  });

  it('ist true für beliebige Plain Objects (Records)', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.anything()), (wert) => {
        expect(istRecord(wert)).toBe(true);
      }),
    );
  });
});

describe('ohneObjectPrototype', () => {
  it('übernimmt alle eigenen Properties des Eingabe-Objekts unverändert', () => {
    const kopie = ohneObjectPrototype({ a: 1, b: 2 });
    expect(kopie).toEqual({ a: 1, b: 2 });
  });

  it('hat KEIN Object.prototype in der Prototype-Kette', () => {
    const kopie = ohneObjectPrototype({ a: 1 });
    expect(Object.getPrototypeOf(kopie)).toBeNull();
  });

  it('REGRESSIONSTEST: eine Zuweisung auf den Schlüssel "__proto__" legt eine eigene Property an, statt das Prototype-Objekt zu ersetzen', () => {
    // Ohne ohneObjectPrototype würde `alle["__proto__"] = { x: 1 }` auf einem
    // normalen {} keine eigene Property anlegen, sondern (über den geerbten
    // __proto__-Setter) das Prototype-Objekt selbst ersetzen – die Daten
    // würden beim JSON.stringify (das nur eigene Properties serialisiert)
    // stillschweigend verloren gehen (siehe fensterSpeicher.ts/
    // aktivierungSpeicher.ts, deren ladeAlle() diesen Helper deshalb nutzt).
    // ACHTUNG beim Schreiben von Erwartungswerten hier: ein Objekt-LITERAL
    // "{ __proto__: … }" im Testcode selbst setzt ebenfalls das Prototype
    // statt einer eigenen Property (Spezialfall der Objekt-Literal-Syntax) –
    // deshalb wird unten bewusst NICHT gegen ein solches Literal verglichen,
    // sondern gegen Object.keys()/direkten Property-Zugriff.
    const alle = ohneObjectPrototype<{ x: number } | undefined>({});
    alle['__proto__'] = { x: 1 };

    expect(Object.keys(alle)).toContain('__proto__');
    expect(alle['__proto__']).toEqual({ x: 1 });

    const serialisiert = JSON.parse(JSON.stringify(alle));
    expect(Object.keys(serialisiert)).toEqual(['__proto__']);
    expect(serialisiert.__proto__).toEqual({ x: 1 });
  });

  it('Property: für beliebige Records bleibt JSON.stringify(ohneObjectPrototype(x)) inhaltlich identisch zu JSON.stringify(x)', () => {
    // Vergleich bewusst gegen JSON.parse(JSON.stringify(wert)), nicht direkt
    // gegen `wert`: JSON kennt kein negatives Null (JSON.stringify(-0) ===
    // "0"), daher würde ein direkter Vergleich bei von fc.jsonValue()
    // erzeugten -0-Werten fälschlich fehlschlagen (toEqual unterscheidet -0
    // von 0) - dieser Unterschied ist eine JSON-Eigenheit, keine Eigenschaft
    // von ohneObjectPrototype selbst.
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.jsonValue()), (wert) => {
        const erwartet = JSON.parse(JSON.stringify(wert));
        expect(JSON.parse(JSON.stringify(ohneObjectPrototype(wert)))).toEqual(erwartet);
      }),
    );
  });
});
