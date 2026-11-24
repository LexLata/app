// Prüft das Messwerkzeug über seine Bedienfunktion; nur Tauri und Dateisystem sind ersetzt.
import { it, expect, vi, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { messeSuchverzeichnis } from './laden-bei-bedarf-browser';

const io = vi.hoisted(() => ({ dateien: new Map<string, string>(), aufrufe: vi.fn() }));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/messkonto',
  join: async (...teile: string[]) => teile.join('/'),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: async (pfad: string) => {
    const text = io.dateien.get(pfad.replace('/messkonto/LexLata/', ''));
    if (text === undefined) throw new Error('Datei fehlt');
    return text;
  },
  readDir: async () =>
    [...io.dateien.keys()]
      .filter((p) => p.startsWith('gesetze/'))
      .map((p) => ({
        name: p.slice('gesetze/'.length),
        isDirectory: false,
      })),
}));
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (befehl: string, args: { relativerPfad: string; inhalt: string }) => {
    io.aufrufe(befehl, args);
    if (befehl === 'datei_sperre_erwerben') return 'messtoken';
    if (befehl === 'gesetz_dateistempel_lesen')
      return [...io.dateien]
        .filter(([pfad]) => pfad.startsWith('gesetze/'))
        .map(([pfad, inhalt]) => ({
          name: pfad.slice(8),
          dateistempel: { groesse: String(Buffer.byteLength(inhalt)), aenderungszeit: '1' },
        }));
    if (befehl === 'atomar_datei_schreiben') io.dateien.set(args.relativerPfad, args.inhalt);
  },
}));
afterEach(() => {
  io.dateien.clear();
  io.aufrufe.mockClear();
});

async function vorbereiten() {
  const vorlage = await readFile('docs/doku/testdaten/mkn-gesetz.xml', 'utf8');
  const dateien = Array.from({ length: 28 }, (_, i) => {
    const titel = `MessG${String(i + 1).padStart(4, '0')}`;
    const xml = vorlage.replace('<kurztitel>MKN</kurztitel>', `<kurztitel>${titel}</kurztitel>`);
    const name = `${titel}_de-bund.xml`;
    io.dateien.set(`gesetze/${name}`, xml);
    return {
      name,
      bytes: Buffer.byteLength(xml),
      sha256: createHash('sha256').update(xml).digest('hex'),
    };
  });
  io.dateien.set(
    'messbestand.json',
    JSON.stringify({ version: 1, bestaende: [{ anzahl: 28, dateien }] }),
  );
}

it('misst echte Suchnormdaten und den gesperrten Lesen-Ändern-Schreiben-Weg in eigener Datei', async () => {
  await vorbereiten();
  const ergebnis = await messeSuchverzeichnis(28);
  const json = io.dateien.get('messung-suchverzeichnis.json')!;
  const daten = JSON.parse(json);
  expect(daten.eintraege).toHaveLength(28);
  expect(daten.eintraege[0].normen[0]).toMatchObject({
    xmlId: 'n1-Art',
    bezeichnung: 'Art. 1',
    istArtikel: true,
    artikelkennzeichen: null,
    normzahlen: ['1'],
    bereich: null,
    nebennormzahl: null,
  });
  expect(ergebnis.bytes).toBe(Buffer.byteLength(json));
  expect(io.aufrufe.mock.calls.filter(([b]) => b === 'atomar_datei_schreiben')).toHaveLength(2);
  expect(io.aufrufe).toHaveBeenCalledWith(
    'atomar_datei_schreiben',
    expect.objectContaining({
      relativerPfad: 'messung-suchverzeichnis.json',
      token: 'messtoken',
    }),
  );
});

it('bricht ohne Schreiben ab, sobald der Bestand vom Manifest abweicht', async () => {
  await vorbereiten();
  io.dateien.set('gesetze/EchtG_de-bund.xml', 'Nutzerdaten');
  await expect(messeSuchverzeichnis(28)).rejects.toThrow('Gesetzesordner passt nicht');
  expect(io.aufrufe).not.toHaveBeenCalled();
});

it('bricht ohne Schreiben ab, wenn eine Messdatei verändert wurde', async () => {
  await vorbereiten();
  io.dateien.set('gesetze/MessG0001_de-bund.xml', 'verändert');
  await expect(messeSuchverzeichnis(28)).rejects.toThrow('Messdatei verändert');
  expect(io.aufrufe).not.toHaveBeenCalled();
});

it('bricht mit verständlichem Befund ab, wenn eine bestätigte Messdatei kein Gesetz enthält', async () => {
  await vorbereiten();
  const xml = '<kein-gesetz />';
  const name = 'MessG0001_de-bund.xml';
  io.dateien.set(`gesetze/${name}`, xml);
  const manifest = JSON.parse(io.dateien.get('messbestand.json')!);
  Object.assign(manifest.bestaende[0].dateien[0], {
    bytes: Buffer.byteLength(xml),
    sha256: createHash('sha256').update(xml).digest('hex'),
  });
  io.dateien.set('messbestand.json', JSON.stringify(manifest));
  await expect(messeSuchverzeichnis(28)).rejects.toThrow(`Keine lesbare Gesetzesdatei: ${name}`);
  expect(io.aufrufe).not.toHaveBeenCalled();
});
