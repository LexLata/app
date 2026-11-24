// importindexSchreibkoordination.test.ts
// Kategorien unabhängig; gleiche Kategorie bis zum Abschluss gesperrt, Fehler geben frei.
import { expect, it } from 'vitest';
import { mitImportindexSchreibabschnitt } from './importindexSchreibkoordination';
it('serialisiert gleiche Kategorie, andere Kategorie läuft unabhängig und Fehler geben frei', async () => {
  const ablauf: string[] = [];
  let weiter!: () => void;
  let gestartet!: () => void;
  const start = new Promise<void>((resolve) => {
    gestartet = resolve;
  });
  const tor = new Promise<void>((resolve) => {
    weiter = resolve;
  });
  const erster = mitImportindexSchreibabschnitt('de-bund', async () => {
    ablauf.push('bund1');
    gestartet();
    await tor;
    throw new Error('Schreibfehler');
  });
  const fehler = expect(erster).rejects.toThrow('Schreibfehler');
  await start;
  const zweiter = mitImportindexSchreibabschnitt('de-bund', async () => {
    ablauf.push('bund2');
  });
  await mitImportindexSchreibabschnitt('de-bw', async () => {
    ablauf.push('de-bw');
  });
  expect(ablauf).toEqual(['bund1', 'de-bw']);
  weiter();
  await fehler;
  await zweiter;
  expect(ablauf).toEqual(['bund1', 'de-bw', 'bund2']);
  await mitImportindexSchreibabschnitt('de-bund', async () => {
    ablauf.push('bund3');
  });
  expect(ablauf.at(-1)).toBe('bund3');
});
