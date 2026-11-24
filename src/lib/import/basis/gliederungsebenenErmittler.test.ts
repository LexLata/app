// gliederungsebenenErmittler.test.ts
//
// Deckt zwei unabhängige Dinge ab:
// 1. ebeneAusGliederungskennzahl: reine Formel, geprüft beispielbasiert UND als
//    fast-check-Property (analog zum bestehenden Property-Test in
//    gesetzesXMLParser.property.test.ts, der dieselbe Formel indirekt über
//    parseGesetzesXML prüft – hier direkt gegen die exportierte Funktion, da
//    sie hier – anders als dort – ohnehin bereits öffentlich exportiert ist).
// 2. GliederungsebenenErmittler.ermittleEbene: beispielbasiert anhand der in den
//    Kommentaren der Produktionsdatei genannten Szenarien (Standard-Schema
//    "KAPITEL IV", "ERSTER TEIL"-Schema, römische vs. alphabetische
//    Vergleiche, Stack-Rollback bei gleichem Namen).

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import {
  ebeneAusGliederungskennzahl,
  GliederungsebenenErmittler,
} from './gliederungsebenenErmittler';

describe('ebeneAusGliederungskennzahl', () => {
  it.each([
    ['', 1],
    ['   ', 1],
    ['01', 1],
    ['010', 1],
    ['010010', 2],
    ['010010010', 3],
    ['0100100', 2], // unvollständige letzte Gruppe wird abgeschnitten (floor)
    ['  010  ', 1], // Whitespace wird vor der Längenberechnung getrimmt
  ])('ebeneAusGliederungskennzahl(%p) === %p', (gliederungskennzahl, erwartet) => {
    expect(ebeneAusGliederungskennzahl(gliederungskennzahl)).toBe(erwartet);
  });

  it('Property: entspricht für beliebige Eingaben max(1, floor(getrimmte Länge / 3))', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 30 }), (gliederungskennzahl) => {
        const erwartet = Math.max(1, Math.floor(gliederungskennzahl.trim().length / 3));
        expect(ebeneAusGliederungskennzahl(gliederungskennzahl)).toBe(erwartet);
      }),
    );
  });

  it('Property: liefert nie einen Wert < 1', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 30 }), (gliederungskennzahl) => {
        expect(ebeneAusGliederungskennzahl(gliederungskennzahl)).toBeGreaterThanOrEqual(1);
      }),
    );
  });
});

