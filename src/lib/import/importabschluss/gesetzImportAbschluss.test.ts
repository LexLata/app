// gesetzImportAbschluss.test.ts
//
// Tests für den gemeinsamen Importabschluss: Verweis-Taggung, Vergleich
// mit dem Bestand, unveränderte und geänderte Aktualisierungen sowie
// Format- und Speicherfehler.
//
// Gemockt: gesetzSpeicher.ts (ladeAlleGesetze/speichereGesetz/
// ladeGesetzesXML - eigene Zuständigkeit, bereits in gesetzSpeicher.test.ts
// getestet), importindexSuche.ts (leseGesamtenImportindex - reiner I/O-Helfer), verweisTagger.ts
// (taggeVerweise - bereits vollständig in verweisTagger.test.ts getestet, hier
// als Identität gemockt) sowie '@tauri-apps/api/core' (invoke).
// Real bleibt: parseGesetzesXML (bereits umfassend getestet, einfacher als Mock)
// und isoZeitstempel (gemeinsame UTC-Formatierung).

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { pruefeReparaturreferenz } from './gesetzImportZiel';
import { pruefeXmlWohlgeformtheit } from '@/test/plattform/xmlPruefung';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import { referenzVon } from '@/lib/domain/gesetzesreferenz';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import type { taggeVerweise as Tagger } from '@/lib/import/basis/basis.index';

const ladeAlleGesetze = vi.fn<() => Promise<GesetzDarstellung[]>>(() => Promise.resolve([]));
function speichereGesetzImpl(
  gesetz: Gesetzesreferenz,
  _xml: string,
  _optionen?: { inhaltGeaendert?: boolean },
): Promise<Gesetzesreferenz> {
  return Promise.resolve(referenzVon(gesetz));
}
const speichereGesetz = vi.fn(speichereGesetzImpl);
const ladeGesetzesXML = vi.fn<(referenz: Gesetzesreferenz) => Promise<string | null>>(() =>
  Promise.resolve(null),
);
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/gesetz/gesetz.index')>()),
  leseAbgeglichenesSuchverzeichnis: async () => ({ abgeglichen: true, eintraege: [] }),
  GesetzSpeicherFolgefehler: (
    await importOriginal<typeof import('@/lib/persistenz/gesetz/gesetz.index')>()
  ).GesetzSpeicherFolgefehler,

  ladeAlleGesetze: () => ladeAlleGesetze(),
  // Reicht die Argumente unverändert durch (KEIN fest deklariertes drittes
  // Argument), damit ein Aufruf ohne inhaltGeaendert (Default in der echten
  // speichereGesetz-Signatur) auch im Mock als 2-Argument-Aufruf sichtbar
  // bleibt - wichtig für toHaveBeenCalledWith-Assertions unten.
  speichereGesetz: (...args: Parameters<typeof speichereGesetzImpl>) => speichereGesetz(...args),
  leseGesetz: async () =>
    (await ladeGesetzesXML({ kurztitel: 'Probe', normgeber: 'de-bund' })) === null
      ? { status: 'fehlt', befunde: [] }
      : { status: 'geladen', befunde: [] },
  ladeGesetzesXML: (referenz: Gesetzesreferenz) => ladeGesetzesXML(referenz),
  // Quellenbezeichnung für den BW-Dateiimport.
  LANDESRECHT_BW_QUELLE: 'Landesrecht BW',
}));

const leseGesamtenImportindex = vi.fn<
  (dateiname: string) => Promise<{ kurztitel: string; langtitel: string }[]>
>(() => Promise.resolve([]));
vi.mock('@/lib/import/importindex/importindex.index', () => ({
  leseReferenzVerzeichnis: async (quelle: 'de-bund' | 'de-bw' | 'eu') => ({
    eintraege:
      quelle === 'eu'
        ? []
        : await leseGesamtenImportindex(quelle === 'de-bund' ? 'de-bund.xml' : 'de-bw.xml'),
    fehler: [],
  }),
  IMPORTINDEX_BUNDESRECHT_DATEINAME: 'de-bund.xml',
  IMPORTINDEX_LANDESRECHT_BW_DATEINAME: 'de-bw.xml',
}));

// Identität als Default: die meisten Tests hier prüfen die Vergleichs-/
// Kategorisierungslogik von taggeUndSpeichereGesetzesXML, nicht das
// Tagging selbst (siehe verweisTagger.test.ts). Einzelne Tests überschreiben
// dies, um die Weiterleitung an taggeVerweise zu prüfen.
const taggeVerweise = vi.fn<typeof Tagger>((xml) => xml);
vi.mock('@/lib/import/basis/basis.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  taggeVerweise: (...args: Parameters<typeof Tagger>) => taggeVerweise(...args),
}));

