// bezeichnungVergleich.test.ts
//
// Tests für bezeichnungVergleich.ts (kolokiert, Vitest). Reine, dateizugriffsfreie
// String-Logik – deckt sowohl den dokumentierten Grundfall (tokenweiser
// numerischer Vergleich, kürzer sortiert vor länger bei identischem Präfix)
// als auch Randfälle ab, die aus der konkreten Implementierung folgen
// (führende Nullen, Dezimalpunkte, negative Zahlen, Groß-/Kleinschreibung,
// Whitespace-Normalisierung).

import { describe, it, expect } from 'vitest';
import { vergleicheBezeichnung, sortiereBezeichnung } from './bezeichnungVergleich';

describe('vergleicheBezeichnung', () => {
  it('vergleicht einfache einteilige Zahlen numerisch (nicht lexikografisch)', () => {
    // Lexikografisch wäre "10" < "9" (String-Vergleich) – hier muss die
    // numerische Ordnung gelten.
    expect(vergleicheBezeichnung('9', '10')).toBeLessThan(0);
    expect(vergleicheBezeichnung('10', '9')).toBeGreaterThan(0);
  });

  it('deckt die dokumentierte Beispielkette aus dem Kopfkommentar ab', () => {
    const kette = ['1', '20', '241', '249 1', '249 3', '433'];
    for (let i = 0; i < kette.length - 1; i++) {
      expect(
        vergleicheBezeichnung(kette[i]!, kette[i + 1]!),
        `${kette[i]} < ${kette[i + 1]}`,
      ).toBeLessThan(0);
    }
  });

  it('gleiche Bezeichnung ergibt 0', () => {
    expect(vergleicheBezeichnung('433', '433')).toBe(0);
    expect(vergleicheBezeichnung('249 3', '249 3')).toBe(0);
  });

  it('kürzerer String mit identischem Präfix sortiert vor dem längeren ("249" vor "249 1")', () => {
    expect(vergleicheBezeichnung('249', '249 1')).toBeLessThan(0);
    expect(vergleicheBezeichnung('249 1', '249')).toBeGreaterThan(0);
  });

  it('vergleicht Mehr-Token-Bezeichnungen tokenweise, nicht als Ganzes', () => {
    expect(vergleicheBezeichnung('1 2', '1 10')).toBeLessThan(0); // Token 2: 2 < 10 numerisch
    expect(vergleicheBezeichnung('1 100', '2 1')).toBeLessThan(0); // Token 1 entscheidet zuerst: 1 < 2
  });

  it('nicht-numerische Tokens sortieren IMMER hinter numerischen (n=Infinity für NaN-Parse)', () => {
    expect(vergleicheBezeichnung('1', '1a')).toBeLessThan(0);
    expect(vergleicheBezeichnung('1a', '1')).toBeGreaterThan(0);
  });

  it('zwei nicht-numerische Tokens werden untereinander lexikografisch (deutsches Locale) verglichen', () => {
    expect(vergleicheBezeichnung('1a', '1b')).toBeLessThan(0);
  });

  it('EDGE CASE: führende Nullen ergeben numerische Gleichheit, Tiebreak über lexikografischen String-Vergleich ("007" vor "7")', () => {
    // parseInt("007", 10) === parseInt("7", 10) === 7 – die Strings selbst
    // unterscheiden sich aber, daher entscheidet localeCompare als
    // Tiebreak. "0" < "7" lexikografisch, daher "007" < "7".
    expect(vergleicheBezeichnung('007', '7')).toBeLessThan(0);
  });

  it('EDGE CASE: Dezimalpunkt wird von parseInt abgeschnitten (Nachkommastellen fließen NICHT in den numerischen Vergleich ein)', () => {
    // parseInt("1.5", 10) === 1 – numerisch also identisch mit "1", nur der
    // String-Tiebreak (localeCompare) unterscheidet sie noch.
    expect(vergleicheBezeichnung('1.5', '1')).toBeGreaterThan(0);
    expect(vergleicheBezeichnung('1.5', '2')).toBeLessThan(0);
  });

  it('negative Zahlen werden von parseInt korrekt erkannt und sortieren vor positiven', () => {
    expect(vergleicheBezeichnung('-1', '1')).toBeLessThan(0);
  });

  it('Groß-/Kleinschreibung ist NUR eine Tertiär-Stufe: sie entscheidet ausschließlich, wenn die Buchstabenfolge (case-insensitiv) über den gesamten Token identisch ist ("a" vor "A")', () => {
    // Dokumentiert das aktuelle Verhalten von String.localeCompare(..., 'de')
    // in dieser Laufzeitumgebung – falls für die Anzeige eine andere
    // Erwartung besteht (z.B. Case-Insensitivität), bitte kurz Bescheid
    // geben, das wäre eine bewusste Änderung an vergleicheBezeichnung.
    expect(vergleicheBezeichnung('a', 'A')).toBeLessThan(0);
    expect(vergleicheBezeichnung('ab', 'Ab')).toBeLessThan(0);
  });

  it('EDGE CASE: unterscheidet sich die Buchstabenfolge selbst (nicht nur die Schreibung), entscheidet DIESER Unterschied – nicht die Groß-/Kleinschreibung ("Ab" vor "aZ", obwohl "a" < "A" wäre)', () => {
    // "aZ" vs "Ab": der zweite Buchstabe (b < z, unabhängig von dessen
    // Schreibung) entscheidet bereits – die Groß-/Kleinschreibung des
    // ERSTEN Buchstabens ("a" vs "A") wird dabei gar nicht mehr relevant.
    // Das ist der zentrale Unterschied zum Test oben: dort ist die
    // Buchstabenfolge über den GESAMTEN Token identisch, hier nicht.
    expect(vergleicheBezeichnung('Ab', 'aZ')).toBeLessThan(0);
    expect(vergleicheBezeichnung('aZ', 'Ab')).toBeGreaterThan(0);
  });

  it('führende/nachgestellte sowie mehrfache Leerzeichen werden normalisiert (kein Unterschied im Ergebnis)', () => {
    expect(vergleicheBezeichnung('  249 3  ', '249 3')).toBe(0);
    expect(vergleicheBezeichnung('1  2', '1 2')).toBe(0);
  });

  it('leere Strings sind zueinander gleich', () => {
    expect(vergleicheBezeichnung('', '')).toBe(0);
    expect(vergleicheBezeichnung('   ', '')).toBe(0);
  });

  it('ist symmetrisch antikommutativ (vergleicheBezeichnung(a,b) === -vergleicheBezeichnung(b,a) im Vorzeichen)', () => {
    const paare: Array<[string, string]> = [
      ['1', '2'],
      ['249 1', '249 3'],
      ['1a', '1'],
      ['a', 'A'],
    ];
    for (const [a, b] of paare) {
      const vor = Math.sign(vergleicheBezeichnung(a, b));
      const zurueck = Math.sign(vergleicheBezeichnung(b, a));
      expect(vor, `${a} vs ${b}`).toBe(-zurueck);
    }
  });
});

describe('sortiereBezeichnung', () => {
  it('sortiert eine Liste numerisch aufsteigend gemäß vergleicheBezeichnung', () => {
    const eingabe = ['433', '249 3', '1', '249 1', '20', '241'];
    expect(sortiereBezeichnung(eingabe)).toEqual(['1', '20', '241', '249 1', '249 3', '433']);
  });

  it('mutiert die übergebene Liste NICHT (gibt ein neues Array zurück)', () => {
    const original = ['3', '1', '2'];
    const kopie = [...original];
    const sortiert = sortiereBezeichnung(original);
    expect(original).toEqual(kopie); // unverändert
    expect(sortiert).not.toBe(original); // eigenes Array
    expect(sortiert).toEqual(['1', '2', '3']);
  });

  it('leere Liste bleibt leer', () => {
    expect(sortiereBezeichnung([])).toEqual([]);
  });

  it('Liste mit einem Element bleibt unverändert', () => {
    expect(sortiereBezeichnung(['433'])).toEqual(['433']);
  });
});
