// @vitest-environment jsdom
// gesetzImportEU.integration.test.ts
// Echter Formex-Erstimport einschließlich Nachbereitung und Gesetzpersistenz; nur native I/O ersetzt.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { dateiAttrappen, gesetzDateistempelAttrappe } from '@/test/plattform/dateiAttrappen';
const io = vi.hoisted(() => ({
  dateien: new Map<string, string>(),
  fetch: vi.fn(),
  invoke: vi.fn(),
  suche: vi.fn(),
  vormerken: vi.fn(),
}));
vi.mock('@/lib/import/importindex/importindex.index', async (original) => ({
  ...(await original<object>()),
  sucheImImportindex: io.suche,
}));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: io.fetch }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: io.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: vi.fn() }));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
  resolveResource: async (pfad: string) => pfad,
}));
vi.mock('@tauri-apps/plugin-fs', () =>
  dateiAttrappen(io.dateien, async (pfad) => {
    const inhalt = io.dateien.get(pfad.replace('/daten/LexLata/', ''));
    if (inhalt === undefined) throw new Error('Datei fehlt.');
    return inhalt;
  }),
);
import { registrierePruefpflichtigeAenderung } from '@/lib/persistenz/kern/kern.index';
import { ladeAlleGesetze } from '@/test/tabs/gesetzSpeicherTestzugang';

import { importiereVomInternetEU, aktualisierungVomInternetEU } from './eu.index';
const pruefempfaenger = { vormerken: io.vormerken, abschliessen: async () => {} };
registrierePruefpflichtigeAenderung(pruefempfaenger);
beforeEach(() => {
  io.dateien.clear();
  io.dateien.set(
    'cache/suchverzeichnis.json',
    JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] }),
  );
  vi.resetAllMocks();
  localStorage.clear();
  io.vormerken.mockResolvedValue('vorgang');
  io.invoke.mockImplementation(
    async (name: string, args: { relativerPfad: string; inhalt: string }) => {
      if (name === 'gesetz_dateistempel_lesen') return gesetzDateistempelAttrappe(io.dateien);
      if (name === 'datei_sperre_erwerben') return 'token';
      if (name === 'datei_sperre_freigeben') return;
      if (name === 'atomar_datei_schreiben') {
        io.dateien.set(args.relativerPfad, args.inhalt);
        return;
      }
      throw new Error(`Unerwarteter Aufruf: ${name}`);
    },
  );
});
afterEach(() => vi.useRealTimers());
it('speichert Rom I und erkennt den zweiten Import aus dem gespeicherten Bestand', async () => {
  io.fetch.mockResolvedValue(
    new Response(
      new Uint8Array(readFileSync('src/lib/import/eu/testdaten/formex/32008R0593.fmx4')),
      { headers: { 'content-type': 'application/zip' } },
    ),
  );
  const eintrag = { kurztitel: 'Rom I', langtitel: 'Verordnung Rom I', abrufkennung: '32008R0593' };
  const kontext = {
    merkeGespeichertesGesetz: () => {},
    mitMeldungsempfaenger: async () => {
      throw new Error('Kein Teilvorgang in dieser Quellenattrappe');
    },
    referenzenFuer: async () => [],
    meldeEinschraenkung: () => {},
  };
  const ergebnis = await importiereVomInternetEU(
    eintrag,
    undefined,
    undefined,
    kontext,
    undefined,
    'original',
  );
  expect(ergebnis).toMatchObject({
    art: 'erfolg',
    gesetz: { kurztitel: 'Rom I', normgeber: 'eu' },
  });
  const gespeichert = io.dateien.get('gesetze/Rom I_eu.xml');
  expect(gespeichert).toContain('<ausfertigung>2008-06-17</ausfertigung>');
  expect(gespeichert).toContain('<satz zahl="1">');
  expect(
    (await ladeAlleGesetze()).map((g) => ({ kurztitel: g.kurztitel, normgeber: g.normgeber })),
  ).toEqual([{ kurztitel: 'Rom I', normgeber: 'eu' }]);
  expect(await importiereVomInternetEU(eintrag)).toMatchObject({
    art: 'fehler',
    fehler: { grund: 'bereitsVorhanden' },
  });
  expect(io.fetch).toHaveBeenCalledTimes(1);
});

import { validateXML } from 'xmllint-wasm';
import { parseGesetzesXML } from '@/lib/darstellung/darstellung.index';
import { extrahiereFormexZip } from './formexZip';

