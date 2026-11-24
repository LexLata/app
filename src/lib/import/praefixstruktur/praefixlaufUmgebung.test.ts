// praefixlaufUmgebung.test.ts
// Standardlauf mit echten Importern und gefaktem Netz und Dateisystem.
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
    if (pfad.endsWith('de-bw.xml'))
      return '<importindex version="1"><infos><normgeber>de-bw</normgeber><datenquelle name="Landesrecht BW"/><verarbeitungszeit>2026-10-25T00:00:00Z</verarbeitungszeit></infos><inhalt><gesetz><kurztitel>LBO</kurztitel><langtitel>Landesbauordnung</langtitel><abrufkennung>lbo</abrufkennung></gesetz><gesetz><kurztitel>TestG</kurztitel><langtitel>Testgesetz</langtitel><abrufkennung>testg</abrufkennung></gesetz></inhalt></importindex>';
    if (pfad.endsWith('de-bund.xml'))
      return '<importindex version="1"><infos><normgeber>de-bund</normgeber><datenquelle name="Gesetze im Internet"/><verarbeitungszeit>2026-10-25T00:00:00Z</verarbeitungszeit></infos><inhalt><gesetz><kurztitel>GG</kurztitel><langtitel>Grundgesetz</langtitel><abrufkennung>gg</abrufkennung></gesetz></inhalt></importindex>';
    throw new Error('Datei fehlt');
  },
}));
const quelle =
  '<dokumente doknr="G"><norm doknr="G"><metadaten><jurabk>GG</jurabk><langue>Grundgesetz</langue></metadaten></norm><norm doknr="N"><metadaten><enbez>Art 1</enbez><titel>Menschenwürde</titel></metadaten><textdaten><text><Content><P>Die Würde ist unantastbar.</P></Content></text></textdaten></norm></dokumente>';
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('window', { __TAURI_INTERNALS__: { invoke: extern.invoke } });
  extern.invoke.mockImplementation(async (befehl: string) => {
    if (befehl === 'praefixlauf_dateistand')
      return { quellen: [], gesetzesxml: ['GG'], original: [], konsolidiert: [] };
    if (befehl === 'praefixlauf_datei_lesen') return null;
  });
  const zip = zipSync({ 'gg.xml': strToU8(quelle) });
  extern.fetch.mockResolvedValue({ ok: true, arrayBuffer: async () => zip.buffer });
});
afterEach(() => vi.unstubAllGlobals());

const bwHTML = (normen: string) =>
  `<!DOCTYPE html><html><head><title>Landesrecht BW - TestG | Landesnorm Baden-Württemberg | Gesamtausgabe | Testgesetz (TestG) vom 1. Januar 2000 | gültig ab: 2000-01-01</title></head><body><div class="docLayoutText">${normen}</div></body></html>`;
it.each(['de-bund', 'de-bw'] as const)(
  'Standardlauf %s verwendet Quellen offline und erzeugt GesetzesXML immer neu',
  async (normgeber) => {
    const { erzeugeTauriPraefixlaufUmgebung, fuehrePraefixlaufAus } =
      await import('./praefixstruktur.index');
    const kurztitel = normgeber === 'de-bund' ? 'GG' : 'TestG';
    const inhalt =
      normgeber === 'de-bund'
        ? quelle
        : bwHTML('<h4 style="font-family: Arial">§ 1 Titel</h4><p>Text.</p>');
    extern.invoke.mockImplementation(async (befehl: string) => {
      if (befehl === 'praefixlauf_dateistand')
        return { quellen: [kurztitel.toLowerCase()], gesetzesxml: [kurztitel] };
      if (befehl === 'praefixlauf_arbeitsdatei_lesen') return inhalt;
      if (befehl === 'praefixlauf_datei_lesen') return null;
    });
    const u = await erzeugeTauriPraefixlaufUmgebung({
      merkeGespeichertesGesetz: () => {},
      mitMeldungsempfaenger: async () => {
        throw new Error('Kein Teilvorgang in dieser Quellenattrappe');
      },
      referenzenFuer: async () => [],
      meldeEinschraenkung: () => {},
    });
    u.pause = vi.fn(async () => {});
    const bericht = await fuehrePraefixlaufAus(
      { modus: 'praefix', normgeber, anzahl: 1, kurztitel: [kurztitel] },
      u,
    );
    expect(bericht.gespeichert).toBe(1);
    expect(extern.fetch).not.toHaveBeenCalled();
    expect(u.pause).not.toHaveBeenCalled();
    expect(extern.invoke.mock.calls.filter(([c]) => c === 'praefixlauf_dateistand')).toHaveLength(
      1,
    );
    expect(extern.invoke).toHaveBeenCalledWith(
      'praefixlauf_arbeitsdatei_schreiben',
      expect.objectContaining({ art: 'gesetzesxml', kurztitel }),
    );
    expect(extern.invoke.mock.calls.some(([c]) => c === 'lade_gesetz_html_bw')).toBe(false);
  },
);

