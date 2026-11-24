// gesetzImportDispatch.test.ts
//
// Unit-Tests für importiereGesetze: Duplikat-Check, Bund-/BW-, EUR-Lex- und GesetzesXML-Zweige,
// automatischer Bund→BW-Fallback nur bei fehlendem Bundesindexeintrag,
// Sperren und Fortschritts-Callbacks einschließlich paralleler Worker.

import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';

const ladeAlleGesetze = vi.fn<(...args: unknown[]) => Promise<GesetzDarstellung[]>>(() =>
  Promise.resolve([]),
);
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/gesetz/gesetz.index')>()),
  leseAbgeglichenesSuchverzeichnis: async () => ({ abgeglichen: true, eintraege: [] }),

  leseGesetz: async (referenz: { kurztitel: string; normgeber: string }) => {
    const liste = await ladeAlleGesetze();
    const gesetz = liste.find(
      (g: { kurztitel: string; normgeber: string }) =>
        g.kurztitel.toLowerCase() === referenz.kurztitel.toLowerCase() &&
        g.normgeber === referenz.normgeber,
    );
    return gesetz ? { status: 'geladen', gesetz, befunde: [] } : { status: 'fehlt', befunde: [] };
  },
  ladeAlleGesetze: (...args: unknown[]) => ladeAlleGesetze(...args),
}));

const versucheGesetzSperreZuErhalten = vi.fn<(gesetz: Gesetzesreferenz) => Promise<boolean>>();
const gibGesetzSperreFrei = vi.fn<(gesetz: Gesetzesreferenz) => Promise<void>>();
vi.mock('@/lib/import/dispatch/importVorgang', () => ({
  mitManuellemImportVorgang: (arbeit: () => Promise<unknown>) => arbeit(),
  versucheGesetzSperreZuErhalten: (...args: [Gesetzesreferenz]) =>
    versucheGesetzSperreZuErhalten(...args),
  gibGesetzSperreFrei: (...args: [Gesetzesreferenz]) => gibGesetzSperreFrei(...args),
}));

const importiereVomInternet =
  vi.fn<(kuerzel: string, fortschritt?: (f: { meldung: string }) => void) => Promise<unknown>>();
vi.mock('@/lib/import/bund/bund.index', () => ({
  importiereVomInternet: (...args: [string, ((f: { meldung: string }) => void)?]) =>
    importiereVomInternet(...args),
}));

const importiereGesetzVomInternetBW =
  vi.fn<(kuerzel: string, fortschritt?: (f: { meldung: string }) => void) => Promise<unknown>>();
vi.mock('@/lib/import/bw/bw.index', () => ({
  importiereGesetzVomInternetBW: (...args: [string, ((f: { meldung: string }) => void)?]) =>
    importiereGesetzVomInternetBW(...args),
}));

const importiereGesetzesXML =
  vi.fn<(xml: string, fortschritt?: (f: { meldung: string }) => void) => Promise<unknown>>();
vi.mock('@/lib/import/importabschluss/importabschluss.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/import/importabschluss/importabschluss.index')>()),
  importiereGesetzesXML: (...args: [string, ((f: { meldung: string }) => void)?]) =>
    importiereGesetzesXML(...args),
}));

const { euEintraege, importiereVomInternetEU } = vi.hoisted(() => ({
  euEintraege: vi.fn(),
  importiereVomInternetEU: vi.fn(),
}));
vi.mock('@/lib/import/importindex/importindex.index', () => ({
  alleImportindexEintraege: euEintraege,
}));
vi.mock('@/lib/import/eu/eu.index', () => ({ importiereVomInternetEU }));

const resolveResource = vi.fn<(p: string) => Promise<string>>();
vi.mock('@tauri-apps/api/path', () => ({
  resolveResource: (...args: [string]) => resolveResource(...args),
}));
const readTextFile = vi.fn<(p: string) => Promise<string>>();
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: (...args: [string]) => readTextFile(...args),
}));

import { importiereGesetze } from './gesetzImportDispatch';

function gesetz(kurztitel: string): GesetzDarstellung {
  return { kurztitel } as GesetzDarstellung;
}

beforeEach(() => {
  vi.resetAllMocks();
  ladeAlleGesetze.mockResolvedValue([]);
  versucheGesetzSperreZuErhalten.mockResolvedValue(true);
  gibGesetzSperreFrei.mockResolvedValue(undefined);
});

