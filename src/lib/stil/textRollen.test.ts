// textRollen.test.ts
// Prüft die öffentliche Farbzuordnung der Textrollen einschließlich UI-Skalierung.
import { expect, it } from 'vitest';
import { erzeugeTextRollen, textRollen } from './textRollen';

it.each([1, 1.5])('stellt Hinweise und Kürzel bei Faktor %s als Sekundärtext dar', (faktor) => {
  const rollen = erzeugeTextRollen(faktor);
  expect(rollen.hinweistext.color).toBe('var(--text-sekundaer)');
  expect(rollen.mikrotext.color).toBe('var(--text-sekundaer)');
  expect(textRollen).not.toHaveProperty('hinweistext' + 'Kontrastreich');
});
