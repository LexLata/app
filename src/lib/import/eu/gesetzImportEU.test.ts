// @vitest-environment jsdom
// gesetzImportEU.test.ts
// Fassungsrückfall und Metadaten mit echten portablen Formex-Archiven.
import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  ladeAlleGesetze: vi.fn(),
  abschluss: vi.fn(),
  banner: vi.fn(),
  suche: vi.fn(),
}));
vi.mock('@/lib/import/importindex/importindex.index', () => ({ sucheImImportindex: mocks.suche }));
vi.mock('@/lib/banner/banner.index', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  zeigeBanner: mocks.banner,
}));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: mocks.fetch }));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (original) => ({
  leseAbgeglichenesSuchverzeichnis: async () => ({ abgeglichen: true, eintraege: [] }),
  ...(await original<object>()),

  leseGesetz: async (referenz: { kurztitel: string; normgeber: string }) => {
    const liste = await mocks.ladeAlleGesetze();
    const gesetz = liste.find(
      (g: { kurztitel: string; normgeber: string }) =>
        g.kurztitel.toLowerCase() === referenz.kurztitel.toLowerCase() &&
        g.normgeber === referenz.normgeber,
    );
    return gesetz ? { status: 'geladen', gesetz, befunde: [] } : { status: 'fehlt', befunde: [] };
  },
  ladeAlleGesetze: mocks.ladeAlleGesetze,
  ladeGesetzesXML: async () => null,
}));
vi.mock('@/lib/import/importabschluss/importabschluss.index', async (original) => ({
  ...(await original<object>()),
  taggeUndSpeichereGesetzesXML: mocks.abschluss,
}));
import { importiereVomInternetEU, aktualisierungVomInternetEU } from './gesetzImportEU';
import { leseAusfertigung } from './euKonvertierung';
import { EUR_LEX_QUELLE } from './cellar';
import * as parser from './formexParser';
import { extrahiereFormexZip } from './formexZip';
const eintrag = { kurztitel: 'Rom I', langtitel: 'Verordnung', abrufkennung: '32008R0593' };
const zip = new Uint8Array(readFileSync('src/lib/import/eu/testdaten/formex/32008R0593.fmx4'));
const archivAntwort = () => new Response(zip, { headers: { 'content-type': 'application/zip' } });
const kons = () =>
  Response.json({
    results: {
      bindings: [{ kons: { value: '02008R0593-20250101' }, datum: { value: '2025-01-01' } }],
    },
  });
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  mocks.ladeAlleGesetze.mockResolvedValue([]);
  mocks.abschluss.mockResolvedValue({
    art: 'erfolg',
    gesetz: { kurztitel: 'Rom I', normgeber: 'eu' },
  });
});
it.each([
  ['32008R0593', '32008R0593', '2008-06-17'],
  ['02016R0679-20160504', '32016R0679', '2016-04-27'],
  ['02004L0038-20110616', '32004L0038', '2004-04-29'],
  ['02016E%2FTXT-20250315', '12016E/TXT', ''],
  ['02016M%2FTXT-20250315', '12016M/TXT', ''],
  ['12016P%2FTXT', '12016P/TXT', ''],
])('liest Ausfertigung aus %s', (datei, basis, datum) => {
  const archiv = extrahiereFormexZip(
    new Uint8Array(readFileSync(`src/lib/import/eu/testdaten/formex/${datei}.fmx4`)),
  );
  if ('fehler' in archiv) throw new Error(archiv.fehler);
  expect(leseAusfertigung(archiv.docXml, basis)).toBe(datum);
});
it('importiert Original nach Konsolidierungs-404 mit tatsächlich verwendeten Metadaten', async () => {
  mocks.fetch
    .mockResolvedValueOnce(kons())
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(archivAntwort());
  expect(await importiereVomInternetEU(eintrag)).toMatchObject({ art: 'erfolg' });
  const xml = mocks.abschluss.mock.calls[0]![0];
  expect(xml).toContain('<ausfertigung>2008-06-17</ausfertigung>');
  expect(EUR_LEX_QUELLE).toBe('EUR-Lex');
  expect(xml).toContain(
    `<datenquelle name="${EUR_LEX_QUELLE}" url="https://eur-lex.europa.eu/legal-content/DE/TXT/?uri=CELEX:32008R0593"/>`,
  );
  expect(xml).toContain('<normgeber>eu</normgeber>');
  expect(xml).toContain('CELEX:32008R0593');
  expect(xml).toContain('<fassung art="original"/>');
  mocks.ladeAlleGesetze.mockResolvedValue([{ kurztitel: 'Rom I', normgeber: 'eu' }]);
  expect(await importiereVomInternetEU(eintrag)).toMatchObject({
    fehler: { grund: 'bereitsVorhanden', meldung: 'Rom I ist bereits auf dem Gerät.' },
  });
  expect(mocks.fetch).toHaveBeenCalledTimes(3);
});
it('fällt vom fehlenden Original einmal auf Konsolidierung zurück', async () => {
  mocks.fetch
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(kons())
    .mockResolvedValueOnce(archivAntwort());
  expect(
    await importiereVomInternetEU(eintrag, undefined, undefined, undefined, undefined, 'original'),
  ).toMatchObject({ art: 'erfolg' });
  const xml = mocks.abschluss.mock.calls[0]![0];
  expect(xml).toContain('CELEX:02008R0593-20250101');
  expect(xml).toContain('<fassung art="konsolidiert" stichtag="2025-01-01"/>');
});
it('beendet zwei fehlende Fassungen ohne Schleife', async () => {
  mocks.fetch
    .mockResolvedValueOnce(kons())
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(new Response(null, { status: 404 }));
  expect(await importiereVomInternetEU(eintrag)).toMatchObject({
    fehler: { grund: 'nichtVerfuegbar' },
  });
  expect(mocks.fetch).toHaveBeenCalledTimes(3);
});
it('lädt ohne Konsolidierung direkt das Original', async () => {
  mocks.fetch
    .mockResolvedValueOnce(Response.json({ results: { bindings: [] } }))
    .mockResolvedValueOnce(archivAntwort());
  expect(await importiereVomInternetEU(eintrag)).toMatchObject({ art: 'erfolg' });
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
});
it('wechselt bei Verbindungsfehler nicht die Fassung', async () => {
  mocks.fetch.mockResolvedValueOnce(kons()).mockRejectedValueOnce(new TypeError('Failed to fetch'));
  expect(await importiereVomInternetEU(eintrag)).toMatchObject({
    fehler: {
      grund: 'keineVerbindung',
      meldung: 'Keine Verbindung zu publications.europa.eu möglich. Bitte später erneut versuchen.',
    },
  });
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
});

