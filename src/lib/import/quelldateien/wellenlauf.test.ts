// wellenlauf.test.ts
// Prüft Wellen, Erfolgsziel und Abbruch über die öffentliche Fassade.
import { expect, it } from 'vitest';
import fc from 'fast-check';
import {
  fuehreWellenlaufAus,
  formatiereLaufBericht,
  formatiereLaufZusammenfassung,
} from './quelldateien.index';

it('beginnt nach Fehlern eine weitere Welle und zählt Teilerfolge zum Ziel', async () => {
  const begonnen: number[] = [];
  const freigaben: (() => void)[] = [];
  const lauf = fuehreWellenlaufAus([0, 1, 2, 3, 4], 2, 2, async (k) => {
    begonnen.push(k);
    await new Promise<void>((resolve) => freigaben.push(resolve));
    return k === 0 ? 'fehler' : k === 1 ? 'teilerfolg' : 'erfolg';
  });
  expect(begonnen).toEqual([0, 1]);
  freigaben.splice(0).forEach((f) => f());
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(begonnen).toEqual([0, 1, 2]);
  freigaben.splice(0).forEach((f) => f());
  await lauf;
  expect(begonnen).toEqual([0, 1, 2]);
});

it('bricht bei einem Dateifehler ab und erhält den ursprünglichen Grund', async () => {
  const grund = new Error('Datei nicht schreibbar');
  const begonnen: number[] = [];
  await expect(
    fuehreWellenlaufAus([0, 1, 2], 3, 1, async (k) => {
      begonnen.push(k);
      throw grund;
    }),
  ).rejects.toBe(grund);
  expect(begonnen).toEqual([0]);
});

it('verarbeitet beliebige Ergebnisfolgen höchstens einmal bis zum Erfolgsziel', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.constantFrom('erfolg', 'teilerfolg', 'fehler', 'uebersprungen')),
      fc.integer({ min: 1, max: 20 }),
      fc.integer({ min: 1, max: 5 }),
      async (ergebnisse, ziel, limit) => {
        const besucht: number[] = [];
        let erfolge = 0;
        await fuehreWellenlaufAus(
          ergebnisse.map((ergebnis, index) => ({ ergebnis, index })),
          ziel,
          limit,
          async ({ ergebnis, index }) => {
            besucht.push(index);
            if (ergebnis === 'erfolg' || ergebnis === 'teilerfolg') erfolge++;
            return ergebnis;
          },
        );
        expect(new Set(besucht).size).toBe(besucht.length);
        expect(erfolge).toBe(
          Math.min(ziel, ergebnisse.filter((e) => e === 'erfolg' || e === 'teilerfolg').length),
        );
      },
    ),
  );
});

it('formatiert dieselbe Zusammenfassung für Terminal und Bericht mit getrennten Abschnitten', () => {
  const bericht = {
    gespeichert: 2,
    teilerfolge: [{ kurztitel: 'A', meldung: 'Original fehlt' }],
    fehlgeschlagen: [{ kurztitel: 'B', meldung: 'Quelle leer; GesetzesXML gelöscht' }],
    zusatzzeilen: ['Rückfall: 1'],
  };
  expect(formatiereLaufBericht(bericht)).toBe(
    'Erfolgreich gespeichert: 2 / Teilerfolge: 1 / Fehlgeschlagen: 1\nRückfall: 1\n\nTeilerfolge\nA: Original fehlt\n\nFehlgeschlagen\nB: Quelle leer; GesetzesXML gelöscht\n',
  );
  expect(formatiereLaufBericht(bericht).startsWith(formatiereLaufZusammenfassung(bericht))).toBe(
    true,
  );
  expect(formatiereLaufBericht({ gespeichert: 0, teilerfolge: [], fehlgeschlagen: [] })).toContain(
    'Teilerfolge: 0',
  );
});

it('meldet abgeschlossene Bearbeitungen einschließlich Fehlern und leert aktive Arbeiten bei Abbruch', async () => {
  const staende: unknown[] = [];
  await expect(
    fuehreWellenlaufAus(
      [0, 1, 2],
      3,
      1,
      async (k) => {
        if (k === 1) throw new Error('Dateifehler');
        return 'fehler';
      },
      (stand) => {
        staende.push(stand);
      },
    ),
  ).rejects.toThrow('Dateifehler');
  expect(staende).toEqual([
    { erfolgreich: 0, teilerfolge: 0, fehlgeschlagen: 0, uebersprungen: 0, aktiv: 0 },
    { erfolgreich: 0, teilerfolge: 0, fehlgeschlagen: 0, uebersprungen: 0, aktiv: 1 },
    { erfolgreich: 0, teilerfolge: 0, fehlgeschlagen: 1, uebersprungen: 0, aktiv: 0 },
    { erfolgreich: 0, teilerfolge: 0, fehlgeschlagen: 1, uebersprungen: 0, aktiv: 1 },
    { erfolgreich: 0, teilerfolge: 0, fehlgeschlagen: 2, uebersprungen: 0, aktiv: 0 },
  ]);
});

it('zählt Erfolg, Teilerfolg, Fehler und Überspringen getrennt', async () => {
  const staende: unknown[] = [];
  await fuehreWellenlaufAus(
    ['erfolg', 'teilerfolg', 'fehler', 'uebersprungen'] as const,
    4,
    2,
    async (ergebnis) => ergebnis,
    (stand) => {
      staende.push(stand);
    },
  );
  expect(staende.at(-1)).toEqual({
    erfolgreich: 1,
    teilerfolge: 1,
    fehlgeschlagen: 1,
    uebersprungen: 1,
    aktiv: 0,
  });
});
