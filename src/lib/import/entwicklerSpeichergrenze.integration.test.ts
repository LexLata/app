// @vitest-environment jsdom
// Öffentliche Entwicklerwege mit echten Quellen-/Nachbereitungsmodulen und ausschließlich nativen Grenzen.
import { readFileSync } from 'node:fs';
import { importindexFixture } from '@/test/import/europaImportFixtures';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({ invoke: vi.fn(), dateien: vi.fn(), cache: 'fehlt' }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: io.invoke }));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
  resolveResource: async (p: string) => p,
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  readTextFile: (p: string) => io.dateien('lesen', p),
  readDir: (p: string) => io.dateien('ordner', p),
  exists: (p: string) => io.dateien('existiert', p),
  mkdir: (p: string) => io.dateien('anlegen', p),
}));
import { startePraefixlauf } from './praefixlaufStart';
import { erzeugeTauriPraefixlaufUmgebung } from './praefixstruktur/praefixstruktur.index';
const bund =
  '<dokumente doknr="G"><norm doknr="G"><metadaten><jurabk>GG</jurabk><langue>Grundgesetz</langue></metadaten></norm><norm doknr="N"><metadaten><enbez>Art 1</enbez><titel>Titel</titel></metadaten><textdaten><text><Content><P>Siehe § 1 BGB.</P></Content></text></textdaten></norm></dokumente>';
const bw =
  '<!DOCTYPE html><html><head><title>Landesrecht BW - TestG | Landesnorm Baden-Württemberg | Gesamtausgabe | Testgesetz (TestG) vom 1. Januar 2000 | gültig ab: 2000-01-01</title></head><body><div class="docLayoutText"><h4 style="font-family: Arial">§ 1 Titel</h4><p>Text.</p></div></body></html>';
const original = Array.from(readFileSync('src/lib/import/eu/testdaten/formex/32016R0679.fmx4'));
const geschrieben: string[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  geschrieben.length = 0;
  vi.stubGlobal('window', { __TAURI_INTERNALS__: { invoke: io.invoke } });
  io.dateien.mockImplementation(async (art: string, p: string) => {
    if (art === 'ordner') return [];
    if (art === 'existiert') return false;
    if (p.endsWith('cache/suchverzeichnis.json')) {
      if (io.cache === 'beschaedigt') return '{';
      if (io.cache === 'vorhanden')
        return JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] });
      throw Error('Datei fehlt');
    }
    if (p.endsWith('europaKuratiert.json'))
      return JSON.stringify([
        { celex: '32016R0679', kurztitel: 'DSGVO', langtitel: 'Datenschutz' },
      ]);
    if (p.endsWith('eu.xml'))
      return importindexFixture(
        'eu',
        '<gesetz typ="verordnung"><kurztitel>DSGVO</kurztitel><langtitel>Datenschutz</langtitel><abrufkennung>32016R0679</abrufkennung></gesetz>',
      );
    const normgeber = p.endsWith('de-bw.xml') ? 'de-bw' : 'de-bund';
    const titel = normgeber === 'de-bw' ? 'TestG' : 'GG';
    return `<importindex version="1"><infos><normgeber>${normgeber}</normgeber><datenquelle name="${normgeber === 'de-bw' ? 'Landesrecht BW' : 'Gesetze im Internet'}"/><verarbeitungszeit>2026-10-25T00:00:00Z</verarbeitungszeit></infos><inhalt><gesetz><kurztitel>${titel}</kurztitel><langtitel>Testgesetz</langtitel><abrufkennung>gg</abrufkennung></gesetz><gesetz><kurztitel>BGB</kurztitel><langtitel>Bürgerliches Gesetzbuch</langtitel><abrufkennung>bgb</abrufkennung></gesetz></inhalt></importindex>`;
  });
  io.invoke.mockImplementation(async (name: string, args?: { art?: string; inhalt?: string }) => {
    if (name === 'praefixlauf_dateistand')
      return {
        quellen: ['GG', 'TestG', 'DSGVO'],
        gesetzesxml: [],
        original: ['DSGVO'],
        konsolidiert: [],
      };
    if (name === 'praefixlauf_arbeitsdatei_lesen')
      return args?.art === 'herkunft'
        ? JSON.stringify({
            basisCelex: '32016R0679',
            celex: '32016R0679',
            fassung: 'original',
            ergaenzung: 'nicht-noetig',
          })
        : quelle;
    if (name === 'praefixlauf_archiv_lesen') return original;
    if (name === 'praefixlauf_arbeitsdatei_schreiben' && args?.art === 'gesetzesxml' && args.inhalt)
      geschrieben.push(args.inhalt);
    if (name === 'gesetz_dateistempel_lesen') return [];
    if (name === 'praefixlauf_bericht_schreiben') return 'bericht.txt';
    return null;
  });
});
let quelle = bund;
afterEach(() => vi.unstubAllGlobals());
it.each(['vorhanden', 'fehlt', 'beschaedigt'])(
  'hält alle Entwicklerkontexte bei Appcache %s vom App-Gesetzesspeicher fern',
  async (cache) => {
    io.cache = cache;
    for (const normgeber of ['de-bund', 'de-bw', 'eu'] as const) {
      quelle = normgeber === 'de-bw' ? bw : bund;
      await startePraefixlauf({
        modus: 'gesetzesxml',
        normgeber,
        anzahl: 1,
        kurztitel: [normgeber === 'eu' ? 'DSGVO' : normgeber === 'de-bw' ? 'TestG' : 'GG'],
      });
      expect(io.invoke.mock.calls.at(-1), JSON.stringify(io.invoke.mock.calls)).toEqual([
        'praefixlauf_beenden',
        { code: 0 },
      ]);
    }
    quelle = bund;
    const umgebung = await erzeugeTauriPraefixlaufUmgebung();
    const ergebnis = await umgebung.ladeGesetz(
      'de-bund',
      { kurztitel: 'GG', langtitel: 'Grundgesetz', abrufkennung: 'gg' },
      undefined,
      true,
    );
    expect(ergebnis).not.toHaveProperty('fehler');
    expect(geschrieben).toHaveLength(4);
    expect(geschrieben.filter((xml) => xml.includes('gesetz="BGB"'))).toHaveLength(2);
    expect(io.dateien.mock.calls.filter(([, p]) => /\/gesetze(?:\/|$)|\/cache\//.test(p))).toEqual(
      [],
    );
    expect(io.invoke.mock.calls.filter(([name]) => !name.startsWith('praefixlauf_'))).toEqual([]);
  },
);
