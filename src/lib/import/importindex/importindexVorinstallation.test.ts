import { importindexFixture } from '@/test/import/europaImportFixtures';
// importindexVorinstallation.test.ts
//
// Deckt den Bundle->AppData-Kopiermechanismus ab: Kopieren wenn keine/ältere
// AppData-Version vorhanden ist, Überspringen bei gleich-/neuerer Version,
// einheitliche Dateinamen in Ressourcen und AppData sowie
// synchronisiereStartupImportindizes (Fehler-Isolation zwischen Dateien) und
// stelleStandardWieder (bedingungslos). Tauri-fs/-path sowie appDatenZugriff
// werden über In-Memory-Maps gemockt.

import { readFileSync } from 'node:fs';
import { appDatenLesen, sicherstelleOrdner } from '@/lib/persistenz/kern/kern.index';
import { pruefeXmlWohlgeformtheit } from '@/test/plattform/xmlPruefung';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const bundleDateien = new Map<string, string>();
const appDatenSpeicher = new Map<string, string>();
const resolveResourceAufrufe: string[] = [];

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: vi.fn((pfad: string) => {
    const inhalt = bundleDateien.get(pfad);
    if (inhalt === undefined) return Promise.reject(new Error(`Ressource nicht gefunden: ${pfad}`));
    return Promise.resolve(inhalt);
  }),
}));

vi.mock('@tauri-apps/api/path', () => ({
  resolveResource: vi.fn((relativ: string) => {
    resolveResourceAufrufe.push(relativ);
    return Promise.resolve(relativ);
  }),
}));

vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  sicherstelleOrdner: vi.fn(() => Promise.resolve()),
  appDatenLesen: vi.fn((pfad: string) => {
    const inhalt = appDatenSpeicher.get(pfad);
    if (inhalt === undefined) return Promise.reject(new Error('Datei nicht gefunden'));
    return Promise.resolve(inhalt);
  }),
  appDatenSchreiben: vi.fn((pfad: string, inhalt: string) => {
    appDatenSpeicher.set(pfad, inhalt);
    return Promise.resolve();
  }),
  appDatenExistiert: vi.fn((pfad: string) => Promise.resolve(appDatenSpeicher.has(pfad))),
}));

import {
  synchronisiereEineDatei,
  synchronisiereStartupImportindizes,
  stelleStandardWieder,
} from './importindexVorinstallation';
import { leseHerkunft, liesVerarbeitungszeit } from './importindexErstellung.persistenz';

const BUND_ZIEL = 'de-bund.xml';
const BUND_APPDATA_PFAD = 'importindizes/de-bund.xml';
const BUND_RESSOURCE_PFAD = 'resources/importindizes/de-bund.xml';

const BW_ZIEL = 'de-bw.xml';
const BW_APPDATA_PFAD = 'importindizes/de-bw.xml';
const BW_RESSOURCE_PFAD = 'resources/importindizes/de-bw.xml';

function bundleXml(datum: string, normgeber = 'de-bund'): string {
  return `<importindex version="1"><infos><normgeber>${normgeber}</normgeber><datenquelle/><verarbeitungszeit>${datum}</verarbeitungszeit></infos><inhalt/></importindex>`;
}

beforeEach(() => {
  vi.clearAllMocks();
  bundleDateien.clear();
  appDatenSpeicher.clear();
  resolveResourceAufrufe.length = 0;
});

// ---------------------------------------------------------------------------
// Einheitliche Ressourcen- und AppData-Namen
// ---------------------------------------------------------------------------

describe('Ressourcen- und AppData-Pfade', () => {
  it('MUTATIONSTEST: installiert de-bund.xml aus der gleichnamigen Ressource', async () => {
    bundleDateien.set(BUND_RESSOURCE_PFAD, bundleXml('2026-01-01T00:00:00.000Z'));
    await synchronisiereEineDatei(BUND_ZIEL);
    expect(resolveResourceAufrufe).toContain(BUND_RESSOURCE_PFAD);
    expect(appDatenSpeicher.has(BUND_APPDATA_PFAD)).toBe(true);
  });

  it('MUTATIONSTEST: löst "de-bw.xml" über "de-bw.xml" auf', async () => {
    bundleDateien.set(BW_RESSOURCE_PFAD, bundleXml('2026-01-01T00:00:00.000Z', 'de-bw'));
    await synchronisiereEineDatei(BW_ZIEL);
    expect(resolveResourceAufrufe).toContain(BW_RESSOURCE_PFAD);
  });

  it.each(['Zukuenftiges Standardgesetz.xml', 'Index Bundesrecht.xml', 'Index Landesrecht BW.xml'])(
    'weist den unbekannten oder alten Zieldateinamen %s vor jedem Zugriff zurück',
    async (ziel) => {
      bundleDateien.set(`resources/importindizes/${ziel}`, bundleXml('2026-01-01T00:00:00.000Z'));
      await expect(synchronisiereEineDatei(ziel)).rejects.toThrow(
        'Unbekannter Importindexdateiname',
      );
      expect(resolveResourceAufrufe).toEqual([]);
    },
  );
});

