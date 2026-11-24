// gesetzDateiVerarbeitung.test.ts
//
// Unit-Tests für verarbeiteGesetzDatei (alle vier Formate: kanonisch-xml,
// bja-xml, html-bw inkl. Kurztitel-Override-Logik bei bja-xml/
// html-bw) und vergleicheMitBestand (neu/unveraendert/geaendert).
// Übernommen/aufgeteilt aus dem früheren dateiImport.test.ts (vor dem
// lib/import-Modul-Umbau lag diese Logik dort) sowie aus
// gesetzImportGemeinsam.test.ts (vertaggeGesetzesXML, jetzt Teil von
// verarbeiteGesetzDatei, siehe Datei-Kommentar dort).

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { erkenneGesetzDateiFormat } from './gesetzDateiFormat';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const leseGesetzInfos = vi.fn<(xml: string) => unknown>();
const { dateiBasis } = vi.hoisted(() => ({ dateiBasis: vi.fn() }));
vi.mock('@/lib/persistenz/kern/kern.index', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/persistenz/kern/kern.index')>();
  dateiBasis.mockImplementation(original.dateiBasis);
  return { ...original, dateiBasis };
});
const ladeGesetzesXML = vi.fn<(referenz: Gesetzesreferenz) => Promise<string | null>>();
const speichereGesetz = vi.fn<(...args: unknown[]) => Promise<void>>();
const ladeAlleGesetze =
  vi.fn<
    (
      ...args: unknown[]
    ) => Promise<{ kurztitel: string; normgeber: string; verarbeitungszeit?: Date }[]>
  >();
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/gesetz/gesetz.index')>()),
  leseAbgeglichenesSuchverzeichnis: async () => ({ abgeglichen: true, eintraege: [] }),
  leseGesetzInfos: (...args: [string]) => leseGesetzInfos(...args),

  ladeGesetzesXML: (...args: [Gesetzesreferenz]) => ladeGesetzesXML(...args),
  speichereGesetz: (...args: unknown[]) => speichereGesetz(...args),

  leseGesetz: async (referenz: { kurztitel: string; normgeber: string }) => {
    const liste = await ladeAlleGesetze();
    const gesetz = liste.find(
      (g: { kurztitel: string; normgeber: string }) =>
        g.kurztitel.toLowerCase() === referenz.kurztitel.toLowerCase() &&
        g.normgeber === referenz.normgeber,
    );
    return gesetz ? { status: 'geladen', gesetz, befunde: [] } : { status: 'fehlt', befunde: [] };
  },
  ladeAlleGesetze: (...args: unknown[]) => ladeAlleGesetze(...args),
  LANDESRECHT_BW_QUELLE: 'Landesrecht BW',
}));

const versucheGesetzSperreZuErhalten = vi.fn<(gesetz: Gesetzesreferenz) => Promise<boolean>>();
const gibGesetzSperreFrei = vi.fn<(gesetz: Gesetzesreferenz) => Promise<void>>();
vi.mock('@/lib/import/dispatch/importVorgang', () => ({
  mitManuellemImportVorgang: (arbeit: () => Promise<unknown>) => arbeit(),
  versucheGesetzSperreZuErhalten: (kurztitel: Gesetzesreferenz) =>
    versucheGesetzSperreZuErhalten(kurztitel),
  gibGesetzSperreFrei: (kurztitel: Gesetzesreferenz) => gibGesetzSperreFrei(kurztitel),
}));

const nachbereiteGesetzesXML =
  vi.fn<
    (
      ...args: Parameters<
        typeof import('@/lib/import/importabschluss/importabschluss.index').nachbereiteGesetzesXML
      >
    ) => Promise<string>
  >();
const ermittleGesetzRefs = vi.fn<
  () => Promise<{ kurztitel: string; normgeber: string; verarbeitungszeit?: Date }[]>
