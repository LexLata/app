// @vitest-environment jsdom
// euUmgebung.integration.test.ts
// EU-Lauf mit echtem Index, Formex-Konvertierung und gefaktem externem Dateisystem und Netz.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { importindexFixture } from '@/test/import/europaImportFixtures';
const io = vi.hoisted(() => ({ invoke: vi.fn(), fetch: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: io.invoke }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: io.fetch }));
vi.mock('@tauri-apps/api/path', () => ({
  localDataDir: async () => '/daten',
  join: async (...teile: string[]) => teile.join('/'),
  resolveResource: async (pfad: string) => pfad,
}));
const typen = [
  'verordnung',
  'richtlinie',
  'durchfuehrungsverordnung',
  'delegierte-verordnung',
  'delegierte-richtlinie',
  'durchfuehrungsrichtlinie',
];
vi.mock('@tauri-apps/plugin-fs', () => ({
  readDir: async () => [],
  async readTextFile(pfad: string) {
    if (pfad.endsWith('europaKuratiert.json'))
      return JSON.stringify([
        { celex: '32016R0679', kurztitel: 'DSGVO', langtitel: 'Datenschutz' },
      ]);
    if (pfad.endsWith('eu.xml'))
      return importindexFixture(
        'eu',
        typen
          .map(
            (typ, i) =>
              `<gesetz typ="${typ}"><kurztitel>Gesetz ${i}</kurztitel><langtitel>Gesetz ${i}</langtitel><abrufkennung>${i === 0 ? '32016R0679' : `32000R000${i}`}</abrufkennung></gesetz>`,
          )
          .join(''),
      );
    return importindexFixture('de-bund', '');
  },
}));
import {
  erzeugeTauriEuQuelldateienUmgebung,
  fuehreQuelldateienLaufAus,
  erzeugeTauriEuGesetzesXMLUmgebung,
  fuehreGesetzesXMLLaufAus,
  formatiereLaufBericht,
} from './quelldateien.index';
const konsolidiert = new Uint8Array(
  readFileSync('src/lib/import/eu/testdaten/formex/02016R0679-20160504.fmx4'),
);
const original = new Uint8Array(readFileSync('src/lib/import/eu/testdaten/formex/32016R0679.fmx4'));
const dateien = new Map<string, string | number[]>();
let originalStatus = 500;
let basisStatus = 200;
function umgebung() {
  return erzeugeTauriEuQuelldateienUmgebung({
    merkeGespeichertesGesetz: () => {},
    mitMeldungsempfaenger: async () => {
      throw new Error('Kein Teilvorgang in dieser Quellenattrappe');
    },
    referenzenFuer: async () => [],
    meldeEinschraenkung: () => {},
  });
}
async function lauf(anzahl = Number.MAX_SAFE_INTEGER, kurztitel?: string[]) {
  vi.setSystemTime(new Date('2026-10-26T00:00:00Z'));
  const arbeit = fuehreQuelldateienLaufAus(
    // Benannte Kurztitel sollen hier stets neu abgerufen werden.
    {
      modus: 'quelldateien',
      normgeber: 'eu',
      anzahl,
      ...(kurztitel ? { kurztitel, neu: true } : {}),
    },
    umgebung(),
  );
  void arbeit.catch(() => {});
  await vi.runAllTimersAsync();
  return arbeit;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-26T00:00:00Z'));
  dateien.clear();
  originalStatus = 500;
  basisStatus = 200;
  localStorage.setItem('euFassung', 'original');
  io.invoke.mockImplementation(
    async (
      befehl: string,
      args?: { art?: string; kurztitel?: string; inhalt?: string | number[] },
    ) => {
      const key = `${args?.art}/${args?.kurztitel}`;
      if (befehl === 'praefixlauf_dateistand')
        return {
          quellen: [...dateien.keys()]
            .filter((k) => k.startsWith('herkunft/'))
            .map((k) => k.slice(9)),
          gesetzesxml: [...dateien.keys()]
            .filter((k) => k.startsWith('gesetzesxml/'))
            .map((k) => k.slice(12)),
          original: [...dateien.keys()]
            .filter((k) => k.startsWith('original/'))
            .map((k) => k.slice(9)),
          konsolidiert: [...dateien.keys()]
            .filter((k) => k.startsWith('konsolidiert/'))
            .map((k) => k.slice(13)),
        };
      if (befehl.endsWith('_lesen')) return dateien.get(key) ?? null;
      if (befehl.endsWith('_loeschen')) dateien.delete(key);
      if (befehl.endsWith('_schreiben') && args?.inhalt !== undefined)
        dateien.set(key, args.inhalt);
    },
  );
  io.fetch.mockImplementation(async (url: string) => {
    if (url === 'https://publications.europa.eu/')
      throw new Error('url not allowed on the configured scope: https://op.europa.eu/');
    if (new URL(url).searchParams.get('query') === 'ASK{}') return Response.json({ boolean: true });
    if (url.includes('sparql')) {
      const basisCelex =
        decodeURIComponent(url).match(/resource_legal_id_celex "([^"]+)"/)?.[1] ?? '32016R0679';
      return Response.json({
        results: {
          bindings: [
            { kons: { value: `0${basisCelex.slice(1)}-20160504` }, datum: { value: '2016-05-04' } },
          ],
        },
      });
    }
    const status = /0\d{4}R\d{4}-/.test(url) ? basisStatus : originalStatus;
    return status === 200
      ? new Response(/0\d{4}R\d{4}-/.test(url) ? konsolidiert : original, {
          headers: { 'content-type': 'application/zip' },
        })
      : new Response(null, { status });
  });
});
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});
it('prüft die Erreichbarkeit direkt bei Cellar ohne die weitergeleitete Portalseite', async () => {
  await expect(umgebung().pruefeErreichbarkeit()).resolves.toBeNull();
  expect(io.fetch).toHaveBeenCalledTimes(1);
  const abruf = io.fetch.mock.calls[0];
  if (!abruf) throw new Error('Cellar wurde nicht abgerufen.');
  const url = new URL(abruf[0]);
  expect(url.origin).toBe('https://publications.europa.eu');
  expect(url.pathname).toBe('/webapi/rdf/sparql');
  expect(url.searchParams.get('query')).toBe('ASK{}');
});

