// markierungskonflikteSpeicher.dateiZugriff.test.ts
//
// Unit-Tests für ladePruefstand/schreibeGesetzKonflikte aus
// markierungskonflikteSpeicher.dateiZugriff.ts (reiner Datei-I/O-Zugriff auf
// markierungskonflikte.xml, siehe dortiger Kopfkommentar).
//
// '@/lib/persistenz/kern/kern.index' wird über eine In-Memory-Map gemockt
// (gleiches Muster wie markierungSpeicher.test.ts), '@tauri-apps/api/event'
// wird gemockt (gleiches Muster wie dateiImport.einfach.test.ts) –
// escapeXML/unescapeXML (xmlVerarbeitung.ts) bleiben UNGEMOCKT und laufen als
// reales Round-Trip-Verhalten mit.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pruefeXmlWohlgeformtheit } from '@/test/plattform/xmlPruefung';

const appDatenSpeicher = new Map<string, string>();

vi.mock('@/lib/persistenz/kern/kern.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/kern/kern.index')>()),
  appDatenExistiert: vi.fn((pfad: string) => Promise.resolve(appDatenSpeicher.has(pfad))),
  appDatenLesen: vi.fn((pfad: string) => {
    const inhalt = appDatenSpeicher.get(pfad);
    if (inhalt === undefined) return Promise.reject(new Error('Datei nicht gefunden'));
    return Promise.resolve(inhalt);
  }),
  appDatenSchreiben: vi.fn((pfad: string, inhalt: string) => {
    appDatenSpeicher.set(pfad, inhalt);
    return Promise.resolve();
  }),
  appDatenLoeschen: vi.fn((pfad: string) => {
    if (!appDatenSpeicher.has(pfad)) return Promise.reject(new Error('Datei existiert nicht'));
    appDatenSpeicher.delete(pfad);
    return Promise.resolve();
  }),
}));

const emitTo = vi.fn<(...args: unknown[]) => Promise<void>>();
vi.mock('@tauri-apps/api/event', () => ({
  emitTo: (...args: unknown[]) => emitTo(...args),
}));

import {
  appDatenLesen,
  appDatenExistiert,
  appDatenSchreiben,
  appDatenLoeschen,
} from '@/lib/persistenz/kern/kern.index';
import {
  ladePruefstand,
  schreibeGesetzKonflikte,
} from './markierungskonflikteSpeicher.dateiZugriff';
import { liesMarkierungskonflikteXML } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';

const DATEI = 'markierungskonflikte.xml';

/** Gespeicherte Konflikte je Schlüssel, gelesen aus dem angegebenen Gesetzesblock. */
function gespeichert(gesetzKonflikte: [string, string][]) {
  return new Map(
    gesetzKonflikte.map(([schluessel, roh]) => {
      const [konflikte] = liesMarkierungskonflikteXML(
        `<markierungskonflikte>${roh}</markierungskonflikte>`,
      ).gesetzKonflikte.values();
      if (!konflikte) throw new Error('Gesetzesblock ohne gültige Gesetzesangabe.');
      return [schluessel, konflikte];
    }),
  );
}

/** Schreibt den geladenen Bestand unverändert zurück und liefert den Dateiinhalt. */
async function zurueckgeschrieben(): Promise<string> {
  await schreibeGesetzKonflikte((await ladePruefstand()).gesetzKonflikte);
  return appDatenSpeicher.get(DATEI) ?? '';
}

