// verweisTagger.eigenverweise.test.ts
// Vereinbartes XML-Format für Eigenverweise und unveränderte Fremdverweise.
import { expect, it } from 'vitest';
import { entferneBestehendeVerweise, taggeVerweise } from './verweisTagger';

const bgb = { kurztitel: 'BGB', normgeber: 'de-bund', langtitel: 'Bürgerliches Gesetzbuch' };

it.each(['BGB', 'bgb'])('schreibt den ausdrücklich genannten Eigenverweis %s kurz', (name) => {
  expect(taggeVerweise(`<text>§ 5 ${name}</text>`, bgb, [bgb])).toBe(
    `<text><verweis norm="§ 5">§ 5</verweis> ${name}</text>`,
  );
});

it('schreibt die Normkette aus BGB § 27 Absatz 3 auf jedem Glied kurz', () => {
  const text =
    '<text>Auf die Geschäftsführung des Vorstands finden die für den Auftrag geltenden Vorschriften der §§ 664 bis 670 entsprechende Anwendung.</text>';
  const xml = taggeVerweise(text, bgb, []);
  expect(xml).toBe(
    '<text>Auf die Geschäftsführung des Vorstands finden die für den Auftrag geltenden Vorschriften der <verweis norm="§ 664">§§ 664 bis </verweis><verweis norm="§ 670">670</verweis> entsprechende Anwendung.</text>',
  );
  expect(entferneBestehendeVerweise(xml)).toBe(text);
});

it('ersetzt alte lange Eigenverweise durch die kurze Form und bleibt idempotent', () => {
  const alt =
    '<text>Siehe <verweis gesetz="BGB" normgeber="de-bund" norm="§ 5">§ 5</verweis> BGB.</text>';
  const kurz = '<text>Siehe <verweis norm="§ 5">§ 5</verweis> BGB.</text>';
  expect(taggeVerweise(alt, bgb, [bgb])).toBe(kurz);
  expect(taggeVerweise(kurz, bgb, [bgb])).toBe(kurz);
  expect(entferneBestehendeVerweise(kurz)).toBe('<text>Siehe § 5 BGB.</text>');
});

it.each([
  { kurztitel: 'BGB', normgeber: 'de-bund' },
  { kurztitel: 'AEUV', normgeber: 'eu' },
  { kurztitel: 'PolG', normgeber: 'de-bw' },
])('erhält bei Fremdverweisketten auf $kurztitel jedes Ziel vollständig', (ziel) => {
  expect(
    taggeVerweise(
      `<text>§§ 5, 6 ${ziel.kurztitel}</text>`,
      { kurztitel: 'StGB', normgeber: 'de-bund' },
      [{ ...ziel, langtitel: ziel.kurztitel }],
    ),
  ).toBe(
    `<text><verweis gesetz="${ziel.kurztitel}" normgeber="${ziel.normgeber}" norm="§ 5">§§ 5, </verweis><verweis gesetz="${ziel.kurztitel}" normgeber="${ziel.normgeber}" norm="§ 6">6</verweis> ${ziel.kurztitel}</text>`,
  );
});