it('verarbeitet alle Dokumenttypen mit kuratiertem Vorrang, speichert unveränderte Bytes und setzt ohne Abrufe wieder auf', async () => {
  const bericht = await lauf();
  expect(bericht.teilerfolge).toHaveLength(6);
  expect(bericht.gespeichert).toBe(0);
  expect(formatiereLaufBericht(bericht)).toContain('Teilerfolge: 6');
  expect(dateien.get('konsolidiert/DSGVO')).toEqual(Array.from(konsolidiert));
  expect(dateien.get('gesetzesxml/DSGVO')).toContain(
    '<fassung art="konsolidiert" stichtag="2016-05-04"',
  );
  expect(dateien.has('herkunft/Gesetz 0')).toBe(false);
  const anzahl = io.fetch.mock.calls.length;
  expect((await lauf()).gespeichert).toBe(0);
  expect(io.fetch).toHaveBeenCalledTimes(anzahl);
  await lauf(1, ['DSGVO']);
  expect(io.fetch.mock.calls.length).toBeGreaterThan(anzahl);
}, 10000);
it.each([404, 406])('zählt fehlendes Original bei HTTP %s nicht als Teilerfolg', async (status) => {
  originalStatus = status;
  const bericht = await lauf(1);
  expect(bericht).toMatchObject({ gespeichert: 1, teilerfolge: [] });
  expect(JSON.parse(String(dateien.get('herkunft/DSGVO')))).toMatchObject({
    ergaenzung: 'nicht-verfuegbar',
  });
});
it('weist den Rückfall auf Originaltext getrennt als Erfolg aus', async () => {
  basisStatus = 404;
  originalStatus = 200;
  const bericht = await lauf(1);
  expect(bericht).toMatchObject({ gespeichert: 1, teilerfolge: [] });
  expect(bericht.zusatzzeilen).toContain('Rückfall auf Originaltext: 1');
  expect(dateien.has('konsolidiert/DSGVO')).toBe(false);
  expect(JSON.parse(String(dateien.get('herkunft/DSGVO')))).toMatchObject({
    fassung: 'original',
    celex: '32016R0679',
  });
});