beforeEach(() => {
  appDatenSpeicher.clear();
  vi.clearAllMocks();
  emitTo.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// ladePruefstand: Blöcke
// ---------------------------------------------------------------------------

describe('ladePruefstand: Blöcke', () => {
  it('Datei existiert noch nicht -> leere Map statt Wurf', async () => {
    expect((await ladePruefstand()).gesetzKonflikte).toEqual(new Map());
  });

  it('zerlegt mehrere <gesetz>-Blöcke roh, indiziert nach unescaptem kurztitel-Attribut', async () => {
    appDatenSpeicher.set(
      DATEI,
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<markierungskonflikte>',
        '    <gesetz kurztitel="BGB" normgeber="de-bund">',
        '        <konflikt typ="gesetz-fehlt" />',
        '    </gesetz>',
        '    <gesetz kurztitel="StGB" normgeber="de-bund">',
        '        <konflikt typ="nichtamtliche-titel-xml-fehlt" />',
        '    </gesetz>',
        '</markierungskonflikte>',
      ].join('\n'),
    );
    const gesetzKonflikte = (await ladePruefstand()).gesetzKonflikte;
    expect([...gesetzKonflikte.keys()]).toEqual([
      gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' })),
      gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'StGB' })),
    ]);
    // ACHTUNG: das führende Einrückungs-Whitespace VOR "<gesetz" gehört nicht
    // zum geparsten Block (das Regex in ladePruefstand matcht erst ab
    // "<gesetz", siehe dort) – wird beim Zurückschreiben über
    // schreibeGesetzKonflikte() daher auch nicht erneut vorangestellt.
    expect(await zurueckgeschrieben()).toContain(
      [
        '>\n<gesetz kurztitel="BGB" normgeber="de-bund">',
        '        <konflikt typ="gesetz-fehlt" />',
        '    </gesetz>\n',
      ].join('\n'),
    );
  });

  it('unescaped ein XML-kodiertes kurztitel-Attribut (z.B. "&") beim Indizieren', async () => {
    appDatenSpeicher.set(
      DATEI,
      [
        '<markierungskonflikte>',
        '    <gesetz kurztitel="A &amp; B" normgeber="de-bund">',
        '        <konflikt typ="gesetz-fehlt" />',
        '    </gesetz>',
        '</markierungskonflikte>',
      ].join('\n'),
    );
    const gesetzKonflikte = (await ladePruefstand()).gesetzKonflikte;
    expect([...gesetzKonflikte.keys()]).toEqual([
      gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'A & B' })),
    ]);
  });

  it('Inhalt außerhalb von <gesetz>-Tags (XML-Deklaration, Root-Wurzel) wird ignoriert, nicht Teil eines Blocks', async () => {
    appDatenSpeicher.set(
      DATEI,
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<markierungskonflikte>',
        '    <gesetz kurztitel="BGB" normgeber="de-bund">',
        '        <konflikt typ="gesetz-fehlt" />',
        '    </gesetz>',
        '</markierungskonflikte>',
      ].join('\n'),
    );
    const xml = await zurueckgeschrieben();
    expect(xml.split('<?xml')).toHaveLength(2);
    expect(xml.split('<markierungskonflikte')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// schreibeGesetzKonflikte
// ---------------------------------------------------------------------------

describe('schreibeGesetzKonflikte', () => {
  it('leere Map bleibt mit Prüfstatus dauerhaft vorhanden', async () => {
    appDatenSpeicher.set(DATEI, 'alter Inhalt');
    await schreibeGesetzKonflikte(new Map());
    expect(appDatenLoeschen).not.toHaveBeenCalled();
    expect(appDatenSchreiben).toHaveBeenCalledOnce();
    expect(appDatenSpeicher.get(DATEI)).toContain('pruefstatus="ausstehend"');
  });

  it('schreibt auch den ersten leeren Prüfstand dauerhaft', async () => {
    await expect(schreibeGesetzKonflikte(new Map())).resolves.toBeUndefined();
    expect(appDatenSpeicher.get(DATEI)).toContain('pruefstatus="ausstehend"');
  });

  it('nicht-leere Map -> schreibt XML-Deklaration + Root-Wrapper um die (sortierten) Roh-Blöcke', async () => {
    await schreibeGesetzKonflikte(
      gespeichert([['BGB', '    <gesetz kurztitel="BGB" normgeber="de-bund">X</gesetz>']]),
    );
    const geschrieben = appDatenSpeicher.get(DATEI)!;
    expect(() => pruefeXmlWohlgeformtheit(geschrieben)).not.toThrow();
    expect(geschrieben).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(geschrieben).toContain('<markierungskonflikte version="1" pruefstatus="ausstehend">');
    expect(geschrieben).toContain('</markierungskonflikte>');
    expect(geschrieben).toContain('<gesetz kurztitel="BGB" normgeber="de-bund">X</gesetz>');
  });

  it('sortiert die Blöcke nach Kurztitel (deutsches Locale, z.B. Umlaute vor Z einordnend)', async () => {
    await schreibeGesetzKonflikte(
      gespeichert([
        [
          gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'ZPO' })),
          '<gesetz kurztitel="ZPO" normgeber="de-bund">z</gesetz>',
        ],
        [
          gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'ÖPNV-Gesetz' })),
          '<gesetz kurztitel="ÖPNV-Gesetz" normgeber="de-bund">o</gesetz>',
        ],
        [
          gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' })),
          '<gesetz kurztitel="BGB" normgeber="de-bund">b</gesetz>',
        ],
      ]),
    );
    const geschrieben = appDatenSpeicher.get(DATEI)!;
    const posBGB = geschrieben.indexOf('kurztitel="BGB"');
    const posOePNV = geschrieben.indexOf('kurztitel="ÖPNV-Gesetz"');
    const posZPO = geschrieben.indexOf('kurztitel="ZPO"');
    expect(posBGB).toBeLessThan(posOePNV);
    expect(posOePNV).toBeLessThan(posZPO);
  });

  it('emitTo(Any, markierungskonflikte-geaendert) wird bei leerem und gefülltem Prüfstand ausgelöst', async () => {
    await schreibeGesetzKonflikte(new Map());
    expect(emitTo).toHaveBeenCalledWith({ kind: 'Any' }, 'markierungskonflikte-geaendert', {
      pruefstatus: 'ausstehend',
    });
    emitTo.mockClear();
    await schreibeGesetzKonflikte(
      gespeichert([
        [
          gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' })),
          '<gesetz kurztitel="BGB" normgeber="de-bund">x</gesetz>',
        ],
      ]),
    );
    expect(emitTo).toHaveBeenCalledWith({ kind: 'Any' }, 'markierungskonflikte-geaendert', {
      pruefstatus: 'ausstehend',
    });
  });

  it('Round-Trip: schreibeGesetzKonflikte gefolgt von ladePruefstand liefert dieselben Blöcke zurück', async () => {
    const original = gespeichert([
      [
        gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' })),
        '<gesetz kurztitel="BGB" normgeber="de-bund">\n        <konflikt typ="gesetz-fehlt" />\n    </gesetz>',
      ],
      [
        gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'StGB' })),
        '<gesetz kurztitel="StGB" normgeber="de-bund">\n        <konflikt typ="nichtamtliche-titel-xml-fehlt" />\n    </gesetz>',
      ],
    ]);
    await schreibeGesetzKonflikte(original);
    const geladen = (await ladePruefstand()).gesetzKonflikte;
    expect(geladen).toEqual(original);
  });
});

