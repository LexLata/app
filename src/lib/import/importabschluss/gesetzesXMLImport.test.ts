// Tests des Importzweigs für mitgelieferte, fertig verarbeitete GesetzesXML-Dateien.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { referenzVon } from '@/lib/domain/gesetzesreferenz';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';

const { parseGesetzesXML } = vi.hoisted(() => ({ parseGesetzesXML: vi.fn() }));
vi.mock('@/lib/darstellung/darstellung.index', () => ({ parseGesetzesXML }));

const { ladeAlleGesetze, speichereGesetz } = vi.hoisted(() => ({
  ladeAlleGesetze: vi.fn(),
  speichereGesetz: vi.fn(),
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/gesetz/gesetz.index')>()),
  leseAbgeglichenesSuchverzeichnis: async () => ({ abgeglichen: true, eintraege: [] }),
  GesetzSpeicherFolgefehler: (
    await importOriginal<typeof import('@/lib/persistenz/gesetz/gesetz.index')>()
  ).GesetzSpeicherFolgefehler,
  leseGesetz: async (referenz: { kurztitel: string; normgeber: string }) => {
    const gesetz = (await ladeAlleGesetze()).find(
      (g: GesetzDarstellung) =>
        g.kurztitel === referenz.kurztitel && g.normgeber === referenz.normgeber,
    );
    return gesetz ? { status: 'geladen', gesetz, befunde: [] } : { status: 'fehlt', befunde: [] };
  },
  ladeAlleGesetze,
  speichereGesetz,
}));

import { importiereGesetzesXML } from './gesetzesXMLImport';

function gesetz(ueberschreibungen: Partial<GesetzDarstellung> = {}): GesetzDarstellung {
  return {
    kurztitel: 'BGB',
    langtitel: 'Bürgerliches Gesetzbuch',
    normgeber: 'eu',
    elemente: [],
    ...ueberschreibungen,
  } as GesetzDarstellung;
}

beforeEach(() => {
  vi.clearAllMocks();
  speichereGesetz.mockImplementation(async (gesetz) => referenzVon(gesetz));
});