describe('importiereGesetze', () => {
  it('leere Eingabeliste -> No-Op, keine Aufrufe', async () => {
    const ergebnis = await importiereGesetze([]);
    expect(ergebnis).toEqual({ erfolgreiche: [], fehlgeschlagene: [] });
    expect(importiereVomInternet).not.toHaveBeenCalled();
  });

  it('quellenbezogene Bestandsablehnung wird als Einzelresultat weitergegeben', async () => {
    importiereVomInternet.mockResolvedValue({
      art: 'fehler',
      fehler: { grund: 'bereitsVorhanden', meldung: 'BGB ist bereits auf dem Gerät.' },
    });
    const fortschritt = vi.fn();

    const ergebnis = await importiereGesetze(['bgb'], undefined, fortschritt);

    expect(importiereVomInternet).toHaveBeenCalledTimes(1);
    expect(ergebnis.fehlgeschlagene).toEqual([
      {
        kurztitel: 'bgb',
        fehler: { meldung: 'BGB ist bereits auf dem Gerät.', grund: 'bereitsVorhanden' },
      },
    ]);
    expect(fortschritt).toHaveBeenCalledWith('bgb', 'fehler', {
      meldung: 'BGB ist bereits auf dem Gerät.',
      grund: 'bereitsVorhanden',
    });
  });

  it("quelle 'de-bund' (explizit) -> importiereVomInternet, KEIN Fallback bei Fehler", async () => {
    importiereVomInternet.mockResolvedValue({
      art: 'fehler',
      fehler: { meldung: 'nicht gefunden', grund: 'nichtImIndex' },
    });

    const ergebnis = await importiereGesetze(['XYZ'], 'de-bund');

    expect(importiereGesetzVomInternetBW).not.toHaveBeenCalled();
    expect(ergebnis.fehlgeschlagene).toEqual([
      { kurztitel: 'XYZ', fehler: { meldung: 'nicht gefunden', grund: 'nichtImIndex' } },
    ]);
  });

  it('quelle weggelassen + Bund-Fehler + Fallback lohnt sich -> automatischer BW-Versuch', async () => {
    importiereVomInternet.mockResolvedValue({
      art: 'fehler',
      fehler: { meldung: 'nicht gefunden', grund: 'nichtImIndex' },
    });
    importiereGesetzVomInternetBW.mockResolvedValue({ art: 'erfolg', gesetz: gesetz('LG') });

    const ergebnis = await importiereGesetze(['LG']);

    expect(importiereGesetzVomInternetBW).toHaveBeenCalledWith(
      'LG',
      expect.any(Function),
      undefined,
      expect.objectContaining({ referenzenFuer: expect.any(Function) }),
      undefined,
    );
    expect(ergebnis.erfolgreiche).toEqual([gesetz('LG')]);
  });

  it.each(['keineVerbindung', 'download', 'entpacken', 'format', 'speichern'] as const)(
    'quelle weggelassen + Bund-Fehlergrund %s -> kein BW-Versuch',
    async (grund) => {
      importiereVomInternet.mockResolvedValue({
        art: 'fehler',
        fehler: { meldung: 'Keine Internetverbindung.', grund },
      });

      const ergebnis = await importiereGesetze(['XYZ']);

      expect(importiereGesetzVomInternetBW).not.toHaveBeenCalled();
      expect(ergebnis.fehlgeschlagene).toEqual([
        { kurztitel: 'XYZ', fehler: { meldung: 'Keine Internetverbindung.', grund } },
      ]);
    },
  );

  it("quelle 'de-bw' -> importiereGesetzVomInternetBW direkt, ohne Bund-Versuch", async () => {
    importiereGesetzVomInternetBW.mockResolvedValue({ art: 'erfolg', gesetz: gesetz('LG') });

    await importiereGesetze(['LG'], 'de-bw');

    expect(importiereVomInternet).not.toHaveBeenCalled();
    expect(importiereGesetzVomInternetBW).toHaveBeenCalledWith(
      'LG',
      expect.any(Function),
      undefined,
      expect.objectContaining({ referenzenFuer: expect.any(Function) }),
      undefined,
    );
  });

  it("quelle 'eu' mit reinem String -> Fehler, kein Dateizugriff", async () => {
    const ergebnis = await importiereGesetze(['EMRK'], 'eu');

    expect(resolveResource).not.toHaveBeenCalled();
    expect(ergebnis.fehlgeschlagene).toEqual([
      {
        kurztitel: 'EMRK',
        fehler: {
          meldung: 'Für Europa-Recht wird der volle Eintrag (mit Link) benötigt.',
          grund: 'sonstiger',
        },
      },
    ]);
  });

  it("quelle 'eu' mit {kurztitel, abrufkennung} -> liest Ressourcendatei und übergibt sie an importiereGesetzesXML", async () => {
    resolveResource.mockResolvedValue('/resources/europa/emrk.xml');
    readTextFile.mockResolvedValue('<gesetz/>');
    importiereGesetzesXML.mockResolvedValue({ art: 'erfolg', gesetz: gesetz('EMRK') });

    const ergebnis = await importiereGesetze(
      [{ kurztitel: 'EMRK', abrufkennung: 'emrk.xml' }],
      'eu',
    );

    expect(resolveResource).toHaveBeenCalledWith('resources/europa/emrk.xml');
    expect(readTextFile).toHaveBeenCalledWith('/resources/europa/emrk.xml');
    expect(importiereGesetzesXML).toHaveBeenCalledWith(
      '<gesetz/>',
      expect.any(Function),
      undefined,
    );
    expect(ergebnis.erfolgreiche).toEqual([gesetz('EMRK')]);
  });

  it('meldet eine nicht lesbare EU-Bundle-Datei mit stabilem Grund', async () => {
    resolveResource.mockResolvedValue('/resources/europa/emrk.xml');
    readTextFile.mockRejectedValue(new Error('Bundle nicht lesbar'));

    const ergebnis = await importiereGesetze(
      [{ kurztitel: 'EMRK', abrufkennung: 'emrk.xml' }],
      'eu',
    );

    expect(ergebnis.fehlgeschlagene).toEqual([
      {
        kurztitel: 'EMRK',
        fehler: { grund: 'format', meldung: 'Bundle nicht lesbar' },
      },
    ]);
    expect(importiereGesetzesXML).not.toHaveBeenCalled();
  });

  it("fortschritt-Callback: 'laden' vor dem Versuch, 'ok' mit Ergebnis danach", async () => {
    importiereVomInternet.mockResolvedValue({ art: 'erfolg', gesetz: gesetz('BGB') });
    const fortschritt = vi.fn();

    await importiereGesetze(['BGB'], 'de-bund', fortschritt);

    expect(fortschritt).toHaveBeenNthCalledWith(1, 'BGB', 'laden');
    expect(fortschritt).toHaveBeenNthCalledWith(2, 'BGB', 'ok', gesetz('BGB'));
  });

  it("fortschritt-Callback: Fehlerfall meldet 'fehler' mit { fehler }", async () => {
    importiereVomInternet.mockResolvedValue({
      art: 'fehler',
      fehler: { meldung: 'kaputt', grund: 'format' },
    });
    const fortschritt = vi.fn();

    await importiereGesetze(['BGB'], 'de-bund', fortschritt);

    expect(fortschritt).toHaveBeenNthCalledWith(2, 'BGB', 'fehler', {
      meldung: 'kaputt',
      grund: 'format',
    });
  });

  it('fortschritt-Callback: leitet die feingranulare meldung des inneren Imports als 4. Argument durch (Abweichung ggü. Entwurf)', async () => {
    importiereVomInternet.mockImplementation(async (_kuerzel, innererFortschritt) => {
      innererFortschritt?.({ meldung: 'Lade Datei herunter …' });
      return { art: 'erfolg', gesetz: gesetz('BGB') };
    });
    const fortschritt = vi.fn();

    await importiereGesetze(['BGB'], 'de-bund', fortschritt);

    expect(fortschritt).toHaveBeenCalledWith('BGB', 'laden', undefined, 'Lade Datei herunter …');
  });
});

