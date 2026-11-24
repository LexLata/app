// importindexSuche.test.ts
//
// Deckt die Such-/Lese-/Schreib-Funktionen sowie das XML-Parsing ab.
// synchronisiereEineDatei (importindexVorinstallation.ts) wird gemockt, damit
// diese Tests unabhängig vom Bundle-Kopiermechanismus sind (der hat seine
// eigene Testdatei: importindexVorinstallation.test.ts) und nur beobachtet werden
// muss, DASS er vor jeder Lese-Operation aufgerufen wird. DOMParser kommt
// aus dem linkedom-Polyfill in setupNode.ts (siehe vitest.config.ts).

import { readFileSync } from 'node:fs';
import { serialisiereImportindex } from './importindexErstellung';
import { pruefeXmlWohlgeformtheit } from '@/test/plattform/xmlPruefung';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

const appDatenSpeicher = new Map<string, string>();

// vi.mock-Factories werden an den Dateianfang gehoisted - daher hier KEINE
// äußere Konstante referenzieren (siehe vitest-Fehlermeldung "Cannot access
// ... before initialization"), sondern vi.fn() direkt in der Factory
// erzeugen. Der Zugriff aus den Tests erfolgt über den (ebenfalls
// gemockten) Import selbst.
vi.mock('@/lib/import/importindex/importindexVorinstallation', () => ({
  synchronisiereEineDatei: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/persistenz/kern/kern.index', () => ({
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
}));

import {
  sucheImImportindex,
  sucheImImportindexPerLangtitel,
  leseGesamtenImportindex,
  uebernehmeImportindexDatei,
  importindexDateiPfad,
  importindexStatus,
} from './importindexSuche';
import { synchronisiereEineDatei } from '@/lib/import/importindex/importindexVorinstallation';

const synchronisiereEineDateiMock = vi.mocked(synchronisiereEineDatei);

const DATEINAME = 'de-bund.xml';
const APPDATA_PFAD = 'importindizes/de-bund.xml';

function importindexXml(
  eintraege: Array<{ kurztitel: string; langtitel: string; abrufkennung: string }>,
): string {
  const gesetze = eintraege
    .map(
      (e) =>
        `<gesetz><kurztitel>${e.kurztitel}</kurztitel><langtitel>${e.langtitel}</langtitel><abrufkennung>${e.abrufkennung}</abrufkennung></gesetz>`,
    )
    .join('');
  return `<importindex version="1"><infos><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit></infos><inhalt>${gesetze}</inhalt></importindex>`;
}

beforeEach(() => {
  appDatenSpeicher.clear();
  synchronisiereEineDateiMock.mockClear();
});

// ---------------------------------------------------------------------------
// sucheImImportindex
// ---------------------------------------------------------------------------

