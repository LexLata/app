// roemischeZahlen.test.ts
//
// Tests für roemischeZahlen.ts (kolokiert, Vitest). Reine, dateizugriffsfreie
// Umwandlungslogik – deckt beide Richtungen (zahlZuRoemisch/roemischZuZahl),
// die dokumentierte Validierung über Rückumwandlung (roemischZuZahl gibt
// null bei syntaktisch gültigen, aber keine echte römische Zahl ergebenden
// Zeichenketten wie "IIII"/"VX" zurück) sowie die Subtraktionsregel-Grenzfälle
// (IC, IIX, VV, XCIX) ab. Genutzt sowohl von zitatParser.tokenizer.ts
// (Parsen) als auch von zitatFormatierung.ts (Formatieren) – hier bewusst
// isoliert von beiden Aufrufern getestet.

import { describe, it, expect } from 'vitest';
import { zahlZuRoemisch, roemischZuZahl } from './roemischeZahlen';

describe('zahlZuRoemisch', () => {
  it('bildet einfache Grundzahlen korrekt ab', () => {
    expect(zahlZuRoemisch(1)).toBe('I');
    expect(zahlZuRoemisch(5)).toBe('V');
    expect(zahlZuRoemisch(10)).toBe('X');
    expect(zahlZuRoemisch(50)).toBe('L');
    expect(zahlZuRoemisch(100)).toBe('C');
    expect(zahlZuRoemisch(500)).toBe('D');
    expect(zahlZuRoemisch(1000)).toBe('M');
  });

  it('wendet die Subtraktionsregel an allen vier Stellen an (4/9/40/90/400/900)', () => {
    expect(zahlZuRoemisch(4)).toBe('IV');
    expect(zahlZuRoemisch(9)).toBe('IX');
    expect(zahlZuRoemisch(40)).toBe('XL');
    expect(zahlZuRoemisch(90)).toBe('XC');
    expect(zahlZuRoemisch(400)).toBe('CD');
    expect(zahlZuRoemisch(900)).toBe('CM');
  });

  it('kombiniert additive und subtraktive Stellen für typische Absatz-/Jahreszahlen', () => {
    expect(zahlZuRoemisch(14)).toBe('XIV');
    expect(zahlZuRoemisch(19)).toBe('XIX');
    expect(zahlZuRoemisch(49)).toBe('XLIX');
    expect(zahlZuRoemisch(99)).toBe('XCIX');
    expect(zahlZuRoemisch(444)).toBe('CDXLIV');
    expect(zahlZuRoemisch(1994)).toBe('MCMXCIV');
    expect(zahlZuRoemisch(3999)).toBe('MMMCMXCIX');
  });

  it('EDGE CASE: 0 ergibt einen leeren String (kein eigenes römisches Zeichen für Null)', () => {
    expect(zahlZuRoemisch(0)).toBe('');
  });

  it('EDGE CASE: Zahlen über 3999 werden durch schlichte Wiederholung von "M" gebildet (keine obere Grenze/Überstreichungsnotation implementiert)', () => {
    expect(zahlZuRoemisch(4000)).toBe('MMMM');
    expect(zahlZuRoemisch(5000)).toBe('MMMMM');
  });
});

describe('roemischZuZahl', () => {
  it('wandelt einfache Grundzahlen korrekt zurück', () => {
    expect(roemischZuZahl('I')).toBe(1);
    expect(roemischZuZahl('V')).toBe(5);
    expect(roemischZuZahl('X')).toBe(10);
    expect(roemischZuZahl('L')).toBe(50);
    expect(roemischZuZahl('C')).toBe(100);
    expect(roemischZuZahl('D')).toBe(500);
    expect(roemischZuZahl('M')).toBe(1000);
  });

  it('wandelt Subtraktionsregel-Kombinationen korrekt zurück', () => {
    expect(roemischZuZahl('IV')).toBe(4);
    expect(roemischZuZahl('IX')).toBe(9);
    expect(roemischZuZahl('XL')).toBe(40);
    expect(roemischZuZahl('XC')).toBe(90);
    expect(roemischZuZahl('CD')).toBe(400);
    expect(roemischZuZahl('CM')).toBe(900);
  });

  it('wandelt zusammengesetzte typische Absatz-/Jahreszahlen korrekt zurück', () => {
    expect(roemischZuZahl('XIV')).toBe(14);
    expect(roemischZuZahl('XIX')).toBe(19);
    expect(roemischZuZahl('XCIX')).toBe(99);
    expect(roemischZuZahl('MCMXCIV')).toBe(1994);
    expect(roemischZuZahl('MMMCMXCIX')).toBe(3999);
  });

  it('EDGE CASE: "IIII" (vierfache Wiederholung von I statt Subtraktionsregel IV) ist KEINE gültige römische Zahl -> null', () => {
    expect(roemischZuZahl('IIII')).toBeNull();
  });

  it('EDGE CASE: "VX" (unzulässige Subtraktions-Kombination) -> null', () => {
    expect(roemischZuZahl('VX')).toBeNull();
  });

  it('EDGE CASE: "IC" (I darf nur von V oder X subtrahiert werden, nicht von C) -> null', () => {
    expect(roemischZuZahl('IC')).toBeNull();
  });

  it('EDGE CASE: "IIX" (zweifache Subtraktion vor derselben Stelle) -> null', () => {
    expect(roemischZuZahl('IIX')).toBeNull();
  });

  it('EDGE CASE: verdoppelte Subtraktionsbuchstaben ("VV", "LL", "DD" – V/L/D dürfen nie wiederholt werden) -> null', () => {
    expect(roemischZuZahl('VV')).toBeNull();
    expect(roemischZuZahl('LL')).toBeNull();
    expect(roemischZuZahl('DD')).toBeNull();
  });

  it('leerer String -> null (kein positives Ergebnis, Ergebnis bleibt 0)', () => {
    expect(roemischZuZahl('')).toBeNull();
  });

  it('String ohne gültige römische Ziffern -> null', () => {
    expect(roemischZuZahl('ABC')).toBeNull();
  });

  it('EDGE CASE: "MMMM" (vierfaches M) ist nach dieser Implementierung GÜLTIG, da M beliebig oft additiv wiederholt werden darf (keine Obergrenze bei 3999, siehe zahlZuRoemisch)', () => {
    // Anders als bei den anderen Ziffern (max. 3x Wiederholung laut
    // klassischer Regel) gibt es hier keine Wiederholungsgrenze für M, weil
    // roemischZuZahl ausschließlich über Rückumwandlungs-Gleichheit
    // validiert und zahlZuRoemisch(4000) ebenfalls "MMMM" liefert. Falls
    // eine harte Obergrenze (z.B. bei 3999, wie in der Absatz-Zitierpraxis
    // üblich) gewünscht ist, wäre das eine bewusste Erweiterung – bitte
    // Bescheid geben, falls das relevant ist.
    expect(roemischZuZahl('MMMM')).toBe(4000);
  });

  it('Rundreise (zahlZuRoemisch -> roemischZuZahl) liefert für alle getesteten Zahlen wieder die Ausgangszahl', () => {
    const zahlen = [1, 4, 9, 14, 19, 40, 49, 90, 99, 400, 444, 900, 944, 1000, 1994, 3999];
    for (const n of zahlen) {
      expect(roemischZuZahl(zahlZuRoemisch(n)), `Rundreise für ${n}`).toBe(n);
    }
  });
});
