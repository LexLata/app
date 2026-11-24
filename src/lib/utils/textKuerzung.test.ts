import { describe, expect, it } from 'vitest';
import { kuerzeAnWortgrenze } from './textKuerzung';

describe('kuerzeAnWortgrenze', () => {
  it('lässt Texte bis zur Grenze unverändert', () => {
    expect(kuerzeAnWortgrenze('Der Wohnsitz', 12)).toBe('Der Wohnsitz');
  });

  it('kürzt vor dem angebrochenen Wort', () => {
    const text =
      'Der Wohnsitz kann gleichzeitig an mehreren Orten bestehen. Weitere Sätze folgen hier.';
    // Zeichen 60 liegt im Wort „Weitere“.
    expect(kuerzeAnWortgrenze(text, 60)).toBe(
      'Der Wohnsitz kann gleichzeitig an mehreren Orten bestehen.…',
    );
  });

  it('behält ein Wort, das genau an der Grenze endet', () => {
    expect(kuerzeAnWortgrenze('abc def ghi', 7)).toBe('abc def…');
  });

  it('kürzt mitten im Wort, wenn schon das erste Wort zu lang ist', () => {
    expect(kuerzeAnWortgrenze('Donaudampfschifffahrt', 5)).toBe('Donau…');
  });
});
