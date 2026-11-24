// nichtamtlicheTitelSpeicher.test.ts
//
// Erste Testrunde für diesen Speicher. Gemockt: appDatenZugriff (In-Memory-Map,
// analog zu gesetzSpeicher.test.ts), '@tauri-apps/plugin-fs'/'@tauri-apps/api/path'
// (Resource-Bundle-Zugriff, analog zu importindexVorinstallation.test.ts) sowie
// markierungskonflikteSpeicher (über gesetzSpeicherEreignisse.ts; nur der
// Aufruf/das Argument von meldeNichtamtlicheTitelGeschrieben interessiert
// hier, nicht die Logik dahinter – die ist bereits in
// markierungskonflikteSpeicher.test.ts abgedeckt).
// Real bleibt: normAufloesung.vollstaendigeBezeichnung (reine, bereits
// andernorts getestete Domänenlogik) – für alle hier gebauten Test-Gesetze
// ohne Gliederungsartikel liefert sie exakt die übergebene `bezeichnung`
// zurück, das vereinfacht die Fixtures.

import { normaleNorm, gesetzesreferenz, gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fc from 'fast-check';
import type { GesetzDarstellung, Gesetzesreferenz } from '@/lib/domain/gesetzTypes';

// Die Quellintegration prüft native Sperren separat; diese Fachtests behalten
// ihre gezielten Archivierungsantworten und ersetzen ausschließlich die Sperre.
vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  mitDateiSperre: async (_pfad: string, aktion: (token: string) => Promise<unknown>) =>
    aktion('titel-token'),
  sicherstelleOrdner: (ordner: string) => sicherstelleOrdnerMock(ordner),
  appDatenLesen: vi.fn((pfad: string) => {
    leseFehlerMock(pfad);
    const inhalt = appDatenSpeicher.get(pfad);
    if (inhalt === undefined) return Promise.reject(new Error('Datei nicht gefunden'));
    return Promise.resolve(inhalt);
  }),
  appDatenLesenOderNull: vi.fn((pfad: string) => {
    try {
      leseFehlerMock(pfad);
      return Promise.resolve(appDatenSpeicher.get(pfad) ?? null);
    } catch {
      return Promise.resolve(null);
    }
  }),
  appDatenSchreiben: vi.fn((pfad: string, inhalt: string) => {
    appDatenSpeicher.set(pfad, inhalt);
    return Promise.resolve();
  }),
  appDatenExistiert: vi.fn((pfad: string) => {
    existenzFehlerMock(pfad);
    return Promise.resolve(appDatenSpeicher.has(pfad));
  }),
  appDatenOrdnerLesen: (ordner: string) => ordnerLesenMock(ordner),
}));
import { registrierePruefpflichtigeAenderung } from '@/lib/persistenz/kern/kern.index';
registrierePruefpflichtigeAenderung({
  vormerken: async () => 'titel-vorgang',
  abschliessen: async () => {},
});

const invokeMock = vi.fn();
const zeigeBannerMock = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: (...args: unknown[]) => zeigeBannerMock(...args),
  meldeDateibefund: (...args: unknown[]) => zeigeBannerMock(...args),
}));

const appDatenSpeicher = new Map<string, string>();
const resourcenDateien = new Map<string, string>();
const resolveResourceAufrufe: string[] = [];

