import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetch = vi.fn<() => Promise<{ ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }>>();
const ladeAlleGesetze = vi.fn<() => Promise<{ normgeber: string; kurztitel: string }[]>>();
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
  ladeAlleGesetze: () => ladeAlleGesetze(),
}));
const sucheImImportindex =
  vi.fn<() => Promise<{ kurztitel: string; abrufkennung: string } | null>>();
const importiereBundXML = vi.fn<() => { xmlString?: string; fehler?: string }>();
const taggeUndSpeichereGesetzesXML = vi.fn<(...args: unknown[]) => Promise<{ fehler?: string }>>();
const unzipSync = vi.fn<() => Record<string, Uint8Array>>();

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: () => fetch() }));
vi.mock('@/lib/import/importindex/importindex.index', () => ({
  sucheImImportindex: () => sucheImImportindex(),
  ImportindexFormatFehler: class ImportindexFormatFehler extends Error {
    constructor() {
      super(
        'Ungültiges Importindex-XML. Bitte den Importindex wiederherstellen oder aktualisieren.',
      );
    }
  },
}));
vi.mock('@/lib/import/bund/XMLImporterBund', () => ({
  importiereBundXML: () => importiereBundXML(),
}));
vi.mock('@/lib/import/importabschluss/importabschluss.index', async (original) => ({
  ...(await original<object>()),
  taggeUndSpeichereGesetzesXML: (...args: unknown[]) => taggeUndSpeichereGesetzesXML(...args),
}));
vi.mock('fflate', () => ({ unzipSync: () => unzipSync() }));

import { importiereVomInternet, aktualisierungVomInternet } from './gesetzImportBund';
import { ImportindexFormatFehler } from '@/lib/import/importindex/importindex.index';

beforeEach(() => {
  vi.clearAllMocks();
  ladeAlleGesetze.mockResolvedValue([]);
  sucheImImportindex.mockResolvedValue({ kurztitel: 'BGB', abrufkennung: 'bgb' });
  fetch.mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(1) });
  unzipSync.mockReturnValue({ 'bgb.xml': new TextEncoder().encode('<norm/>') });
  importiereBundXML.mockReturnValue({ xmlString: '<gesetz/>' });
  taggeUndSpeichereGesetzesXML.mockResolvedValue({});
});

