// textpfad.vergleich.test.ts
//
// Tests für textpfad.vergleich.ts (kolokiert, Vitest). Deckt
// vergleicheTextpfad() und pfadGleich() ab – beide rein, exportiert,
// DOM-frei. Bisher nur über 1-2 Happy-Path-Fälle im migrierten
// gesetzesXMLParser.eintragsKette.test.ts indirekt abgedeckt; hier
// umfassend inkl. aller Tie-Break-Stufen der zugrundeliegenden
// vergleicheEintraege()-Kette.
//
// Die GGT-Bildung ist über echte DOM-Auswahl in textpfad.auswahl.test.ts abgedeckt.

import { normtextPfad, bereichPfad } from '@/test/gesetz/textpfadFabrik';
import { describe, it, expect } from 'vitest';
import {
  vergleicheTextpfad,
  pfadGleich,
  textpfadSchluessel,
} from '@/lib/domain/textpfad/textpfad.vergleich';
import type { Textpfad } from '@/lib/domain/textpfad/textpfad';

describe('vergleicheTextpfad', () => {
  it('vergleicht absatz numerisch (nicht lexikografisch): "2" < "10"', () => {
    expect(
      vergleicheTextpfad(normtextPfad({ absatz: '2' }), normtextPfad({ absatz: '10' })),
    ).toBeLessThan(0);
  });

  it('bei gleichem absatz entscheidet unterabsatz', () => {
    expect(
      vergleicheTextpfad(
        normtextPfad({ absatz: '1', unterabsatz: '[1]' }),
        normtextPfad({ absatz: '1', unterabsatz: '[2]' }),
      ),
    ).toBeLessThan(0);
  });

  it('bei gleichem absatz/unterabsatz entscheidet satz', () => {
    expect(
      vergleicheTextpfad(
        normtextPfad({ absatz: '1', unterabsatz: '[1]', satz: 1 }),
        normtextPfad({ absatz: '1', unterabsatz: '[1]', satz: 2 }),
      ),
    ).toBeLessThan(0);
  });

  it('bei sonst gleichem Pfad entscheidet die Eintrags-Kette (vergleicheEintraege)', () => {
    expect(
      vergleicheTextpfad(
        normtextPfad({ absatz: '1', eintraege: [{ ebene: 'nummer', bezeichnung: '1' }] }),
        normtextPfad({ absatz: '1', eintraege: [{ ebene: 'nummer', bezeichnung: '2' }] }),
      ),
    ).toBeLessThan(0);
  });

  it('innerhalb der Eintrags-Kette entscheidet zuerst die ebene (alphabetisch: "litera" < "nummer")', () => {
    expect(
      vergleicheTextpfad(
        normtextPfad({ eintraege: [{ ebene: 'litera', bezeichnung: 'a' }] }),
        normtextPfad({ eintraege: [{ ebene: 'nummer', bezeichnung: 'a' }] }),
      ),
    ).toBeLessThan(0);
  });

  it('bei gleicher ebene entscheidet die bezeichnung (numerisch, "de"-Locale)', () => {
    expect(
      vergleicheTextpfad(
        normtextPfad({ eintraege: [{ ebene: 'nummer', bezeichnung: '2' }] }),
        normtextPfad({ eintraege: [{ ebene: 'nummer', bezeichnung: '10' }] }),
      ),
    ).toBeLessThan(0);
  });

  it('bei gleicher ebene+bezeichnung entscheidet wiederholung', () => {
    expect(
      vergleicheTextpfad(
        normtextPfad({ eintraege: [{ ebene: 'litera', bezeichnung: 'a', wiederholung: 0 }] }),
        normtextPfad({ eintraege: [{ ebene: 'litera', bezeichnung: 'a', wiederholung: 1 }] }),
      ),
    ).toBeLessThan(0);
  });

  it('bei identischem Präfix entscheidet die kürzere Kette (analog String-Präfix-Vergleich)', () => {
    expect(
      vergleicheTextpfad(
        normtextPfad({ eintraege: [{ ebene: 'nummer', bezeichnung: '1' }] }),
        normtextPfad({
          eintraege: [
            { ebene: 'nummer', bezeichnung: '1' },
            { ebene: 'litera', bezeichnung: 'a' },
          ],
        }),
      ),
    ).toBeLessThan(0);
  });

  it('bei sonst identischem Pfad (inkl. Eintrags-Kette) entscheidet zuletzt satzInEintrag', () => {
    expect(
      vergleicheTextpfad(
        normtextPfad({ eintraege: [{ ebene: 'nummer', bezeichnung: '1' }], satzInEintrag: 1 }),
        normtextPfad({ eintraege: [{ ebene: 'nummer', bezeichnung: '1' }], satzInEintrag: 2 }),
      ),
    ).toBeLessThan(0);
  });

  it('vollständig identische Pfade ergeben 0', () => {
    const pfad: Textpfad = normtextPfad({
      absatz: '1',
      unterabsatz: '[1]',
      satz: 2,
      eintraege: [{ ebene: 'nummer', bezeichnung: '1' }],
      satzInEintrag: 3,
    });
    expect(vergleicheTextpfad(pfad, { ...pfad })).toBe(0);
  });

  it('fehlende Felder gelten als 0 bzw. leerer String (kein Wurf/NaN bei komplett leeren Pfaden)', () => {
    expect(vergleicheTextpfad(normtextPfad({}), normtextPfad({}))).toBe(0);
  });
});