vi.mock('@tauri-apps/plugin-fs', () => ({
  readDir: vi.fn(async (ordner: string) =>
    [...resourcenDateien.keys()]
      .filter((pfad) => pfad.startsWith(`${ordner}/`))
      .map((pfad) => ({ name: pfad.slice(ordner.length + 1), isDirectory: false })),
  ),
  readTextFile: vi.fn((pfad: string) => {
    const inhalt = resourcenDateien.get(pfad);
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

const sicherstelleOrdnerMock = vi.fn((_ordner: string) => Promise.resolve());
const leseFehlerMock = vi.fn();
const existenzFehlerMock = vi.fn();
const ordnerLesenMock = vi.fn<(ordner: string) => Promise<Array<{ name?: string }>>>();

const meldeNichtamtlicheTitelGeschriebenMock = vi.fn((_gesetz: Gesetzesreferenz) => {});
vi.mock('@/lib/persistenz/gesetz/gesetzspeicher/gesetzSpeicherEreignisse', () => ({
  meldeNichtamtlicheTitelGeschrieben: (kurztitel: Gesetzesreferenz) =>
    meldeNichtamtlicheTitelGeschriebenMock(kurztitel),
}));

import { pruefeNichtamtlicheTitelXML } from './nichtamtlicheTitelSpeicher.pruefen';
import {
  ladeNichtamtlicheTitel,
  wendeNichtamtlicheTitelAn,
  hatNormenOhneTitel,
} from './nichtamtlicheTitelSpeicher.laden';
import {
  leseNichtamtlicheTitelRohtext,
  ersetzeNichtamtlicheTitelDatei,
  synchronisiereEinNichtamtlicheTitel,
  synchronisiereNichtamtlicheTitelFuerGesetze,
} from './nichtamtlicheTitelSpeicher.synchronisieren';
import { leseNichtamtlicheTitelFuerExport } from './nichtamtlicheTitelSpeicher';

beforeEach(() => {
  leseFehlerMock.mockReset();
  existenzFehlerMock.mockReset();
  invokeMock
    .mockReset()
    .mockImplementation(
      async (_befehl: string, args: { relativerPfad: string; erwarteterInhalt: string }) => {
        const sicherungspfad = `${args.relativerPfad}.sicherung`;
        appDatenSpeicher.set(sicherungspfad, args.erwarteterInhalt);
        appDatenSpeicher.delete(args.relativerPfad);
        return { status: 'archiviert', sicherungspfad };
      },
    );
  zeigeBannerMock.mockClear();
  appDatenSpeicher.clear();
  resourcenDateien.clear();
  resolveResourceAufrufe.length = 0;
  sicherstelleOrdnerMock.mockClear();
  ordnerLesenMock
    .mockReset()
    .mockImplementation(async (ordner) =>
      [...appDatenSpeicher.keys()]
        .filter((pfad) => pfad.startsWith(`${ordner}/`))
        .map((pfad) => ({ name: pfad.slice(ordner.length + 1) })),
    );
  meldeNichtamtlicheTitelGeschriebenMock.mockClear();
});

afterEach(() => vi.restoreAllMocks());

describe('leseNichtamtlicheTitelFuerExport', () => {
  it('liest nur XML-Dateien mit unverändertem Namen und Rohtext', async () => {
    ordnerLesenMock.mockResolvedValue([
      { name: 'GG_de-bund-nichtamtliche-titel.xml' },
      { name: 'notiz.txt' },
      {},
    ]);
    appDatenSpeicher.set(APPDATA_DATEINAME('GG'), '<nichtamtlicheTitel/>');

    await expect(leseNichtamtlicheTitelFuerExport()).resolves.toEqual([
      { name: 'GG_de-bund-nichtamtliche-titel.xml', inhalt: '<nichtamtlicheTitel/>' },
    ]);
    expect(ordnerLesenMock).toHaveBeenCalledWith('nichtamtliche-titel');
  });

  it('liefert bei nicht lesbarem Ordner eine leere Liste und überspringt einzelne Lesefehler', async () => {
    ordnerLesenMock.mockRejectedValueOnce(new Error('Ordner fehlt'));
    await expect(leseNichtamtlicheTitelFuerExport()).resolves.toEqual([]);

    ordnerLesenMock.mockResolvedValueOnce([
      { name: 'fehlend.xml' },
      { name: 'GG_de-bund-nichtamtliche-titel.xml' },
    ]);
    appDatenSpeicher.set(APPDATA_DATEINAME('GG'), '<nichtamtlicheTitel/>');
    await expect(leseNichtamtlicheTitelFuerExport()).resolves.toEqual([
      { name: 'GG_de-bund-nichtamtliche-titel.xml', inhalt: '<nichtamtlicheTitel/>' },
    ]);
  });
});

const APPDATA_DATEINAME = (kurztitel: string) =>
  `nichtamtliche-titel/${kurztitel}_de-bund-nichtamtliche-titel.xml`;
const RESOURCE_DATEINAME = (kurztitel: string) =>
  `resources/nichtamtliche-titel/de-bund/${kurztitel}.xml`;

function xml(kurztitel: string, normen: Array<{ bezeichnung: string; titel: string }>): string {
  const inhalt = normen
    .map((n) => `<norm><bezeichnung>${n.bezeichnung}</bezeichnung><titel>${n.titel}</titel></norm>`)
    .join('');
  return `<nichtamtlicheTitel><infos><gesetz normgeber="de-bund">${kurztitel}</gesetz></infos><inhalt>${inhalt}</inhalt></nichtamtlicheTitel>`;
}

/** Baut ein minimales Gesetz OHNE Gliederungsartikel: vollstaendigeBezeichnung()
 *  liefert dafür je Norm exakt die übergebene `bezeichnung` unverändert zurück
 *  (kein Artikel-Präfix zu ermitteln, siehe Datei-Kopf). */
function baueGesetz(
  normen: Array<{ xmlId: string; bezeichnung: string; titel?: string }>,
): GesetzDarstellung {
  return gesetzDarstellung({
    kurztitel: 'GG',
    langtitel: 'Testgesetz',
    hatGliederungsartikel: false,
    elemente: normen.map((n) => ({
      typ: 'norm' as const,
      data: normaleNorm({
        id: n.xmlId,
        xmlId: n.xmlId,
        bezeichnung: n.bezeichnung,
        titel: n.titel,
        absaetze: [],
      }),
    })),
  });
}

// ---------------------------------------------------------------------------
// ladeNichtamtlicheTitel
// ---------------------------------------------------------------------------

describe('ladeNichtamtlicheTitel', () => {
  it('liefert null, wenn keine Datei für die kurztitel existiert', async () => {
    expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toBeNull();
  });

  it('parst eine gültige Datei zu einer Bezeichnung -> Titel Map', async () => {
    appDatenSpeicher.set(
      APPDATA_DATEINAME('GG'),
      xml('GG', [
        { bezeichnung: 'Art. 1', titel: 'Menschenwürde' },
        { bezeichnung: 'Art. 2', titel: 'Freie Entfaltung' },
      ]),
    );

    const map = await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' });

    expect(map).toEqual(
      new Map([
        ['Art. 1', 'Menschenwürde'],
        ['Art. 2', 'Freie Entfaltung'],
      ]),
    );
  });

  it('liefert null, wenn der <gesetz> im XML nicht zur erwarteten kurztitel passt', async () => {
    appDatenSpeicher.set(
      APPDATA_DATEINAME('GG'),
      xml('EGBGB', [{ bezeichnung: 'Art. 1', titel: 'x' }]),
    );
    expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toBeNull();
  });

  it('vergleicht den Kurztitel case-insensitive', async () => {
    appDatenSpeicher.set(
      APPDATA_DATEINAME('GG'),
      xml('gg', [{ bezeichnung: 'Art. 1', titel: 'x' }]),
    );
    expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).not.toBeNull();
  });

  it('liefert null bei fehlerhaftem XML (Parserfehler)', async () => {
    appDatenSpeicher.set(APPDATA_DATEINAME('GG'), '<nichtamtlicheTitel><infos>');
    expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toBeNull();
  });

  it('überspringt normen ohne bezeichnung oder ohne titel', async () => {
    appDatenSpeicher.set(
      APPDATA_DATEINAME('GG'),
      '<nichtamtlicheTitel><infos><gesetz normgeber="de-bund">GG</gesetz></infos><inhalt>' +
        '<norm><bezeichnung>Art. 1</bezeichnung></norm>' + // kein titel
        '<norm><titel>ohne Bezeichnung</titel></norm>' + // keine bezeichnung
        '<norm><bezeichnung>Art. 2</bezeichnung><titel>gültig</titel></norm>' +
        '</inhalt></nichtamtlicheTitel>',
    );

    const map = await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' });
    expect(map).toEqual(new Map([['Art. 2', 'gültig']]));
  });

  it('normalisiert überflüssigen Whitespace in der Bezeichnung beim Aufbau der Map', async () => {
    appDatenSpeicher.set(
      APPDATA_DATEINAME('GG'),
      '<nichtamtlicheTitel><infos><gesetz normgeber="de-bund">GG</gesetz></infos><inhalt>' +
        '<norm><bezeichnung>  Art.   1  </bezeichnung><titel>Menschenwürde</titel></norm>' +
        '</inhalt></nichtamtlicheTitel>',
    );

    const map = await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' });
    expect(map?.get('Art. 1')).toBe('Menschenwürde');
  });
});

describe('Titeldateien sichern und melden', () => {
  it.each([
    ['falsche Wurzel', '<falsch/>', 'war beschädigt'],
    [
      'fehlende Gesetzeszuordnung',
      '<nichtamtlicheTitel><infos/><inhalt/></nichtamtlicheTitel>',
      'war beschädigt',
    ],
    ['falsche Zuordnung', xml('BGB', []), 'passte nicht zum Gesetz'],
  ])('archiviert %s und nennt den tatsächlichen Grund', async (_fall, inhalt, grund) => {
    appDatenSpeicher.set(APPDATA_DATEINAME('GG'), inhalt);
    expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toBeNull();
    expect(invokeMock).toHaveBeenCalledExactlyOnceWith('archiviere_beschaedigte_datei', {
      relativerPfad: APPDATA_DATEINAME('GG'),
      erwarteterInhalt: inhalt,
      token: 'titel-token',
      vorgang: 'titel-vorgang',
    });
    expect(appDatenSpeicher.get(`${APPDATA_DATEINAME('GG')}.sicherung`)).toBe(inhalt);
    expect(appDatenSpeicher.has(APPDATA_DATEINAME('GG'))).toBe(false);
    expect(meldeNichtamtlicheTitelGeschriebenMock).toHaveBeenCalledExactlyOnceWith({
      kurztitel: 'GG',
      normgeber: 'de-bund',
    });
    const meldung = zeigeBannerMock.mock.calls[0]?.[0];
    const text = meldung.text;
    expect(meldung).toMatchObject({
      grund: 'imDatenordnerGesichert',
      betroffen: APPDATA_DATEINAME('GG').split('/').at(-1),
    });
    expect(text).toContain(grund);
    expect(meldung.sicherung).toEqual(expect.any(String));
    expect(JSON.stringify(meldung, (k, v) => (k === 'sicherung' ? undefined : v))).not.toContain(
      '.sicherung',
    );
    if (grund === 'passte nicht zum Gesetz') expect(text).not.toContain('beschädigt');
  });

  it('behandelt Browser-parsererror als Beschädigung', async () => {
    appDatenSpeicher.set(APPDATA_DATEINAME('GG'), 'defektes XML');
    const doc = new DOMParser().parseFromString('<parsererror/>', 'application/xml');
    vi.spyOn(DOMParser.prototype, 'parseFromString').mockReturnValue(doc);
    expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toBeNull();
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(zeigeBannerMock.mock.calls[0]?.[0].text).toContain('war beschädigt');
  });

  it('lädt zwischenzeitlich reparierte Titel ohne Sicherung oder Ereignis', async () => {
    appDatenSpeicher.set(APPDATA_DATEINAME('GG'), '<falsch/>');
    invokeMock.mockImplementationOnce(async () => {
      appDatenSpeicher.set(
        APPDATA_DATEINAME('GG'),
        xml('GG', [{ bezeichnung: 'Art. 1', titel: 'Repariert' }]),
      );
      return { status: 'veraendert', sicherungspfad: null };
    });
    expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toEqual(
      new Map([['Art. 1', 'Repariert']]),
    );
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(zeigeBannerMock).not.toHaveBeenCalled();
    expect(meldeNichtamtlicheTitelGeschriebenMock).not.toHaveBeenCalled();
  });

  it.each(['<falsch/>', xml('BGB', [])])(
    'meldet Sicherungsfehler mit Grund und erhält Original %s',
    async (inhalt) => {
      appDatenSpeicher.set(APPDATA_DATEINAME('GG'), inhalt);
      invokeMock.mockRejectedValueOnce(new Error('Sicherung gescheitert'));
      expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toBeNull();
      const text = zeigeBannerMock.mock.calls[0]?.[0].text;
      expect(text).toContain(inhalt === '<falsch/>' ? 'war beschädigt' : 'passte nicht zum Gesetz');
      expect(text).toContain('nicht gesichert');
      expect(appDatenSpeicher.get(APPDATA_DATEINAME('GG'))).toBe(inhalt);
      expect(meldeNichtamtlicheTitelGeschriebenMock).not.toHaveBeenCalled();
    },
  );

  it.each(['<falsch/>', xml('BGB', [])])(
    'meldet nicht entferntes Original mit Grund %s',
    async (inhalt) => {
      appDatenSpeicher.set(APPDATA_DATEINAME('GG'), inhalt);
      invokeMock.mockResolvedValueOnce({
        status: 'gesichert_aber_nicht_entfernt',
        sicherungspfad: 'sicherung.xml',
      });
      expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toBeNull();
      const meldung = zeigeBannerMock.mock.calls[0]?.[0];
      expect(meldung.text).toContain(
        inhalt === '<falsch/>' ? 'war beschädigt' : 'passte nicht zum Gesetz',
      );
      expect(meldung).toMatchObject({
        grund: 'gesichertNichtEntfernt',
        sicherung: 'sicherung.xml',
      });
      expect(meldeNichtamtlicheTitelGeschriebenMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    [xml('BGB', []), '<falsch/>', 'war beschädigt', 'passte nicht'],
    ['<falsch/>', xml('BGB', []), 'passte nicht zum Gesetz', 'beschädigt'],
  ])(
    'meldet nach Inhaltsänderung nur den Grund des archivierten Inhalts',
    async (vorher, nachher, grund, falscherGrund) => {
      appDatenSpeicher.set(APPDATA_DATEINAME('GG'), vorher);
      invokeMock.mockImplementationOnce(async () => {
        appDatenSpeicher.set(APPDATA_DATEINAME('GG'), nachher);
        return { status: 'veraendert', sicherungspfad: null };
      });
      await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' });
      expect(appDatenSpeicher.get(`${APPDATA_DATEINAME('GG')}.sicherung`)).toBe(nachher);
      expect(zeigeBannerMock.mock.calls[0]?.[0].text).toContain(grund);
      expect(zeigeBannerMock.mock.calls[0]?.[0].text).not.toContain(falscherGrund);
    },
  );

  it('meldet unlesbare Datei ohne Sicherung und ohne Beschädigungsbehauptung', async () => {
    appDatenSpeicher.set(APPDATA_DATEINAME('GG'), xml('GG', []));
    leseFehlerMock.mockImplementationOnce(() => {
      throw new Error('nicht lesbar');
    });
    expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toBeNull();
    expect(zeigeBannerMock.mock.calls[0]?.[0].text).toContain('nicht gelesen');
    expect(zeigeBannerMock.mock.calls[0]?.[0].text).not.toContain('beschädigt');
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('meldet Fehler der Existenzprüfung ebenfalls als unlesbar', async () => {
    leseFehlerMock.mockImplementationOnce(() => {
      throw new Error('Lesefehler');
    });
    existenzFehlerMock.mockImplementationOnce(() => {
      throw new Error('Existenz nicht prüfbar');
    });
    expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toBeNull();
    expect(zeigeBannerMock.mock.calls[0]?.[0].text).toContain('nicht gelesen');
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('meldet Lesefehler während Vergleichssicherung ohne Archivierungsbehauptung', async () => {
    appDatenSpeicher.set(APPDATA_DATEINAME('GG'), xml('BGB', []));
    invokeMock.mockImplementationOnce(async () => {
      leseFehlerMock.mockImplementationOnce(() => {
        throw new Error('nicht lesbar');
      });
      return { status: 'veraendert', sicherungspfad: null };
    });
    expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toBeNull();
    expect(zeigeBannerMock.mock.calls[0]?.[0].grund).not.toMatch(/Gesichert|NichtEntfernt/);
    expect(meldeNichtamtlicheTitelGeschriebenMock).not.toHaveBeenCalled();
    expect(appDatenSpeicher.has(APPDATA_DATEINAME('GG'))).toBe(true);
  });

  it('behauptet nach drei Inhaltsänderungen weder unverändertes Original noch Archivierung', async () => {
    appDatenSpeicher.set(APPDATA_DATEINAME('GG'), xml('BGB', []));
    let aenderung = 0;
    invokeMock.mockImplementation(async () => {
      aenderung += 1;
      appDatenSpeicher.set(APPDATA_DATEINAME('GG'), `<falsch version="${aenderung}"/>`);
      return { status: 'veraendert', sicherungspfad: null };
    });
    expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toBeNull();
    expect(invokeMock).toHaveBeenCalledTimes(3);
    expect(appDatenSpeicher.get(APPDATA_DATEINAME('GG'))).toBe('<falsch version="3"/>');
    const text = zeigeBannerMock.mock.calls[0]?.[0].text;
    expect(text).toContain('war beschädigt');
    expect(text).toContain('nicht gesichert');
    expect(text).not.toMatch(/unverändert|liegen|Sicherung liegt/);
    expect(meldeNichtamtlicheTitelGeschriebenMock).not.toHaveBeenCalled();
  });

  it('archiviert leere Dateien und akzeptiert gültige leere Titel-Maps', async () => {
    appDatenSpeicher.set(APPDATA_DATEINAME('GG'), '  ');
    expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toBeNull();
    expect(appDatenSpeicher.get(`${APPDATA_DATEINAME('GG')}.sicherung`)).toBe('  ');
    expect(appDatenSpeicher.has(APPDATA_DATEINAME('GG'))).toBe(false);
    expect(meldeNichtamtlicheTitelGeschriebenMock).toHaveBeenCalled();
    invokeMock.mockClear();
    appDatenSpeicher.set(APPDATA_DATEINAME('GG'), xml('GG', []));
    expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toEqual(
      new Map(),
    );
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it.each(['', '  \n'])(
    'meldet eine leere Titeldatei als leer, nicht als beschädigt',
    async (leer) => {
      appDatenSpeicher.set(APPDATA_DATEINAME('GG'), leer);
      expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toBeNull();
      expect(zeigeBannerMock).toHaveBeenCalledTimes(1);
      expect(zeigeBannerMock.mock.calls[0]?.[0]).toMatchObject({
        grund: 'dateiLeer',
        betroffen: APPDATA_DATEINAME('GG').split('/').at(-1),
      });
    },
  );

  it('eine fehlende Datei bleibt meldungsfrei', async () => {
    expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toBeNull();
    expect(zeigeBannerMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('entfernt keine inzwischen verschwundene Datei und meldet keine Archivierung', async () => {
    appDatenSpeicher.set(APPDATA_DATEINAME('GG'), '<falsch/>');
    invokeMock.mockResolvedValueOnce({ status: 'fehlt', sicherungspfad: null });
    expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toBeNull();
    expect(zeigeBannerMock).not.toHaveBeenCalled();
    expect(meldeNichtamtlicheTitelGeschriebenMock).not.toHaveBeenCalled();
  });

  it('stellt mitgelieferte Titel nach Archivierung erst durch Resource-Sync und Reload wieder her', async () => {
    appDatenSpeicher.set(APPDATA_DATEINAME('GG'), '<falsch/>');
    resourcenDateien.set(
      RESOURCE_DATEINAME('GG'),
      xml('GG', [{ bezeichnung: 'Art. 1', titel: 'Mitgeliefert' }]),
    );
    expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toBeNull();
    expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toBeNull();
    expect(resolveResourceAufrufe).toEqual([]);
    expect(
      await synchronisiereNichtamtlicheTitelFuerGesetze([
        { kurztitel: 'GG', normgeber: 'de-bund' },
      ]),
    ).toBe(true);
    const titel = await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' });
    expect(titel).toEqual(new Map([['Art. 1', 'Mitgeliefert']]));
    const gesetz = baueGesetz([{ xmlId: 'a1', bezeichnung: 'Art. 1' }]);
    wendeNichtamtlicheTitelAn(gesetz, titel!);
    expect(gesetz.elemente[0]?.typ === 'norm' && gesetz.elemente[0].data.titel).toBe(
      'Mitgeliefert',
    );
  });

  it('bewahrt eigene Titel ausschließlich in der Sicherung ohne Rekonstruktion', async () => {
    const inhalt = xml('BGB', [{ bezeichnung: 'Art. 1', titel: 'Eigener Titel' }]);
    appDatenSpeicher.set(APPDATA_DATEINAME('GG'), inhalt);
    await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' });
    expect(
      await synchronisiereNichtamtlicheTitelFuerGesetze([
        { kurztitel: 'GG', normgeber: 'de-bund' },
      ]),
    ).toBe(false);
    expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toBeNull();
    expect(appDatenSpeicher.get(`${APPDATA_DATEINAME('GG')}.sicherung`)).toBe(inhalt);
    expect(zeigeBannerMock.mock.calls[0]?.[0].text).not.toMatch(/wiederhergestellt|rekonstruiert/);
  });
});

// ---------------------------------------------------------------------------
// wendeNichtamtlicheTitelAn
// ---------------------------------------------------------------------------

describe('wendeNichtamtlicheTitelAn', () => {
  it('ergänzt den Titel bei einer Norm ohne amtlichen Titel, deren Bezeichnung in der Map ist', () => {
    const gesetz = baueGesetz([{ xmlId: 'a1', bezeichnung: 'Art. 1' }]);
    wendeNichtamtlicheTitelAn(gesetz, new Map([['Art. 1', 'Menschenwürde']]));

    const [norm] = gesetz.elemente;
    if (norm?.typ !== 'norm') throw new Error('Fixture-Fehler: erwartete Norm');
    expect(norm.data.titel).toBe('Menschenwürde');
    expect(norm.data.titelIstNichtamtlich).toBe(true);
  });

  it('lässt Normen mit bereits vorhandenem amtlichem Titel unangetastet', () => {
    const gesetz = baueGesetz([{ xmlId: 'a1', bezeichnung: 'Art. 1', titel: 'Amtlicher Titel' }]);
    wendeNichtamtlicheTitelAn(gesetz, new Map([['Art. 1', 'Anderer Titel']]));

    const [norm] = gesetz.elemente;
    if (norm?.typ !== 'norm') throw new Error('Fixture-Fehler: erwartete Norm');
    expect(norm.data.titel).toBe('Amtlicher Titel');
    expect(norm.data.titelIstNichtamtlich).toBeUndefined();
  });

  it('lässt Normen ohne Titel unverändert, wenn ihre Bezeichnung nicht in der Map vorkommt', () => {
    const gesetz = baueGesetz([{ xmlId: 'a1', bezeichnung: 'Art. 99' }]);
    wendeNichtamtlicheTitelAn(gesetz, new Map([['Art. 1', 'Menschenwürde']]));

    const [norm] = gesetz.elemente;
    if (norm?.typ !== 'norm') throw new Error('Fixture-Fehler: erwartete Norm');
    expect(norm.data.titel).toBeUndefined();
  });

  it('Property: nach Anwendung hat jede Norm entweder ihren ursprünglichen Titel, oder (nur falls zuvor titellos UND in der Map) den Map-Titel mit titelIstNichtamtlich=true', () => {
    const normArb = fc.record({
      xmlId: fc.string({ minLength: 1 }),
      bezeichnung: fc.constantFrom('Art. 1', 'Art. 2', 'Art. 3', 'Art. 4'),
      titel: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
    });

    fc.assert(
      fc.property(
        fc.uniqueArray(normArb, { minLength: 1, maxLength: 6, selector: (n) => n.xmlId }),
        fc.dictionary(
          fc.constantFrom('Art. 1', 'Art. 2', 'Art. 3', 'Art. 4'),
          fc.string({ minLength: 1 }),
        ),
        (normen, mapEintraege) => {
          const gesetz = baueGesetz(normen);
          const titelMap = new Map(Object.entries(mapEintraege));
          const vorherTitel = normen.map((n) => n.titel);

          wendeNichtamtlicheTitelAn(gesetz, titelMap);

          gesetz.elemente.forEach((el, i) => {
            if (el.typ !== 'norm') return;
            const hatteVorherTitel = vorherTitel[i] !== undefined;
            if (hatteVorherTitel) {
              expect(el.data.titel).toBe(vorherTitel[i]);
              expect(el.data.titelIstNichtamtlich).toBeUndefined();
              return;
            }
            const erwarteterMapTitel = titelMap.get(normen[i]!.bezeichnung);
            if (erwarteterMapTitel === undefined) {
              expect(el.data.titel).toBeUndefined();
            } else {
              expect(el.data.titel).toBe(erwarteterMapTitel);
              expect(el.data.titelIstNichtamtlich).toBe(true);
            }
          });
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// hatNormenOhneTitel
// ---------------------------------------------------------------------------

describe('hatNormenOhneTitel', () => {
  it('liefert true, wenn mindestens eine Norm ohne Titel vorhanden ist', () => {
    const gesetz = baueGesetz([
      { xmlId: 'a1', bezeichnung: 'Art. 1', titel: 'x' },
      { xmlId: 'a2', bezeichnung: 'Art. 2' },
    ]);
    expect(hatNormenOhneTitel(gesetz)).toBe(true);
  });

  it('liefert false, wenn alle Normen bereits einen Titel haben', () => {
    const gesetz = baueGesetz([{ xmlId: 'a1', bezeichnung: 'Art. 1', titel: 'x' }]);
    expect(hatNormenOhneTitel(gesetz)).toBe(false);
  });

  it('liefert false für ein Gesetz ohne Normen', () => {
    expect(hatNormenOhneTitel(baueGesetz([]))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// leseNichtamtlicheTitelRohtext
// ---------------------------------------------------------------------------

describe('leseNichtamtlicheTitelRohtext', () => {
  it('liefert null, wenn keine Datei existiert', async () => {
    expect(
      await leseNichtamtlicheTitelRohtext({ kurztitel: 'GG', normgeber: 'de-bund' }),
    ).toBeNull();
  });

  it('liefert den rohen Dateiinhalt unverändert (ohne Parsing/Kurztitel-Check)', async () => {
    appDatenSpeicher.set(
      APPDATA_DATEINAME('GG'),
      xml('FALSCH', [{ bezeichnung: 'Art. 1', titel: 'x' }]),
    );
    expect(
      await leseNichtamtlicheTitelRohtext({ kurztitel: 'GG', normgeber: 'de-bund' }),
    ).toContain('FALSCH');
  });
});

// ---------------------------------------------------------------------------
// ersetzeNichtamtlicheTitelDatei
// ---------------------------------------------------------------------------

describe('ersetzeNichtamtlicheTitelDatei', () => {
  it('schreibt den übergebenen Inhalt vollständig in AppData', async () => {
    await ersetzeNichtamtlicheTitelDatei(
      { kurztitel: 'GG', normgeber: 'de-bund' },
      xml('GG', [{ bezeichnung: 'Art. 1', titel: 'neu' }]),
    );
    expect(appDatenSpeicher.get(APPDATA_DATEINAME('GG'))).toContain('neu');
  });

  it('überschreibt einen vorhandenen Inhalt vollständig', async () => {
    // Marker bewusst nicht "alt"/"neu" - beides Substrings von XML-Boilerplate
    // ("inhalt", siehe xml()) und würde die Prüfung wertlos machen.
    appDatenSpeicher.set(
      APPDATA_DATEINAME('GG'),
      xml('GG', [{ bezeichnung: 'Art. 1', titel: 'VORHERIG' }]),
    );
    await ersetzeNichtamtlicheTitelDatei(
      { kurztitel: 'GG', normgeber: 'de-bund' },
      xml('GG', [{ bezeichnung: 'Art. 1', titel: 'ERSETZT' }]),
    );
    expect(appDatenSpeicher.get(APPDATA_DATEINAME('GG'))).toContain('ERSETZT');
    expect(appDatenSpeicher.get(APPDATA_DATEINAME('GG'))).not.toContain('VORHERIG');
  });

  it('meldet den Schreibvorgang über meldeNichtamtlicheTitelGeschrieben für genau dieses Gesetz', async () => {
    await ersetzeNichtamtlicheTitelDatei({ kurztitel: 'GG', normgeber: 'de-bund' }, xml('GG', []));
    expect(meldeNichtamtlicheTitelGeschriebenMock).toHaveBeenCalledWith({
      kurztitel: 'GG',
      normgeber: 'de-bund',
    });
  });

  it('stellt vorab den Zielordner sicher', async () => {
    await ersetzeNichtamtlicheTitelDatei({ kurztitel: 'GG', normgeber: 'de-bund' }, xml('GG', []));
    expect(sicherstelleOrdnerMock).toHaveBeenCalledWith('nichtamtliche-titel');
  });
});

// ---------------------------------------------------------------------------
// synchronisiereEinNichtamtlicheTitel
// ---------------------------------------------------------------------------

describe('synchronisiereEinNichtamtlicheTitel', () => {
  it('kopiert die mitgelieferte Resource-Datei nach AppData, wenn noch keine Datei existiert', async () => {
    resourcenDateien.set(
      RESOURCE_DATEINAME('GG'),
      xml('GG', [{ bezeichnung: 'Art. 1', titel: 'x' }]),
    );

    const ergebnis = await synchronisiereEinNichtamtlicheTitel({
      kurztitel: 'GG',
      normgeber: 'de-bund',
    });

    expect(ergebnis).toBe(true);
    expect(appDatenSpeicher.get(APPDATA_DATEINAME('GG'))).toContain('Art. 1');
    expect(meldeNichtamtlicheTitelGeschriebenMock).toHaveBeenCalledWith({
      kurztitel: 'GG',
      normgeber: 'de-bund',
    });
  });

  it.each(['', '  \n\t'])(
    'stellt mitgelieferte Titel nach Archivierung der leeren Datei beim selben Start wieder her: %s',
    async (leer) => {
      const gesetz = { kurztitel: 'GG', normgeber: 'de-bund' };
      appDatenSpeicher.set(APPDATA_DATEINAME('GG'), leer);
      resourcenDateien.set(
        RESOURCE_DATEINAME('GG'),
        xml('GG', [{ bezeichnung: 'Art. 1', titel: 'Würde' }]),
      );
      expect(await ladeNichtamtlicheTitel(gesetz)).toBeNull();
      expect(await synchronisiereNichtamtlicheTitelFuerGesetze([gesetz])).toBe(true);
      expect(await ladeNichtamtlicheTitel(gesetz)).toEqual(new Map([['Art. 1', 'Würde']]));
      expect(appDatenSpeicher.get(`${APPDATA_DATEINAME('GG')}.sicherung`)).toBe(leer);
    },
  );

  it('MUTATIONSTEST: schreibt NICHT erneut, wenn in AppData bereits eine Datei existiert (No-Op-Guard)', async () => {
    appDatenSpeicher.set(APPDATA_DATEINAME('GG'), 'vorhandener Inhalt');
    resourcenDateien.set(
      RESOURCE_DATEINAME('GG'),
      xml('GG', [{ bezeichnung: 'Art. 1', titel: 'neu' }]),
    );

    const ergebnis = await synchronisiereEinNichtamtlicheTitel({
      kurztitel: 'GG',
      normgeber: 'de-bund',
    });

    expect(ergebnis).toBe(false);
    expect(appDatenSpeicher.get(APPDATA_DATEINAME('GG'))).toBe('vorhandener Inhalt');
    expect(meldeNichtamtlicheTitelGeschriebenMock).not.toHaveBeenCalled();
  });

  it('liefert false, wenn keine mitgelieferte Resource-Datei für dieses Gesetz existiert', async () => {
    const ergebnis = await synchronisiereEinNichtamtlicheTitel({
      kurztitel: 'UNBEKANNT',
      normgeber: 'de-bund',
    });

    expect(ergebnis).toBe(false);
    expect(appDatenSpeicher.has(APPDATA_DATEINAME('UNBEKANNT'))).toBe(false);
    expect(meldeNichtamtlicheTitelGeschriebenMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// synchronisiereNichtamtlicheTitelFuerGesetze
// ---------------------------------------------------------------------------

describe('synchronisiereNichtamtlicheTitelFuerGesetze', () => {
  it('liefert false, wenn für keines der Gesetze eine Resource-Datei existiert', async () => {
    expect(
      await synchronisiereNichtamtlicheTitelFuerGesetze([
        { kurztitel: 'GG', normgeber: 'de-bund' },
        { kurztitel: 'BGB', normgeber: 'de-bund' },
      ]),
    ).toBe(false);
  });

  it('liefert true, sobald für mindestens ein Gesetz tatsächlich kopiert wurde', async () => {
    resourcenDateien.set(RESOURCE_DATEINAME('GG'), xml('GG', []));

    expect(
      await synchronisiereNichtamtlicheTitelFuerGesetze([
        { kurztitel: 'BGB', normgeber: 'de-bund' },
        { kurztitel: 'GG', normgeber: 'de-bund' },
      ]),
    ).toBe(true);
  });

  it('synchronisiert alle übergebenen Gesetze einzeln (Fehler-Isolation: eines ohne Resource-Datei blockiert die anderen nicht)', async () => {
    resourcenDateien.set(RESOURCE_DATEINAME('GG'), xml('GG', []));
    resourcenDateien.set(RESOURCE_DATEINAME('EGBGB'), xml('EGBGB', []));

    await synchronisiereNichtamtlicheTitelFuerGesetze([
      { kurztitel: 'GG', normgeber: 'de-bund' },
      { kurztitel: 'BGB', normgeber: 'de-bund' },
      { kurztitel: 'EGBGB', normgeber: 'de-bund' },
    ]);

    expect(appDatenSpeicher.has(APPDATA_DATEINAME('GG'))).toBe(true);
    expect(appDatenSpeicher.has(APPDATA_DATEINAME('BGB'))).toBe(false);
    expect(appDatenSpeicher.has(APPDATA_DATEINAME('EGBGB'))).toBe(true);
  });
});

describe('Fehlerisolation optionaler Titel', () => {
  it.each(['', '<kaputt/>', xml('Anderes', [])])(
    'liefert bei unbrauchbarem Inhalt %s keine Titel',
    async (inhalt) => {
      appDatenSpeicher.set(APPDATA_DATEINAME('GG'), inhalt);
      expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toBeNull();
      expect(zeigeBannerMock).toHaveBeenCalled();
    },
  );
  it('unterscheidet fehlende Datei und gültige leere Titelmap', async () => {
    expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toBeNull();
    appDatenSpeicher.set(APPDATA_DATEINAME('GG'), xml('GG', []));
    expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toEqual(
      new Map(),
    );
  });
  it('meldet Lesefehler bei existierender Datei als Banner', async () => {
    appDatenSpeicher.set(APPDATA_DATEINAME('GG'), xml('GG', []));
    leseFehlerMock.mockImplementation(() => {
      throw new Error('Zugriff');
    });
    expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toBeNull();
    expect(zeigeBannerMock).toHaveBeenCalledWith(expect.objectContaining({ typ: 'fehler' }));
  });
  it.each(['fehler', 'gesichert_aber_nicht_entfernt'])(
    'liefert bei Sicherung %s keine Titel und meldet den Befund',
    async (fall) => {
      appDatenSpeicher.set(APPDATA_DATEINAME('GG'), '<kaputt/>');
      if (fall === 'fehler') invokeMock.mockRejectedValueOnce(new Error('Sicherung'));
      else invokeMock.mockResolvedValueOnce({ status: fall, sicherungspfad: 'sicherung' });
      expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toBeNull();
      expect(zeigeBannerMock).toHaveBeenCalled();
    },
  );
  it('verwendet zwischenzeitlich nativ geprüften gültigen Inhalt', async () => {
    appDatenSpeicher.set(APPDATA_DATEINAME('GG'), '<kaputt/>');
    invokeMock.mockImplementationOnce(async () => {
      appDatenSpeicher.set(APPDATA_DATEINAME('GG'), xml('GG', []));
      return { status: 'veraendert', sicherungspfad: null };
    });
    expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toEqual(
      new Map(),
    );
  });
});

it('ignoriert Erweiterungen und Kommentare ohne versteckte Titel zu übernehmen', async () => {
  appDatenSpeicher.set(
    APPDATA_DATEINAME('GG'),
    `<nichtamtlicheTitel version='1' extra='x'>
    <neu><infos><gesetz normgeber="de-bund">FALSCH</gesetz></infos></neu><infos extra='x'><gesetz extra='x' normgeber='de-bund'>GG</gesetz></infos>
    <inhalt extra='x'><norm extra='x'><neu><bezeichnung>9</bezeichnung><titel>falsch</titel></neu><bezeichnung extra='x'>1</bezeichnung><titel extra='x'>Würde</titel></norm>
      <neu><norm><bezeichnung>2</bezeichnung><titel>falsch</titel></norm></neu>
      <!-- <norm><bezeichnung>3</bezeichnung><titel>falsch</titel></norm> -->
    </inhalt></nichtamtlicheTitel>`,
  );
  expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toEqual(
    new Map([['1', 'Würde']]),
  );
});

it('lädt Titel über die Gesetzesreferenz', async () => {
  appDatenSpeicher.set(
    APPDATA_DATEINAME('GG'),
    xml('GG', [{ bezeichnung: 'Art. 1', titel: 'Menschenwürde' }]),
  );
  expect(await ladeNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'de-bund' })).toEqual(
    new Map([['Art. 1', 'Menschenwürde']]),
  );
});

describe('Vollständige Referenz und tatsächlicher Pfad', () => {
  it('liest und ersetzt die vorhandene Schreibweise ohne installiertes Gesetz', async () => {
    appDatenSpeicher.set(APPDATA_DATEINAME('GG'), xml('GG', []));
    const ref = { kurztitel: 'gg', normgeber: 'de-bund' };
    expect(await ladeNichtamtlicheTitel(ref)).toEqual(new Map());
    expect(await leseNichtamtlicheTitelRohtext(ref)).toBe(xml('GG', []));
    await ersetzeNichtamtlicheTitelDatei(ref, 'ersetzt');
    expect([...appDatenSpeicher.entries()]).toEqual([[APPDATA_DATEINAME('GG'), 'ersetzt']]);
  });
  it('trennt denselben Kurztitel verschiedener Normgeber', async () => {
    await ersetzeNichtamtlicheTitelDatei({ kurztitel: 'GG', normgeber: 'de-bund' }, 'de-bund');
    await ersetzeNichtamtlicheTitelDatei({ kurztitel: 'GG', normgeber: 'de-bw' }, 'de-bw');
    expect(appDatenSpeicher.get('nichtamtliche-titel/GG_de-bw-nichtamtliche-titel.xml')).toBe(
      'de-bw',
    );
    expect(appDatenSpeicher.get(APPDATA_DATEINAME('GG'))).toBe('de-bund');
  });
  it('verweigert konkurrierende Dateien ohne Veränderung', async () => {
    appDatenSpeicher.set(APPDATA_DATEINAME('GG'), xml('GG', []));
    appDatenSpeicher.set('nichtamtliche-titel/gg_de-bund-nichtamtliche-titel.xml', xml('GG', []));
    const ref = { kurztitel: 'gg', normgeber: 'de-bund' };
    await expect(leseNichtamtlicheTitelRohtext(ref)).rejects.toThrow('Mehrere Dateien');
    await expect(ersetzeNichtamtlicheTitelDatei(ref, 'neu')).rejects.toThrow('Mehrere Dateien');
    await expect(synchronisiereEinNichtamtlicheTitel(ref)).rejects.toThrow('Mehrere Dateien');
    expect(await ladeNichtamtlicheTitel(ref)).toBeNull();
    expect(appDatenSpeicher.size).toBe(2);
    expect(invokeMock).not.toHaveBeenCalled();
  });
  it('findet die tatsächliche Ressourcenschreibweise unter Linux', async () => {
    resourcenDateien.set(RESOURCE_DATEINAME('GG'), xml('GG', []));
    expect(
      await synchronisiereEinNichtamtlicheTitel({ kurztitel: 'gg', normgeber: 'de-bund' }),
    ).toBe(true);
    expect(appDatenSpeicher.get('nichtamtliche-titel/gg_de-bund-nichtamtliche-titel.xml')).toBe(
      xml('GG', []),
    );
  });
  it('greift bei unbekanntem Normgeber nicht auf Bundesressourcen zu', async () => {
    resourcenDateien.set(RESOURCE_DATEINAME('GG'), xml('GG', []));
    expect(
      await synchronisiereEinNichtamtlicheTitel({ kurztitel: 'GG', normgeber: 'unbekannt' }),
    ).toBe(false);
    expect(resolveResourceAufrufe).toEqual(['resources/nichtamtliche-titel/unbekannt']);
  });
});

it('archiviert bei abweichender Referenzschreibweise nur den tatsächlichen Dateipfad', async () => {
  appDatenSpeicher.set(APPDATA_DATEINAME('GG'), '<kaputt/>');
  expect(await ladeNichtamtlicheTitel({ kurztitel: 'gg', normgeber: 'de-bund' })).toBeNull();
  expect(invokeMock).toHaveBeenCalledWith(
    'archiviere_beschaedigte_datei',
    expect.objectContaining({
      relativerPfad: APPDATA_DATEINAME('GG'),
    }),
  );
  expect(appDatenSpeicher.has(APPDATA_DATEINAME('GG'))).toBe(false);
});

it('speichert unbekannte Normgeber getrennt von Bund und prüft ihre Titel', async () => {
  await ersetzeNichtamtlicheTitelDatei(
    { kurztitel: 'GG', normgeber: 'unbekannt' },
    xml('GG', []).replace('normgeber="de-bund"', 'normgeber="unbekannt"'),
  );
  expect(appDatenSpeicher.has('nichtamtliche-titel/GG_unbekannt-nichtamtliche-titel.xml')).toBe(
    true,
  );
  expect(await ladeNichtamtlicheTitel({ kurztitel: 'gg', normgeber: 'unbekannt' })).toEqual(
    new Map(),
  );
});

it('stellt dieselbe reine XML-Prüfung für IO und Ressourcenmigration bereit', () => {
  expect(
    pruefeNichtamtlicheTitelXML(xml('GG', []), { kurztitel: 'gg', normgeber: 'de-bund' }),
  ).toEqual({ status: 'gueltig', titel: new Map() });
  expect(
    pruefeNichtamtlicheTitelXML(xml('BGB', []), { kurztitel: 'GG', normgeber: 'de-bund' }),
  ).toEqual({ status: 'falsch_zugeordnet' });
  expect(pruefeNichtamtlicheTitelXML('<kaputt/>', gesetzesreferenz({ kurztitel: 'GG' }))).toEqual({
    status: 'beschaedigt',
  });
});

it('prüft bei nichtamtlichen Titeln die vollständige Referenz', () => {
  const roh =
    '<nichtamtlicheTitel><infos><gesetz extra="ja" normgeber="de-bund"><!--neu-->GG</gesetz></infos><inhalt/></nichtamtlicheTitel>';
  expect(pruefeNichtamtlicheTitelXML(roh, { kurztitel: 'gg', normgeber: 'de-bund' }).status).toBe(
    'gueltig',
  );
  expect(pruefeNichtamtlicheTitelXML(roh, { kurztitel: 'GG', normgeber: 'de-bw' }).status).toBe(
    'falsch_zugeordnet',
  );
  expect(
    pruefeNichtamtlicheTitelXML(roh.replace('de-bund', 'unbekannt'), {
      kurztitel: 'GG',
      normgeber: 'unbekannt',
    }).status,
  ).toBe('gueltig');
  expect(
    pruefeNichtamtlicheTitelXML(roh.replace(' normgeber="de-bund"', ''), {
      kurztitel: 'GG',
      normgeber: 'unbekannt',
    }).status,
  ).toBe('beschaedigt');
});
