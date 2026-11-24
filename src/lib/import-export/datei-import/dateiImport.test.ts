// dateiImport.test.ts
//
// Unit-Tests für entpackeZip und verarbeiteDateien (Haupteinstiegspunkt für
// Dialog-Mehrfachauswahl/ZIP-Import). Testgegenstand ist hier NICHT mehr die
// Format-spezifische Verarbeitung von Gesetz-Dateien selbst (Kurztitel-
// Override, Kernfelder-Lesen, Vergleich – seit dem lib/import-Modul-Umbau in
// gesetzDateiVerarbeitung.ts, siehe gesetzDateiVerarbeitung.test.ts), sondern
// nur noch die Orchestrierung: Verdrahtung Format-String -> Verarbeitungspfad,
// Weiterleitung an verarbeiteGesetzDatei/vergleicheMitBestand/
// uebernehmeImportindexDatei/verarbeiteEinfacheDatei, und die
// Speichern-nur-bei-'neu'-Entscheidung samt zeigeVerarbeitungszeitDaten-Verzweigung
// (nur bei kanonisch-xml werden bestehendeVerarbeitungszeit/importierteVerarbeitungszeit gesetzt).
//
// entpackeZip nutzt bewusst die echte 'fflate'-Bibliothek (kein Mock) – sie
// ist reine, deterministische (De-)Kompression ohne I/O, ein Fake wäre hier
// weniger aussagekräftig als ein echtes kleines Test-ZIP.

import { gesetzDarstellung, gesetzInfos, gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { istGleichesGesetz } from '@/lib/domain/gesetzesreferenz';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { entpackeZip, verarbeiteDateien } from './dateiImport';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';

const { pruefeSchemaversion, vorgang } = vi.hoisted(() => ({
  pruefeSchemaversion: vi.fn().mockResolvedValue(undefined),
  vorgang: vi.fn(),
}));
vi.mock('@/lib/persistenz/kern/kern.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/kern/kern.index')>()),
  pruefeSchemaversion,
}));

const erkenneDateiFormat = vi.fn<(inhalt: string, name: string) => string>();
vi.mock('@/lib/import-export/datei-import/formatErkennung', () => ({
  erkenneDateiFormat: (...args: [string, string]) => erkenneDateiFormat(...args),
}));

const leseNachbereitungBeiImport =
  vi.fn<() => import('@/lib/einstellungen/einstellungen.index').NachbereitungBeiImport>();
vi.mock('@/lib/einstellungen/einstellungen.index', async (original) => ({
  ...(await original<typeof import('@/lib/einstellungen/einstellungen.index')>()),
  leseNachbereitungBeiImport: () => leseNachbereitungBeiImport(),
}));

type GesetzVerarbeitet =
  | {
      getaggtesXML: string;
      gesetz: ReturnType<typeof gesetzInfos>;
    }
  | { fehler: string };

const verarbeiteGesetzDatei = vi.fn<(...args: unknown[]) => Promise<GesetzVerarbeitet>>();
const vergleicheMitBestand =
  vi.fn<(...args: unknown[]) => Promise<'neu' | 'unveraendert' | 'geaendert'>>();
vi.mock('@/lib/import/import.index', () => ({
  mitGesetzDateiImport: (...args: unknown[]) => vorgang(...args),
  verarbeiteGesetzDatei: (...args: unknown[]) => verarbeiteGesetzDatei(...args),
  vergleicheMitBestand: (...args: unknown[]) => vergleicheMitBestand(...args),
  uebernehmeImportindexDatei: (...args: [string]) => uebernehmeImportindexDatei(...args),
}));

