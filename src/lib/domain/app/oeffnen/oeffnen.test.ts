import {
  alsSuchverzeichniseintraege,
  suchtrefferKopfangaben,
  alsSuchverzeichniseintrag,
} from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// oeffnen.test.ts
// EU-Langtitelsuche mit synthetischen Ressourcen.
import { gliederungsartikel, normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { europaRessourceFixture } from '@/test/import/europaImportFixtures';
import { expect, it, vi } from 'vitest';
import {
  berechneTreffer,
  indexNormAnzeige,
  loeseNormzielAuf,
  brauchtImportindexPruefung,
  parseSuchanfrage,
} from './oeffnen.index';
import { type SucheTrefferNorm } from './oeffnenNormtreffer';
import { vergleicheSuchNormgeber } from './oeffnenTitel';
import { sucheKandidatenAlleQuellen } from '@/lib/import/import.index';
vi.mock('@tauri-apps/plugin-fs', () => ({
  readDir: async () => [{ name: 'EMRK_europarat.xml', isFile: true }],
  readTextFile: (pfad: string) => Promise.resolve(europaRessourceFixture(pfad)),
}));
vi.mock('@/lib/persistenz/kern/kern.index', () => ({
  appDatenLesen: async (pfad: string) => {
    if (pfad !== 'importindizes/eu.xml') throw new Error('Nicht Teil dieses Tests');
    return europaRessourceFixture(pfad);
  },
}));
vi.mock('@tauri-apps/api/path', () => ({ resolveResource: async (pfad: string) => pfad }));
it('findet im kuratierten EU-Angebot aus Fixtures einen ausschließlich im Langtitel enthaltenen Suchbegriff', async () => {
  const importindexEintraege = await sucheKandidatenAlleQuellen();
  // Hier wird der Langtitelabgleich der kuratierten Fixture-Angebote geprüft.
  importindexEintraege.eu = importindexEintraege.eu.filter((e) => !e.typ);
  const { eu } = importindexEintraege;
  expect(eu.every((eintrag) => !eintrag.kurztitel.toLowerCase().includes('arbeitsweise'))).toBe(
    true,
  );
  expect(
    berechneTreffer('arbeitsweise', alsSuchverzeichniseintraege([]), null, importindexEintraege),
  ).toEqual([
    {
      art: 'index',
      quelle: 'eu',
      eintrag: {
        kurztitel: 'AEUV',
        langtitel: 'Vertrag über die Arbeitsweise der Europäischen Union',
        abrufkennung: '12016E/TXT',
        normgeber: 'eu',
        praefixstruktur: 'artikel',
      },
    },
  ]);
});

import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { xmlIdZuSprungZiel } from '@/lib/domain/norm/norm.index';
const gesetz = (
  kurztitel: string,
  normgeber = 'de-bund',
  bezeichnungen: string[] = [],
): GesetzDarstellung => ({
  kurztitel,
  langtitel: kurztitel,
  normgeber,
  hatGliederungsartikel: false,
  elemente: bezeichnungen.map((bezeichnung) => ({
    typ: 'norm',
    data: normaleNorm({
      id: bezeichnung,
      xmlId: bezeichnung,
      bezeichnung,
      absaetze: [],
    }),
  })),
});
const norm = (
  bezeichnung: string,
  xmlId = bezeichnung,
  artikelNummer: string | null = null,
): SucheTrefferNorm => ({
  xmlId,
  bezeichnung,
  artikelNummer,
});
const angebot = (kurztitel: string, langtitel = kurztitel) => ({
  kurztitel,
  langtitel,
  abrufkennung: `${kurztitel}.xml`,
});
it('findet ein bereits installiertes kuratiertes EU-Gesetz über den abgeleiteten Kurztitel', () => {
  const dsgvo = gesetz('DSGVO', 'eu', ['Art. 6']);
  const eintraege = {
    'de-bund': [],
    'de-bw': [],
    eu: [
      {
        kurztitel: 'DSGVO',
        langtitel: 'Datenschutz',
        abrufkennung: '32016R0679',
        abgeleiteterKurztitel: 'VO 2016/679',
        normgeber: 'eu',
      },
    ],
  };
  for (const eingabe of ['vo 2016/679', '6 vo 2016/679'])
    expect(berechneTreffer(eingabe, alsSuchverzeichniseintraege([dsgvo]), null, eintraege)).toEqual(
      [
        {
          art: 'installiert',
          ...suchtrefferKopfangaben(dsgvo),
          ...(eingabe.startsWith('6 ') ? { norm: norm('Art. 6') } : {}),
        },
      ],
    );
});
function gesetzMitVorangestelltemParagraphen() {
  const g = gesetz('EGBGB', 'de-bund', ['Art. 1', '§ 3', 'Art. 3', '§ 1']);
  g.hatGliederungsartikel = true;
  const xmlIds = ['1', '1-3', '3', '3-1'];
  g.elemente.forEach((el, i) => {
    if (el.typ !== 'norm') return;
    el.data.xmlId = xmlIds[i]!;
    if (el.data.bezeichnung.startsWith('Art.'))
      el.data = gliederungsartikel({ ...el.data, art: 'gliederungsartikel', gliederungsEbene: 1 });
  });

  return g;
}
it.each(['3 EGBGB', '3 9 EGBGB'])(
  'R-8: gemeinsame Suche bevorzugt bei %s den Artikel',
  (eingabe) => {
    expect(
      loeseNormzielAuf(
        parseSuchanfrage(eingabe),
        alsSuchverzeichniseintrag(gesetzMitVorangestelltemParagraphen()),
      )?.xmlId,
    ).toBe('3');
  },
);
const index = (
  bund = [angebot('StGB')],
  eu = [] as ReturnType<typeof angebot>[],
  bw = [] as ReturnType<typeof angebot>[],
) => ({ 'de-bund': bund, eu, 'de-bw': bw });
it.each([
  ['StGB', 'EGStGB', 'StGB'],
  [' euv ', 'AEUV', 'EUV'],
  ['433 StGB', 'EGStGB', 'StGB'],
])('stellt exakten Import bei %s vor installierten Teiltreffer', (eingabe, installiert, kurz) => {
  const g = gesetz(installiert, 'de-bund', ['§ 433']);
  const eintrag = angebot(kurz);
  expect(
    berechneTreffer(eingabe, alsSuchverzeichniseintraege([g]), null, index([eintrag])),
  ).toEqual([
    { art: 'index', quelle: 'de-bund', eintrag },
    {
      art: 'installiert',
      ...suchtrefferKopfangaben(g),
      ...(eingabe.includes('433') ? { norm: norm('§ 433') } : {}),
    },
  ]);
});
it('stellt installierte Teiltreffer vor übrige Importangebote', () => {
  const zz = gesetz('ZZStGB');
  const eg = gesetz('EGStGB');
  const gesetze = [zz, eg];
  expect(
    berechneTreffer(
      'StGB',
      alsSuchverzeichniseintraege(gesetze),
      null,
      index([angebot('XStGB'), angebot('ABC', 'StGB')]),
    ),
  ).toEqual([
    { art: 'installiert', ...suchtrefferKopfangaben(eg) },
    { art: 'installiert', ...suchtrefferKopfangaben(zz) },
    { art: 'index', quelle: 'de-bund', eintrag: angebot('XStGB') },
    { art: 'index', quelle: 'de-bund', eintrag: angebot('ABC', 'StGB') },
  ]);
});
it.each(['X', ' x ', ' X '])(
  'erhält exakt installierten Vorrang bei %s unabhängig vom Sitzungsindex',
  (eingabe) => {
    const g = gesetz('X', 'de-bund', ['§ 1']);
    const eintraege = index([], [], [angebot('X')]);
    expect(brauchtImportindexPruefung(eingabe)).toBe(true);
    expect(berechneTreffer(eingabe, alsSuchverzeichniseintraege([g]), null, eintraege)).toEqual([
      { art: 'installiert', ...suchtrefferKopfangaben(g) },
      { art: 'index', quelle: 'de-bw', eintrag: eintraege['de-bw'][0] },
    ]);
    expect(
      berechneTreffer(`433 ${eingabe}`, alsSuchverzeichniseintraege([g]), null, eintraege),
    ).toEqual([{ art: 'index', quelle: 'de-bw', eintrag: eintraege['de-bw'][0] }]);
  },
);
it.each(['de-bund', 'unbekannt'])(
  'prüft vollständige Referenz im Langtitel-Fallback bei Normgeber %s',
  (normgeber) => {
    const g = gesetz('X');
    g.normgeber = normgeber;
    g.langtitel = 'Alter Titel';
    const eintrag = angebot('X', 'Aktualisierter Titel');
    const treffer = berechneTreffer(
      'aktualisierter',
      alsSuchverzeichniseintraege([g]),
      null,
      index([eintrag], [], [eintrag]),
    );
    expect(treffer).toEqual(
      normgeber === 'de-bund'
        ? [{ art: 'index', quelle: 'de-bw', eintrag }]
        : [
            { art: 'index', quelle: 'de-bund', eintrag },
            { art: 'index', quelle: 'de-bw', eintrag },
          ],
    );
  },
);
it('ordnet namensgleiche Angebote konsistent Bund, EU, BW', () => {
  const eintrag = angebot('StGB');
  expect(
    berechneTreffer(
      'StGB',
      alsSuchverzeichniseintraege([]),
      null,
      index([eintrag], [eintrag], [eintrag]),
    ).map((t) => t.art === 'index' && t.quelle),
  ).toEqual(['de-bund', 'eu', 'de-bw']);
});
it('vergleicht weitere Normgeber alphabetisch, unabhängig von Kandidatenreihenfolge', () => {
  const erwartet = ['de-bund', 'eu', 'de-bw', 'AA', 'bayern', 'ZZ'];
  expect([...erwartet].reverse().sort((a, b) => vergleicheSuchNormgeber(a, b))).toEqual(erwartet);
  for (const a of erwartet)
    for (const b of erwartet) {
      expect(
        Math.sign(vergleicheSuchNormgeber(a, b)) + Math.sign(vergleicheSuchNormgeber(b, a)),
      ).toBe(0);
    }
});
it.each([
  ['', false],
  ['433', false],
  ['e1', false],
  ['433a', false],
  ['229 3', false],
  ['2004/38/EG', true],
  ['6 2004/38/EG', true],
  ['StGB', true],
  ['433 StGB', true],
  ['EGStGB', true],
])('bestimmt Indexbedarf für %s ohne Normfilter', (eingabe, erwartet) => {
  expect(brauchtImportindexPruefung(eingabe)).toBe(erwartet);
});

it.each(['EUV', ' euv ', '1 EUV', 'Art. 1 EUV', '§ 1 EUV'])(
  'ordnet beide EUV-Treffer bei %s in jedem Importzustand unabhängig von der Bestandsreihenfolge',
  (eingabe) => {
    const bund = gesetz('EUV', 'de-bund', ['§ 1']);
    const eu = gesetz('EUV', 'eu', ['Art. 1']);
    const bundAngebot = angebot('EUV', 'Bundesverordnung');
    const euAngebot = angebot('EUV', 'Vertrag über die Europäische Union');
    const eintraege = index([bundAngebot], [euAngebot]);
    const bundImportindex = { art: 'index', quelle: 'de-bund', eintrag: bundAngebot };
    const euIndex = { art: 'index', quelle: 'eu', eintrag: euAngebot };
    const bundInstalliert = {
      art: 'installiert',
      ...suchtrefferKopfangaben(bund),
      ...(eingabe.includes('1') ? { norm: norm('§ 1') } : {}),
    };
    const euInstalliert = {
      art: 'installiert',
      ...suchtrefferKopfangaben(eu),
      ...(eingabe.includes('1') ? { norm: norm('Art. 1') } : {}),
    };
    expect(berechneTreffer(eingabe, alsSuchverzeichniseintraege([]), null, eintraege)).toEqual([
      euIndex,
      bundImportindex,
    ]);
    expect(berechneTreffer(eingabe, alsSuchverzeichniseintraege([bund]), null, eintraege)).toEqual([
      bundInstalliert,
      euIndex,
    ]);
    expect(berechneTreffer(eingabe, alsSuchverzeichniseintraege([eu]), null, eintraege)).toEqual([
      euInstalliert,
      bundImportindex,
    ]);
    for (const bestand of [
      [bund, eu],
      [eu, bund],
    ]) {
      expect(
        berechneTreffer(eingabe, alsSuchverzeichniseintraege(bestand), null, eintraege),
      ).toEqual([euInstalliert, bundInstalliert]);
      expect(berechneTreffer(eingabe, alsSuchverzeichniseintraege(bestand), null, null)).toEqual([
        euInstalliert,
        bundInstalliert,
      ]);
    }
  },
);

it('verwendet die Standardrangfolge auch für importierte namensgleiche Gesetze', () => {
  const bund = gesetz('X', 'de-bund');
  const eu = gesetz('X', 'eu');
  const bw = gesetz('X', 'de-bw');
  expect(berechneTreffer('X', alsSuchverzeichniseintraege([bw, eu, bund]), null, index())).toEqual(
    [bund, eu, bw].map((g) => ({ art: 'installiert', ...suchtrefferKopfangaben(g) })),
  );
});
it('erhält Titelrelevanz, EG-Varianten und Index-Fallback', () => {
  const eintraege = index([angebot('Z', 'abc'), angebot('abcZ'), angebot('Xabc')]);
  expect(
    berechneTreffer('abc', alsSuchverzeichniseintraege([]), null, eintraege).map(
      (t) => t.art === 'index' && t.eintrag.kurztitel,
    ),
  ).toEqual(['abcZ', 'Xabc', 'Z']);
  const g = gesetz('StGBEG');
  expect(berechneTreffer('EGStGB', alsSuchverzeichniseintraege([g]), null, null)).toEqual([
    { art: 'installiert', ...suchtrefferKopfangaben(g) },
  ]);
});
it('erhält leere Eingabe und reine Normsuche mit aktivem Gesetz und Fallback', () => {
  const a = gesetz('A', 'de-bund', ['§ 1']);
  const b = gesetz('B', 'de-bund', ['§ 433']);
  expect(berechneTreffer('', alsSuchverzeichniseintraege([b, a]), a, index())).toEqual([
    { art: 'installiert', ...suchtrefferKopfangaben(b) },
    { art: 'installiert', ...suchtrefferKopfangaben(a) },
  ]);
  expect(berechneTreffer('1', alsSuchverzeichniseintraege([b, a]), a, index())).toEqual([
    { art: 'installiert', ...suchtrefferKopfangaben(a), norm: norm('§ 1') },
  ]);
  expect(berechneTreffer('433', alsSuchverzeichniseintraege([b, a]), a, index())).toEqual([
    { art: 'installiert', ...suchtrefferKopfangaben(b), norm: norm('§ 433') },
  ]);
});

it('unterscheidet Erwägungsgründe von reiner Normsuche', () => {
  const eu = gesetz('DSGVO', 'eu', ['E1']);
  const el = eu.elemente[0]!;
  if (el.typ === 'norm') el.data.art = 'erwaegungsgrund';
  expect(berechneTreffer('e1', alsSuchverzeichniseintraege([eu]), eu, null)).toEqual([
    { art: 'installiert', ...suchtrefferKopfangaben(eu), norm: norm('E1') },
  ]);
  expect(berechneTreffer('1', alsSuchverzeichniseintraege([eu]), eu, null)).toEqual([]);
});
it.each(['Art. 1', 'Art 1', 'Artikel 1', 'ART. 1', 'artikel\t1', ' Art.  1 '])(
  'erhält bei %s die Artikel-Familie, auch mit Gesetzesangabe',
  (eingabe) => {
    expect(parseSuchanfrage(eingabe)).toEqual({
      ...parseSuchanfrage('1'),
      normPraefix: 'artikel',
      suchtext: eingabe.trim(),
    });
    expect(parseSuchanfrage(`${eingabe.trim()} GG`)).toEqual({
      ...parseSuchanfrage('1 GG'),
      normPraefix: 'artikel',
      suchtext: `${eingabe.trim()} GG`,
    });
    const g = gesetz('GG', 'de-bund', ['Art. 1']);
    expect(berechneTreffer(eingabe, alsSuchverzeichniseintraege([g]), g, null)).toEqual([
      { art: 'installiert', ...suchtrefferKopfangaben(g), norm: norm('Art. 1') },
    ]);
    expect(
      berechneTreffer(`${eingabe.trim()} GG`, alsSuchverzeichniseintraege([g]), null, null),
    ).toEqual([{ art: 'installiert', ...suchtrefferKopfangaben(g), norm: norm('Art. 1') }]);
  },
);
it.each(['Art.', 'Art', 'Artikel', 'Art115V', 'Artikelgesetz', 'Art. GG'])(
  'erhält %s als Gesetzesangabe ohne nachfolgende Zahl',
  (eingabe) => {
    expect(parseSuchanfrage(eingabe)).toEqual({
      suchtext: eingabe.trim(),
      artikelNummer: null,
      normNummer: null,
      erwaegungsgrundNummer: null,
      gesetzQuery: eingabe,
    });
    const g = gesetz(eingabe);
    expect(berechneTreffer(eingabe, alsSuchverzeichniseintraege([g]), null, null)).toEqual([
      { art: 'installiert', ...suchtrefferKopfangaben(g) },
    ]);
  },
);
it('erhält Zwei-Zahlen-Auflösung von Gliederungsartikeln und §-Präfix', () => {
  const g = gesetz('EGBGB', 'de-bund', ['§ 3']);
  g.hatGliederungsartikel = true;
  const el = g.elemente[0]!;
  if (el.typ === 'norm') el.data.xmlId = '229-3';
  expect(berechneTreffer('229 3 EGBGB', alsSuchverzeichniseintraege([g]), null, null)).toEqual([
    { art: 'installiert', ...suchtrefferKopfangaben(g), norm: norm('§ 3', '229-3', '229') },
  ]);
  expect(berechneTreffer('230 3 EGBGB', alsSuchverzeichniseintraege([g]), null, null)).toEqual([]);
  expect(parseSuchanfrage('§ 229 3 EGBGB')).toEqual({
    suchtext: '§ 229 3 EGBGB',
    normPraefix: 'paragraph',
    artikelNummer: null,
    normNummer: '229',
    erwaegungsgrundNummer: null,
    gesetzQuery: '3 EGBGB',
  });
});
it('bietet exakt installiertes Gesetz ohne Norm nicht erneut an', () => {
  expect(
    berechneTreffer(
      '433 StGB',
      alsSuchverzeichniseintraege([gesetz('STGB', 'de-bund')]),
      null,
      index(),
    ),
  ).toEqual([]);
});
it('begrenzt die gesamte Trefferliste auf 30', () => {
  expect(
    berechneTreffer(
      'X',
      alsSuchverzeichniseintraege([]),
      null,
      index(Array.from({ length: 50 }, (_, i) => angebot(`X${i}`))),
    ),
  ).toHaveLength(30);
});

it('trimmt exakte Importkurztitel und priorisiert sie vor der Trefferbegrenzung', () => {
  const exakt = angebot(' StGB ');
  const treffer = berechneTreffer(
    'StGB',
    alsSuchverzeichniseintraege([]),
    null,
    index([...Array.from({ length: 45 }, (_, i) => angebot(`StGB${i}`)), exakt]),
  );
  expect(treffer[0]).toEqual({ art: 'index', quelle: 'de-bund', eintrag: exakt });
  expect(treffer).toHaveLength(30);
});

it.each([
  ['paragraph', '1 GG', '§ 1', null],
  ['artikel', '1 GG', 'Art. 1', null],
  ['gliederungsartikel', '1 GG', 'Art. 1', null],
  ['unklar', '1 GG', '§ 1', null],
  ['roemisch', '1 GG', '§ 1', null],
  ['roemisch', '10 5 GG', '§ 10', null],
  [undefined, '1 GG', '§ 1', null],
  ['paragraph', '10 5 StGB', '§ 10', null],
  ['artikel', '10 5 GG', 'Art. 10', null],
  ['gliederungsartikel', '229 3 EGBGB', '§ 3', '229'],
  ['unklar', '10 5 GG', '§ 10', null],
  [undefined, '10 5 DSGVO', '§ 10', null],
  ['artikel', '§ 5 GG', 'Art. 5', null],
  ['paragraph', 'Art. 5 StGB', '§ 5', null],
  ['artikel', 'e1 DSGVO', undefined, null],
  ['artikel', 'GG', undefined, null],
] as const)('zeigt %s bei %s', (struktur, eingabe, normLabel, artikelNummer) => {
  expect(indexNormAnzeige(parseSuchanfrage(eingabe), struktur)).toEqual({
    normLabel,
    artikelNummer,
  });
});
it('fällt mit Gesetzesangabe auf die erste Zahl zurück, ohne Gesetzesangabe bleibt es streng', () => {
  const g = gesetz('StGB', 'de-bund', ['§ 10', '§ 229']);
  expect(
    loeseNormzielAuf(parseSuchanfrage('10 5 StGB'), alsSuchverzeichniseintrag(g)),
  ).toMatchObject({
    xmlId: '§ 10',
    bezeichnung: '§ 10',
    artikelNummer: null,
  });
  expect(berechneTreffer('10 5 StGB', alsSuchverzeichniseintraege([g]), g, null)).toEqual([
    { art: 'installiert', ...suchtrefferKopfangaben(g), norm: norm('§ 10') },
  ]);
  expect(loeseNormzielAuf(parseSuchanfrage('229 3'), alsSuchverzeichniseintrag(g))).toBeNull();
});

it('entscheidet gemischte installierte Treffer je Gesetz und erhält unscharfe Kombinationen', () => {
  const paragraphen = gesetz('B-Test', 'de-bund', ['§ 10']);
  const artikel = gesetz('B-Artikel', 'de-bund', ['Art. 10', '§ 50']);
  artikel.hatGliederungsartikel = true;
  artikel.elemente[0]!.data.xmlId = '10';
  artikel.elemente[1]!.data.xmlId = '10-50';
  expect(
    loeseNormzielAuf(parseSuchanfrage('10 5 B'), alsSuchverzeichniseintrag(artikel)),
  ).toMatchObject({
    xmlId: '10-50',
    artikelNummer: '10',
  });
  expect(
    loeseNormzielAuf(parseSuchanfrage('10 6 B'), alsSuchverzeichniseintrag(artikel)),
  ).toMatchObject({
    xmlId: '10',
    artikelNummer: null,
  });
  expect(
    berechneTreffer('10 5 B', alsSuchverzeichniseintraege([paragraphen, artikel]), null, null),
  ).toHaveLength(2);
  const stgb = gesetz('StGB', 'de-bund', ['§ 229']);
  const aktualisierterArtikel = gesetz('B-Artikel', 'de-bund', ['Art. 10', '§ 50']);
  aktualisierterArtikel.hatGliederungsartikel = true;
  aktualisierterArtikel.elemente[0]!.data.xmlId = '229';
  aktualisierterArtikel.elemente[1]!.data.xmlId = '229-3';
  expect(
    berechneTreffer(
      '229 3',
      alsSuchverzeichniseintraege([stgb, aktualisierterArtikel]),
      stgb,
      null,
    ),
  ).toEqual([
    {
      art: 'installiert',
      ...suchtrefferKopfangaben(aktualisierterArtikel),
      norm: norm('§ 50', '229-3', '229'),
    },
  ]);
});

it.each(['', 'Einziger Paragraph', 'Anlage 1', 'Muster 1', 'Formblatt 1', 'Tabelle 1'])(
  'bietet bei numerischer Eingabe das Gesetz mit %s vor und nach Import ohne Normvorschau an',
  (name) => {
    const g = gesetz('BahnVorschrAnwG', 'de-bund', [name]);
    const erstes = g.elemente[0]!;
    if (!name && erstes.typ === 'norm')
      erstes.data.absaetze = [{ id: 'a', saetze: [{ id: 's', text: 'Text', eintraege: [] }] }];
    const anfrage = parseSuchanfrage('1 BahnVorschrAnwG');
    const angebot = {
      kurztitel: 'BahnVorschrAnwG',
      langtitel: '',
      abrufkennung: '',
      praefixstruktur: 'ohne-praefix' as const,
    };
    expect(
      berechneTreffer('1 BahnVorschrAnwG', alsSuchverzeichniseintraege([]), null, index([angebot])),
    ).toEqual([{ art: 'index', quelle: 'de-bund', eintrag: angebot }]);
    expect(indexNormAnzeige(anfrage, 'ohne-praefix')).toEqual({
      normLabel: undefined,
      artikelNummer: null,
    });
    expect(
      berechneTreffer('1 BahnVorschrAnwG', alsSuchverzeichniseintraege([g]), null, null),
    ).toEqual([{ art: 'installiert', ...suchtrefferKopfangaben(g) }]);
    expect(loeseNormzielAuf(anfrage, alsSuchverzeichniseintrag(g))).toBeNull();
  },
);
it.each([
  ['KVR', 'Regel 1', 'Regel1', 'regel'],
  ['PreisLS', 'Nr 1', 'Nr1', 'nummer'],
  ['PreisLS', 'Nr. 1', 'Nr.1', 'nummer'],
] as const)('zeigt und erreicht die bestehende XML-ID in %s', (titel, name, xmlId, struktur) => {
  const g = gesetz(titel, 'de-bund', [name]);
  g.elemente[0]!.data.xmlId = xmlId;
  const anfrage = parseSuchanfrage(`1 ${titel}`);
  expect(indexNormAnzeige(anfrage, struktur)).toEqual({
    normLabel: struktur === 'nummer' ? 'Nr. 1' : name,
    artikelNummer: null,
  });
  const ziel = loeseNormzielAuf(anfrage, alsSuchverzeichniseintrag(g));
  expect(ziel).toEqual({ xmlId, bezeichnung: name, artikelNummer: null });
  expect(xmlIdZuSprungZiel(g.elemente, ziel!.xmlId)).toEqual({ index: 0, vorfahrenIds: [] });
});

it.each(['2. PKHB 2012', ' 2. pkhb 2012 ', '1 GG'])(
  'stellt den vollständigen exakten Kurztitel %s vor die geparste Gesetzesangabe',
  (eingabe) => {
    const kurz = eingabe.trim();
    const rest = parseSuchanfrage(eingabe).gesetzQuery;
    const exakt = gesetz(kurz, 'de-bw');
    const teilweise = gesetz(rest, 'de-bund', ['§ 1', '§ 2.']);
    const exaktAngebot = angebot(kurz);
    const restAngebot = angebot(rest);
    for (const bestand of [[], [teilweise], [exakt], [teilweise, exakt]]) {
      const treffer = berechneTreffer(
        eingabe,
        alsSuchverzeichniseintraege(bestand),
        null,
        index([restAngebot], [], [exaktAngebot]),
      );
      expect(treffer[0]).toEqual(
        bestand.includes(exakt)
          ? { art: 'installiert', ...suchtrefferKopfangaben(exakt) }
          : { art: 'index', quelle: 'de-bw', eintrag: exaktAngebot },
      );
      expect(
        treffer.some(
          (t) => (t.art === 'index' ? t.eintrag : t.gesetzesreferenz).kurztitel === rest,
        ),
      ).toBe(true);
      expect(
        treffer.filter(
          (t) => (t.art === 'index' ? t.eintrag : t.gesetzesreferenz).kurztitel === kurz,
        ),
      ).toHaveLength(1);
    }
    expect(
      berechneTreffer(eingabe, alsSuchverzeichniseintraege([teilweise, exakt]), null, null)[0],
    ).toEqual({
      art: 'installiert',
      ...suchtrefferKopfangaben(exakt),
    });
  },
);
it('erhält die Normsuche ohne vollständigen exakten Kurztitel', () => {
  const gg = gesetz('GG', 'de-bund', ['Art. 1']);
  expect(berechneTreffer('1 GG', alsSuchverzeichniseintraege([gg]), null, index([]))).toEqual([
    { art: 'installiert', ...suchtrefferKopfangaben(gg), norm: norm('Art. 1') },
  ]);
  expect(loeseNormzielAuf(parseSuchanfrage('1 GG'), alsSuchverzeichniseintrag(gg))?.xmlId).toBe(
    'Art. 1',
  );
});

it('öffnet einen vollständigen exakten Kurztitel ohne irrtümliche Normangabe', () => {
  const g = gesetz('2. PKHB 2012', 'de-bund', ['§ 2.']);
  const anfrage = parseSuchanfrage(' 2. pkhb 2012 ');
  expect(loeseNormzielAuf(anfrage, alsSuchverzeichniseintrag(g))).toBeNull();
  expect(indexNormAnzeige(anfrage, 'paragraph', g.kurztitel)).toEqual({
    normLabel: undefined,
    artikelNummer: null,
  });
});

it('zählt vollständige exakte Kurztitel zur gemeinsamen Treffergrenze', () => {
  const eintraege = [
    angebot('2. PKHB 2012'),
    ...Array.from({ length: 50 }, (_, i) => angebot(`PKHB 2012 ${i}`)),
  ];
  const treffer = berechneTreffer(
    '2. PKHB 2012',
    alsSuchverzeichniseintraege([]),
    null,
    index(eintraege),
  );
  expect(treffer).toHaveLength(30);
  expect(treffer[0]).toEqual({ art: 'index', quelle: 'de-bund', eintrag: eintraege[0] });
});

it.each(['2. PKHB 2012', '3. Titel 2020', '7a. Verordnung'])(
  'erkennt %s vor der Normzerlegung',
  (titel) => {
    const g = gesetz(titel, 'de-bund', ['§ 1', '§ 2']);
    const a = angebot(titel);
    const rest = titel.split(' ').slice(1).join(' ');
    for (const bestand of [[], [gesetz(rest, 'de-bund', ['§ 1'])], [g]]) {
      const treffer = berechneTreffer(
        `1 ${titel}`,
        alsSuchverzeichniseintraege(bestand),
        null,
        index([angebot(rest), a]),
      );
      expect(
        (treffer[0]?.art === 'index' ? treffer[0].eintrag : treffer[0]?.gesetzesreferenz)
          ?.kurztitel,
      ).toBe(titel);
    }
    const anfrage = parseSuchanfrage(`1 ${titel}`);
    expect(loeseNormzielAuf(anfrage, alsSuchverzeichniseintrag(g))?.xmlId).toBe('§ 1');
    expect(indexNormAnzeige(anfrage, 'paragraph', titel)).toEqual({
      normLabel: '§ 1',
      artikelNummer: null,
    });
    expect(loeseNormzielAuf(parseSuchanfrage(titel), alsSuchverzeichniseintrag(g))).toBeNull();
  },
);
it('bevorzugt das längste bekannte Titelsuffix und verlangt eine Titelgrenze', () => {
  const g = gesetz('2. PKHB 2012', 'de-bund', ['§ 1']);
  expect(
    berechneTreffer(
      '1 2. PKHB 2012',
      alsSuchverzeichniseintraege([g]),
      null,
      index([angebot('PKHB 2012')]),
    )[0],
  ).toEqual({
    art: 'installiert',
    ...suchtrefferKopfangaben(g),
    norm: norm('§ 1'),
  });
  expect(
    loeseNormzielAuf(parseSuchanfrage('12. PKHB 2012'), alsSuchverzeichniseintrag(g)),
  ).toBeNull();
});
it.each(['1GG', '§433BGB'])('löst die kompakte Normangabe %s auf', (eingabe) => {
  const g =
    eingabe === '1GG' ? gesetz('GG', 'de-bund', ['Art. 1']) : gesetz('BGB', 'de-bund', ['§ 433']);
  expect(berechneTreffer(eingabe, alsSuchverzeichniseintraege([g]), null, index([]))[0]).toEqual({
    art: 'installiert',
    ...suchtrefferKopfangaben(g),
    norm: norm(eingabe === '1GG' ? 'Art. 1' : '§ 433'),
  });
  expect(loeseNormzielAuf(parseSuchanfrage(eingabe), alsSuchverzeichniseintrag(g))?.xmlId).toBe(
    g.elemente[0]?.typ === 'norm' ? g.elemente[0].data.xmlId : '',
  );
  expect(brauchtImportindexPruefung(eingabe)).toBe(true);
});

it('zeigt bei einer Zahl vor einem präfixlosen Zahlbeginn-Titel nur das Gesetz', () => {
  const g = gesetz('2. PKHB 2012', 'de-bund', ['Einziger Paragraph']);
  const anfrage = parseSuchanfrage('1 2. PKHB 2012');
  expect(
    berechneTreffer(
      anfrage.suchtext!,
      alsSuchverzeichniseintraege([g]),
      null,
      index([angebot('PKHB 2012')]),
    )[0],
  ).toEqual({
    art: 'installiert',
    ...suchtrefferKopfangaben(g),
  });
  expect(indexNormAnzeige(anfrage, 'ohne-praefix', g.kurztitel)).toEqual({
    normLabel: undefined,
    artikelNummer: null,
  });
  expect(loeseNormzielAuf(anfrage, alsSuchverzeichniseintrag(g))).toBeNull();
});
it('erhält mehrere Normzahlen vor einem Zahlbeginn-Titel mit Gliederungsartikeln', () => {
  const g = { ...gesetzMitVorangestelltemParagraphen(), kurztitel: '2. EGBGB' };
  const anfrage = parseSuchanfrage('1 3 2. EGBGB');
  expect(loeseNormzielAuf(anfrage, alsSuchverzeichniseintrag(g))?.xmlId).toBe('1-3');
  expect(indexNormAnzeige(anfrage, 'gliederungsartikel', g.kurztitel)).toEqual({
    normLabel: '§ 3',
    artikelNummer: '1',
  });
  expect(
    berechneTreffer(
      anfrage.suchtext!,
      alsSuchverzeichniseintraege([g]),
      null,
      index([angebot('EGBGB')]),
    )[0],
  ).toEqual({
    art: 'installiert',
    ...suchtrefferKopfangaben(g),
    norm: norm('§ 3', '1-3', '1'),
  });
});

it.each(['7a', '§433b'])(
  'erhält die alleinstehende Normnummer %s mit Buchstabenzusatz',
  (eingabe) => {
    const anfrage = parseSuchanfrage(eingabe);
    expect(anfrage.normNummer).toBe(eingabe.replace('§', ''));
    expect(anfrage.gesetzQuery).toBe('');
  },
);

it('erkennt installierte EMRK über Europarat und erhält die Quellengruppe eu', () => {
  const eintrag = {
    kurztitel: 'EMRK',
    langtitel: 'Menschenrechtskonvention',
    abrufkennung: 'EMRK_europarat.xml',
    normgeber: 'europarat',
  };
  const indizes = { 'de-bund': [], 'de-bw': [], eu: [eintrag] };
  expect(berechneTreffer('EMRK', alsSuchverzeichniseintraege([]), null, indizes)).toEqual([
    { art: 'index', eintrag, quelle: 'eu' },
  ]);
  expect(
    berechneTreffer(
      'EMRK',
      alsSuchverzeichniseintraege([gesetz('EMRK', 'europarat')]),
      null,
      indizes,
    ),
  ).toHaveLength(1);
  expect(
    berechneTreffer(
      'EMRK',
      alsSuchverzeichniseintraege([gesetz('EMRK', 'eu')]),
      null,
      indizes,
    ).filter((t) => t.art === 'index'),
  ).toHaveLength(1);
});

it('findet vollständige Alternativbezeichnungen ohne die Eingabe oder Gesetzesidentität umzuschreiben', () => {
  const eintrag = {
    ...angebot('AI Act', 'künstliche Intelligenz'),
    alternativen: ['KI-VO', 'Digital Services Act'],
    abgeleiteterKurztitel: 'VO 2024/1689',
    normgeber: 'eu',
  };
  const indizes = { 'de-bund': [], 'de-bw': [], eu: [eintrag] };
  for (const name of ['KI-VO', 'Digital Services Act']) {
    for (const vorsatz of ['', 'Art. 6 ', '6 ', 'e12 ']) {
      expect(
        berechneTreffer(
          vorsatz + name.toLowerCase(),
          alsSuchverzeichniseintraege([]),
          null,
          indizes,
        ),
      ).toEqual([{ art: 'index', eintrag, quelle: 'eu', gefundenUeber: name }]);
    }
  }
  for (const name of ['AI Act', 'VO 2024/1689', 'künstliche Intelligenz'])
    expect(berechneTreffer(name, alsSuchverzeichniseintraege([]), null, indizes)).toEqual([
      { art: 'index', eintrag, quelle: 'eu' },
    ]);
  for (const name of ['KI-V', 'beliebiger Text KI-VO', 'AEKI-VO'])
    expect(berechneTreffer(name, alsSuchverzeichniseintraege([]), null, indizes)).toEqual([]);
  const installiert = gesetz('AI Act', 'eu', ['Art. 6']);
  for (const text of ['6KI-VO', '§6KI-VO', 'Art. 6 Digital Services Act'])
    expect(
      berechneTreffer(text, alsSuchverzeichniseintraege([installiert]), null, indizes),
    ).toEqual([
      {
        art: 'installiert',
        ...suchtrefferKopfangaben(installiert),
        norm: norm('Art. 6'),
        gefundenUeber: text.endsWith('Act') ? 'Digital Services Act' : 'KI-VO',
      },
    ]);
});

import fc from 'fast-check';
it('ordnet kollidierende Alternativen ohne Verlust nach Installationsstatus und Normgeber', () => {
  for (const name of ['KI-VO', 'euv']) {
    const eu = { ...angebot('AI Act'), alternativen: [name], normgeber: 'eu' };
    const indizes = { 'de-bund': [angebot(name)], eu: [eu], 'de-bw': [angebot(name)] };
    const alle = [gesetz(name, 'de-bund'), gesetz('AI Act', 'eu'), gesetz(name, 'de-bw')];
    for (let maske = 0; maske < 8; maske++) {
      const installiert = alle.filter((_, i) => (maske & (1 << i)) !== 0);
      const ergebnis = berechneTreffer(
        name,
        alsSuchverzeichniseintraege(installiert),
        null,
        indizes,
      );
      const rang = name === 'euv' ? ['eu', 'de-bund', 'de-bw'] : ['de-bund', 'eu', 'de-bw'];
      expect(
        ergebnis.map((t) => [
          t.art,
          t.art === 'installiert'
            ? t.gesetzesreferenz.normgeber
            : (t.eintrag.normgeber ?? (t.quelle === 'de-bund' ? 'de-bund' : 'de-bw')),
        ]),
      ).toEqual(
        ['installiert', 'index'].flatMap((art) =>
          rang
            .filter((n) => installiert.some((g) => g.normgeber === n) === (art === 'installiert'))
            .map((n) => [art, n]),
        ),
      );
      expect(ergebnis).toHaveLength(3);
    }
  }
});
it('grenzt längste Namen und Wortenden ab und zeigt die gepflegte Schreibweise', () => {
  const eintrag = {
    ...angebot('Titel'),
    alternativen: ['DSM', 'DSM-RL', 'EUV', 'Schengener Grenzkodex'],
  };
  const indizes = { 'de-bund': [], 'de-bw': [], eu: [eintrag] };
  for (const name of eintrag.alternativen)
    expect(
      berechneTreffer('17 ' + name.toLowerCase(), alsSuchverzeichniseintraege([]), null, indizes),
    ).toEqual([{ art: 'index', eintrag, quelle: 'eu', gefundenUeber: name }]);
  expect(berechneTreffer('AEUV', alsSuchverzeichniseintraege([]), null, indizes)).toEqual([]);
});
it('findet alle eindeutigen synthetischen Namen mit und ohne Normangabe', () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.stringMatching(/^[A-Z][a-z]{2,12}$/), { minLength: 1, maxLength: 12 }),
      (namen) => {
        const eu = namen.map((name, i) => ({
          ...angebot('Titel-' + name),
          alternativen: ['Alternative-' + name],
          abrufkennung: String(i),
          normgeber: 'eu',
        }));
        const indizes = { 'de-bund': [], 'de-bw': [], eu };
        for (const eintrag of eu)
          for (const name of [eintrag.kurztitel, ...eintrag.alternativen])
            for (const vorsatz of ['', 'Art. 6 ']) {
              expect(
                berechneTreffer(vorsatz + name, alsSuchverzeichniseintraege([]), null, indizes)[0],
              ).toEqual({
                art: 'index',
                eintrag,
                quelle: 'eu',
                ...(name === eintrag.kurztitel ? {} : { gefundenUeber: name }),
              });
            }
      },
    ),
  );
});