const archivOrdner = 'src/lib/import/eu/testdaten/formex/';
const gesetze = [
  {
    titel: 'AEUV',
    basis: '12016E/TXT',
    kons: '02016E/TXT-20250315',
    original: undefined,
    konsDatei: '02016E%2FTXT-20250315',
    artikel: 358,
    gruende: 0,
    praambel: 1,
    ausfertigung: '',
  },
  {
    titel: 'EUV',
    basis: '12016M/TXT',
    kons: '02016M/TXT-20250315',
    original: undefined,
    konsDatei: '02016M%2FTXT-20250315',
    artikel: 55,
    gruende: 0,
    praambel: 1,
    ausfertigung: '',
  },
  {
    titel: 'GRCh',
    basis: '12016P/TXT',
    kons: undefined,
    original: '12016P%2FTXT',
    konsDatei: undefined,
    artikel: 54,
    gruende: 0,
    praambel: 1,
    ausfertigung: '',
  },
  {
    titel: '2004/38/EG',
    basis: '32004L0038',
    kons: '02004L0038-20110616',
    original: undefined,
    konsDatei: '02004L0038-20110616',
    artikel: 42,
    gruende: 31,
    praambel: 0,
    ausfertigung: '2004-04-29',
  },
  {
    titel: 'Rom I',
    basis: '32008R0593',
    kons: '02008R0593-20080724',
    original: '32008R0593',
    konsDatei: undefined,
    artikel: 29,
    gruende: 46,
    praambel: 0,
    ausfertigung: '2008-06-17',
  },
  {
    titel: 'Rom II',
    basis: '32007R0864',
    kons: '02007R0864-20090111',
    original: '32007R0864',
    konsDatei: undefined,
    artikel: 32,
    gruende: 40,
    praambel: 0,
    ausfertigung: '2007-07-11',
  },
  {
    titel: 'EUGVVO',
    basis: '32012R1215',
    kons: '02012R1215-20150226',
    original: '32012R1215',
    konsDatei: undefined,
    artikel: 81,
    gruende: 41,
    praambel: 0,
    ausfertigung: '2012-12-12',
  },
  {
    titel: 'DSGVO',
    basis: '32016R0679',
    kons: '02016R0679-20160504',
    original: '32016R0679',
    konsDatei: '02016R0679-20160504',
    artikel: 99,
    gruende: 173,
    praambel: 0,
    ausfertigung: '2016-04-27',
  },
  {
    titel: 'DSA',
    basis: '32022R2065',
    kons: '02022R2065-20221027',
    original: undefined,
    konsDatei: '02022R2065-20221027',
    artikel: 93,
    gruende: 0,
    praambel: 0,
    ausfertigung: '2022-10-19',
  },
  {
    titel: 'AI Act',
    basis: '32024R1689',
    kons: '02024R1689-20260727',
    original: undefined,
    konsDatei: '02024R1689-20260727',
    artikel: 119,
    gruende: 0,
    praambel: 0,
    ausfertigung: '2024-06-13',
  },
];
for (const gesetz of gesetze) {
  for (const fassung of ['original', 'konsolidiert'] as const) {
    it(`${gesetz.titel}: Download → Speicher → gesetz.rng → Darstellung (${fassung})`, async () => {
      const abrufe: string[] = [];
      io.fetch.mockImplementation(async (url: string) => {
        if (url.includes('/sparql?'))
          return Response.json({
            results: {
              bindings: gesetz.kons
                ? [
                    {
                      kons: { value: gesetz.kons },
                      datum: {
                        value: gesetz.kons.slice(-8).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'),
                      },
                    },
                  ]
                : [],
            },
          });
        const celex = decodeURIComponent(url.split('/celex/')[1]!);
        abrufe.push(celex);
        const datei =
          celex === gesetz.basis
            ? gesetz.original
            : celex === gesetz.kons
              ? gesetz.konsDatei
              : undefined;
        if (!datei) return new Response(null, { status: 404 });
        return new Response(new Uint8Array(readFileSync(`${archivOrdner}${datei}.fmx4`)), {
          headers: { 'content-type': 'application/zip' },
        });
      });
      const konsVerwendet =
        gesetz.konsDatei !== undefined && (fassung === 'konsolidiert' || !gesetz.original);
      const datei = konsVerwendet ? gesetz.konsDatei! : gesetz.original!;
      const celex = konsVerwendet ? gesetz.kons! : gesetz.basis;
      const ergebnis = await importiereVomInternetEU(
        { kurztitel: gesetz.titel, langtitel: `Titel ${gesetz.titel}`, abrufkennung: gesetz.basis },
        undefined,
        undefined,
        {
          merkeGespeichertesGesetz: () => {},
          mitMeldungsempfaenger: async () => {
            throw new Error('Kein Teilvorgang in dieser Quellenattrappe');
          },
          referenzenFuer: async () => [],
          meldeEinschraenkung: () => {},
        },
        undefined,
        fassung,
      );
      expect(ergebnis).toMatchObject({ art: 'erfolg' });
      const zuerst = fassung === 'original' || !gesetz.kons ? gesetz.basis : gesetz.kons;
      expect(abrufe).toEqual(zuerst === celex ? [celex] : [zuerst, celex]);
      expect(new Set(abrufe).size).toBe(abrufe.length);
      expect(abrufe.length).toBeLessThanOrEqual(2);
      const gespeichert =
        io.dateien.get(`gesetze/${encodeURIComponent(gesetz.titel)}_eu.xml`) ??
        io.dateien.get(`gesetze/${gesetz.titel}_eu.xml`);
      expect(gespeichert).toBeDefined();
      const schema = await validateXML({
        xml: gespeichert!,
        schema: readFileSync('docs/schema/gesetz.rng', 'utf8'),
        extension: 'relaxng',
        maxMemoryPages: 2048,
      });
      expect(schema.valid, JSON.stringify(schema.errors)).toBe(true);
      const darstellung = parseGesetzesXML(gespeichert!)!;
      expect(darstellung).not.toBeNull();
      const normen = darstellung.elemente.filter((e) => e.typ === 'norm').map((e) => e.data);
      const gruende = gesetz.titel === 'DSGVO' && konsVerwendet ? 0 : gesetz.gruende;
      expect(normen.filter((n) => n.art === 'erwaegungsgrund')).toHaveLength(gruende);
      expect(normen.filter((n) => n.bezeichnung === 'Präambel')).toHaveLength(gesetz.praambel);
      const gliederungsartikel = normen.filter((n) => n.art === 'gliederungsartikel');
      expect(gliederungsartikel).toHaveLength(0);
      expect(
        normen.filter(
          (n) =>
            n.art !== 'erwaegungsgrund' &&
            n.bezeichnung !== 'Präambel' &&
            n.art !== 'gliederungsartikel',
        ),
      ).toHaveLength(gesetz.artikel);
      expect(normen).toHaveLength(
        gesetz.artikel + gruende + gesetz.praambel + gliederungsartikel.length,
      );
      const archiv = extrahiereFormexZip(
        new Uint8Array(readFileSync(`${archivOrdner}${datei}.fmx4`)),
      );
      if ('fehler' in archiv) throw Error(archiv.fehler);
      const quelle = new DOMParser().parseFromString(archiv.hauptdatei, 'application/xml');
      const haupttext = quelle.getElementsByTagName('ENACTING.TERMS')[0]!;
      expect(darstellung.elemente.filter((e) => e.typ === 'ueberschrift')).toHaveLength(
        haupttext.getElementsByTagName('DIVISION').length + (gruende > 0 ? 1 : 0),
      );
      expect(darstellung.normgeber).toBe('eu');
      expect(darstellung.datenquelle?.name).toBe('EUR-Lex');
      expect(darstellung.datenquelle?.url).toContain(`CELEX:${celex}`);
      expect(darstellung.fundstelle).toMatch(/^ABl\. /);
      expect(darstellung.ausfertigung ?? '').toBe(gesetz.ausfertigung);
      expect(darstellung.aenderungsvermerk).toBeUndefined();
      expect(darstellung.fassung).toEqual({
        art: konsVerwendet ? 'konsolidiert' : 'original',
        stichtag: konsVerwendet
          ? gesetz.kons!.slice(-8).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')
          : undefined,
        erwaegungsgruendeErgaenzt: undefined,
      });
      const bestand = await ladeAlleGesetze();
      expect(bestand).toHaveLength(1);
      const ohneAnzeigeIDs = (wert: unknown) =>
        JSON.parse(JSON.stringify(wert, (key, value) => (key === 'id' ? undefined : value)));
      expect(ohneAnzeigeIDs(bestand[0]!.elemente)).toEqual(ohneAnzeigeIDs(darstellung.elemente));
    }, 30_000);
  }
}

