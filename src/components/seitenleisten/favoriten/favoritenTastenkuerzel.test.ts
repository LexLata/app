// favoritenTastenkuerzel.test.ts
// Anzeige und Tastaturauswertung stimmen für sämtliche Favoritenplätze überein.
import { expect, it } from 'vitest';
import { tastenkuerzelFuerIndex, favoritenIndexFuerTaste } from './favoritenTastenkuerzel';

it.each(Array.from({ length: 78 }, (_, index) => index))(
  'ordnet Favorit %i seinem angezeigten Kürzel zu',
  (index) => {
    const buchstabe = String.fromCharCode((index >= 26 && index < 52 ? 65 : 97) + (index % 26));
    const anzeige = tastenkuerzelFuerIndex(index, true);
    expect(anzeige.buchstabe).toBe(buchstabe);
    expect(anzeige.kursiv).toBe(index >= 52);
    expect(
      favoritenIndexFuerTaste({
        key: index >= 52 ? 'ä' : buchstabe,
        code: `Key${buchstabe.toUpperCase()}`,
        altKey: index >= 52,
        shiftKey: index >= 26 && index < 52,
      }),
    ).toBe(index);
  },
);
it('vergibt ab Platz 79 kein Kürzel und ignoriert fremde Tasten', () => {
  expect(tastenkuerzelFuerIndex(78, true)).toEqual({ buchstabe: '', kursiv: false, tooltip: '' });
  expect(
    favoritenIndexFuerTaste({ key: '1', code: 'Digit1', altKey: false, shiftKey: false }),
  ).toBeNull();
});