describe('Fehler beim Abschließen', () => {
  it('gibt auch bei leerem Ergebnis echte Schreibfehler weiter und erhält das Original', async () => {
    appDatenSpeicher.set(DATEI, 'alt');
    const fehler = new Error('Keine Rechte');
    vi.mocked(appDatenSchreiben).mockRejectedValueOnce(fehler);
    await expect(schreibeGesetzKonflikte(new Map())).rejects.toBe(fehler);
    expect(emitTo).not.toHaveBeenCalled();
    expect(appDatenSpeicher.get(DATEI)).toBe('alt');
  });
  it('protokolliert Benachrichtigungsfehler nach erfolgreichem Schreiben', async () => {
    const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
    emitTo.mockRejectedValueOnce(new Error('Fenster nicht erreichbar'));
    await expect(
      schreibeGesetzKonflikte(
        gespeichert([
          [
            gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' })),
            '<gesetz kurztitel="BGB" normgeber="de-bund"/>',
          ],
        ]),
      ),
    ).resolves.toBeUndefined();
    expect(appDatenSpeicher.get(DATEI)).toContain('BGB');
    expect(protokoll).toHaveBeenCalled();
    protokoll.mockRestore();
  });
});

it('protokolliert auch einen fehlgeschlagenen dynamischen Benachrichtigungsimport nach dem Speichern', async () => {
  vi.resetModules();
  vi.doMock('@tauri-apps/api/event', () => {
    throw new Error('Import fehlgeschlagen');
  });
  const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const modul = await import('./markierungskonflikteSpeicher.dateiZugriff');
    // Nach resetModules gehören gespeicherte Werte zum neu geladenen Modulstand.
    const xml = await import('@/lib/markierungen/markierungs-xml/markierungs-xml.index');
    const gesetzKonflikte = xml.liesMarkierungskonflikteXML(
      '<markierungskonflikte><gesetz kurztitel="BGB" normgeber="de-bund"/></markierungskonflikte>',
    ).gesetzKonflikte;
    await expect(modul.schreibeGesetzKonflikte(gesetzKonflikte)).resolves.toBeUndefined();
    expect(appDatenSpeicher.get(DATEI)).toContain('BGB');
    expect(protokoll).toHaveBeenCalled();
  } finally {
    vi.doMock('@tauri-apps/api/event', () => ({ emitTo: (...args: unknown[]) => emitTo(...args) }));
    vi.resetModules();
    protokoll.mockRestore();
  }
});