it('vergleicht echte EU-Aktualisierungen und meldet Prüfbedarf nur bei geändertem Inhalt', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
  localStorage.setItem('lexlata.euFassung', 'original');
  const eintrag = { kurztitel: 'Rom I', langtitel: 'Verordnung Rom I', abrufkennung: '32008R0593' };
  io.suche.mockResolvedValue(eintrag);
  io.fetch.mockImplementation(
    async () =>
      new Response(new Uint8Array(readFileSync(`${archivOrdner}32008R0593.fmx4`)), {
        headers: { 'content-type': 'application/zip' },
      }),
  );
  const kontext = {
    merkeGespeichertesGesetz: () => {},
    mitMeldungsempfaenger: async () => {
      throw new Error('Kein Teilvorgang in dieser Quellenattrappe');
    },
    referenzenFuer: async () => [],
    meldeEinschraenkung: () => {},
  };
  const erstimport = await importiereVomInternetEU(eintrag, undefined, undefined, kontext);
  if (erstimport.art !== 'erfolg') throw new Error('Erstimport erwartet');
  const gespeichertesXML = io.dateien.get('gesetze/Rom I_eu.xml');
  expect(gespeichertesXML).toContain('<letzteNeuerung>2026-10-25T12:00:00Z</letzteNeuerung>');
  vi.setSystemTime(new Date('2026-10-26T13:30:00Z'));
  io.invoke.mockClear();
  io.vormerken.mockClear();
  expect(await aktualisierungVomInternetEU(erstimport.gesetz, undefined, kontext)).toMatchObject({
    kategorie: 'unveraendert',
  });
  expect(io.vormerken).not.toHaveBeenCalled();
  expect(io.dateien.get('gesetze/Rom I_eu.xml')).toContain(
    '<verarbeitungszeit>2026-10-26T13:30:00Z</verarbeitungszeit>',
  );
  const ohnePruefzeitpunkt = (xml: string | undefined) => {
    if (!xml) throw new Error('Gespeicherte Datei erwartet');
    return xml.replace(/<verarbeitungszeit>[^<]*<\/verarbeitungszeit>/, '');
  };
  expect(ohnePruefzeitpunkt(io.dateien.get('gesetze/Rom I_eu.xml'))).toBe(
    ohnePruefzeitpunkt(gespeichertesXML),
  );
  const pfad = 'gesetze/Rom I_eu.xml';
  io.dateien.set(
    pfad,
    io.dateien.get(pfad)!.replace('vertragliche Schuldverhältnisse', 'frühere Schuldverhältnisse'),
  );
  expect(await aktualisierungVomInternetEU(erstimport.gesetz, undefined, kontext)).toMatchObject({
    kategorie: 'aktualisiert',
  });
  expect(io.vormerken).toHaveBeenCalled();
  expect(io.dateien.get(pfad)).not.toContain('frühere Schuldverhältnisse');
});

