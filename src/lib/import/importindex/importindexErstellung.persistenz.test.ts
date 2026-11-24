// importindexErstellung.persistenz.test.ts
//
// Deckt das AppData-Ablageformat der Importindex-Dateien ab: Pfad, <verarbeitungszeit>-
// Zeitstempel-Lesen/-Ersetzen, herkunft-Attribut, und die
// lesen->vergleichen->schreiben-Orchestrierung in
// speichereImportindexAktualisierung. appDatenZugriff wird über eine In-Memory-Map
// gemockt (Muster aus gesetzeskurzbefehlSpeicher.test.ts).

import { pruefeXmlWohlgeformtheit } from '@/test/plattform/xmlPruefung';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';

const appDatenSpeicher = new Map<string, string>();

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
  importindexOhneVerarbeitungszeit,
  importindexAppDataPfad,
  liesVerarbeitungszeit,
  leseHerkunft,
  setzeHerkunft,
  mitNeuerVerarbeitungszeit,
  speichereImportindexAktualisierung,
} from './importindexErstellung.persistenz';

beforeEach(() => {
  appDatenSpeicher.clear();
});

// ---------------------------------------------------------------------------
// importindexAppDataPfad
// ---------------------------------------------------------------------------

describe('importindexAppDataPfad', () => {
  it('MUTATIONSTEST: legt Index-Dateien im Unterordner "importindizes/" ab', () => {
    expect(importindexAppDataPfad('de-bund.xml')).toBe('importindizes/de-bund.xml');
  });
});

// ---------------------------------------------------------------------------
// liesVerarbeitungszeit
// ---------------------------------------------------------------------------