/** Dateioperation, die die Attrappe des Datei-Imports an die Arbeit übergibt. */
const importiereGesetzDatei = async (...args: unknown[]) => {
  const verarbeitet = await verarbeiteGesetzDatei(...args);
  if ('fehler' in verarbeitet) {
    return { art: 'fehler', fehler: { grund: 'format', meldung: verarbeitet.fehler } };
  }
  const vergleich = await vergleicheMitBestand(verarbeitet.getaggtesXML, verarbeitet.gesetz);
  if (vergleich === 'neu') {
    await speichereGesetz(verarbeitet.gesetz, verarbeitet.getaggtesXML);
    return { art: 'neu', kurztitel: verarbeitet.gesetz.kurztitel };
  }
  if (vergleich === 'unveraendert') {
    return { art: 'unveraendert', kurztitel: verarbeitet.gesetz.kurztitel };
  }
  const format = args[0];
  const bestehendes =
    format === 'kanonisch-xml'
      ? (await ladeAlleGesetze()).find((g) => istGleichesGesetz(g, verarbeitet.gesetz))
      : undefined;
  return {
    art: 'konflikt',
    kurztitel: verarbeitet.gesetz.kurztitel,
    neuesXML: verarbeitet.getaggtesXML,
    neuesGesetz: verarbeitet.gesetz,
    bestehendeVerarbeitungszeit: bestehendes?.verarbeitungszeit,
    importierteVerarbeitungszeit:
      format === 'kanonisch-xml' ? verarbeitet.gesetz.verarbeitungszeit : undefined,
  };
};

const ladeAlleGesetze = vi.fn<() => Promise<GesetzDarstellung[]>>();
const speichereGesetz = vi.fn<(...args: unknown[]) => Promise<void>>();
vi.mock('@/lib/persistenz/gesetz/gesetz.index', () => ({
  ladeAlleGesetze: () => ladeAlleGesetze(),
  speichereGesetz: (...args: unknown[]) => speichereGesetz(...args),
}));

const uebernehmeImportindexDatei =
  vi.fn<
    (inhalt: string) => Promise<{ kategorie: 'de-bund' | 'de-bw'; aktion: 'neu' | 'unveraendert' }>
  >();

const verarbeiteEinfacheDatei = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/import-export/datei-import/dateiImport.einfach', async (original) => ({
  ...(await original<typeof import('./dateiImport.einfach')>()),
  verarbeiteEinfacheDatei: (...args: unknown[]) => verarbeiteEinfacheDatei(...args),
  meldeAenderung: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  pruefeSchemaversion.mockResolvedValue(undefined);
  vorgang.mockImplementation(async (arbeit) => arbeit(importiereGesetzDatei));
  leseNachbereitungBeiImport.mockReturnValue('aus');
  speichereGesetz.mockResolvedValue(undefined);
});

it('prüft die Schemaversion jeder übergebenen Datei vor der Formaterkennung', async () => {
  erkenneDateiFormat.mockReturnValue('unbekannt');
  await verarbeiteDateien([
    { name: 'a.xml', inhalt: '<gesetz version="2"/>' },
    { name: 'b.xml', inhalt: '<importindex version="1"/>' },
  ]);
  expect(pruefeSchemaversion).toHaveBeenCalledTimes(2);
  expect(pruefeSchemaversion).toHaveBeenNthCalledWith(
    1,
    '<gesetz version="2"/>',
    expect.any(Function),
  );
  expect(pruefeSchemaversion).toHaveBeenNthCalledWith(
    2,
    '<importindex version="1"/>',
    expect.any(Function),
  );
  expect(pruefeSchemaversion.mock.invocationCallOrder[0]!).toBeLessThan(
    erkenneDateiFormat.mock.invocationCallOrder[0]!,
  );
});

// ---------------------------------------------------------------------------
// entpackeZip
// ---------------------------------------------------------------------------

