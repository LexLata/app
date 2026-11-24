// gesetzDateiImport.test.ts
//
// Tests für importierePfade. Mocking-Muster analog zu
// importindexVorinstallation.test.ts (Fehler-Isolation zwischen Dateien,
// @tauri-apps/plugin-fs gemockt).
//
// Prüft zusätzlich die native Übergabe und unveränderte gewählte Dateipfade.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DateiImportErgebnis } from '@/lib/import-export/datei-import/dateiImport.types';

const { entpackeZip, verarbeiteDateien } = vi.hoisted(() => ({
  entpackeZip: vi.fn(),
  verarbeiteDateien: vi.fn(),
}));
vi.mock('@/lib/import-export/datei-import/dateiImport', () => ({
  entpackeZip,
  verarbeiteDateien,
}));

const { readTextFile, readFile } = vi.hoisted(() => ({
  readTextFile: vi.fn(),
  readFile: vi.fn(),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({ readTextFile, readFile }));

const open = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/plugin-dialog', () => ({ open }));

import { importierePfade, waehleImportDateien } from './gesetzDateiImport';

function leeresErgebnis(): DateiImportErgebnis {
  return { konflikte: [], berichtEintraege: [], fehler: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('importierePfade', () => {
  it('liest eine Textdatei (kein .zip) über readTextFile und übergibt sie an verarbeiteDateien', async () => {
    readTextFile.mockResolvedValue('<gesetz/>');
    verarbeiteDateien.mockResolvedValue(leeresErgebnis());

    await importierePfade(['/pfad/zu/BGB.xml']);

    expect(readTextFile).toHaveBeenCalledWith('/pfad/zu/BGB.xml');
    expect(readFile).not.toHaveBeenCalled();
    expect(verarbeiteDateien).toHaveBeenCalledWith(
      [{ name: 'BGB.xml', inhalt: '<gesetz/>', quelle: 'BGB.xml' }],
      undefined,
    );
  });

  it('erkennt .zip unabhängig von Groß-/Kleinschreibung und nutzt readFile + entpackeZip statt readTextFile', async () => {
    const buffer = new ArrayBuffer(4);
    readFile.mockResolvedValue({ buffer });
    entpackeZip.mockResolvedValue([{ name: 'a.xml', inhalt: '<a/>' }]);
    verarbeiteDateien.mockResolvedValue(leeresErgebnis());

    await importierePfade(['/pfad/Export.ZIP']);

    expect(readFile).toHaveBeenCalledWith('/pfad/Export.ZIP');
    expect(entpackeZip).toHaveBeenCalledWith(buffer, 'Export.ZIP');
    expect(readTextFile).not.toHaveBeenCalled();
    expect(verarbeiteDateien).toHaveBeenCalledWith([{ name: 'a.xml', inhalt: '<a/>' }], undefined);
  });

  it('verarbeitet eine gemischte Liste (Text + ZIP) und sammelt alle Dateien für EINEN Aufruf von verarbeiteDateien', async () => {
    readTextFile.mockResolvedValue('<b/>');
    readFile.mockResolvedValue({ buffer: new ArrayBuffer(0) });
    entpackeZip.mockResolvedValue([{ name: 'a.xml', inhalt: '<a/>' }]);
    verarbeiteDateien.mockResolvedValue(leeresErgebnis());

    await importierePfade(['/x/a.zip', '/x/b.xml']);

    expect(verarbeiteDateien).toHaveBeenCalledWith(
      [
        { name: 'a.xml', inhalt: '<a/>' },
        { name: 'b.xml', inhalt: '<b/>', quelle: 'b.xml' },
      ],
      undefined,
    );
  });

  it('Fehler-Isolation: eine nicht lesbare Datei bricht den Import der übrigen Dateien nicht ab', async () => {
    readTextFile
      .mockRejectedValueOnce(new Error('Zugriff verweigert'))
      .mockResolvedValueOnce('<b/>');
    verarbeiteDateien.mockResolvedValue(leeresErgebnis());

    const ergebnis = await importierePfade(['/x/a.xml', '/x/b.xml']);

    expect(verarbeiteDateien).toHaveBeenCalledWith(
      [{ name: 'b.xml', inhalt: '<b/>', quelle: 'b.xml' }],
      undefined,
    );
    expect(ergebnis.fehler).toEqual([
      { grund: 'lesefehler', datei: 'a.xml', detail: 'Error: Zugriff verweigert' },
    ]);
  });

  it('hängt Lese-Fehler an bereits von verarbeiteDateien gemeldete Fehler an, statt sie zu überschreiben', async () => {
    readTextFile.mockRejectedValue(new Error('kaputt'));
    verarbeiteDateien.mockResolvedValue({
      konflikte: [],
      berichtEintraege: [],
      fehler: [{ grund: 'formatUnbekannt', datei: 'v.xml' }],
    });

    const ergebnis = await importierePfade(['/x/a.xml']);

    expect(ergebnis.fehler).toEqual([
      { grund: 'formatUnbekannt', datei: 'v.xml' },
      { grund: 'lesefehler', datei: 'a.xml', detail: 'Error: kaputt' },
    ]);
  });

  it('meldet ein defektes ZIP einmal und bewahrt die Ergebnisse der übrigen Pfade', async () => {
    readFile.mockResolvedValue({ buffer: new ArrayBuffer(4) });
    entpackeZip.mockRejectedValue(new Error('Defektes ZIP'));
    readTextFile.mockResolvedValue('<b/>');
    const verarbeitet = {
      konflikte: [{ art: 'favoriten', anzeigename: 'BGB', importInhalt: '<f/>' }],
      berichtEintraege: [{ kategorie: 'gesetz', aktion: 'neu', name: 'BGB' }],
      fehler: [{ grund: 'formatUnbekannt' as const, datei: 'inhalt.xml' }],
    };
    verarbeiteDateien.mockResolvedValue(verarbeitet);

    const ergebnis = await importierePfade(['/x/a.zip', '/x/b.xml']);

    expect(verarbeiteDateien).toHaveBeenCalledTimes(1);
    expect(verarbeiteDateien).toHaveBeenCalledWith(
      [{ name: 'b.xml', inhalt: '<b/>', quelle: 'b.xml' }],
      undefined,
    );
    expect(ergebnis.konflikte).toEqual(verarbeitet.konflikte);
    expect(ergebnis.berichtEintraege).toEqual(verarbeitet.berichtEintraege);
    expect(ergebnis.fehler).toEqual([
      { grund: 'formatUnbekannt', datei: 'inhalt.xml' },
      { grund: 'lesefehler', datei: 'a.zip', detail: 'Error: Defektes ZIP' },
    ]);
  });

  it('Edge-Case: leere Pfadliste -> verarbeiteDateien wird mit leerem Array aufgerufen', async () => {
    verarbeiteDateien.mockResolvedValue(leeresErgebnis());

    await importierePfade([]);

    expect(verarbeiteDateien).toHaveBeenCalledWith([], undefined);
    expect(readTextFile).not.toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });

  it('leitet den Dateinamen aus dem Pfad ab (funktioniert für "/"- und "\\\\"-Trenner)', async () => {
    readTextFile.mockResolvedValue('<x/>');
    verarbeiteDateien.mockResolvedValue(leeresErgebnis());

    await importierePfade(['C:\\ordner\\Datei.xml']);

    expect(verarbeiteDateien).toHaveBeenCalledWith(
      [{ name: 'Datei.xml', inhalt: '<x/>', quelle: 'Datei.xml' }],
      undefined,
    );
  });
});

it('liefert gewählte Originalpfade unverändert aus der zentralen Dialogübergabe, ohne zu lesen', async () => {
  open.mockResolvedValue(['/Art. 1/§ 2.xml']);
  await expect(waehleImportDateien()).resolves.toEqual(['/Art. 1/§ 2.xml']);
  expect(open).toHaveBeenCalledWith({
    multiple: true,
    filters: [{ name: 'Gesetzesdatei', extensions: ['xml', 'html', 'htm', 'zip'] }],
  });
  expect(readTextFile).not.toHaveBeenCalled();
  expect(verarbeiteDateien).not.toHaveBeenCalled();
});
it.each([null, []])('liefert bei Abbruch %s null ohne Lesen', async (rueckgabe) => {
  open.mockResolvedValue(rueckgabe);
  await expect(waehleImportDateien()).resolves.toBeNull();
  expect(readTextFile).not.toHaveBeenCalled();
  expect(verarbeiteDateien).not.toHaveBeenCalled();
});
it('reicht Dateidialogfehler unverändert weiter', async () => {
  const fehler = new Error('Dateidialog');
  open.mockRejectedValue(fehler);
  await expect(waehleImportDateien()).rejects.toBe(fehler);
});