describe('importiereGesetze – Sperre gegen doppelten gleichzeitigen Import', () => {
  it('Sperre bereits vergeben (anderswo läuft derselbe Kurztitel) -> Fehler ohne Netzaufruf, kein "laden"', async () => {
    versucheGesetzSperreZuErhalten.mockResolvedValue(false);
    const fortschritt = vi.fn();

    const ergebnis = await importiereGesetze(['BGB'], 'de-bund', fortschritt);

    expect(importiereVomInternet).not.toHaveBeenCalled();
    expect(ergebnis.fehlgeschlagene).toEqual([
      {
        kurztitel: 'BGB',
        fehler: {
          meldung: 'BGB wird bereits an anderer Stelle importiert oder aktualisiert.',
          grund: 'beschaeftigt',
        },
      },
    ]);
    expect(fortschritt).toHaveBeenCalledWith('BGB', 'fehler', {
      meldung: 'BGB wird bereits an anderer Stelle importiert oder aktualisiert.',
      grund: 'beschaeftigt',
    });
    expect(gibGesetzSperreFrei).not.toHaveBeenCalled();
  });

  it('Bestandsprüfung der Quelle erfolgt unter der Sperre', async () => {
    ladeAlleGesetze.mockResolvedValue([gesetz('BGB')]);

    await importiereGesetze(['bgb']);

    expect(versucheGesetzSperreZuErhalten).toHaveBeenCalledWith({
      kurztitel: 'bgb',
      normgeber: 'de-bund',
    });
    expect(gibGesetzSperreFrei).toHaveBeenCalledWith({ kurztitel: 'bgb', normgeber: 'de-bund' });
  });

  it('Sperre wird bei Erfolg wieder freigegeben', async () => {
    importiereVomInternet.mockResolvedValue({ art: 'erfolg', gesetz: gesetz('BGB') });

    await importiereGesetze(['BGB'], 'de-bund');

    expect(versucheGesetzSperreZuErhalten).toHaveBeenCalledWith({
      kurztitel: 'BGB',
      normgeber: 'de-bund',
    });
    expect(gibGesetzSperreFrei).toHaveBeenCalledWith({ kurztitel: 'BGB', normgeber: 'de-bund' });
  });

  it('Sperre wird auch bei Fehlschlag wieder freigegeben', async () => {
    importiereVomInternet.mockResolvedValue({
      art: 'fehler',
      fehler: { meldung: 'kaputt', grund: 'format' },
    });

    await importiereGesetze(['BGB'], 'de-bund');

    expect(gibGesetzSperreFrei).toHaveBeenCalledWith({ kurztitel: 'BGB', normgeber: 'de-bund' });
  });

  it('Sperre wird auch bei geworfenem Quellenfehler wieder freigegeben', async () => {
    importiereVomInternet.mockRejectedValue(new Error('kaputt'));

    await importiereGesetze(['BGB'], 'de-bund');

    expect(gibGesetzSperreFrei).toHaveBeenCalledWith({ kurztitel: 'BGB', normgeber: 'de-bund' });
  });
});

