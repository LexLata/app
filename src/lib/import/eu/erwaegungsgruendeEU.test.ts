// @vitest-environment jsdom
// erwaegungsgruendeEU.test.ts
// Ergänzung amtlicher Erwägungsgründe mit echten, unveränderten Formex-Archiven.
import { readFileSync } from 'node:fs';
import { beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({ fetch: vi.fn(), abschluss: vi.fn(), suche: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: io.fetch }));
vi.mock('@/lib/import/importindex/importindex.index', () => ({ sucheImImportindex: io.suche }));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (original) => ({
  leseAbgeglichenesSuchverzeichnis: async () => ({ abgeglichen: true, eintraege: [] }),
  ...(await original<object>()),
  leseGesetz: async () => ({ status: 'fehlt', befunde: [] }),
  ladeGesetzesXML: async () => null,
}));
vi.mock('@/lib/import/importabschluss/importabschluss.index', async (original) => ({
  ...(await original<object>()),
  taggeUndSpeichereGesetzesXML: io.abschluss,
}));
import { importiereVomInternetEU, aktualisierungVomInternetEU } from './gesetzImportEU';
import { extrahiereFormexZip } from './formexZip';
const daten = [
  ['DSGVO', '32016R0679', '02016R0679-20160504', 173],
  ['DSA', '32022R2065', '02022R2065-20221027', 156],
  ['AI Act', '32024R1689', '02024R1689-20260727', 180],
] as const;
function antwort(celex: string) {
  return new Response(
    new Uint8Array(readFileSync(`src/lib/import/eu/testdaten/formex/${celex}.fmx4`)),
    { headers: { 'content-type': 'application/zip' } },
  );
}
function vorbereiten(basis = '32016R0679', kons = '02016R0679-20160504') {
  const eintrag = { kurztitel: 'DSGVO', langtitel: 'Verordnung', abrufkennung: basis };
  io.suche.mockResolvedValue(eintrag);
  io.fetch
    .mockResolvedValueOnce(
      Response.json({
        results: { bindings: [{ kons: { value: kons }, datum: { value: '2016-05-04' } }] },
      }),
    )
    .mockResolvedValueOnce(antwort(kons));
  return eintrag;
}
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  localStorage.setItem('lexlata.euFassung', 'konsolidiert-mit-erwaegungsgruenden');
  io.abschluss.mockResolvedValue({ art: 'erfolg', gesetz: {} });
});
it.each(daten)(
  'ergänzt %s vor allen Artikeln aus dem amtlichen Original (%s)',
  async (_, basis, kons, anzahl) => {
    const archiv = extrahiereFormexZip(
      new Uint8Array(readFileSync(`src/lib/import/eu/testdaten/formex/${basis}.fmx4`)),
    );
    if ('fehler' in archiv) throw new Error(archiv.fehler);
    expect(
      new DOMParser()
        .parseFromString(archiv.hauptdatei, 'application/xml')
        .getElementsByTagName('CONSID'),
    ).toHaveLength(anzahl);
    const eintrag = vorbereiten(basis, kons);
    io.fetch.mockResolvedValueOnce(antwort(basis));
    expect(await importiereVomInternetEU(eintrag)).toMatchObject({ art: 'erfolg' });
    const xml = io.abschluss.mock.calls[0]![0] as string;
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    expect(doc.querySelectorAll('norm[typ="erwaegungsgrund"]')).toHaveLength(anzahl);
    const elemente = doc.querySelectorAll('gliederung, norm');
    expect(elemente[0]?.textContent).toContain('Erwägungsgründe');
    expect(
      Array.from(
        doc.querySelectorAll('norm[typ="erwaegungsgrund"] > bezeichnung'),
        (e) => e.textContent,
      ),
    ).toEqual(Array.from({ length: anzahl }, (_, i) => `E${i + 1}`));
    expect(xml).toContain('erwaegungsgruendeErgaenzt="true"');
  },
);
it('verwendet die eigenen 31 Erwägungsgründe der Richtlinie ohne Originalabruf', async () => {
  const eintrag = vorbereiten('32004L0038', '02004L0038-20110616');
  await importiereVomInternetEU(eintrag);
  expect(io.fetch).toHaveBeenCalledTimes(2);
  const doc = new DOMParser().parseFromString(io.abschluss.mock.calls[0]![0], 'application/xml');
  expect(doc.querySelectorAll('norm[typ="erwaegungsgrund"]')).toHaveLength(31);
  expect(io.abschluss.mock.calls[0]![0]).not.toContain('erwaegungsgruendeErgaenzt="true"');
});
it.each([404, 406])('übergeht Original-%s beim Erstimport ohne Meldung', async (status) => {
  const eintrag = vorbereiten();
  io.fetch.mockResolvedValueOnce(new Response(null, { status }));
  const melden = vi.fn();
  expect(
    await importiereVomInternetEU(eintrag, undefined, undefined, undefined, melden),
  ).toMatchObject({ art: 'erfolg' });
  expect(melden).not.toHaveBeenCalled();
  expect(io.abschluss.mock.calls[0]![0]).not.toContain('erwaegungsgruendeErgaenzt="true"');
});
it('warnt erst nach erfolgreichem Erstimport bei vorübergehendem Ergänzungsfehler', async () => {
  const eintrag = vorbereiten();
  io.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  const melden = vi.fn();
  io.abschluss.mockImplementation(async () => {
    expect(melden).not.toHaveBeenCalled();
    return { art: 'erfolg', gesetz: {} };
  });
  expect(
    await importiereVomInternetEU(eintrag, undefined, undefined, undefined, melden),
  ).toMatchObject({ art: 'erfolg' });
  expect(melden).toHaveBeenCalledWith(
    expect.objectContaining({
      typ: 'warnung',
      text: expect.stringContaining('Erwägungsgründe konnten nicht geladen werden'),
    }),
  );
});
it.each([404, 406, 500, 'verbindung', 'zip'] as const)(
  'bricht Aktualisierung bei Ergänzungsfehler %s vor dem Abschluss ab',
  async (status) => {
    vorbereiten();
    if (status === 'verbindung') io.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    else
      io.fetch.mockResolvedValueOnce(
        status === 'zip'
          ? new Response('kein ZIP', { headers: { 'content-type': 'application/zip' } })
          : new Response(null, { status }),
      );
    const gesetz = {
      kurztitel: 'DSGVO',
      normgeber: 'eu',
      langtitel: '',
      elemente: [],
      hatGliederungsartikel: false,
      fassung: { art: 'konsolidiert' as const, erwaegungsgruendeErgaenzt: true },
    };
    expect(await aktualisierungVomInternetEU(gesetz)).toMatchObject({
      art: 'fehler',
      fehler: { meldung: expect.stringContaining('Bestehende Fassung wurde beibehalten') },
    });
    expect(io.abschluss).not.toHaveBeenCalled();
  },
);
