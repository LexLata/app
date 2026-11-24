import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
const pruefeErreichbarkeit = vi.fn<(...args: unknown[]) => Promise<{ fehler?: string }>>();
const invoke = vi.fn<(...args: unknown[]) => Promise<string>>();
const importiereGesetzHTMLBW = vi.fn<() => { xmlString?: string; fehler?: string }>();
const taggeUndSpeichereGesetzesXML = vi.fn<(...args: unknown[]) => Promise<{ fehler?: string }>>();

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
vi.mock('@/lib/import/basis/basis.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  pruefeQuelleErreichbar: () => pruefeErreichbarkeit(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: (...args: unknown[]) => invoke(...args) }));
vi.mock('@/lib/import/bw/HTMLImporterBW', () => ({
  LANDESRECHT_BW_QUELLE: 'Landesrecht BW',
  importiereGesetzHTMLBW: () => importiereGesetzHTMLBW(),
}));
vi.mock('@/lib/import/importabschluss/importabschluss.index', async (original) => ({
  ...(await original<object>()),
  taggeUndSpeichereGesetzesXML: (...args: unknown[]) => taggeUndSpeichereGesetzesXML(...args),
}));

import { importiereGesetzVomInternetBW, aktualisierungGesetzVomInternetBW } from './gesetzImportBW';
import { ImportindexFormatFehler } from '@/lib/import/importindex/importindex.index';

beforeEach(() => {
  vi.clearAllMocks();
  ladeAlleGesetze.mockResolvedValue([]);
  sucheImImportindex.mockResolvedValue({ kurztitel: 'LBO', abrufkennung: 'lbo' });
  pruefeErreichbarkeit.mockResolvedValue({});
  invoke.mockResolvedValue('<html/>');
  importiereGesetzHTMLBW.mockReturnValue({ xmlString: '<gesetz/>' });
  taggeUndSpeichereGesetzesXML.mockResolvedValue({});
});

describe('Landesrecht-BW-Importfehler', () => {
  it('meldet ungültiges Index-XML als Formatfehler, ohne WebView zu starten', async () => {
    sucheImImportindex.mockRejectedValueOnce(new ImportindexFormatFehler());
    await expect(importiereGesetzVomInternetBW('LBO')).resolves.toEqual({
      art: 'fehler',
      fehler: {
        grund: 'format',
        meldung:
          'Ungültiges Importindex-XML. Bitte den Importindex wiederherstellen oder aktualisieren.',
      },
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('unterscheidet fehlenden Indexeintrag und Verbindungsfehler', async () => {
    sucheImImportindex.mockResolvedValueOnce(null);
    expect(await importiereGesetzVomInternetBW('LBO')).toMatchObject({
      art: 'fehler',
      fehler: { grund: 'nichtImIndex' },
    });

    pruefeErreichbarkeit.mockResolvedValueOnce({ fehler: 'offline' });
    expect(await importiereGesetzVomInternetBW('LBO')).toMatchObject({
      art: 'fehler',
      fehler: { grund: 'keineVerbindung' },
    });
  });

  it('unterscheidet WebView-Downloadfehler und Parserfehler', async () => {
    invoke.mockRejectedValueOnce(new Error('WebView kaputt'));
    expect(await importiereGesetzVomInternetBW('LBO')).toMatchObject({
      art: 'fehler',
      fehler: { grund: 'download' },
    });

    importiereGesetzHTMLBW.mockReturnValueOnce({ fehler: 'ungültiges HTML' });
    expect(await importiereGesetzVomInternetBW('LBO')).toMatchObject({
      art: 'fehler',
      fehler: { grund: 'format' },
    });
  });

  it('gibt einen Speicherfehler des Abschlusses als eindeutigen Importfehler weiter', async () => {
    taggeUndSpeichereGesetzesXML.mockResolvedValueOnce({
      art: 'fehler',
      fehler: { grund: 'speichern', meldung: 'Gesetz konnte nicht gespeichert werden.' },
    } as never);

    await expect(importiereGesetzVomInternetBW('LBO')).resolves.toEqual({
      art: 'fehler',
      fehler: { grund: 'speichern', meldung: 'Gesetz konnte nicht gespeichert werden.' },
    });
  });
});

describe('Reparaturzielweitergabe', () => {
  it('reicht Ziel und Schreibprüfung unverändert bis zum gemeinsamen Abschluss weiter', async () => {
    const zielpruefung = {
      ziel: { dateiBasis: 'LBO_de-bw', kurztitel: 'LBO', quelle: 'de-bw' as const },
      vorSchreiben: vi.fn(async () => {}),
    };
    await importiereGesetzVomInternetBW('LBO', undefined, zielpruefung);
    expect(taggeUndSpeichereGesetzesXML.mock.calls[0]?.[6]).toBe(zielpruefung);
    expect(zielpruefung.vorSchreiben).not.toHaveBeenCalled();
  });

  it('reicht einen gezielten Abbruch des Abschlusses unverändert durch', async () => {
    const abbruch = new Error('Ziel inzwischen gültig');
    taggeUndSpeichereGesetzesXML.mockRejectedValueOnce(abbruch);
    await expect(importiereGesetzVomInternetBW('LBO')).rejects.toBe(abbruch);
  });
});

describe('Quellenbezogene Bestandsidentität', () => {
  it('schützt die aufgelöste Quelle case-insensitiv vor dem Download', async () => {
    ladeAlleGesetze.mockResolvedValue([{ normgeber: 'de-bw', kurztitel: 'lbo' }]);
    expect(await importiereGesetzVomInternetBW('Alias')).toMatchObject({
      art: 'fehler',
      fehler: { grund: 'bereitsVorhanden', meldung: 'lbo ist bereits auf dem Gerät.' },
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(sucheImImportindex).toHaveBeenCalledTimes(1);
  });
  it.each(['de-bund', 'eu'])('andere Quelle %s blockiert nicht', async (normgeber) => {
    ladeAlleGesetze.mockResolvedValue([{ normgeber, kurztitel: 'LBO' }]);
    await importiereGesetzVomInternetBW('LBO');
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it('Reparaturziel wird durch die Erstimportprüfung nicht blockiert', async () => {
    ladeAlleGesetze.mockResolvedValue([{ normgeber: 'de-bw', kurztitel: 'LBO' }]);
    await importiereGesetzVomInternetBW('LBO', undefined, {
      ziel: { dateiBasis: 'ziel', kurztitel: 'LBO', quelle: 'de-bw' },
      vorSchreiben: async () => {},
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

it('schützt auch abweichend geschriebene Normgeber vor doppeltem Import', async () => {
  ladeAlleGesetze.mockResolvedValue([{ normgeber: 'de-bw', kurztitel: 'lbo' }]);
  expect(await importiereGesetzVomInternetBW('LBO')).toMatchObject({
    art: 'fehler',
    fehler: { grund: 'bereitsVorhanden', meldung: 'lbo ist bereits auf dem Gerät.' },
  });
  expect(invoke).not.toHaveBeenCalled();
});

it('lädt das einzelne Gesetz mit dem registrierten BW-Command und meldet Gesetz', async () => {
  const fortschritt = vi.fn();
  await importiereGesetzVomInternetBW('LBO', fortschritt);
  expect(invoke).toHaveBeenCalledWith('lade_gesetz_html_bw', { kuerzel: 'lbo' });
  expect(fortschritt).toHaveBeenCalledWith({
    phase: 'download',
    meldung: 'Lade Gesetz „LBO" (WebView) …',
  });
});

it('registriert den Einzelgesetz-Command für Desktop im nativen Landesrecht-Modul', () => {
  const registrierung = readFileSync('src-tauri/src/lib.rs', 'utf8');
  expect(registrierung).toContain('landesrecht_import::lade_gesetz_html_bw,');
  const modul = readFileSync('src-tauri/src/landesrecht_import.rs', 'utf8');
  expect(modul).toMatch(/#\[tauri::command\]\s+pub async fn lade_gesetz_html_bw\(/);
});

// Charakterisierung vor der Quellenextraktion: Aktualisierung verwendet die
// bestehende Identität und den gemeinsamen Speicherabschluss.
it('aktualisiert ohne Erstimport-Bestandsprüfung und speichert mit bestehendem Gesetz', async () => {
  const gesetz = { kurztitel: 'LBO', normgeber: 'de-bw' };
  await aktualisierungGesetzVomInternetBW(gesetz as never);
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
