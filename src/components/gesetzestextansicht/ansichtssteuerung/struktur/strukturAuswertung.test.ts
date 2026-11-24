// strukturAuswertung.test.ts
// Bestehende Sichtbarkeits- und Tabbezeichnungsfälle bei ihrem Strukturverantwortlichen.
import { normDarstellung } from '@/test/gesetz/gesetzFabriken';
import { describe, it, expect } from 'vitest';
import { berechneVisibleElemente, ermittleTabBezeichnung } from './strukturAuswertung';
import type {
  DarstellungsElement,
  NormDarstellung,
  UeberschriftDarstellung,
} from '@/lib/domain/gesetzTypes';

function norm(
  partial: Partial<NormDarstellung> & {
    id: string;
    bezeichnung: string;
    gliederungsEbene?: number;
  },
): DarstellungsElement {
  return {
    typ: 'norm',
    data: normDarstellung({
      xmlId: partial.id,
      absaetze: [],
      ...partial,
      ...(partial.gliederungsEbene !== undefined
        ? {
            art: 'gliederungsartikel',
            gliederungsEbene: partial.gliederungsEbene,
            ueberschriftartig: false,
          }
        : {}),
    }),
  };
}

function ueberschrift(
  partial: Partial<UeberschriftDarstellung> & { id: string; bezeichnung: string },
): DarstellungsElement {
  return {
    typ: 'ueberschrift',
    data: {
      xmlId: partial.id,
      ebene: 1,
      gliederungskennzahl: '000000',
      ...partial,
    },
  };
}

describe('ermittleTabBezeichnung', () => {
  it('behält den umfassenden Artikel über eine untergeordnete Überschrift hinweg', () => {
    const elemente = [
      norm({
        id: 'artikel',
        art: 'gliederungsartikel',
        gliederungsEbene: 1,
        bezeichnung: 'Art. 246a',
      }),
      ueberschrift({ id: 'unterhalb', ebene: 2, bezeichnung: 'Unterabschnitt' }),
      norm({ id: 'vier', bezeichnung: '§ 4' }),
    ];
    expect(ermittleTabBezeichnung(elemente, 2)).toBe('Art. 246a § 4');
    expect(ermittleTabBezeichnung(elemente, 1)).toBe('Unterabschnitt');
  });
  it('gibt undefined zurück, wenn der Index außerhalb der Liste liegt', () => {
    const elemente = [norm({ id: 'n1', bezeichnung: '§ 1' })];
    expect(ermittleTabBezeichnung(elemente, 5)).toBeUndefined();
  });

  it('gibt bei einer normalen Norm ohne vorangehenden Gliederungsartikel nur deren eigene Bezeichnung zurück', () => {
    const elemente = [
      norm({ id: 'n1', bezeichnung: '§ 1' }),
      norm({ id: 'n2', bezeichnung: '§ 2' }),
    ];
    expect(ermittleTabBezeichnung(elemente, 1)).toBe('§ 2');
  });

  it('kombiniert Gliederungsartikel + Norm-Bezeichnung, wenn ein Artikel vorangeht', () => {
    const elemente = [
      norm({
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        id: 'a1',
        bezeichnung: 'Art. 229',
        gliederungsEbene: 1,
      }),
      norm({ id: 'n1', bezeichnung: '§ 1' }),
      norm({ id: 'n2', bezeichnung: '§ 2' }),
    ];
    expect(ermittleTabBezeichnung(elemente, 2)).toBe('Art. 229 § 2');
  });

  it('bricht die Rückwärtssuche an einer Überschrift ab (keine Kombination über sie hinweg)', () => {
    const elemente = [
      norm({
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        id: 'a1',
        bezeichnung: 'Art. 229',
        gliederungsEbene: 1,
      }),
      ueberschrift({ id: 'u1', bezeichnung: 'Zweiter Teil' }),
      norm({ id: 'n1', bezeichnung: '§ 1' }),
    ];
    expect(ermittleTabBezeichnung(elemente, 2)).toBe('§ 1');
  });

  it('gibt die eigene Bezeichnung eines Gliederungsartikels selbst zurück (kein Rückwärtssuchen für Artikel)', () => {
    const elemente = [
      norm({
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        id: 'a1',
        bezeichnung: 'Art. 229',
        gliederungsEbene: 1,
      }),
      norm({
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        id: 'a2',
        bezeichnung: 'Art. 230',
        gliederungsEbene: 1,
      }),
    ];
    expect(ermittleTabBezeichnung(elemente, 1)).toBe('Art. 230');
  });

  it('gibt bei einer Überschrift deren eigene Bezeichnung zurück', () => {
    const elemente = [ueberschrift({ id: 'u1', bezeichnung: 'Erster Teil' })];
    expect(ermittleTabBezeichnung(elemente, 0)).toBe('Erster Teil');
  });
});