describe('liesVerarbeitungszeit', () => {
  it('liest ein gültiges ISO-Datum aus einem einfachen <verarbeitungszeit>-Tag', () => {
    const xml =
      '<importindex><infos><verarbeitungszeit>2026-05-19T10:00:00.000Z</verarbeitungszeit></infos></importindex>';
    expect(liesVerarbeitungszeit(xml)?.toISOString()).toBe('2026-05-19T10:00:00.000Z');
  });

  it('liest das Datum auch, wenn das Tag ein herkunft-Attribut trägt', () => {
    const xml =
      '<importindex><infos><verarbeitungszeit herkunft="standard">2026-05-19T10:00:00.000Z</verarbeitungszeit></infos></importindex>';
    expect(liesVerarbeitungszeit(xml)?.toISOString()).toBe('2026-05-19T10:00:00.000Z');
  });

  it('gibt null zurück, wenn kein <verarbeitungszeit>-Tag vorhanden ist', () => {
    expect(liesVerarbeitungszeit('<importindex></importindex>')).toBeNull();
  });

  it('gibt null zurück, wenn der Tag-Inhalt kein gültiges Datum ist', () => {
    expect(
      liesVerarbeitungszeit(
        '<importindex><infos><verarbeitungszeit>kein-datum</verarbeitungszeit></infos></importindex>',
      ),
    ).toBeNull();
  });

  it('trimmt Whitespace um den Datumswert', () => {
    const xml =
      '<importindex><infos><verarbeitungszeit> 2026-05-19T10:00:00.000Z </verarbeitungszeit></infos></importindex>';
    expect(liesVerarbeitungszeit(xml)?.toISOString()).toBe('2026-05-19T10:00:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// leseHerkunft
// ---------------------------------------------------------------------------

describe('leseHerkunft', () => {
  it('liest herkunft="standard" korrekt aus', () => {
    const xml =
      '<importindex><infos><verarbeitungszeit herkunft="standard">2026-01-01</verarbeitungszeit></infos></importindex>';
    expect(leseHerkunft(xml)).toBe('standard');
  });

  it('liest herkunft="nutzer" korrekt aus', () => {
    const xml =
      '<importindex><infos><verarbeitungszeit herkunft="nutzer">2026-01-01</verarbeitungszeit></infos></importindex>';
    expect(leseHerkunft(xml)).toBe('nutzer');
  });

  it('MUTATIONSTEST: fehlt das herkunft-Attribut, wird "nutzer" angenommen (Default, kein "standard")', () => {
    const xml =
      '<importindex><infos><verarbeitungszeit>2026-01-01</verarbeitungszeit></infos></importindex>';
    expect(leseHerkunft(xml)).toBe('nutzer');
  });

  it('MUTATIONSTEST: ein unbekannter/ungültiger Attributwert fällt ebenfalls auf "nutzer" zurück', () => {
    const xml =
      '<importindex><infos><verarbeitungszeit herkunft="irgendwas">2026-01-01</verarbeitungszeit></infos></importindex>';
    expect(leseHerkunft(xml)).toBe('nutzer');
  });
});

// ---------------------------------------------------------------------------
// setzeHerkunft
// ---------------------------------------------------------------------------

describe('setzeHerkunft', () => {
  it('setzt das herkunft-Attribut auf einem Tag ohne Attribut', () => {
    const xml =
      '<importindex><infos><verarbeitungszeit>2026-01-01</verarbeitungszeit></infos></importindex>';
    expect(setzeHerkunft(xml, 'standard')).toBe(
      '<importindex><infos><verarbeitungszeit herkunft="standard">2026-01-01</verarbeitungszeit></infos></importindex>',
    );
  });

  it('überschreibt ein bereits vorhandenes herkunft-Attribut', () => {
    const xml =
      '<importindex><infos><verarbeitungszeit herkunft="nutzer">2026-01-01</verarbeitungszeit></infos></importindex>';
    expect(setzeHerkunft(xml, 'standard')).toBe(
      '<importindex><infos><verarbeitungszeit herkunft="standard">2026-01-01</verarbeitungszeit></infos></importindex>',
    );
  });

  it('lässt den restlichen XML-Inhalt (insb. den Datumswert) unangetastet', () => {
    const xml =
      '<importindex><infos><verarbeitungszeit>2026-01-01</verarbeitungszeit></infos><inhalt><gesetz normgeber="de-bund">X</gesetz></inhalt></importindex>';
    expect(setzeHerkunft(xml, 'nutzer')).toBe(
      '<importindex><infos><verarbeitungszeit herkunft="nutzer">2026-01-01</verarbeitungszeit></infos><inhalt><gesetz normgeber="de-bund">X</gesetz></inhalt></importindex>',
    );
  });

  it('MUTATIONSTEST: property – für beliebige herkunft-Werte liest leseHerkunft danach exakt diesen Wert wieder aus', () => {
    fc.assert(
      fc.property(fc.constantFrom<'nutzer' | 'standard'>('nutzer', 'standard'), (herkunft) => {
        const xml =
          '<importindex><infos><verarbeitungszeit>2026-01-01</verarbeitungszeit></infos></importindex>';
        expect(leseHerkunft(setzeHerkunft(xml, herkunft))).toBe(herkunft);
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// mitNeuerVerarbeitungszeit
// ---------------------------------------------------------------------------

describe('mitNeuerVerarbeitungszeit', () => {
  it('ersetzt nur den Textinhalt des <verarbeitungszeit>-Tags durch die neue Zeit (ISO)', () => {
    const xml =
      '<importindex><infos><verarbeitungszeit>2020-01-01T00:00:00.000Z</verarbeitungszeit></infos></importindex>';
    const neu = new Date('2026-05-19T10:00:00.000Z');
    expect(mitNeuerVerarbeitungszeit(xml, neu)).toBe(
      '<importindex><infos><verarbeitungszeit>2026-05-19T10:00:00Z</verarbeitungszeit></infos></importindex>',
    );
  });

  it('MUTATIONSTEST: ein bestehendes herkunft-Attribut bleibt erhalten', () => {
    const xml =
      '<importindex><infos><verarbeitungszeit herkunft="standard">2020-01-01T00:00:00.000Z</verarbeitungszeit></infos></importindex>';
    const neu = new Date('2026-05-19T10:00:00.000Z');
    expect(mitNeuerVerarbeitungszeit(xml, neu)).toBe(
      '<importindex><infos><verarbeitungszeit herkunft="standard">2026-05-19T10:00:00Z</verarbeitungszeit></infos></importindex>',
    );
  });

  it('lässt den restlichen XML-Inhalt unangetastet', () => {
    const xml =
      '<importindex><infos><verarbeitungszeit>2020-01-01</verarbeitungszeit></infos><inhalt><gesetz normgeber="de-bund">X</gesetz></inhalt></importindex>';
    const neu = new Date('2026-05-19T10:00:00.000Z');
    expect(mitNeuerVerarbeitungszeit(xml, neu)).toBe(
      '<importindex><infos><verarbeitungszeit>2026-05-19T10:00:00Z</verarbeitungszeit></infos><inhalt><gesetz normgeber="de-bund">X</gesetz></inhalt></importindex>',
    );
  });
});

// ---------------------------------------------------------------------------
// speichereImportindexAktualisierung: Schreiben je nach Inhaltsänderung
// ---------------------------------------------------------------------------

describe('speichereImportindexAktualisierung: Schreiben je nach Inhaltsänderung', () => {
  const PFAD = 'importindizes/de-bund.xml';
  const index = (zeit: string, gesetz?: string) =>
    `<importindex version="1"><infos><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/><verarbeitungszeit>${zeit}</verarbeitungszeit></infos><inhalt>${gesetz ? `<gesetz normgeber="de-bund">${gesetz}</gesetz>` : ''}</inhalt></importindex>`;

  it('Erstlauf (noch keine Datei vorhanden): schreibt den Index, unveraendert=false', async () => {
    const xml = index('2026-01-01T00:00:00.000Z');
    const ergebnis = await speichereImportindexAktualisierung('de-bund', xml);
    expect(ergebnis).toEqual({ unveraendert: false });
    expect(importindexOhneVerarbeitungszeit(appDatenSpeicher.get(PFAD)!)).toBe(
      importindexOhneVerarbeitungszeit(xml),
    );
    expect(leseHerkunft(appDatenSpeicher.get(PFAD)!)).toBe('nutzer');
  });

  it('inhaltlich geändert: schreibt den neuen Index (nicht nur den Zeitstempel)', async () => {
    appDatenSpeicher.set(PFAD, index('2020-01-01T00:00:00.000Z', 'Alt'));
    const neuesXml = index('2026-05-19T10:00:00.000Z', 'Neu');

    const ergebnis = await speichereImportindexAktualisierung('de-bund', neuesXml);

    expect(ergebnis).toEqual({ unveraendert: false });
    expect(appDatenSpeicher.get(PFAD)).toContain('<gesetz normgeber="de-bund">Neu</gesetz>');
    expect(appDatenSpeicher.get(PFAD)).not.toContain('Alt');
  });

  it('der Vergleich ignoriert ausschließlich den Zeitstempel, nicht andere Unterschiede', async () => {
    appDatenSpeicher.set(PFAD, index('2026-01-01T00:00:00Z', 'Alt'));
    const ergebnis = await speichereImportindexAktualisierung(
      'de-bund',
      index('2026-01-01T00:00:00Z', 'Neu'),
    );
    expect(ergebnis).toEqual({ unveraendert: false });
    expect(appDatenSpeicher.get(PFAD)).toContain('Neu');
  });

  it('ersetzt einen beschädigten Rohbestand durch den neu validierten Index', async () => {
    appDatenSpeicher.set(PFAD, '<importindex><inhalt>beschädigt');
    const xml = index('2026-01-01T00:00:00Z');
    expect(await speichereImportindexAktualisierung('de-bund', xml)).toEqual({
      unveraendert: false,
    });
    expect(importindexOhneVerarbeitungszeit(appDatenSpeicher.get(PFAD)!)).toBe(
      importindexOhneVerarbeitungszeit(xml),
    );
  });
});

describe('speichereImportindexAktualisierung', () => {
  it.each([
    ['unverändertem', 'Gleich'],
    ['geändertem', 'Neu'],
  ])(
    'liest die Importindexdatei bei %s Inhalt genau einmal je Speichern',
    async (_fall, gesetz) => {
      const pfad = 'importindizes/de-bund.xml';
      const index = (inhalt: string) =>
        `<importindex version="1"><infos><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/><verarbeitungszeit>2020-01-01T00:00:00.000Z</verarbeitungszeit></infos><inhalt><gesetz normgeber="de-bund">${inhalt}</gesetz></inhalt></importindex>`;
      appDatenSpeicher.set(pfad, index('Gleich'));
      const { appDatenLesen } = await import('@/lib/persistenz/kern/kern.index');
      vi.mocked(appDatenLesen).mockClear();

      await speichereImportindexAktualisierung('de-bund', index(gesetz), {
        sichereVorherigeVersion: true,
      });

      expect(vi.mocked(appDatenLesen).mock.calls.filter(([p]) => p === pfad)).toHaveLength(1);
    },
  );

  it('bewahrt bei unverändertem BW-Inhalt die XML-Attribute, frischt den Prüfzeitpunkt auf und legt keine Sicherung an', async () => {
    const pfad = 'importindizes/de-bw.xml';
    const alt =
      '<importindex version="1" kennung="de-bw"><infos><normgeber>de-bw</normgeber><datenquelle name="Landesrecht BW"/><verarbeitungszeit herkunft="standard">2020-01-01T00:00:00.000Z</verarbeitungszeit></infos><inhalt art="vollstaendig"><gesetz normgeber="de-bund">Unveraendert</gesetz></inhalt></importindex>';
    appDatenSpeicher.set(pfad, alt);

    const ergebnis = await speichereImportindexAktualisierung(
      'de-bw',
      '<importindex version="1" kennung="de-bw"><infos><normgeber>de-bw</normgeber><datenquelle name="Landesrecht BW"/><verarbeitungszeit>2000-01-01T00:00:00.000Z</verarbeitungszeit></infos><inhalt art="vollstaendig"><gesetz normgeber="de-bund">Unveraendert</gesetz></inhalt></importindex>',
      { sichereVorherigeVersion: false },
    );

    expect(ergebnis).toEqual({ unveraendert: true });
    const gespeichert = appDatenSpeicher.get(pfad)!;
    expect(gespeichert).toContain('<importindex version="1" kennung="de-bw">');
    expect(gespeichert).toContain('<inhalt art="vollstaendig">');
    expect(gespeichert).toContain('<gesetz normgeber="de-bund">Unveraendert</gesetz>');
    expect(leseHerkunft(gespeichert)).toBe('nutzer');
    expect(liesVerarbeitungszeit(gespeichert)!.getTime()).toBeGreaterThan(
      new Date('2020-01-01T00:00:00.000Z').getTime(),
    );
    expect(appDatenSpeicher.has(`${pfad}.vorherige-version`)).toBe(false);
  });

  it('kapselt Kategoriepfad, Nutzerherkunft, Prüfzeit und BW-Sicherung', async () => {
    const pfad = 'importindizes/de-bw.xml';
    const alt =
      '<importindex version="1"><infos><normgeber>de-bw</normgeber><datenquelle name="Landesrecht BW"/><verarbeitungszeit herkunft="standard">2020-01-01T00:00:00.000Z</verarbeitungszeit></infos><gesetz normgeber="de-bund">Alt</gesetz><inhalt/></importindex>';
    appDatenSpeicher.set(pfad, alt);

    await speichereImportindexAktualisierung(
      'de-bw',
      '<importindex version="1"><infos><normgeber>de-bw</normgeber><datenquelle name="Landesrecht BW"/><verarbeitungszeit>2000-01-01T00:00:00.000Z</verarbeitungszeit></infos><gesetz normgeber="de-bund">Neu</gesetz><inhalt/></importindex>',
      { sichereVorherigeVersion: true },
    );

    const gespeichert = appDatenSpeicher.get(pfad)!;
    expect(gespeichert).toContain('<gesetz normgeber="de-bund">Neu</gesetz>');
    expect(leseHerkunft(gespeichert)).toBe('nutzer');
    expect(liesVerarbeitungszeit(gespeichert)!.getFullYear()).toBeGreaterThanOrEqual(2026);
    expect(appDatenSpeicher.get(`${pfad}.vorherige-version`)).toBe(alt);
  });
});

it.each([
  ['2026-05-19T10:00:00', '2026-05-19T10:00:00.000Z'],
  ['2026-07-19T12:00:00+02:00', '2026-07-19T10:00:00.000Z'],
  ['2026-05-19', undefined],
])('liest Index-Verarbeitungszeit %s', (wert, erwartet) => {
  expect(
    liesVerarbeitungszeit(
      `<importindex><infos><verarbeitungszeit herkunft="standard">${wert}</verarbeitungszeit></infos></importindex>`,
    )?.toISOString(),
  ).toBe(erwartet);
});
it('liest den alten Index-Zeitstempel-Tag nicht zusätzlich', () => {
  expect(
    liesVerarbeitungszeit('<importindex><erstellt>2026-05-19T10:00:00Z</erstellt></importindex>'),
  ).toBeNull();
});

it('Zeitauffrischung erhält wohlgeformte XML und schreibt UTC ohne Millisekunden', () => {
  const xml = mitNeuerVerarbeitungszeit(
    '<importindex version="1"><infos><verarbeitungszeit herkunft="standard">2000-01-01T00:00:00Z</verarbeitungszeit></infos></importindex>',
    new Date('2026-05-19T10:00:00.987Z'),
  );
  pruefeXmlWohlgeformtheit(xml);
  expect(xml).toContain(
    '<verarbeitungszeit herkunft="standard">2026-05-19T10:00:00Z</verarbeitungszeit>',
  );
});

it('liest Zeit und Herkunft nur direkt trotz Erweiterungen und Kommentaren', () => {
  const xml = `<importindex extra='x'><neu><verarbeitungszeit herkunft='nutzer'>2032-01-01T00:00:00Z</verarbeitungszeit></neu><infos extra='x'><neu><verarbeitungszeit herkunft='nutzer'>2030-01-01T00:00:00Z</verarbeitungszeit></neu><!-- <verarbeitungszeit herkunft='nutzer'>2031-01-01T00:00:00Z</verarbeitungszeit> --><verarbeitungszeit extra='x' herkunft = 'standard'>2026-01-01T00:00:00Z</verarbeitungszeit><neu/></infos></importindex>`;
  expect(liesVerarbeitungszeit(xml)?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  expect(leseHerkunft(xml)).toBe('standard');
});
it('liest keine Angaben aus beschädigtem Index-XML', () => {
  expect(() => liesVerarbeitungszeit('<importindex><verarbeitungszeit></importindex>')).toThrow(
    'Datei ungültig',
  );
  expect(() => leseHerkunft('<importindex><verarbeitungszeit></importindex>')).toThrow(
    'Datei ungültig',
  );
});

it('verändert beim Auffrischen nur infos/verarbeitungszeit und bewahrt Erweiterungen', () => {
  const xml = `<importindex><neu><verarbeitungszeit>2030-01-01T00:00:00Z</verarbeitungszeit></neu><infos><!-- <verarbeitungszeit>2031-01-01T00:00:00Z</verarbeitungszeit> --><verarbeitungszeit extra='x' herkunft = 'standard'>2026-01-01T00:00:00Z</verarbeitungszeit></infos><inhalt/></importindex>`;
  const aktualisiert = mitNeuerVerarbeitungszeit(
    setzeHerkunft(xml, 'nutzer'),
    new Date('2027-01-01T00:00:00Z'),
  );
  expect(aktualisiert).toBe(
    xml.replace("herkunft = 'standard'", 'herkunft = "nutzer"').replace('2026-01-01', '2027-01-01'),
  );
});

it('liest und verändert keine alten Root-Metadaten', () => {
  const alt =
    '<importindex><verarbeitungszeit herkunft="standard">2026-01-01T00:00:00Z</verarbeitungszeit></importindex>';
  expect(liesVerarbeitungszeit(alt)).toBeNull();
  expect(leseHerkunft(alt)).toBe('nutzer');
  expect(setzeHerkunft(alt, 'nutzer')).toBe(alt);
  expect(mitNeuerVerarbeitungszeit(alt, new Date())).toBe(alt);
});

describe('importindexOhneVerarbeitungszeit', () => {
  it('entfernt die direkte Verarbeitungszeit samt Herkunft und erhält verschachtelte Zeitangaben', () => {
    const inhalt = '<metadaten><verarbeitungszeit>fachlich</verarbeitungszeit></metadaten>';
    const xml = `<importindex><infos><verarbeitungszeit herkunft="standard">alt</verarbeitungszeit>${inhalt}</infos><inhalt/></importindex>`;
    expect(importindexOhneVerarbeitungszeit(xml)).toBe(
      `<importindex><infos>${inhalt}</infos><inhalt/></importindex>`,
    );
  });

  it('erhält Eingaben ohne Verarbeitungszeit unverändert', () => {
    const xml = '<importindex><infos><quelle/></infos><inhalt/></importindex>';
    expect(importindexOhneVerarbeitungszeit(xml)).toBe(xml);
  });

  it('erhält beschädigten Rohbestand unverändert, auch nach einer abgeschlossenen Zeitangabe', () => {
    const xml = '<importindex><infos><verarbeitungszeit>alt</verarbeitungszeit></infos><inhalt>';
    expect(importindexOhneVerarbeitungszeit(xml)).toBe(xml);
  });
});