// Callback-Fehler bei parallelen Workern: gesetzImportDispatch.parallel.test.ts.

it('wechselt bei automatischer Quellenwahl die vollständige Gesetzsperre von Bund zu BW', async () => {
  importiereVomInternet.mockResolvedValue({
    art: 'fehler',
    fehler: { grund: 'nichtImIndex', meldung: 'fehlt' },
  });
  importiereGesetzVomInternetBW.mockResolvedValue({ art: 'erfolg', gesetz: gesetz('BGB') });
  await importiereGesetze(['BGB']);
  expect(versucheGesetzSperreZuErhalten).toHaveBeenNthCalledWith(1, {
    kurztitel: 'BGB',
    normgeber: 'de-bund',
  });
  expect(versucheGesetzSperreZuErhalten).toHaveBeenNthCalledWith(2, {
    kurztitel: 'BGB',
    normgeber: 'de-bw',
  });
  expect(gibGesetzSperreFrei).toHaveBeenNthCalledWith(1, {
    kurztitel: 'BGB',
    normgeber: 'de-bund',
  });
  expect(gibGesetzSperreFrei).toHaveBeenNthCalledWith(2, { kurztitel: 'BGB', normgeber: 'de-bw' });
  expect(gibGesetzSperreFrei.mock.invocationCallOrder[0]).toBeLessThan(
    versucheGesetzSperreZuErhalten.mock.invocationCallOrder[1]!,
  );
});