>(() => Promise.resolve([]));
const gesetzesXMLOhneVeraenderlicheFelder = vi.fn<(xml: string) => string>((xml) => xml);
const taggeVerweise = vi.fn<(xml: string, k: string, refs: unknown[]) => string>();
vi.mock('@/lib/import/basis/basis.index', () => ({
  taggeVerweise: (...args: [string, string, unknown[]]) => taggeVerweise(...args),
}));
vi.mock('@/lib/import/importabschluss/importabschluss.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/import/importabschluss/importabschluss.index')>()),
  nachbereiteGesetzesXML: (
    ...args: Parameters<
      typeof import('@/lib/import/importabschluss/importabschluss.index').nachbereiteGesetzesXML
    >
  ) => nachbereiteGesetzesXML(...args),
  ermittleGesetzRefs: () => ermittleGesetzRefs(),
  gesetzesXMLOhneVeraenderlicheFelder: (...args: [string]) =>
    gesetzesXMLOhneVeraenderlicheFelder(...args),
  taggeGesetzesXML: async (xml: string, kurztitel: string) =>
    taggeVerweise(xml, kurztitel, await ermittleGesetzRefs()),
  vergleicheGesetzesXMLMitBestand: async (referenz: Gesetzesreferenz, xml: string) => {
    const bestand = await ladeGesetzesXML(referenz);
    if (bestand === null) return 'neu';
    return gesetzesXMLOhneVeraenderlicheFelder(bestand) === gesetzesXMLOhneVeraenderlicheFelder(xml)
      ? 'unveraendert'
      : 'geaendert';
  },
}));

const importiereBundXML = vi.fn<(...args: unknown[]) => unknown>();
vi.mock('@/lib/import/bund/bund.index', () => ({
  importiereBundXML: (...args: unknown[]) => importiereBundXML(...args),
}));

const importiereGesetzHTMLBW = vi.fn<(...args: unknown[]) => unknown>();
vi.mock('@/lib/import/bw/bw.index', () => ({
  importiereGesetzHTMLBW: (...args: unknown[]) => importiereGesetzHTMLBW(...args),
}));

const sucheImImportindexPerLangtitel =
  vi.fn<(dateiname: string, langtitel: string) => Promise<{ kurztitel: string } | null>>();
vi.mock('@/lib/import/importindex/importindex.index', () => ({
  sucheImImportindexPerLangtitel: (...args: [string, string]) =>
    sucheImImportindexPerLangtitel(...args),
  IMPORTINDEX_BUNDESRECHT_DATEINAME: 'de-bund.xml',
  IMPORTINDEX_LANDESRECHT_BW_DATEINAME: 'de-bw.xml',
}));

import {
  mitGesetzDateiImport,
  verarbeiteGesetzDatei,
  vergleicheMitBestand,
} from './gesetzDateiVerarbeitung';
import type { GesetzDateiImport } from '@/lib/import/importVertrag.types';

/** Einzelne Datei über den Datei-Import, wie ihn der App-Code verwendet. */
const importiereGesetzDatei: GesetzDateiImport = (...args) =>
  mitGesetzDateiImport((importiereDatei) => importiereDatei(...args));

beforeEach(() => {
  vi.clearAllMocks();
  ermittleGesetzRefs.mockResolvedValue([]);
  gesetzesXMLOhneVeraenderlicheFelder.mockImplementation((xml) => xml);
  sucheImImportindexPerLangtitel.mockResolvedValue(null);
  speichereGesetz.mockResolvedValue(undefined);
  ladeAlleGesetze.mockResolvedValue([]);
  versucheGesetzSperreZuErhalten.mockResolvedValue(true);
  gibGesetzSperreFrei.mockResolvedValue(undefined);
});

