// @vitest-environment jsdom
// Öffentlicher Export mit echtem Dateispeicher und Parser; nur native Grenzen ersetzt.
import { io, nativeAttrappeZuruecksetzen } from '@/test/einfuehrung/einfuehrungNativeAttrappe';
import { assert, beforeEach, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { exportiere } from './exportSpeicher';
const xml = (titel: string) =>
  `<gesetz><infos><kurztitel>${titel}</kurztitel><normgeber>de-bund</normgeber></infos><inhalt><norm id="p1"><bezeichnung>§ 1</bezeichnung><titel>Titel</titel><text>Text ${titel}</text></norm></inhalt></gesetz>`;
beforeEach(() => {
  nativeAttrappeZuruecksetzen();
  io.dateien.set('gesetze/A_de-bund.xml', xml('A'));
  io.dateien.set('gesetze/B_de-bund.xml', xml('B'));
  io.dateien.set('cache/suchverzeichnis.json', 'absichtlich veraltet');
  io.dateien.set('cache/geheim.json', 'kein Export');
});
it('liest bei Auswahl des aktuellen Gesetzes ausschließlich dessen XML und exportiert es unverändert', async () => {
  const gelesen: string[] = [];
  io.vorLesen = (pfad) => {
    gelesen.push(pfad);
    return undefined;
  };
  await expect(
    exportiere(new Set(['aktuellesGesetz']), {
      aktuellesGesetz: { kurztitel: 'A', normgeber: 'de-bund' },
    }),
  ).resolves.toBe('exportiert');
  expect(gelesen.filter((pfad) => pfad.includes('/gesetze/'))).toEqual([
    '/daten/LexLata/gesetze/A_de-bund.xml',
  ]);
  expect(io.dateien.get('/daten/Export.xml')).toBe(xml('A'));
});
it('verarbeitet die Sammlung gesetzweise und exportiert XML mit bisherigen ZIP-Pfaden ohne Cache', async () => {
  const gelesen: string[] = [];
  io.vorLesen = (pfad) => {
    if (pfad.includes('/gesetze/')) gelesen.push(pfad.split('/').at(-1) ?? pfad);
    return undefined;
  };
  await expect(exportiere(new Set(['alleGesetze']), {})).resolves.toBe('exportiert');
  expect(gelesen).toEqual(['A_de-bund.xml', 'A_de-bund.xml', 'B_de-bund.xml', 'B_de-bund.xml']);
  const aufruf = io.writeFile.mock.calls[0];
  assert(aufruf);
  const zip = unzipSync(aufruf[1]);
  expect(
    Object.fromEntries(Object.entries(zip).map(([name, inhalt]) => [name, strFromU8(inhalt)])),
  ).toEqual({ 'Gesetze/A_de-bund.xml': xml('A'), 'Gesetze/B_de-bund.xml': xml('B') });
});

it('exportiert auch in der vollständigen Sammlung keine Cachedateien', async () => {
  await expect(exportiere(new Set(['vollstaendigeSammlung']), {})).resolves.toBe('exportiert');
  const aufruf = io.writeFile.mock.calls[0];
  assert(aufruf);
  const zip = unzipSync(aufruf[1]);
  expect(Object.keys(zip)).toContain('Gesetze/A_de-bund.xml');
  expect(Object.keys(zip).some((name) => name.toLowerCase().includes('cache'))).toBe(false);
  expect(Object.values(zip).some((inhalt) => strFromU8(inhalt).includes('kein Export'))).toBe(
    false,
  );
});
it('liefert bei unlesbarem Gesetzesordner wie bisher keineDaten', async () => {
  const nativ = io.invoke.getMockImplementation();
  io.invoke.mockImplementation(async (name, args) => {
    if (name === 'gesetz_dateistempel_lesen') throw Error('Ordner unlesbar');
    return nativ?.(name, args);
  });
  await expect(exportiere(new Set(['alleGesetze']), {})).resolves.toBe('keineDaten');
  expect(io.writeFile).not.toHaveBeenCalled();
});
