// appDatenZugriff.test.ts
//
// Erste Testrunde für diesen Helper. Mockt @tauri-apps/plugin-fs und
// @tauri-apps/api/path (bisher in keiner Testdatei gemockt) mit einem
// minimalen In-Memory-Dateisystem. Fokus liegt auf der Pfad-Auflösung
// (appDatenBasisPfad wird laut Kopfkommentar für die Laufzeit der App
// GECACHT – localDataDir()/join() dürfen also nur EINMAL aufgerufen werden,
// unabhängig davon, wie oft appDatenLesen/appDatenSchreiben/… danach
// aufgerufen werden) sowie auf den dünnen Wrappern selbst (korrekte
// Parameter-Weiterleitung an die zugrunde liegenden fs-Funktionen).
//
// Da appDatenBasisPfad() modulintern in einer Variable gecacht wird
// (nicht zurücksetzbar), braucht jeder Test, der das Cache-Verhalten selbst
// prüft, einen frischen Modul-Import via vi.resetModules() + dynamischem
// import() – ein einzelner globaler Import würde den Cache über alle Tests
// hinweg teilen und die Call-Counts der Mocks verfälschen.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const localDataDirMock = vi.fn(() => Promise.resolve('/Users/test/Library/Application Support'));
const joinMock = vi.fn((...teile: string[]) => Promise.resolve(teile.join('/')));

const readTextFileMock = vi.fn();
const writeTextFileMock = vi.fn();
const invokeMock = vi.fn();
const removeMock = vi.fn();
const readDirMock = vi.fn();
const existsMock = vi.fn();
const mkdirMock = vi.fn();
const pruefeSchemaversionMock = vi.fn().mockResolvedValue(undefined);
vi.mock('@/lib/persistenz/kern/schemaversionHinweis', () => ({
  pruefeSchemaversion: pruefeSchemaversionMock,
}));

vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: localDataDirMock,
  join: joinMock,
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: readTextFileMock,
  writeTextFile: writeTextFileMock,
  remove: removeMock,
  readDir: readDirMock,
  exists: existsMock,
  mkdir: mkdirMock,
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Pfad-Auflösung + Caching
// ---------------------------------------------------------------------------

