// Fortschrittsvertrag von importierePfade und Stand des laufenden Datei-Imports.
// Gemockt sind nur Dateisystem und native Tauri-Grenzen; Import und Stand sind echt.
import { beforeEach, expect, it, vi, type Mock } from 'vitest';

const io = vi.hoisted<{
  dateien: Map<string, string>;
  sperre: Promise<void> | null;
  gelesen: Mock<(pfad: string) => void>;
}>(() => ({
  dateien: new Map<string, string>(),
  sperre: null,
  gelesen: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: async (pfad: string) => {
    io.gelesen(pfad);
    if (io.sperre) await io.sperre;
    const inhalt = io.dateien.get(pfad);
    if (inhalt === undefined) throw new Error('Datei fehlt');
    return inhalt;
  },
  readFile: async () => {
    throw new Error('Archiv fehlt');
  },
  exists: async () => false,
  readDir: async () => [],
  mkdir: async () => {},
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (name: string) => {
    return name === 'datei_sperre_erwerben' ? 'token' : undefined;
  }),
}));
vi.mock('@tauri-apps/api/event', () => ({
  emitTo: vi.fn(async () => {}),
  listen: async () => () => {},
}));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
}));

import {
  abonniereDateiImportZustand,
  istReinerImportErfolg,
  leseDateiImportZustand,
  starteDateiImport,
  verwerfeDateiImportErgebnis,
} from '@/lib/import-export/import-export.index';
import { importierePfade } from '@/lib/import-export/datei-import/gesetzDateiImport';

async function bisFertig() {
  await vi.waitFor(() => expect(leseDateiImportZustand().art).toBe('fertig'));
}

beforeEach(async () => {
  io.dateien.clear();
  io.sperre = null;
  io.gelesen.mockClear();
  if (leseDateiImportZustand().art === 'laeuft') await bisFertig();
  verwerfeDateiImportErgebnis();
});

it('P2-A1: meldet Lesephase, jede Datei und die Schlussmeldung in Vertragsreihenfolge', async () => {
  io.dateien.set('/x/a.xml', '<unbekannt/>');
  io.dateien.set('/x/c.xml', '<unbekannt/>');
  const meldungen: unknown[] = [];

  const ergebnis = await importierePfade(['/x/a.xml', '/x/b.xml', '/x/c.xml'], (f) =>
    meldungen.push({ ...f }),
  );

  expect(meldungen).toEqual([
    { phase: 'lesen', erledigt: 0, gesamt: 3, datei: 'a.xml' },
    { phase: 'lesen', erledigt: 1, gesamt: 3, datei: 'b.xml' },
    { phase: 'lesen', erledigt: 2, gesamt: 3, datei: 'c.xml' },
    { phase: 'verarbeiten', erledigt: 0, gesamt: 2, datei: 'a.xml' },
    { phase: 'verarbeiten', erledigt: 1, gesamt: 2, datei: 'c.xml' },
    { phase: 'verarbeiten', erledigt: 2, gesamt: 2 },
  ]);
  expect(ergebnis.fehler).toEqual([
    { grund: 'formatUnbekannt', datei: 'a.xml' },
    { grund: 'formatUnbekannt', datei: 'c.xml' },
    { grund: 'lesefehler', datei: 'b.xml', detail: 'Error: Datei fehlt' },
  ]);
});

it('P2-A1: meldet bei leerer Auswahl nur die Schlussmeldung', async () => {
  const meldungen: unknown[] = [];
  await importierePfade([], (f) => meldungen.push({ ...f }));
  expect(meldungen).toEqual([{ phase: 'verarbeiten', erledigt: 0, gesamt: 0 }]);
});

it('P2-A2: startet während eines laufenden Imports keine zweite Verarbeitung', async () => {
  let freigeben!: () => void;
  io.sperre = new Promise((resolve) => (freigeben = resolve));
  io.dateien.set('/x/a.xml', '<unbekannt/>');
  io.dateien.set('/x/z.xml', '<unbekannt/>');

  expect(starteDateiImport(['/x/a.xml'])).toBe(true);
  expect(leseDateiImportZustand()).toMatchObject({ art: 'laeuft', gesamt: 1 });
  await vi.waitFor(() => expect(io.gelesen).toHaveBeenCalledWith('/x/a.xml'));

  expect(starteDateiImport(['/x/z.xml'])).toBe(false);
  verwerfeDateiImportErgebnis();
  expect(leseDateiImportZustand().art).toBe('laeuft');

  freigeben();
  await bisFertig();
  expect(io.gelesen).not.toHaveBeenCalledWith('/x/z.xml');
  const fertig = leseDateiImportZustand();
  expect(fertig.art === 'fertig' && fertig.ergebnis.fehler).toEqual([
    { grund: 'formatUnbekannt', datei: 'a.xml' },
  ]);

  verwerfeDateiImportErgebnis();
  expect(leseDateiImportZustand().art).toBe('kein');
  expect(starteDateiImport(['/x/z.xml'])).toBe(true);
  await bisFertig();
  expect(io.gelesen).toHaveBeenCalledWith('/x/z.xml');
});

it('wertet nur neue Einträge ohne Meldungen, Konflikte und Fehler als reinen Erfolg', () => {
  const neu = { kategorie: 'gesetz', name: 'BGB', aktion: 'neu' } as const;
  const leer = { konflikte: [], fehler: [], berichtEintraege: [neu] };
  expect(istReinerImportErfolg(leer)).toBe(true);
  expect(
    istReinerImportErfolg({
      ...leer,
      fehler: [{ grund: 'formatUnbekannt' as const, datei: 'Defekt.xml' }],
    }),
  ).toBe(false);
  expect(
    istReinerImportErfolg({ ...leer, berichtEintraege: [{ ...neu, aktion: 'ersetzt' }] }),
  ).toBe(false);
  expect(
    istReinerImportErfolg({
      ...leer,
      berichtEintraege: [
        {
          ...neu,
          meldungen: [
            {
              typ: 'warnung',
              art: 'hinweis',
              anlass: 'import',
              aenderungsstand: 'keine',
              text: 'Ausgangsstelle 9: Der Textbezug fehlt.',
            },
          ],
        },
      ],
    }),
  ).toBe(false);
});

it('P1-A6: Abbruch des Imports -> genau ein Fehler importAbgebrochen ohne Datei', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  io.dateien.set('/x/a.xml', '<unbekannt/>');
  // Ein Fehler mitten im Ablauf (hier: im Fortschrittsempfänger) bricht ab.
  let geworfen = false;
  const abmelden = abonniereDateiImportZustand(() => {
    const z = leseDateiImportZustand();
    if (!geworfen && z.art === 'laeuft' && z.phase === 'verarbeiten') {
      geworfen = true;
      throw new Error('Abbruch');
    }
  });
  expect(starteDateiImport(['/x/a.xml'])).toBe(true);
  await bisFertig();
  abmelden();
  const fertig = leseDateiImportZustand();
  expect(fertig.art === 'fertig' && fertig.ergebnis.fehler).toEqual([
    { grund: 'importAbgebrochen', detail: 'Abbruch' },
  ]);
});