describe('GliederungsebenenErmittler.ermittleEbene', () => {
  let detector: GliederungsebenenErmittler;

  beforeEach(() => {
    detector = new GliederungsebenenErmittler();
  });

  it('erste Bezeichnung ergibt immer Ebene 1', () => {
    expect(detector.ermittleEbene('KAPITEL I')).toBe(1);
  });

  it('unterschiedliche Namen vertiefen die Ebene (KAPITEL -> Abschnitt)', () => {
    expect(detector.ermittleEbene('KAPITEL I')).toBe(1);
    expect(detector.ermittleEbene('Abschnitt I')).toBe(2);
  });

  it('gleicher Name mit gleicher/höherer Nummer bleibt auf derselben Ebene (kein neuer Stack-Eintrag)', () => {
    expect(detector.ermittleEbene('KAPITEL I')).toBe(1);
    expect(detector.ermittleEbene('KAPITEL II')).toBe(1);
    expect(detector.ermittleEbene('KAPITEL III')).toBe(1);
  });

  it('Stack-Rollback: gleicher Name wie ein ÄLTERER Stack-Eintrag entfernt die dazwischenliegenden tieferen Ebenen', () => {
    expect(detector.ermittleEbene('KAPITEL I')).toBe(1);
    expect(detector.ermittleEbene('Abschnitt I')).toBe(2);
    expect(detector.ermittleEbene('Unterabschnitt I')).toBe(3);
    // "KAPITEL II" findet "KAPITEL" wieder auf Index 0 -> Stack wird auf
    // Länge 1 zurückgerollt, "Abschnitt"/"Unterabschnitt" fallen weg.
    expect(detector.ermittleEbene('KAPITEL II')).toBe(1);
  });

  it('gleicher Name mit NIEDRIGERER Nummer vertieft die Ebene statt zurückzurollen', () => {
    expect(detector.ermittleEbene('KAPITEL III')).toBe(1);
    // "KAPITEL I" hat dieselbe Bezeichnung "KAPITEL", aber I < III -> neue
    // (tiefere) Ebene statt Rollback, siehe Kommentar in der Produktionsdatei.
    expect(detector.ermittleEbene('KAPITEL I')).toBe(2);
  });

  it('"ERSTER TEIL"-Schema (Ordnungswort vor Kategorie-Name) wird erkannt und numerisch (nicht alphabetisch) verglichen', () => {
    expect(detector.ermittleEbene('ERSTER TEIL')).toBe(1);
    // "ZWEITER" > "ERSTER" numerisch (2 > 1) -> gleiche Ebene, Rollback.
    // Rein alphabetisch (localeCompare) wäre "ZWEITER" < "ERSTER" (Z > E,
    // also größer – das stimmt hier zufällig auch, daher zusätzlich unten
    // ein Fall, der bei alphabetischem statt ordinalem Vergleich falsch läge.
    expect(detector.ermittleEbene('ZWEITER TEIL')).toBe(1);
    // "ZWÖLFTER" (12) alphabetisch VOR "ZWEITER" (2) einsortiert, numerisch
    // aber größer – nur der ordinale Vergleich behandelt das korrekt als
    // "gleiche Ebene" statt fälschlich als Vertiefung.
    expect(detector.ermittleEbene('ZWÖLFTER TEIL')).toBe(1);
  });

  it('römische Zahlen werden numerisch, nicht alphabetisch verglichen (XL=40 < L=50, trotz "X" > "L" alphabetisch)', () => {
    expect(detector.ermittleEbene('KAPITEL L')).toBe(1);
    // Bei rein alphabetischem Vergleich läge "XL" > "L" (führendes 'X' >
    // 'L'), die Funktion müsste dann fälschlich auf Ebene 1 bleiben. Da 40 <
    // 50, ist "XL" numerisch NIEDRIGER als "L" -> korrekt eine neue tiefere
    // Ebene.
    expect(detector.ermittleEbene('KAPITEL XL')).toBe(2);
  });

  it('Nummern ohne erkennbares Schema (weder Ordinalwort noch römisch) fallen auf alphabetischen Vergleich zurück', () => {
    expect(detector.ermittleEbene('Anlage A')).toBe(1);
    // "B" > "A" alphabetisch -> gleiche Ebene (kein bekanntes Schema für
    // "A"/"B" – weder Ordinalwort noch gültige römische Zahl).
    expect(detector.ermittleEbene('Anlage B')).toBe(1);
  });

  it('gemischte arabische Nummern (z.B. "§ 1", "§ 2") vergleichen numerisch über den führenden Ziffernteil', () => {
    expect(detector.ermittleEbene('Teil 9')).toBe(1);
    // "10" > "9" numerisch, obwohl "10" alphabetisch VOR "9" käme.
    expect(detector.ermittleEbene('Teil 10')).toBe(1);
  });

  it('reset() leert den Stack, nächste Bezeichnung startet wieder bei Ebene 1', () => {
    expect(detector.ermittleEbene('KAPITEL I')).toBe(1);
    expect(detector.ermittleEbene('Abschnitt I')).toBe(2);
    detector.reset();
    expect(detector.ermittleEbene('Irgendwas I')).toBe(1);
  });

  it('Bezeichnung ohne trennbare Nummer (ein einzelnes Wort) wird als eigener Name mit leerer Nummer behandelt', () => {
    expect(detector.ermittleEbene('Schlussvorschriften')).toBe(1);
    expect(detector.ermittleEbene('Übergangsvorschriften')).toBe(2);
  });
});

describe('GliederungsebenenErmittler.ermittleEbene – Property: aufsteigende arabische Nummerierung desselben Namens bleibt stets auf Ebene 1', () => {
  it('hält für beliebige streng aufsteigende Zahlenfolgen', () => {
    fc.assert(
      fc.property(
        fc
          .uniqueArray(fc.integer({ min: 1, max: 500 }), { minLength: 1, maxLength: 20 })
          .map((arr) => [...arr].sort((a, b) => a - b)),
        (zahlen) => {
          const d = new GliederungsebenenErmittler();
          for (const n of zahlen) {
            expect(d.ermittleEbene(`Teil ${n}`)).toBe(1);
          }
        },
      ),
    );
  });
});
