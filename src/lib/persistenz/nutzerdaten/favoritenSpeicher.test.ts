// favoritenSpeicher.test.ts
//
// Erste Testrunde für diesen Speicher. Mockt appDatenZugriff über eine
// In-Memory-Map (Pfad -> Inhalt), analog zum bestehenden Muster in
// gesetzeskurzbefehlSpeicher.test.ts. bezeichnungVergleich/sortiereBezeichnung wird
// bewusst NICHT gemockt – dafür existiert bereits eine eigene Testdatei
// (bezeichnungVergleich.test.ts), hier wird nur das Zusammenspiel geprüft.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { dateiBasis } from '@/lib/persistenz/kern/kern.index';
import { pruefeXmlWohlgeformtheit } from '@/test/plattform/xmlPruefung';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fc from 'fast-check';
const archivierung = vi.fn();
const banner = vi.fn();
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => archivierung(...args) }));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: (...args: unknown[]) => banner(...args),
}));
vi.mock('@/lib/persistenz/kern/dateizugriff/dateizugriff.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  appDatenOrdnerLesen: async (ordner: string) =>
    [...appDatenSpeicher.keys()]
      .filter((pfad) => pfad.startsWith(`${ordner}/`))
      .map((pfad) => ({ name: pfad.slice(ordner.length + 1), isDirectory: false })),
  appDatenExistiert: async (pfad: string) => appDatenSpeicher.has(pfad),
  appDatenLesenOhneHinweis: async (pfad: string) => appDatenSpeicher.get(pfad) ?? '',

  appDatenSchreiben: async (pfad: string, inhalt: string) => {
    appDatenSpeicher.set(pfad, inhalt);
  },
  appDatenLesen: vi.fn((pfad: string) => Promise.resolve(appDatenSpeicher.get(pfad) ?? '')),
}));
import * as kern from '@/lib/persistenz/kern/kern.index';
const appDatenSpeicher = new Map<string, string>();
const appDatenLesenGeschuetzt =
  vi.fn<(pfad: string, wurzelTag: string, token?: string) => Promise<string | null>>();

vi.mock('@/lib/persistenz/kern/kern.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/kern/kern.index')>()),
  sicherstelleOrdner: vi.fn(() => Promise.resolve()),
  appDatenLesenGeschuetzt: (...args: [string, string, string?]) => appDatenLesenGeschuetzt(...args),
  appDatenLesenOderNull: vi.fn((pfad: string) =>
    Promise.resolve(appDatenSpeicher.get(pfad) ?? null),
  ),
  nutzerdatenSchreiben: vi.fn((pfad: string, inhalt: string) => {
    appDatenSpeicher.set(pfad, inhalt);
    return Promise.resolve();
  }),
  appDatenLoeschen: vi.fn((pfad: string) => {
    // Native tokengebundene Löschung behandelt fehlende Dateien als Erfolg.
    appDatenSpeicher.delete(pfad);
    return Promise.resolve();
  }),
}));

import {
  umschaltenFavorit,
  ladeFavoriten,
  hinzufuegenFavoriten,
  leseFavoritenRohtext,
  ersetzeFavoritenDatei,
  zusammenfuehrenFavoriten,
} from './favoritenSpeicher';

vi.mock('@tauri-apps/api/event', () => ({ emitTo: vi.fn(async () => undefined) }));

const FAVORITEN_ORDNER = 'favoriten';
const DATEI = `${FAVORITEN_ORDNER}/BGB_de-bund-favoriten.xml`;

