// Gesetzestextansicht.layout.test.ts
// Bestehende Prüffälle für gemeinsam verwendete Überschriftabstände.
import { describe, it, expect } from 'vitest';
import {
  ermittleUeberschriftTopPad,
  ermittleUeberschriftPaddingBottom,
} from './Gesetzestextansicht.layout';
describe('ermittleUeberschriftTopPad', () => {
  it('untergeordnete Überschrift: immer 16 (bei schriftFaktor=1), unabhängig von Ebene', () => {
    expect(
      ermittleUeberschriftTopPad({
        ebene: 1,
        istUntergeordnet: true,
        schriftFaktor: 1,
      }),
    ).toBe(16);
    expect(
      ermittleUeberschriftTopPad({
        ebene: 3,
        istUntergeordnet: true,
        schriftFaktor: 1,
      }),
    ).toBe(16);
  });

  it.each([
    [1, 44],
    [2, 32],
    [3, 24],
    [4, 18],
  ])('Ebene %i aufgeklappt (schriftFaktor=1): %ipx', (ebene, erwartet) => {
    expect(
      ermittleUeberschriftTopPad({
        ebene,
        istUntergeordnet: false,
        schriftFaktor: 1,
      }),
    ).toBe(erwartet);
  });

  it('skaliert proportional mit schriftFaktor (gerundet)', () => {
    // Ebene 1 aufgeklappt: Rohwert 44 -> bei Faktor 20/15 (schrift=20,
    // SCHRIFTGROESSE_DEFAULT=15) 44 * 20/15 = 58.67, gerundet 59.
    expect(
      ermittleUeberschriftTopPad({
        ebene: 1,
        istUntergeordnet: false,
        schriftFaktor: 20 / 15,
      }),
    ).toBe(59);
    expect(
      ermittleUeberschriftTopPad({ ebene: 2, istUntergeordnet: false, schriftFaktor: 16 / 15 }),
    ).toBe(34);
    // Untergeordnet, Rohwert 16, Faktor 0.5 -> 8.
    expect(
      ermittleUeberschriftTopPad({
        ebene: 1,
        istUntergeordnet: true,
        schriftFaktor: 0.5,
      }),
    ).toBe(8);
  });
});

describe('ermittleUeberschriftPaddingBottom', () => {
  it('Rohwert 10 bei schriftFaktor=1', () => {
    expect(ermittleUeberschriftPaddingBottom(1)).toBe(10);
  });

  it('skaliert proportional mit schriftFaktor (gerundet)', () => {
    // 10 * 20/15 = 13.33, gerundet 13.
    expect(ermittleUeberschriftPaddingBottom(20 / 15)).toBe(13);
    expect(ermittleUeberschriftPaddingBottom(0.5)).toBe(5);
  });
});