const invoke = vi.fn<(...args: unknown[]) => Promise<unknown>>(() => Promise.resolve());
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

import { taggeUndSpeichereGesetzesXML, taggeGesetzesXML } from './importabschluss.index';
import {
  type ImportFortschritt,
  type GesetzImportZielpruefung,
} from '@/lib/import/importVertrag.types';
import { gesetzesXMLOhneVeraenderlicheFelder } from './gesetzVergleich';
import { ermittleFruehesteVerarbeitungszeit } from '@/lib/import/dispatch/aktualisierungsKandidaten';

beforeEach(() => {
  vi.clearAllMocks();
  ladeAlleGesetze.mockResolvedValue([]);
  leseGesamtenImportindex.mockResolvedValue([]);
  ladeGesetzesXML.mockResolvedValue(null);
  speichereGesetz.mockImplementation(speichereGesetzImpl);
  taggeVerweise.mockImplementation((xml: string) => xml);
  invoke.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Fixture-Helfer
// ---------------------------------------------------------------------------

/** Baut ein minimales GesetzesXML mit den für den
 *  Aktualisierungs-Vergleich relevanten Feldern. `inhaltsMarker` steuert den
 *  eigentlichen Normtext, um XML-Strings inhaltlich unterscheidbar zu
 *  machen, ohne ausfertigung/stand zu berühren. */
function gesetzesXML(opts: {
  id?: string;
  kurztitel: string;
  verarbeitungszeit?: string;
  letzteNeuerung?: string;
  ausfertigung?: string;
  aenderungsvermerk?: string;
  neugefasst?: string;
  inhaltsMarker?: string;
}): string {
  const {
    id = 'irgendeine-id',
    kurztitel,
    verarbeitungszeit = '2026-01-01T00:00:00',
    letzteNeuerung,
    ausfertigung,
    aenderungsvermerk,
    neugefasst,
    inhaltsMarker = 'x',
  } = opts;
  const standInhalt = [
    aenderungsvermerk ? `<aenderungsvermerk>${aenderungsvermerk}</aenderungsvermerk>` : '',
    neugefasst ? `<neugefasst>${neugefasst}</neugefasst>` : '',
  ].join('');
  const stand = standInhalt ? `<stand>${standInhalt}</stand>` : '';
  return `<?xml version="1.0"?><gesetz id="${id}"><infos><langtitel>Testgesetz ${kurztitel}</langtitel><kurztitel>${kurztitel}</kurztitel><normgeber>de-bund</normgeber>${
    ausfertigung ? `<ausfertigung>${ausfertigung}</ausfertigung>` : ''
  }${stand}<verarbeitungszeit>${verarbeitungszeit}</verarbeitungszeit>${letzteNeuerung ? `<letzteNeuerung>${letzteNeuerung}</letzteNeuerung>` : ''}</infos><inhalt><norm><bezeichnung>§ ${inhaltsMarker}</bezeichnung><absatz></absatz></norm></inhalt></gesetz>`;
}

function gesetz(kurztitel: string): GesetzDarstellung {
  return {
    kurztitel,
    langtitel: kurztitel,
    hatGliederungsartikel: false,
    elemente: [],
    normgeber: 'de-bund',
  };
}

// ---------------------------------------------------------------------------
// gesetzesXMLOhneVeraenderlicheFelder
// ---------------------------------------------------------------------------

describe('gesetzesXMLOhneVeraenderlicheFelder', () => {
  it('entfernt das komplette <verarbeitungszeit>-Tag samt Inhalt (und - als Nebeneffekt der zweiten Regex - auch das id-Attribut, siehe eigener Test unten)', () => {
    const xml =
      '<gesetz id="x"><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit><inhalt>bleibt</inhalt></gesetz>';
    expect(gesetzesXMLOhneVeraenderlicheFelder(xml)).toBe(
      '<gesetz><inhalt>bleibt</inhalt></gesetz>',
    );
  });

  it('entfernt das id-Attribut des Wurzelelements', () => {
    const xml = '<gesetz id="beliebige-uuid"><verarbeitungszeit>t</verarbeitungszeit></gesetz>';
    expect(gesetzesXMLOhneVeraenderlicheFelder(xml)).toBe('<gesetz></gesetz>');
  });

  it('zwei ansonsten identische XML mit unterschiedlicher id UND verarbeitungszeit werden gleich', () => {
    const a = gesetzesXML({
      id: 'uuid-a',
      kurztitel: 'BGB',
      verarbeitungszeit: '2026-01-01T00:00:00',
    });
    const b = gesetzesXML({
      id: 'uuid-b',
      kurztitel: 'BGB',
      verarbeitungszeit: '2026-06-15T12:30:00',
    });
    expect(gesetzesXMLOhneVeraenderlicheFelder(a)).toBe(gesetzesXMLOhneVeraenderlicheFelder(b));
  });
});

// ---------------------------------------------------------------------------
// taggeUndSpeichereGesetzesXML - Erst-Import
// ---------------------------------------------------------------------------

describe('taggeUndSpeichereGesetzesXML - Erst-Import (istAktualisierung=false, Default)', () => {
  it('speichert immer, ohne ladeGesetzesXML aufzurufen, und liefert kein kategorie-Feld', async () => {
    const xml = gesetzesXML(gesetzesreferenz({ kurztitel: 'BGB' }));

    const ergebnis = await taggeUndSpeichereGesetzesXML(xml, 'BGB');

    expect(ladeGesetzesXML).not.toHaveBeenCalled();
    expect(speichereGesetz).toHaveBeenCalledWith(
      expect.objectContaining({ kurztitel: 'BGB', normgeber: 'de-bund' }),
      xml,
    );
    if (ergebnis.art !== 'erfolg') throw new Error('unerwarteter Fehler');
    expect(ergebnis.gesetz).toMatchObject({ kurztitel: 'BGB', normgeber: 'de-bund' });
    expect(ergebnis.gesetz).not.toHaveProperty('id');
  });

  it('meldet die Fortschritts-Phasen vertaggen -> speichern -> fertig', async () => {
    const meldungen: string[] = [];
    await taggeUndSpeichereGesetzesXML(
      gesetzesXML(gesetzesreferenz({ kurztitel: 'BGB' })),
      'BGB',
      (f) => meldungen.push(f.phase),
    );
    expect(meldungen).toEqual(['vertaggen', 'speichern', 'fertig']);
  });

  it('gibt einen Fehler zurück (Standardtext), wenn das getaggte XML nicht geparst werden kann', async () => {
    taggeVerweise.mockReturnValue('kaputt, kein <gesetz>');

    const ergebnis = await taggeUndSpeichereGesetzesXML('irrelevant', 'BGB');

    expect(ergebnis).toEqual({
      art: 'fehler',
      fehler: { grund: 'format', meldung: 'XML konnte nicht gelesen werden.' },
    });
    expect(speichereGesetz).not.toHaveBeenCalled();
  });

  it('nutzt einen übergebenen individuellen parseFehlerText statt des Standardtexts', async () => {
    taggeVerweise.mockReturnValue('kaputt, kein <gesetz>');

    const ergebnis = await taggeUndSpeichereGesetzesXML(
      'irrelevant',
      'BGB',
      undefined,
      'Eigener Fehlertext',
    );

    expect(ergebnis).toEqual({
      art: 'fehler',
      fehler: { grund: 'format', meldung: 'Eigener Fehlertext' },
    });
  });

  it('kennzeichnet einen Fehler beim Speichern als Speicherfehler', async () => {
    speichereGesetz.mockRejectedValueOnce(new Error('Datenträger voll'));

    await expect(
      taggeUndSpeichereGesetzesXML(gesetzesXML(gesetzesreferenz({ kurztitel: 'BGB' })), 'BGB'),
    ).resolves.toEqual({
      art: 'fehler',
      fehler: {
        grund: 'speichern',
        meldung: 'Gesetz konnte nicht gespeichert werden: Error: Datenträger voll',
      },
    });
  });

  it('funktioniert ohne fortschritt-Callback (optional)', async () => {
    await expect(
      taggeUndSpeichereGesetzesXML(gesetzesXML(gesetzesreferenz({ kurztitel: 'BGB' })), 'BGB'),
    ).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// taggeUndSpeichereGesetzesXML - Aktualisierung: unveraendert
// ---------------------------------------------------------------------------

describe('taggeUndSpeichereGesetzesXML - Aktualisierung, Inhalt UNVERÄNDERT', () => {
  it('erkennt Gleichheit trotz unterschiedlicher verarbeitungszeit/id und speichert nur den aufgefrischten verarbeitungszeit-Tag (inhaltGeaendert=false)', async () => {
    const altesXML = gesetzesXML({
      id: 'alte-uuid',
      kurztitel: 'BGB',
      verarbeitungszeit: '2026-01-01T00:00:00',
      letzteNeuerung: '2026-01-01T00:00:00',
    });
    const neuesXML = gesetzesXML({
      id: 'neue-uuid',
      kurztitel: 'BGB',
      verarbeitungszeit: '2026-06-15T12:00:00',
      letzteNeuerung: '2026-06-15T12:00:00',
    });
    ladeGesetzesXML.mockResolvedValue(altesXML);
    taggeVerweise.mockReturnValue(neuesXML);
    vi.setSystemTime(new Date('2026-08-31T10:00:00.000Z'));

    const ergebnis = await taggeUndSpeichereGesetzesXML(
      gesetzesXML(gesetzesreferenz({ kurztitel: 'BGB' })),
      'BGB',
      undefined,
      undefined,
      true,
    );

    expect(speichereGesetz).toHaveBeenCalledTimes(1);
    const [gesetzArg, xmlArg, optionenArg] = speichereGesetz.mock.calls[0]!;
    expect(optionenArg?.inhaltGeaendert).toBe(false);
    expect(gesetzArg).toMatchObject({ kurztitel: 'BGB', normgeber: 'de-bund' });
    pruefeXmlWohlgeformtheit(xmlArg);
    expect(xmlArg).toContain('<verarbeitungszeit>2026-08-31T10:00:00Z</verarbeitungszeit>');
    expect(xmlArg).toContain('<letzteNeuerung>2026-01-01T00:00:00</letzteNeuerung>');
    // Der Rest der Datei bleibt das ALTE XML (nur verarbeitungszeit gepatcht):
    expect(gesetzesXMLOhneVeraenderlicheFelder(xmlArg as string)).toBe(
      gesetzesXMLOhneVeraenderlicheFelder(altesXML),
    );

    if ('fehler' in ergebnis) throw new Error('unerwarteter Fehler');
    expect(ergebnis.kategorie).toBe('unveraendert');

    vi.useRealTimers();
  });

  it('meldet die Fortschritts-Phasen speichern ("Prüfzeitpunkt") -> fertig ("keine Neuerungen")', async () => {
    const xml = gesetzesXML(gesetzesreferenz({ kurztitel: 'BGB' }));
    ladeGesetzesXML.mockResolvedValue(xml);
    taggeVerweise.mockReturnValue(xml);

    const meldungen: ImportFortschritt[] = [];
    await taggeUndSpeichereGesetzesXML(
      gesetzesXML(gesetzesreferenz({ kurztitel: 'BGB' })),
      'BGB',
      (f) => meldungen.push(f),
      undefined,
      true,
    );

    expect(meldungen.map((m) => m.phase)).toEqual(['vertaggen', 'speichern', 'fertig']);
    expect(meldungen[1]!.meldung).toContain('Prüfzeitpunkt');
    expect(meldungen[2]!.meldung).toContain('keine Neuerungen');
  });

  it('gibt bei übergebenem bestehendesGesetz eine Kopie mit Bestandsreferenz und Prüfzeitpunkt zurück, ohne neu zu parsen', async () => {
    const xml = gesetzesXML(gesetzesreferenz({ kurztitel: 'BGB' }));
    ladeGesetzesXML.mockResolvedValue(xml);
    taggeVerweise.mockReturnValue(xml);
    vi.setSystemTime(new Date('2026-08-31T10:00:00.000Z'));

    const bestehendesGesetz = gesetz('BGB');
    const ergebnis = await taggeUndSpeichereGesetzesXML(
      gesetzesXML(gesetzesreferenz({ kurztitel: 'BGB' })),
      'BGB',
      undefined,
      undefined,
      true,
      bestehendesGesetz,
    );

    if (ergebnis.art !== 'erfolg') throw new Error('unerwarteter Fehler');
    expect(ergebnis.gesetz).not.toBe(bestehendesGesetz); // Kopie, nicht Mutation
    expect(ergebnis.gesetz).toMatchObject({
      ...bestehendesGesetz,
      normgeber: 'de-bund',
      verarbeitungszeit: new Date('2026-08-31T10:00:00.000Z'),
    });

    vi.useRealTimers();
  });

  it('ohne bestehendesGesetz: parst das aufgefrischte XML neu und übernimmt die Bestandsreferenz', async () => {
    const xml = gesetzesXML(gesetzesreferenz({ kurztitel: 'BGB' }));
    ladeGesetzesXML.mockResolvedValue(xml);
    taggeVerweise.mockReturnValue(xml);

    const ergebnis = await taggeUndSpeichereGesetzesXML(
      gesetzesXML(gesetzesreferenz({ kurztitel: 'BGB' })),
      'BGB',
      undefined,
      undefined,
      true,
    );

    if (ergebnis.art !== 'erfolg') throw new Error('unerwarteter Fehler');
    expect(ergebnis.gesetz.kurztitel).toBe('BGB');
    expect(ergebnis.gesetz).toMatchObject({ kurztitel: 'BGB', normgeber: 'de-bund' });
    expect(ergebnis.gesetz).not.toHaveProperty('id');
  });
});

// ---------------------------------------------------------------------------
// taggeUndSpeichereGesetzesXML - Aktualisierung: Inhalt geändert
// ---------------------------------------------------------------------------

describe('taggeUndSpeichereGesetzesXML - Aktualisierung, Inhalt GEÄNDERT', () => {
  it('kategorie "aktualisiert", wenn nur der Text sich ändert, ausfertigung/stand aber gleich bleiben', async () => {
    const altesXML = gesetzesXML({
      kurztitel: 'BGB',
      ausfertigung: '1900-01-01',
      aenderungsvermerk: '2020-01-01',
      inhaltsMarker: 'alt',
      letzteNeuerung: '2026-01-01T00:00:00',
    });
    const neuesXML = gesetzesXML({
      kurztitel: 'BGB',
      ausfertigung: '1900-01-01',
      aenderungsvermerk: '2020-01-01',
      inhaltsMarker: 'neu',
      letzteNeuerung: '2026-06-01T00:00:00',
    });
    ladeGesetzesXML.mockResolvedValue(altesXML);
    taggeVerweise.mockReturnValue(neuesXML);

    const ergebnis = await taggeUndSpeichereGesetzesXML(
      gesetzesXML(gesetzesreferenz({ kurztitel: 'BGB' })),
      'BGB',
      undefined,
      undefined,
      true,
    );

    if ('fehler' in ergebnis) throw new Error('unerwarteter Fehler');
    expect(ergebnis.kategorie).toBe('aktualisiert');
    expect(speichereGesetz).toHaveBeenCalledWith(
      expect.objectContaining({ kurztitel: 'BGB', normgeber: 'de-bund' }),
      neuesXML,
    );
  });

  it('kategorie "aktualisiert", wenn sich zusätzlich ausfertigung ändert', async () => {
    const altesXML = gesetzesXML({
      kurztitel: 'BGB',
      ausfertigung: '1900-01-01',
      aenderungsvermerk: '2020-01-01',
      inhaltsMarker: 'alt',
    });
    const neuesXML = gesetzesXML({
      kurztitel: 'BGB',
      ausfertigung: '1900-06-01',
      aenderungsvermerk: '2020-01-01',
      inhaltsMarker: 'neu',
    });
    ladeGesetzesXML.mockResolvedValue(altesXML);
    taggeVerweise.mockReturnValue(neuesXML);

    const ergebnis = await taggeUndSpeichereGesetzesXML(
      gesetzesXML(gesetzesreferenz({ kurztitel: 'BGB' })),
      'BGB',
      undefined,
      undefined,
      true,
    );

    if ('fehler' in ergebnis) throw new Error('unerwarteter Fehler');
    expect(ergebnis.kategorie).toBe('aktualisiert');
  });

  it('kategorie "aktualisiert", wenn sich zusätzlich aenderungsvermerk (<stand><aenderungsvermerk>) ändert', async () => {
    const altesXML = gesetzesXML({
      kurztitel: 'BGB',
      ausfertigung: '1900-01-01',
      aenderungsvermerk: '2020-01-01',
      inhaltsMarker: 'alt',
    });
    const neuesXML = gesetzesXML({
      kurztitel: 'BGB',
      ausfertigung: '1900-01-01',
      aenderungsvermerk: '2021-01-01',
      inhaltsMarker: 'neu',
    });
    ladeGesetzesXML.mockResolvedValue(altesXML);
    taggeVerweise.mockReturnValue(neuesXML);

    const ergebnis = await taggeUndSpeichereGesetzesXML(
      gesetzesXML(gesetzesreferenz({ kurztitel: 'BGB' })),
      'BGB',
      undefined,
      undefined,
      true,
    );

    if ('fehler' in ergebnis) throw new Error('unerwarteter Fehler');
    expect(ergebnis.kategorie).toBe('aktualisiert');
  });

  it('kategorie "aktualisiert", wenn sich zusätzlich neugefasst (<stand><neugefasst>) ändert', async () => {
    const altesXML = gesetzesXML({
      kurztitel: 'BGB',
      ausfertigung: '1900-01-01',
      neugefasst: '2020-01-01',
      inhaltsMarker: 'alt',
    });
    const neuesXML = gesetzesXML({
      kurztitel: 'BGB',
      ausfertigung: '1900-01-01',
      neugefasst: '2021-01-01',
      inhaltsMarker: 'neu',
    });
    ladeGesetzesXML.mockResolvedValue(altesXML);
    taggeVerweise.mockReturnValue(neuesXML);

    const ergebnis = await taggeUndSpeichereGesetzesXML(
      gesetzesXML(gesetzesreferenz({ kurztitel: 'BGB' })),
      'BGB',
      undefined,
      undefined,
      true,
    );

    if ('fehler' in ergebnis) throw new Error('unerwarteter Fehler');
    expect(ergebnis.kategorie).toBe('aktualisiert');
  });

  it('keine vorherige Datei vorhanden (ladeGesetzesXML liefert null) -> "aktualisiert"', async () => {
    ladeGesetzesXML.mockResolvedValue(null);
    const neuesXML = gesetzesXML({ kurztitel: 'BGB', inhaltsMarker: 'neu' });
    taggeVerweise.mockReturnValue(neuesXML);

    const ergebnis = await taggeUndSpeichereGesetzesXML(
      gesetzesXML(gesetzesreferenz({ kurztitel: 'BGB' })),
      'BGB',
      undefined,
      undefined,
      true,
    );

    if ('fehler' in ergebnis) throw new Error('unerwarteter Fehler');
    expect(ergebnis.kategorie).toBe('aktualisiert');
  });

  it('meldet die Fortschritts-Phasen speichern ("Wird gespeichert") -> fertig ("erfolgreich aktualisiert")', async () => {
    const altesXML = gesetzesXML({ kurztitel: 'BGB', inhaltsMarker: 'alt' });
    ladeGesetzesXML.mockResolvedValue(altesXML);
    taggeVerweise.mockReturnValue(gesetzesXML({ kurztitel: 'BGB', inhaltsMarker: 'neu' }));

    const meldungen: ImportFortschritt[] = [];
    await taggeUndSpeichereGesetzesXML(
      gesetzesXML(gesetzesreferenz({ kurztitel: 'BGB' })),
      'BGB',
      (f) => meldungen.push(f),
      undefined,
      true,
    );

    expect(meldungen.map((m) => m.phase)).toEqual(['vertaggen', 'speichern', 'fertig']);
    expect(meldungen[1]!.meldung).toContain('Wird gespeichert');
    expect(meldungen[2]!.meldung).toContain('erfolgreich aktualisiert');
  });
});

// ---------------------------------------------------------------------------
// ermittleFruehesteVerarbeitungszeit
// ---------------------------------------------------------------------------

describe('ermittleFruehesteVerarbeitungszeit', () => {
  it('gibt null zurück, wenn keine Kandidaten vorliegen', () => {
    expect(ermittleFruehesteVerarbeitungszeit([])).toBeNull();
  });

  it('berücksichtigt nur vorhandene verarbeitungszeit-Werte', () => {
    const kandidat: GesetzDarstellung = {
      ...gesetz('BGB'),
      verarbeitungszeit: new Date('2026-06-01'),
    };
    expect(ermittleFruehesteVerarbeitungszeit([gesetz('StGB'), kandidat])).toEqual(
      new Date('2026-06-01'),
    );
  });

  it('gibt null zurück, wenn kein Kandidat eine verarbeitungszeit hat', () => {
    expect(ermittleFruehesteVerarbeitungszeit([gesetz('BGB'), gesetz('StGB')])).toBeNull();
  });

  it('MUTATIONSTEST: property - liefert stets das früheste Datum unter allen Kandidaten (Vergleich mit Math.min)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 2_000_000_000_000 }), { minLength: 1, maxLength: 10 }),
        (zeitstempel) => {
          const kandidaten = zeitstempel.map((t) => ({
            ...gesetz('X'),
            verarbeitungszeit: new Date(t),
          }));
          const ergebnis = ermittleFruehesteVerarbeitungszeit(kandidaten);
          expect(ergebnis?.getTime()).toBe(Math.min(...zeitstempel));
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// Import-/Aktualisierungs-Lock
// ---------------------------------------------------------------------------

describe('Reparaturzielprüfung vor jedem Schreiben', () => {
  const xml = () =>
    gesetzesXML(gesetzesreferenz({ kurztitel: 'BGB' })).replace(
      '</infos>',
      '<datenquelle name="Gesetze im Internet"/></infos>',
    );

  function zielpruefung() {
    return {
      ziel: { dateiBasis: 'BGB_de-bund', kurztitel: 'BGB', quelle: 'de-bund' as const },
      vorSchreiben: vi.fn(async () => {}),
    } satisfies GesetzImportZielpruefung;
  }

  it.each(['dateiBasis', 'kurztitel', 'quelle'] as const)(
    'verhindert Schreiben bei abweichendem %s',
    async (feld) => {
      const pruefung = zielpruefung();
      const ziel = { ...pruefung.ziel, [feld]: feld === 'quelle' ? ('de-bw' as const) : 'anderes' };
      const ergebnis = await taggeUndSpeichereGesetzesXML(
        xml(),
        'BGB',
        undefined,
        undefined,
        false,
        undefined,
        { ...pruefung, ziel },
      );
      expect(ergebnis).toMatchObject({ art: 'fehler', fehler: { grund: 'format' } });
      expect(speichereGesetz).not.toHaveBeenCalled();
      expect(pruefung.vorSchreiben).not.toHaveBeenCalled();
    },
  );

  it.each(['import', 'unveraendert', 'geaendert'] as const)(
    'prüft das aktuelle Ziel vor dem Schreibpfad %s',
    async (pfad) => {
      const pruefung = zielpruefung();
      pruefung.vorSchreiben.mockImplementation(async () => {
        expect(speichereGesetz).not.toHaveBeenCalled();
      });
      if (pfad === 'unveraendert') ladeGesetzesXML.mockResolvedValue(xml());
      if (pfad === 'geaendert')
        ladeGesetzesXML.mockResolvedValue(gesetzesXML({ kurztitel: 'BGB', inhaltsMarker: 'alt' }));
      if (pfad === 'import') {
        await taggeUndSpeichereGesetzesXML(
          xml(),
          'BGB',
          undefined,
          undefined,
          false,
          undefined,
          pruefung,
        );
      } else {
        await taggeUndSpeichereGesetzesXML(
          xml(),
          'BGB',
          undefined,
          undefined,
          true,
          undefined,
          pruefung,
        );
      }
      expect(pruefung.vorSchreiben).toHaveBeenCalledTimes(1);
      expect(speichereGesetz).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['import', 'unveraendert', 'geaendert'] as const)(
    'reicht den Prüfungsabbruch im Schreibpfad %s unverändert durch',
    async (pfad) => {
      const pruefung = zielpruefung();
      const abbruch = new Error('Ziel fehlt oder ist bereits gültig');
      pruefung.vorSchreiben.mockRejectedValue(abbruch);
      if (pfad === 'unveraendert') ladeGesetzesXML.mockResolvedValue(xml());
      if (pfad === 'geaendert')
        ladeGesetzesXML.mockResolvedValue(gesetzesXML({ kurztitel: 'BGB', inhaltsMarker: 'alt' }));
      const arbeit =
        pfad === 'import'
          ? taggeUndSpeichereGesetzesXML(
              xml(),
              'BGB',
              undefined,
              undefined,
              false,
              undefined,
              pruefung,
            )
          : taggeUndSpeichereGesetzesXML(
              xml(),
              'BGB',
              undefined,
              undefined,
              true,
              undefined,
              pruefung,
            );
      await expect(arbeit).rejects.toBe(abbruch);
      expect(speichereGesetz).not.toHaveBeenCalled();
    },
  );

  it('akzeptiert ein passendes BW-Ziel mit eigener Dateibasis', async () => {
    const pruefung = zielpruefung();
    const bwXML = xml()
      .replace('Gesetze im Internet', 'Landesrecht BW')
      .replace('<normgeber>de-bund</normgeber>', '<normgeber>de-bw</normgeber>');
    await expect(
      taggeUndSpeichereGesetzesXML(bwXML, 'BGB', undefined, undefined, false, undefined, {
        ...pruefung,
        ziel: { dateiBasis: 'BGB_de-bw', kurztitel: 'BGB', quelle: 'de-bw' },
      }),
    ).resolves.toMatchObject({ art: 'erfolg', gesetz: { kurztitel: 'BGB', normgeber: 'de-bw' } });
    expect(pruefung.vorSchreiben).toHaveBeenCalledTimes(1);
  });
});

it('erhält das tatsächliche Reparaturdateiziel bei abweichender Schreibweise derselben Referenz', async () => {
  const vorSchreiben = vi.fn(async () => {});
  speichereGesetz.mockResolvedValueOnce({ kurztitel: 'bgb', normgeber: 'de-bund' });
  const ergebnis = await taggeUndSpeichereGesetzesXML(
    gesetzesXML(gesetzesreferenz({ kurztitel: 'BGB' })),
    'BGB',
    undefined,
    undefined,
    false,
    undefined,
    {
      ziel: { dateiBasis: 'bgb_de-bund', kurztitel: 'bgb', quelle: 'de-bund' },
      vorSchreiben,
    },
  );
  expect(ergebnis).toMatchObject({
    art: 'erfolg',
    gesetz: { kurztitel: 'bgb', normgeber: 'de-bund' },
  });
  expect(speichereGesetz).toHaveBeenCalledWith(
    expect.objectContaining({ kurztitel: 'bgb', normgeber: 'de-bund' }),
    expect.any(String),
  );
  expect(vorSchreiben).toHaveBeenCalledExactlyOnceWith();
});

describe('taggeGesetzesXML – Weitergabe des Normpräfix-Profils', () => {
  it.each([
    ['<normpraefix>Can.</normpraefix>', 'canon'],
    ['<normpraefix>§</normpraefix>', 'paragraph'],
    ['<normpraefix>Art.</normpraefix>', 'artikel'],
    ['', undefined],
  ])('reicht das XML-Profil %s ohne neue Referenzen weiter', async (feld, familie) => {
    const xml = `<gesetz><infos><normgeber>unbekannt</normgeber><kurztitel>CIC</kurztitel>${feld}</infos><inhalt/></gesetz>`;
    expect(await taggeGesetzesXML(xml, 'CIC', 'unbekannt')).toBe(xml);
    expect(taggeVerweise).toHaveBeenCalledExactlyOnceWith(
      xml,
      { kurztitel: 'CIC', normgeber: 'unbekannt' },
      [],
      { normpraefix: familie },
    );
    expect(leseGesamtenImportindex).not.toHaveBeenCalled();
  });
});

it.each([false, true])(
  'übernimmt die gespeicherte Referenz mit Normgeber unbekannt aus Rückgabe oder Folgefehler (%s)',
  async (folgefehler) => {
    const { GesetzSpeicherFolgefehler } = await import('@/test/tabs/gesetzSpeicherTestzugang');
    const { speichereImportGesetz } = await import('./gesetzImportSpeichern');
    const eingabe = gesetz('Xyz');
    eingabe.normgeber = 'unbekannt';
    if (folgefehler)
      speichereGesetz.mockRejectedValueOnce(
        new GesetzSpeicherFolgefehler(true, new Error('Titel'), {
          kurztitel: 'XYZ',
          normgeber: 'unbekannt',
        }),
      );
    else speichereGesetz.mockResolvedValueOnce({ kurztitel: 'XYZ', normgeber: 'unbekannt' });
    expect(await speichereImportGesetz(eingabe, '<gesetz/>', true, () => {})).toBeNull();
    expect(eingabe.kurztitel).toBe('XYZ');
    expect(eingabe.normgeber).toBe('unbekannt');
    expect(speichereGesetz).toHaveBeenCalledTimes(1);
  },
);

describe('Reparaturreferenz aus der Dateibasis', () => {
  const ziel = { dateiBasis: 'BGB_de-bund', kurztitel: 'BGB', quelle: 'de-bund' as const };

  it.each([
    { kurztitel: 'BGB', normgeber: 'de-bund' },
    { kurztitel: 'bGb', normgeber: 'de-bund' },
  ])('akzeptiert die passende Referenz unabhängig von der Schreibweise: %j', (referenz) => {
    expect(pruefeReparaturreferenz(ziel, referenz)).toBeNull();
  });

  it.each([
    { kurztitel: 'HGB', normgeber: 'de-bund' },
    { kurztitel: 'BGB', normgeber: 'de-bw' },
    { kurztitel: 'BGB', normgeber: 'unbekannt' },
  ])('lehnt eine abweichende Referenz ab: %j', (referenz) => {
    expect(pruefeReparaturreferenz(ziel, referenz)).toMatchObject({ grund: 'format' });
  });

  it.each(['HGB_de-bund', 'BGB_de-bw', 'BGB_unbekannt', 'keine-dateibasis'])(
    'lehnt eine abweichende oder ungültige Dateibasis ab: %s',
    (dateiBasis) => {
      expect(
        pruefeReparaturreferenz(
          { ...ziel, dateiBasis },
          { kurztitel: 'BGB', normgeber: 'de-bund' },
        ),
      ).toMatchObject({
        grund: 'format',
      });
    },
  );
});

// Bestehende Szenarioattrappe des früheren Sammelwegs nur im Testzugang.
vi.mock('@/test/tabs/gesetzSpeicherTestzugang', async (original) => ({
  ...(await original<typeof import('@/test/tabs/gesetzSpeicherTestzugang')>()),
  ladeAlleGesetze: () => ladeAlleGesetze(),
}));

// ---------------------------------------------------------------------------
// Leerschutz: Quelle ohne Normen
// ---------------------------------------------------------------------------

describe('taggeUndSpeichereGesetzesXML - Leerschutz', () => {
  const ohneNormen = gesetzesXML({ kurztitel: 'BGB' }).replace(/<norm>.*<\/norm>/, '');

  it('weist einen Erstimport ohne Normen als Formatfehler ab und speichert nichts', async () => {
    const ergebnis = await taggeUndSpeichereGesetzesXML(ohneNormen, 'BGB');
    expect(ergebnis).toMatchObject({ art: 'fehler', fehler: { grund: 'format' } });
    expect(speichereGesetz).not.toHaveBeenCalled();
  });

  it('lässt bei einer Aktualisierung ohne Normen den Bestand unverändert', async () => {
    const bestand = gesetzesXML(gesetzesreferenz({ kurztitel: 'BGB' }));
    ladeGesetzesXML.mockResolvedValue(bestand);
    const ergebnis = await taggeUndSpeichereGesetzesXML(
      ohneNormen,
      'BGB',
      undefined,
      undefined,
      true,
      gesetz('BGB'),
    );
    expect(ergebnis).toMatchObject({ art: 'fehler', fehler: { grund: 'format' } });
    expect(speichereGesetz).not.toHaveBeenCalled();
  });
});