beforeEach(() => {
  const gehalten = new Map<string, Promise<void>>();
  const freigaben = new Map<string, () => void>();
  let nummer = 0;
  archivierung.mockClear();
  archivierung.mockImplementation(
    async (
      befehl: string,
      args: { relativerPfad: string; erwarteterInhalt: string; token: string },
    ) => {
      if (befehl === 'datei_sperre_erwerben') {
        const pfad = args.relativerPfad.toLowerCase();
        const vorher = gehalten.get(pfad) ?? Promise.resolve();
        const token = `test-token-${++nummer}`;
        gehalten.set(pfad, new Promise<void>((resolve) => freigaben.set(token, resolve)));
        await vorher;
        return token;
      }
      if (befehl === 'datei_sperre_freigeben') {
        freigaben.get(args.token)?.();
        freigaben.delete(args.token);
        return;
      }
      if (befehl !== 'archiviere_beschaedigte_datei') throw new Error(befehl);
      appDatenSpeicher.set(args.relativerPfad + '.bak', args.erwarteterInhalt);
      appDatenSpeicher.delete(args.relativerPfad);
      return { status: 'archiviert', sicherungspfad: args.relativerPfad + '.bak' };
    },
  );
  appDatenSpeicher.clear();
  vi.mocked(kern.appDatenLoeschen).mockClear();
  vi.mocked(kern.nutzerdatenSchreiben).mockClear();
  appDatenLesenGeschuetzt.mockReset();
  appDatenLesenGeschuetzt.mockImplementation((pfad) =>
    Promise.resolve(appDatenSpeicher.get(pfad) ?? null),
  );
});

// ---------------------------------------------------------------------------
// umschaltenFavorit
// ---------------------------------------------------------------------------

