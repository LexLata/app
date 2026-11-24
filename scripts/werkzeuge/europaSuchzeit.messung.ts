// europaSuchzeit.messung.ts
// Offline-Messung: vollständiger Produktionsleseweg mit Standardabgleich, danach Trefferberechnung.
import { mkdtemp, readFile, writeFile, rm, readdir, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it, vi } from 'vitest';
import { berechneTreffer } from '@/lib/domain/app/oeffnen/oeffnen.index';
import { sucheKandidatenAlleQuellen } from '@/lib/import/import.index';
const io = vi.hoisted(() => ({
  ordner: '',
  lesen: vi.fn(),
  bundleLesen: vi.fn(),
  schreiben: vi.fn(),
}));
vi.mock('@/lib/persistenz/kern/kern.index', () => ({
  appDatenLesen: io.lesen,
  appDatenSchreiben: io.schreiben,
  sicherstelleOrdner: vi.fn(),
}));
vi.mock('@/lib/plattform/dateipfade', () => ({
  ressourcenPfad: async (pfad: string) => resolve('src-tauri', pfad),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: io.bundleLesen,
  exists: async () => true,
  readDir: async (pfad: string) => (await readdir(pfad)).map((name) => ({ name, isFile: true })),
}));
it('misst Erstladen und anschließende Eingaben ohne erneutes Lesen', async () => {
  io.ordner = await mkdtemp(join(tmpdir(), 'lexlata-suchzeit-'));
  try {
    // Gleiche aktuelle Ressourcen in lokalem Bestand und Bundle: der echte
    // Zeitstempelvergleich läuft vollständig, ohne einen Standard zu schreiben.
    for (const dateiname of ['eu.xml', 'de-bund.xml', 'de-bw.xml']) {
      await writeFile(
        join(io.ordner, dateiname),
        await readFile(`src-tauri/resources/importindizes/${dateiname}`),
      );
    }
    io.bundleLesen.mockImplementation((pfad: string) => readFile(pfad, 'utf8'));
    io.schreiben.mockImplementation(() => {
      throw new Error('Die Messung darf keine Appdaten schreiben.');
    });
    io.lesen.mockImplementation((pfad: string) =>
      readFile(join(io.ordner, pfad.split('/').at(-1)!), 'utf8'),
    );
    const start = performance.now();
    const kandidaten = await sucheKandidatenAlleQuellen();
    const laden = performance.now() - start;

    for (const dateiname of ['eu.xml', 'de-bund.xml', 'de-bw.xml']) {
      expect(io.bundleLesen).toHaveBeenCalledWith(
        resolve('src-tauri/resources/importindizes', dateiname),
      );
      // Erstlesen, Bestandsprüfung unter Schreibkoordination, erneutes Lesen.
      expect(
        io.lesen.mock.calls.filter(([pfad]) => pfad === `importindizes/${dateiname}`),
      ).toHaveLength(3);
    }
    expect(io.schreiben).not.toHaveBeenCalled();
    const lesungen = io.lesen.mock.calls.length;
    const bundleLesungen = io.bundleLesen.mock.calls.length;
    const zeiten = [
      'VO',
      'Datenschutz',
      'Landwirt',
      'VO 2016/679',
      'BGB',
      'xyz',
      'Verordnung',
      'vo 2024',
    ].map((eingabe) => {
      const anfang = performance.now();
      const treffer = berechneTreffer(eingabe, [], null, kandidaten);
      return {
        eingabe,
        ms: Number((performance.now() - anfang).toFixed(2)),
        treffer: treffer.length,
      };
    });
    expect(io.lesen).toHaveBeenCalledTimes(lesungen);
    expect(io.bundleLesen).toHaveBeenCalledTimes(bundleLesungen);
    await mkdir('.reports', { recursive: true });
    await writeFile(
      '.reports/eu-suchzeit.json',
      JSON.stringify({
        erstladenMs: Number(laden.toFixed(2)),
        bund: kandidaten['de-bund'].length,
        eu: kandidaten.eu.length,
        zeiten,
      }),
    );
  } finally {
    await rm(io.ordner, { recursive: true, force: true });
  }
}, 20000);
