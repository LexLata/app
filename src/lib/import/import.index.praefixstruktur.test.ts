import { alsSuchverzeichniseintraege } from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// import.index.praefixstruktur.test.ts
// Ressourcenintegration der Präfixstruktur bis zur Trefferanzeige.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importindexFixture } from '@/test/import/europaImportFixtures';
import type { ImportindexSucheEintrag } from '@/lib/domain/importindexSucheEintrag';
import {
  berechneTreffer,
  indexNormAnzeige,
  parseSuchanfrage,
} from '@/lib/domain/app/oeffnen/oeffnen.index';

const io = vi.hoisted(() => ({
  existiert: vi.fn(),
  lesen: vi.fn(),
  pfad: vi.fn(),
  kandidaten: vi.fn(),
  europa: vi.fn(),
}));
vi.mock('@tauri-apps/api/event', () => ({ listen: async () => () => {}, emitTo: async () => {} }));
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: io.existiert,
  readTextFile: async (pfad: string) => {
    if (pfad.includes('praefixstrukturen')) return io.lesen(pfad);
    if (pfad.endsWith('europaKuratiert.json')) return '[]';
    if (pfad.includes('importindizes')) return indexXml(pfad);
    const eintraege: ImportindexSucheEintrag[] = await io.europa();
    const e = eintraege.find((e) => pfad.endsWith(e.abrufkennung));
    if (!e) throw Error('Europa-Datei fehlt');
    return `<gesetz><infos><normgeber>${e.normgeber ?? 'eu'}</normgeber><kurztitel>${e.kurztitel}</kurztitel><langtitel>${e.langtitel}</langtitel></infos></gesetz>`;
  },
  readDir: async () =>
    (await io.europa())
      .filter((e: ImportindexSucheEintrag) => e.abrufkennung.endsWith('.xml'))
      .map((e: ImportindexSucheEintrag) => ({ name: e.abrufkennung, isFile: true })),
}));
vi.mock('@/lib/plattform/dateipfade', () => ({ ressourcenPfad: io.pfad }));
vi.mock('@/lib/persistenz/kern/kern.index', () => ({
  appDatenLesen: (pfad: string) => indexXml(pfad),
  appDatenSchreiben: async () => {
    throw Error('Unerwartetes Schreiben');
  },
  sicherstelleOrdner: async () => {},
}));
async function indexXml(pfad: string): Promise<string> {
  const kategorie = pfad.endsWith('de-bund.xml')
    ? 'de-bund'
    : pfad.endsWith('de-bw.xml')
      ? 'de-bw'
      : 'eu';
  const eintraege: ImportindexSucheEintrag[] = await io.kandidaten(kategorie);
  return importindexFixture(
    kategorie === 'de-bund' ? 'de-bund' : kategorie === 'de-bw' ? 'de-bw' : 'eu',
    eintraege
      .filter((e) => e.normgeber !== 'europarat')
      .map(
        (e) =>
          `<gesetz><kurztitel>${e.kurztitel}</kurztitel><langtitel>${e.langtitel}</langtitel><abrufkennung>${e.abrufkennung}</abrufkennung></gesetz>`,
      )
      .join(''),
  );
}
let sucheKandidatenAlleQuellen: typeof import('./import.index').sucheKandidatenAlleQuellen;

const eintrag = (kurztitel: string): ImportindexSucheEintrag => ({
  kurztitel,
  langtitel: kurztitel,
  abrufkennung: kurztitel.toLowerCase(),
});
const liste = (normgeber: string, inhalt: string) =>
  `<praefixstrukturen version="1"><infos><normgeber>${normgeber}</normgeber><verarbeitungszeit>2026-10-13T10:00:00Z</verarbeitungszeit></infos><inhalt>${inhalt}</inhalt></praefixstrukturen>`;