describe('entpackeZip', () => {
  it('entpackt alle enthaltenen .xml/.html-Dateien flach, unabhängig von der Ordnerstruktur', async () => {
    const gepackt = zipSync({
      'unterordner/a.xml': strToU8('<a/>'),
      'b.html': strToU8('<b/>'),
    });
    const ergebnis = await entpackeZip(gepackt.buffer as ArrayBuffer);
    expect(ergebnis).toEqual(
      expect.arrayContaining([
        { name: 'a.xml', inhalt: '<a/>', quelle: 'unterordner/a.xml' },
        { name: 'b.html', inhalt: '<b/>', quelle: 'b.html' },
      ]),
    );
    expect(ergebnis).toHaveLength(2);
  });

  it('ignoriert Nicht-XML/HTML-Dateien (z.B. .txt, .json) im ZIP', async () => {
    const gepackt = zipSync({
      'a.xml': strToU8('<a/>'),
      'readme.txt': strToU8('info'),
      'daten.json': strToU8('{}'),
    });
    const ergebnis = await entpackeZip(gepackt.buffer as ArrayBuffer);
    expect(ergebnis).toEqual([{ name: 'a.xml', inhalt: '<a/>', quelle: 'a.xml' }]);
  });

  it('erkennt Dateiendungen case-insensitiv (.XML)', async () => {
    const gepackt = zipSync({ 'A.XML': strToU8('<a/>') });
    const ergebnis = await entpackeZip(gepackt.buffer as ArrayBuffer);
    expect(ergebnis).toEqual([{ name: 'A.XML', inhalt: '<a/>', quelle: 'A.XML' }]);
  });

  it('leeres ZIP -> leeres Ergebnis', async () => {
    const gepackt = zipSync({});
    const ergebnis = await entpackeZip(gepackt.buffer as ArrayBuffer);
    expect(ergebnis).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// verarbeiteDateien: unbekannt/zip
// ---------------------------------------------------------------------------

describe('verarbeiteDateien: unbekanntes Format / verschachtelte ZIP', () => {
  it('unbekanntes Format -> genau ein Fehler formatUnbekannt, kein Konflikt/Berichtseintrag', async () => {
    erkenneDateiFormat.mockReturnValue('unbekannt');
    const ergebnis = await verarbeiteDateien([{ name: 'seltsam.dat', inhalt: 'xyz' }]);
    expect(ergebnis.fehler).toEqual([{ grund: 'formatUnbekannt', datei: 'seltsam.dat' }]);
    expect(ergebnis.konflikte).toEqual([]);
    expect(ergebnis.berichtEintraege).toEqual([]);
  });

  it('verschachtelte ZIP -> genau ein Fehler zipVerschachtelt, statt sie zu entpacken', async () => {
    erkenneDateiFormat.mockReturnValue('zip');
    const ergebnis = await verarbeiteDateien([{ name: 'archiv.zip', inhalt: 'PK...' }]);
    expect(ergebnis.fehler).toEqual([{ grund: 'zipVerschachtelt', datei: 'archiv.zip' }]);
  });
});

// ---------------------------------------------------------------------------
// verarbeiteDateien: einfache Formate (dünne Weiterleitung an
// verarbeiteEinfacheDatei aus dateiImport.einfach.ts)
// ---------------------------------------------------------------------------

describe('verarbeiteDateien: einfache Formate', () => {
  it("Ergebnis MIT 'importInhalt' -> als Konflikt gesammelt, kein Berichtseintrag", async () => {
    erkenneDateiFormat.mockReturnValue('favoriten-xml');
    const konflikt = { art: 'favoriten', anzeigename: 'BGB Favoriten', importInhalt: '<x/>' };
    verarbeiteEinfacheDatei.mockResolvedValue(konflikt);

    const ergebnis = await verarbeiteDateien([{ name: 'f.xml', inhalt: '<x/>' }]);

    expect(verarbeiteEinfacheDatei).toHaveBeenCalledWith('favoriten-xml', '<x/>');
    expect(ergebnis.konflikte).toEqual([konflikt]);
    expect(ergebnis.berichtEintraege).toEqual([]);
  });

  it("Ergebnis OHNE 'importInhalt' -> als BerichtEintrag (kategorie/aktion/name) übernommen", async () => {
    erkenneDateiFormat.mockReturnValue('markierung-xml');
    verarbeiteEinfacheDatei.mockResolvedValue({
      art: 'neu',
      kategorie: 'markierung',
      name: 'ZPO',
    });

    const ergebnis = await verarbeiteDateien([{ name: 'm.xml', inhalt: '<x/>' }]);

    expect(ergebnis.berichtEintraege).toEqual([
      { kategorie: 'markierung', aktion: 'neu', name: 'ZPO' },
    ]);
    expect(ergebnis.konflikte).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// verarbeiteDateien: index-xml
// ---------------------------------------------------------------------------

describe('verarbeiteDateien: index-xml', () => {
  it('Bundesrecht-Index (uebernehmeImportindexDatei meldet kategorie "de-bund") -> Bericht "Bundesrecht"', async () => {
    erkenneDateiFormat.mockReturnValue('index-xml');
    uebernehmeImportindexDatei.mockResolvedValue({ kategorie: 'de-bund', aktion: 'neu' });

    const ergebnis = await verarbeiteDateien([{ name: 'index.xml', inhalt: '<importindex/>' }]);

    expect(uebernehmeImportindexDatei).toHaveBeenCalledWith('<importindex/>');
    expect(ergebnis.berichtEintraege).toEqual([
      { kategorie: 'index', aktion: 'neu', name: 'Bundesrecht' },
    ]);
  });

  it('BW-Index (uebernehmeImportindexDatei meldet kategorie "de-bw") -> Bericht "Landesrecht BW"', async () => {
    erkenneDateiFormat.mockReturnValue('index-xml');
    uebernehmeImportindexDatei.mockResolvedValue({ kategorie: 'de-bw', aktion: 'unveraendert' });

    const ergebnis = await verarbeiteDateien([
      { name: 'index.xml', inhalt: '<importindex>landesrecht-bw.de</importindex>' },
    ]);

    expect(uebernehmeImportindexDatei).toHaveBeenCalledWith(
      '<importindex>landesrecht-bw.de</importindex>',
    );
    expect(ergebnis.berichtEintraege).toEqual([
      { kategorie: 'index', aktion: 'unveraendert', name: 'Landesrecht BW' },
    ]);
  });
});

// ---------------------------------------------------------------------------
// verarbeiteDateien: Gesetz-Formate (bja-xml/kanonisch-xml/html-bw)
// ---------------------------------------------------------------------------

describe('verarbeiteDateien: Gesetz-Formate – Orchestrierung', () => {
  it.each(['aus', 'verweise', 'saetze', 'saetze-und-verweise'] as const)(
    'leitet den Nachbereitungsmodus %s aus der Nutzereinstellung weiter',
    async (modus) => {
      erkenneDateiFormat.mockReturnValue('kanonisch-xml');
      leseNachbereitungBeiImport.mockReturnValue(modus);
      verarbeiteGesetzDatei.mockResolvedValue({
        getaggtesXML: '<getaggt/>',
        gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
      });
      vergleicheMitBestand.mockResolvedValue('neu');

      await verarbeiteDateien([{ name: 'g.xml', inhalt: '<gesetz/>' }]);

      expect(verarbeiteGesetzDatei).toHaveBeenCalledWith('kanonisch-xml', '<gesetz/>', {
        nachbereitungBeiImport: modus,
        meldungEmpfangen: expect.any(Function),
      });
    },
  );

  it('verarbeiteGesetzDatei liefert Fehler -> Fehlerzeile, kein Vergleich/Speichern', async () => {
    erkenneDateiFormat.mockReturnValue('bja-xml');
    verarbeiteGesetzDatei.mockResolvedValue({ fehler: 'Kaputtes XML' });

    const ergebnis = await verarbeiteDateien([{ name: 'g.xml', inhalt: '<x/>' }]);

    expect(ergebnis.fehler).toEqual([]);
    expect(ergebnis.berichtEintraege[0]).toMatchObject({
      kategorie: 'gesetz',
      aktion: 'nichtUebernommen',
      name: 'g.xml',
      meldungen: [expect.objectContaining({ text: 'Kaputtes XML' })],
    });
    expect(vergleicheMitBestand).not.toHaveBeenCalled();
    expect(speichereGesetz).not.toHaveBeenCalled();
  });

  it("vergleich 'neu' -> speichereGesetz aufgerufen, Berichtseintrag 'neu'", async () => {
    erkenneDateiFormat.mockReturnValue('bja-xml');
    const gesetz = gesetzesreferenz({ kurztitel: 'BGB' });
    verarbeiteGesetzDatei.mockResolvedValue({ getaggtesXML: '<getaggt/>', gesetz });
    vergleicheMitBestand.mockResolvedValue('neu');

    const ergebnis = await verarbeiteDateien([{ name: 'g.xml', inhalt: '<x/>' }]);

    expect(speichereGesetz).toHaveBeenCalledWith(gesetz, '<getaggt/>');
    expect(ergebnis.berichtEintraege).toEqual([
      {
        kategorie: 'gesetz',
        aktion: 'neu',
        name: 'BGB',
        meldungen: [],
        abschluss: expect.objectContaining({ abonnieren: expect.any(Function) }),
      },
    ]);
    expect(ergebnis.konflikte).toEqual([]);
  });

  it("vergleich 'unveraendert' -> nicht gespeichert, Berichtseintrag 'unveraendert'", async () => {
    erkenneDateiFormat.mockReturnValue('bja-xml');
    verarbeiteGesetzDatei.mockResolvedValue({
      getaggtesXML: '<getaggt/>',
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
    });
    vergleicheMitBestand.mockResolvedValue('unveraendert');

    const ergebnis = await verarbeiteDateien([{ name: 'g.xml', inhalt: '<x/>' }]);

    expect(speichereGesetz).not.toHaveBeenCalled();
    expect(ergebnis.berichtEintraege).toEqual([
      {
        kategorie: 'gesetz',
        aktion: 'unveraendert',
        name: 'BGB',
      },
    ]);
  });

  it("vergleich 'geaendert' bei kanonisch-xml (zeigeVerarbeitungszeitDaten=true) -> ladeAlleGesetze wird abgefragt, Konflikt trägt bestehendeVerarbeitungszeit/importierteVerarbeitungszeit", async () => {
    erkenneDateiFormat.mockReturnValue('kanonisch-xml');
    const verarbeitungszeit = new Date('2026-01-01');
    verarbeiteGesetzDatei.mockResolvedValue({
      getaggtesXML: '<gesetz normgeber="de-bund">neu</gesetz>',
      gesetz: gesetzInfos({ kurztitel: 'BGB', verarbeitungszeit }),
    });
    vergleicheMitBestand.mockResolvedValue('geaendert');
    const bestehendesGesetz = gesetzDarstellung({
      kurztitel: 'BGB',
      verarbeitungszeit: new Date('2020-01-01'),
    });
    ladeAlleGesetze.mockResolvedValue([bestehendesGesetz]);

    const ergebnis = await verarbeiteDateien([
      { name: 'g.xml', inhalt: '<gesetz normgeber="de-bund">neu</gesetz>' },
    ]);

    expect(speichereGesetz).not.toHaveBeenCalled();
    expect(ladeAlleGesetze).toHaveBeenCalled();
    expect(ergebnis.konflikte).toEqual([
      {
        art: 'gesetz',
        kurztitel: 'BGB',
        neuesXML: '<gesetz normgeber="de-bund">neu</gesetz>',
        neuesGesetz: gesetzInfos({ kurztitel: 'BGB', verarbeitungszeit }),
        bestehendeVerarbeitungszeit: bestehendesGesetz.verarbeitungszeit,
        importierteVerarbeitungszeit: verarbeitungszeit,
      },
    ]);
  });

  it("vergleich 'geaendert' bei bja-xml (zeigeVerarbeitungszeitDaten=false) -> ladeAlleGesetze wird NICHT abgefragt, keine Datumsangaben im Konflikt", async () => {
    erkenneDateiFormat.mockReturnValue('bja-xml');
    verarbeiteGesetzDatei.mockResolvedValue({
      getaggtesXML: '<getaggt/>',
      gesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
    });
    vergleicheMitBestand.mockResolvedValue('geaendert');

    const ergebnis = await verarbeiteDateien([{ name: 'g.xml', inhalt: '<x/>' }]);

    expect(ladeAlleGesetze).not.toHaveBeenCalled();
    expect(ergebnis.konflikte).toEqual([
      {
        art: 'gesetz',
        kurztitel: 'BGB',
        neuesXML: '<getaggt/>',
        neuesGesetz: gesetzesreferenz({ kurztitel: 'BGB' }),
        bestehendeVerarbeitungszeit: undefined,
        importierteVerarbeitungszeit: undefined,
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// verarbeiteDateien: mehrere Dateien gemischter Formate in einem Durchlauf
// ---------------------------------------------------------------------------

describe('verarbeiteDateien: gemischte Formate', () => {
  it('verarbeitet mehrere Dateien unabhängig und sammelt die Ergebnisse in den richtigen Kategorien', async () => {
    erkenneDateiFormat.mockImplementation((_inhalt, name) =>
      name === 'a.xml' ? 'unbekannt' : name === 'b.xml' ? 'favoriten-xml' : 'zip',
    );
    verarbeiteEinfacheDatei.mockResolvedValue({ art: 'neu', kategorie: 'favoriten', name: 'BGB' });

    const ergebnis = await verarbeiteDateien([
      { name: 'a.xml', inhalt: 'x' },
      { name: 'b.xml', inhalt: 'y' },
      { name: 'c.zip', inhalt: 'z' },
    ]);

    expect(ergebnis.fehler).toEqual([
      { grund: 'formatUnbekannt', datei: 'a.xml' },
      { grund: 'zipVerschachtelt', datei: 'c.zip' },
    ]);
    expect(ergebnis.berichtEintraege).toEqual([
      { kategorie: 'favoriten', aktion: 'neu', name: 'BGB' },
    ]);
  });
});

describe('verarbeiteDateien: dateibezogene Teilfehler', () => {
  it.each(['Schemahinweis', 'Erkennung', 'Nutzerdaten', 'Gesetz'])(
    '%s: bewahrt Erfolg und Konflikt und verarbeitet die nächste Datei',
    async (grenze) => {
      const konflikt = { art: 'favoriten', anzeigename: 'Konflikt', importInhalt: '<alt/>' };
      erkenneDateiFormat.mockImplementation((_inhalt, name) => {
        if (name === 'b.xml' && grenze === 'Erkennung') throw new Error('kaputt');
        return name === 'b.xml' && grenze === 'Gesetz' ? 'bja-xml' : 'favoriten-xml';
      });
      pruefeSchemaversion.mockImplementation(async (inhalt) => {
        if (inhalt === 'B' && grenze === 'Schemahinweis') throw new Error('kaputt');
      });
      verarbeiteGesetzDatei.mockRejectedValue(new Error('kaputt'));
      const reihenfolge: string[] = [];
      verarbeiteEinfacheDatei.mockImplementation(async (_format, inhalt) => {
        reihenfolge.push(String(inhalt));
        if (inhalt === 'B') throw new Error('kaputt');
        if (inhalt === 'K') return konflikt;
        return {
          art: 'neu',
          kategorie: 'favoriten',
          name: inhalt,
        };
      });
      const ergebnis = await verarbeiteDateien(
        ['A', 'K', 'B', 'C'].map((inhalt) => ({ name: `${inhalt.toLowerCase()}.xml`, inhalt })),
      );
      expect(ergebnis).toEqual({
        konflikte: [konflikt],
        berichtEintraege: [
          { kategorie: 'favoriten', aktion: 'neu', name: 'A' },
          { kategorie: 'favoriten', aktion: 'neu', name: 'C' },
        ],
        fehler: [{ grund: 'unerwartet', datei: 'b.xml', detail: 'kaputt' }],
      });
      expect(reihenfolge).toEqual(
        grenze === 'Nutzerdaten' ? ['A', 'K', 'B', 'C'] : ['A', 'K', 'C'],
      );
      expect(vorgang).toHaveBeenCalledTimes(1);
    },
  );

  it('berichtet reguläre Gesetzfehler, Indexfehler und unbekannte Formate jeweils einmal', async () => {
    erkenneDateiFormat.mockImplementation((_inhalt, name) =>
      name === 'g.xml' ? 'bja-xml' : name === 'i.xml' ? 'index-xml' : 'unbekannt',
    );
    verarbeiteGesetzDatei.mockResolvedValue({ fehler: 'Gesetz defekt' });
    uebernehmeImportindexDatei.mockRejectedValue('Index defekt');
    const ergebnis = await verarbeiteDateien(
      ['g', 'i', 'u'].map((name) => ({ name: `${name}.xml`, inhalt: '<x/>' })),
    );
    expect(ergebnis).toEqual({
      konflikte: [],
      berichtEintraege: [
        expect.objectContaining({
          kategorie: 'gesetz',
          aktion: 'nichtUebernommen',
          meldungen: [expect.objectContaining({ text: 'Gesetz defekt' })],
        }),
      ],
      fehler: [
        { grund: 'unerwartet', datei: 'i.xml', detail: 'Index defekt' },
        { grund: 'formatUnbekannt', datei: 'u.xml' },
      ],
    });
  });

  it('führt auch leere Eingaben in genau einem gemeinsamen Vorgang aus', async () => {
    expect(await verarbeiteDateien([])).toEqual({
      konflikte: [],
      berichtEintraege: [],
      fehler: [],
    });
    expect(vorgang).toHaveBeenCalledTimes(1);
  });

  it.each(['Aufbau', 'Abschluss'])('reicht vorgangsweite Fehler beim %s weiter', async (phase) => {
    vorgang.mockImplementation(async (arbeit) => {
      if (phase === 'Abschluss') await arbeit(importiereGesetzDatei);
      throw new Error(phase);
    });
    await expect(verarbeiteDateien([])).rejects.toThrow(phase);
    expect(vorgang).toHaveBeenCalledTimes(1);
  });
});

it('ordnet Versions- und Referenzbefunde im gemischten Batch nur der betroffenen ZIP-Quelle zu', async () => {
  pruefeSchemaversion.mockImplementation(async (inhalt, empfangen) => {
    if (inhalt.includes('version="2"')) empfangen({ text: 'Schemaversion 2' });
  });
  erkenneDateiFormat.mockReturnValue('kanonisch-xml');
  verarbeiteGesetzDatei.mockImplementation(async (_format, inhalt, optionen) => {
    if (String(inhalt).includes('krank')) {
      if (
        !optionen ||
        typeof optionen !== 'object' ||
        !('meldungEmpfangen' in optionen) ||
        typeof optionen.meldungEmpfangen !== 'function'
      )
        throw new Error('Dateiempfänger fehlt');
      const empfangen = optionen.meldungEmpfangen;
      empfangen({ text: 'Referenzzugriff fehlt' });
      empfangen({ text: 'Referenzzugriff fehlt' });
      empfangen({ text: 'Kurztitelabgleich fehlt' });
      return { getaggtesXML: '<krank/>', gesetz: gesetzesreferenz({ kurztitel: 'Krank' }) };
    }
    return { getaggtesXML: '<gesund/>', gesetz: gesetzesreferenz({ kurztitel: 'Gesund' }) };
  });
  vergleicheMitBestand.mockResolvedValue('geaendert');
  const ergebnis = await verarbeiteDateien([
    {
      name: 'a.xml',
      quelle: 'Sicherung.zip → eins/a.xml',
      inhalt: '<gesetz version="2">krank</gesetz>',
    },
    { name: 'b.xml', quelle: 'Sicherung.zip → zwei/b.xml', inhalt: '<gesetz>gesund</gesetz>' },
  ]);
  expect(ergebnis.konflikte).toHaveLength(2);
  expect(ergebnis.konflikte[0]?.meldungen?.map((m) => m.text)).toEqual([
    'Schemaversion 2',
    'Referenzzugriff fehlt',
    'Kurztitelabgleich fehlt',
  ]);
  expect(ergebnis.konflikte[1]?.meldungen).toBeUndefined();
  expect(ergebnis.fehler).toEqual([]);
});

describe('verarbeiteDateien: ImportFehler je Grund', () => {
  it('Nachbereitungsfehler -> genau ein Fehler nachbereitung mit Datei und Detail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    erkenneDateiFormat.mockReturnValue('bja-xml');
    vorgang.mockImplementation(async (arbeit) =>
      arbeit(async () => ({ art: 'neu', kurztitel: 'BGB', nachbereitungsfehler: ['§ 1 defekt'] })),
    );
    const ergebnis = await verarbeiteDateien([{ name: 'bgb.xml', inhalt: '<x/>' }]);
    expect(ergebnis.fehler).toEqual([
      { grund: 'nachbereitung', datei: 'bgb.xml', detail: '§ 1 defekt' },
    ]);
    expect(ergebnis.berichtEintraege).toMatchObject([{ aktion: 'neu', name: 'BGB' }]);
  });

  it('unerwartete Ausnahme -> genau ein Fehler unerwartet mit Datei und Detail', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    erkenneDateiFormat.mockImplementation(() => {
      throw new Error('Absturz');
    });
    const ergebnis = await verarbeiteDateien([{ name: 'a.xml', inhalt: '<x/>' }]);
    expect(ergebnis.fehler).toEqual([{ grund: 'unerwartet', datei: 'a.xml', detail: 'Absturz' }]);
  });

  it('Eingangsmeldung einer übernommenen Datei -> Hinweis am Berichtseintrag, kein Fehler', async () => {
    pruefeSchemaversion.mockImplementation(async (_inhalt, empfangen) =>
      empfangen({ text: 'Schemaversion 2', grund: 'schemaversionAbweichend' }),
    );
    erkenneDateiFormat.mockReturnValue('favoriten-xml');
    verarbeiteEinfacheDatei.mockResolvedValue({ art: 'neu', kategorie: 'favoriten', name: 'A' });
    const ergebnis = await verarbeiteDateien([{ name: 'a.xml', inhalt: '<x/>' }]);
    expect(ergebnis.fehler).toEqual([]);
    expect(ergebnis.berichtEintraege[0]?.meldungen).toEqual([
      expect.objectContaining({ grund: 'schemaversionAbweichend' }),
    ]);
  });

  it('Eingangsmeldung einer nicht übernommenen Datei -> genau ein Fehler meldung', async () => {
    pruefeSchemaversion.mockImplementation(async (_inhalt, empfangen) =>
      empfangen({ text: 'Schemaversion 2', grund: 'schemaversionAbweichend' }),
    );
    erkenneDateiFormat.mockReturnValue('unbekannt');
    const ergebnis = await verarbeiteDateien([{ name: 'a.xml', inhalt: '<x/>' }]);
    expect(ergebnis.fehler).toEqual([
      { grund: 'formatUnbekannt', datei: 'a.xml' },
      // Mit Grund bildet die Gliederung den Satz; der Rohtext wird nicht übernommen.
      { grund: 'meldung', datei: 'a.xml', meldungsgrund: 'schemaversionAbweichend' },
    ]);
  });
});

// Bestehende Szenarioattrappe des früheren Sammelwegs nur im Testzugang.
vi.mock('@/test/tabs/gesetzSpeicherTestzugang', async (original) => ({
  ...(await original<typeof import('@/test/tabs/gesetzSpeicherTestzugang')>()),
  ladeAlleGesetze: () => ladeAlleGesetze(),
}));