it('Standardlauf gescheitert lädt vorhandene Quelle neu und ersetzt sie vor dem GesetzesXML', async () => {
  const { erzeugeTauriPraefixlaufUmgebung, fuehrePraefixlaufAus } =
    await import('./praefixstruktur.index');
  const { schreibePraefixstrukturXml } = await import('./praefixstrukturXml');
  extern.invoke.mockImplementation(async (befehl: string) => {
    if (befehl === 'praefixlauf_dateistand') return { quellen: ['GG'], gesetzesxml: ['GG'] };
    if (befehl === 'praefixlauf_datei_lesen')
      return schreibePraefixstrukturXml(
        'de-bund',
        [{ kurztitel: 'GG', ermittlungsstatus: 'gescheitert', fehlerart: 'gesetz-laden' }],
        new Date(),
      );
  });
  const u = await erzeugeTauriPraefixlaufUmgebung({
    merkeGespeichertesGesetz: () => {},
    mitMeldungsempfaenger: async () => {
      throw new Error('Kein Teilvorgang in dieser Quellenattrappe');
    },
    referenzenFuer: async () => [],
    meldeEinschraenkung: () => {},
  });
  u.pause = vi.fn(async () => {});
  const bericht = await fuehrePraefixlaufAus(
    { modus: 'praefix', normgeber: 'de-bund', anzahl: 1, gescheitert: true },
    u,
  );
  expect(bericht.gespeichert).toBe(1);
  expect(u.pause).toHaveBeenCalledTimes(1);
  expect(extern.fetch).toHaveBeenCalledTimes(2);
  const dateien = extern.invoke.mock.calls.filter(([c]) =>
    ['praefixlauf_arbeitsdatei_schreiben', 'praefixlauf_arbeitsdatei_loeschen'].includes(c),
  );
  expect(dateien.map(([c, a]) => [c, a.art])).toEqual([
    ['praefixlauf_arbeitsdatei_loeschen', 'gesetzesxml'],
    ['praefixlauf_arbeitsdatei_schreiben', 'quelle'],
    ['praefixlauf_arbeitsdatei_schreiben', 'gesetzesxml'],
  ]);
});

it('Standardlauf kennzeichnet eine nicht konvertierbare vorhandene Quelle als gescheitert und meldet die Löschung', async () => {
  const { erzeugeTauriPraefixlaufUmgebung, fuehrePraefixlaufAus } =
    await import('./praefixstruktur.index');
  extern.invoke.mockImplementation(async (befehl: string) => {
    if (befehl === 'praefixlauf_dateistand') return { quellen: ['GG'], gesetzesxml: ['GG'] };
    if (befehl === 'praefixlauf_arbeitsdatei_lesen') return '<kaputt/>';
    if (befehl === 'praefixlauf_datei_lesen') return null;
  });
  const u = await erzeugeTauriPraefixlaufUmgebung({
    merkeGespeichertesGesetz: () => {},
    mitMeldungsempfaenger: async () => {
      throw new Error('Kein Teilvorgang in dieser Quellenattrappe');
    },
    referenzenFuer: async () => [],
    meldeEinschraenkung: () => {},
  });
  u.pause = vi.fn(async () => {});
  const bericht = await fuehrePraefixlaufAus(
    { modus: 'praefix', normgeber: 'de-bund', anzahl: 1 },
    u,
  );
  expect(bericht.gespeichert).toBe(0);
  expect(bericht.fehlgeschlagen).toEqual([
    { kurztitel: 'GG', meldung: expect.stringContaining('GesetzesXML gelöscht') },
  ]);
  expect(extern.invoke).toHaveBeenCalledWith('praefixlauf_arbeitsdatei_loeschen', {
    art: 'gesetzesxml',
    kurztitel: 'GG',
  });
  expect(extern.invoke).toHaveBeenCalledWith('praefixlauf_datei_schreiben', {
    xml: expect.stringContaining('fehlerart="gesetz-laden"'),
  });
  expect(extern.fetch).not.toHaveBeenCalled();
  expect(u.pause).not.toHaveBeenCalled();
});

