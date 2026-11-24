import { alsSuchverzeichniseintrag } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// aktualisierungsKandidaten.test.ts
// Öffentliche Auswahlverträge mit echten Importindizes und externen Dateiattrappen.
import { beforeEach, expect, it, vi } from 'vitest';
import { importindexFixture } from '@/test/import/europaImportFixtures';
import {
  ermittleFaelligeGesetze,
  ermittleAktualisierbareGesetze,
  type AktualisierbareGesetzeErgebnis,
} from '@/lib/import/import.index';
import type { AktualisierbareGesetzeErgebnis as DispatchErgebnis } from '@/lib/import/importVertrag.types';

const io = vi.hoisted(() => ({ lesen: vi.fn(), ressourcen: vi.fn() }));
vi.mock('@tauri-apps/plugin-fs', () => ({ readTextFile: io.lesen }));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
  resolveResource: io.ressourcen,
}));
function gesetz(kurztitel: string, normgeber = 'de-bund', zeit?: number) {
  return alsSuchverzeichniseintrag({
    kurztitel,
    normgeber,
    langtitel: '',
    elemente: [],
    hatGliederungsartikel: false,
    ...(zeit === undefined ? {} : { verarbeitungszeit: new Date(zeit) }),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  io.ressourcen.mockImplementation(async (pfad: string) => pfad);
  io.lesen.mockImplementation(async (pfad: string) => {
    if (pfad.endsWith('europaKuratiert.json')) return '[]';
    const quelle = pfad.endsWith('de-bund.xml')
      ? 'de-bund'
      : pfad.endsWith('de-bw.xml')
        ? 'de-bw'
        : 'eu';
    return importindexFixture(
      quelle,
      '<gesetz><kurztitel>TestG</kurztitel><langtitel>Testgesetz</langtitel><abrufkennung>test</abrufkennung></gesetz>',
    );
  });
});
it('trennt je Normgeber indexierte und fehlende Gesetze und ignoriert andere Normgeber', async () => {
  const vorhanden = ['de-bund', 'de-bw', 'eu'].map((n) => gesetz(' Testg ', n));
  const fehlend = ['de-bund', 'de-bw', 'eu'].map((n) => gesetz('Fehlt', n));
  const ergebnis: AktualisierbareGesetzeErgebnis & DispatchErgebnis =
    await ermittleAktualisierbareGesetze([...vorhanden, ...fehlend, gesetz('TestG', 'europarat')]);
  expect(ergebnis).toEqual({
    art: 'ermittelt',
    kandidaten: vorhanden,
    nichtImImportindex: fehlend,
  });
  for (const name of ['de-bund.xml', 'de-bw.xml', 'eu.xml']) {
    expect(io.ressourcen.mock.calls.filter(([pfad]) => pfad.endsWith(`/${name}`))).toHaveLength(1);
  }
});
it('liest nur den benötigten Index einmal und lässt unbenötigte defekte Indizes unberührt', async () => {
  io.lesen.mockImplementation(async (pfad: string) => {
    if (!pfad.endsWith('de-bund.xml')) throw new Error('defekt');
    return importindexFixture('de-bund', '');
  });
  const gesetze = [gesetz('MKH'), gesetz('MKN')];
  expect(await ermittleAktualisierbareGesetze(gesetze)).toEqual({
    art: 'ermittelt',
    kandidaten: [],
    nichtImImportindex: gesetze,
  });
  expect(io.ressourcen).toHaveBeenCalledTimes(1);
  expect(io.ressourcen).toHaveBeenCalledWith('resources/importindizes/de-bund.xml');
});
it('verwirft den gesamten Bestand bei einem benötigten unlesbaren Index', async () => {
  const lesen = io.lesen.getMockImplementation();
  if (!lesen) throw new Error('Dateiattrappe ist nicht vorbereitet.');
  io.lesen.mockImplementation(async (pfad: string) => {
    if (pfad.endsWith('de-bw.xml')) throw new Error('defekt');
    return lesen(pfad);
  });
  expect(await ermittleAktualisierbareGesetze([gesetz('TestG'), gesetz('TestG', 'de-bw')])).toEqual(
    { art: 'importindexNichtLesbar' },
  );
});
it('liest bei leerem oder fremdem Bestand keinen Index', async () => {
  for (const gesetze of [[], [gesetz('EMRK', 'europarat')]]) {
    expect(await ermittleAktualisierbareGesetze(gesetze)).toEqual({
      art: 'ermittelt',
      kandidaten: [],
      nichtImImportindex: [],
    });
  }
  expect(io.lesen).not.toHaveBeenCalled();
});
it('wählt je Gesetz überschrittene und genau erreichte Fälligkeit sowie nie geprüfte Gesetze', () => {
  const alt = gesetz('Alt', 'de-bund', 800);
  const grenze = gesetz('Grenze', 'de-bw', 900);
  const nie = gesetz('Nie', 'eu');
  expect(
    ermittleFaelligeGesetze(
      [alt, gesetz('Frisch', 'de-bund', 901), grenze, nie, gesetz('Fremd', 'europarat', 0)],
      100,
      1000,
    ),
  ).toEqual([alt, grenze, nie]);
  expect(ermittleFaelligeGesetze([], 100, 1000)).toEqual([]);
  expect(io.lesen).not.toHaveBeenCalled();
});