it('liest direkte Gesetzblöcke mit beliebiger Attributreihenfolge und ohne Kommentare', async () => {
  appDatenSpeicher.set(
    DATEI,
    `<markierungskonflikte extra='x'><gesetz extra='x' kurztitel = 'BGB' normgeber='de-bund'><neu /></gesetz><neu><gesetz kurztitel='X' normgeber="de-bund"/></neu><!-- <gesetz kurztitel='Y' normgeber="de-bund"/> --></markierungskonflikte>`,
  );
  const gesetzKonflikte = (await ladePruefstand()).gesetzKonflikte;
  expect([...gesetzKonflikte.keys()]).toEqual([
    gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' })),
  ]);
  expect(await zurueckgeschrieben()).toContain('<neu');
});
it('gibt für beschädigte Konfliktdateien keinen leeren Bestand zurück', async () => {
  appDatenSpeicher.set(DATEI, '<markierungskonflikte><gesetz></markierungskonflikte>');
  await expect(ladePruefstand()).rejects.toThrow('Datei ungültig');
});

it('sortiert auch volle Referenzschlüssel nach dem angezeigten Kurztitel', async () => {
  await schreibeGesetzKonflikte(
    gespeichert([
      [
        gesetzesreferenzSchluessel({ kurztitel: 'ZPO', normgeber: 'de-bund' }),
        '<gesetz kurztitel="ZPO" normgeber="de-bund"/>',
      ],
      [
        gesetzesreferenzSchluessel({ kurztitel: 'BGB', normgeber: 'de-bw' }),
        '<gesetz kurztitel="BGB" normgeber="de-bund"/>',
      ],
    ]),
  );
  const xml = appDatenSpeicher.get(DATEI)!;
  expect(xml.indexOf('kurztitel="BGB"')).toBeLessThan(xml.indexOf('kurztitel="ZPO"'));
});

describe('vollständige Gesetzesidentität und echte Lesefehler', () => {
  it('erhält Normgeber, unbekannte Kinder und unbekannten Normgeber auch nach Blockentfernung', async () => {
    const original = gespeichert([
      [
        gesetzesreferenzSchluessel({ kurztitel: 'A & B', normgeber: 'de-bund' }),
        '<gesetz normgeber="de-bund" kurztitel="A &amp; B"><neu wert="x" /></gesetz>',
      ],
      [
        gesetzesreferenzSchluessel({ kurztitel: 'A & B', normgeber: 'de-bw' }),
        '<gesetz kurztitel="A &amp; B" normgeber="de-bw"><neu /></gesetz>',
      ],
      [
        gesetzesreferenzSchluessel({ kurztitel: 'A & B', normgeber: 'unbekannt' }),
        '<gesetz kurztitel="A &amp; B" normgeber="unbekannt" />',
      ],
    ]);
    await schreibeGesetzKonflikte(original);
    const geladen = (await ladePruefstand()).gesetzKonflikte;
    expect(geladen).toEqual(original);
    geladen.delete(gesetzesreferenzSchluessel({ kurztitel: 'A & B', normgeber: 'de-bund' }));
    await schreibeGesetzKonflikte(geladen);
    expect((await ladePruefstand()).gesetzKonflikte).toEqual(new Map([...original].slice(1)));
  });

  it('gibt Lesefehler vorhandener Dateien weiter und erhält das Original', async () => {
    appDatenSpeicher.set(DATEI, 'Original');
    const fehler = new Error('Keine Leserechte');
    vi.mocked(appDatenLesen).mockRejectedValueOnce(fehler);
    await expect(ladePruefstand()).rejects.toBe(fehler);
    expect(appDatenSpeicher.get(DATEI)).toBe('Original');
    expect(appDatenSchreiben).not.toHaveBeenCalled();
    expect(appDatenLoeschen).not.toHaveBeenCalled();
  });

  it('gibt einen gescheiterten Existenzcheck weiter', async () => {
    const fehler = new Error('Existenz nicht feststellbar');
    vi.mocked(appDatenExistiert).mockRejectedValueOnce(fehler);
    await expect(ladePruefstand()).rejects.toBe(fehler);
  });
});