describe('pfadGleich', () => {
  it('zwei leere Pfade sind gleich', () => {
    expect(pfadGleich(normtextPfad({}), normtextPfad({}))).toBe(true);
  });

  it('undefined und ein explizit fehlendes Feld gelten als gleich (unnummerierter Absatz)', () => {
    expect(pfadGleich(normtextPfad({ absatz: undefined }), normtextPfad({}))).toBe(true);
  });

  it('unterschiedlicher absatz macht Pfade ungleich', () => {
    expect(pfadGleich(normtextPfad({ absatz: '1' }), normtextPfad({ absatz: '2' }))).toBe(false);
  });

  it('unterschiedliche Eintrags-Ketten (auch nur unterschiedliche wiederholung) machen Pfade ungleich', () => {
    expect(
      pfadGleich(
        normtextPfad({ eintraege: [{ ebene: 'litera', bezeichnung: 'a', wiederholung: 0 }] }),
        normtextPfad({ eintraege: [{ ebene: 'litera', bezeichnung: 'a', wiederholung: 1 }] }),
      ),
    ).toBe(false);
  });

  it('identische Eintrags-Ketten (inkl. wiederholung) sind gleich', () => {
    expect(
      pfadGleich(
        normtextPfad({ eintraege: [{ ebene: 'litera', bezeichnung: 'a', wiederholung: 1 }] }),
        normtextPfad({ eintraege: [{ ebene: 'litera', bezeichnung: 'a', wiederholung: 1 }] }),
      ),
    ).toBe(true);
  });

  it('die drei Bereiche sind verschieden vom Normtext und voneinander', () => {
    expect(pfadGleich(bereichPfad('amtlicherTitel'), bereichPfad('nichtamtlicherTitel'))).toBe(
      false,
    );
    expect(pfadGleich(bereichPfad('amtlicherTitel'), bereichPfad('bezeichnung'))).toBe(false);
    expect(pfadGleich(bereichPfad('nichtamtlicherTitel'), bereichPfad('bezeichnung'))).toBe(false);
    expect(pfadGleich(bereichPfad('amtlicherTitel'), normtextPfad({}))).toBe(false);
    expect(pfadGleich(bereichPfad('nichtamtlicherTitel'), normtextPfad({}))).toBe(false);
    expect(pfadGleich(bereichPfad('bezeichnung'), normtextPfad({ absatz: '1' }))).toBe(false);
  });

  it('unterschiedlicher unterabsatz/satz/satzInEintrag macht Pfade ungleich, gleicher macht sie gleich (bisher nur absatz als String getestet)', () => {
    expect(
      pfadGleich(normtextPfad({ unterabsatz: '[1]' }), normtextPfad({ unterabsatz: '[2]' })),
    ).toBe(false);
    expect(
      pfadGleich(normtextPfad({ unterabsatz: '[2]' }), normtextPfad({ unterabsatz: '[2]' })),
    ).toBe(true);
    expect(pfadGleich(normtextPfad({ satz: 1 }), normtextPfad({ satz: 2 }))).toBe(false);
    expect(pfadGleich(normtextPfad({ satz: 2 }), normtextPfad({ satz: 2 }))).toBe(true);
    expect(
      pfadGleich(
        normtextPfad({ eintraege: [{ ebene: 'nummer', bezeichnung: '1' }], satzInEintrag: 1 }),
        normtextPfad({ eintraege: [{ ebene: 'nummer', bezeichnung: '1' }], satzInEintrag: 2 }),
      ),
    ).toBe(false);
    expect(
      pfadGleich(
        normtextPfad({ eintraege: [{ ebene: 'nummer', bezeichnung: '1' }], satzInEintrag: 2 }),
        normtextPfad({ eintraege: [{ ebene: 'nummer', bezeichnung: '1' }], satzInEintrag: 2 }),
      ),
    ).toBe(true);
  });

  it('EDGE CASE: pfadGleich ist typneutral – unterschiedliche Markierungstypen fließen gar nicht in den Vergleich ein (Dokumentation des Funktionskommentars)', () => {
    // pfadGleich prüft NUR die Struktur des Textpfad selbst; ein eventueller
    // "typ" eines Markierungs-Eintrags ist kein Parameter dieser Funktion.
    const a: Textpfad = normtextPfad({ absatz: '1' });
    const b: Textpfad = normtextPfad({ absatz: '1' });
    expect(pfadGleich(a, b)).toBe(true);
  });
});

it.each(['satz', 'satzInEintrag'] as const)(
  'behandelt fehlenden %s bei Identität, Schlüssel und Reihenfolge wie Satz 1',
  (feld) => {
    const ohne = normtextPfad({
      absatz: '(1)',
      eintraege: [{ ebene: 'nummer', bezeichnung: '1' }],
    });
    const erster = normtextPfad({ ...ohne, [feld]: 1 });
    expect(pfadGleich(ohne, erster)).toBe(true);
    expect(textpfadSchluessel(ohne)).toBe(textpfadSchluessel(erster));
    expect(vergleicheTextpfad(ohne, erster)).toBe(0);
    expect(pfadGleich(ohne, normtextPfad({ ...ohne, [feld]: 2 }))).toBe(false);
  },
);