beforeEach(async () => {
  vi.resetModules();
  ({ sucheKandidatenAlleQuellen } = await import('./import.index'));
  vi.restoreAllMocks();
  io.pfad.mockReset().mockImplementation(async (pfad: string) => pfad);
  io.existiert.mockReset().mockResolvedValue(true);
  io.lesen
    .mockReset()
    .mockImplementation(async (pfad: string) =>
      pfad.endsWith('de-bund.xml')
        ? liste(
            'de-bund',
            '<gesetz praefixstruktur="artikel">GG</gesetz><gesetz praefixstruktur="gliederungsartikel">EGBGB</gesetz><gesetz>StGB</gesetz>',
          )
        : liste('de-bw', '<gesetz>GG</gesetz><gesetz>LBO</gesetz>'),
    );
  io.kandidaten
    .mockReset()
    .mockImplementation(async (quelle: string) =>
      quelle === 'de-bund'
        ? ['gg', 'EGBGB', 'StGB', 'Ungeprüft'].map(eintrag)
        : quelle === 'de-bw'
          ? ['GG', 'LBO'].map(eintrag)
          : [eintrag('GG')],
    );
  io.europa.mockReset().mockResolvedValue([eintrag('GG')]);
});

describe('Präfixstruktur im Suchlader', () => {
  it('ordnet ohne Großschreibung getrennt nach Normgeber zu und erhält Reihenfolge sowie Anzahl', async () => {
    const ergebnis = await sucheKandidatenAlleQuellen();
    expect(
      ergebnis['de-bund'].map(({ kurztitel, praefixstruktur }) => [kurztitel, praefixstruktur]),
    ).toEqual([
      ['gg', 'artikel'],
      ['EGBGB', 'gliederungsartikel'],
      ['StGB', 'paragraph'],
      ['Ungeprüft', undefined],
    ]);
    expect(ergebnis['de-bw'].map(({ praefixstruktur }) => praefixstruktur)).toEqual([
      'paragraph',
      'paragraph',
    ]);
    expect(ergebnis.eu).toEqual([{ ...eintrag('GG'), praefixstruktur: 'artikel' }]);
    expect(
      io.pfad.mock.calls.filter(([pfad]) => String(pfad).includes('praefixstrukturen')),
    ).toEqual([
      ['resources/praefixstrukturen/de-bund.xml'],
      ['resources/praefixstrukturen/de-bw.xml'],
    ]);
  });

  it.each([
    ['1 GG', 'Art. 1', null],
    ['229 3 EGBGB', '§ 3', '229'],
    ['10 5 StGB', '§ 10', null],
  ])(
    'zeigt %s über Lader und Trefferberechnung korrekt an',
    async (eingabe, normLabel, artikelNummer) => {
      const treffer = berechneTreffer(
        eingabe,
        alsSuchverzeichniseintraege([]),
        null,
        await sucheKandidatenAlleQuellen(),
      ).filter((treffer) => treffer.art === 'index' && treffer.quelle === 'de-bund');
      expect(treffer).toHaveLength(1);
      expect(treffer[0]?.art).toBe('index');
      if (treffer[0]?.art !== 'index') throw new Error('Importangebot erwartet');
      expect(
        indexNormAnzeige(parseSuchanfrage(eingabe), treffer[0].eintrag.praefixstruktur),
      ).toEqual({ normLabel, artikelNummer });
    },
  );

  it('meldet fehlende erforderliche Präfixdateien und versucht sie beim nächsten Aufruf erneut', async () => {
    const fehler = vi.spyOn(console, 'error').mockImplementation(() => {});
    io.existiert.mockResolvedValue(false);
    const ergebnis = await sucheKandidatenAlleQuellen();
    expect(ergebnis['de-bund']).toEqual(['gg', 'EGBGB', 'StGB', 'Ungeprüft'].map(eintrag));
    expect(ergebnis['de-bw']).toEqual(['GG', 'LBO'].map(eintrag));
    expect(io.lesen).not.toHaveBeenCalled();
    expect(fehler).toHaveBeenCalledTimes(2);
    io.existiert.mockResolvedValue(true);
    expect((await sucheKandidatenAlleQuellen())['de-bund'][0]?.praefixstruktur).toBe('artikel');
  });

  it.each(['unlesbar', 'XML defekt', 'Normgeber falsch', 'Version falsch'])(
    'erhält alle Einträge bei %s und meldet den Fehler',
    async (fall) => {
      const fehler = vi.spyOn(console, 'error').mockImplementation(() => {});
      if (fall === 'unlesbar') io.lesen.mockRejectedValue(new Error('Zugriff verweigert'));
      else
        io.lesen.mockResolvedValue(
          fall === 'XML defekt'
            ? '<kaputt>'
            : liste('eu', '').replace(
                'version="1"',
                fall === 'Version falsch' ? 'version="2"' : 'version="1"',
              ),
        );
      const ergebnis = await sucheKandidatenAlleQuellen();
      expect(ergebnis['de-bund']).toEqual(['gg', 'EGBGB', 'StGB', 'Ungeprüft'].map(eintrag));
      expect(ergebnis['de-bw']).toEqual(['GG', 'LBO'].map(eintrag));
      expect(ergebnis.eu).toEqual([{ ...eintrag('GG'), praefixstruktur: 'artikel' }]);
      expect(
        indexNormAnzeige(parseSuchanfrage('1 GG'), ergebnis['de-bund'][0]?.praefixstruktur)
          .normLabel,
      ).toBe('§ 1');
      expect(fehler).toHaveBeenCalledTimes(2);
    },
  );
});