describe('sucheImImportindex', () => {
  it('findet einen Eintrag bei exakt passendem Kurztitel', async () => {
    appDatenSpeicher.set(
      APPDATA_PFAD,
      importindexXml([
        { kurztitel: 'BGB', langtitel: 'Bürgerliches Gesetzbuch', abrufkennung: 'L1' },
      ]),
    );
    const ergebnis = await sucheImImportindex('de-bund', 'BGB');
    expect(ergebnis).toEqual({
      kurztitel: 'BGB',
      langtitel: 'Bürgerliches Gesetzbuch',
      abrufkennung: 'L1',
    });
  });

  it('MUTATIONSTEST: findet case-insensitiv (Kleinschreibung der Suche gegen Großschreibung im Index)', async () => {
    appDatenSpeicher.set(
      APPDATA_PFAD,
      importindexXml([
        { kurztitel: 'BGB', langtitel: 'Bürgerliches Gesetzbuch', abrufkennung: 'L1' },
      ]),
    );
    const ergebnis = await sucheImImportindex('de-bund', 'bgb');
    expect(ergebnis?.kurztitel).toBe('BGB');
  });

  it('gibt den korrekt groß-/kleingeschriebenen Kurztitel aus dem Index zurück, nicht die Nutzereingabe', async () => {
    appDatenSpeicher.set(
      APPDATA_PFAD,
      importindexXml([{ kurztitel: 'BGB', langtitel: 'X', abrufkennung: 'L1' }]),
    );
    const ergebnis = await sucheImImportindex('de-bund', 'bGb');
    expect(ergebnis?.kurztitel).toBe('BGB');
  });

  it('trimmt Whitespace um die Sucheingabe', async () => {
    appDatenSpeicher.set(
      APPDATA_PFAD,
      importindexXml([{ kurztitel: 'BGB', langtitel: 'X', abrufkennung: 'L1' }]),
    );
    const ergebnis = await sucheImImportindex('de-bund', '  BGB  ');
    expect(ergebnis?.kurztitel).toBe('BGB');
  });

  it('gibt null zurück, wenn kein passender Eintrag existiert', async () => {
    appDatenSpeicher.set(
      APPDATA_PFAD,
      importindexXml([{ kurztitel: 'BGB', langtitel: 'X', abrufkennung: 'L1' }]),
    );
    expect(await sucheImImportindex('de-bund', 'StGB')).toBeNull();
  });

  it('MUTATIONSTEST: sucht NICHT im langtitel-Feld (Kurztitel- und Langtitelsuche sind getrennte Funktionen)', async () => {
    appDatenSpeicher.set(
      APPDATA_PFAD,
      importindexXml([
        { kurztitel: 'BGB', langtitel: 'Bürgerliches Gesetzbuch', abrufkennung: 'L1' },
      ]),
    );
    expect(await sucheImImportindex('de-bund', 'Bürgerliches Gesetzbuch')).toBeNull();
  });

  it('stellt vor der Suche den Index sicher (ruft synchronisiereEineDatei mit dem übergebenen Dateinamen auf)', async () => {
    appDatenSpeicher.set(APPDATA_PFAD, importindexXml([]));
    await sucheImImportindex('de-bund', 'BGB');
    expect(synchronisiereEineDateiMock).toHaveBeenCalledWith(DATEINAME);
  });

  it('MUTATIONSTEST: property – case-insensitive Suche findet den Eintrag für JEDE Groß-/Kleinschreibungs-Variante des Kurztitels', async () => {
    appDatenSpeicher.set(
      APPDATA_PFAD,
      importindexXml([{ kurztitel: 'StGB', langtitel: 'Strafgesetzbuch', abrufkennung: 'L2' }]),
    );
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('StGB', 'stgb', 'STGB', 'sTgB', 'StGb'),
        async (variante) => {
          const ergebnis = await sucheImImportindex('de-bund', variante);
          expect(ergebnis?.kurztitel).toBe('StGB');
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// sucheImImportindexPerLangtitel
// ---------------------------------------------------------------------------

describe('sucheImImportindexPerLangtitel', () => {
  it('findet einen Eintrag case-insensitiv über den langtitel', async () => {
    appDatenSpeicher.set(
      APPDATA_PFAD,
      importindexXml([
        { kurztitel: 'BGB', langtitel: 'Bürgerliches Gesetzbuch', abrufkennung: 'L1' },
      ]),
    );
    const ergebnis = await sucheImImportindexPerLangtitel('de-bund', 'bürgerliches gesetzbuch');
    expect(ergebnis?.kurztitel).toBe('BGB');
  });

  it('MUTATIONSTEST: gibt null zurück, wenn der (getrimmte) Suchbegriff leer ist, statt den ersten Eintrag zu liefern', async () => {
    appDatenSpeicher.set(
      APPDATA_PFAD,
      importindexXml([
        { kurztitel: 'BGB', langtitel: 'Bürgerliches Gesetzbuch', abrufkennung: 'L1' },
      ]),
    );
    expect(await sucheImImportindexPerLangtitel('de-bund', '   ')).toBeNull();
    expect(await sucheImImportindexPerLangtitel('de-bund', '')).toBeNull();
  });

  it('MUTATIONSTEST: sucht NICHT im kurztitel-Feld', async () => {
    appDatenSpeicher.set(
      APPDATA_PFAD,
      importindexXml([
        { kurztitel: 'BGB', langtitel: 'Bürgerliches Gesetzbuch', abrufkennung: 'L1' },
      ]),
    );
    expect(await sucheImImportindexPerLangtitel('de-bund', 'BGB')).toBeNull();
  });

  it('gibt null zurück, wenn kein passender Eintrag existiert', async () => {
    appDatenSpeicher.set(
      APPDATA_PFAD,
      importindexXml([
        { kurztitel: 'BGB', langtitel: 'Bürgerliches Gesetzbuch', abrufkennung: 'L1' },
      ]),
    );
    expect(await sucheImImportindexPerLangtitel('de-bund', 'Strafgesetzbuch')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// leseGesamtenImportindex / XML-Parsing
// ---------------------------------------------------------------------------

describe('leseGesamtenImportindex', () => {
  it.each(['<parsererror>XML-Fehler</parsererror>', '<fremdes-format><inhalt/></fremdes-format>'])(
    'meldet beschädigtes oder fremdes Index-XML als Formatfehler: %s',
    async (xml) => {
      appDatenSpeicher.set(APPDATA_PFAD, xml);
      await expect(leseGesamtenImportindex(DATEINAME)).rejects.toThrow(
        'Ungültiges Importindex-XML',
      );
    },
  );

  it('liest alle Einträge aus dem Index', async () => {
    appDatenSpeicher.set(
      APPDATA_PFAD,
      importindexXml([
        { kurztitel: 'BGB', langtitel: 'Bürgerliches Gesetzbuch', abrufkennung: 'L1' },
        { kurztitel: 'StGB', langtitel: 'Strafgesetzbuch', abrufkennung: 'L2' },
      ]),
    );
    const eintraege = await leseGesamtenImportindex(DATEINAME);
    expect(eintraege).toEqual([
      { kurztitel: 'BGB', langtitel: 'Bürgerliches Gesetzbuch', abrufkennung: 'L1' },
      { kurztitel: 'StGB', langtitel: 'Strafgesetzbuch', abrufkennung: 'L2' },
    ]);
  });

  it('gibt eine leere Liste zurück, wenn der Index keine Gesetz-Einträge enthält', async () => {
    appDatenSpeicher.set(APPDATA_PFAD, importindexXml([]));
    expect(await leseGesamtenImportindex(DATEINAME)).toEqual([]);
  });

  it('MUTATIONSTEST: überspringt einen Eintrag ohne kurztitel', async () => {
    appDatenSpeicher.set(
      APPDATA_PFAD,
      '<importindex version="1"><infos><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit></infos><inhalt><gesetz><langtitel>X</langtitel><abrufkennung>L1</abrufkennung></gesetz></inhalt></importindex>',
    );
    expect(await leseGesamtenImportindex(DATEINAME)).toEqual([]);
  });

  it('MUTATIONSTEST: überspringt einen Eintrag ohne abrufkennung', async () => {
    appDatenSpeicher.set(
      APPDATA_PFAD,
      '<importindex version="1"><infos><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit></infos><inhalt><gesetz><kurztitel>BGB</kurztitel><langtitel>X</langtitel></gesetz></inhalt></importindex>',
    );
    expect(await leseGesamtenImportindex(DATEINAME)).toEqual([]);
  });

  it('behandelt einen fehlenden langtitel als leeren String, statt den Eintrag zu überspringen', async () => {
    appDatenSpeicher.set(
      APPDATA_PFAD,
      '<importindex version="1"><infos><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit></infos><inhalt><gesetz><kurztitel>BGB</kurztitel><abrufkennung>L1</abrufkennung></gesetz></inhalt></importindex>',
    );
    expect(await leseGesamtenImportindex(DATEINAME)).toEqual([
      { kurztitel: 'BGB', langtitel: '', abrufkennung: 'L1' },
    ]);
  });

  it('trimmt Whitespace um kurztitel/langtitel/abrufkennung', async () => {
    appDatenSpeicher.set(
      APPDATA_PFAD,
      '<importindex version="1"><infos><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit></infos><inhalt><gesetz><kurztitel> BGB </kurztitel><langtitel> X </langtitel><abrufkennung> L1 </abrufkennung></gesetz></inhalt></importindex>',
    );
    expect(await leseGesamtenImportindex(DATEINAME)).toEqual([
      { kurztitel: 'BGB', langtitel: 'X', abrufkennung: 'L1' },
    ]);
  });

  it('MUTATIONSTEST: liest ausschließlich Elemente unter importindex > inhalt > gesetz, nicht beliebig verschachtelte <gesetz>-Elemente andernorts', async () => {
    appDatenSpeicher.set(
      APPDATA_PFAD,
      '<importindex version="1"><infos><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit></infos><anderswo><gesetz><kurztitel>FALSCH</kurztitel><langtitel>X</langtitel><abrufkennung>L9</abrufkennung></gesetz></anderswo><inhalt><gesetz><kurztitel>RICHTIG</kurztitel><langtitel>X</langtitel><abrufkennung>L1</abrufkennung></gesetz></inhalt></importindex>',
    );
    const eintraege = await leseGesamtenImportindex(DATEINAME);
    expect(eintraege.map((e) => e.kurztitel)).toEqual(['RICHTIG']);
  });

  it('stellt den Index vor dem Lesen sicher (synchronisiereEineDatei wird aufgerufen)', async () => {
    appDatenSpeicher.set(APPDATA_PFAD, importindexXml([]));
    await leseGesamtenImportindex(DATEINAME);
    expect(synchronisiereEineDateiMock).toHaveBeenCalledWith(DATEINAME);
  });
});

// ---------------------------------------------------------------------------
// uebernehmeImportindexDatei
// ---------------------------------------------------------------------------

describe('uebernehmeImportindexDatei', () => {
  it('kein Bestand -> übernimmt den Import immer als neu, unabhängig vom verarbeitungszeit-Tag', async () => {
    const importXml =
      '<importindex version="1"><infos><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit></infos><inhalt></inhalt></importindex>';
    const ergebnis = await uebernehmeImportindexDatei(importXml);
    expect(ergebnis).toEqual({ kategorie: 'de-bund', aktion: 'neu' });
    expect(appDatenSpeicher.get(APPDATA_PFAD)).toBe(importXml);
  });

  it('Import ist neuer als der Bestand -> ersetzt und meldet "neu"', async () => {
    appDatenSpeicher.set(
      APPDATA_PFAD,
      '<importindex version="1"><infos><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/><verarbeitungszeit>2020-01-01T00:00:00Z</verarbeitungszeit></infos><inhalt></inhalt></importindex>',
    );
    const importXml =
      '<importindex version="1"><infos><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit></infos><inhalt></inhalt></importindex>';
    const ergebnis = await uebernehmeImportindexDatei(importXml);
    expect(ergebnis).toEqual({ kategorie: 'de-bund', aktion: 'neu' });
    expect(appDatenSpeicher.get(APPDATA_PFAD)).toBe(importXml);
  });

  it('Import ist NICHT neuer als der Bestand -> bleibt unveraendert, kein Schreiben', async () => {
    const bestehendesXml =
      '<importindex version="1"><infos><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit></infos><inhalt></inhalt></importindex>';
    appDatenSpeicher.set(APPDATA_PFAD, bestehendesXml);
    const importXml =
      '<importindex version="1"><infos><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/><verarbeitungszeit>2020-01-01T00:00:00Z</verarbeitungszeit></infos><inhalt></inhalt></importindex>';
    const ergebnis = await uebernehmeImportindexDatei(importXml);
    expect(ergebnis).toEqual({ kategorie: 'de-bund', aktion: 'unveraendert' });
    expect(appDatenSpeicher.get(APPDATA_PFAD)).toBe(bestehendesXml);
  });

  it('Import ohne lesbaren verarbeitungszeit-Tag wird vor jedem Bestandsabgleich abgelehnt', async () => {
    appDatenSpeicher.set(
      APPDATA_PFAD,
      '<importindex version="1"><infos><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/><verarbeitungszeit>2020-01-01T00:00:00Z</verarbeitungszeit></infos><inhalt></inhalt></importindex>',
    );
    await expect(
      uebernehmeImportindexDatei(
        '<importindex version="1"><infos><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/></infos><inhalt></inhalt></importindex>',
      ),
    ).rejects.toThrow();
    expect(synchronisiereEineDateiMock).not.toHaveBeenCalled();
  });

  it('erkennt BW am direkten Quelleelement ohne Standardabgleich', async () => {
    const importXmlBw =
      '<importindex version="1"><infos><normgeber>de-bw</normgeber><datenquelle name="Landesrecht BW"/><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit></infos><inhalt><abrufkennung>https://www.landesrecht-bw.de/beispiel</abrufkennung></inhalt></importindex>';
    const ergebnis = await uebernehmeImportindexDatei(importXmlBw);
    expect(ergebnis.kategorie).toBe('de-bw');
    expect(synchronisiereEineDateiMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// importindexDateiPfad
// ---------------------------------------------------------------------------

describe('importindexDateiPfad', () => {
  it("liefert den AppData-Pfad passend zur Kategorie ('de-bund'/'de-bw')", () => {
    expect(importindexDateiPfad('de-bund')).toBe('importindizes/de-bund.xml');
    expect(importindexDateiPfad('de-bw')).toBe('importindizes/de-bw.xml');
  });
});

// ---------------------------------------------------------------------------
// importindexStatus
// ---------------------------------------------------------------------------

describe('importindexStatus', () => {
  it('keine Datei vorhanden -> verarbeitungszeit/herkunft null, aktiv false (kein laufender Vorgang)', async () => {
    const status = await importindexStatus('de-bund');
    expect(status).toEqual({ aktiv: false, verarbeitungszeit: null, herkunft: null });
  });

  it('vorhandene Datei -> liest verarbeitungszeit/herkunft aus dem verarbeitungszeit-Tag', async () => {
    appDatenSpeicher.set(
      APPDATA_PFAD,
      '<importindex version="1"><infos><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/><verarbeitungszeit herkunft="standard">2026-01-01T00:00:00.000Z</verarbeitungszeit></infos><inhalt></inhalt></importindex>',
    );
    const status = await importindexStatus('de-bund');
    expect(status.verarbeitungszeit?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(status.herkunft).toBe('standard');
  });

  it("verwendet die zur Kategorie passende Datei ('de-bw' liest nicht die Bund-Datei)", async () => {
    appDatenSpeicher.set(
      APPDATA_PFAD,
      '<importindex version="1"><infos><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/><verarbeitungszeit>2026-01-01T00:00:00Z</verarbeitungszeit></infos><inhalt></inhalt></importindex>',
    );
    const status = await importindexStatus('de-bw');
    expect(status.verarbeitungszeit).toBeNull();
  });
});

it.each(['de-bund', 'de-bw'] as const)(
  'liest den vollständigen echten %s-Index und findet seine Rand-Einträge',
  async (kategorie) => {
    const datei = kategorie === 'de-bund' ? 'de-bund.xml' : 'de-bw.xml';
    const ziel = kategorie === 'de-bund' ? DATEINAME : 'de-bw.xml';
    const xml = readFileSync(`src-tauri/resources/importindizes/${datei}`, 'utf8');
    pruefeXmlWohlgeformtheit(xml);
    expect(new DOMParser().parseFromString(xml, 'text/xml').documentElement.localName).toBe(
      'importindex',
    );
    appDatenSpeicher.set(`importindizes/${ziel}`, xml);
    const erwartet = Array.from(
      new DOMParser()
        .parseFromString(xml, 'text/xml')
        .querySelectorAll('importindex > inhalt > gesetz'),
    ).map((el) => ({
      kurztitel: el.querySelector('kurztitel')!.textContent!.trim(),
      langtitel: el.querySelector('langtitel')!.textContent!.trim(),
      abrufkennung: el.querySelector('abrufkennung')!.textContent!.trim(),
    }));
    const gelesen = await leseGesamtenImportindex(ziel);
    expect(gelesen).toEqual(erwartet);
    expect(gelesen.length).toBeGreaterThan(500);
    for (const e of [erwartet[0]!, erwartet.at(-1)!]) {
      expect(await sucheImImportindex(kategorie, e.kurztitel)).not.toBeNull();
      expect(await sucheImImportindexPerLangtitel(kategorie, e.langtitel)).not.toBeNull();
    }
  },
);
it('liest gültige serialisierte Indizes und weist abweichende Version zurück', async () => {
  const eintraege = [
    {
      kurztitel: 'BGB',
      langtitel: 'Bürgerliches Gesetzbuch',
      abrufkennung: 'L1',
      duplikatArt: 'eg' as const,
      duplikatVon: 'EG',
    },
  ];
  for (const version of ['1', '2']) {
    appDatenSpeicher.set(
      APPDATA_PFAD,
      serialisiereImportindex(eintraege, 'de-bund').replace(
        'importindex version="1"',
        `importindex version="${version}"`,
      ),
    );
    if (version !== '1') {
      await expect(leseGesamtenImportindex(DATEINAME)).rejects.toThrow();
      continue;
    }
    expect(await leseGesamtenImportindex(DATEINAME)).toEqual([
      { kurztitel: 'BGB', langtitel: 'Bürgerliches Gesetzbuch', abrufkennung: 'L1' },
    ]);
  }
});

it('findet zerlegte Kurztiteleingaben und erhält die gespeicherte Schreibweise', async () => {
  const eintrag = { kurztitel: 'AÜG', langtitel: 'Gesetz', abrufkennung: 'a' };
  appDatenSpeicher.set(APPDATA_PFAD, importindexXml([eintrag]));
  expect(await sucheImImportindex('de-bund', 'AÜG'.normalize('NFD'))).toEqual(eintrag);
});
