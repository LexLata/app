// @vitest-environment jsdom
// euQuelle.test.ts
// Speicherfreie EU-Beschaffung und reproduzierbare Offline-Konvertierung.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const io = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: io.fetch }));
import { ladeEuQuelle, konvertiereEuQuelle } from './eu.index';
const eintrag = { kurztitel: 'DSGVO', langtitel: 'Verordnung', abrufkennung: '32016R0679' };
function zip(celex: string) {
  return new Uint8Array(readFileSync(`src/lib/import/eu/testdaten/formex/${celex}.fmx4`));
}
function antwort(celex: string) {
  return new Response(zip(celex), { headers: { 'content-type': 'application/zip' } });
}
function konsolidiert() {
  io.fetch
    .mockResolvedValueOnce(
      Response.json({
        results: {
          bindings: [{ kons: { value: '02016R0679-20160504' }, datum: { value: '2016-05-04' } }],
        },
      }),
    )
    .mockResolvedValueOnce(antwort('02016R0679-20160504'));
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
});
afterEach(() => vi.useRealTimers());
it('bewahrt Archive und Metadaten und konvertiert ohne weiteren Abruf reproduzierbar', async () => {
  konsolidiert();
  io.fetch.mockResolvedValueOnce(antwort(eintrag.abrufkennung));
  const quelle = await ladeEuQuelle(eintrag, 'konsolidiert-mit-erwaegungsgruenden');
  expect(quelle).toMatchObject({
    herkunft: {
      basisCelex: eintrag.abrufkennung,
      fassung: 'konsolidiert',
      celex: '02016R0679-20160504',
      datum: '2016-05-04',
      ergaenzung: 'ergaenzt',
    },
  });
  if ('fehler' in quelle) throw Error(quelle.fehler.meldung);
  expect(quelle.archive.original).toEqual(zip(eintrag.abrufkennung));
  const konvertiert = konvertiereEuQuelle(eintrag, quelle, new Date('2026-10-25T12:00:00Z'));
  expect(konvertiert).toEqual(
    konvertiereEuQuelle(eintrag, quelle, new Date('2026-10-25T12:00:00Z')),
  );
  expect(konvertiert).toMatchObject({ originalFehlt: false });
  if ('fehler' in konvertiert) throw Error(konvertiert.fehler.meldung);
  expect(konvertiert.xml).toContain(
    '<fassung art="konsolidiert" stichtag="2016-05-04" erwaegungsgruendeErgaenzt="true"/>',
  );
  expect(konvertiert.xml).not.toContain('<aenderungsvermerk>');
  expect(konvertiert.xml).toContain('<letzteNeuerung>2026-10-25T12:00:00Z</letzteNeuerung>');
  expect(konvertiert.xml).toContain('<fundstelle>ABl. L 119 vom 4.5.2016, S. 1</fundstelle>');
  expect(konvertiert.xml).toContain('<ausfertigung>2016-04-27</ausfertigung>');
  expect(io.fetch).toHaveBeenCalledTimes(3);
});
it.each([404, 406])('kennzeichnet fehlendes ergänzendes Original bei HTTP %s', async (status) => {
  konsolidiert();
  io.fetch.mockResolvedValueOnce(new Response(null, { status }));
  const quelle = await ladeEuQuelle(eintrag, 'konsolidiert-mit-erwaegungsgruenden');
  expect(quelle).toMatchObject({ herkunft: { ergaenzung: 'nicht-verfuegbar' } });
  if ('fehler' in quelle) throw Error(quelle.fehler.meldung);
  expect(konvertiereEuQuelle(eintrag, quelle, new Date('2026-10-25T12:00:00Z'))).toMatchObject({
    originalFehlt: true,
  });
});
it.each(['netz', 'http', 'zip'] as const)(
  'bewahrt die Ursache des ergänzenden Originalfehlers %s',
  async (art) => {
    konsolidiert();
    if (art === 'netz') io.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    else
      io.fetch.mockResolvedValueOnce(
        art === 'http'
          ? new Response(null, { status: 500 })
          : new Response('kein ZIP', { headers: { 'content-type': 'application/zip' } }),
      );
    expect(await ladeEuQuelle(eintrag, 'konsolidiert-mit-erwaegungsgruenden')).toMatchObject({
      herkunft: { ergaenzung: 'fehlgeschlagen' },
      ergaenzungsfehler: { meldung: expect.any(String) },
    });
  },
);
it.each([404, 406])(
  'fällt bei Basis-HTTP %s einmal auf den Originaltext zurück',
  async (status) => {
    konsolidiert();
    // Die zweite Antwort betrifft das Basisarchiv.
    io.fetch
      .mockReset()
      .mockResolvedValueOnce(
        Response.json({
          results: {
            bindings: [{ kons: { value: '02016R0679-20160504' }, datum: { value: '2016-05-04' } }],
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status }))
      .mockResolvedValueOnce(antwort(eintrag.abrufkennung));
    expect(await ladeEuQuelle(eintrag, 'konsolidiert-mit-erwaegungsgruenden')).toMatchObject({
      herkunft: { fassung: 'original', celex: eintrag.abrufkennung, ergaenzung: 'nicht-noetig' },
    });
    expect(io.fetch).toHaveBeenCalledTimes(3);
  },
);
it('liefert einen Basisformatfehler statt eines Rückfalls', async () => {
  io.fetch.mockResolvedValueOnce(
    new Response('kein ZIP', { headers: { 'content-type': 'application/zip' } }),
  );
  expect(await ladeEuQuelle(eintrag, 'original')).toMatchObject({ fehler: { grund: 'entpacken' } });
  expect(io.fetch).toHaveBeenCalledTimes(1);
});

it.each(['original', 'konsolidiert'] as const)(
  'liefert %s ohne ergänzenden Originalabruf',
  async (fassung) => {
    if (fassung === 'konsolidiert') konsolidiert();
    else io.fetch.mockResolvedValueOnce(antwort(eintrag.abrufkennung));
    const quelle = await ladeEuQuelle(eintrag, fassung);
    expect(quelle).toMatchObject({ herkunft: { fassung, ergaenzung: 'nicht-noetig' } });
    expect(io.fetch).toHaveBeenCalledTimes(fassung === 'original' ? 1 : 2);
  },
);
it.each(['netz', 'http'] as const)(
  'liefert einen Basisfehler bei %s ohne Rückfall',
  async (art) => {
    if (art === 'netz') io.fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    else io.fetch.mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(await ladeEuQuelle(eintrag, 'original')).toMatchObject({
      fehler: {
        grund: art === 'netz' ? 'keineVerbindung' : 'download',
      },
    });
    expect(io.fetch).toHaveBeenCalledTimes(1);
  },
);
