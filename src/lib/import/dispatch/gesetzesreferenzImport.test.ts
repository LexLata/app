// gesetzesreferenzImport.test.ts
// Gezielter Import bewahrt Referenzen, Quellen und vollständige EU-Ressourcenlinks.
import { beforeEach, expect, it, vi } from 'vitest';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
const mocks = vi.hoisted(() => ({
  importieren: vi.fn(),
  index: vi.fn(),
  europa: vi.fn(),
  gesetze: vi.fn(),
  warten: vi.fn(),
}));
vi.mock('./importVorgang', () => ({ warteAufGesetzImport: mocks.warten }));
vi.mock('./gesetzImportDispatch', () => ({ importiereGesetze: mocks.importieren }));
vi.mock('@/lib/import/importindex/importindex.index', () => ({
  alleImportindexEintraege: mocks.index,
  leseEuropaVerzeichnis: mocks.europa,
}));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/gesetz/gesetz.index')>()),
  leseAbgeglichenesSuchverzeichnis: async () => ({ abgeglichen: true, eintraege: [] }),
  leseSuchverzeichnis: async () => ({ eintraege: [] }),
  leseGesetz: async (referenz: { kurztitel: string; normgeber: string }, empfangen: unknown) => {
    let befunde: import('@/lib/persistenz/gesetz/gesetz.index').GesetzLadeBefund[] = [];
    try {
      const liste = await mocks.gesetze((b: typeof befunde) => {
        befunde = b;
      }, empfangen);
      if (befunde.length) return { status: 'nicht-lesbar', befunde };
      const gesetz = liste.find(
        (g: GesetzDarstellung) =>
          g.kurztitel.toLowerCase() === referenz.kurztitel.toLowerCase() &&
          g.normgeber === referenz.normgeber,
      );
      return gesetz ? { status: 'geladen', gesetz, befunde } : { status: 'fehlt', befunde };
    } catch {
      return { status: 'nicht-lesbar', befunde };
    }
  },
}));
import {
  importiereGesetzesreferenz,
  importiereGesetzesreferenzen,
  ladeGesetzeskandidaten,
} from './gesetzesreferenzImport';
const gesetz = (normgeber = 'de-bund') => ({ kurztitel: 'TestG', normgeber }) as GesetzDarstellung;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.gesetze.mockReset();
  mocks.warten.mockReset().mockResolvedValue(undefined);
  mocks.index.mockResolvedValue([]);
  mocks.europa.mockResolvedValue([]);
  mocks.gesetze.mockResolvedValue([]);
  mocks.importieren.mockImplementation(async () => {
    mocks.gesetze.mockResolvedValue([gesetz('de-bund')]);
    return { erfolgreiche: [gesetz('de-bund')], fehlgeschlagene: [] };
  });
});
it.each([
  ['de-bund', 'de-bund'],
  ['de-bw', 'de-bw'],
])('importiert %s ausschließlich über die zugehörige Quelle', async (normgeber, quelle) => {
  mocks.importieren.mockImplementation(async () => {
    mocks.gesetze.mockResolvedValue([gesetz(normgeber)]);
    return { erfolgreiche: [gesetz(normgeber)], fehlgeschlagene: [] };
  });
  expect(await importiereGesetzesreferenz({ kurztitel: 'testg', normgeber })).toMatchObject({
    art: 'erfolg',
    gesetz: { normgeber },
  });
  expect(mocks.importieren).toHaveBeenCalledExactlyOnceWith(
    ['testg'],
    quelle,
    expect.any(Function),
    undefined,
  );
});
it('importiert EU mit dem vollständigen Verzeichniseintrag einschließlich Ressourcenlink', async () => {
  const eintrag = {
    kurztitel: 'TestG',
    langtitel: 'Testgesetz',
    abrufkennung: 'TestG_de-bundle.xml',
  };
  mocks.europa.mockResolvedValue([eintrag]);
  mocks.importieren.mockImplementation(async () => {
    mocks.gesetze.mockResolvedValue([gesetz('eu')]);
    return { erfolgreiche: [gesetz('eu')], fehlgeschlagene: [] };
  });
  expect(await importiereGesetzesreferenz({ kurztitel: 'testg', normgeber: 'eu' })).toMatchObject({
    art: 'erfolg',
  });
  expect(mocks.importieren).toHaveBeenCalledExactlyOnceWith(
    [eintrag],
    'eu',
    expect.any(Function),
    undefined,
  );
});
it('meldet ein anderes importiertes Gesetz niemals als Erfolg für die gewählte Referenz', async () => {
  expect(
    await importiereGesetzesreferenz({ kurztitel: 'TestG', normgeber: 'de-bw' }),
  ).toMatchObject({
    art: 'fehler',
    fehler: { grund: 'format' },
  });
});
it.each(['de-sn', 'unbekannt', 'eu'])(
  'rät bei nicht importierbarem Ziel %s keine Ersatzquelle',
  async (normgeber) => {
    expect(await importiereGesetzesreferenz({ kurztitel: 'TestG', normgeber })).toMatchObject({
      art: 'fehler',
    });
    expect(mocks.importieren).not.toHaveBeenCalled();
  },
);
it('bewahrt Fehler und Fortschrittsmeldungen des gezielten Imports', async () => {
  const fehler = { grund: 'keineVerbindung', meldung: 'Offline' };
  mocks.importieren.mockImplementation(async (_eingaben, _quelle, fortschritt) => {
    fortschritt('TestG', 'laden', undefined, 'Download');
    return { erfolgreiche: [], fehlgeschlagene: [{ kurztitel: 'TestG', fehler }] };
  });
  const fortschritt = vi.fn();
  expect(
    await importiereGesetzesreferenz({ kurztitel: 'TestG', normgeber: 'de-bund' }, fortschritt),
  ).toMatchObject({ art: 'fehler', fehler });
  expect(fortschritt).toHaveBeenCalledExactlyOnceWith('Download');
});
it('begrenzt gezielte Mehrfachimporte auf zehn gleichzeitige Vorgänge und beendet sie vor Callbackfehlern', async () => {
  let laufend = 0;
  let maximum = 0;
  let fertig = 0;
  mocks.importieren.mockImplementation(async (eingaben) => {
    laufend++;
    maximum = Math.max(maximum, laufend);
    await new Promise((resolve) => setTimeout(resolve, 1));
    laufend--;
    fertig++;
    const frisch = { ...gesetz('de-bund'), kurztitel: eingaben[0] };
    mocks.gesetze.mockResolvedValue([]);
    return { erfolgreiche: [frisch], fehlgeschlagene: [] };
  });
  const ursache = new Error('Callback');
  const referenzen = Array.from({ length: 22 }, (_, i) => ({
    kurztitel: String(i),
    normgeber: 'de-bund',
  }));
  await expect(
    importiereGesetzesreferenzen(referenzen, () => {
      throw ursache;
    }),
  ).rejects.toBe(ursache);
  expect(maximum).toBe(10);
  expect(fertig).toBe(22);
  expect(laufend).toBe(0);
});