// Ergänzungsfehler müssen vor jedem Vergleich und jeder Nutzerdatenänderung enden.
import { zipSync, strToU8, unzipSync, strFromU8 } from 'fflate';
function ergaenzungsAntwort(art: 'leer' | 'xml' | 'zip') {
  if (art === 'zip')
    return new Response('kein ZIP', { headers: { 'content-type': 'application/zip' } });
  const hauptdatei =
    '<ACT><PREAMBLE/><ENACTING.TERMS><ARTICLE><TI.ART>Artikel 1</TI.ART><ALINEA>Text</ALINEA></ARTICLE></ENACTING.TERMS></ACT>';
  return new Response(
    zipSync({
      'test.doc.xml': strToU8('<DOC><REF.PHYS TYPE="DOC.XML" FILE="haupt.xml"/></DOC>'),
      'haupt.xml': strToU8(art === 'xml' ? hauptdatei + '<kaputt>' : hauptdatei),
    }),
    { headers: { 'content-type': 'application/zip' } },
  );
}
const dsgvoEintrag = { kurztitel: 'DSGVO', langtitel: 'Verordnung', abrufkennung: '32016R0679' };
function ergaenzungsDownloads(original: () => Response | Promise<Response>) {
  io.suche.mockResolvedValue(dsgvoEintrag);
  io.fetch.mockImplementation(async (url: string) => {
    if (url.includes('/sparql?'))
      return Response.json({
        results: {
          bindings: [{ kons: { value: '02016R0679-20160504' }, datum: { value: '2016-05-04' } }],
        },
      });
    if (url.endsWith('/32016R0679')) return original();
    return new Response(new Uint8Array(readFileSync(`${archivOrdner}02016R0679-20160504.fmx4`)), {
      headers: { 'content-type': 'application/zip' },
    });
  });
}
const ergaenzungsKontext = {
  merkeGespeichertesGesetz: () => {},
  mitMeldungsempfaenger: async () => {
    throw new Error('Kein Teilvorgang in dieser Quellenattrappe');
  },
  referenzenFuer: async () => [],
  meldeEinschraenkung: () => {},
};
it.each([404, 406, 500, 'verbindung', 'zip', 'xml', 'leer'] as const)(
  'erhält ergänzten Bestand und Nutzerdaten bei Originalfehler %s und erlaubt späteren Versuch',
  async (fehler) => {
    ergaenzungsDownloads(
      () =>
        new Response(new Uint8Array(readFileSync(`${archivOrdner}32016R0679.fmx4`)), {
          headers: { 'content-type': 'application/zip' },
        }),
    );
    const importiert = await importiereVomInternetEU(
      dsgvoEintrag,
      undefined,
      undefined,
      ergaenzungsKontext,
    );
    if (importiert.art !== 'erfolg') throw new Error('Erfolgreicher Erstimport erwartet');
    expect(
      importiert.gesetz.elemente.filter(
        (e) => e.typ === 'norm' && e.data.art === 'erwaegungsgrund',
      ),
    ).toHaveLength(173);
    io.dateien.set(
      'markierungen/DSGVO_eu-markierungen.xml',
      '<markierungen version="1"><infos><gesetz normgeber="eu">DSGVO</gesetz><verarbeitungszeit>2026-10-21T00:00:00Z</verarbeitungszeit></infos><inhalt><kommentar><elementstand><textlaenge>0</textlaenge></elementstand><bezeichnung>E1</bezeichnung><kommentartext>Kommentar zu E1</kommentartext></kommentar></inhalt></markierungen>',
    );
    io.dateien.set(
      'markierungskonflikte.xml',
      '<markierungskonflikte version="1" pruefstatus="aktuell"><gesetz kurztitel="DSGVO" normgeber="eu"><kommentar><konflikt typ="bezugstext-fehlt-oder-unpassend"/><bezeichnung>E1</bezeichnung><kommentartext>Kommentar zu E1</kommentartext></kommentar></gesetz></markierungskonflikte>',
    );
    const vorher = new Map(io.dateien);
    io.vormerken.mockClear();
    ergaenzungsDownloads(() => {
      if (typeof fehler === 'number') return new Response(null, { status: fehler });
      if (fehler === 'verbindung') throw new TypeError('Failed to fetch');
      return ergaenzungsAntwort(fehler);
    });
    expect(
      await aktualisierungVomInternetEU(importiert.gesetz, undefined, ergaenzungsKontext),
    ).toMatchObject({
      art: 'fehler',
      fehler: {
        grund:
          fehler === 'verbindung'
            ? 'keineVerbindung'
            : fehler === 'zip'
              ? 'entpacken'
              : fehler === 'leer' || fehler === 'xml'
                ? 'format'
                : 'download',
      },
    });
    expect(io.dateien).toEqual(vorher);
    expect(io.vormerken).not.toHaveBeenCalled();
    ergaenzungsDownloads(
      () =>
        new Response(new Uint8Array(readFileSync(`${archivOrdner}32016R0679.fmx4`)), {
          headers: { 'content-type': 'application/zip' },
        }),
    );
    expect(
      await aktualisierungVomInternetEU(importiert.gesetz, undefined, ergaenzungsKontext),
    ).toMatchObject({ art: 'erfolg', kategorie: 'unveraendert' });
  },
  30_000,
);
it.each([404, 406, 'leer'] as const)(
  'erhält inzwischen gespeicherte Ergänzungen bei altem Aufruferobjekt und Originalfehler %s',
  async (fehler) => {
    localStorage.setItem('lexlata.euFassung', 'konsolidiert');
    ergaenzungsDownloads(
      () =>
        new Response(new Uint8Array(readFileSync(`${archivOrdner}32016R0679.fmx4`)), {
          headers: { 'content-type': 'application/zip' },
        }),
    );
    const bestand = await importiereVomInternetEU(
      dsgvoEintrag,
      undefined,
      undefined,
      ergaenzungsKontext,
    );
    if (bestand.art !== 'erfolg') throw new Error('Erstimport erwartet');
    expect(bestand.gesetz.fassung?.erwaegungsgruendeErgaenzt).toBeUndefined();
    localStorage.setItem('lexlata.euFassung', 'konsolidiert-mit-erwaegungsgruenden');
    const ergaenzt = await aktualisierungVomInternetEU(
      bestand.gesetz,
      undefined,
      ergaenzungsKontext,
    );
    if (ergaenzt.art !== 'erfolg') throw new Error('Ergänzung erwartet');
    expect(
      ergaenzt.gesetz.elemente.filter((e) => e.typ === 'norm' && e.data.art === 'erwaegungsgrund'),
    ).toHaveLength(173);
    const vorher = new Map(io.dateien);
    io.vormerken.mockClear();
    ergaenzungsDownloads(() =>
      typeof fehler === 'number'
        ? new Response(null, { status: fehler })
        : ergaenzungsAntwort('leer'),
    );
    expect(
      await aktualisierungVomInternetEU(bestand.gesetz, undefined, ergaenzungsKontext),
    ).toMatchObject({
      art: 'fehler',
      fehler: {
        grund: fehler === 'leer' ? 'format' : 'download',
        meldung: expect.stringContaining('Bestehende Fassung wurde beibehalten'),
      },
    });
    expect(io.dateien).toEqual(vorher);
    expect(io.vormerken).not.toHaveBeenCalled();
  },
  30_000,
);
it.each([404, 406, 'leer', 'verbindung'] as const)(
  'aktualisiert bisher nicht ergänzten Bestand bei %s nach Verfügbarkeitsvertrag',
  async (fehler) => {
    localStorage.setItem('lexlata.euFassung', 'konsolidiert');
    ergaenzungsDownloads(() => new Response(null, { status: 404 }));
    const bestand = await importiereVomInternetEU(
      dsgvoEintrag,
      undefined,
      undefined,
      ergaenzungsKontext,
    );
    if (bestand.art !== 'erfolg') throw new Error('Erstimport erwartet');
    localStorage.setItem('lexlata.euFassung', 'konsolidiert-mit-erwaegungsgruenden');
    const vorher = new Map(io.dateien);
    io.vormerken.mockClear();
    ergaenzungsDownloads(() => {
      if (typeof fehler === 'number') return new Response(null, { status: fehler });
      if (fehler === 'verbindung') throw new TypeError('Failed to fetch');
      return ergaenzungsAntwort('leer');
    });
    const ergebnis = await aktualisierungVomInternetEU(
      bestand.gesetz,
      undefined,
      ergaenzungsKontext,
    );
    expect(ergebnis.art).toBe(fehler === 'verbindung' ? 'fehler' : 'erfolg');
    if (fehler === 'verbindung') expect(io.dateien).toEqual(vorher);
    expect(io.dateien.get('gesetze/DSGVO_eu.xml')).not.toContain(
      'erwaegungsgruendeErgaenzt="true"',
    );
    expect(io.vormerken).not.toHaveBeenCalled();
  },
);
it('ergänzt bei Aktualisierung und erlaubt danach den bewussten Wechsel ohne Ergänzung', async () => {
  localStorage.setItem('lexlata.euFassung', 'konsolidiert');
  ergaenzungsDownloads(
    () =>
      new Response(new Uint8Array(readFileSync(`${archivOrdner}32016R0679.fmx4`)), {
        headers: { 'content-type': 'application/zip' },
      }),
  );
  const bestand = await importiereVomInternetEU(
    dsgvoEintrag,
    undefined,
    undefined,
    ergaenzungsKontext,
  );
  if (bestand.art !== 'erfolg') throw new Error('Erstimport erwartet');
  localStorage.setItem('lexlata.euFassung', 'konsolidiert-mit-erwaegungsgruenden');
  const ergaenzt = await aktualisierungVomInternetEU(bestand.gesetz, undefined, ergaenzungsKontext);
  expect(ergaenzt).toMatchObject({ art: 'erfolg', kategorie: 'aktualisiert' });
  expect(io.dateien.get('gesetze/DSGVO_eu.xml')).toContain('erwaegungsgruendeErgaenzt="true"');
  if (ergaenzt.art !== 'erfolg') throw new Error('Aktualisierung erwartet');
  localStorage.setItem('lexlata.euFassung', 'konsolidiert');
  expect(
    await aktualisierungVomInternetEU(ergaenzt.gesetz, undefined, ergaenzungsKontext),
  ).toMatchObject({ art: 'erfolg', kategorie: 'aktualisiert' });
  expect(io.dateien.get('gesetze/DSGVO_eu.xml')).not.toContain('erwaegungsgruendeErgaenzt="true"');
});