describe('benannter Prüfstand', () => {
  it('benennt fehlende Datei als Vollbedarf statt Konfliktfreiheit', async () => {
    const stand = await ladePruefstand();
    expect(stand.pruefstatus).toBeNull();
    expect(stand.vollpruefungErforderlich).toBe(true);
    expect(stand.gesetzKonflikte.size).toBe(0);
  });

  it.each(['aktuell', 'ausstehend', 'fehlgeschlagen'] as const)(
    'liest Status %s und bewahrt ihn zusammen mit den Befunden atomar',
    async (pruefstatus) => {
      const gesetzKonflikte = gespeichert([
        [
          'BGB',
          '<gesetz kurztitel="BGB" normgeber="de-bund"><konflikt typ="gesetz-fehlt" /></gesetz>',
        ],
      ]);
      await schreibeGesetzKonflikte(gesetzKonflikte, 'token', { pruefstatus });
      expect(appDatenSchreiben).toHaveBeenCalledExactlyOnceWith(
        DATEI,
        expect.stringContaining(`pruefstatus="${pruefstatus}"`),
        'token',
      );
      const stand = await ladePruefstand();
      expect(stand.pruefstatus).toBe(pruefstatus);
      expect(stand.vollpruefungErforderlich).toBe(pruefstatus !== 'aktuell');
      expect(
        stand.gesetzKonflikte.get(
          gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'BGB' })),
        )?.fehlendesGesetz,
      ).toBe(true);
    },
  );

  it.each(['', 'pruefstatus="unbekannt"', 'pruefstatus=""', 'pruefstatus="Aktuell"'])(
    'behält bei altem oder unbekanntem Status %s den Bestand und verlangt Vollprüfung',
    async (attribut) => {
      appDatenSpeicher.set(
        DATEI,
        `<markierungskonflikte version="1" ${attribut}><gesetz kurztitel="BGB" normgeber="de-bund"/></markierungskonflikte>`,
      );
      const stand = await ladePruefstand();
      expect(stand.pruefstatus).toBeNull();
      expect(stand.vollpruefungErforderlich).toBe(true);
      expect(stand.gesetzKonflikte.size).toBe(1);
      expect(appDatenSchreiben).not.toHaveBeenCalled();
    },
  );

  it('erhält unbekannte Wurzelattribute und Kinder auch bei vollständig leerem Befundbestand', async () => {
    appDatenSpeicher.set(
      DATEI,
      '<markierungskonflikte version="1" pruefstatus="fehlgeschlagen" extra="A &amp; B"><neu><gesetz kurztitel="X" normgeber="de-bund"/></neu><gesetz kurztitel="BGB" normgeber="de-bund"><neu/></gesetz></markierungskonflikte>',
    );
    const stand = await ladePruefstand();
    stand.gesetzKonflikte.clear();
    await schreibeGesetzKonflikte(stand.gesetzKonflikte, 'token', {
      pruefstatus: 'fehlgeschlagen',
      erweiterungen: stand.erweiterungen,
    });
    const xml = appDatenSpeicher.get(DATEI)!;
    expect(() => pruefeXmlWohlgeformtheit(xml)).not.toThrow();
    expect(xml).toContain('extra="A &amp; B"');
    expect(xml).toMatch(/<neu><gesetz kurztitel="X" normgeber="de-bund"\s*\/><\/neu>/);
    expect((await ladePruefstand()).gesetzKonflikte.size).toBe(0);
  });

  it('eine statuslose Datei wird durch Teilbefunde nicht als aktuell gekennzeichnet', async () => {
    appDatenSpeicher.set(
      DATEI,
      '<markierungskonflikte><gesetz kurztitel="BGB" normgeber="de-bund"/></markierungskonflikte>',
    );
    const stand = await ladePruefstand();
    await schreibeGesetzKonflikte(stand.gesetzKonflikte);
    expect((await ladePruefstand()).pruefstatus).toBe('ausstehend');
    expect((await ladePruefstand()).vollpruefungErforderlich).toBe(true);
  });
});

const nativeInvoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke: nativeInvoke }));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: vi.fn(),
}));
vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  appDatenLesen: (pfad: string) => appDatenLesen(pfad),
  appDatenExistiert: (pfad: string) => appDatenExistiert(pfad),
}));

