// lesezeichenSpeicher.test.ts
//
// Erste Testrunde für diesen Speicher. Mockt appDatenZugriff über eine
// In-Memory-Map (Pfad -> Inhalt), analog zum bestehenden Muster in
// gesetzeskurzbefehlSpeicher.test.ts / favoritenSpeicher.test.ts.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { pruefeXmlWohlgeformtheit } from '@/test/plattform/xmlPruefung';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
import * as kern from '@/lib/persistenz/kern/kern.index';
import { erzeugeSperreAttrappe } from '@/test/plattform/dateiSperreAttrappe';
const sperreAttrappe = erzeugeSperreAttrappe();
const sperreMock = vi.fn(sperreAttrappe);

const appDatenSpeicher = new Map<string, string>();
const appDatenLesenGeschuetzt =
  vi.fn<(pfad: string, wurzelTag: string, token?: string) => Promise<string | null>>();

// Externe Datei- und native Archivierungsgrenzen für den echten Bereinigungsweg.
vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  appDatenLesen: async (pfad: string) => appDatenSpeicher.get(pfad) ?? '',
  appDatenExistiert: async (pfad: string) => appDatenSpeicher.has(pfad),
  appDatenLesenOhneHinweis: async (pfad: string) => appDatenSpeicher.get(pfad) ?? '',
  appDatenSchreiben: async (pfad: string, inhalt: string) => {
    appDatenSpeicher.set(pfad, inhalt);
  },
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (befehl: string, args: { relativerPfad: string; erwarteterInhalt: string }) => {
    if (befehl === 'datei_sperre_erwerben') return args.relativerPfad;
    if (befehl === 'datei_sperre_freigeben') return;
    if (befehl !== 'archiviere_beschaedigte_datei') throw new Error(befehl);
    appDatenSpeicher.set(args.relativerPfad + '.bak', args.erwarteterInhalt);
    appDatenSpeicher.delete(args.relativerPfad);
    return { status: 'archiviert', sicherungspfad: args.relativerPfad + '.bak' };
  },
}));
vi.mock('@/lib/persistenz/kern/kern.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/kern/kern.index')>()),
  meldePersistenzBefund: vi.fn(),
  mitDateiSperre: (...args: Parameters<typeof sperreAttrappe>) => sperreMock(...args),
  appDatenLesenGeschuetzt: (...args: [string, string, string?]) => appDatenLesenGeschuetzt(...args),
  appDatenLesenOderNull: vi.fn((pfad: string) =>
    Promise.resolve(appDatenSpeicher.get(pfad) ?? null),
  ),
  nutzerdatenSchreiben: vi.fn((pfad: string, inhalt: string) => {
    appDatenSpeicher.set(pfad, inhalt);
    return Promise.resolve();
  }),
  appDatenLoeschen: vi.fn((pfad: string) => {
    appDatenSpeicher.delete(pfad);
    return Promise.resolve();
  }),
}));

import {
  umschaltenLesezeichen,
  ladeLesezeichen,
  hinzufuegenLesezeichen,
  leseLesezeichenRohtext,
  ersetzeLesezeichenDatei,
  zusammenfuehrenLesezeichen,
  loescheAlleLesezeichen,
} from './lesezeichenSpeicher';
import type { Lesezeichen } from './lesezeichenSpeicher';

vi.mock('@tauri-apps/api/event', () => ({ emitTo: vi.fn(async () => undefined) }));
const DATEINAME = 'lesezeichen/lesezeichen.xml';

beforeEach(() => {
  appDatenSpeicher.clear();
  sperreMock.mockClear();
  vi.mocked(kern.appDatenLoeschen).mockClear();
  vi.mocked(kern.nutzerdatenSchreiben).mockClear();
  appDatenLesenGeschuetzt.mockReset();
  appDatenLesenGeschuetzt.mockImplementation((pfad) =>
    Promise.resolve(appDatenSpeicher.get(pfad) ?? null),
  );
});

// ---------------------------------------------------------------------------
// DATEINAME
// ---------------------------------------------------------------------------