it.each([
  [
    'de-bund',
    'https://www.gesetze-im-internet.de/Teilliste_A.html',
    'https://www.gesetze-im-internet.de/Teilliste_*.html',
  ],
  ['de-bw', 'https://www.landesrecht-bw.de/', 'https://www.landesrecht-bw.de/*'],
] as const)('prüft %s über eine freigegebene Quellenadresse', async (normgeber, adresse, scope) => {
  const { readFileSync } = await import('node:fs');
  const capability = JSON.parse(readFileSync('src-tauri/capabilities/default.json', 'utf8'));
  expect(capability.permissions).toContainEqual(
    expect.objectContaining({
      identifier: 'http:allow-fetch',
      allow: expect.arrayContaining([{ url: scope }]),
    }),
  );
  const { erzeugeTauriPraefixlaufUmgebung } = await import('./praefixstruktur.index');
  const u = await erzeugeTauriPraefixlaufUmgebung();
  expect(await u.pruefeErreichbarkeit(normgeber)).toBeNull();
  expect(extern.fetch).toHaveBeenCalledWith(adresse, expect.anything());
});

it('leitet Liste, Indexreihenfolge und Terminalausgabe weiter', async () => {
  const { erzeugeTauriPraefixlaufUmgebung } = await import('./praefixstruktur.index');
  const u = await erzeugeTauriPraefixlaufUmgebung();
  expect(await u.leseListe()).toBeNull();
  await u.schreibeListe('liste');
  await u.ausgabe('Fortschritt');
  expect(extern.invoke).toHaveBeenCalledWith('praefixlauf_datei_schreiben', { xml: 'liste' });
  expect(extern.invoke).toHaveBeenCalledWith('praefixlauf_ausgabe', { zeile: 'Fortschritt' });
  expect((await u.ladeKandidaten('de-bw')).map((e) => e.kurztitel)).toEqual(['LBO', 'TestG']);
});

it.each(['de-bund', 'de-bw'] as const)(
  'lässt Dateifehler beim Speichern von %s und der Liste werfen',
  async (normgeber) => {
    const { erzeugeTauriPraefixlaufUmgebung } = await import('./praefixstruktur.index');
    extern.invoke.mockImplementation(async (befehl: string) => {
      if (befehl === 'praefixlauf_arbeitsdatei_lesen')
        return normgeber === 'de-bund'
          ? quelle
          : bwHTML('<h4 style="font-family: Arial">§ 1 Titel</h4><p>Text.</p>');
      if (befehl.endsWith('_schreiben')) throw new Error('Schreiben');
    });
    const u = await erzeugeTauriPraefixlaufUmgebung({
      merkeGespeichertesGesetz: () => {},
      mitMeldungsempfaenger: async () => {
        throw new Error('Kein Teilvorgang in dieser Quellenattrappe');
      },
      referenzenFuer: async () => [],
      meldeEinschraenkung: () => {},
    });
    await expect(
      u.ladeGesetz(
        normgeber,
        { kurztitel: 'TestG', langtitel: '', abrufkennung: '' },
        undefined,
        true,
      ),
    ).rejects.toThrow('Schreiben');
    await expect(u.schreibeListe('xml')).rejects.toThrow('Schreiben');
  },
);

it('meldet beim Wiederverwenden die Offline-Verarbeitung ohne Abruf', async () => {
  const { erzeugeTauriPraefixlaufUmgebung } = await import('./praefixstruktur.index');
  extern.invoke.mockImplementation(async (befehl: string) =>
    befehl === 'praefixlauf_arbeitsdatei_lesen' ? quelle : null,
  );
  const u = await erzeugeTauriPraefixlaufUmgebung({
    merkeGespeichertesGesetz: () => {},
    mitMeldungsempfaenger: async () => {
      throw new Error('Kein Teilvorgang in dieser Quellenattrappe');
    },
    referenzenFuer: async () => [],
    meldeEinschraenkung: () => {},
  });
  const schritte = vi.fn(async () => {});
  expect(
    await u.ladeGesetz(
      'de-bund',
      { kurztitel: 'GG', langtitel: '', abrufkennung: '' },
      schritte,
      true,
    ),
  ).toMatchObject({ gesetz: expect.anything(), netz: false });
  expect(schritte).toHaveBeenCalledWith('Quelldatei lesen und GesetzesXML neu erzeugen');
  expect(extern.fetch).not.toHaveBeenCalled();
});
