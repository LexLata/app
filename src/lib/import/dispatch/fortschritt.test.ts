import { expect, it } from 'vitest';
import { erstelleFehlersicherenFortschritt } from './fortschritt';

it('meldet den ersten Rohwertfehler beim Abschluss als Error und führt weitere Meldungen aus', () => {
  const meldungen: number[] = [];
  const fortschritt = erstelleFehlersicherenFortschritt((schritt: number) => {
    meldungen.push(schritt);
    throw schritt === 1 ? 'Erste Meldung gescheitert' : new Error('Späterer Fehler');
  });
  fortschritt.melden(1);
  fortschritt.melden(2);
  expect(meldungen).toEqual([1, 2]);
  let fehler: unknown;
  try {
    fortschritt.wirfErstenFehler();
  } catch (ursache) {
    fehler = ursache;
  }
  expect(fehler).toBeInstanceOf(Error);
  expect(fehler).toMatchObject({
    message: 'Erste Meldung gescheitert',
    cause: 'Erste Meldung gescheitert',
  });
});
