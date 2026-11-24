// Regressionen für zwei fensterlokale Ketten mit einer gemeinsamen Prozesssperre.
import { gesetzDarstellung } from '@/test/gesetz/gesetzFabriken';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const zustand = vi.hoisted(() => ({
  datei: '<markierungskonflikte/>',
  kette: Promise.resolve() as Promise<unknown>,
  gehalten: false,
  aufrufe: [] as string[],
  schreibFehler: undefined as Error | undefined,
  leseFehler: undefined as Error | undefined,
}));
vi.mock('@/lib/persistenz/kern/kern.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/kern/kern.index')>()),
  mitDateiSperre: vi.fn((pfad: string, lauf: (token: string) => Promise<unknown>) => {
    const ergebnis = zustand.kette.then(async () => {
      expect(pfad).toBe('markierungskonflikte.xml');
      expect(zustand.gehalten).toBe(false);
      zustand.gehalten = true;
      zustand.aufrufe.push('erwerben');
      try {
        return await lauf('konflikttoken');
      } finally {
        zustand.gehalten = false;
        zustand.aufrufe.push('freigeben');
      }
    });
    zustand.kette = ergebnis.catch(() => undefined);
    return ergebnis;
  }),
  appDatenLesen: vi.fn(async () => {
    if (zustand.leseFehler) throw zustand.leseFehler;
    return zustand.datei;
  }),
  appDatenExistiert: vi.fn(async () => true),
  appDatenSchreiben: vi.fn(async (pfad: string, inhalt: string, token?: string) => {
    expect(pfad).toBe('markierungskonflikte.xml');
    expect(token).toBe('konflikttoken');
    expect(zustand.gehalten).toBe(true);
    if (zustand.schreibFehler) throw zustand.schreibFehler;
    zustand.datei = inhalt;
  }),
  appDatenLoeschen: vi.fn(async (pfad: string, token?: string) => {
    expect(pfad).toBe('markierungskonflikte.xml');
    expect(token).toBe('konflikttoken');
    expect(zustand.gehalten).toBe(true);
    if (zustand.schreibFehler) throw zustand.schreibFehler;
    zustand.datei = '';
  }),
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (original) => ({
  ...(await original<typeof import('@/lib/persistenz/gesetz/gesetz.index')>()),
  ladeAlleGesetzeFuerPruefung: vi.fn(async () => []),
  ladeGesetzeFuerPruefung: async (
    referenzen: import('@/lib/domain/gesetzTypes').Gesetzesreferenz[],
  ) => {
    if (referenzen.length === 0) return [];
    const gesetz = await import('@/lib/persistenz/gesetz/gesetz.index');
    return [...(await gesetz.ladeAlleGesetzeFuerPruefung())];
  },
  existierenNichtamtlicheTitelFuerPruefung: vi.fn(async () => new Set()),
  beiSpeicherBatchAbgeschlossen: vi.fn(),
  beiNichtamtlicheTitelGeschrieben: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => {
    expect(zustand.gehalten).toBe(true);
    return { offeneQuellen: 0, offenePruefungen: 1, vollbedarf: false };
  }),
}));
vi.mock('@tauri-apps/api/event', () => ({ emitTo: vi.fn(async () => {}) }));

/** Gesetzesblock als gespeicherte Konflikte im aktuell geladenen Modulstand. */
async function gespeicherterBlock(roh: string) {
  const xml = await import('@/lib/markierungen/markierungs-xml/markierungs-xml.index');
  const [konflikte] = xml
    .liesMarkierungskonflikteXML(`<markierungskonflikte>${roh}</markierungskonflikte>`)
    .gesetzKonflikte.values();
  if (!konflikte) throw new Error('Gesetzesblock ohne gültige Gesetzesangabe.');
  return konflikte;
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  zustand.datei = '<markierungskonflikte/>';
  zustand.kette = Promise.resolve();
  zustand.gehalten = false;
  zustand.aufrufe = [];
  zustand.schreibFehler = undefined;
  zustand.leseFehler = undefined;
});

