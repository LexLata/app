// quelldateienUmgebung.integration.test.ts
// Echter Bund-Download, Konvertierung und Start mit gefaktem Netz und Dateisystem.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
const extern = vi.hoisted(() => ({ invoke: vi.fn(), fetch: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: extern.invoke }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: extern.fetch }));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
  resolveResource: async (pfad: string) => pfad,
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  async readTextFile(pfad: string) {
    if (pfad.endsWith('cache/suchverzeichnis.json'))
      return JSON.stringify({ version: 1, abgeglichen: true, eintraege: [] });
    if (pfad.endsWith('de-bw.xml'))
      return '<importindex version="1"><infos><normgeber>de-bw</normgeber><datenquelle name="Landesrecht BW"/><verarbeitungszeit>2026-10-25T00:00:00Z</verarbeitungszeit></infos><inhalt><gesetz><kurztitel>LBO</kurztitel><langtitel>Landesbauordnung</langtitel><abrufkennung>lbo</abrufkennung></gesetz><gesetz><kurztitel>TestG</kurztitel><langtitel>Testgesetz</langtitel><abrufkennung>testg</abrufkennung></gesetz></inhalt></importindex>';
    if (pfad.endsWith('de-bund.xml'))
      return '<importindex version="1"><infos><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/><verarbeitungszeit>2026-10-25T00:00:00Z</verarbeitungszeit></infos><inhalt><gesetz><kurztitel>GG</kurztitel><langtitel>Grundgesetz</langtitel><abrufkennung>gg</abrufkennung></gesetz></inhalt></importindex>';
    throw new Error('Datei fehlt');
  },
}));
import { startePraefixlauf } from '@/lib/import/praefixlaufStart';
import { erzeugeTauriQuelldateienUmgebung, fuehreQuelldateienLaufAus } from './quelldateien.index';
const quelle =
  '<dokumente doknr="G"><norm doknr="G"><metadaten><jurabk>GG</jurabk><langue>Grundgesetz</langue></metadaten></norm><norm doknr="N"><metadaten><enbez>Art 1</enbez><titel>Menschenwürde</titel></metadaten><textdaten><text><Content><P>Die Würde ist unantastbar.</P></Content></text></textdaten></norm></dokumente>';
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('window', { __TAURI_INTERNALS__: { invoke: extern.invoke } });
  extern.invoke.mockImplementation(async (befehl: string) => {
    if (befehl === 'praefixlauf_dateistand')
      return { quellen: [], gesetzesxml: ['GG'], original: [], konsolidiert: [] };
    if (befehl === 'praefixlauf_bericht_schreiben') return 'bericht.txt';
  });
  const zip = zipSync({ 'gg.xml': strToU8(quelle) });
  extern.fetch.mockResolvedValue({ ok: true, arrayBuffer: async () => zip.buffer });
});
afterEach(() => vi.unstubAllGlobals());
it('speichert entpackte Quelle und nachbereitetes GesetzesXML ohne Listenbefehle', async () => {
  const umgebung = erzeugeTauriQuelldateienUmgebung({
    merkeGespeichertesGesetz: () => {},
    mitMeldungsempfaenger: async () => {
      throw new Error('Kein Teilvorgang in dieser Quellenattrappe');
    },
    referenzenFuer: async () => [],
    meldeEinschraenkung: () => {},
  });
  const bericht = await fuehreQuelldateienLaufAus(
    { modus: 'quelldateien', normgeber: 'de-bund', anzahl: 1 },
    umgebung,
  );
  expect(bericht.gespeichert).toBe(1);
  expect(bericht.zusatzzeilen).toEqual(['GG: Bisheriges GesetzesXML gelöscht.']);
  const dateien = extern.invoke.mock.calls.filter(
    ([b]) => b === 'praefixlauf_arbeitsdatei_schreiben',
  );
  expect(dateien[0]).toEqual([
    'praefixlauf_arbeitsdatei_schreiben',
    { art: 'quelle', kurztitel: 'GG', inhalt: quelle },
  ]);
  expect(dateien[1]?.[1]).toMatchObject({
    art: 'gesetzesxml',
    kurztitel: 'GG',
    inhalt: expect.stringContaining('Die Würde ist unantastbar.'),
  });
  expect(
    extern.invoke.mock.calls.some(([b]) =>
      ['praefixlauf_datei_lesen', 'praefixlauf_datei_schreiben'].includes(b),
    ),
  ).toBe(false);
  expect(extern.invoke.mock.calls.filter(([b]) => b === 'praefixlauf_dateistand')).toHaveLength(1);
});
it('verzweigt im gemeinsamen Start und nennt Modus und Normgeber im Fehlerbericht', async () => {
  await startePraefixlauf({ modus: 'quelldateien', normgeber: 'de-bund', anzahl: 1 });
  expect(extern.invoke).toHaveBeenCalledWith('praefixlauf_bericht_schreiben', {
    zeitstempel: expect.any(String),
    inhalt: expect.stringContaining('Modus: quelldateien / Normgeber: de-bund'),
  });
  expect(extern.invoke).toHaveBeenCalledWith('praefixlauf_beenden', { code: 0 });
  expect(
    extern.invoke.mock.calls.some(([b]) =>
      ['praefixlauf_datei_lesen', 'praefixlauf_datei_schreiben'].includes(b),
    ),
  ).toBe(false);
});

