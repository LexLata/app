// Prüft die gemeinsame Regel der Gliederungskennzahl einschließlich beliebiger Blockfolgen.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  GliederungskennzahlVergabe,
  gliederungsebene,
  istGueltigeGliederungskennzahl,
} from './gliederungskennzahl';

describe('Gliederungskennzahl', () => {
  it.each(['010', '010020'])('akzeptiert %s', (text) => {
    expect(istGueltigeGliederungskennzahl(text)).toBe(true);
  });
  it.each(['', '12', '1234', 'abc', '010 020', '010\n', '010\r', '010\r\n'])(
    'verwirft %s',
    (text) => {
      expect(istGueltigeGliederungskennzahl(text)).toBe(false);
    },
  );
  it('akzeptiert genau Ziffernblöcke und bestimmt ihre Zahl als Ebene', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: 0, max: 999 }), { minLength: 1 }), (bloecke) => {
        const text = bloecke.map((block) => String(block).padStart(3, '0')).join('');
        expect(istGueltigeGliederungskennzahl(text)).toBe(true);
        expect(gliederungsebene(text)).toBe(bloecke.length);
      }),
    );
  });
  it('nimmt genau nichtleere Zeichenketten mit durch drei teilbarer Ziffernzahl an', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const erwartet =
          text.length > 0 &&
          text.length % 3 === 0 &&
          [...text].every((zeichen) => zeichen >= '0' && zeichen <= '9');
        expect(istGueltigeGliederungskennzahl(text)).toBe(erwartet);
      }),
    );
  });
});

describe('hierarchische Vergabe', () => {
  it('beginnt tiefere Zähler nach einem Elternwechsel neu', () => {
    const vergabe = new GliederungskennzahlVergabe();
    expect([1, 2, 3, 2, 1, 3].map((ebene) => vergabe.vergib(ebene))).toEqual([
      '010',
      '010010',
      '010010010',
      '010020',
      '020',
      '020000010',
    ]);
  });
  it.each([1, 2, 3])('weist die hundertste Gliederung auf Ebene %i zurück', (ebene) => {
    const vergabe = new GliederungskennzahlVergabe();
    for (let i = 0; i < 99; i++) vergabe.vergib(ebene);
    expect(() => vergabe.vergib(ebene)).toThrow('Zu viele Gliederungen auf derselben Ebene.');
  });
  it('erkennt Überlauf auch beim Überspringen amtlich reservierter Werte', () => {
    const vergabe = new GliederungskennzahlVergabe(['990']);
    for (let i = 0; i < 98; i++) vergabe.vergib(1);
    expect(() => vergabe.vergib(1)).toThrow('Zu viele Gliederungen auf derselben Ebene.');
  });
});