it.each(['original', 'konsolidiert'])(
  'verwendet die gespeicherte Fassungswahl %s',
  async (fassung) => {
    localStorage.setItem('lexlata.euFassung', fassung);
    if (fassung === 'konsolidiert') mocks.fetch.mockResolvedValueOnce(kons());
    mocks.fetch.mockResolvedValueOnce(archivAntwort());
    expect(await importiereVomInternetEU(eintrag)).toMatchObject({ art: 'erfolg' });
    expect(mocks.fetch.mock.calls.at(-1)![0]).toContain(
      fassung === 'original' ? '32008R0593' : '02008R0593-20250101',
    );
  },
);

it.each([404, 406])(
  'meldet nach Konsolidierungs-%s genau einmal das gespeicherte Original',
  async (status) => {
    const meldung = vi.fn();
    mocks.fetch
      .mockResolvedValueOnce(kons())
      .mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(archivAntwort());
    mocks.abschluss.mockImplementation(async () => {
      expect(meldung).not.toHaveBeenCalled();
      return { art: 'erfolg', gesetz: { kurztitel: 'Rom I', normgeber: 'eu' } };
    });
    expect(
      await importiereVomInternetEU(eintrag, undefined, undefined, undefined, meldung),
    ).toMatchObject({ art: 'erfolg' });
    expect(meldung).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ text: expect.stringContaining('Rom I: Originaltext importiert') }),
    );
    expect(meldung.mock.calls[0]![0].text).toContain('gewählte konsolidierte Fassung');
    expect(meldung.mock.calls[0]![0].text).toContain('Spätere Änderungen können fehlen.');
    expect(mocks.banner).not.toHaveBeenCalled();
  },
);
it.each([404, 406])(
  'meldet nach Original-%s die tatsächlich gespeicherte Konsolidierung im Banner',
  async (status) => {
    mocks.fetch
      .mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(kons())
      .mockResolvedValueOnce(archivAntwort());
    expect(
      await importiereVomInternetEU(
        eintrag,
        undefined,
        undefined,
        undefined,
        undefined,
        'original',
      ),
    ).toMatchObject({ art: 'erfolg' });
    expect(mocks.banner).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        text: expect.stringContaining(
          'Rom I: Konsolidierte Fassung vom 01.01.2025 (keine Rechtswirkung) importiert',
        ),
      }),
    );
    expect(mocks.banner.mock.calls[0]![0].text).toContain('gewählte Originaltext');
    expect(mocks.banner.mock.calls[0]![0].text).not.toContain('Spätere Änderungen');
  },
);
it('erklärt fehlende Konsolidierung und meldet keinen erfolglosen Ersatzimport', async () => {
  mocks.fetch
    .mockResolvedValueOnce(Response.json({ results: { bindings: [] } }))
    .mockResolvedValueOnce(archivAntwort());
  await importiereVomInternetEU(eintrag);
  expect(mocks.banner).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ text: expect.stringContaining('keine konsolidierte Fassung') }),
  );
  mocks.banner.mockClear();
  mocks.fetch
    .mockResolvedValueOnce(kons())
    .mockResolvedValueOnce(new Response(null, { status: 406 }))
    .mockResolvedValueOnce(archivAntwort());
  mocks.abschluss.mockResolvedValueOnce({
    art: 'fehler',
    fehler: { grund: 'speichern', meldung: 'Speichern fehlgeschlagen' },
  });
  expect(await importiereVomInternetEU(eintrag)).toMatchObject({ art: 'fehler' });
  expect(mocks.banner).not.toHaveBeenCalled();
});
it.each([404, 406])('beendet zwei nicht verfügbare Fassungen (%s) ohne Banner', async (status) => {
  mocks.fetch
    .mockResolvedValueOnce(kons())
    .mockResolvedValueOnce(new Response(null, { status }))
    .mockResolvedValueOnce(new Response(null, { status }));
  expect(await importiereVomInternetEU(eintrag)).toMatchObject({
    fehler: { grund: 'nichtVerfuegbar' },
  });
  expect(mocks.fetch).toHaveBeenCalledTimes(3);
  expect(mocks.banner).not.toHaveBeenCalled();
});
it.each([500, 503])(
  'wechselt bei Serverfehler %s nicht die Fassung und meldet keinen Erfolg',
  async (status) => {
    mocks.fetch.mockResolvedValueOnce(kons()).mockResolvedValueOnce(new Response(null, { status }));
    expect(await importiereVomInternetEU(eintrag)).toMatchObject({ fehler: { grund: 'download' } });
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.banner).not.toHaveBeenCalled();
  },
);
it('meldet bei unveränderter Fassung keinen Fassungsbanner', async () => {
  mocks.fetch.mockResolvedValueOnce(kons()).mockResolvedValueOnce(archivAntwort());
  await importiereVomInternetEU(eintrag);
  expect(mocks.banner).not.toHaveBeenCalled();
});