describe('Einzeldatei im Datei-Import', () => {
  it.each(['', '   '])(
    'weist einen fehlenden oder leeren Kurztitel %j vor Nachbereitung und Speicherung ab',
    async (kurztitel) => {
      leseGesetzInfos.mockReturnValue({ kurztitel, normgeber: 'de-bund' });
      await expect(
        importiereGesetzDatei('kanonisch-xml', '<gesetz/>', {
          nachbereitungBeiImport: 'saetze-und-verweise',
        }),
      ).resolves.toMatchObject({
        art: 'fehler',
        fehler: {
          grund: 'format',
          meldung: 'Fehlender oder leerer Kurztitel in <infos> des Gesetz-XML.',
        },
      });
      expect(dateiBasis).not.toHaveBeenCalled();
      expect(taggeVerweise).not.toHaveBeenCalled();
      expect(speichereGesetz).not.toHaveBeenCalled();
    },
  );
  it('verarbeitet GesetzesXML mit Kurztitel ohne Normgeber', async () => {
    leseGesetzInfos.mockReturnValue({ kurztitel: 'Eigenes', normgeber: undefined });
    await expect(verarbeiteGesetzDatei('kanonisch-xml', '<gesetz/>')).resolves.toEqual({
      getaggtesXML: '<gesetz/>',
      gesetz: { kurztitel: 'Eigenes', normgeber: undefined },
    });
  });
  it('speichert ein neues Gesetz und gibt seine Sperre frei', async () => {
    leseGesetzInfos.mockReturnValue({ kurztitel: 'BGB', normgeber: 'de-bund' });
    ladeGesetzesXML.mockResolvedValue(null);

    await expect(importiereGesetzDatei('kanonisch-xml', '<gesetz/>')).resolves.toEqual({
      art: 'neu',
      kurztitel: 'BGB',
    });
    expect(versucheGesetzSperreZuErhalten).toHaveBeenCalledWith({
      kurztitel: 'BGB',
      normgeber: 'de-bund',
    });
    expect(speichereGesetz).toHaveBeenCalledWith(
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      '<gesetz/>',
      {
        inhaltGeaendert: true,
        meldungEmpfangen: undefined,
        zielGeschrieben: expect.any(Function),
        sammelbatch: expect.anything(),
      },
    );
    expect(gibGesetzSperreFrei).toHaveBeenCalledWith({ kurztitel: 'BGB', normgeber: 'de-bund' });
  });

  it('liefert bei geändertem Bestand einen Konflikt ohne zu speichern', async () => {
    leseGesetzInfos.mockReturnValue({ kurztitel: 'BGB', normgeber: 'de-bund' });
    ladeGesetzesXML.mockResolvedValue('<gesetz normgeber="de-bund">alt</gesetz>');

    const ergebnis = await importiereGesetzDatei(
      'kanonisch-xml',
      '<gesetz normgeber="de-bund">neu</gesetz>',
    );

    expect(ergebnis).toMatchObject({ art: 'konflikt', kurztitel: 'BGB' });
    expect(speichereGesetz).not.toHaveBeenCalled();
    expect(gibGesetzSperreFrei).toHaveBeenCalledWith({ kurztitel: 'BGB', normgeber: 'de-bund' });
  });

  it('gibt die Sperre auch nach einem Speicherfehler frei', async () => {
    leseGesetzInfos.mockReturnValue({ kurztitel: 'BGB', normgeber: 'de-bund' });
    ladeGesetzesXML.mockResolvedValue(null);
    speichereGesetz.mockRejectedValue(new Error('Datenträger voll'));

    await expect(importiereGesetzDatei('kanonisch-xml', '<gesetz/>')).resolves.toMatchObject({
      art: 'fehler',
      fehler: { grund: 'speichern', meldung: 'Datenträger voll' },
    });
    expect(gibGesetzSperreFrei).toHaveBeenCalledWith({ kurztitel: 'BGB', normgeber: 'de-bund' });
  });

  it('weist einen zweiten parallelen Import desselben Gesetzes ab', async () => {
    leseGesetzInfos.mockReturnValue({ kurztitel: 'BGB', normgeber: 'de-bund' });
    let erstenVergleichFreigeben!: (wert: string | null) => void;
    ladeGesetzesXML.mockImplementationOnce(
      () => new Promise((resolve) => (erstenVergleichFreigeben = resolve)),
    );
    const gesperrt = new Set<string>();
    versucheGesetzSperreZuErhalten.mockImplementation(async (kurztitel) => {
      if (gesperrt.has(gesetzesreferenzSchluessel(kurztitel))) return false;
      gesperrt.add(gesetzesreferenzSchluessel(kurztitel));
      return true;
    });
    gibGesetzSperreFrei.mockImplementation(async (kurztitel) => {
      gesperrt.delete(gesetzesreferenzSchluessel(kurztitel));
    });

    const erster = importiereGesetzDatei('kanonisch-xml', '<gesetz/>');
    await vi.waitFor(() => expect(ladeGesetzesXML).toHaveBeenCalledTimes(1));
    const zweiter = await importiereGesetzDatei('kanonisch-xml', '<gesetz/>');
    expect(zweiter).toMatchObject({ art: 'fehler', fehler: { grund: 'beschaeftigt' } });
    expect(speichereGesetz).not.toHaveBeenCalled();

    erstenVergleichFreigeben(null);
    await expect(erster).resolves.toMatchObject({ art: 'neu' });
    expect(speichereGesetz).toHaveBeenCalledTimes(1);
    expect(gibGesetzSperreFrei).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// verarbeiteGesetzDatei: kanonisch-xml
// ---------------------------------------------------------------------------

describe('verarbeiteGesetzDatei: kanonisch-xml', () => {
  it('optionen.nachbereitungBeiImport=aus -> Inhalt wird UNVERÄNDERT an leseGesetzInfos übergeben', async () => {
    leseGesetzInfos.mockReturnValue({ kurztitel: 'BGB', normgeber: 'de-bund' });

    const ergebnis = await verarbeiteGesetzDatei('kanonisch-xml', '<gesetz/>', {
      nachbereitungBeiImport: 'aus',
    });

    expect(nachbereiteGesetzesXML).not.toHaveBeenCalled();
    expect(leseGesetzInfos).toHaveBeenCalledWith('<gesetz/>');
    expect('fehler' in ergebnis).toBe(false);
    if ('fehler' in ergebnis) return;
    expect(ergebnis.gesetz).toEqual({ kurztitel: 'BGB', normgeber: 'de-bund' });
    expect(ergebnis.getaggtesXML).toBe('<gesetz/>');
  });

  it.each(['verweise', 'saetze', 'saetze-und-verweise'] as const)(
    'validiert die Kernfelder vor der Nachbereitung mit %s',
    async (modus) => {
      nachbereiteGesetzesXML.mockResolvedValue('<nachbereitet/>');
      leseGesetzInfos.mockReturnValue({ kurztitel: 'BGB', normgeber: 'de-bund' });

      const ergebnis = await verarbeiteGesetzDatei('kanonisch-xml', '<gesetz/>', {
        nachbereitungBeiImport: modus,
      });

      expect(nachbereiteGesetzesXML).toHaveBeenCalledWith(
        '<gesetz/>',
        expect.objectContaining({ referenzenFuer: expect.any(Function) }),
        modus,
        expect.any(Function),
      );
      expect(leseGesetzInfos).toHaveBeenCalledWith('<gesetz/>');
      expect(leseGesetzInfos.mock.invocationCallOrder[0]).toBeLessThan(
        nachbereiteGesetzesXML.mock.invocationCallOrder[0]!,
      );
      expect('fehler' in ergebnis).toBe(false);
      if ('fehler' in ergebnis) return;
      expect(ergebnis.getaggtesXML).toBe('<nachbereitet/>');
    },
  );

  it('leseGesetzInfos gibt null zurück -> Fehler statt Absturz', async () => {
    leseGesetzInfos.mockReturnValue(null);

    const ergebnis = await verarbeiteGesetzDatei('kanonisch-xml', '<x/>');

    expect(ergebnis).toEqual({ fehler: 'XML konnte nicht gelesen werden.' });
  });
});

// ---------------------------------------------------------------------------
// verarbeiteGesetzDatei: bja-xml (Kurztitel-Override)
// ---------------------------------------------------------------------------

describe('verarbeiteGesetzDatei: bja-xml', () => {
  it('kein Treffer im Index -> importiereBundXML wird NICHT erneut aufgerufen', async () => {
    importiereBundXML.mockReturnValue({
      xmlString: '<roh/>',
      kurztitel: 'BGB',
      langtitel: 'Bürgerliches Gesetzbuch',
    });
    sucheImImportindexPerLangtitel.mockResolvedValue(null);
    taggeVerweise.mockReturnValue('<getaggt/>');
    leseGesetzInfos.mockReturnValue({ kurztitel: 'BGB', normgeber: 'de-bund' });

    await verarbeiteGesetzDatei('bja-xml', '<x/>');

    expect(sucheImImportindexPerLangtitel).toHaveBeenCalledWith(
      'de-bund',
      'Bürgerliches Gesetzbuch',
    );
    expect(importiereBundXML).toHaveBeenCalledTimes(1);
    // Der Import erhält seine Quellenbezeichnung unabhängig vom Dateizugriff.
    expect(importiereBundXML).toHaveBeenCalledWith('<x/>', 'Gesetze im Internet');
    expect(taggeVerweise).toHaveBeenCalledWith('<roh/>', 'BGB', []);
  });

  it('Treffer im Index -> importiereBundXML wird ERNEUT mit dem gefundenen Kurztitel aufgerufen', async () => {
    importiereBundXML
      .mockReturnValueOnce({
        xmlString: '<roh/>',
        kurztitel: 'NeuerName',
        langtitel: 'Bürgerliches Gesetzbuch',
      })
      .mockReturnValueOnce({ xmlString: '<roh-override/>', kurztitel: 'BGB' });
    sucheImImportindexPerLangtitel.mockResolvedValue(gesetzesreferenz({ kurztitel: 'BGB' }));
    taggeVerweise.mockReturnValue('<getaggt/>');
    leseGesetzInfos.mockReturnValue({ kurztitel: 'BGB', normgeber: 'de-bund' });

    await verarbeiteGesetzDatei('bja-xml', '<x/>');

    expect(importiereBundXML).toHaveBeenCalledTimes(2);
    expect(importiereBundXML).toHaveBeenNthCalledWith(2, '<x/>', 'Gesetze im Internet', 'BGB');
    expect(taggeVerweise).toHaveBeenCalledWith('<roh-override/>', 'BGB', []);
  });

  it('vorlauf.fehler gesetzt -> Index-Suche wird übersprungen, Fehler wird durchgereicht', async () => {
    importiereBundXML.mockReturnValue({ fehler: 'Kaputtes XML' });

    const ergebnis = await verarbeiteGesetzDatei('bja-xml', '<x/>');

    expect(sucheImImportindexPerLangtitel).not.toHaveBeenCalled();
    expect(taggeVerweise).not.toHaveBeenCalled();
    expect(ergebnis).toEqual({ fehler: 'Kaputtes XML' });
  });

  it('roh.xmlString fehlt ohne roh.fehler -> Fallback-Fehlermeldung', async () => {
    importiereBundXML.mockReturnValue({ kurztitel: 'BGB', normgeber: 'de-bund' });

    const ergebnis = await verarbeiteGesetzDatei('bja-xml', '<x/>');

    expect(ergebnis).toEqual({ fehler: 'Unbekannter Fehler.' });
  });

  it('leseGesetzInfos des getaggten XML gibt null zurück -> Fehler', async () => {
    importiereBundXML.mockReturnValue({ xmlString: '<roh/>', kurztitel: 'BGB' });
    taggeVerweise.mockReturnValue('kein <gesetz>-Wurzelelement');
    leseGesetzInfos
      .mockReturnValue(null)
      .mockReturnValueOnce({ normgeber: 'de-bund', kurztitel: 'BGB' });

    const ergebnis = await verarbeiteGesetzDatei('bja-xml', '<x/>');

    expect(ergebnis).toEqual({ fehler: 'XML konnte nicht gelesen werden.' });
  });
});

// ---------------------------------------------------------------------------
// verarbeiteGesetzDatei: html-bw; EUR-Lex-HTML wird nicht erkannt
// ---------------------------------------------------------------------------

describe('verarbeiteGesetzDatei: html-bw', () => {
  it('Kurztitel-Override analog zu bja-xml, aber über IMPORTINDEX_LANDESRECHT_BW_DATEINAME und importiereGesetzHTMLBW', async () => {
    importiereGesetzHTMLBW
      .mockReturnValueOnce({
        xmlString: '<roh/>',
        kurztitel: 'X',
        langtitel: 'Gesetz',
      })
      .mockReturnValueOnce({ xmlString: '<roh-override/>', kurztitel: 'LG' });
    sucheImImportindexPerLangtitel.mockResolvedValue(gesetzesreferenz({ kurztitel: 'LG' }));
    taggeVerweise.mockReturnValue('<getaggt/>');
    leseGesetzInfos.mockReturnValue({ kurztitel: 'LG', normgeber: 'de-bw' });

    await verarbeiteGesetzDatei('html-bw', '<x/>');

    expect(sucheImImportindexPerLangtitel).toHaveBeenCalledWith('de-bw', 'Gesetz');
    expect(importiereGesetzHTMLBW).toHaveBeenNthCalledWith(2, '<x/>', 'Landesrecht BW', true, 'LG');
  });
});

describe('EUR-Lex-HTML-Datei', () => {
  it('erkennt EUR-Lex-HTML nicht als Gesetzdatei', () => {
    const inhalt = '<html><body><div class="eli-container">Artikel 1</div></body></html>';
    expect(erkenneGesetzDateiFormat(inhalt, 'eurlex.html')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// vergleicheMitBestand
// ---------------------------------------------------------------------------

describe('vergleicheMitBestand', () => {
  it("kein Bestand (ladeGesetzesXML -> null) -> 'neu'", async () => {
    ladeGesetzesXML.mockResolvedValue(null);

    const ergebnis = await vergleicheMitBestand('<neu/>', gesetzesreferenz({ kurztitel: 'BGB' }));

    expect(ergebnis).toBe('neu');
  });

  it("Bestand inhaltlich identisch (ohne verarbeitungszeit-Tag) -> 'unveraendert'", async () => {
    ladeGesetzesXML.mockResolvedValue(
      '<gesetz><verarbeitungszeit>alt</verarbeitungszeit></gesetz>',
    );
    gesetzesXMLOhneVeraenderlicheFelder.mockImplementation((xml) =>
      xml.replace(/<verarbeitungszeit>.*<\/verarbeitungszeit>/, ''),
    );

    const ergebnis = await vergleicheMitBestand(
      '<gesetz><verarbeitungszeit>neu</verarbeitungszeit></gesetz>',
      gesetzesreferenz({
        kurztitel: 'BGB',
      }),
    );

    expect(ergebnis).toBe('unveraendert');
  });

  it("Bestand inhaltlich verändert -> 'geaendert'", async () => {
    ladeGesetzesXML.mockResolvedValue('<gesetz normgeber="de-bund">alt</gesetz>');
    gesetzesXMLOhneVeraenderlicheFelder.mockImplementation(
      (xml) => `${xml}-ohne-verarbeitungszeit`,
    );

    const ergebnis = await vergleicheMitBestand(
      '<gesetz normgeber="de-bund">neu</gesetz>',
      gesetzesreferenz({
        kurztitel: 'BGB',
      }),
    );

    expect(ergebnis).toBe('geaendert');
  });

  it('lädt den Bestand über die vollständige Gesetzesreferenz', async () => {
    ladeGesetzesXML.mockResolvedValue(null);

    await vergleicheMitBestand('<x/>', { kurztitel: 'BGB', normgeber: 'de-bund' });

    expect(ladeGesetzesXML).toHaveBeenCalledWith({ kurztitel: 'BGB', normgeber: 'de-bund' });
  });
});

it('Konfliktzeit stammt aus frischem Bestand nach Sperrerwerb', async () => {
  leseGesetzInfos.mockReturnValue({ kurztitel: 'BGB', normgeber: 'de-bund' });
  ladeGesetzesXML.mockResolvedValue('<gesetz normgeber="de-bund">alt</gesetz>');
  const zeit = new Date('2026-09-30');
  ladeAlleGesetze.mockResolvedValue([
    {
      kurztitel: 'bgb',
      normgeber: 'de-bund',
      verarbeitungszeit: zeit,
    },
  ]);
  expect(
    await importiereGesetzDatei('kanonisch-xml', '<gesetz normgeber="de-bund">neu</gesetz>'),
  ).toMatchObject({
    bestehendeVerarbeitungszeit: zeit,
  });
  expect(ladeAlleGesetze).toHaveBeenCalledWith();
  expect(versucheGesetzSperreZuErhalten.mock.invocationCallOrder[0]).toBeLessThan(
    ladeAlleGesetze.mock.invocationCallOrder[0]!,
  );
});

describe('begrenzter Datei-Sammelvorgang', () => {
  it('verweigert die Dateioperation nach dem Callbackende', async () => {
    let spaeter: typeof importiereGesetzDatei | undefined;
    await mitGesetzDateiImport(async (importiereDatei) => {
      spaeter = importiereDatei;
    });
    await expect(spaeter!('kanonisch-xml', '<gesetz/>')).rejects.toThrow('beendet');
  });
  it('wartet bei Callbackfehler auf gestartete Importe und bewahrt den Fehler', async () => {
    let beenden!: () => void;
    const warten = new Promise<void>((resolve) => {
      beenden = resolve;
    });
    speichereGesetz.mockImplementationOnce(async () => warten);
    leseGesetzInfos.mockReturnValue({ kurztitel: 'BGB', normgeber: 'de-bund' });
    ladeGesetzesXML.mockResolvedValue(null);
    const ursache = new Error('Callback');
    let beendet = false;
    const vorgang = mitGesetzDateiImport(async (importiereDatei) => {
      void importiereDatei('kanonisch-xml', '<gesetz/>');
      throw ursache;
    });
    const pruefung = expect(vorgang)
      .rejects.toBe(ursache)
      .then(() => {
        beendet = true;
      });
    await vi.waitFor(() => expect(speichereGesetz).toHaveBeenCalled());
    expect(beendet).toBe(false);
    beenden();
    await pruefung;
    expect(gibGesetzSperreFrei).toHaveBeenCalledWith({ kurztitel: 'BGB', normgeber: 'de-bund' });
  });
});

describe('dateigebundene Referenzdiagnosen', () => {
  it.each(['bja-xml', 'html-bw'] as const)(
    'erhält bei %s den Konflikt und liefert den Kurztitelfehler an den Empfänger',
    async (format) => {
      const roh = { xmlString: '<roh/>', kurztitel: 'BGB', langtitel: 'Bürgerliches Gesetzbuch' };
      importiereBundXML.mockReturnValue(roh);
      importiereGesetzHTMLBW.mockReturnValue(roh);
      leseGesetzInfos.mockReturnValue(gesetzesreferenz({ kurztitel: 'BGB' }));
      taggeVerweise.mockReturnValue('<neu/>');
      ladeGesetzesXML.mockResolvedValue('<alt/>');
      ladeAlleGesetze.mockResolvedValue([]);
      sucheImImportindexPerLangtitel.mockRejectedValue(new Error('Indexzugriff fehlt'));
      const empfangen = vi.fn();
      const ergebnis = await importiereGesetzDatei(format, '<quelle/>', {
        meldungEmpfangen: empfangen,
      });
      expect(ergebnis.art).toBe('konflikt');
      expect(empfangen).toHaveBeenCalledOnce();
      expect(empfangen.mock.calls[0]?.[0].text).toContain('Indexzugriff fehlt');
      expect(speichereGesetz).not.toHaveBeenCalled();
    },
  );

  it('schließt kanonische Nachbereitung mit Referenzdiagnose auch bei Arbeitsfehler ab', async () => {
    leseGesetzInfos.mockReturnValue(gesetzesreferenz({ kurztitel: 'BGB' }));
    nachbereiteGesetzesXML.mockImplementation(async (_xml, kontext) => {
      if (!kontext) throw new Error('Referenzkontext fehlt');
      kontext.meldeEinschraenkung('de-bund.xml', 'Referenzzugriff fehlt');
      kontext.meldeEinschraenkung('de-bund.xml', 'Referenzzugriff fehlt');
      kontext.meldeEinschraenkung('de-bw.xml', 'Andere Referenzquelle fehlt');
      throw new Error('Arbeitsfehler');
    });
    const empfangen = vi.fn();
    const ergebnis = await importiereGesetzDatei('kanonisch-xml', '<gesetz/>', {
      nachbereitungBeiImport: 'verweise',
      meldungEmpfangen: empfangen,
    });
    expect(ergebnis).toMatchObject({ art: 'fehler', fehler: { meldung: 'Arbeitsfehler' } });
    expect(empfangen).toHaveBeenCalledOnce();
    const text = empfangen.mock.calls[0]?.[0].text;
    expect(text.match(/Referenzzugriff fehlt/g)).toHaveLength(1);
    expect(text).toContain('Andere Referenzquelle fehlt');
    expect(speichereGesetz).not.toHaveBeenCalled();
  });
});

// Bestehende Szenarioattrappe des früheren Sammelwegs nur im Testzugang.
vi.mock('@/test/tabs/gesetzSpeicherTestzugang', async (original) => ({
  ...(await original<typeof import('@/test/tabs/gesetzSpeicherTestzugang')>()),
  ladeAlleGesetze: (...args: unknown[]) => ladeAlleGesetze(...args),
}));
