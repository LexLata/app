import {
  alsSuchverzeichniseintraege,
  suchtrefferKopfangaben,
} from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// oeffnenReihenfolge.test.ts
// Anzeigeordnung über den öffentlichen Suchvertrag.
import { assert, expect, it } from 'vitest';
import { normaleNorm, gesetzMitNormen } from '@/test/gesetz/gesetzFabriken';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { berechneTreffer } from './oeffnen.index';
const gesetz = (kurztitel: string, normgeber = 'de-bund'): GesetzDarstellung => ({
  kurztitel,
  normgeber,
  langtitel: kurztitel === 'ZPO' ? 'Zivilprozessordnung' : kurztitel,
  hatGliederungsartikel: false,
  elemente: [
    {
      typ: 'norm',
      data: normaleNorm({ id: '433', xmlId: '433', bezeichnung: '§ 433', absaetze: [] }),
    },
  ],
});
const gesetze = ['GG', 'GVG', 'GmbHG', 'StGB', 'ZVG', 'ZPO'].map((k) => gesetz(k));
const zeiten = (eintraege: [string, number][]) =>
  new Map(eintraege.map(([k, t]) => [gesetzesreferenzSchluessel(gesetz(k)), t]));
const zeitpunkte = zeiten([
  ['ZVG', 3],
  ['StGB', 2],
  ['GG', 1],
  ['ZPO', 4],
]);
const namen = (
  q: string,
  liste = gesetze,
  aktiv: GesetzDarstellung | null = null,
  zeit = zeitpunkte,
) =>
  berechneTreffer(q, alsSuchverzeichniseintraege(liste), aktiv, null, false, zeit).map((t) =>
    t.art === 'installiert' ? t.gesetzesreferenz.kurztitel : 'Import',
  );
it('erhält die Titelstufen und ordnet innerhalb jeder Stufe nach Anzeige', () => {
  expect(namen('g')).toEqual(['GG', 'GmbHG', 'GVG', 'ZVG', 'StGB', 'ZPO']);
  expect(
    namen(
      'g',
      gesetze,
      null,
      zeiten([
        ['GVG', 5],
        ['GG', 1],
      ]),
    ),
  ).toEqual(['GVG', 'GG', 'GmbHG', 'StGB', 'ZVG', 'ZPO']);
});
it('ordnet leere Eingabe und Paragraph ohne Zahl mit stabilen unbesuchten Gesetzen', () => {
  for (const q of ['', '§']) expect(namen(q)).toEqual(['ZPO', 'ZVG', 'StGB', 'GG', 'GVG', 'GmbHG']);
});
it.each(['', '   ', '§'])(
  'zeigt bei %j höchstens 30 Gesetze, zuletzt angezeigte zuerst und übrige in Listenreihenfolge',
  (q) => {
    const liste = Array.from({ length: 35 }, (_, i) => gesetz(`G${i + 1}`));
    const zeit = zeiten([
      ['G35', 3],
      ['G33', 2],
      ['G31', 1],
    ]);
    expect(namen(q, liste, liste[29], zeit)).toEqual([
      'G35',
      'G33',
      'G31',
      ...Array.from({ length: 27 }, (_, i) => `G${i + 1}`),
    ]);
  },
);
it('bevorzugt das aktive Gesetz nur bei passender Norm und ordnet den Fallback nach Anzeige', () => {
  assert(gesetze[0]);
  expect(namen('433', gesetze, gesetze[0])).toEqual(['GG']);
  for (const aktiv of [null, { ...gesetz('Leer'), elemente: [] }])
    expect(namen('433', gesetze, aktiv)).toEqual(['ZPO', 'ZVG', 'StGB', 'GG', 'GVG', 'GmbHG']);
});
it('ordnet namensgleiche und exakte Treffer vor Normgebervorrang und jüngeren Teiltreffern', () => {
  const bund = gesetz('StGB');
  const bw = gesetz('StGB', 'de-bw');
  const teil = gesetz('StGBEG');
  const suche = (zeit: Map<string, number>, q = 'stgb') =>
    berechneTreffer(q, alsSuchverzeichniseintraege([bund, bw, teil]), null, null, false, zeit);
  expect(suche(new Map())[0]).toMatchObject(suchtrefferKopfangaben(bund));
  expect(
    suche(
      new Map([
        [gesetzesreferenzSchluessel(bw), 1],
        [gesetzesreferenzSchluessel(teil), 3],
      ]),
    ),
  ).toMatchObject([
    suchtrefferKopfangaben(bw),
    suchtrefferKopfangaben(bund),
    suchtrefferKopfangaben(teil),
  ]);
  expect(
    suche(
      new Map([
        [gesetzesreferenzSchluessel(bw), 1],
        [gesetzesreferenzSchluessel(bund), 2],
      ]),
    )[0],
  ).toMatchObject(suchtrefferKopfangaben(bund));
  expect(suche(new Map([[gesetzesreferenzSchluessel(bw), 1]]), 'st')[0]).toMatchObject({
    ...suchtrefferKopfangaben(bw),
  });
});
it('erhält ohne Zeitpunkte alle bisherigen Ergebnisse und lässt Importangebote unbeeinflusst', () => {
  const index = {
    'de-bund': [{ kurztitel: 'GZ', langtitel: 'Gesetz', abrufkennung: 'gz' }],
    'de-bw': [],
    eu: [],
  };
  for (const q of ['', '§', '433', 'g', 'stgb']) {
    expect(
      berechneTreffer(q, alsSuchverzeichniseintraege(gesetze), null, index, false, new Map()),
    ).toEqual(berechneTreffer(q, alsSuchverzeichniseintraege(gesetze), null, index));
    const unbekannt = zeiten([
      ['GZ', 100],
      ['NichtInstalliert', 101],
    ]);
    expect(
      berechneTreffer(q, alsSuchverzeichniseintraege(gesetze), null, index, false, unbekannt),
    ).toEqual(berechneTreffer(q, alsSuchverzeichniseintraege(gesetze), null, index));
  }
});
it('berücksichtigt die Anzeigeordnung vor der Kürzung auf 30 Treffer', () => {
  const liste = Array.from({ length: 40 }, (_, i) => gesetz(`G${String(i).padStart(2, '0')}`));
  const treffer = namen('g', liste, null, zeiten([['G39', 1]]));
  expect(treffer).toHaveLength(30);
  expect(treffer[0]).toBe('G39');
});