it('übernimmt einen gespeicherten Fehlschlag nicht als impliziten Paragraphenbefund', async () => {
  io.lesen.mockResolvedValue(
    liste(
      'de-bund',
      '<gesetz ermittlungsstatus="gescheitert" fehlerart="identifikation">gg</gesetz>',
    ),
  );
  const ergebnis = await sucheKandidatenAlleQuellen();
  expect(ergebnis['de-bund'][0]).toEqual(eintrag('gg'));
});

it('übernimmt einen gespeicherten Leerbefund nicht als impliziten Paragraphenbefund', async () => {
  io.lesen.mockResolvedValue(liste('de-bund', '<gesetz ermittlungsstatus="leer">gg</gesetz>'));
  const ergebnis = await sucheKandidatenAlleQuellen();
  expect(ergebnis['de-bund'][0]).toEqual(eintrag('gg'));
});

it.each([
  ['VO 2016/679', '32016R0679', undefined, 'Art. 6'],
  ['2004/38/EG', '32004L0038', 'eu', 'Art. 6'],
  ['AEUV', '12012E/TXT', 'eu', 'Art. 6'],
  ['EMRK', 'EMRK_europarat.xml', 'europarat', '§ 6'],
] as const)(
  'zeigt vor Import für %s die vorläufige EU-Artikelstruktur und erhält andere Normgeber',
  async (kurztitel, abrufkennung, normgeber, normLabel) => {
    const angebot = { ...eintrag(kurztitel), abrufkennung, normgeber };
    io.kandidaten.mockImplementation(async (quelle: string) => (quelle === 'eu' ? [angebot] : []));
    io.europa.mockResolvedValue(normgeber === 'europarat' ? [angebot] : []);
    const treffer = berechneTreffer(
      `6 ${kurztitel}`,
      alsSuchverzeichniseintraege([]),
      null,
      await sucheKandidatenAlleQuellen(),
    );
    expect(treffer).toHaveLength(1);
    if (treffer[0]?.art !== 'index') throw new Error('Importangebot erwartet');
    expect(
      indexNormAnzeige(
        parseSuchanfrage(`6 ${kurztitel}`),
        treffer[0].eintrag.praefixstruktur,
        kurztitel,
      ).normLabel,
    ).toBe(normLabel);
    expect(treffer[0].eintrag.normgeber).toBe(normgeber === 'europarat' ? normgeber : undefined);
    expect(angebot).not.toHaveProperty('praefixstruktur');
  },
);