it.each([404, 406, 500])(
  'ergänzt bei Original-HTTP %s aus einem nachgewiesenen Alt-Original ohne Teilerfolg',
  async (status) => {
    originalStatus = status;
    dateien.set(
      'herkunft/DSGVO',
      JSON.stringify({
        basisCelex: '32016R0679',
        fassung: 'konsolidiert',
        ergaenzung: 'fehlgeschlagen',
      }),
    );
    dateien.set('original/DSGVO', Array.from(original));
    const bericht = await lauf(1, ['DSGVO']);
    expect(bericht).toMatchObject({ gespeichert: 1, teilerfolge: [] });
    expect(bericht.zusatzzeilen?.join(' ')).toContain('wiederverwendet');
    expect(JSON.parse(String(dateien.get('herkunft/DSGVO')))).toMatchObject({
      ergaenzung: 'ergaenzt',
      originalBasisCelex: '32016R0679',
    });
    expect(dateien.get('gesetzesxml/DSGVO')).toContain('erwaegungsgruendeErgaenzt="true"');
  },
);

async function offline(neu = false) {
  vi.setSystemTime(new Date('2026-10-26T00:00:00Z'));
  return fuehreGesetzesXMLLaufAus(
    {
      modus: 'gesetzesxml',
      normgeber: 'eu',
      anzahl: Number.MAX_SAFE_INTEGER,
      ...(neu ? { neu } : {}),
    },
    erzeugeTauriEuGesetzesXMLUmgebung({
      merkeGespeichertesGesetz: () => {},
      mitMeldungsempfaenger: async () => {
        throw new Error('Kein Teilvorgang in dieser Quellenattrappe');
      },
      referenzenFuer: async () => [],
      meldeEinschraenkung: () => {},
    }),
  );
}
it('erzeugt alle sechs Dokumenttypen offline identisch und setzt ohne Netz fort', async () => {
  await lauf();
  const xml = new Map([...dateien].filter(([k]) => k.startsWith('gesetzesxml/')));
  const abrufe = io.fetch.mock.calls.length;
  expect((await offline()).teilerfolge).toHaveLength(0);
  for (const key of xml.keys()) dateien.delete(key);
  const bericht = await offline();
  expect(bericht.teilerfolge).toHaveLength(6);
  expect(formatiereLaufBericht(bericht)).toContain('Teilerfolge: 6');
  for (const [key, inhalt] of xml) expect(dateien.get(key)).toEqual(inhalt);
  expect(io.fetch).toHaveBeenCalledTimes(abrufe);
  expect(
    io.invoke.mock.calls.some(([b]) =>
      ['praefixlauf_datei_lesen', 'praefixlauf_datei_schreiben'].includes(b),
    ),
  ).toBe(false);
}, 10_000);
it.each(['Archiv', 'Herkunft', 'XML'])(
  'nimmt nach Abbruch vor der Schreibung von %s sicher wieder auf',
  async (schritt) => {
    const normal = io.invoke.getMockImplementation();
    if (!normal) throw new Error('Dateibefehle fehlen');
    const befehl =
      schritt === 'Archiv' ? 'praefixlauf_archiv_schreiben' : 'praefixlauf_arbeitsdatei_schreiben';
    const art =
      schritt === 'Archiv' ? 'konsolidiert' : schritt === 'Herkunft' ? 'herkunft' : 'gesetzesxml';
    io.invoke.mockImplementation(async (b, args) => {
      if (b === befehl && args?.art === art) throw new Error('Abbruch');
      return normal(b, args);
    });
    dateien.set(
      'herkunft/DSGVO',
      JSON.stringify({
        basisCelex: '32016R0679',
        fassung: 'konsolidiert',
        celex: '02016R0679-20100101',
        datum: '2010-01-01',
        ergaenzung: 'fehlgeschlagen',
      }),
    );
    dateien.set('gesetzesxml/DSGVO', 'Altes GesetzesXML 2010');
    dateien.set('konsolidiert/DSGVO', Array.from(konsolidiert));
    const arbeit = lauf(1, ['DSGVO']);
    const abbruch = expect(arbeit).rejects.toThrow('Abbruch');
    await vi.runAllTimersAsync();
    await abbruch;
    io.invoke.mockImplementation(normal);
    const abrufe = io.fetch.mock.calls.length;
    const bericht = await offline();
    if (schritt === 'XML') {
      expect(bericht.teilerfolge).toHaveLength(1);
      expect(dateien.get('gesetzesxml/DSGVO')).toContain('stichtag="2016-05-04"');
      expect(dateien.get('gesetzesxml/DSGVO')).not.toContain('01.01.2010');
    } else {
      expect(bericht.teilerfolge).toHaveLength(0);
      expect(dateien.has('gesetzesxml/DSGVO')).toBe(false);
      if (schritt === 'Herkunft')
        expect(bericht.zusatzzeilen?.join(' ')).toContain('Archive ohne Herkunftsangabe');
    }
    expect(io.fetch).toHaveBeenCalledTimes(abrufe);
    if (schritt !== 'XML') {
      await lauf(1);
      expect(io.fetch.mock.calls.length).toBeGreaterThan(abrufe);
      expect(dateien.get('gesetzesxml/DSGVO')).toContain('stichtag="2016-05-04"');
    }
  },
);
it('ergänzt nach fehlgeschlagenem Neuabruf in a) und b) dieselben Erwägungsgründe', async () => {
  originalStatus = 200;
  await lauf(1);
  originalStatus = 500;
  expect((await lauf(1, ['DSGVO'])).teilerfolge).toHaveLength(0);
  const xml = dateien.get('gesetzesxml/DSGVO');
  const abrufe = io.fetch.mock.calls.length;
  expect((await offline(true)).teilerfolge).toHaveLength(0);
  expect(dateien.get('gesetzesxml/DSGVO')).toEqual(xml);
  expect(xml).toContain('erwaegungsgruendeErgaenzt="true"');
  expect(io.fetch).toHaveBeenCalledTimes(abrufe);
});