// ---------------------------------------------------------------------------
// synchronisiereEineDatei
// ---------------------------------------------------------------------------

describe('synchronisiereEineDatei', () => {
  it('kopiert die Bundle-Version, wenn in AppData noch keine Datei existiert', async () => {
    bundleDateien.set(BUND_RESSOURCE_PFAD, bundleXml('2026-01-01T00:00:00.000Z'));
    await synchronisiereEineDatei(BUND_ZIEL);
    expect(appDatenSpeicher.has(BUND_APPDATA_PFAD)).toBe(true);
  });

  it('kopiert die Bundle-Version, wenn die AppData-Version ein älteres <verarbeitungszeit>-Datum trägt', async () => {
    appDatenSpeicher.set(BUND_APPDATA_PFAD, bundleXml('2020-01-01T00:00:00.000Z'));
    bundleDateien.set(BUND_RESSOURCE_PFAD, bundleXml('2026-01-01T00:00:00.000Z'));
    await synchronisiereEineDatei(BUND_ZIEL);
    expect(
      liesVerarbeitungszeit(appDatenSpeicher.get(BUND_APPDATA_PFAD) ?? '')?.toISOString(),
    ).toBe('2026-01-01T00:00:00.000Z');
  });

  it('MUTATIONSTEST: überspringt das Kopieren, wenn die AppData-Version ein NEUERES <verarbeitungszeit>-Datum trägt (bundleDatum <= appDataDatum, nicht "<")', async () => {
    appDatenSpeicher.set(BUND_APPDATA_PFAD, bundleXml('2030-01-01T00:00:00.000Z'));
    bundleDateien.set(BUND_RESSOURCE_PFAD, bundleXml('2026-01-01T00:00:00.000Z'));
    await synchronisiereEineDatei(BUND_ZIEL);
    expect(appDatenSpeicher.get(BUND_APPDATA_PFAD)).toBe(bundleXml('2030-01-01T00:00:00.000Z'));
  });

  it('MUTATIONSTEST: überspringt das Kopieren auch bei GLEICHEM <verarbeitungszeit>-Datum (Grenzfall der "<="-Bedingung)', async () => {
    const gleichesDatum = '2026-01-01T00:00:00.000Z';
    appDatenSpeicher.set(BUND_APPDATA_PFAD, bundleXml(gleichesDatum));
    bundleDateien.set(BUND_RESSOURCE_PFAD, bundleXml(gleichesDatum));
    await synchronisiereEineDatei(BUND_ZIEL);
    // Unverändert (kein appDatenSchreiben-Aufruf) -> exakt der Ausgangswert.
    expect(appDatenSpeicher.get(BUND_APPDATA_PFAD)).toBe(bundleXml(gleichesDatum));
  });

  it('setzt beim Kopieren herkunft="standard"', async () => {
    bundleDateien.set(BUND_RESSOURCE_PFAD, bundleXml('2026-01-01T00:00:00.000Z'));
    await synchronisiereEineDatei(BUND_ZIEL);
    expect(leseHerkunft(appDatenSpeicher.get(BUND_APPDATA_PFAD) ?? '')).toBe('standard');
  });

  it('wirft einen Fehler, wenn die Bundle-XML kein <verarbeitungszeit>-Element enthält UND bereits eine AppData-Version existiert (Datumsvergleich schlägt fehl)', async () => {
    appDatenSpeicher.set(BUND_APPDATA_PFAD, bundleXml('2020-01-01T00:00:00.000Z'));
    bundleDateien.set(BUND_RESSOURCE_PFAD, '<importindex></importindex>');
    await expect(synchronisiereEineDatei(BUND_ZIEL)).rejects.toThrow('Ungültiges Importindex-XML');
  });

  it('installiert ungültige Standards auch ohne vorhandenen Bestand nicht', async () => {
    bundleDateien.set(BUND_RESSOURCE_PFAD, '<importindex></importindex>');
    await expect(synchronisiereEineDatei(BUND_ZIEL)).rejects.toThrow();
    expect(appDatenSpeicher.has(BUND_APPDATA_PFAD)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// synchronisiereStartupImportindizes
// ---------------------------------------------------------------------------

describe('synchronisiereStartupImportindizes', () => {
  it('gleicht sowohl Bundesrecht- als auch Landesrecht-BW-Index ab', async () => {
    bundleDateien.set(BUND_RESSOURCE_PFAD, bundleXml('2026-01-01T00:00:00.000Z'));
    bundleDateien.set(BW_RESSOURCE_PFAD, bundleXml('2026-01-01T00:00:00.000Z', 'de-bw'));
    await synchronisiereStartupImportindizes();
    expect(appDatenSpeicher.has(BUND_APPDATA_PFAD)).toBe(true);
    expect(appDatenSpeicher.has(BW_APPDATA_PFAD)).toBe(true);
  });

  it('MUTATIONSTEST: ein Fehler bei EINER Datei (z.B. Ressource fehlt) verhindert nicht den Abgleich der ANDEREN', async () => {
    // BUND_RESSOURCE_PFAD wird absichtlich NICHT gesetzt -> readTextFile wirft.
    bundleDateien.set(BW_RESSOURCE_PFAD, bundleXml('2026-01-01T00:00:00.000Z', 'de-bw'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(synchronisiereStartupImportindizes()).resolves.toBeUndefined();
    expect(appDatenSpeicher.has(BUND_APPDATA_PFAD)).toBe(false);
    expect(appDatenSpeicher.has(BW_APPDATA_PFAD)).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// stelleStandardWieder
// ---------------------------------------------------------------------------

describe('stelleStandardWieder', () => {
  it('ersetzt eine bestehende AppData-Version bedingungslos durch die Bundle-Version, auch wenn diese ÄLTER ist', async () => {
    appDatenSpeicher.set(BUND_APPDATA_PFAD, bundleXml('2030-01-01T00:00:00.000Z'));
    bundleDateien.set(BUND_RESSOURCE_PFAD, bundleXml('2020-01-01T00:00:00.000Z'));
    await stelleStandardWieder('de-bund');
    expect(
      liesVerarbeitungszeit(appDatenSpeicher.get(BUND_APPDATA_PFAD) ?? '')?.toISOString(),
    ).toBe('2020-01-01T00:00:00.000Z');
  });

  it('markiert das Ergebnis mit herkunft="standard"', async () => {
    bundleDateien.set(BUND_RESSOURCE_PFAD, bundleXml('2026-01-01T00:00:00.000Z'));
    await stelleStandardWieder('de-bund');
    expect(leseHerkunft(appDatenSpeicher.get(BUND_APPDATA_PFAD) ?? '')).toBe('standard');
  });
});

describe('tatsächlich gebündelte Indizes', () => {
  it.each([
    ['de-bund', BUND_ZIEL, BUND_APPDATA_PFAD, BUND_RESSOURCE_PFAD],
    ['de-bw', BW_ZIEL, BW_APPDATA_PFAD, BW_RESSOURCE_PFAD],
  ] as const)(
    '%s: Erstinstallation, Datumsabgleich und Standard wiederherstellen',
    async (kategorie, dateiname, ziel, ressource) => {
      const xml = readFileSync(ressource.replace(/^resources/, 'src-tauri/resources'), 'utf8');
      pruefeXmlWohlgeformtheit(xml);
      const dokument = new DOMParser().parseFromString(xml, 'text/xml');
      expect(dokument.documentElement.localName).toBe('importindex');
      const verarbeitungszeit = dokument.querySelector('verarbeitungszeit')?.textContent?.trim();
      expect(verarbeitungszeit).toBeTruthy();
      const bundleZeitpunkt = new Date(verarbeitungszeit!);
      expect(Number.isFinite(bundleZeitpunkt.getTime())).toBe(true);
      bundleDateien.set(ressource, xml);
      await synchronisiereEineDatei(dateiname);
      const standard = appDatenSpeicher.get(ziel)!;
      pruefeXmlWohlgeformtheit(standard);
      expect(liesVerarbeitungszeit(standard)?.toISOString()).toBe(bundleZeitpunkt.toISOString());
      expect(leseHerkunft(standard)).toBe('standard');
      expect(standard).toBe(xml.replace('herkunft="nutzer"', 'herkunft="standard"'));
      const einTag = 24 * 60 * 60 * 1000;
      const aelter = new Date(bundleZeitpunkt.getTime() - einTag).toISOString();
      const alterBestand = xml.replace(/(<verarbeitungszeit[^>]*>)[^<]+/, `$1${aelter}`);
      appDatenSpeicher.set(ziel, alterBestand);
      await synchronisiereEineDatei(dateiname);
      expect(appDatenSpeicher.get(ziel)).toBe(standard);
      const neuer = new Date(bundleZeitpunkt.getTime() + einTag).toISOString();
      const neuerBestand = xml.replace(/(<verarbeitungszeit[^>]*>)[^<]+/, `$1${neuer}`);
      appDatenSpeicher.set(ziel, neuerBestand);
      await synchronisiereEineDatei(dateiname);
      expect(appDatenSpeicher.get(ziel)).toBe(neuerBestand);
      await stelleStandardWieder(kategorie);
      expect(appDatenSpeicher.get(ziel)).toBe(standard);
    },
  );
});

it('lässt ausschließlich alte AppData-Dateien unverändert und installiert beide neuen Standards', async () => {
  const alteDateien = new Map([
    ['indizes/Index Bundesrecht.xml', bundleXml('2030-01-01T00:00:00.000Z')],
    ['indizes/Index Landesrecht BW.xml', 'defekter alter Bestand'],
    ['indizes/Index Landesrecht BW.xml.vorherige-version', 'alte Sicherung'],
  ]);
  for (const [pfad, inhalt] of alteDateien) appDatenSpeicher.set(pfad, inhalt);
  bundleDateien.set(BUND_RESSOURCE_PFAD, bundleXml('2026-01-01T00:00:00.000Z'));
  bundleDateien.set(BW_RESSOURCE_PFAD, bundleXml('2026-01-01T00:00:00.000Z', 'de-bw'));
  await synchronisiereStartupImportindizes();
  expect(appDatenSpeicher.size).toBe(alteDateien.size + 2);
  expect(vi.mocked(appDatenLesen).mock.calls.map(([pfad]) => pfad)).toEqual([
    BUND_APPDATA_PFAD,
    BW_APPDATA_PFAD,
  ]);
  expect(vi.mocked(sicherstelleOrdner).mock.calls).toEqual([['importindizes'], ['importindizes']]);
  for (const [pfad, inhalt] of alteDateien) expect(appDatenSpeicher.get(pfad)).toBe(inhalt);
  expect(appDatenSpeicher.has(BUND_APPDATA_PFAD)).toBe(true);
  expect(appDatenSpeicher.has(BW_APPDATA_PFAD)).toBe(true);
});

it('installiert beim Start auch den EU-Standard aus eu.xml', async () => {
  const inhalt = importindexFixture();
  bundleDateien.set('resources/importindizes/eu.xml', inhalt);
  bundleDateien.set(BUND_RESSOURCE_PFAD, bundleXml('2026-01-01T00:00:00Z'));
  bundleDateien.set(BW_RESSOURCE_PFAD, bundleXml('2026-01-01T00:00:00Z', 'de-bw'));
  await synchronisiereStartupImportindizes();
  expect(resolveResourceAufrufe).toContain('resources/importindizes/eu.xml');
  expect(appDatenSpeicher.get('importindizes/eu.xml')).toContain('<normgeber>eu</normgeber>');
});

it('ersetzt einen installierten Importindex im alten Quellenformat durch den mitgelieferten Stand', async () => {
  const standard = bundleXml('2026-01-01T00:00:00Z');
  bundleDateien.set(BUND_RESSOURCE_PFAD, standard);
  const alt = bundleXml('2030-01-01T00:00:00Z').replace(
    '<normgeber>de-bund</normgeber><datenquelle/>',
    '<' + 'quelle>gesetze-im-internet.de</' + 'quelle>',
  );
  appDatenSpeicher.set(BUND_APPDATA_PFAD, alt);
  await synchronisiereEineDatei(BUND_ZIEL);
  expect(appDatenSpeicher.get(BUND_APPDATA_PFAD)).toContain('<normgeber>de-bund</normgeber>');
  expect(liesVerarbeitungszeit(appDatenSpeicher.get(BUND_APPDATA_PFAD) ?? '')).toEqual(
    liesVerarbeitungszeit(standard),
  );
});