describe('prozessweiter Schutz der Konfliktdatei', () => {
  it('serialisiert zwei unabhängig geladene lokale Ketten und erhält beide Änderungen', async () => {
    const erstesFenster = await ladeSpeicherMitKette();
    vi.resetModules();
    const zweitesFenster = await ladeSpeicherMitKette();
    const datei = await import('./markierungskonflikteSpeicher.dateiZugriff');
    let freigeben!: () => void;
    const pause = new Promise<void>((resolve) => {
      freigeben = resolve;
    });
    let gestartet!: () => void;
    const start = new Promise<void>((resolve) => {
      gestartet = resolve;
    });
    const erster = erstesFenster.reiheInPruefungsKetteEin(async (token) => {
      const gesetzKonflikte = (await datei.ladePruefstand()).gesetzKonflikte;
      gestartet();
      await pause;
      gesetzKonflikte.set(
        'A',
        await gespeicherterBlock('<gesetz kurztitel="A" normgeber="de-bund"><neu/></gesetz>'),
      );
      await datei.schreibeGesetzKonflikte(gesetzKonflikte, token);
    }, true);
    await start;
    let zweiterGelesen = false;
    const zweiter = zweitesFenster.reiheInPruefungsKetteEin(async (token) => {
      const gesetzKonflikte = (await datei.ladePruefstand()).gesetzKonflikte;
      zweiterGelesen = true;
      expect(
        [...gesetzKonflikte.values()].map((konflikte) => konflikte.gesetz.kurztitel),
      ).toContain('A');
      gesetzKonflikte.set(
        'B',
        await gespeicherterBlock('<gesetz kurztitel="B" normgeber="de-bund"/>'),
      );
      await datei.schreibeGesetzKonflikte(gesetzKonflikte, token);
    }, true);
    await Promise.resolve();
    await Promise.resolve();
    expect(zweiterGelesen).toBe(false);
    freigeben();
    await Promise.all([erster, zweiter]);
    expect(zustand.datei).toContain('kurztitel="A"');
    expect(zustand.datei).toContain('kurztitel="B"');
    expect(zustand.aufrufe).toEqual(['erwerben', 'freigeben', 'erwerben', 'freigeben']);
  });

  it.each(['lesen', 'schreiben', 'löschen'] as const)(
    'gibt nach %s-Fehler die Sperre frei und führt die Kette weiter',
    async (art) => {
      const speicher = await ladeSpeicherMitKette();
      const datei = await import('./markierungskonflikteSpeicher.dateiZugriff');
      const fehler = new Error('Zugriff verweigert');
      if (art === 'lesen') zustand.leseFehler = fehler;
      else zustand.schreibFehler = fehler;
      const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        await expect(
          speicher.reiheInPruefungsKetteEin(async (token) => {
            const gesetzKonflikte = (await datei.ladePruefstand()).gesetzKonflikte;
            if (art === 'schreiben')
              gesetzKonflikte.set(
                'A',
                await gespeicherterBlock('<gesetz kurztitel="A" normgeber="de-bund"/>'),
              );
            await datei.schreibeGesetzKonflikte(gesetzKonflikte, token);
          }, true),
        ).rejects.toBe(fehler);
        expect(zustand.gehalten).toBe(false);
        zustand.leseFehler = undefined;
        zustand.schreibFehler = undefined;
        await expect(speicher.reiheInPruefungsKetteEin(async () => 'weiter', true)).resolves.toBe(
          'weiter',
        );
        expect(zustand.aufrufe).toEqual(['erwerben', 'freigeben', 'erwerben', 'freigeben']);
      } finally {
        protokoll.mockRestore();
      }
    },
  );

  it('gibt Verifikationsfehler an die Anzeige weiter', async () => {
    const anzeige =
      await import('@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige');
    const fehler = new Error('Konfliktdatei unlesbar');
    zustand.leseFehler = fehler;
    const protokoll = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(anzeige.verifiziereBekannteKonflikte()).rejects.toBe(fehler);
      await expect(anzeige.ladeMarkierungskonflikteFuerAnzeige()).rejects.toBe(fehler);
      expect(zustand.gehalten).toBe(false);
      expect(zustand.datei).toBe('<markierungskonflikte/>');
    } finally {
      protokoll.mockRestore();
    }
  });
});

it('registriert erst ausdrücklich und idempotent, ohne Anmeldung mit Datei-I/O zu verbinden', async () => {
  const gesetz = await import('@/test/tabs/gesetzSpeicherTestzugang');
  const eintrag = await import('@/lib/markierungen/eintrag/eintrag.index');
  const einzeln = vi.spyOn(eintrag, 'beiMarkierungGeaendert');
  const bulk = vi.spyOn(eintrag, 'beiMarkierungenBulkGeaendert');
  const kern = await import('@/lib/persistenz/kern/kern.index');
  const speicher = await ladeSpeicherMitKette();
  expect(gesetz.beiSpeicherBatchAbgeschlossen).not.toHaveBeenCalled();
  expect(gesetz.beiNichtamtlicheTitelGeschrieben).not.toHaveBeenCalled();
  expect(einzeln).not.toHaveBeenCalled();
  expect(bulk).not.toHaveBeenCalled();
  speicher.initialisiereMarkierungen();
  speicher.initialisiereMarkierungen();
  expect(gesetz.beiSpeicherBatchAbgeschlossen).toHaveBeenCalledTimes(1);
  expect(gesetz.beiNichtamtlicheTitelGeschrieben).toHaveBeenCalledTimes(1);
  expect(einzeln).toHaveBeenCalledTimes(1);
  expect(bulk).toHaveBeenCalledTimes(1);
  expect(kern.appDatenLesen).not.toHaveBeenCalled();
  expect(kern.appDatenSchreiben).not.toHaveBeenCalled();
  expect(kern.mitDateiSperre).not.toHaveBeenCalled();
  expect(gesetz.ladeAlleGesetzeFuerPruefung).not.toHaveBeenCalled();
  einzeln.mockRestore();
  bulk.mockRestore();
});

it('führt die verändernde Verifikation unter derselben Sperre mit dem Konfliktdateitoken aus', async () => {
  const gesetz = await import('@/test/tabs/gesetzSpeicherTestzugang');
  vi.mocked(gesetz.ladeAlleGesetzeFuerPruefung).mockResolvedValueOnce([
    gesetzDarstellung({
      kurztitel: 'A',
      langtitel: 'A',
      hatGliederungsartikel: false,
      elemente: [],
    }),
  ]);
  zustand.datei =
    '<markierungskonflikte pruefstatus="ausstehend"><gesetz kurztitel="A" normgeber="de-bund"><konflikt typ="gesetz-fehlt"/></gesetz></markierungskonflikte>';
  const anzeige =
    await import('@/lib/markierungen/markierungskonflikte/markierungskonflikteAnzeige');
  await anzeige.verifiziereBekannteKonflikte();
  expect(zustand.datei).toContain('pruefstatus="ausstehend"');
  expect(zustand.datei).not.toContain('<gesetz ');
  expect(zustand.aufrufe).toEqual(['erwerben', 'freigeben']);
});

async function ladeSpeicherMitKette() {
  const [speicher, kette] = await Promise.all([
    import('./markierungskonflikteSpeicher'),
    import('./markierungskonflikteSpeicher.pruefkette'),
  ]);
  return { ...speicher, reiheInPruefungsKetteEin: kette.reiheInPruefungsKetteEin };
}