it.each(['at-bund', 'de-sn', 'unbekannt', ''])(
  'importiert den nicht unterstützten expliziten Normgeber %s nicht über Bund',
  async (normgeber) => {
    const ergebnis = await importiereGesetze(['TestG'], normgeber);
    expect(ergebnis).toEqual({
      erfolgreiche: [],
      fehlgeschlagene: [
        {
          kurztitel: 'TestG',
          fehler: {
            grund: 'nichtVerfuegbar',
            meldung: '‚TestG‘ ist für den Import nicht verfügbar.',
          },
        },
      ],
    });
    expect(importiereVomInternet).not.toHaveBeenCalled();
    expect(importiereGesetzVomInternetBW).not.toHaveBeenCalled();
    expect(resolveResource).not.toHaveBeenCalled();
    expect(versucheGesetzSperreZuErhalten).not.toHaveBeenCalled();
  },
);

it.each(['de-bund', 'de-bw', 'eu'])(
  'verwendet für %s die vollständige normgeberbezogene Sperre',
  async (normgeber) => {
    const erwartet = normgeber;
    await importiereGesetze(['TestG'], normgeber);
    expect(versucheGesetzSperreZuErhalten).toHaveBeenCalledWith({
      kurztitel: 'TestG',
      normgeber: erwartet,
    });
    expect(gibGesetzSperreFrei).toHaveBeenCalledWith({ kurztitel: 'TestG', normgeber: erwartet });
  },
);

it('versucht bei gesperrtem automatischem Bundimport keinen BW-Import', async () => {
  versucheGesetzSperreZuErhalten.mockResolvedValue(false);
  const ergebnis = await importiereGesetze(['TestG']);
  expect(ergebnis.fehlgeschlagene).toMatchObject([{ fehler: { grund: 'beschaeftigt' } }]);
  expect(importiereVomInternet).not.toHaveBeenCalled();
  expect(importiereGesetzVomInternetBW).not.toHaveBeenCalled();
});

it('importiert und sperrt EMRK unter Europarat ohne Bund-/BW-Download', async () => {
  resolveResource.mockResolvedValue('/resources/europa/EMRK_europarat.xml');
  readTextFile.mockResolvedValue(
    '<gesetz><infos><normgeber>europarat</normgeber></infos></gesetz>',
  );
  importiereGesetzesXML.mockResolvedValue({
    art: 'erfolg',
    gesetz: { kurztitel: 'EMRK', normgeber: 'europarat' },
  });
  const ergebnis = await importiereGesetze(
    [{ kurztitel: 'EMRK', abrufkennung: 'EMRK_europarat.xml' }],
    'europarat',
  );
  expect(ergebnis.erfolgreiche).toMatchObject([{ kurztitel: 'EMRK', normgeber: 'europarat' }]);
  expect(versucheGesetzSperreZuErhalten).toHaveBeenCalledWith({
    kurztitel: 'EMRK',
    normgeber: 'europarat',
  });
  expect(gibGesetzSperreFrei).toHaveBeenCalledWith({ kurztitel: 'EMRK', normgeber: 'europarat' });
  expect(importiereVomInternet).not.toHaveBeenCalled();
  expect(importiereGesetzVomInternetBW).not.toHaveBeenCalled();
});

it('importiert auch abgeleitete CELEX-Angebote aus dem Suchindex', async () => {
  const eintrag = {
    kurztitel: 'VO (EU) 2020/123',
    langtitel: 'Weiterer Rechtsakt',
    abrufkennung: '32020R0123',
  };
  euEintraege.mockResolvedValue([eintrag]);
  importiereVomInternetEU.mockResolvedValue({ art: 'erfolg', gesetz: gesetz(eintrag.kurztitel) });
  const ergebnis = await importiereGesetze([eintrag], 'eu');
  expect(euEintraege).toHaveBeenCalledWith('eu');
  expect(importiereVomInternetEU).toHaveBeenCalledWith(
    eintrag,
    expect.any(Function),
    undefined,
    expect.any(Object),
    undefined,
  );
  expect(ergebnis.erfolgreiche).toHaveLength(1);
});

// Bestehende Szenarioattrappe des früheren Sammelwegs nur im Testzugang.
vi.mock('@/test/tabs/gesetzSpeicherTestzugang', async (original) => ({
  ...(await original<typeof import('@/test/tabs/gesetzSpeicherTestzugang')>()),
  ladeAlleGesetze: (...args: unknown[]) => ladeAlleGesetze(...args),
}));