it('erhält Alternativname und Anzeigeordnung für zusammenhängende Gesetzesgruppen', () => {
  const mitNormen = (kurztitel: string) =>
    gesetzMitNormen(['Anlage 1', '§ 1'], { kurztitel, langtitel: kurztitel, normgeber: 'eu' });
  const a = mitNormen('A');
  const b = mitNormen('B');
  const index = {
    'de-bund': [],
    'de-bw': [],
    eu: [a, b].map((g) => ({
      kurztitel: g.kurztitel,
      langtitel: g.langtitel,
      abrufkennung: g.kurztitel,
      alternativen: ['Baunormen'],
    })),
  };
  for (const [zeitA, zeitB, reihenfolge] of [
    [1, 2, ['B', 'A']],
    [2, 1, ['A', 'B']],
    [1, 1, ['A', 'B']],
  ] as const) {
    const zeiten = new Map([
      [gesetzesreferenzSchluessel(a), zeitA],
      [gesetzesreferenzSchluessel(b), zeitB],
    ]);
    const treffer = berechneTreffer(
      '1 Baunormen',
      alsSuchverzeichniseintraege([a, b]),
      null,
      index,
      false,
      zeiten,
    );
    expect(
      treffer.map((t) =>
        t.art === 'installiert'
          ? [t.gesetzesreferenz.kurztitel, t.norm?.bezeichnung, t.gefundenUeber]
          : null,
      ),
    ).toEqual(
      reihenfolge.flatMap((k) => [
        [k, '§ 1', 'Baunormen'],
        [k, 'Anlage 1', 'Baunormen'],
      ]),
    );
  }
  expect(
    berechneTreffer('1 Baunormen', alsSuchverzeichniseintraege([a, b]), null, index).map((t) =>
      t.art === 'installiert' ? t.gesetzesreferenz.kurztitel : null,
    ),
  ).toEqual(['A', 'A', 'B', 'B']);
});