describe('DATEINAME', () => {
  it('schreibt im Lesezeichenordner unter dem Dateinamen "lesezeichen/lesezeichen.xml" (Persistenz-Vertrag)', async () => {
    await umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    expect([...appDatenSpeicher.keys()]).toEqual(['lesezeichen/lesezeichen.xml']);
  });
});

// ---------------------------------------------------------------------------
// umschaltenLesezeichen
// ---------------------------------------------------------------------------

describe('umschaltenLesezeichen', () => {
  it('schreibt version="1" am Wurzel-Tag', async () => {
    await umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    expect(appDatenSpeicher.get(DATEINAME)).toContain('<lesezeichen version="1">');
  });
  it('fügt ein noch nicht vorhandenes Lesezeichen hinzu und liefert true', async () => {
    const ergebnis = await umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    expect(ergebnis).toBe(true);
    expect(await ladeLesezeichen()).toEqual([
      { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), bezeichnung: '433' },
    ]);
  });

  it('entfernt ein bereits vorhandenes Lesezeichen wieder und liefert false', async () => {
    await umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    const ergebnis = await umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    expect(ergebnis).toBe(false);
    expect(await ladeLesezeichen()).toEqual([]);
  });

  it('MUTATIONSTEST: unterscheidet Einträge anhand BEIDER Felder (Gesetz UND Bezeichnung) – gleiche Bezeichnung, anderes Gesetz ist ein eigener Eintrag', async () => {
    await umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    const ergebnis = await umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'ZPO' }), '433');
    expect(ergebnis).toBe(true);
    expect(await ladeLesezeichen()).toEqual(
      expect.arrayContaining([
        { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), bezeichnung: '433' },
        { gesetz: gesetzesreferenz({ kurztitel: 'ZPO' }), bezeichnung: '433' },
      ]),
    );
  });

  it('MUTATIONSTEST: löscht die Datei vollständig, wenn das letzte Lesezeichen entfernt wird', async () => {
    await umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    await umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    expect(appDatenSpeicher.has(DATEINAME)).toBe(false);
  });

  it('MUTATIONSTEST: schreibt die Datei weiterhin, wenn nach dem Entfernen noch Einträge übrig sind', async () => {
    await umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    await umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '1');
    await umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    expect(appDatenSpeicher.has(DATEINAME)).toBe(true);
    expect(await ladeLesezeichen()).toEqual([
      { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), bezeichnung: '1' },
    ]);
  });

  it('sortiert zuerst nach Gesetz (alphabetisch), dann nach Bezeichnung (numerisch)', async () => {
    await umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'ZPO' }), '1');
    await umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    await umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '1');
    expect(await ladeLesezeichen()).toEqual([
      { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), bezeichnung: '1' },
      { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), bezeichnung: '433' },
      { gesetz: gesetzesreferenz({ kurztitel: 'ZPO' }), bezeichnung: '1' },
    ]);
  });

  it('MUTATIONSTEST: wenn die Datei "von außen" bereits verschwunden ist, gilt das Lesezeichen als nicht vorhanden – ein erneutes Umschalten fügt es also hinzu (kein Fehler)', async () => {
    // Nach dem Löschen "von außen" liest ladeEintraege() nichts mehr (Datei
    // nicht gefunden -> []), das Lesezeichen gilt also als NICHT vorhanden.
    // umschaltenLesezeichen nimmt in diesem Fall den "Hinzufügen"-Zweig statt
    // zu versuchen, eine bereits verschwundene Datei zu löschen.
    await umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    appDatenSpeicher.delete(DATEINAME);
    await expect(
      umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '433'),
    ).resolves.toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ladeLesezeichen
// ---------------------------------------------------------------------------

describe('ladeLesezeichen', () => {
  it('liefert bei null vom geschützten Lader eine leere Liste', async () => {
    expect(await ladeLesezeichen()).toEqual([]);
    expect(appDatenLesenGeschuetzt).toHaveBeenCalledWith(DATEINAME, 'lesezeichen', undefined);
  });

  it('propagiert einen Fehler des geschützten Laders', async () => {
    const fehler = new Error('Datei nicht lesbar');
    appDatenLesenGeschuetzt.mockRejectedValueOnce(fehler);

    await expect(ladeLesezeichen()).rejects.toThrow(fehler);
  });
});

// ---------------------------------------------------------------------------
// hinzufuegenLesezeichen
// ---------------------------------------------------------------------------

describe('hinzufuegenLesezeichen', () => {
  it('fügt mehrere neue Lesezeichen sortiert hinzu', async () => {
    await hinzufuegenLesezeichen([
      { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), bezeichnung: '433' },
      { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), bezeichnung: '1' },
    ]);
    expect(await ladeLesezeichen()).toEqual([
      { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), bezeichnung: '1' },
      { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), bezeichnung: '433' },
    ]);
  });

  it('MUTATIONSTEST: überspringt bereits vorhandene Einträge (gleiches Gesetz + gleiche Bezeichnung), kein Toggle', async () => {
    await umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    await hinzufuegenLesezeichen([
      { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), bezeichnung: '433' },
    ]);
    expect(await ladeLesezeichen()).toEqual([
      { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), bezeichnung: '433' },
    ]);
  });

  it('MUTATIONSTEST: schreibt NICHT, wenn alle übergebenen Einträge bereits vorhanden sind', async () => {
    await umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    const { nutzerdatenSchreiben } = await import('@/lib/persistenz/kern/kern.index');
    (nutzerdatenSchreiben as ReturnType<typeof vi.fn>).mockClear();

    await hinzufuegenLesezeichen([
      { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), bezeichnung: '433' },
    ]);

    expect(nutzerdatenSchreiben).not.toHaveBeenCalled();
  });

  it('property: nach hinzufuegenLesezeichen sind alle übergebenen Einträge enthalten, unabhängig vom vorherigen Bestand', async () => {
    const lesezeichenArb = fc.record({
      gesetz: fc
        .constantFrom('BGB', 'ZPO', 'EGBGB')
        .map((kurztitel) => gesetzesreferenz({ kurztitel })),
      bezeichnung: fc.integer({ min: 1, max: 999 }).map(String),
    });

    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(lesezeichenArb, {
          selector: (l) => `${l.gesetz.kurztitel}/${l.bezeichnung}`,
          maxLength: 6,
        }),
        fc.uniqueArray(lesezeichenArb, {
          selector: (l) => `${l.gesetz.kurztitel}/${l.bezeichnung}`,
          maxLength: 6,
        }),
        async (bestehend: Lesezeichen[], neue: Lesezeichen[]) => {
          appDatenSpeicher.clear();
          sperreMock.mockClear();
          vi.mocked(kern.appDatenLoeschen).mockClear();
          vi.mocked(kern.nutzerdatenSchreiben).mockClear();
          for (const b of bestehend) {
            await umschaltenLesezeichen(b.gesetz, b.bezeichnung);
          }
          await hinzufuegenLesezeichen(neue);
          const geladen = await ladeLesezeichen();
          for (const n of neue) {
            expect(
              geladen.some(
                (e) => e.gesetz.kurztitel === n.gesetz.kurztitel && e.bezeichnung === n.bezeichnung,
              ),
            ).toBe(true);
          }
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// leseLesezeichenRohtext / ersetzeLesezeichenDatei / loescheAlleLesezeichen
// ---------------------------------------------------------------------------

describe('leseLesezeichenRohtext', () => {
  it('gibt den rohen XML-Text zurück, wenn die Datei existiert', async () => {
    await umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    expect(await leseLesezeichenRohtext()).toContain('<bezeichnung>433</bezeichnung>');
  });

  it('gibt null zurück, wenn keine Datei existiert', async () => {
    expect(await leseLesezeichenRohtext()).toBeNull();
  });
});

describe('ersetzeLesezeichenDatei', () => {
  it('schreibt den übergebenen Inhalt unverändert', async () => {
    await ersetzeLesezeichenDatei('<lesezeichen>ROH</lesezeichen>');
    expect(appDatenSpeicher.get(DATEINAME)).toBe('<lesezeichen>ROH</lesezeichen>');
  });
});

describe('loescheAlleLesezeichen', () => {
  it('entfernt die Datei vollständig', async () => {
    await umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    await loescheAlleLesezeichen();
    expect(appDatenSpeicher.has(DATEINAME)).toBe(false);
  });

  it('MUTATIONSTEST: wirft keinen Fehler, wenn die Datei bereits nicht existiert', async () => {
    await expect(loescheAlleLesezeichen()).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseLesezeichenEintraege
// ---------------------------------------------------------------------------

describe('XML-Formatfälle beim Laden', () => {
  it('extrahiert alle vollständigen <eintrag>-Blöcke', async () => {
    const xml = [
      '<lesezeichen><inhalt>',
      '<eintrag><bezeichnung>433</bezeichnung><gesetz normgeber="de-bund">BGB</gesetz></eintrag>',
      '<eintrag><bezeichnung>1</bezeichnung><gesetz normgeber="de-bund">ZPO</gesetz></eintrag>',
      '</inhalt></lesezeichen>',
    ].join('\n');
    expect(await ladeXML(xml)).toEqual([
      { bezeichnung: '433', gesetz: gesetzesreferenz({ kurztitel: 'BGB' }) },
      { bezeichnung: '1', gesetz: gesetzesreferenz({ kurztitel: 'ZPO' }) },
    ]);
  });

  it('MUTATIONSTEST: trimmt Whitespace um bezeichnung und gesetz', async () => {
    const xml =
      '<lesezeichen><inhalt><eintrag><bezeichnung> 433 </bezeichnung><gesetz normgeber="de-bund"> BGB </gesetz></eintrag></inhalt></lesezeichen>';
    expect(await ladeXML(xml)).toEqual([
      { bezeichnung: '433', gesetz: gesetzesreferenz({ kurztitel: 'BGB' }) },
    ]);
  });

  it('MUTATIONSTEST: überspringt einen Block, dem <bezeichnung> ODER <gesetz normgeber="de-bund"> fehlt, ohne nachfolgende Blöcke mitzureißen', async () => {
    const xml = [
      '<eintrag><gesetz normgeber="de-bund">BGB</gesetz></eintrag>', // bezeichnung fehlt
      '<eintrag><bezeichnung>1</bezeichnung></eintrag>', // gesetz fehlt
      '<eintrag><bezeichnung>2</bezeichnung><gesetz normgeber="de-bund">ZPO</gesetz></eintrag>',
    ].join('');
    expect(await ladeXML(xml)).toEqual([
      { bezeichnung: '2', gesetz: gesetzesreferenz({ kurztitel: 'ZPO' }) },
    ]);
  });

  it('liefert eine leere Liste, wenn keine <eintrag>-Blöcke vorhanden sind', async () => {
    expect(await ladeXML('<lesezeichen><inhalt></inhalt></lesezeichen>')).toEqual([]);
  });
});

it('erhält beide gleichzeitig gestarteten Änderungen', async () => {
  appDatenLesenGeschuetzt.mockImplementation(async (pfad) => {
    const stand = appDatenSpeicher.get(pfad) ?? null;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return stand;
  });
  await Promise.all([
    umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '433'),
    umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '434'),
  ]);
  expect(await ladeLesezeichen()).toEqual([
    { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), bezeichnung: '433' },
    { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), bezeichnung: '434' },
  ]);
});

it.each([
  ['umschalten', () => umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '433'), true],
  [
    'hinzufügen',
    () =>
      hinzufuegenLesezeichen([
        { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), bezeichnung: '433' },
      ]),
    true,
  ],
  ['ersetzen', () => ersetzeLesezeichenDatei('<lesezeichen/>'), false],
  ['löschen', () => loescheAlleLesezeichen(), false],
] as const)(
  'reicht beim %s den Token an alle Dateioperationen weiter',
  async (_name, aktion, liest) => {
    await aktion();
    expect(sperreMock).toHaveBeenCalledExactlyOnceWith(DATEINAME, expect.any(Function));
    if (liest)
      expect(appDatenLesenGeschuetzt).toHaveBeenCalledWith(
        DATEINAME,
        expect.any(String),
        expect.stringMatching(/^test-token-/),
      );
    for (const aufruf of vi.mocked(kern.nutzerdatenSchreiben).mock.calls)
      expect(aufruf[2]).toMatch(/^test-token-/);
    for (const aufruf of vi.mocked(kern.appDatenLoeschen).mock.calls)
      expect(aufruf[1]).toMatch(/^test-token-/);
  },
);

it('reicht Fehler einer tokengebundenen Löschung durch', async () => {
  await umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
  const fehler = new Error('Token ungültig');
  vi.mocked(kern.appDatenLoeschen).mockRejectedValueOnce(fehler);
  await expect(umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '433')).rejects.toBe(
    fehler,
  );
});

