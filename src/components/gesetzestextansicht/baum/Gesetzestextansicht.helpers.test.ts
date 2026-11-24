// Gesetzestextansicht.helpers.test.ts
// Prüft Titelfarben für Normen und Überschriften.
import { describe, it, expect } from 'vitest';
import {
  ermittleNormFarbe,
  ermittleNormFarbeWeggefallen,
  ermittleUeberschriftFarbe,
} from './Gesetzestextansicht.helpers';
describe('ermittleNormFarbe', () => {
  it('nicht überschrift-artig, aufgeklappt: undefined (normale Textfarbe)', () => {
    expect(
      ermittleNormFarbe({
        ueberschriftartig: false,
        istEingeklappt: false,
      }),
    ).toBeUndefined();
  });

  it('nicht überschrift-artig, eingeklappt: Sekundärfarbe', () => {
    expect(
      ermittleNormFarbe({
        ueberschriftartig: false,
        istEingeklappt: true,
      }),
    ).toBe('var(--text-sekundaer)');
  });

  it('überschrift-artig, aufgeklappt: aktiv-element', () => {
    expect(
      ermittleNormFarbe({
        ueberschriftartig: true,
        istEingeklappt: false,
      }),
    ).toBe('var(--aktiv-element)');
  });

  it('überschrift-artig, eingeklappt: aktiv-element-blass', () => {
    expect(
      ermittleNormFarbe({
        ueberschriftartig: true,
        istEingeklappt: true,
      }),
    ).toBe('var(--aktiv-element-blass)');
  });
});

describe('ermittleNormFarbeWeggefallen', () => {
  it('nicht überschrift-artig: immer Sekundärfarbe, unabhängig von eingeklappt', () => {
    expect(
      ermittleNormFarbeWeggefallen({
        ueberschriftartig: false,
        istEingeklappt: false,
      }),
    ).toBe('var(--text-sekundaer)');
    expect(
      ermittleNormFarbeWeggefallen({
        ueberschriftartig: false,
        istEingeklappt: true,
      }),
    ).toBe('var(--text-sekundaer)');
  });

  it('überschrift-artig, aufgeklappt: aktiv-element', () => {
    expect(
      ermittleNormFarbeWeggefallen({
        ueberschriftartig: true,
        istEingeklappt: false,
      }),
    ).toBe('var(--aktiv-element)');
  });

  it('überschrift-artig, eingeklappt: aktiv-element-blass', () => {
    expect(
      ermittleNormFarbeWeggefallen({
        ueberschriftartig: true,
        istEingeklappt: true,
      }),
    ).toBe('var(--aktiv-element-blass)');
  });
});

describe('ermittleUeberschriftFarbe', () => {
  it('aufgeklappt: aktiv-element', () => {
    expect(
      ermittleUeberschriftFarbe({
        istEingeklappt: false,
      }),
    ).toBe('var(--aktiv-element)');
  });

  it('eingeklappt: aktiv-element-blass', () => {
    expect(
      ermittleUeberschriftFarbe({
        istEingeklappt: true,
      }),
    ).toBe('var(--aktiv-element-blass)');
  });
});