it.each([
  { datum: undefined },
  { fassung: 'original' },
  { celex: '02000R0001-20160504' },
  { datum: '2016-02-30', celex: '02016R0679-20160230' },
])(
  'setzt offline nach ungültiger Herkunft %j fort, löscht altes XML und erhält Quellen',
  async (abweichung) => {
    await lauf(2);
    const text = String(dateien.get('herkunft/DSGVO'));
    const kaputt = JSON.stringify({ ...JSON.parse(text), ...abweichung });
    dateien.set('herkunft/DSGVO', kaputt);
    const archiv = dateien.get('konsolidiert/DSGVO');
    const abrufe = io.fetch.mock.calls.length;
    const bericht = await offline(true);
    expect(bericht.fehlgeschlagen).toHaveLength(1);
    expect(bericht.teilerfolge).toHaveLength(1);
    expect(dateien.has('gesetzesxml/DSGVO')).toBe(false);
    expect(dateien.get('herkunft/DSGVO')).toBe(kaputt);
    expect(dateien.get('konsolidiert/DSGVO')).toEqual(archiv);
    expect(io.fetch).toHaveBeenCalledTimes(abrufe);
  },
);
it('liest und ersetzt EU-Archive und Herkunft unter ihrer tatsächlichen Schreibweise', async () => {
  originalStatus = 200;
  await lauf(1);
  const xml = dateien.get('gesetzesxml/DSGVO');
  for (const [key, wert] of [...dateien]) {
    dateien.delete(key);
    dateien.set(key.replace('DSGVO', key.startsWith('original/') ? 'Dsgvo' : 'dsgvo'), wert);
  }
  const abrufe = io.fetch.mock.calls.length;
  expect((await offline(true)).gespeichert).toBe(1);
  expect(io.fetch).toHaveBeenCalledTimes(abrufe);
  expect(dateien.get('gesetzesxml/dsgvo')).toEqual(xml);
  expect(dateien.size).toBe(4);
  originalStatus = 500;
  expect((await lauf(1, ['DSGVO'])).gespeichert).toBe(1);
  expect(dateien.get('gesetzesxml/dsgvo')).toEqual(xml);
  expect(dateien.has('original/Dsgvo')).toBe(true);
  expect(dateien.size).toBe(4);
});