it('schreibt wohlgeformtes XML mit UTC-Verarbeitungszeit ohne Millisekunden', async () => {
  await umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
  const xml = appDatenSpeicher.get(DATEINAME)!;
  pruefeXmlWohlgeformtheit(xml);
  expect(xml).toMatch(
    /<verarbeitungszeit>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z<\/verarbeitungszeit>/,
  );
  expect(xml).not.toContain('<geaendert>');
});

it('erhält Sonderzeichen und wörtliche Entities beim Schreiben und Laden', async () => {
  const text = `&<>"' &amp; &lt;`;
  await umschaltenLesezeichen(gesetzesreferenz({ kurztitel: text }), text);
  expect(() => pruefeXmlWohlgeformtheit(appDatenSpeicher.get(DATEINAME)!)).not.toThrow();
  expect(await ladeLesezeichen()).toEqual([
    { gesetz: gesetzesreferenz({ kurztitel: text }), bezeichnung: text },
  ]);
});

async function ladeXML(xml: string) {
  appDatenSpeicher.set(
    DATEINAME,
    xml.startsWith('<lesezeichen') ? xml : `<lesezeichen><inhalt>${xml}</inhalt></lesezeichen>`,
  );
  return ladeLesezeichen();
}

it('liest nur direkte Einträge trotz Erweiterungen und Kommentaren', async () => {
  appDatenSpeicher.set(
    DATEINAME,
    '<lesezeichen version="1"><inhalt><eintrag extra="ja"><bezeichnung x="y">433</bezeichnung><gesetz x="y" normgeber="de-bund">BGB</gesetz><neu/></eintrag><neu><eintrag><bezeichnung>999</bezeichnung><gesetz normgeber="de-bund">X</gesetz></eintrag></neu><!-- <eintrag><bezeichnung>1</bezeichnung><gesetz normgeber="de-bund">X</gesetz></eintrag> --></inhalt></lesezeichen>',
  );
  expect(await ladeLesezeichen()).toEqual([
    { bezeichnung: '433', gesetz: gesetzesreferenz({ kurztitel: 'BGB' }) },
  ]);
});