describe('Pfad-Auflösung', () => {
  it('löst einen relativen Pfad zu "<localDataDir>/LexLata/<relativerPfad>" auf', async () => {
    vi.resetModules();
    const { appDatenLesen } = await import('./appDatenZugriff');
    readTextFileMock.mockResolvedValue('inhalt');

    await appDatenLesen('favoriten/BGB-favoriten.xml');

    expect(readTextFileMock).toHaveBeenCalledWith(
      '/Users/test/Library/Application Support/LexLata/favoriten/BGB-favoriten.xml',
      undefined,
    );
  });

  it('MUTATIONSTEST: cacht den Basispfad – localDataDir() wird über mehrere Aufrufe hinweg nur EINMAL aufgerufen (join() dagegen einmal für den Basispfad PLUS einmal je relativem Pfad)', async () => {
    vi.resetModules();
    const { appDatenLesen, appDatenSchreiben, appDatenExistiert } =
      await import('./appDatenZugriff');
    readTextFileMock.mockResolvedValue('a');
    invokeMock.mockResolvedValue(undefined);
    existsMock.mockResolvedValue(true);

    await appDatenLesen('a.xml');
    await appDatenSchreiben('b.xml', 'x');
    await appDatenExistiert('c.xml');

    // localDataDir(): nur der erste Aufruf löst wirklich auf, der Rest kommt
    // aus dem gecachten Promise.
    expect(localDataDirMock).toHaveBeenCalledTimes(1);
    // Schreiben löst absichtlich keinen JS-seitigen absoluten Pfad mehr auf.
    // join(): 1x für den Basispfad + je 1x für Lesen und Existenzprüfung.
    expect(joinMock).toHaveBeenCalledTimes(3);
  });

  it('MUTATIONSTEST: parallele Erst-Aufrufe (vor Auflösung des Caches) lösen localDataDir() trotzdem nur einmal aus (kein Race durch fehlendes Promise-Caching)', async () => {
    vi.resetModules();
    const { appDatenLesen } = await import('./appDatenZugriff');
    readTextFileMock.mockResolvedValue('a');

    await Promise.all([appDatenLesen('a.xml'), appDatenLesen('b.xml'), appDatenLesen('c.xml')]);

    expect(localDataDirMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Dünne Wrapper – korrekte Weiterleitung an die fs-Funktionen
// ---------------------------------------------------------------------------

describe('Wrapper-Funktionen', () => {
  it('prüft den gelesenen Inhalt und gibt ihn unverändert zurück', async () => {
    vi.resetModules();
    const { appDatenLesen } = await import('./appDatenZugriff');
    readTextFileMock.mockResolvedValue('<gesetz version="2"/>');
    await expect(appDatenLesen('a.xml')).resolves.toBe('<gesetz version="2"/>');
    expect(pruefeSchemaversionMock).toHaveBeenCalledWith('<gesetz version="2"/>', undefined);
  });
  it('appDatenLesenOderNull liefert Inhalt und bildet Lesefehler auf null ab', async () => {
    vi.resetModules();
    const { appDatenLesenOderNull } = await import('./appDatenZugriff');
    readTextFileMock.mockResolvedValueOnce('<xml/>').mockRejectedValueOnce(new Error('fehlt'));

    await expect(appDatenLesenOderNull('a.xml')).resolves.toBe('<xml/>');
    await expect(appDatenLesenOderNull('b.xml')).resolves.toBeNull();
  });

  it('appDatenLesen reicht optionen an readTextFile weiter und liefert dessen Ergebnis zurück', async () => {
    vi.resetModules();
    const { appDatenLesen } = await import('./appDatenZugriff');
    readTextFileMock.mockResolvedValue('<xml/>');

    const ergebnis = await appDatenLesen('a.xml', { baseDir: undefined } as never);

    expect(ergebnis).toBe('<xml/>');
    expect(readTextFileMock).toHaveBeenCalledWith(expect.stringContaining('a.xml'), {
      baseDir: undefined,
    });
  });

  it('appDatenSchreiben reicht relativen Pfad und Inhalt an den nativen Command weiter', async () => {
    vi.resetModules();
    const { appDatenSchreiben } = await import('./appDatenZugriff');
    invokeMock.mockResolvedValue(undefined);

    await appDatenSchreiben('a.xml', 'INHALT');

    expect(invokeMock).toHaveBeenCalledWith('atomar_datei_schreiben', {
      relativerPfad: 'a.xml',
      inhalt: 'INHALT',
    });
    expect(writeTextFileMock).not.toHaveBeenCalled();
  });

  it('appDatenLoeschen löscht auch ohne Token nativ koordiniert', async () => {
    vi.resetModules();
    const { appDatenLoeschen } = await import('./appDatenZugriff');
    removeMock.mockResolvedValue(undefined);

    await appDatenLoeschen('a.xml');

    expect(invokeMock).toHaveBeenCalledWith('app_daten_loeschen', { relativerPfad: 'a.xml' });
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('appDatenOrdnerLesen ruft readDir mit dem aufgelösten Pfad auf und liefert dessen Ergebnis', async () => {
    vi.resetModules();
    const { appDatenOrdnerLesen } = await import('./appDatenZugriff');
    const eintraege = [{ name: 'x.xml', isFile: true, isDirectory: false, isSymlink: false }];
    readDirMock.mockResolvedValue(eintraege);

    const ergebnis = await appDatenOrdnerLesen('favoriten');

    expect(ergebnis).toBe(eintraege);
    expect(readDirMock).toHaveBeenCalledWith(expect.stringContaining('favoriten'), undefined);
  });

  it('appDatenExistiert liefert den Boolean von exists() unverändert zurück', async () => {
    vi.resetModules();
    const { appDatenExistiert } = await import('./appDatenZugriff');
    existsMock.mockResolvedValue(false);

    expect(await appDatenExistiert('a.xml')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sicherstelleOrdner
// ---------------------------------------------------------------------------

describe('sicherstelleOrdner', () => {
  it('ruft mkdir mit recursive:true am aufgelösten Ordnerpfad auf', async () => {
    vi.resetModules();
    const { sicherstelleOrdner } = await import('./appDatenZugriff');
    mkdirMock.mockResolvedValue(undefined);

    await sicherstelleOrdner('favoriten');

    expect(mkdirMock).toHaveBeenCalledWith(expect.stringContaining('favoriten'), {
      recursive: true,
    });
  });

  it('MUTATIONSTEST: schluckt einen Fehler von mkdir still (z.B. "Ordner existiert bereits") statt ihn zu werfen', async () => {
    vi.resetModules();
    const { sicherstelleOrdner } = await import('./appDatenZugriff');
    mkdirMock.mockRejectedValue(new Error('existiert bereits'));

    await expect(sicherstelleOrdner('favoriten')).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// EINSTELLUNGEN_ORDNER
// ---------------------------------------------------------------------------

describe('EINSTELLUNGEN_ORDNER', () => {
  it('MUTATIONSTEST: ist der stabile Ordnername "einstellungen" (Persistenz-Vertrag, siehe gesetzeskurzbefehlSpeicher.ts/fensterSpeicher-Nachbarn)', async () => {
    vi.resetModules();
    const { EINSTELLUNGEN_ORDNER } = await import('./appDatenZugriff');
    expect(EINSTELLUNGEN_ORDNER).toBe('einstellungen');
  });
});

it('reicht Sperrtoken an Schreiben und native Löschung weiter', async () => {
  const { appDatenSchreiben, appDatenLoeschen } = await import('./appDatenZugriff');
  await appDatenSchreiben('a.xml', 'inhalt', 'token');
  expect(invokeMock).toHaveBeenCalledWith('atomar_datei_schreiben', {
    relativerPfad: 'a.xml',
    inhalt: 'inhalt',
    token: 'token',
  });
  await appDatenLoeschen('a.xml', 'token');
  expect(invokeMock).toHaveBeenCalledWith('app_daten_loeschen', {
    relativerPfad: 'a.xml',
    token: 'token',
  });
  expect(removeMock).not.toHaveBeenCalled();
});

it('reicht native Löschfehler ohne Token unverändert weiter', async () => {
  const { appDatenLoeschen } = await import('./appDatenZugriff');
  const fehler = new Error('native Löschung fehlgeschlagen');
  invokeMock.mockRejectedValueOnce(fehler);
  await expect(appDatenLoeschen('a.xml')).rejects.toBe(fehler);
  expect(removeMock).not.toHaveBeenCalled();
});

it('reicht Vorgangsverweise für Schreiben und Löschen bis zum nativen Command', async () => {
  const { appDatenSchreiben, appDatenLoeschen } = await import('./appDatenZugriff');
  await appDatenSchreiben('gesetze/BGB.xml', 'text', undefined, 'v1');
  await appDatenLoeschen('gesetze/BGB.xml', 't1', 'v2');
  expect(invokeMock).toHaveBeenCalledWith('atomar_datei_schreiben', {
    relativerPfad: 'gesetze/BGB.xml',
    inhalt: 'text',
    vorgang: 'v1',
  });
  expect(invokeMock).toHaveBeenCalledWith('app_daten_loeschen', {
    relativerPfad: 'gesetze/BGB.xml',
    token: 't1',
    vorgang: 'v2',
  });
});

it('reicht nur die enge Verarbeitungszeit-Auffrischung mit verpflichtendem Dateitoken durch', async () => {
  const { appDatenVerarbeitungszeitAuffrischen } = await import('./appDatenZugriff');
  await appDatenVerarbeitungszeitAuffrischen('gesetze/BGB.XML', '<gesetz/>', 'token');
  expect(invokeMock).toHaveBeenCalledWith('atomar_datei_schreiben', {
    relativerPfad: 'gesetze/BGB.XML',
    inhalt: '<gesetz/>',
    token: 'token',
    nurVerarbeitungszeit: true,
  });
});