describe('geschützter Konfliktdateilader mit realer Sicherungsbrücke', () => {
  beforeEach(() => {
    nativeInvoke.mockReset();
    nativeInvoke.mockImplementation(async (befehl: string) => {
      if (befehl === 'archiviere_beschaedigte_datei') {
        appDatenSpeicher.delete(DATEI);
        return { status: 'archiviert', sicherungspfad: 'sicherung.xml' };
      }
      return { offeneQuellen: 0, offenePruefungen: 0, vollbedarf: true };
    });
  });

  it.each([
    '<markierungskonflikte>',
    '<fremd/>',
    '<markierungskonflikte><gesetz kurztitel="BGB" normgeber="Bund"/></markierungskonflikte>', // normgeber-negativ: alter Normgeber des Ausgangsgesetzes.
    '<markierungskonflikte><gesetz kurztitel="BGB" normgeber="de-bund"><verweismarkierung><bezeichnung>§ 1</bezeichnung><verweistext>x</verweistext><konflikt typ="ziel-gesetz-fehlt" gesetz="GG" normgeber="Bund" /></verweismarkierung></gesetz></markierungskonflikte>', // normgeber-negativ: alter Normgeber eines Zielgesetzes.
  ])(
    'benennt gelesenen beschädigten Inhalt %s und archiviert mit genauem Token',
    async (inhalt) => {
      appDatenSpeicher.set(DATEI, inhalt);
      await expect(ladePruefstand()).rejects.toMatchObject({
        name: 'BeschaedigteKonfliktdatei',
        inhalt,
      });
      const stand = await ladePruefstand('konflikt-token');
      expect(stand.pruefstatus).toBe('ausstehend');
      expect(stand.vollpruefungErforderlich).toBe(true);
      expect(nativeInvoke).toHaveBeenNthCalledWith(1, 'archiviere_beschaedigte_datei', {
        relativerPfad: DATEI,
        erwarteterInhalt: inhalt,
        token: 'konflikt-token',
      });
      expect(nativeInvoke).toHaveBeenNthCalledWith(2, 'pruefvorgang_vollbedarf', {
        konfliktToken: 'konflikt-token',
        vorgaenge: [],
      });
      expect(appDatenSpeicher.get(DATEI)).toContain('pruefstatus="ausstehend"');
    },
  );

  it.each(['', '   '])('erhält leeren Inhalt und bricht ohne Archivierung ab', async (inhalt) => {
    appDatenSpeicher.set(DATEI, inhalt);
    await expect(ladePruefstand('token')).rejects.toMatchObject({
      name: 'BeschaedigteKonfliktdatei',
    });
    expect(nativeInvoke).not.toHaveBeenCalled();
    expect(appDatenSchreiben).not.toHaveBeenCalled();
    expect(appDatenSpeicher.get(DATEI)).toBe(inhalt);
  });

  it.each(['version="99"', 'pruefstatus="fremd"', 'extra="neu"'])(
    'archiviert gültige Wurzel mit %s nicht',
    async (attribute) => {
      appDatenSpeicher.set(
        DATEI,
        `<markierungskonflikte ${attribute}><neu/></markierungskonflikte>`,
      );
      expect((await ladePruefstand('token')).erweiterungen.kinder).toHaveLength(1);
      expect(nativeInvoke).not.toHaveBeenCalled();
      expect(appDatenSchreiben).not.toHaveBeenCalled();
    },
  );

  it('verwendet tatsächlich neu gelesenen reparierten Inhalt', async () => {
    appDatenSpeicher.set(DATEI, '<fremd/>');
    nativeInvoke.mockImplementationOnce(async () => {
      appDatenSpeicher.set(
        DATEI,
        '<markierungskonflikte pruefstatus="aktuell" neu="ja"><gesetz kurztitel="StGB" normgeber="de-bund"/></markierungskonflikte>',
      );
      return { status: 'veraendert', sicherungspfad: null };
    });
    const stand = await ladePruefstand('token');
    expect(stand.pruefstatus).toBe('aktuell');
    expect(
      stand.gesetzKonflikte.has(
        gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: 'StGB' })),
      ),
    ).toBe(true);
    expect(stand.erweiterungen.attribute).toEqual([['neu', 'ja']]);
    expect(nativeInvoke).toHaveBeenCalledOnce();
    expect(appDatenSchreiben).not.toHaveBeenCalled();
  });

  it('überschreibt ein gesichertes aber nicht entferntes Original nicht', async () => {
    appDatenSpeicher.set(DATEI, '<fremd/>');
    nativeInvoke.mockResolvedValueOnce({
      status: 'gesichert_aber_nicht_entfernt',
      sicherungspfad: 'sicherung.xml',
    });
    await expect(ladePruefstand('token')).rejects.toThrow('Original');
    expect(appDatenSpeicher.get(DATEI)).toBe('<fremd/>');
    expect(appDatenSchreiben).not.toHaveBeenCalled();
  });

  it('erhält Original bei Sicherungsfehler und echte Lese-/Existenzfehler ohne Archivierung', async () => {
    appDatenSpeicher.set(DATEI, '<fremd/>');
    const fehler = new Error('Sicherung unmöglich');
    nativeInvoke.mockRejectedValueOnce(fehler);
    await expect(ladePruefstand('token')).rejects.toBe(fehler);
    expect(appDatenSpeicher.get(DATEI)).toBe('<fremd/>');
    nativeInvoke.mockClear();
    vi.mocked(appDatenLesen).mockRejectedValueOnce(fehler);
    await expect(ladePruefstand('token')).rejects.toBe(fehler);
    expect(nativeInvoke).not.toHaveBeenCalled();
    vi.mocked(appDatenLesen).mockRejectedValueOnce(fehler);
    vi.mocked(appDatenExistiert).mockRejectedValueOnce(fehler);
    await expect(ladePruefstand('token')).rejects.toBe(fehler);
    expect(nativeInvoke).not.toHaveBeenCalled();
  });

  it('verlangt bei tatsächlich fehlender Datei Vollprüfung ohne Sicherung oder leeren Erfolgsstand', async () => {
    const stand = await ladePruefstand('token');
    expect(stand.pruefstatus).toBeNull();
    expect(nativeInvoke).toHaveBeenCalledExactlyOnceWith('pruefvorgang_vollbedarf', {
      konfliktToken: 'token',
      vorgaenge: [],
    });
    expect(appDatenSchreiben).not.toHaveBeenCalled();
  });

  it('behält die Wiederholungsgrenze bei erneut verändertem beschädigten Inhalt', async () => {
    appDatenSpeicher.set(DATEI, '<fremd/>');
    nativeInvoke.mockResolvedValue({ status: 'veraendert', sicherungspfad: null });
    await expect(ladePruefstand('token')).rejects.toThrow('dreimal verändert');
    expect(nativeInvoke).toHaveBeenCalledTimes(3);
    expect(appDatenSpeicher.get(DATEI)).toBe('<fremd/>');
    expect(appDatenSchreiben).not.toHaveBeenCalled();
  });

  it('bricht auch bei inzwischen leerem Inhalt ab ohne Ersatzdatei', async () => {
    appDatenSpeicher.set(DATEI, '<fremd/>');
    nativeInvoke.mockImplementationOnce(async () => {
      appDatenSpeicher.set(DATEI, '');
      return { status: 'veraendert', sicherungspfad: null };
    });
    await expect(ladePruefstand('token')).rejects.toMatchObject({
      name: 'BeschaedigteKonfliktdatei',
    });
    expect(nativeInvoke).toHaveBeenCalledOnce();
    expect(appDatenSpeicher.get(DATEI)).toBe('');
    expect(appDatenSchreiben).not.toHaveBeenCalled();
  });

  it('behandelt eine inzwischen fehlende Datei als Vollbedarf ohne Archivierungsstatus', async () => {
    appDatenSpeicher.set(DATEI, '<fremd/>');
    nativeInvoke.mockImplementationOnce(async () => {
      appDatenSpeicher.delete(DATEI);
      return { status: 'fehlt', sicherungspfad: null };
    });
    expect((await ladePruefstand('token')).pruefstatus).toBeNull();
    expect(nativeInvoke).toHaveBeenCalledTimes(2);
    expect(appDatenSchreiben).not.toHaveBeenCalled();
  });

  it('lässt nach Archivierung und fehlgeschlagenem Statusschreiben die Datei fehlend', async () => {
    appDatenSpeicher.set(DATEI, '<fremd/>');
    const fehler = new Error('Statusschreiben unmöglich');
    vi.mocked(appDatenSchreiben).mockRejectedValueOnce(fehler);
    await expect(ladePruefstand('token')).rejects.toBe(fehler);
    expect(appDatenSpeicher.has(DATEI)).toBe(false);
    expect((await ladePruefstand()).pruefstatus).toBeNull();
  });
});