it('wählt ein längeres vollständiges Namenssuffix vor einem ebenfalls gültigen kürzeren Namen', () => {
  const kurz = { ...angebot('Kurz'), alternativen: ['Digital Services Act'] };
  const lang = { ...angebot('Lang'), alternativen: ['2. Digital Services Act'] };
  const indizes = { 'de-bund': [], 'de-bw': [], eu: [kurz, lang] };
  expect(
    berechneTreffer('6 2. Digital Services Act', alsSuchverzeichniseintraege([]), null, indizes),
  ).toEqual([
    { art: 'index', eintrag: lang, quelle: 'eu', gefundenUeber: '2. Digital Services Act' },
  ]);
  expect(
    indexNormAnzeige(
      parseSuchanfrage('6 2. Digital Services Act'),
      'artikel',
      '2. Digital Services Act',
    ),
  ).toEqual({ normLabel: 'Art. 6', artikelNummer: null });
});
it('findet den Erwägungsgrund über die Alternative bei bereits installiertem Gesetz', () => {
  const installiert = gesetz('AI Act', 'eu', ['E12']);
  const element = installiert.elemente[0];
  if (element?.typ === 'norm') element.data.art = 'erwaegungsgrund';
  const eu = [{ ...angebot('AI Act'), alternativen: ['KI-VO'], normgeber: 'eu' }];
  const treffer = berechneTreffer('e12 KI-VO', alsSuchverzeichniseintraege([installiert]), null, {
    eu,
    'de-bund': [],
    'de-bw': [],
  });
  expect(treffer).toEqual([
    {
      art: 'installiert',
      ...suchtrefferKopfangaben(installiert),
      gefundenUeber: 'KI-VO',
      norm: norm('E12'),
    },
  ]);
  expect(
    loeseNormzielAuf(
      parseSuchanfrage('e12 KI-VO'),
      alsSuchverzeichniseintrag(installiert),
      treffer[0]?.gefundenUeber,
    ),
  ).toEqual({ xmlId: 'E12', bezeichnung: 'E12', artikelNummer: null });
});