it.each(['ordner_unlesbar', 'unlesbar'] as const)(
  'behandelt %s trotz alter Zielliste als Ladefehler ohne Import',
  async (status) => {
    const befunde =
      status === 'ordner_unlesbar'
        ? [{ status, fehler: 'privater Pfad' }]
        : [{ status, dateiBasis: 'TestG_de-bund', fehler: 'privater Pfad' }];
    mocks.gesetze.mockImplementation(async (melden) => {
      melden?.(befunde);
      return [gesetz('de-bund')];
    });
    expect(
      await importiereGesetzesreferenz({ kurztitel: 'TestG', normgeber: 'de-bund' }),
    ).toMatchObject({ art: 'fehler', fehler: { grund: 'laden' }, ladeabschluss: { befunde } });
    expect(mocks.importieren).not.toHaveBeenCalled();
  },
);
it('öffnet nach erfolgreichem Import keinen unlesbaren Zielbestand', async () => {
  mocks.gesetze.mockImplementationOnce(async (melden) => {
    melden?.([]);
    return [];
  });
  mocks.gesetze.mockImplementationOnce(async (melden) => {
    melden?.([{ status: 'unlesbar', dateiBasis: 'TestG_de-bund', fehler: 'kaputt' }]);
    return [gesetz('de-bund')];
  });
  expect(
    await importiereGesetzesreferenz({ kurztitel: 'TestG', normgeber: 'de-bund' }),
  ).toMatchObject({ art: 'fehler', fehler: { grund: 'laden' } });
  expect(mocks.importieren).toHaveBeenCalledTimes(1);
});
it('bewahrt Befunde auch wenn das Bestandslesen anschließend wirft', async () => {
  const befunde = [{ status: 'unlesbar', dateiBasis: 'anderes_de-bund', fehler: 'kaputt' }];
  mocks.gesetze.mockImplementation(async (melden) => {
    melden?.(befunde);
    throw new Error('Pfad');
  });
  expect(
    await importiereGesetzesreferenz({ kurztitel: 'TestG', normgeber: 'de-bund' }),
  ).toMatchObject({
    art: 'fehler',
    fehler: { grund: 'laden' },
    ladeabschluss: { befunde, status: 'nicht-lesbar' },
  });
  expect(mocks.importieren).not.toHaveBeenCalled();
});

