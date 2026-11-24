// praefixlaufStart.test.ts
// Terminalabschluss und Exit für erfolgreiche Läufe sowie schwere Fehler.
import { beforeEach, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({ invoke: vi.fn(), lauf: vi.fn(), erzeugen: vi.fn(), kontext: {} }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: f.invoke }));
vi.mock('./praefixstruktur/praefixstruktur.index', () => ({
  fuehrePraefixlaufAus: f.lauf,
  erzeugeTauriPraefixlaufUmgebung: f.erzeugen,
}));
vi.mock('@/lib/import/importabschluss/importabschluss.index', () => ({
  mitReferenzKontext: async (
    arbeit: (k: unknown) => unknown,
    melden: (m: { text: string }) => void,
  ) => {
    try {
      return await arbeit(f.kontext);
    } finally {
      melden({ text: 'Referenzdiagnose' });
    }
  },
}));
import { startePraefixlauf } from './praefixlaufStart';
beforeEach(() => {
  vi.clearAllMocks();
  f.invoke.mockResolvedValue(undefined);
  f.erzeugen.mockResolvedValue({});
  f.lauf.mockResolvedValue({
    gespeichert: 2,
    teilerfolge: [],
    fehlgeschlagen: [{ kurztitel: 'X', meldung: 'Download' }],
  });
});
it('beendet ordnungsgemäßen Lauf trotz Gesetzfehler mit Zusammenfassung und Code 0', async () => {
  await startePraefixlauf({ modus: 'praefix', normgeber: 'de-bund', anzahl: 2 });
  expect(f.erzeugen).toHaveBeenCalledWith(f.kontext);
  expect(f.invoke).toHaveBeenCalledWith('praefixlauf_ausgabe', {
    art: 'ergebnis',
    zeile: expect.stringContaining('Präfixlauf abgeschlossen:'),
  });
  expect(f.invoke).toHaveBeenCalledWith('praefixlauf_ausgabe', {
    zeile: 'Referenzdiagnose',
    art: 'ergebnis',
  });
  expect(f.invoke.mock.calls.filter(([command]) => command === 'praefixlauf_beenden')).toEqual([
    ['praefixlauf_beenden', { code: 0 }],
  ]);
  expect(f.invoke.mock.calls.at(-1)?.[0]).toBe('praefixlauf_beenden');
});
it('meldet schwere Fehler und beendet genau einmal mit Code 1', async () => {
  f.lauf.mockRejectedValueOnce(new Error('Schreibfehler'));
  await startePraefixlauf({ modus: 'praefix', normgeber: 'de-bw', anzahl: 2 });
  expect(f.invoke).toHaveBeenCalledWith('praefixlauf_ausgabe', {
    art: 'ergebnis',
    zeile: expect.stringContaining('Schreibfehler'),
  });
  expect(f.invoke.mock.calls.filter(([command]) => command === 'praefixlauf_beenden')).toEqual([
    ['praefixlauf_beenden', { code: 1 }],
  ]);
});

it('schreibt einen lesbaren Fehlerbericht vor dem Beenden und nennt dessen Pfad', async () => {
  f.invoke.mockImplementation(async (command: string) =>
    command === 'praefixlauf_bericht_schreiben'
      ? '/arbeitsdaten/berichte/fehler-bund-test.txt'
      : undefined,
  );
  await startePraefixlauf({ modus: 'praefix', normgeber: 'de-bund', anzahl: 2 });
  const schreiben = f.invoke.mock.calls.findIndex(
    ([command]) => command === 'praefixlauf_bericht_schreiben',
  );
  expect(schreiben).toBeGreaterThanOrEqual(0);
  expect(f.invoke.mock.calls[schreiben]?.[1]).toMatchObject({
    inhalt: expect.stringContaining('X: Download'),
  });
  expect(f.invoke.mock.calls[schreiben]?.[1].inhalt).toContain('Erfolgreich gespeichert: 2');
  expect(f.invoke).toHaveBeenCalledWith('praefixlauf_ausgabe', {
    art: 'ergebnis',
    zeile: expect.stringContaining('/arbeitsdaten/berichte/fehler-bund-test.txt'),
  });
  expect(f.invoke.mock.calls.at(-1)).toEqual(['praefixlauf_beenden', { code: 0 }]);
});
it('meldet einen Berichtsfehler und beendet mit Code 1', async () => {
  f.invoke.mockImplementation(async (command: string) => {
    if (command === 'praefixlauf_bericht_schreiben') throw new Error('Bericht nicht schreibbar');
  });
  await startePraefixlauf({ modus: 'praefix', normgeber: 'de-bw', anzahl: 2 });
  expect(f.invoke).toHaveBeenCalledWith('praefixlauf_ausgabe', {
    art: 'ergebnis',
    zeile: expect.stringContaining('Bericht nicht schreibbar'),
  });
  expect(f.invoke.mock.calls.at(-1)).toEqual(['praefixlauf_beenden', { code: 1 }]);
});

it('erhält gespeicherte Erfolge und Gesetzfehler bei schwerem Abbruch', async () => {
  f.lauf.mockImplementationOnce(async (_auftrag, _umgebung, meldeBericht) => {
    meldeBericht({
      gespeichert: 1,
      teilerfolge: [],
      fehlgeschlagen: [{ kurztitel: 'A', meldung: 'Download' }],
    });
    throw new Error('Liste nicht schreibbar');
  });
  await startePraefixlauf({ modus: 'praefix', normgeber: 'de-bw', anzahl: 3 });
  const bericht = f.invoke.mock.calls.find(
    ([command]) => command === 'praefixlauf_bericht_schreiben',
  )?.[1].inhalt;
  expect(bericht).toContain('Erfolgreich gespeichert: 1');
  expect(bericht).toContain('A: Download');
  expect(bericht).toContain('Liste nicht schreibbar');
});

it('beginnt den Fehlerbericht mit derselben Zusammenfassung wie die Terminalausgabe', async () => {
  await startePraefixlauf({ modus: 'praefix', normgeber: 'de-bund', anzahl: 2 });
  const zusammenfassung = 'Erfolgreich gespeichert: 2 / Teilerfolge: 0 / Fehlgeschlagen: 1';
  const bericht = f.invoke.mock.calls.find(
    ([command]) => command === 'praefixlauf_bericht_schreiben',
  )?.[1].inhalt;
  expect(bericht.startsWith(zusammenfassung + '\n')).toBe(true);
  expect(bericht).toContain('\n\nTeilerfolge\nKeine.\n\nFehlgeschlagen\nX: Download\n');
  expect(f.invoke).toHaveBeenCalledWith('praefixlauf_ausgabe', {
    art: 'ergebnis',
    zeile: `Präfixlauf abgeschlossen: ${zusammenfassung}`,
  });
});