const bwHTML = (normen: string) =>
  `<!DOCTYPE html><html><head><title>Landesrecht BW - TestG | Landesnorm Baden-Württemberg | Gesamtausgabe | Testgesetz (TestG) vom 1. Januar 2000 | gültig ab: 2000-01-01</title></head><body><div class="docLayoutText">${normen}</div></body></html>`;
it.each(['leer', 'zeitüberschreitung'])(
  'setzt BW nach %s fort und speichert das HTML unverändert',
  async (fall) => {
    const html = bwHTML('<h4 style="font-family: Arial">§ 1 Titel</h4><p>Text.</p>');
    const leer = bwHTML('<p>Ohne Normen.</p>');
    const normal = extern.invoke.getMockImplementation();
    if (!normal) throw new Error('Externer Dateisystem-Fake fehlt.');
    extern.invoke.mockImplementation(async (befehl: string, args?: { kuerzel?: string }) => {
      if (befehl === 'lade_gesetz_html_bw') {
        if (args?.kuerzel === 'lbo') {
          if (fall === 'zeitüberschreitung') throw new Error('Tab-Link-Zeitüberschreitung');
          return leer;
        }
        return html;
      }
      return normal(befehl, args);
    });
    await startePraefixlauf({ modus: 'quelldateien', normgeber: 'de-bw', anzahl: 1 });
    const quellen = extern.invoke.mock.calls.filter(
      ([b, args]) => b === 'praefixlauf_arbeitsdatei_schreiben' && args.art === 'quelle',
    );
    expect(quellen).toEqual([
      ...(fall === 'leer'
        ? [
            [
              'praefixlauf_arbeitsdatei_schreiben',
              { art: 'quelle', kurztitel: 'LBO', inhalt: leer },
            ],
          ]
        : []),
      ['praefixlauf_arbeitsdatei_schreiben', { art: 'quelle', kurztitel: 'TestG', inhalt: html }],
    ]);
    expect(extern.invoke).toHaveBeenCalledWith('praefixlauf_bericht_schreiben', {
      zeitstempel: expect.any(String),
      inhalt: expect.stringContaining(
        fall === 'leer' ? 'Keine Normen' : 'Tab-Link-Zeitüberschreitung',
      ),
    });
    expect(extern.invoke).toHaveBeenCalledWith('praefixlauf_beenden', { code: 0 });
  },
);

it.each(['de-bund', 'de-bw'] as const)(
  'erzeugt %s offline aus vorhandener Quelle und überschreibt GesetzesXML',
  async (normgeber) => {
    const normal = extern.invoke.getMockImplementation();
    if (!normal) throw new Error('Dateisystem-Fake fehlt');
    const titel = normgeber === 'de-bund' ? 'GG' : 'TestG';
    extern.invoke.mockImplementation(async (befehl: string, args?: object) => {
      if (befehl === 'praefixlauf_dateistand')
        return { quellen: [titel], gesetzesxml: [titel], original: [], konsolidiert: [] };
      if (befehl === 'praefixlauf_arbeitsdatei_lesen')
        return normgeber === 'de-bund'
          ? quelle
          : bwHTML('<h4 style="font-family: Arial">§ 1 Titel</h4><p>Text.</p>');
      return normal(befehl, args);
    });
    await startePraefixlauf({ modus: 'gesetzesxml', normgeber, anzahl: 1, kurztitel: [titel] });
    expect(extern.fetch).not.toHaveBeenCalled();
    expect(
      extern.invoke.mock.calls.filter(([b]) => b === 'praefixlauf_arbeitsdatei_schreiben'),
    ).toEqual([
      [
        'praefixlauf_arbeitsdatei_schreiben',
        { art: 'gesetzesxml', kurztitel: titel, inhalt: expect.stringContaining('<gesetz') },
      ],
    ]);
    expect(
      extern.invoke.mock.calls.some(([b]) =>
        ['lade_gesetz_html_bw', 'praefixlauf_datei_lesen', 'praefixlauf_datei_schreiben'].includes(
          b,
        ),
      ),
    ).toBe(false);
    expect(extern.invoke).toHaveBeenCalledWith('praefixlauf_beenden', { code: 0 });
  },
);