it('übernimmt neue DSGVO-Konsolidierung mit Markierungen und erkennt den anschließenden Fassungswechsel', async () => {
  let neueKonsolidierung = false;
  const archiv = unzipSync(new Uint8Array(readFileSync(`${archivOrdner}02016R0679-20160504.fmx4`)));
  const hauptdatei = Object.keys(archiv).find((name) => name === 'CL2016R0679DE0000030.0001.xml')!;
  const vorherigerText = 'Diese Verordnung enthält Vorschriften zum Schutz natürlicher Personen';
  const neuerText =
    'Diese Verordnung enthält aktualisierte Vorschriften zum Schutz natürlicher Personen';
  expect(strFromU8(archiv[hauptdatei]!)).toContain(vorherigerText);
  archiv[hauptdatei] = strToU8(strFromU8(archiv[hauptdatei]!).replace(vorherigerText, neuerText));
  const geaendertesArchiv = zipSync(archiv);
  io.suche.mockResolvedValue(dsgvoEintrag);
  io.fetch.mockImplementation(async (url: string) => {
    if (url.includes('/sparql?'))
      return Response.json({
        results: {
          bindings: [
            {
              kons: { value: neueKonsolidierung ? '02016R0679-20261021' : '02016R0679-20160504' },
              datum: { value: neueKonsolidierung ? '2026-10-21' : '2016-05-04' },
            },
          ],
        },
      });
    const daten = url.endsWith('/02016R0679-20261021')
      ? geaendertesArchiv
      : new Uint8Array(
          readFileSync(
            `${archivOrdner}${url.endsWith('/32016R0679') ? '32016R0679' : '02016R0679-20160504'}.fmx4`,
          ),
        );
    return new Response(daten, { headers: { 'content-type': 'application/zip' } });
  });
  const erstimport = await importiereVomInternetEU(
    dsgvoEintrag,
    undefined,
    undefined,
    ergaenzungsKontext,
  );
  if (erstimport.art !== 'erfolg') throw new Error('Erstimport erwartet');
  expect(
    erstimport.gesetz.elemente.filter((e) => e.typ === 'norm' && e.data.art === 'erwaegungsgrund'),
  ).toHaveLength(173);
  const markierungen =
    '<markierungen version="1"><infos><gesetz normgeber="eu">DSGVO</gesetz><verarbeitungszeit>2026-10-21T00:00:00Z</verarbeitungszeit></infos><inhalt><kommentar><elementstand><textlaenge>0</textlaenge></elementstand><bezeichnung>Art. 1</bezeichnung><kommentartext>Kommentar zum geänderten Artikel</kommentartext></kommentar></inhalt></markierungen>';
  const schema = await validateXML({
    xml: markierungen,
    schema: readFileSync('docs/schema/markierungen.rng', 'utf8'),
    extension: 'relaxng',
  });
  expect(schema.valid, JSON.stringify(schema.errors)).toBe(true);
  io.dateien.set('markierungen/DSGVO_eu-markierungen.xml', markierungen);
  io.vormerken.mockClear();
  neueKonsolidierung = true;
  const aktualisiert = await aktualisierungVomInternetEU(
    erstimport.gesetz,
    undefined,
    ergaenzungsKontext,
  );
  expect(aktualisiert).toMatchObject({ art: 'erfolg', kategorie: 'aktualisiert' });
  if (aktualisiert.art !== 'erfolg') throw new Error('Aktualisierung erwartet');
  expect(io.fetch.mock.calls.some(([url]) => String(url).endsWith('/02016R0679-20261021'))).toBe(
    true,
  );
  expect(io.dateien.get('gesetze/DSGVO_eu.xml')).toContain(neuerText);
  expect(io.dateien.get('gesetze/DSGVO_eu.xml')).toContain('stichtag="2026-10-21"');
  expect(
    aktualisiert.gesetz.elemente.filter(
      (e) => e.typ === 'norm' && e.data.art === 'erwaegungsgrund',
    ),
  ).toHaveLength(173);
  expect(io.dateien.get('markierungen/DSGVO_eu-markierungen.xml')).toBe(markierungen);
  expect(io.vormerken).toHaveBeenCalled();
  io.vormerken.mockClear();
  localStorage.setItem('lexlata.euFassung', 'konsolidiert');
  const gewechselt = await aktualisierungVomInternetEU(
    aktualisiert.gesetz,
    undefined,
    ergaenzungsKontext,
  );
  expect(gewechselt).toMatchObject({ art: 'erfolg', kategorie: 'aktualisiert' });
  if (gewechselt.art !== 'erfolg') throw new Error('Fassungswechsel erwartet');
  expect(
    gewechselt.gesetz.elemente.filter((e) => e.typ === 'norm' && e.data.art === 'erwaegungsgrund'),
  ).toHaveLength(0);
  expect(io.dateien.get('gesetze/DSGVO_eu.xml')).toContain(neuerText);
  expect(io.dateien.get('markierungen/DSGVO_eu-markierungen.xml')).toBe(markierungen);
  expect(io.vormerken).toHaveBeenCalled();
}, 30_000);