it.each(['entpacken', 'format'] as const)(
  'wechselt bei %s-Fehler nicht und meldet keinen Fassungswechsel',
  async (grund) => {
    const parse =
      grund === 'format'
        ? vi.spyOn(parser, 'parseFormex').mockReturnValue({ fehler: 'Parserfehler' })
        : undefined;
    try {
      mocks.fetch
        .mockResolvedValueOnce(kons())
        .mockResolvedValueOnce(
          grund === 'format'
            ? archivAntwort()
            : new Response('kein ZIP', { headers: { 'content-type': 'application/zip' } }),
        );
      expect(await importiereVomInternetEU(eintrag)).toMatchObject({ fehler: { grund } });
      expect(mocks.fetch).toHaveBeenCalledTimes(2);
      expect(mocks.abschluss).not.toHaveBeenCalled();
      expect(mocks.banner).not.toHaveBeenCalled();
    } finally {
      parse?.mockRestore();
    }
  },
);

it('aktualisiert über den EU-Index und reicht den Bestand an den gemeinsamen Abschluss', async () => {
  const gesetz = {
    kurztitel: 'Rom I',
    normgeber: 'eu',
    langtitel: 'Verordnung',
    elemente: [],
    hatGliederungsartikel: false,
  };
  mocks.suche.mockResolvedValue(eintrag);
  localStorage.setItem('lexlata.euFassung', 'original');
  mocks.fetch.mockResolvedValueOnce(archivAntwort());
  mocks.abschluss.mockResolvedValueOnce({ art: 'erfolg', gesetz, kategorie: 'unveraendert' });
  expect(await aktualisierungVomInternetEU(gesetz)).toMatchObject({ kategorie: 'unveraendert' });
  expect(mocks.suche).toHaveBeenCalledWith('eu', 'Rom I');
  expect(mocks.abschluss.mock.calls[0]!.slice(4, 6)).toEqual([true, gesetz]);
  expect(mocks.ladeAlleGesetze).not.toHaveBeenCalled();
});
it('meldet fehlenden Indexeintrag und Verbindungsfehler bei Aktualisierung', async () => {
  const gesetz = {
    kurztitel: 'Rom I',
    normgeber: 'eu',
    langtitel: 'Verordnung',
    elemente: [],
    hatGliederungsartikel: false,
  };
  mocks.suche.mockResolvedValueOnce(null);
  expect(await aktualisierungVomInternetEU(gesetz)).toMatchObject({
    fehler: { grund: 'nichtImIndex' },
  });
  mocks.suche.mockResolvedValueOnce(eintrag);
  mocks.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  expect(await aktualisierungVomInternetEU(gesetz)).toMatchObject({
    fehler: { grund: 'keineVerbindung' },
  });
});

// Bestehende Szenarioattrappe des früheren Sammelwegs nur im Testzugang.
vi.mock('@/test/tabs/gesetzSpeicherTestzugang', async (original) => ({
  ...(await original<typeof import('@/test/tabs/gesetzSpeicherTestzugang')>()),
  ladeAlleGesetze: mocks.ladeAlleGesetze,
}));
