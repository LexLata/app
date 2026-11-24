// scrollMesslaufAnmeldung.test.ts
// Prüft die Konsolenbefehle lexlataScrollMesslauf und lexlataScrollAufzeichnung über den
// bestehenden Messmodus.
import { afterEach, expect, it, vi } from 'vitest';
import { richteMesskonsoleEin } from './speicherMessung';
import { meldeScrollMessziel, type ScrollMessziel } from './scrollMesslaufAnmeldung';

const abmeldungen: Array<() => void> = [];
afterEach(() => {
  for (const abmelden of abmeldungen.splice(0)) abmelden();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  for (const name of [
    'speicherbericht',
    'bereithaltungsbudget',
    'lexlataScrollMesslauf',
    'lexlataScrollAufzeichnung',
  ])
    Reflect.deleteProperty(globalThis, name);
  Reflect.deleteProperty(globalThis, '__lexlataMessergebnis');
});

function ziel(flaeche: number, name: string): ScrollMessziel {
  return {
    sichtbareFlaeche: () => flaeche,
    fuehreDurch: vi.fn(async () => ({
      bericht: { stufe: 2, name },
      zusammenfassung: `Zusammenfassung ${name}`,
    })),
    zeichneAuf: vi.fn(async () => ({
      bericht: { stufe: 2, name, aufzeichnung: true },
      zusammenfassung: `Aufzeichnung ${name}`,
    })),
  };
}

it('die Konsolenbefehle fehlen außerhalb des Entwicklungsbetriebs', () => {
  vi.stubEnv('DEV', false);
  richteMesskonsoleEin();
  expect('lexlataScrollMesslauf' in globalThis).toBe(false);
  expect('lexlataScrollAufzeichnung' in globalThis).toBe(false);
});

it('ohne sichtbare Gesetzestextansicht warnt der Befehl, ohne zu werfen', async () => {
  const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
  richteMesskonsoleEin();
  const verdeckt = ziel(0, 'verdeckt');
  abmeldungen.push(meldeScrollMessziel(verdeckt));
  await expect(globalThis.lexlataScrollMesslauf?.()).resolves.toBeUndefined();
  expect(warnung).toHaveBeenCalledWith(
    expect.stringContaining('keine sichtbare Gesetzestextansicht'),
  );
  expect(verdeckt.fuehreDurch).not.toHaveBeenCalled();
});

it('der Befehl misst die größte sichtbare Ansicht und legt das Ergebnis ab', async () => {
  const info = vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  richteMesskonsoleEin();
  const klein = ziel(100, 'klein');
  const gross = ziel(300, 'groß');
  abmeldungen.push(meldeScrollMessziel(klein), meldeScrollMessziel(gross));
  const optionen = { szenarien: ['S1'], wiederholungen: 1 };
  const ergebnis = await globalThis.lexlataScrollMesslauf?.(optionen);
  expect(gross.fuehreDurch).toHaveBeenCalledWith(optionen);
  expect(klein.fuehreDurch).not.toHaveBeenCalled();
  expect(ergebnis).toEqual({ stufe: 2, name: 'groß' });
  expect(globalThis.__lexlataMessergebnis).toBe(ergebnis);
  expect(info).toHaveBeenCalledWith('Zusammenfassung groß');
});

it('ein abgemeldetes Messziel wird nicht mehr gewählt', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  richteMesskonsoleEin();
  const abgemeldet = ziel(300, 'weg');
  meldeScrollMessziel(abgemeldet)();
  await globalThis.lexlataScrollMesslauf?.();
  expect(abgemeldet.fuehreDurch).not.toHaveBeenCalled();
});

it('die Aufzeichnung dauert ohne Angabe 30 s und zeichnet die größte sichtbare Ansicht auf', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  richteMesskonsoleEin();
  const klein = ziel(100, 'klein');
  const gross = ziel(300, 'groß');
  abmeldungen.push(meldeScrollMessziel(klein), meldeScrollMessziel(gross));
  const ergebnis = await globalThis.lexlataScrollAufzeichnung?.();
  expect(gross.zeichneAuf).toHaveBeenCalledWith(30, {});
  expect(gross.fuehreDurch).not.toHaveBeenCalled();
  expect(klein.zeichneAuf).not.toHaveBeenCalled();
  expect(globalThis.__lexlataMessergebnis).toBe(ergebnis);
  await globalThis.lexlataScrollAufzeichnung?.(5, { textsprung: false });
  expect(gross.zeichneAuf).toHaveBeenLastCalledWith(5, { textsprung: false });
});

it('ohne sichtbare Gesetzestextansicht warnt auch die Aufzeichnung, ohne zu werfen', async () => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  const warnung = vi.spyOn(console, 'warn').mockImplementation(() => {});
  richteMesskonsoleEin();
  await expect(globalThis.lexlataScrollAufzeichnung?.(1)).resolves.toBeUndefined();
  expect(warnung).toHaveBeenCalledWith(
    expect.stringContaining('keine sichtbare Gesetzestextansicht'),
  );
});