// data.id und data.xmlId sind über den norm()/ueberschrift()-Helper oben
// bewusst identisch (s. dortige Zuweisung) – berechneVisibleElemente prüft
// eingeklappteUeberschriften/-Normen gegen data.id, daher reicht hier die ID aus
// dem Helper-Aufruf.
function ids(elemente: DarstellungsElement[]): string[] {
  return elemente.map((el) => el.data.id);
}

describe('berechneVisibleElemente', () => {
  it('zeigt alle Elemente, wenn nichts eingeklappt ist', () => {
    const elemente = [
      ueberschrift({ id: 'u1', bezeichnung: 'Erster Teil', ebene: 1 }),
      norm({ id: 'n1', bezeichnung: '§ 1' }),
      norm({ id: 'n2', bezeichnung: '§ 2' }),
    ];
    expect(ids(berechneVisibleElemente(elemente, new Set(), new Set()))).toEqual([
      'u1',
      'n1',
      'n2',
    ]);
  });

  it('blendet Inhalte unter einer eingeklappten Überschrift aus, bis eine Überschrift gleicher/höherer Ebene folgt', () => {
    const elemente = [
      ueberschrift({ id: 'u1', bezeichnung: 'Erster Teil', ebene: 1 }),
      ueberschrift({ id: 'u1.1', bezeichnung: 'Kapitel 1', ebene: 2 }),
      norm({ id: 'n1', bezeichnung: '§ 1' }),
      ueberschrift({ id: 'u2', bezeichnung: 'Zweiter Teil', ebene: 1 }),
      norm({ id: 'n2', bezeichnung: '§ 2' }),
    ];
    const sichtbar = berechneVisibleElemente(elemente, new Set(['u1']), new Set());
    // u1 selbst bleibt sichtbar (die Überschrift, die eingeklappt wurde),
    // aber alles darunter (Kapitel 1, § 1) verschwindet bis zur nächsten
    // Überschrift der Ebene 1 (u2), die den Kollaps wieder beendet.
    expect(ids(sichtbar)).toEqual(['u1', 'u2', 'n2']);
  });

  it('eine Überschrift gleicher Ebene wie die eingeklappte bleibt selbst sichtbar (Geschwister)', () => {
    const elemente = [
      ueberschrift({ id: 'u1', bezeichnung: 'Kapitel 1', ebene: 2 }),
      norm({ id: 'n1', bezeichnung: '§ 1' }),
      ueberschrift({ id: 'u2', bezeichnung: 'Kapitel 2', ebene: 2 }),
      norm({ id: 'n2', bezeichnung: '§ 2' }),
    ];
    expect(ids(berechneVisibleElemente(elemente, new Set(['u1']), new Set()))).toEqual([
      'u1',
      'u2',
      'n2',
    ]);
  });

  it('blendet §§ unter einem eingeklappten Gliederungsartikel aus, bis der nächste Artikel/Überschrift folgt', () => {
    const elemente = [
      norm({
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        id: 'a1',
        bezeichnung: 'Art. 229',
        gliederungsEbene: 1,
      }),
      norm({ id: 'n1', bezeichnung: '§ 1' }),
      norm({ id: 'n2', bezeichnung: '§ 2' }),
      norm({
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        id: 'a2',
        bezeichnung: 'Art. 230',
        gliederungsEbene: 1,
      }),
      norm({ id: 'n3', bezeichnung: '§ 3' }),
    ];
    const sichtbar = berechneVisibleElemente(elemente, new Set(), new Set(['a1']));
    expect(ids(sichtbar)).toEqual(['a1', 'a2', 'n3']);
  });

  it('verschachtelte Artikel-Ebenen: Verlassen der tieferen Ebene beendet nur deren eigenen Kollaps', () => {
    const elemente = [
      norm({
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        id: 'a1',
        bezeichnung: 'Art. 1',
        gliederungsEbene: 1,
      }),
      norm({
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        id: 'a1a',
        bezeichnung: 'Art. 1a',
        gliederungsEbene: 2,
      }),
      norm({ id: 'n1', bezeichnung: '§ 1' }),
      norm({
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        id: 'a1b',
        bezeichnung: 'Art. 1b',
        gliederungsEbene: 2,
      }),
      norm({ id: 'n2', bezeichnung: '§ 2' }),
    ];
    // Nur die tiefere Ebene (Art. 1a) ist eingeklappt, Art. 1 selbst nicht.
    const sichtbar = berechneVisibleElemente(elemente, new Set(), new Set(['a1a']));
    expect(ids(sichtbar)).toEqual(['a1', 'a1a', 'a1b', 'n2']);
  });

  it('eine Überschrift beendet einen offenen Artikel-Kollaps gleicher/höherer Ebene (Stacks wirken gegenseitig)', () => {
    const elemente = [
      norm({
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        id: 'a1',
        bezeichnung: 'Art. 229',
        gliederungsEbene: 1,
      }),
      norm({ id: 'n1', bezeichnung: '§ 1' }),
      ueberschrift({ id: 'u1', bezeichnung: 'Zweiter Teil', ebene: 1 }),
      norm({ id: 'n2', bezeichnung: '§ 2' }),
    ];
    const sichtbar = berechneVisibleElemente(elemente, new Set(), new Set(['a1']));
    expect(ids(sichtbar)).toEqual(['a1', 'u1', 'n2']);
  });

  it('ein Gliederungsartikel beendet einen offenen Überschrift-Kollaps gleicher/höherer Ebene (Stacks wirken gegenseitig)', () => {
    const elemente = [
      ueberschrift({ id: 'u1', bezeichnung: 'Erster Teil', ebene: 1 }),
      norm({ id: 'n1', bezeichnung: '§ 1' }),
      norm({
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        id: 'a1',
        bezeichnung: 'Art. 229',
        gliederungsEbene: 1,
      }),
      norm({ id: 'n2', bezeichnung: '§ 2' }),
    ];
    const sichtbar = berechneVisibleElemente(elemente, new Set(['u1']), new Set());
    expect(ids(sichtbar)).toEqual(['u1', 'a1', 'n2']);
  });

  it('ein verschachtelter eingeklappter Artikel unter einer eingeklappten Überschrift bleibt ohne Wirkung, solange die Überschrift kollabiert bleibt', () => {
    const elemente = [
      ueberschrift({ id: 'u1', bezeichnung: 'Erster Teil', ebene: 1 }),
      norm({
        art: 'gliederungsartikel',
        ueberschriftartig: false,
        id: 'a1',
        bezeichnung: 'Art. 1',
        gliederungsEbene: 2,
      }),
      norm({ id: 'n1', bezeichnung: '§ 1' }),
      ueberschrift({ id: 'u2', bezeichnung: 'Zweiter Teil', ebene: 1 }),
      norm({ id: 'n2', bezeichnung: '§ 2' }),
    ];
    // a1 ist selbst auch "eingeklappt", aber das bleibt wirkungslos, weil
    // a1 wegen des Überschrift-Kollapses ohnehin nie sichtbar/verarbeitet wird.
    const sichtbar = berechneVisibleElemente(elemente, new Set(['u1']), new Set(['a1']));
    expect(ids(sichtbar)).toEqual(['u1', 'u2', 'n2']);
  });

  it('leere Elementliste ergibt leeres Ergebnis', () => {
    expect(berechneVisibleElemente([], new Set(), new Set())).toEqual([]);
  });
});