describe('umschaltenFavorit', () => {
  it('schreibt version="1" am Wurzel-Tag', async () => {
    await umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    expect(appDatenSpeicher.get(DATEI)).toContain('<favoriten version="1">');
  });
  it('fügt eine noch nicht vorhandene Bezeichnung hinzu', async () => {
    await umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    expect(await ladeFavoriten(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual(['433']);
  });

  it('entfernt eine bereits vorhandene Bezeichnung wieder (Toggle)', async () => {
    await umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    await umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    expect(await ladeFavoriten(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual([]);
  });

  it('MUTATIONSTEST: löscht die Datei vollständig, wenn der letzte Favorit entfernt wird', async () => {
    await umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    await umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    expect(appDatenSpeicher.has(DATEI)).toBe(false);
  });

  it('MUTATIONSTEST: schreibt die Datei weiterhin, wenn nach dem Entfernen noch Einträge übrig sind (kein Löschen)', async () => {
    await umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    await umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '1');
    await umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    expect(appDatenSpeicher.has(DATEI)).toBe(true);
    expect(await ladeFavoriten(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual(['1']);
  });

  it('MUTATIONSTEST: das Entfernen einer nicht existierenden Datei (bereits weg) wirft keinen Fehler', async () => {
    await umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    appDatenSpeicher.delete(DATEI); // Datei "von außen" bereits verschwunden
    await expect(
      umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '433'),
    ).resolves.toBeUndefined();
  });

  it('fügt beim Hinzufügen sortiert ein (numerisch, nicht Einfüge-Reihenfolge)', async () => {
    await umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    await umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '1');
    await umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '20');
    expect(await ladeFavoriten(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual(['1', '20', '433']);
  });

  it('Gesetze sind unabhängig voneinander (eigene Datei je Kurztitel)', async () => {
    await umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    await umschaltenFavorit(gesetzesreferenz({ kurztitel: 'ZPO' }), '1');
    expect(await ladeFavoriten(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual(['433']);
    expect(await ladeFavoriten(gesetzesreferenz({ kurztitel: 'ZPO' }))).toEqual(['1']);
  });
});

// ---------------------------------------------------------------------------
// ladeFavoriten
// ---------------------------------------------------------------------------

describe('ladeFavoriten', () => {
  it('liefert bei null vom geschützten Lader eine leere Liste', async () => {
    expect(await ladeFavoriten(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual([]);
    expect(appDatenLesenGeschuetzt).toHaveBeenCalledWith(DATEI, 'favoriten', undefined);
  });

  it('propagiert einen Fehler des geschützten Laders', async () => {
    const fehler = new Error('Datei nicht lesbar');
    appDatenLesenGeschuetzt.mockRejectedValueOnce(fehler);

    await expect(ladeFavoriten(gesetzesreferenz({ kurztitel: 'BGB' }))).rejects.toThrow(fehler);
  });
});

// ---------------------------------------------------------------------------
// hinzufuegenFavoriten
// ---------------------------------------------------------------------------

describe('hinzufuegenFavoriten', () => {
  it('fügt mehrere neue Bezeichnungen sortiert hinzu und gibt die neu hinzugefügten zurück', async () => {
    const hinzugefuegt = await hinzufuegenFavoriten(gesetzesreferenz({ kurztitel: 'BGB' }), [
      '433',
      '1',
      '20',
    ]);
    expect(hinzugefuegt).toEqual(new Set(['433', '1', '20']));
    expect(await ladeFavoriten(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual(['1', '20', '433']);
  });

  it('MUTATIONSTEST: überspringt bereits vorhandene Bezeichnungen (kein Duplikat, kein erneutes Toggle)', async () => {
    await umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    const hinzugefuegt = await hinzufuegenFavoriten(gesetzesreferenz({ kurztitel: 'BGB' }), [
      '433',
      '1',
    ]);
    expect(hinzugefuegt).toEqual(new Set(['1']));
    expect(await ladeFavoriten(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual(['1', '433']);
  });

  it('MUTATIONSTEST: schreibt NICHT, wenn keine der übergebenen Bezeichnungen neu ist (leere Ergebnismenge)', async () => {
    await umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    const setItemSpy = vi.fn();
    const { nutzerdatenSchreiben } = await import('@/lib/persistenz/kern/kern.index');
    (nutzerdatenSchreiben as ReturnType<typeof vi.fn>).mockClear();

    const hinzugefuegt = await hinzufuegenFavoriten(gesetzesreferenz({ kurztitel: 'BGB' }), [
      '433',
    ]);

    expect(hinzugefuegt.size).toBe(0);
    expect(nutzerdatenSchreiben).not.toHaveBeenCalled();
    void setItemSpy; // nur zur Symmetrie mit anderen Testdateien, ungenutzt sonst
  });

  it('property: das Ergebnis von hinzufuegenFavoriten ist stets disjunkt von den zuvor bereits vorhandenen Bezeichnungen', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.integer({ min: 0, max: 500 }).map(String), { maxLength: 8 }),
        fc.uniqueArray(fc.integer({ min: 0, max: 500 }).map(String), { maxLength: 8 }),
        async (bestehend, neue) => {
          appDatenSpeicher.clear();
          vi.mocked(kern.appDatenLoeschen).mockClear();
          vi.mocked(kern.nutzerdatenSchreiben).mockClear();
          for (const b of bestehend) {
            await umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), b);
          }
          const hinzugefuegt = await hinzufuegenFavoriten(
            gesetzesreferenz({ kurztitel: 'BGB' }),
            neue,
          );
          for (const b of bestehend) {
            expect(hinzugefuegt.has(b)).toBe(false);
          }
          // Alles, was weder vorher da war noch neu hinzugefügt wurde, war
          // ein Duplikat innerhalb von `neue` selbst - nicht relevant hier.
          const geladen = new Set(await ladeFavoriten(gesetzesreferenz({ kurztitel: 'BGB' })));
          for (const n of neue) {
            expect(geladen.has(n)).toBe(true);
          }
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// leseFavoritenRohtext / ersetzeFavoritenDatei
// ---------------------------------------------------------------------------

describe('leseFavoritenRohtext', () => {
  it('gibt den rohen XML-Text zurück, wenn die Datei existiert', async () => {
    await umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
    const roh = await leseFavoritenRohtext(gesetzesreferenz({ kurztitel: 'BGB' }));
    expect(roh).toContain('<eintrag><bezeichnung>433</bezeichnung></eintrag>');
  });

  it('gibt null zurück, wenn keine Datei existiert', async () => {
    expect(await leseFavoritenRohtext(gesetzesreferenz({ kurztitel: 'BGB' }))).toBeNull();
  });
});

describe('ersetzeFavoritenDatei', () => {
  it('schreibt den übergebenen Inhalt unverändert (Datei-Import "Ersetzen")', async () => {
    await ersetzeFavoritenDatei(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      '<favoriten>ROH</favoriten>',
    );
    expect(appDatenSpeicher.get(DATEI)).toBe('<favoriten>ROH</favoriten>');
  });
});

// ---------------------------------------------------------------------------
// parseBezeichnungListe
// ---------------------------------------------------------------------------

describe('XML-Formatfälle beim Laden', () => {
  it('extrahiert alle <bezeichnung>-Werte aus dem Inhalt-Block', async () => {
    const xml = [
      '<favoriten><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt>',
      '<eintrag><bezeichnung>433</bezeichnung></eintrag>',
      '<eintrag><bezeichnung>1</bezeichnung></eintrag>',
      '</inhalt></favoriten>',
    ].join('\n');
    expect(await ladeXML(xml)).toEqual(['433', '1']);
  });

  it('MUTATIONSTEST: trimmt Whitespace um den Bezeichnung-Wert', async () => {
    const xml =
      '<favoriten><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><eintrag><bezeichnung> 433 </bezeichnung></eintrag></inhalt></favoriten>';
    expect(await ladeXML(xml)).toEqual(['433']);
  });

  it('liefert eine leere Liste, wenn keine <bezeichnung>-Tags vorhanden sind', async () => {
    expect(
      await ladeXML(
        '<favoriten><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt></inhalt></favoriten>',
      ),
    ).toEqual([]);
  });
});

it('erhält beide gleichzeitig gestarteten Änderungen', async () => {
  appDatenLesenGeschuetzt.mockImplementation(async (pfad) => {
    const stand = appDatenSpeicher.get(pfad) ?? null;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return stand;
  });
  await Promise.all([
    umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '433'),
    umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '434'),
  ]);
  expect(await ladeFavoriten(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual(['433', '434']);
});

it.each([
  ['umschalten', () => umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '433'), true],
  ['hinzufügen', () => hinzufuegenFavoriten(gesetzesreferenz({ kurztitel: 'BGB' }), ['433']), true],
  [
    'ersetzen',
    () => ersetzeFavoritenDatei(gesetzesreferenz({ kurztitel: 'BGB' }), '<favoriten/>'),
    false,
  ],
] as const)(
  'reicht beim %s den Token an alle Dateioperationen weiter',
  async (_name, aktion, liest) => {
    await aktion();
    expect(
      archivierung.mock.calls.filter(([befehl]) => befehl === 'datei_sperre_erwerben'),
    ).toEqual([
      [
        'datei_sperre_erwerben',
        { relativerPfad: `${FAVORITEN_ORDNER}/bgb_de-bund-favoriten.xml.referenz-sperre` },
      ],
      ['datei_sperre_erwerben', { relativerPfad: DATEI }],
    ]);
    if (liest)
      expect(appDatenLesenGeschuetzt).toHaveBeenCalledWith(
        DATEI,
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
  await umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
  const fehler = new Error('Token ungültig');
  vi.mocked(kern.appDatenLoeschen).mockRejectedValueOnce(fehler);
  await expect(umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '433')).rejects.toBe(
    fehler,
  );
});

it('schreibt wohlgeformtes XML mit UTC-Verarbeitungszeit ohne Millisekunden', async () => {
  await umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
  const xml = appDatenSpeicher.get(DATEI)!;
  pruefeXmlWohlgeformtheit(xml);
  expect(xml).toMatch(
    /<verarbeitungszeit>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z<\/verarbeitungszeit>/,
  );
  expect(xml).not.toContain('<geaendert>');
});

it('erhält Sonderzeichen und wörtliche Entities beim Schreiben und Laden', async () => {
  const text = `&<>"' &amp; &lt;`;
  await umschaltenFavorit(gesetzesreferenz({ kurztitel: text }), text);
  const xml = appDatenSpeicher.get(
    `${FAVORITEN_ORDNER}/${dateiBasis(gesetzesreferenz({ kurztitel: text }))}-favoriten.xml`,
  )!;
  expect(() => pruefeXmlWohlgeformtheit(xml)).not.toThrow();
  expect(
    new DOMParser().parseFromString(xml, 'text/xml').querySelector('infos > gesetz')?.textContent,
  ).toBe(text);
  expect(await ladeFavoriten(gesetzesreferenz({ kurztitel: text }))).toEqual([text]);
});

it('lädt gespeicherte Favoriten mit dem echten Schutzlader ohne Archivierung oder Banner', async () => {
  await umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
  const { appDatenLesenGeschuetzt: echterSchutzlader } = await vi.importActual<typeof kern>(
    '@/lib/persistenz/kern/kern.index',
  );
  appDatenLesenGeschuetzt.mockImplementation(echterSchutzlader);
  for (const version of ['1', '2']) {
    appDatenSpeicher.set(
      DATEI,
      appDatenSpeicher
        .get(DATEI)!
        .replace(/favoriten version="[12]"/, `favoriten version="${version}"`),
    );
    expect(await ladeFavoriten(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual(['433']);
  }
  expect(
    archivierung.mock.calls.filter(([befehl]) => befehl === 'archiviere_beschaedigte_datei'),
  ).toEqual([]);
  expect(banner).not.toHaveBeenCalled();
});

async function ladeXML(xml: string) {
  appDatenSpeicher.set(DATEI, xml);
  return ladeFavoriten(gesetzesreferenz({ kurztitel: 'BGB' }));
}

it('liest nur direkte Einträge trotz Erweiterungen und Kommentaren', async () => {
  appDatenSpeicher.set(
    DATEI,
    '<favoriten version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><eintrag><bezeichnung extra="ja">433</bezeichnung></eintrag><neu><eintrag><bezeichnung>999</bezeichnung></eintrag></neu><!-- <eintrag><bezeichnung>1</bezeichnung></eintrag> --></inhalt></favoriten>',
  );
  expect(await ladeFavoriten(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual(['433']);
});

it('lehnt beschädigte XML vor dem Schreiben ab', async () => {
  await expect(
    zusammenfuehrenFavoriten(
      gesetzesreferenz({ kurztitel: 'BGB' }),
      '<favoriten><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt></favoriten>',
    ),
  ).rejects.toThrow('Datei ungültig');
  expect(kern.nutzerdatenSchreiben).not.toHaveBeenCalled();
});

it('adressiert Favoriten durch eine Gesetzesreferenz', async () => {
  await umschaltenFavorit({ kurztitel: 'BGB', normgeber: 'de-bund' }, '433');
  expect(appDatenSpeicher.get('favoriten/BGB_de-bund-favoriten.xml')).toContain(
    '<gesetz normgeber="de-bund">BGB</gesetz>',
  );
  expect(await ladeFavoriten({ kurztitel: 'BGB', normgeber: 'de-bund' })).toEqual(['433']);
});

it('trennt gleichnamige Gesetze verschiedener Normgeber', async () => {
  await umschaltenFavorit({ kurztitel: 'BGB', normgeber: 'de-bund' }, '433');
  await umschaltenFavorit({ kurztitel: 'BGB', normgeber: 'de-bw' }, '1');
  expect(await ladeFavoriten({ kurztitel: 'BGB', normgeber: 'de-bund' })).toEqual(['433']);
  expect(await ladeFavoriten({ kurztitel: 'BGB', normgeber: 'de-bw' })).toEqual(['1']);
});

it('nutzt vorhandene Favoriten ohne installiertes Gesetz auch bei anderer Schreibweise', async () => {
  const pfad = 'favoriten/BGB_de-bund-favoriten.xml';
  await umschaltenFavorit({ kurztitel: 'BGB', normgeber: 'de-bund' }, '433');
  const referenz = { kurztitel: 'bgb', normgeber: 'de-bund' };
  expect(await ladeFavoriten(referenz)).toEqual(['433']);
  expect(await leseFavoritenRohtext(referenz)).toBe(appDatenSpeicher.get(pfad));
  await hinzufuegenFavoriten(referenz, ['434']);
  expect(await ladeFavoriten(referenz)).toEqual(['433', '434']);
  await ersetzeFavoritenDatei(
    referenz,
    '<favoriten version="1"><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><eintrag><bezeichnung>1</bezeichnung></eintrag></inhalt></favoriten>',
  );
  expect([...appDatenSpeicher.keys()]).toEqual([pfad]);
  await umschaltenFavorit(referenz, '1');
  expect(appDatenSpeicher.size).toBe(0);
});

it('verweigert konkurrierende Favoritendateien ohne eine davon zu überschreiben', async () => {
  await umschaltenFavorit({ kurztitel: 'BGB', normgeber: 'de-bund' }, '433');
  appDatenSpeicher.set('favoriten/bgb_de-bund-favoriten.xml', 'zweite Datei');
  const vorher = [...appDatenSpeicher];
  await expect(ladeFavoriten({ kurztitel: 'bgb', normgeber: 'de-bund' })).rejects.toThrow(
    'Mehrere Dateien',
  );
  await expect(
    umschaltenFavorit({ kurztitel: 'BGB', normgeber: 'de-bund' }, '434'),
  ).rejects.toThrow('Mehrere Dateien');
  expect([...appDatenSpeicher]).toEqual(vorher);
});

it('serialisiert die erste Anlage unterschiedlich kodierter Schreibweisen derselben Referenz', async () => {
  appDatenLesenGeschuetzt.mockImplementation(async (pfad) => {
    const stand = appDatenSpeicher.get(pfad) ?? null;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return stand;
  });
  await Promise.all([
    umschaltenFavorit({ kurztitel: 'CON.x', normgeber: 'de-bund' }, '433'),
    umschaltenFavorit({ kurztitel: 'con.x', normgeber: 'de-bund' }, '434'),
  ]);
  expect(appDatenSpeicher.size).toBe(1);
  expect(await ladeFavoriten({ kurztitel: 'con.x', normgeber: 'de-bund' })).toEqual(['433', '434']);
});

it('erhält den Normgeber und archiviert falsch zugeordnete Favoriten', async () => {
  const ref = { kurztitel: 'BGB', normgeber: 'de-bund' };
  await hinzufuegenFavoriten(ref, ['433']);
  expect(await ladeFavoriten(ref)).toEqual(['433']);
  const pfad = 'favoriten/BGB_de-bund-favoriten.xml';
  expect(appDatenSpeicher.get(pfad)).toContain('<gesetz normgeber="de-bund">BGB</gesetz>');
  appDatenSpeicher.set(
    pfad,
    appDatenSpeicher.get(pfad)!.replace('normgeber="de-bund"', 'normgeber="de-bw"'),
  );
  expect(await ladeFavoriten(ref)).toEqual([]);
  expect(appDatenSpeicher.get(pfad + '.bak')).toContain('de-bw');
});

it('schreibt Favoriten als eintrag und liest keine flachen Alt-Einträge', async () => {
  await umschaltenFavorit(gesetzesreferenz({ kurztitel: 'BGB' }), '433');
  expect(appDatenSpeicher.get(DATEI)).toContain(
    '<eintrag><bezeichnung>433</bezeichnung></eintrag>',
  );
  expect(
    await ladeXML(
      '<favoriten><infos><gesetz normgeber="de-bund">BGB</gesetz></infos><inhalt><bezeichnung>1</bezeichnung><eintrag extra="x"><bezeichnung extra="x">433</bezeichnung><neu><bezeichnung>9</bezeichnung></neu></eintrag><neu><eintrag><bezeichnung>8</bezeichnung></eintrag></neu></inhalt></favoriten>',
    ),
  ).toEqual(['433']);
});

// Gezielter Negativfall: alter Normgeber Bund.
it.each([
  'Bund' /* normgeber-negativ: Konkreter alter Wert zur Ablehnungsprüfung. */,
  '',
  'A_B',
  'abcdefghijklmnopqrstu',
])('archiviert Favoriten mit ungültigem Normgeber %s', async (normgeber) => {
  const roh = `<favoriten><infos><gesetz normgeber="${normgeber}">BGB</gesetz></infos><inhalt><eintrag><bezeichnung>433</bezeichnung></eintrag></inhalt></favoriten>`;
  appDatenSpeicher.set(DATEI, roh);
  expect(await ladeFavoriten(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual([]);
  expect(appDatenSpeicher.has(DATEI)).toBe(false);
  expect(appDatenSpeicher.get(DATEI + '.bak')).toBe(roh);
});

it('archiviert Favoriten ohne Normgeber vor einer späteren Änderung', async () => {
  const melden = vi.spyOn(kern, 'meldePersistenzBefund');
  const xml =
    '<favoriten><infos><gesetz>BGB</gesetz></infos><inhalt><eintrag><bezeichnung>1</bezeichnung></eintrag></inhalt></favoriten>';
  appDatenSpeicher.set(DATEI, xml);
  expect(await ladeFavoriten(gesetzesreferenz({ kurztitel: 'BGB' }))).toEqual([]);
  expect(appDatenSpeicher.has(DATEI)).toBe(false);
  expect(appDatenSpeicher.get(DATEI + '.bak')).toBe(xml);
  expect(kern.nutzerdatenSchreiben).not.toHaveBeenCalled();
  melden.mockRestore();
});