describe('Bundesrecht-Importfehler', () => {
  it('meldet ungültiges Index-XML als Formatfehler, ohne einen Download zu beginnen', async () => {
    sucheImImportindex.mockRejectedValueOnce(new ImportindexFormatFehler());
    await expect(importiereVomInternet('BGB')).resolves.toEqual({
      art: 'fehler',
      fehler: {
        grund: 'format',
        meldung:
          'Ungültiges Importindex-XML. Bitte den Importindex wiederherstellen oder aktualisieren.',
      },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('unterscheidet fehlenden Indexeintrag und HTTP-Fehler', async () => {
    sucheImImportindex.mockResolvedValueOnce(null);
    expect(await importiereVomInternet('BGB')).toMatchObject({
      art: 'fehler',
      fehler: { grund: 'nichtImIndex' },
    });

    fetch.mockResolvedValueOnce({ ok: false, arrayBuffer: async () => new ArrayBuffer(0) });
    expect(await importiereVomInternet('BGB')).toMatchObject({
      art: 'fehler',
      fehler: { grund: 'download' },
    });
  });

  it('kennzeichnet Verbindungs-, ZIP- und Parserfehler an ihrer Entstehungsstelle', async () => {
    fetch.mockRejectedValueOnce(new TypeError('offline'));
    expect(await importiereVomInternet('BGB')).toMatchObject({
      art: 'fehler',
      fehler: {
        grund: 'keineVerbindung',
        meldung:
          'Keine Verbindung zu gesetze-im-internet.de möglich. Bitte später erneut versuchen. Ursache: TypeError: offline',
      },
    });

    unzipSync.mockImplementationOnce(() => {
      throw new Error('ungültiges ZIP');
    });
    expect(await importiereVomInternet('BGB')).toMatchObject({
      art: 'fehler',
      fehler: { grund: 'entpacken' },
    });

    importiereBundXML.mockReturnValueOnce({ fehler: 'ungültiges XML' });
    expect(await importiereVomInternet('BGB')).toMatchObject({
      art: 'fehler',
      fehler: { grund: 'format' },
    });
  });

  it('behandelt einen Fehler beim Lesen der HTTP-Antwort als Downloadfehler', async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => {
        throw new Error('Antwort unvollständig');
      },
    });

    expect(await importiereVomInternet('BGB')).toMatchObject({
      art: 'fehler',
      fehler: { grund: 'download' },
    });
  });

  it('gibt einen Speicherfehler des Abschlusses als eindeutigen Importfehler weiter', async () => {
    taggeUndSpeichereGesetzesXML.mockResolvedValueOnce({
      art: 'fehler',
      fehler: { grund: 'speichern', meldung: 'Gesetz konnte nicht gespeichert werden.' },
    } as never);

    await expect(importiereVomInternet('BGB')).resolves.toEqual({
      art: 'fehler',
      fehler: { grund: 'speichern', meldung: 'Gesetz konnte nicht gespeichert werden.' },
    });
  });
});

describe('Reparaturzielweitergabe', () => {
  it('reicht Ziel und Schreibprüfung unverändert bis zum gemeinsamen Abschluss weiter', async () => {
    const zielpruefung = {
      ziel: { dateiBasis: 'BGB', kurztitel: 'BGB', quelle: 'de-bund' as const },
      vorSchreiben: vi.fn(async () => {}),
    };
    await importiereVomInternet('BGB', undefined, zielpruefung);
    expect(taggeUndSpeichereGesetzesXML.mock.calls[0]?.[6]).toBe(zielpruefung);
    expect(zielpruefung.vorSchreiben).not.toHaveBeenCalled();
  });

  it('reicht einen gezielten Abbruch des Abschlusses unverändert durch', async () => {
    const abbruch = new Error('Ziel inzwischen gültig');
    taggeUndSpeichereGesetzesXML.mockRejectedValueOnce(abbruch);
    await expect(importiereVomInternet('BGB')).rejects.toBe(abbruch);
  });
});

describe('Quellenbezogene Bestandsidentität', () => {
  it('schützt die aufgelöste Quelle case-insensitiv vor dem Download', async () => {
    ladeAlleGesetze.mockResolvedValue([{ normgeber: 'de-bund', kurztitel: 'bgb' }]);
    expect(await importiereVomInternet('Alias')).toMatchObject({
      art: 'fehler',
      fehler: { grund: 'bereitsVorhanden', meldung: 'bgb ist bereits auf dem Gerät.' },
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(sucheImImportindex).toHaveBeenCalledTimes(1);
  });
  it.each(['de-bw', 'eu'])('andere Quelle %s blockiert nicht', async (normgeber) => {
    ladeAlleGesetze.mockResolvedValue([{ normgeber, kurztitel: 'BGB' }]);
    await importiereVomInternet('BGB');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('Reparaturziel wird durch die Erstimportprüfung nicht blockiert', async () => {
    ladeAlleGesetze.mockResolvedValue([{ normgeber: 'de-bund', kurztitel: 'BGB' }]);
    await importiereVomInternet('BGB', undefined, {
      ziel: { dateiBasis: 'ziel', kurztitel: 'BGB', quelle: 'de-bund' },
      vorSchreiben: async () => {},
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

it('schützt auch abweichend geschriebene Normgeber vor doppeltem Import', async () => {
  ladeAlleGesetze.mockResolvedValue([{ normgeber: 'de-bund', kurztitel: 'bgb' }]);
  expect(await importiereVomInternet('BGB')).toMatchObject({
    art: 'fehler',
    fehler: { grund: 'bereitsVorhanden', meldung: 'bgb ist bereits auf dem Gerät.' },
  });
  expect(fetch).not.toHaveBeenCalled();
});

// Charakterisierung vor der Quellenextraktion: Aktualisierung verwendet die
// bestehende Identität und den gemeinsamen Speicherabschluss.
it('aktualisiert ohne Erstimport-Bestandsprüfung und speichert mit bestehendem Gesetz', async () => {
  const gesetz = { kurztitel: 'BGB', normgeber: 'de-bund' };
  await aktualisierungVomInternet(gesetz as never);
  expect(ladeAlleGesetze).not.toHaveBeenCalled();
  expect(taggeUndSpeichereGesetzesXML).toHaveBeenCalledTimes(1);
  expect(taggeUndSpeichereGesetzesXML.mock.calls[0]?.[4]).toBe(true);
  expect(taggeUndSpeichereGesetzesXML.mock.calls[0]?.[5]).toBe(gesetz);
});

// Bestehende Szenarioattrappe des früheren Sammelwegs nur im Testzugang.
vi.mock('@/test/tabs/gesetzSpeicherTestzugang', async (original) => ({
  ...(await original<typeof import('@/test/tabs/gesetzSpeicherTestzugang')>()),
  ladeAlleGesetze: () => ladeAlleGesetze(),
}));