describe('importiereGesetzesXML', () => {
  it.each(['de-bund', 'de-bw', 'unbekannt'] as const)(
    'ersetzt kein gleichnamiges Gesetz mit Normgeber %s',
    async (normgeber) => {
      parseGesetzesXML.mockReturnValue(gesetz({ verarbeitungszeit: new Date('2026-02-01') }));
      ladeAlleGesetze.mockResolvedValue([
        gesetz({ normgeber, verarbeitungszeit: new Date('2026-01-01') }),
      ]);

      await expect(importiereGesetzesXML('<xml/>')).resolves.toMatchObject({
        art: 'erfolg',
        gesetz: { kurztitel: 'BGB', normgeber: 'eu' },
      });
      expect(speichereGesetz).toHaveBeenCalledWith(
        expect.objectContaining({ kurztitel: 'BGB', normgeber: 'eu' }),
        '<xml/>',
      );
    },
  );
  it.each([
    ['neuer', '2026-02-01', '2026-01-01', 'erfolg'],
    ['älterer', '2026-01-01', '2026-02-01', 'fehler'],
    ['gleicher', '2026-01-01', '2026-01-01', 'fehler'],
  ])(
    'bewertet %s letzteNeuerung trotz gegenläufiger Verarbeitungszeit',
    async (_fall, neu, alt, art) => {
      parseGesetzesXML.mockReturnValue(
        gesetz({ letzteNeuerung: new Date(neu), verarbeitungszeit: new Date('2020-01-01') }),
      );
      ladeAlleGesetze.mockResolvedValue([
        gesetz({ letzteNeuerung: new Date(alt), verarbeitungszeit: new Date('2030-01-01') }),
      ]);
      expect((await importiereGesetzesXML('<xml/>')).art).toBe(art);
    },
  );

  it.each(['neu', 'alt'])(
    'nutzt Verarbeitungszeit, wenn letzteNeuerung auf Seite %s fehlt',
    async (seite) => {
      parseGesetzesXML.mockReturnValue(
        gesetz({
          letzteNeuerung: seite === 'neu' ? undefined : new Date('2020-01-01'),
          verarbeitungszeit: new Date('2026-02-01'),
        }),
      );
      ladeAlleGesetze.mockResolvedValue([
        gesetz({
          letzteNeuerung: seite === 'alt' ? undefined : new Date('2030-01-01'),
          verarbeitungszeit: new Date('2026-01-01'),
        }),
      ]);
      expect((await importiereGesetzesXML('<xml/>')).art).toBe('erfolg');
    },
  );
  it('liefert einen Fehler, wenn das XML nicht geparst werden kann', async () => {
    parseGesetzesXML.mockReturnValue(null);

    const ergebnis = await importiereGesetzesXML('<ungueltig/>');

    expect(ergebnis).toMatchObject({ art: 'fehler', fehler: { grund: 'format' } });
    expect(speichereGesetz).not.toHaveBeenCalled();
  });

  it('importiert ein neues Gesetz ohne eigene Kennung', async () => {
    parseGesetzesXML.mockReturnValue(gesetz({}));
    ladeAlleGesetze.mockResolvedValue([]);

    const ergebnis = await importiereGesetzesXML('<xml/>');

    expect(speichereGesetz).toHaveBeenCalled();
    expect(speichereGesetz).toHaveBeenCalledWith(
      expect.objectContaining({ kurztitel: 'BGB', normgeber: 'eu' }),
      '<xml/>',
    );
    expect(ergebnis).toMatchObject({
      art: 'erfolg',
      gesetz: { kurztitel: 'BGB', normgeber: 'eu' },
    });
  });

  it('vergleicht die Kurztitel ohne Beachtung der Großschreibung', async () => {
    parseGesetzesXML.mockReturnValue(
      gesetz({ kurztitel: 'bgb', verarbeitungszeit: new Date('2026-02-01') }),
    );
    ladeAlleGesetze.mockResolvedValue([
      gesetz({
        kurztitel: 'BGB',
        verarbeitungszeit: new Date('2026-01-01'),
      }),
    ]);

    speichereGesetz.mockResolvedValueOnce({ kurztitel: 'BGB', normgeber: 'eu' });
    const ergebnis = await importiereGesetzesXML('<xml/>');

    expect(ergebnis).toMatchObject({
      art: 'erfolg',
      gesetz: { kurztitel: 'BGB', normgeber: 'eu' },
    });
  });

  it('ersetzt ein älteres Gesetz unter Beibehaltung seiner Bestandsschreibweise', async () => {
    parseGesetzesXML.mockReturnValue(gesetz({ verarbeitungszeit: new Date('2026-02-01') }));
    ladeAlleGesetze.mockResolvedValue([gesetz({ verarbeitungszeit: new Date('2026-01-01') })]);

    const ergebnis = await importiereGesetzesXML('<xml/>');

    expect(speichereGesetz).toHaveBeenCalledWith(
      expect.objectContaining({ kurztitel: 'BGB', normgeber: 'eu' }),
      '<xml/>',
    );
    expect(ergebnis).toMatchObject({
      art: 'erfolg',
      gesetz: { kurztitel: 'BGB', normgeber: 'eu' },
    });
  });

  it('lehnt eine gleich aktuelle Version ab', async () => {
    const zeit = new Date('2026-01-01');
    parseGesetzesXML.mockReturnValue(gesetz({ verarbeitungszeit: zeit }));
    ladeAlleGesetze.mockResolvedValue([gesetz({ verarbeitungszeit: zeit })]);

    const ergebnis = await importiereGesetzesXML('<xml/>');

    expect(speichereGesetz).not.toHaveBeenCalled();
    expect(ergebnis).toMatchObject({ art: 'fehler', fehler: { grund: 'bereitsVorhanden' } });
  });

  it('lehnt eine ältere Version ab', async () => {
    parseGesetzesXML.mockReturnValue(gesetz({ verarbeitungszeit: new Date('2025-01-01') }));
    ladeAlleGesetze.mockResolvedValue([gesetz({ verarbeitungszeit: new Date('2026-01-01') })]);

    const ergebnis = await importiereGesetzesXML('<xml/>');

    expect(speichereGesetz).not.toHaveBeenCalled();
    expect(ergebnis).toMatchObject({ art: 'fehler', fehler: { grund: 'bereitsVorhanden' } });
  });

  it('wertet zwei fehlende Verarbeitungszeiten als gleich aktuell', async () => {
    parseGesetzesXML.mockReturnValue(gesetz({ verarbeitungszeit: undefined }));
    ladeAlleGesetze.mockResolvedValue([gesetz({ verarbeitungszeit: undefined })]);

    const ergebnis = await importiereGesetzesXML('<xml/>');

    expect(speichereGesetz).not.toHaveBeenCalled();
    expect(ergebnis).toMatchObject({ art: 'fehler', fehler: { grund: 'bereitsVorhanden' } });
  });

  it('meldet die Fortschrittsphasen in der richtigen Reihenfolge', async () => {
    parseGesetzesXML.mockReturnValue(gesetz({}));
    ladeAlleGesetze.mockResolvedValue([]);
    const phasen: string[] = [];

    await importiereGesetzesXML('<xml/>', (fortschritt) => phasen.push(fortschritt.phase));

    expect(phasen).toEqual(['parsen', 'speichern', 'fertig']);
  });

  it('kennzeichnet einen Fehler beim Speichern als Speicherfehler', async () => {
    parseGesetzesXML.mockReturnValue(gesetz({}));
    ladeAlleGesetze.mockResolvedValue([]);
    speichereGesetz.mockRejectedValueOnce(new Error('Datenträger voll'));

    await expect(importiereGesetzesXML('<xml/>')).resolves.toEqual({
      art: 'fehler',
      fehler: {
        grund: 'speichern',
        meldung: 'Gesetz konnte nicht gespeichert werden: Error: Datenträger voll',
      },
    });
  });
});

it.each(['letzteNeuerung', 'verarbeitungszeit'] as const)(
  'schützt neueren Bestand anhand %s',
  async (feld) => {
    parseGesetzesXML.mockReturnValue(gesetz({ [feld]: new Date('2026-02-01') }));
    ladeAlleGesetze.mockResolvedValue([gesetz({ [feld]: new Date('2026-03-01') })]);
    expect((await importiereGesetzesXML('<xml/>')).art).toBe('fehler');
    expect(ladeAlleGesetze).toHaveBeenCalledWith();
    expect(speichereGesetz).not.toHaveBeenCalled();
  },
);

it('ersetzt dieselbe Referenz unabhängig von Normgeberschreibweise unter ihrem vorhandenen Dateinamen', async () => {
  parseGesetzesXML.mockReturnValue(gesetz({ verarbeitungszeit: new Date('2026-03-01') }));
  ladeAlleGesetze.mockResolvedValue([
    gesetz({
      normgeber: 'eu',
      kurztitel: 'bgb',
      verarbeitungszeit: new Date('2026-01-01'),
    }),
  ]);
  expect(await importiereGesetzesXML('<xml/>')).toMatchObject({
    art: 'erfolg',
    gesetz: { kurztitel: 'BGB', normgeber: 'eu' },
  });
  expect(speichereGesetz).toHaveBeenCalledWith(
    expect.objectContaining({ kurztitel: 'BGB', normgeber: 'eu' }),
    '<xml/>',
  );
});
