import { normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { erstelleTestTextMessung } from '@/test/gesetz/testDarstellung';
import { describe, it, expect } from 'vitest';
import type { Virtualizer } from '@tanstack/react-virtual';
import {
  bestimmeSprungModus,
  berechneRestoreZiel,
  zielFuerModus,
  ermittleElementGrenzen,
} from './useGesetzSprung.helpers';
import { SCROLL_MARGIN, type HoehenKontext } from './virtualizer';
import type { DarstellungsElement, NormDarstellung } from '@/lib/domain/gesetzTypes';

// Tests laufen im 'node'-Environment (kein DOM, s. vitest.config.ts) – alle
// hier getesteten Funktionen sind reine Rechenfunktionen ohne DOM-Zugriff,
// der Virtualizer wird über ein minimales Fake-Objekt (nur die tatsächlich
// gelesenen Methoden getVirtualItems/getOffsetForIndex) simuliert.

const SCHRIFT = 15;

const kontextBasis: HoehenKontext = {
  eingeklappteUeberschriften: new Set(),
  eingeklappteNormen: new Set(),
  unterArtikelIds: new Set(),
  zeilenabstand: 1.6,
  messung: erstelleTestTextMessung(),
  inhaltEinzug: 12,
  satzNeuZeile: true,
  textAlign: 'left',
  hyphens: 'auto',
  lang: 'de',

  textSpalteBreite: 720,
};

function normEl(id: string, bezeichnung: string): DarstellungsElement {
  const data: NormDarstellung = normaleNorm({ id, xmlId: id, bezeichnung, absaetze: [] });
  return { typ: 'norm', data };
}

// Minimales Fake-Objekt: nur die von den getesteten Funktionen tatsächlich
// gelesenen Virtualizer-Methoden. `as unknown as` statt eines Partial-Casts,
// da der reale Virtualizer-Typ getVirtualItems als Funktion MIT eigener
// updateDeps-Methode erwartet – für die Tests hier irrelevant.
function fakeVirtualizer(overrides: {
  getVirtualItems?: () => readonly { index: number; start: number; size: number }[];
  getOffsetForIndex?: Virtualizer<HTMLDivElement, Element>['getOffsetForIndex'];
}): Virtualizer<HTMLDivElement, Element> {
  return {
    getVirtualItems: () => [],
    getOffsetForIndex: () => undefined,
    ...overrides,
  } as unknown as Virtualizer<HTMLDivElement, Element>;
}

describe('bestimmeSprungModus', () => {
  it('Sentinel leisteHoehe < 0 (Leiste noch nie gemessen): immer flush-oben, unabhängig von Position', () => {
    // Element wäre nach den übrigen Kriterien eigentlich "bereits sichtbar"
    // (oben/unten liegen komplett im clientHeight) – der Sentinel muss
    // trotzdem gewinnen (siehe Kommentar in bestimmeSprungModus).
    expect(bestimmeSprungModus(10, 50, 0, 800, -1)).toBe('flush-oben');
  });

  it('Element vollständig zwischen Leiste und Container-Unterkante sichtbar: kein-sprung', () => {
    // scrollTop=100, leisteHoehe=40 -> sichtbarOben=140, clientHeight=800 -> sichtbarUnten=900
    expect(bestimmeSprungModus(150, 300, 100, 800, 40)).toBe('kein-sprung');
  });

  it('Grenzfall exakt bündig (oben===sichtbarOben, unten===sichtbarUnten): noch kein-sprung (>=/<=)', () => {
    expect(bestimmeSprungModus(140, 900, 100, 800, 40)).toBe('kein-sprung');
  });

  it('weiter Sprung (Abstand >= clientHeight*WEITER_SPRUNG_FAKTOR): flush-oben, instant', () => {
    // clientHeight=800, WEITER_SPRUNG_FAKTOR=2 -> Schwelle 1600
    expect(bestimmeSprungModus(1700, 1750, 0, 800, 40)).toBe('flush-oben');
  });

  it('Grenzfall Abstand exakt an der weiter-Sprung-Schwelle: noch flush-oben (>=)', () => {
    expect(bestimmeSprungModus(1600, 1650, 0, 800, 40)).toBe('flush-oben');
  });

  it('naher Sprung, aber von der Leiste verdeckt (oben < sichtbarOben): flush-oben', () => {
    // scrollTop=100, leisteHoehe=40 -> sichtbarOben=140; Element beginnt bei 120 (< 140)
    expect(bestimmeSprungModus(120, 300, 100, 800, 40)).toBe('flush-oben');
  });

  it('naher Sprung, Element zu groß für verfügbaren Platz unterhalb der Leiste: flush-oben', () => {
    // clientHeight - leisteHoehe = 800 - 40 = 760; Elementhöhe hier 800 > 760
    expect(bestimmeSprungModus(200, 1000, 100, 800, 40)).toBe('flush-oben');
  });

  it('naher Sprung, passt unterhalb der Leiste, nicht bereits vollständig sichtbar: minimal', () => {
    // scrollTop=100, sichtbarUnten=900; Element unten=950 (> 900, also nicht "kein-sprung")
    expect(bestimmeSprungModus(300, 950, 100, 800, 40)).toBe('minimal');
  });
});

describe('zielFuerModus', () => {
  it("modus='minimal': unten - clientHeight, unabhängig von leisteHoehe", () => {
    expect(zielFuerModus('minimal', 100, 950, 800, 40)).toBe(950 - 800);
  });

  it("modus='minimal' mit Vorschau: Unterkante der nächsten Titelzeile an der Container-Unterkante", () => {
    expect(zielFuerModus('minimal', 100, 300, 800, 40, 340)).toBe(340 - 800);
  });

  it("modus='minimal': Vorschau passt nicht mehr unter die Leiste -> Unterkante der Norm", () => {
    // Platz 800 - 40 = 760; Norm 100..800 passt, mit Vorschau bis 870 nicht mehr.
    expect(zielFuerModus('minimal', 100, 800, 800, 40, 870)).toBe(800 - 800);
  });

  it("modus='minimal' ohne nächstes Element (null): Unterkante der Norm", () => {
    expect(zielFuerModus('minimal', 100, 300, 800, 40, null)).toBe(300 - 800);
  });

  it('beginnt bei flush-oben 8 px unter der Leiste', () => {
    expect(zielFuerModus('flush-oben', 500, 700, 800, 40)).toBe(500 - 40 - 8);
  });

  it("modus='flush-oben' mit Sentinel-leisteHoehe (-1): auf 0 geklemmt statt negativ einzufließen", () => {
    expect(zielFuerModus('flush-oben', 500, 700, 800, -1)).toBe(500 - 0 - 8);
  });
});

describe('ermittleElementGrenzen', () => {
  it('bereits gerendertes Element: nutzt reale virtualItem-Messung (start/size)', () => {
    const virtualizer = fakeVirtualizer({
      getVirtualItems: () => [{ index: 2, start: 500, size: 80 }],
    });
    const elemente = [normEl('n1', '§ 1'), normEl('n2', '§ 2'), normEl('n3', '§ 3')];
    const { oben, unten } = ermittleElementGrenzen(virtualizer, 2, elemente, SCHRIFT, kontextBasis);
    expect(oben).toBe(SCROLL_MARGIN + 500);
    expect(unten).toBe(SCROLL_MARGIN + 500 + 80);
  });

  it('nicht gerendert, aber getOffsetForIndex liefert einen Wert: nutzt diesen statt Schätzung', () => {
    const virtualizer = fakeVirtualizer({
      getOffsetForIndex: () => [1200, 'start'] as const,
    });
    const elemente = [normEl('n1', '§ 1'), normEl('n2', '§ 2')];
    const { oben, unten } = ermittleElementGrenzen(virtualizer, 1, elemente, SCHRIFT, kontextBasis);
    expect(oben).toBe(SCROLL_MARGIN + 1200);
    // unten fällt in diesem Zweig auf schaetzeHoehe(sichtbareElemente[index]) zurück,
    // nicht auf eine ggf. abweichende reale Höhe aus getOffsetForIndex.
    expect(unten).toBeGreaterThan(oben);
  });

  it('weder gerendert noch getOffsetForIndex verfügbar: fällt auf schaetzeScrollTop/-Hoehe zurück', () => {
    const virtualizer = fakeVirtualizer({});
    const elemente = [normEl('n1', '§ 1'), normEl('n2', '§ 2')];
    const { oben, unten } = ermittleElementGrenzen(virtualizer, 1, elemente, SCHRIFT, kontextBasis);
    // oben muss der geschätzten scrollTop für Index 1 entsprechen (> SCROLL_MARGIN,
    // da bereits ein Element davor eingerechnet ist).
    expect(oben).toBeGreaterThan(SCROLL_MARGIN);
    expect(unten).toBeGreaterThan(oben);
  });
});

it.each([
  [2, -10, 2030],
  [0, -40, 0],
  [2, 710, 2750],
])('Restoreziel erhält relativen Abstand mit Vorzeichen (%s, %s)', (index, offset, ziel) => {
  const ergebnis = berechneRestoreZiel(
    fakeVirtualizer({
      getOffsetForIndex: (i) => [i * 1000, 'start'],
    }),
    index,
    [],
    SCHRIFT,
    kontextBasis,
    offset,
  );
  expect(ergebnis).toBe(ziel);
});
