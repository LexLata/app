import fc from 'fast-check';
import vertraege from '@/test/plattform/native-vertraege.json';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ordnerSicherstellen = vi.fn<(_ordner: string) => Promise<void>>();
const schreiben = vi.fn<(pfad: string, inhalt: string) => Promise<void>>();
const lesen = vi.fn<(pfad: string) => Promise<string>>();

vi.mock('@/lib/persistenz/kern/kern.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/kern/kern.index')>()),
  EINSTELLUNGEN_ORDNER: 'einstellungen',
  sicherstelleOrdner: (ordner: string) => ordnerSicherstellen(ordner),
  appDatenSchreiben: (pfad: string, inhalt: string) => schreiben(pfad, inhalt),
  appDatenLesen: (pfad: string) => lesen(pfad),
}));

import {
  hauptFensterGeometrieFuerRustSpeichern,
  letzteFensterGeometrieLesen,
  letzteFensterGeometrieSpeichern,
} from './fensterGeometrieSpeicher';

const geometrie = { breite: 800, hoehe: 600, x: 10, y: 20, maximiert: false };

beforeEach(() => {
  ordnerSicherstellen.mockReset().mockResolvedValue(undefined);
  schreiben.mockReset().mockResolvedValue(undefined);
  lesen.mockReset().mockResolvedValue(JSON.stringify(geometrie));
});

describe('Fenstergeometrie-Dateien', () => {
  it.each([
    ['haupt', hauptFensterGeometrieFuerRustSpeichern, 'einstellungen/haupt-fenster-geometrie.json'],
    ['letzte', letzteFensterGeometrieSpeichern, 'einstellungen/letzte-fenster-geometrie.json'],
  ] as const)('schreibt %s-Geometrie nach Ordnererstellung', async (_art, speichern, pfad) => {
    await speichern(geometrie);
    expect(ordnerSicherstellen).toHaveBeenCalledBefore(schreiben);
    expect(ordnerSicherstellen).toHaveBeenCalledWith('einstellungen');
    expect(schreiben).toHaveBeenCalledWith(pfad, JSON.stringify(geometrie));
  });

  it.each([hauptFensterGeometrieFuerRustSpeichern, letzteFensterGeometrieSpeichern])(
    'speichert undefined nicht',
    async (speichern) => {
      await speichern(undefined);
      expect(ordnerSicherstellen).not.toHaveBeenCalled();
      expect(schreiben).not.toHaveBeenCalled();
    },
  );

  it('ignoriert Schreibfehler', async () => {
    schreiben.mockRejectedValueOnce(new Error('kaputt'));
    await expect(letzteFensterGeometrieSpeichern(geometrie)).resolves.toBeUndefined();
  });

  it('liest die letzte Geometrie als geprüftes Objekt', async () => {
    await expect(letzteFensterGeometrieLesen()).resolves.toEqual(geometrie);
    lesen.mockResolvedValueOnce('{"beliebig":true}');
    await expect(letzteFensterGeometrieLesen()).resolves.toBeUndefined();
  });

  it.each(['fehlt', 'ungültiges JSON', 'null'] as const)(
    'liefert bei fehlender oder ungültiger Datei undefined',
    async (inhalt) => {
      if (inhalt === 'fehlt') lesen.mockRejectedValueOnce(new Error('fehlt'));
      else lesen.mockResolvedValueOnce(inhalt);
      await expect(letzteFensterGeometrieLesen()).resolves.toBeUndefined();
    },
  );
});

it.each([
  null,
  [],
  {},
  { ...geometrie, breite: 0 },
  { ...geometrie, hoehe: -1 },
  { ...geometrie, x: '1' },
  { ...geometrie, maximiert: 1 },
  { ...geometrie, y: null },
])('verwirft ungültige Geometrie %j', async (wert) => {
  lesen.mockResolvedValueOnce(JSON.stringify(wert));
  await expect(letzteFensterGeometrieLesen()).resolves.toBeUndefined();
});
it('erhält negative Monitorpositionen', async () => {
  const wert = { ...geometrie, x: -800, y: -600 };
  lesen.mockResolvedValueOnce(JSON.stringify(wert));
  await expect(letzteFensterGeometrieLesen()).resolves.toEqual(wert);
});
it.each(['breite', 'hoehe', 'x', 'y'] as const)(
  'verwirft nicht endliche Zahl in %s aus syntaktisch gültigem JSON',
  async (feld) => {
    const json = JSON.stringify({ ...geometrie, [feld]: 'nicht-endlich' });
    lesen.mockResolvedValueOnce(json.replace('"nicht-endlich"', '1e400'));
    await expect(letzteFensterGeometrieLesen()).resolves.toBeUndefined();
  },
);
it('prüft für beliebiges JSON den Geometrievertrag ohne Schreibzugriff', async () => {
  await fc.assert(
    fc.asyncProperty(fc.jsonValue(), async (wert) => {
      lesen.mockResolvedValueOnce(JSON.stringify(wert));
      const geladen = await letzteFensterGeometrieLesen();
      if (geladen) {
        expect([geladen.breite, geladen.hoehe, geladen.x, geladen.y].every(Number.isFinite)).toBe(
          true,
        );
        expect(geladen.breite).toBeGreaterThan(0);
        expect(geladen.hoehe).toBeGreaterThan(0);
        expect(typeof geladen.maximiert).toBe('boolean');
      }
      expect(schreiben).not.toHaveBeenCalled();
    }),
  );
});

it('schreibt und empfängt den tatsächlichen nativen Geometrievertrag', async () => {
  await hauptFensterGeometrieFuerRustSpeichern(vertraege.fenster.geometrie);
  expect(schreiben).toHaveBeenCalledWith(
    'einstellungen/haupt-fenster-geometrie.json',
    JSON.stringify(vertraege.fenster.geometrie),
  );
  lesen.mockResolvedValueOnce(JSON.stringify(vertraege.fenster.geometrie));
  await expect(letzteFensterGeometrieLesen()).resolves.toEqual(vertraege.fenster.geometrie);
});
it.each(vertraege.fenster.ungueltigeGeometrien)(
  'weist native Feld- und Optionalitätsabweichung zurück %j',
  async (wert) => {
    lesen.mockResolvedValueOnce(JSON.stringify(wert));
    await expect(letzteFensterGeometrieLesen()).resolves.toBeUndefined();
  },
);