it('lehnt beschädigte XML vor dem Schreiben ab', async () => {
  await expect(zusammenfuehrenLesezeichen('<lesezeichen><inhalt></lesezeichen>')).rejects.toThrow(
    'Datei ungültig',
  );
  expect(kern.nutzerdatenSchreiben).not.toHaveBeenCalled();
});

// Vollständige Identität wird bereits beim Zusammenführen verglichen.
describe('Gesetzesreferenz', () => {
  it('erkennt vorhandene Referenzen ohne Beachtung der Schreibweise', async () => {
    await umschaltenLesezeichen(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    vi.mocked(kern.nutzerdatenSchreiben).mockClear();
    await hinzufuegenLesezeichen([
      { gesetz: gesetzesreferenz({ kurztitel: 'bgb' }), bezeichnung: '433' },
    ]);
    expect(kern.nutzerdatenSchreiben).not.toHaveBeenCalled();
  });
  it('unterscheidet gleiche Kurztitel verschiedener Normgeber im Modell', async () => {
    await hinzufuegenLesezeichen([
      { gesetz: { kurztitel: 'BGB', normgeber: 'de-bund' }, bezeichnung: '433' },
      { gesetz: { kurztitel: 'BGB', normgeber: 'de-bw' }, bezeichnung: '433' },
    ]);
    const doc = new DOMParser().parseFromString(
      appDatenSpeicher.get(DATEINAME)!,
      'application/xml',
    );
    expect(doc.querySelectorAll('eintrag')).toHaveLength(2);
  });
});

it('erhält namensgleiche Gesetze verschiedener Normgeber im XML-Rundlauf', async () => {
  await hinzufuegenLesezeichen([
    { gesetz: { kurztitel: 'BGB', normgeber: 'de-bund' }, bezeichnung: '433' },
    { gesetz: { kurztitel: 'BGB', normgeber: 'de-bw' }, bezeichnung: '433' },
  ]);
  expect((await ladeLesezeichen()).map((e) => e.gesetz.normgeber)).toEqual(['de-bund', 'de-bw']);
  expect(appDatenSpeicher.get(DATEINAME)).toContain('<gesetz normgeber="de-bund">BGB</gesetz>');
});
it('sichert ungültige Normgeber und toleriert zusätzliche Attribute und Kommentare', async () => {
  appDatenSpeicher.set(
    DATEINAME,
    '<lesezeichen><inhalt><eintrag><bezeichnung>1</bezeichnung><gesetz extra="ja" normgeber="de-bund"><!--neu-->BGB</gesetz></eintrag></inhalt></lesezeichen>',
  );
  expect((await ladeLesezeichen())[0]?.gesetz).toEqual({ kurztitel: 'BGB', normgeber: 'de-bund' });
  appDatenSpeicher.set(DATEINAME, appDatenSpeicher.get(DATEINAME)!.replace('de-bund', 'A_B'));
  expect(await ladeLesezeichen()).toEqual([]);
  expect(appDatenSpeicher.get(DATEINAME + '.bak')).toContain('A_B');
});

it('bereinigt Lesezeichen ohne Normgeber nach Vollsicherung', async () => {
  const melden = vi.spyOn(kern, 'meldePersistenzBefund');
  const xml =
    '<lesezeichen><inhalt><eintrag><bezeichnung>1</bezeichnung><gesetz>BGB</gesetz></eintrag><eintrag><bezeichnung>2</bezeichnung><gesetz normgeber="de-bund">BGB</gesetz></eintrag></inhalt></lesezeichen>';
  appDatenSpeicher.set(DATEINAME, xml);
  expect(await ladeLesezeichen()).toEqual([
    { bezeichnung: '2', gesetz: { kurztitel: 'BGB', normgeber: 'de-bund' } },
  ]);
  expect(appDatenSpeicher.get(DATEINAME + '.bak')).toBe(xml);
  expect(appDatenSpeicher.get(DATEINAME)).not.toBe(xml);
  expect(appDatenSpeicher.get(DATEINAME + '.bak')).toBe(xml);
  melden.mockRestore();
});

// Gezielter Negativfall: alter Normgeberwert im gespeicherten Dokument.
it('sichert und entfernt den alten Normgeber Bund in Lesezeichen', async () => {
  const xml =
    '<lesezeichen><inhalt><eintrag><bezeichnung>1</bezeichnung><gesetz normgeber="Bund">BGB</gesetz></eintrag></inhalt></lesezeichen>'; // normgeber-negativ: gezielte Ablehnung des alten Codeformats.
  appDatenSpeicher.set(DATEINAME, xml);
  expect(await ladeLesezeichen()).toEqual([]);
  expect(appDatenSpeicher.get(DATEINAME)).not.toBe(xml);
  expect(appDatenSpeicher.get(DATEINAME + '.bak')).toBe(xml);
});

it.each(['NFC', 'NFD'] as const)(
  'sortiert Lesezeichen unabhängig von Unicode (%s)',
  async (form) => {
    await hinzufuegenLesezeichen(
      ['ZPO', 'ÄApprO', 'AÜG'].map((kurztitel) => ({
        gesetz: gesetzesreferenz({ kurztitel: kurztitel.normalize(form) }),
        bezeichnung: '1',
      })),
    );
    expect((await ladeLesezeichen()).map((l) => l.gesetz.kurztitel.normalize('NFC'))).toEqual([
      'ÄApprO',
      'AÜG',
      'ZPO',
    ]);
  },
);