it('meldet den ersten GRCh-Rückfall, bleibt bei gespeichertem Originaltext ruhig und zeigt Fehler weiter', async () => {
  const eintrag = { kurztitel: 'GRCh', langtitel: 'Grundrechtecharta', abrufkennung: '12016P/TXT' };
  io.suche.mockResolvedValue(eintrag);
  io.fetch.mockImplementation(async (url: string) =>
    url.includes('/sparql?')
      ? Response.json({ results: { bindings: [] } })
      : new Response(new Uint8Array(readFileSync(`${archivOrdner}12016P%2FTXT.fmx4`)), {
          headers: { 'content-type': 'application/zip' },
        }),
  );
  const melden = vi.fn();
  const importiert = await importiereVomInternetEU(
    eintrag,
    undefined,
    undefined,
    ergaenzungsKontext,
    melden,
  );
  if (importiert.art !== 'erfolg') throw new Error('Erstimport erwartet');
  expect(melden).toHaveBeenCalledWith(
    expect.objectContaining({ text: expect.stringContaining('Originaltext importiert.') }),
  );
  melden.mockClear();
  const veraltetesGesetz = {
    ...importiert.gesetz,
    fassung: { art: 'konsolidiert' as const, stichtag: '2020-01-01' },
  };
  expect(
    await aktualisierungVomInternetEU(veraltetesGesetz, undefined, ergaenzungsKontext, melden),
  ).toMatchObject({ art: 'erfolg', kategorie: 'unveraendert' });
  expect(melden).not.toHaveBeenCalled();
  io.dateien.set(
    'gesetze/GRCh_eu.xml',
    io.dateien
      .get('gesetze/GRCh_eu.xml')!
      .replace('<fassung art="original"/>', '<fassung art="konsolidiert" stichtag="2020-01-01"/>'),
  );
  expect(
    await aktualisierungVomInternetEU(importiert.gesetz, undefined, ergaenzungsKontext, melden),
  ).toMatchObject({ art: 'erfolg', kategorie: 'aktualisiert' });
  expect(melden).toHaveBeenCalledWith(
    expect.objectContaining({ text: expect.stringContaining('Originaltext importiert.') }),
  );
  melden.mockClear();
  io.fetch.mockResolvedValueOnce(new Response(null, { status: 500 }));
  expect(
    await aktualisierungVomInternetEU(importiert.gesetz, undefined, ergaenzungsKontext, melden),
  ).toMatchObject({ art: 'fehler', fehler: { grund: 'download' } });
});

