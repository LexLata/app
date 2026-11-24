import { normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { describe, it, expect } from 'vitest';
import {
  baueEingeklappteMengenFuerZielstufe,
  ermittleZielFuerAnker,
  type StufenKollaps,
  type Stufe,
} from './klappstufenNavigation';
import type {
  DarstellungsElement,
  NormDarstellung,
  UeberschriftDarstellung,
} from '@/lib/domain/gesetzTypes';

function norm(id: string): DarstellungsElement {
  return {
    typ: 'norm',
    data: normaleNorm({ id, xmlId: id, bezeichnung: `§ ${id}`, absaetze: [] }) as NormDarstellung,
  };
}

function ueberschrift(id: string): DarstellungsElement {
  return {
    typ: 'ueberschrift',
    data: {
      id,
      xmlId: id,
      bezeichnung: `Titel ${id}`,
      ebene: 1,
      gliederungskennzahl: '000000',
    } as UeberschriftDarstellung,
  };
}

describe('baueEingeklappteMengenFuerZielstufe', () => {
  const alleStufen: Record<Stufe, StufenKollaps> = {
    1: { ueberschriften: new Set(), normen: new Set() },
    2: { ueberschriften: new Set(), normen: new Set(['n1', 'n2']) },
    3: { ueberschriften: new Set(['u1']), normen: new Set(['n1', 'n2']) },
    4: { ueberschriften: new Set(['u1', 'u2']), normen: new Set(['n1', 'n2']) },
  };

  it("'rechts': ersetzt den aktuellen Zustand blank durch den Soll-Zustand der Zielstufe", () => {
    const aktuell: StufenKollaps = {
      ueberschriften: new Set(['manuell-eingeklappt']),
      normen: new Set(),
    };
    const ergebnis = baueEingeklappteMengenFuerZielstufe('rechts', 3, alleStufen, aktuell);
    expect(ergebnis).toEqual({ ueberschriften: new Set(['u1']), normen: new Set(['n1', 'n2']) });
  });

  it("'links': vereinigt Soll-Zustand der Zielstufe MIT dem aktuellen Zustand, statt ihn zu ersetzen", () => {
    const aktuell: StufenKollaps = {
      ueberschriften: new Set(['manuell-eingeklappt']),
      normen: new Set(),
    };
    const ergebnis = baueEingeklappteMengenFuerZielstufe('links', 3, alleStufen, aktuell);
    expect(ergebnis).toEqual({
      ueberschriften: new Set(['manuell-eingeklappt', 'u1']),
      normen: new Set(['n1', 'n2']),
    });
  });

  it("'links': verändert die übergebenen aktuell-Sets nicht (liefert neue Set-Objekte)", () => {
    const aktuellUeberschriften = new Set(['manuell-eingeklappt']);
    const aktuell: StufenKollaps = { ueberschriften: aktuellUeberschriften, normen: new Set() };
    baueEingeklappteMengenFuerZielstufe('links', 3, alleStufen, aktuell);
    expect(aktuellUeberschriften).toEqual(new Set(['manuell-eingeklappt']));
  });
});

describe('ermittleZielFuerAnker', () => {
  // Baum: u1 (Überschrift) > n1, n2 ; u2 (Überschrift) > n3
  const elemente = [ueberschrift('u1'), norm('n1'), norm('n2'), ueberschrift('u2'), norm('n3')];
  const ueberschriftartigArr = [true, false, false, true, false];
  const elternIndizes: (number | null)[] = [null, 0, 0, null, 3];

  it('ankerElementAlt undefined (kein Anker, siehe ermittleAnker-Fallback): kein Ziel', () => {
    const ergebnis = ermittleZielFuerAnker(
      undefined,
      42,
      'rechts',
      elemente,
      new Set(),
      new Set(),
      ueberschriftartigArr,
      elternIndizes,
    );
    expect(ergebnis).toEqual({ zielId: null, zielOffset: 0 });
  });

  it('ankerElementAlt nicht mehr in volleListe enthalten (Edgecase): kein Ziel statt Absturz', () => {
    const geloeschterAnker = norm('geloescht');
    const ergebnis = ermittleZielFuerAnker(
      geloeschterAnker,
      42,
      'rechts',
      elemente,
      new Set(),
      new Set(),
      ueberschriftartigArr,
      elternIndizes,
    );
    expect(ergebnis).toEqual({ zielId: null, zielOffset: 0 });
  });

  it("'rechts': Ankerzeile bleibt unverändert Ziel, Offset wird übernommen (⌘→ verdeckt nie, siehe Dateikopf)", () => {
    const ergebnis = ermittleZielFuerAnker(
      norm('n1'),
      42,
      'rechts',
      elemente,
      new Set(['u1']), // wäre für 'rechts' ohnehin irrelevant, da nie auf Vorfahren umgebogen wird
      new Set(),
      ueberschriftartigArr,
      elternIndizes,
    );
    expect(ergebnis).toEqual({ zielId: 'n1', zielOffset: 42 });
  });

  it("'links', Anker bleibt im neuen Zustand sichtbar: Ziel + Offset bleiben die Ankerzeile selbst", () => {
    const ergebnis = ermittleZielFuerAnker(
      norm('n1'),
      42,
      'links',
      elemente,
      new Set(), // u1 NICHT eingeklappt -> n1 bleibt sichtbar
      new Set(),
      ueberschriftartigArr,
      elternIndizes,
    );
    expect(ergebnis).toEqual({ zielId: 'n1', zielOffset: 42 });
  });

  it("'links', Anker wird durch neues Einklappen verdeckt: biegt auf sichtbaren Vorfahren um, Offset auf 0 zurückgesetzt", () => {
    const ergebnis = ermittleZielFuerAnker(
      norm('n1'),
      42,
      'links',
      elemente,
      new Set(['u1']), // u1 (Elternüberschrift von n1) wird neu eingeklappt
      new Set(),
      ueberschriftartigArr,
      elternIndizes,
    );
    expect(ergebnis).toEqual({ zielId: 'u1', zielOffset: 0 });
  });
});
