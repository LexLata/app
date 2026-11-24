// europaVerzeichnis.test.ts
import { kuratierteEuropaFixture, emrkFixture } from '@/test/import/europaImportFixtures';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { readDir, readTextFile, kuratiert } = vi.hoisted(() => ({
  readDir: vi.fn(),
  readTextFile: vi.fn(),
  kuratiert: vi.fn(),
}));
vi.mock('./europaKuratiert', () => ({ leseKuratierteListe: kuratiert }));
vi.mock('@tauri-apps/plugin-fs', () => ({ readDir, readTextFile }));
vi.mock('@tauri-apps/api/path', () => ({ resolveResource: async (pfad: string) => pfad }));
import { leseEuropaVerzeichnisMitDiagnosen } from './europaVerzeichnis';
const xml =
  '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>A &amp; B &#xA7;</kurztitel><langtitel>Titel &#228;</langtitel></infos><inhalt/></gesetz>';
beforeEach(() => {
  vi.resetAllMocks();
  kuratiert.mockResolvedValue({ eintraege: [], fehler: [] });
});
describe('Europa-Verzeichnis', () => {
  it('unterscheidet fehlenden Ordner von lesbarer leerer Liste', async () => {
    readDir.mockRejectedValueOnce(new Error('Ordner fehlt'));
    expect((await leseEuropaVerzeichnisMitDiagnosen()).fehler).toHaveLength(1);
    readDir.mockResolvedValueOnce([]);
    expect(await leseEuropaVerzeichnisMitDiagnosen()).toEqual({ eintraege: [], fehler: [] });
  });
  it('liest nur XML-Dateien und erhält gute Einträge trotz Teilfehlern', async () => {
    readDir.mockResolvedValue([
      { name: 'gut.XML', isFile: true },
      { name: 'defekt.xml', isFile: true },
      { name: 'fremd.xml', isFile: true },
      { name: 'ordner.xml', isFile: false },
      { name: 'bild.png', isFile: true },
    ]);
    readTextFile
      .mockResolvedValueOnce(xml)
      .mockResolvedValueOnce(xml.slice(0, -9))
      .mockResolvedValueOnce('<fremd/>');
    const ergebnis = await leseEuropaVerzeichnisMitDiagnosen();
    expect(ergebnis.eintraege).toEqual([
      { kurztitel: 'A & B §', langtitel: 'Titel ä', abrufkennung: 'gut.XML', normgeber: 'de-bund' },
    ]);
    expect(ergebnis.fehler).toHaveLength(2);
    expect(readTextFile).toHaveBeenCalledTimes(3);
  });
});

it('liefert je kuratiertem Eintrag einen Kandidaten und erhält EMRK', async () => {
  readDir.mockResolvedValue([{ name: 'EMRK_europarat.xml', isFile: true }]);
  readTextFile.mockResolvedValue(emrkFixture);
  const eintraege = kuratierteEuropaFixture.map(({ celex, ...titel }) => ({
    ...titel,
    abrufkennung: celex,
    normgeber: 'eu',
  }));
  kuratiert.mockResolvedValue({ eintraege, fehler: [] });
  const ergebnis = await leseEuropaVerzeichnisMitDiagnosen();
  expect(ergebnis.fehler).toEqual([]);
  expect(ergebnis.eintraege.filter((e) => e.normgeber === 'eu')).toEqual(eintraege);
  expect(ergebnis.eintraege.filter((e) => e.kurztitel === 'EMRK')).toEqual([
    {
      kurztitel: 'EMRK',
      langtitel: 'Konvention',
      normgeber: 'europarat',
      abrufkennung: 'EMRK_europarat.xml',
    },
  ]);
});

it('lässt den optionalen Langtitel weg, ohne einen Teilfehler zu melden', async () => {
  readDir.mockResolvedValue([{ name: 'ohne-titel.xml', isFile: true }]);
  readTextFile.mockResolvedValue(
    '<gesetz><infos><normgeber>de-bund</normgeber><kurztitel>Test</kurztitel></infos></gesetz>',
  );
  expect(await leseEuropaVerzeichnisMitDiagnosen()).toEqual({
    eintraege: [
      { kurztitel: 'Test', langtitel: '', abrufkennung: 'ohne-titel.xml', normgeber: 'de-bund' },
    ],
    fehler: [],
  });
});

it.each([' europarat', 'europarat ', '\neuroparat', 'europarat\n'])(
  'meldet ungültigen Ressourcen-Normgeber %j als Dateidiagnose und erhält gültige EMRK',
  async (code) => {
    readDir.mockResolvedValue([
      { name: 'defekt.xml', isFile: true },
      { name: 'EMRK_europarat.xml', isFile: true },
    ]);
    readTextFile
      .mockResolvedValueOnce(emrkFixture.replace('>europarat<', `>${code}<`))
      .mockResolvedValueOnce(emrkFixture);
    const ergebnis = await leseEuropaVerzeichnisMitDiagnosen();
    expect(ergebnis.eintraege).toHaveLength(1);
    expect(ergebnis.eintraege[0]).toMatchObject({
      normgeber: 'europarat',
      abrufkennung: 'EMRK_europarat.xml',
    });
    expect(ergebnis.fehler).toHaveLength(1);
    expect(ergebnis.fehler[0]?.meldung).toContain('defekt.xml');
    expect(ergebnis.fehler[0]?.meldung).toContain('de-bund');
  },
);