it.each([500, 'zip', 'xml'] as const)(
  'erhält unergänzten Bestand bei ergänzendem Originalfehler %s ohne Speichern',
  async (fehler) => {
    localStorage.setItem('lexlata.euFassung', 'konsolidiert');
    ergaenzungsDownloads(() => new Response(null, { status: 404 }));
    const bestand = await importiereVomInternetEU(
      dsgvoEintrag,
      undefined,
      undefined,
      ergaenzungsKontext,
    );
    if (bestand.art !== 'erfolg') throw new Error('Erstimport erwartet');
    const vorher = new Map(io.dateien);
    io.vormerken.mockClear();
    localStorage.setItem('lexlata.euFassung', 'konsolidiert-mit-erwaegungsgruenden');
    ergaenzungsDownloads(() =>
      typeof fehler === 'number'
        ? new Response(null, { status: fehler })
        : ergaenzungsAntwort(fehler),
    );
    expect(
      await aktualisierungVomInternetEU(bestand.gesetz, undefined, ergaenzungsKontext),
    ).toMatchObject({
      art: 'fehler',
      fehler: { meldung: expect.stringContaining('Bestehende Fassung wurde beibehalten') },
    });
    expect(io.dateien).toEqual(vorher);
    expect(io.vormerken).not.toHaveBeenCalled();
  },
);
it.each([500, 'verbindung', 'zip', 'xml'] as const)(
  'speichert beim Erstimport trotz ergänzendem Originalfehler %s mit Warnung',
  async (fehler) => {
    ergaenzungsDownloads(() => {
      if (fehler === 'verbindung') throw new TypeError('Failed to fetch');
      return typeof fehler === 'number'
        ? new Response(null, { status: fehler })
        : ergaenzungsAntwort(fehler);
    });
    const melden = vi.fn();
    expect(
      await importiereVomInternetEU(dsgvoEintrag, undefined, undefined, ergaenzungsKontext, melden),
    ).toMatchObject({ art: 'erfolg' });
    expect(io.dateien.get('gesetze/DSGVO_eu.xml')).toContain('<gesetz version="1">');
    expect(melden).toHaveBeenCalledWith(
      expect.objectContaining({
        typ: 'warnung',
        text: expect.stringContaining('Erwägungsgründe konnten nicht geladen werden'),
      }),
    );
  },
);

