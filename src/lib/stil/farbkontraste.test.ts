// farbkontraste.test.ts
// WCAG-Kontraste der ausgelieferten Fallback-Farben, unabhängig vom OKLCH-Generator.
import { readFileSync } from 'node:fs';
import { assert, expect, it } from 'vitest';

const fallback = readFileSync('src/index.css', 'utf8').split(
  '@supports not (color: oklch(0% 0 0))',
)[1];
function farbe(theme: string, name: string): string {
  assert(fallback);
  const themenblock = fallback.split(`:root[data-farbschema='${theme}']`)[1];
  assert(themenblock);
  const block = themenblock.split('}')[0];
  assert(block);
  const treffer = block.match(new RegExp(`--${name}:\\s*(#[a-f0-9]{6})`));
  if (!treffer?.[1]) throw new Error(`Farbe ${name} fehlt in ${theme}`);
  return treffer[1];
}
function leuchtdichte(hex: string): number {
  function kanalwert(start: number) {
    const kanal = parseInt(hex.slice(start, start + 2), 16) / 255;
    return kanal <= 0.04045 ? kanal / 12.92 : ((kanal + 0.055) / 1.055) ** 2.4;
  }
  return 0.2126 * kanalwert(1) + 0.7152 * kanalwert(3) + 0.0722 * kanalwert(5);
}
function kontrast(a: string, b: string): number {
  const la = leuchtdichte(a);
  const lb = leuchtdichte(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
it.each(['hell', 'dunkel'])(
  'sichert lesbaren Sekundärtext und erkennbare Symbole in %s',
  (theme) => {
    for (const flaeche of ['bg-haupt', 'bg-leiste', 'bg-panel', 'bg-eingabe']) {
      expect(
        kontrast(farbe(theme, 'text-sekundaer'), farbe(theme, flaeche)),
      ).toBeGreaterThanOrEqual(4.5);
    }
    for (const flaeche of ['bg-haupt', 'bg-leiste', 'bg-panel']) {
      expect(
        kontrast(farbe(theme, 'symbol-gedaempft'), farbe(theme, flaeche)),
      ).toBeGreaterThanOrEqual(3);
    }
  },
);
it('gleicht den Flächenkontrast des H-Kästchens an und bewahrt lesbare Schrift und Dunkelfarbe', () => {
  const abstaende = ['hell', 'dunkel'].map((theme) => {
    const hintergrund = farbe(theme, 'hervorheben-kaestchen-bg');
    expect(kontrast(farbe(theme, 'text-primaer'), hintergrund)).toBeGreaterThanOrEqual(6);
    const abstand = kontrast(hintergrund, farbe(theme, 'bg-panel'));
    expect(Math.abs(abstand - 2)).toBeLessThanOrEqual(0.1);
    return abstand;
  });
  assert(abstaende[0] !== undefined && abstaende[1] !== undefined);
  expect(Math.abs(abstaende[0] - abstaende[1])).toBeLessThanOrEqual(0.1);
  expect(farbe('dunkel', 'hervorheben-kaestchen-bg')).toBe('#555555');
});

it.each(['hell', 'dunkel'])('liefert Standardrahmen in %s als deckende Graufarbe', (theme) => {
  expect(farbe(theme, 'rahmen')).toMatch(/^#[a-f0-9]{6}$/);
});
