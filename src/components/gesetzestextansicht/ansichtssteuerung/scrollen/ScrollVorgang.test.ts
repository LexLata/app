// @vitest-environment jsdom
// ScrollVorgang.test.ts
// Öffentlicher Lebensdauervertrag: Beginn, Ablösung, Abbruch und regulärer Abschluss.
import { expect, it } from 'vitest';
import { erstelleScrollLebensdauer } from './ScrollVorgang';

it('unterscheidet Ablösung und Abbruch vom regulären Abschluss ohne doppelte Endmeldungen', () => {
  const ereignisse: unknown[][] = [];
  const lebensdauer = erstelleScrollLebensdauer((...ereignis) => ereignisse.push(ereignis));
  const erster = lebensdauer.starten('resize');
  const zweiter = lebensdauer.starten('sprung');
  expect(erster.istGueltig()).toBe(false);
  zweiter.beenden();
  zweiter.beenden();
  lebensdauer.abbrechen();
  lebensdauer.starten('resize');
  lebensdauer.abbrechen();
  expect(ereignisse).toEqual([
    ['beginn', 1, 'resize', null],
    ['abbruch', 1, 'resize', 'abgeloest'],
    ['beginn', 2, 'sprung', null],
    ['ende', 2, 'sprung', 'abgeschlossen'],
    ['beginn', 3, 'resize', null],
    ['abbruch', 3, 'resize', 'abgebrochen'],
  ]);
});