it('meldet beim Fassungsrückfall auch einen allein geänderten Stichtag', async () => {
  localStorage.setItem('lexlata.euFassung', 'original');
  const eintrag = { kurztitel: 'Rom I', langtitel: 'Verordnung Rom I', abrufkennung: '32008R0593' };
  io.suche.mockResolvedValue(eintrag);
  io.fetch.mockImplementation(async (url: string) => {
    if (url.includes('/sparql?'))
      return Response.json({
        results: {
          bindings: [{ kons: { value: '02008R0593-20250101' }, datum: { value: '2025-01-01' } }],
        },
      });
    if (url.endsWith('/32008R0593')) return new Response(null, { status: 404 });
    return new Response(new Uint8Array(readFileSync(`${archivOrdner}32008R0593.fmx4`)), {
      headers: { 'content-type': 'application/zip' },
    });
  });
  const melden = vi.fn();
  const importiert = await importiereVomInternetEU(
    eintrag,
    undefined,
    undefined,
    ergaenzungsKontext,
    melden,
  );
  if (importiert.art !== 'erfolg') throw new Error('Erstimport erwartet');
  expect(importiert.gesetz.fassung).toMatchObject({ art: 'konsolidiert', stichtag: '2025-01-01' });
  melden.mockClear();
  const pfad = 'gesetze/Rom I_eu.xml';
  const xml = io.dateien.get(pfad);
  if (!xml) throw new Error('Gespeicherte Datei erwartet');
  io.dateien.set(pfad, xml.replace('stichtag="2025-01-01"', 'stichtag="2020-01-01"'));
  expect(
    await aktualisierungVomInternetEU(importiert.gesetz, undefined, ergaenzungsKontext, melden),
  ).toMatchObject({ art: 'erfolg', kategorie: 'aktualisiert' });
  expect(melden).toHaveBeenCalledWith(
    expect.objectContaining({
      text: expect.stringContaining(
        'Konsolidierte Fassung vom 01.01.2025 (keine Rechtswirkung) importiert.',
      ),
    }),
  );
});
