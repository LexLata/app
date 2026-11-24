// einfuehrung.test.ts
// Prüft die Anzeige der Einführung über die öffentliche Modulgrenze.
import fc from 'fast-check';
import type { EinfuehrungsAktion } from './einfuehrung.index';
import { istErlaubt, inhaltsTeilaktion } from './einfuehrung.index';
import { expect, it } from 'vitest';
import {
  einfuehrungsschritt,
  GESAMT_EINFUEHRUNGSSCHRITTE,
  LETZTE_TEILAKTION,
} from './einfuehrung.index';

it('ordnet alle Teilaktionen fünf nie fallenden Einführungsschritten ohne Zahlensprünge zu', () => {
  const zahlen = Array.from({ length: LETZTE_TEILAKTION + 1 }, (_, i) => einfuehrungsschritt(i));
  expect(zahlen).toEqual([1, 2, 3, 3, 4, 5, 5, 5]);
  expect(zahlen[0]).toBe(1);
  expect(zahlen.at(-1)).toBe(5);
  expect(GESAMT_EINFUEHRUNGSSCHRITTE).toBe(5);
  expect(Math.max(...zahlen)).toBe(GESAMT_EINFUEHRUNGSSCHRITTE);
  let vorher = 1;
  for (const zahl of zahlen) {
    expect(zahl - vorher).toBeOneOf([0, 1]);
    vorher = zahl;
  }
});

// Erwartungen stammen aus der vereinbarten Erlaubt-Matrix, einschließlich Abschluss.
it('erlaubt jede Bedienaktion genau in den vereinbarten Teilaktionen', () => {
  const matrix: Record<EinfuehrungsAktion, readonly number[]> = {
    'oeffnen-overlay-zeigen': [0],
    'suche-navigieren': [1],
    'favorit-speichern': [2, 3],
    'lesezeichen-speichern': [4],
    'alles-zuklappen': [6],
    'alles-aufklappen': [7],
    'suche-schliessen': [],
    'suche-neuer-tab': [],
    'norm-wechseln': [2, 4, 5, 6, 7, 8],
    'ueberschrift-waehlen': [5, 6, 7, 8],
    'titel-ein-ausklappen': [5, 6, 7, 8],
    'favorit-aufrufen': [2, 4, 5, 6, 7, 8],
    'lesezeichen-aufrufen': [4, 5, 6, 7, 8],
    'verweis-aufrufen': [],
    'tab-leiste': [],
  };
  const aktionen = Object.keys(matrix).filter((name): name is EinfuehrungsAktion => name in matrix);
  for (const aktion of aktionen) {
    for (let teilaktion = 0; teilaktion <= 8; teilaktion++) {
      expect(istErlaubt(teilaktion, aktion), `${teilaktion}: ${aktion}`).toBe(
        matrix[aktion].includes(teilaktion),
      );
    }
  }
});
it('koppelt Normwechsel und Favoritenaufruf', () => {
  fc.assert(
    fc.property(fc.array(fc.integer({ min: 0, max: 8 }), { minLength: 1 }), (teilaktionen) => {
      for (const teilaktion of teilaktionen) {
        expect(istErlaubt(teilaktion, 'norm-wechseln')).toBe(
          istErlaubt(teilaktion, 'favorit-aufrufen'),
        );
        if (teilaktion === 3) expect(istErlaubt(teilaktion, 'norm-wechseln')).toBe(false);
      }
    }),
  );
});

it('zeigt bei vorhandenem Favorit den Entfernen-Inhalt nur für Favorit speichern', () => {
  for (let t = 0; t <= 8; t++) {
    expect(inhaltsTeilaktion(t, false)).toBe(t);
    expect(inhaltsTeilaktion(t, true)).toBe(t === 2 ? 3 : t);
  }
});