it('wartet bei fremdem Import und liest danach neu ohne konkurrierenden Import', async () => {
  mocks.importieren.mockResolvedValue({
    erfolgreiche: [],
    fehlgeschlagene: [
      {
        kurztitel: 'TestG',
        fehler: { grund: 'beschaeftigt', meldung: 'läuft' },
      },
    ],
  });
  mocks.warten.mockImplementation(async () => {
    mocks.gesetze.mockResolvedValue([gesetz('de-bund')]);
  });
  expect(
    await importiereGesetzesreferenz({ kurztitel: 'TestG', normgeber: 'de-bund' }),
  ).toMatchObject({ art: 'erfolg' });
  expect(mocks.warten).toHaveBeenCalledExactlyOnceWith({
    kurztitel: 'TestG',
    normgeber: 'de-bund',
  });
  expect(mocks.importieren).toHaveBeenCalledTimes(1);
  expect(mocks.gesetze).toHaveBeenCalledTimes(2);
});
it.each(['bestandspruefung', 'nachladen'])(
  'schließt einen geworfenen Lesefehler bei %s als Ladefehler ab',
  async (zeitpunkt) => {
    if (zeitpunkt === 'nachladen') mocks.gesetze.mockResolvedValueOnce([]);
    mocks.gesetze.mockRejectedValueOnce(new Error('privater Pfad'));
    const ergebnis = await importiereGesetzesreferenz({ kurztitel: 'TestG', normgeber: 'de-bund' });
    expect(ergebnis).toMatchObject({ art: 'fehler', fehler: { grund: 'laden' } });
    expect(JSON.stringify(ergebnis)).not.toContain('privater Pfad');
  },
);
it('meldet einen fehlenden Indexeintrag als nicht verfügbar ohne Quellenwechsel', async () => {
  mocks.importieren.mockResolvedValue({
    erfolgreiche: [],
    fehlgeschlagene: [
      {
        kurztitel: 'TestG',
        fehler: { grund: 'nichtImIndex', meldung: 'fehlt' },
      },
    ],
  });
  expect(
    await importiereGesetzesreferenz({ kurztitel: 'TestG', normgeber: 'de-bw' }),
  ).toMatchObject({
    art: 'fehler',
    fehler: { grund: 'nichtVerfuegbar', meldung: '‚TestG‘ ist für den Import nicht verfügbar.' },
  });
  expect(mocks.importieren).toHaveBeenCalledTimes(1);
});
it('schließt geworfene Importfehler verständlich ab', async () => {
  mocks.importieren.mockRejectedValueOnce(new Error('privater Pfad'));
  expect(
    await importiereGesetzesreferenz({ kurztitel: 'TestG', normgeber: 'de-bund' }),
  ).toMatchObject({
    art: 'fehler',
    fehler: { grund: 'sonstiger', meldung: 'Das Gesetz konnte nicht importiert werden.' },
  });
});