it.each(['gesetzesxml', 'praefix', 'auswerten', 'quelldateien'] as const)(
  'verwendet im Modus %s tatsächliche Namen auf einem case-sensitiven Dateisystem',
  async (modus) => {
    const dateien = new Map<string, string>([
      ['quelle/gg', quelle],
      ['gesetzesxml/gG', 'altes XML'],
    ]);
    extern.invoke.mockImplementation(
      async (
        befehl: string,
        args?: { art?: string; kurztitel?: string; inhalt?: string; xml?: string },
      ) => {
        if (befehl === 'praefixlauf_dateistand')
          return { quellen: ['gg'], gesetzesxml: ['gG'], original: [], konsolidiert: [] };
        const key = `${args?.art}/${args?.kurztitel}`;
        if (befehl === 'praefixlauf_arbeitsdatei_lesen') return dateien.get(key) ?? null;
        if (befehl === 'praefixlauf_arbeitsdatei_loeschen') dateien.delete(key);
        if (befehl === 'praefixlauf_arbeitsdatei_schreiben' && args?.inhalt !== undefined)
          dateien.set(key, args.inhalt);
        if (befehl === 'praefixlauf_datei_lesen') return null;
      },
    );
    // Für die reine Auswertung zunächst gültiges GesetzesXML aus derselben Quelle erzeugen.
    if (modus === 'auswerten') {
      await startePraefixlauf({ modus: 'gesetzesxml', normgeber: 'de-bund', anzahl: 1, neu: true });
      extern.invoke.mockClear();
    }
    if (modus === 'auswerten') await startePraefixlauf({ modus, normgeber: 'de-bund' });
    else if (modus === 'gesetzesxml')
      await startePraefixlauf({ modus, normgeber: 'de-bund', anzahl: 1, neu: true });
    else if (modus === 'quelldateien')
      await startePraefixlauf({
        modus,
        normgeber: 'de-bund',
        anzahl: 1,
        kurztitel: ['GG'],
        neu: true,
      });
    else await startePraefixlauf({ modus, normgeber: 'de-bund', anzahl: 1 });
    expect(extern.invoke).toHaveBeenCalledWith('praefixlauf_beenden', { code: 0 });
    expect(dateien.size).toBe(2);
    expect(dateien.get('gesetzesxml/gG')).toContain('Die Würde ist unantastbar.');
    expect(dateien.get('quelle/gg')).toBe(quelle);
    expect(extern.invoke.mock.calls.filter(([b]) => b === 'praefixlauf_dateistand')).toHaveLength(
      1,
    );
    if (modus !== 'quelldateien') expect(extern.fetch).not.toHaveBeenCalled();
  },
);
it('entfernt anders geschriebenes altes XML bei fehlerhafter Quelle tatsächlich', async () => {
  const dateien = new Map([
    ['quelle/gg', '<kaputt>'],
    ['gesetzesxml/gG', 'alt'],
  ]);
  extern.invoke.mockImplementation(
    async (befehl: string, args?: { art?: string; kurztitel?: string }) => {
      if (befehl === 'praefixlauf_dateistand')
        return { quellen: ['gg'], gesetzesxml: ['gG'], original: [], konsolidiert: [] };
      const key = `${args?.art}/${args?.kurztitel}`;
      if (befehl === 'praefixlauf_arbeitsdatei_lesen') return dateien.get(key) ?? null;
      if (befehl === 'praefixlauf_arbeitsdatei_loeschen') dateien.delete(key);
    },
  );
  await startePraefixlauf({ modus: 'gesetzesxml', normgeber: 'de-bund', anzahl: 1, neu: true });
  expect(dateien).toEqual(new Map([['quelle/gg', '<kaputt>']]));
  expect(extern.fetch).not.toHaveBeenCalled();
});

it('weist mehrdeutige physische Quellen vor jedem Dateizugriff ab', async () => {
  extern.invoke.mockImplementation(async (befehl: string) => {
    if (befehl === 'praefixlauf_dateistand')
      return { quellen: ['gg', 'GG'], gesetzesxml: [], original: [], konsolidiert: [] };
  });
  await startePraefixlauf({ modus: 'gesetzesxml', normgeber: 'de-bund', anzahl: 1 });
  expect(extern.invoke).toHaveBeenCalledWith('praefixlauf_beenden', { code: 1 });
  expect(
    extern.invoke.mock.calls.some(([b]) =>
      ['praefixlauf_arbeitsdatei_lesen', 'praefixlauf_arbeitsdatei_schreiben'].includes(b),
    ),
  ).toBe(false);
  expect(extern.fetch).not.toHaveBeenCalled();
});
