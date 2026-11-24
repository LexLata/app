// gesetzReferenzen.test.ts
// Quellenmatrix, Priorität und Fortsetzen mit verfügbaren Referenzen.
import { europaRessourceFixture } from '@/test/import/europaImportFixtures';
import { taggeVerweise } from '@/lib/import/basis/basis.index';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { lesen, sammlung } = vi.hoisted(() => ({ lesen: vi.fn(), sammlung: vi.fn() }));
vi.mock('@/lib/persistenz/gesetz/gesetz.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/persistenz/gesetz/gesetz.index')>()),
  leseAbgeglichenesSuchverzeichnis: async () => ({ abgeglichen: true, eintraege: [] }),
  ladeAlleGesetze: sammlung,
}));
vi.mock('@/lib/import/importindex/importindex.index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/import/importindex/importindex.index')>()),
  leseReferenzVerzeichnis: lesen,
}));
import { leseEuropaVerzeichnis } from '@/lib/import/importindex/importindex.index';
vi.mock('@tauri-apps/plugin-fs', () => ({
  readDir: async () => [{ name: 'EMRK_europarat.xml', isFile: true }],
  readTextFile: (pfad: string) => Promise.resolve(europaRessourceFixture(pfad)),
}));
vi.mock('@tauri-apps/api/path', () => ({ resolveResource: async (pfad: string) => pfad }));
import { ermittleGesetzRefs } from './gesetzReferenzen';

beforeEach(() =>
  lesen.mockReset().mockImplementation(async (quelle: string) => ({
    eintraege: [{ kurztitel: ' X ', langtitel: quelle }],
    fehler: [],
  })),
);

describe('ermittleGesetzRefs', () => {
  it.each([
    ['de-bund', ['de-bund', 'eu']],
    ['de-bw', ['de-bw', 'de-bund', 'eu']],
    ['eu', ['eu']],
  ] as const)(
    'liest für %s ausschließlich erlaubte Quellen in Priorität',
    async (normgeber, quellen) => {
      const ergebnis = await ermittleGesetzRefs(normgeber);
      expect(sammlung).not.toHaveBeenCalled();
      expect(lesen.mock.calls.map(([quelle]) => quelle)).toEqual(quellen);
      expect(ergebnis.referenzen).toEqual([
        {
          kurztitel: ' X ',
          langtitel: quellen[0],
          normgeber,
        },
      ]);
    },
  );
  it('erhält gute Einträge trotz Teilfehler und bündelt Diagnosen', async () => {
    lesen.mockImplementation(async (quelle: string) => ({
      eintraege: quelle === 'de-bund' ? [] : [{ kurztitel: 'eu', langtitel: 'Europa' }],
      fehler: [{ quelle, meldung: 'Nicht lesbar' }],
    }));
    const ergebnis = await ermittleGesetzRefs('de-bund');
    expect(ergebnis.referenzen).toEqual([
      { kurztitel: 'eu', langtitel: 'Europa', normgeber: 'eu' },
    ]);
    expect(ergebnis.fehler).toHaveLength(2);
  });
});

// Aus dem Importabschluss übernommen: Sammlung, Kollisionen und beide Indizes.
it('verwendet installierte Gesetze auch bei indexseitig fehlenden Zielen niemals', async () => {
  sammlung.mockResolvedValue([{ kurztitel: 'BGB', langtitel: 'Installierte Fassung' }]);
  lesen.mockResolvedValue({ eintraege: [], fehler: [] });
  expect((await ermittleGesetzRefs('de-bw')).referenzen).toEqual([]);
  expect(sammlung).not.toHaveBeenCalled();
});
it('dedupliziert Kurztitel nach Normalisierung; eigener Normgeber gewinnt', async () => {
  lesen.mockImplementation(async (quelle: string) => ({
    eintraege: [{ kurztitel: quelle === 'de-bw' ? 'BGB' : ' bgb ', langtitel: quelle }],
    fehler: [],
  }));
  expect((await ermittleGesetzRefs('de-bw')).referenzen).toEqual([
    { kurztitel: 'BGB', langtitel: 'de-bw', normgeber: 'de-bw' },
  ]);
});
it('führt beide Indizes und Europa bei BW zusammen', async () => {
  lesen.mockImplementation(async (quelle: string) => ({
    eintraege: [{ kurztitel: quelle, langtitel: quelle }],
    fehler: [],
  }));
  expect((await ermittleGesetzRefs('de-bw')).referenzen.map((r) => r.kurztitel)).toEqual([
    'de-bw',
    'de-bund',
    'eu',
  ]);
});