it('reicht denselben Empfänger an erste und frische Bestandsladung sowie Dispatch weiter', async () => {
  const empfangen = vi.fn();
  const ergebnis = await importiereGesetzesreferenz(
    { kurztitel: 'TestG', normgeber: 'de-bund' },
    undefined,
    empfangen,
  );
  expect(mocks.gesetze).toHaveBeenNthCalledWith(1, expect.any(Function), empfangen);
  expect(mocks.gesetze).toHaveBeenNthCalledWith(2, expect.any(Function), empfangen);
  expect(mocks.importieren).toHaveBeenCalledWith(
    ['TestG'],
    'de-bund',
    expect.any(Function),
    empfangen,
  );
  expect(ergebnis.importergebnis).toEqual({
    erfolgreiche: [gesetz('de-bund')],
    fehlgeschlagene: [],
  });
});
it('kennzeichnet vorhandenen Bestand ausdrücklich als unverändert ohne Importabschluss', async () => {
  mocks.gesetze.mockResolvedValue([gesetz('de-bund')]);
  const ergebnis = await importiereGesetzesreferenz({ kurztitel: 'TestG', normgeber: 'de-bund' });
  expect(ergebnis).toMatchObject({ art: 'erfolg', unveraendert: true });
  expect(ergebnis.importergebnis).toBeUndefined();
  expect(mocks.importieren).not.toHaveBeenCalled();
});
it('bewahrt bestätigten Dispatchabschluss neben anschließendem Ladefehler', async () => {
  const gespeichert = { erfolgreiche: [gesetz('de-bund')], fehlgeschlagene: [] };
  mocks.importieren.mockResolvedValue(gespeichert);
  mocks.gesetze.mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Laden'));
  const ergebnis = await importiereGesetzesreferenz({ kurztitel: 'TestG', normgeber: 'de-bund' });
  expect(ergebnis).toMatchObject({ art: 'fehler', fehler: { grund: 'laden' } });
  expect(ergebnis.importergebnis).toBe(gespeichert);
});
it('bewahrt Dispatchfehler ohne bestätigte Speicherung', async () => {
  const abschluss = {
    erfolgreiche: [],
    fehlgeschlagene: [
      { kurztitel: 'TestG', fehler: { grund: 'speichern', meldung: 'Schreibfehler' } },
    ],
  };
  mocks.importieren.mockResolvedValue(abschluss);
  const ergebnis = await importiereGesetzesreferenz({ kurztitel: 'TestG', normgeber: 'de-bund' });
  expect(ergebnis).toMatchObject({ art: 'fehler', fehler: { grund: 'speichern' } });
  expect(ergebnis.importergebnis).toBe(abschluss);
});
it('erhält vollständige Lade- und Importabschlüsse auch bei Mehrfachimporten', async () => {
  const empfangen = vi.fn();
  const referenz = { kurztitel: 'TestG', normgeber: 'de-bund' };
  const ergebnisse = await importiereGesetzesreferenzen([referenz], undefined, empfangen);
  expect(ergebnisse[0]!.ergebnis.importergebnis?.erfolgreiche).toEqual([gesetz('de-bund')]);
  expect(ergebnisse[0]!.ergebnis.bestandspruefung.status).toBe('fehlt');
  expect(mocks.importieren).toHaveBeenCalledWith(
    ['TestG'],
    'de-bund',
    expect.any(Function),
    empfangen,
  );
});

it('findet Europa-Referenzangebote nach Kurztitel und tatsächlichem Normgeber', async () => {
  const falsch = {
    kurztitel: 'TestG',
    normgeber: 'eu',
    langtitel: 'falsch',
    abrufkennung: '32008R0593',
  };
  const richtig = {
    kurztitel: 'TestG',
    normgeber: 'europarat',
    langtitel: 'richtig',
    abrufkennung: 'EMRK_europarat.xml',
  };
  mocks.europa.mockResolvedValue([falsch, richtig]);
  mocks.importieren.mockImplementation(async () => {
    mocks.gesetze.mockResolvedValue([gesetz('europarat')]);
    return { erfolgreiche: [gesetz('europarat')], fehlgeschlagene: [] };
  });
  const referenz = { kurztitel: 'TestG', normgeber: 'europarat' };
  expect(await importiereGesetzesreferenz(referenz)).toMatchObject({
    art: 'erfolg',
    gesetz: { normgeber: 'europarat' },
  });
  expect(mocks.importieren).toHaveBeenCalledExactlyOnceWith(
    [richtig],
    'europarat',
    expect.any(Function),
    undefined,
  );
  expect(await importiereGesetzesreferenz(referenz)).toMatchObject({
    art: 'erfolg',
    unveraendert: true,
  });
  expect(mocks.importieren).toHaveBeenCalledTimes(1);
});

it('bietet Fassungen mit gemeinsamer Abrufkennung nicht als Importziel an', async () => {
  mocks.index.mockImplementation(async (normgeber: string) =>
    normgeber === 'de-bw'
      ? [
          { kurztitel: 'VwRefG', langtitel: 'Drittes Gesetz', abrufkennung: 'VwRefG' },
          { kurztitel: 'VwRefG', langtitel: 'Viertes Gesetz', abrufkennung: 'VwRefG' },
          { kurztitel: 'LVG', langtitel: 'Landesverwaltungsgesetz', abrufkennung: 'VwG' },
        ]
      : [],
  );
  expect(await ladeGesetzeskandidaten()).toEqual([
    { kurztitel: 'LVG', normgeber: 'de-bw', abrufkennung: 'VwG' },
  ]);
});