it('erhält den EU-Langtitel und die vollständige Zielreferenz für die Verweis-Erkennung', async () => {
  lesen.mockResolvedValue({
    eintraege: [
      {
        kurztitel: 'AEUV',
        langtitel: 'Vertrag über die Arbeitsweise der Europäischen Union',
        abrufkennung: 'AEUV_eu.xml',
      },
    ],
    fehler: [],
  });
  expect(await ermittleGesetzRefs('eu')).toEqual({
    referenzen: [
      {
        kurztitel: 'AEUV',
        langtitel: 'Vertrag über die Arbeitsweise der Europäischen Union',
        normgeber: 'eu',
      },
    ],
    fehler: [],
  });
});

it('übernimmt den EU-Langtitel über den Produktionsleser in die Referenzgrundlage und taggt das vollständige Ziel', async () => {
  lesen.mockImplementation(async () => ({ eintraege: await leseEuropaVerzeichnis(), fehler: [] }));
  const { referenzen, fehler } = await ermittleGesetzRefs('eu');
  expect(fehler).toEqual([]);
  expect(referenzen).toContainEqual({
    kurztitel: 'AEUV',
    normgeber: 'eu',
    langtitel: 'Vertrag über die Arbeitsweise der Europäischen Union',
  });
  expect(
    taggeVerweise(
      '<text>Siehe Artikel 5 des Vertrags über die Arbeitsweise der Europäischen Union.</text>',
      { kurztitel: 'EUV', normgeber: 'eu' },
      referenzen,
    ),
  ).toBe(
    '<text>Siehe <verweis gesetz="AEUV" normgeber="eu" norm="Art. 5">Artikel 5</verweis> des Vertrags über die Arbeitsweise der Europäischen Union.</text>',
  );
});

it.each(['de-sn', 'unbekannt'])(
  'liest für den weiteren oder fehlenden Normgeber %s keine Ersatzverzeichnisse',
  async (normgeber) => {
    expect(await ermittleGesetzRefs(normgeber)).toEqual({ referenzen: [], fehler: [] });
    expect(lesen).not.toHaveBeenCalled();
  },
);

it.each(['de-bund', 'de-bw', 'eu'])(
  'erkennt den unterstützten Normgeber %s über seine Importindexkategorie',
  async (normgeber) => {
    await ermittleGesetzRefs(normgeber);
    expect(lesen.mock.calls[0]?.[0]).toBe(
      { 'de-bund': 'de-bund', 'de-bw': 'de-bw', eu: 'eu' }[normgeber],
    );
  },
);

it('liest Europarat über Europa und taggt EMRK mit tatsächlichem Normgeber', async () => {
  const eintraege = await leseEuropaVerzeichnis();
  lesen.mockResolvedValue({ eintraege, fehler: [] });
  const ergebnis = await ermittleGesetzRefs('europarat');
  expect(lesen).toHaveBeenCalledWith('eu');
  expect(ergebnis.referenzen.find((r) => r.kurztitel === 'EMRK')?.normgeber).toBe('europarat');
  expect(ergebnis.referenzen.find((r) => r.kurztitel === 'AEUV')?.normgeber).toBe('eu');
  expect(
    taggeVerweise(
      '<text>Artikel 6 EMRK</text>',
      { kurztitel: 'EUV', normgeber: 'eu' },
      ergebnis.referenzen,
    ),
  ).toContain('normgeber="europarat"');
});

// Bestehende Szenarioattrappe des früheren Sammelwegs nur im Testzugang.
vi.mock('@/test/tabs/gesetzSpeicherTestzugang', async (original) => ({
  ...(await original<typeof import('@/test/tabs/gesetzSpeicherTestzugang')>()),
  ladeAlleGesetze: sammlung,
}));
