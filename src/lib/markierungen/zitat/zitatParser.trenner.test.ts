// Vereinbarte Trennwirkung und Zusatzsynonyme bei unveränderten Textbereichen.
import { expect, it } from 'vitest';
import { parseZitat } from './zitatParser';
import { tokenisiere } from './zitatParser.tokenizer';
import { wendeCanonKontextAn } from './zitatParser.canon';

const TRENNWOERTER = ['und', 'sowie', 'oder', 'bzw'];

it.each(
  TRENNWOERTER.flatMap((wort) => [wort, `${wort}.`, wort.toUpperCase(), `${wort.toUpperCase()}.`]),
)('%s trennt Zahlenketten und bleibt textlich am vorherigen Zitat', (trenner) => {
  const text = `§§ 433 ${trenner} 434 BGB`;
  const { zitate } = parseZitat(text);
  expect(zitate.map((z) => [z.normzahlRoh, z.gesetzRoh])).toEqual([
    ['433', 'BGB'],
    ['434', 'BGB'],
  ]);
  expect(text.slice(zitate[0]!.textStart, zitate[0]!.textEnde)).toBe(`§§ 433 ${trenner} `);
  expect(tokenisiere(trenner)[0]?.art).toBe('komma');
});

it.each(['iVm', 'i.V.m.', 'i. V. m.'])('%s trennt wie "und"', (trenner) => {
  const paare = (text: string) => parseZitat(text).zitate.map((z) => [z.normzahlRoh, z.gesetzRoh]);
  expect(paare(`§ 1 ${trenner} 2 BGB`)).toEqual([
    ['1', 'BGB'],
    ['2', 'BGB'],
  ]);
  expect(paare(`§ 1 ${trenner} § 2 BGB`)).toEqual([
    ['1', undefined],
    ['2', 'BGB'],
  ]);
});

it.each(['bis', '-', '–', '—', ' - ', ' – ', ' — '])(
  '%s bezeichnet nur die beiden Bereichsenden',
  (trenner) => {
    const text = `§§ 5${trenner === 'bis' ? ' bis ' : trenner}7 BGB`;
    expect(parseZitat(text).zitate.map((z) => [z.normzahlRoh, z.gesetzRoh])).toEqual([
      ['5', 'BGB'],
      ['7', 'BGB'],
    ]);
  },
);

it.each(['Art. 3 und 4 GG', 'Art. 3/4 GG'])('Artikelkette: %s', (text) => {
  expect(parseZitat(text).zitate.map((z) => [z.normzahlRoh, z.gesetzRoh])).toEqual([
    ['3', 'GG'],
    ['4', 'GG'],
  ]);
});

it.each(['und', 'oder', 'sowie', 'bzw.'])('%s respektiert neue Gesetzesabschnitte', (trenner) => {
  expect(
    parseZitat(`§ 5 ${trenner} § 6 BGB`).zitate.map((z) => [z.normzahlRoh, z.gesetzRoh]),
  ).toEqual([
    ['5', undefined],
    ['6', 'BGB'],
  ]);
  expect(
    parseZitat(`§ 5 BGB ${trenner} § 6 ZPO`).zitate.map((z) => [z.normzahlRoh, z.gesetzRoh]),
  ).toEqual([
    ['5', 'BGB'],
    ['6', 'ZPO'],
  ]);
});

it.each(['Buchst.', 'Buchstabe', 'Unterabs.', 'Halbs.'])(
  'Zusatzsynonym %s gehört zur Norm',
  (wort) => {
    const text = wort.startsWith('Buchst')
      ? `§ 3 Abs. 1 Nr. 2 ${wort} a BGB`
      : wort === 'Unterabs.'
        ? `Art. 6 Abs. 1 ${wort} 2 GG`
        : `§ 5 Abs. 1 ${wort} 2 BGB`;
    const { zitate } = parseZitat(text);
    expect(zitate).toHaveLength(1);
    expect(zitate[0]!.gesetzRoh).toBe(wort === 'Unterabs.' ? 'GG' : 'BGB');
  },
);

it('des ist Füllwort, Titelbindestriche bleiben erhalten', () => {
  expect(parseZitat('§ 5 des BGB').zitate[0]?.gesetzRoh).toBe('BGB');
  for (const titel of ['EG-Vertrag', 'BauO-NRW'])
    expect(parseZitat(`§ 5 ${titel}`).zitate[0]?.gesetzRoh).toBe(titel);
});

it.each(['und', ',', '/', 'sowie.', 'ODER', 'bzw', 'bis', 'des'])(
  'alleinstehendes %s ergibt keine Norm',
  (text) => {
    expect(parseZitat(text)).toEqual({ zitate: [], ambiguitaeten: [] });
  },
);

it.each(['and', 'et', 'AND.', 'Et.'])('Canon-Trenner %s nur im passenden Profil', (wort) => {
  expect(wendeCanonKontextAn(tokenisiere(wort), () => true, wort)[0]?.art).toBe('komma');
  expect(wendeCanonKontextAn(tokenisiere(wort), () => false, wort)[0]?.art).toBe('wort');
  expect(
    parseZitat(`Canons 2265, § 2, 2275, n. 3, ${wort} 2283`, () => 'canon').zitate.map(
      (z) => z.normzahlRoh,
    ),
  ).toEqual(['2265', '2275', '2283']);
});

it.each(['1/2', '1 und 2', '1, und / 2', '1-2'])(
  'Zusatzkandidaten und Verfeinerungsgrenzen: %s',
  (folge) => {
    const { zitate, ambiguitaeten } = parseZitat(`§ 5 Abs. ${folge} BGB`);
    expect(zitate.map((z) => z.normzahlRoh)).toEqual(['5', '2']);
    expect(ambiguitaeten).toHaveLength(1);
    expect(ambiguitaeten[0]).toMatchObject({
      art: 'absatz',
      wert: '2',
      vorherigerIndex: 0,
      index: 1,
    });
  },
);

it('Pluralprüfung überspringt Folgen mehrerer Trenner', () => {
  const { zitate, ambiguitaeten } = parseZitat('§§ 5 Abs. 1, und 2, sowie / 7 BGB');
  expect(zitate.map((z) => z.normzahlRoh)).toEqual(['5', '2', '7']);
  expect(ambiguitaeten.map((a) => a.wert)).toEqual(['2']);
});

it('angehängtes bis bleibt Wort; Striche brauchen Zahl links und Ziffer rechts', () => {
  expect(tokenisiere('5bis').map((t) => [t.art, t.wert])).toEqual([
    ['zahl', '5'],
    ['wort', 'bis'],
  ]);
  expect(parseZitat('§ 5bis BGB').zitate[0]?.gesetzRoh).toBe('bis BGB');
  for (const text of ['-7', 'BGB-7', '5-a', '5- BGB'])
    expect(tokenisiere(text).some((t) => t.art === 'komma')).toBe(false);
});

it('Schrägstrich erhält auch im Canon-Profil den Absatzanker', () => {
  const text = 'Canons 2265/ § 2/ 2275/ n. 3/ and 2283';
  const { zitate, ambiguitaeten } = parseZitat(text, () => 'canon');
  expect(zitate.map((z) => [z.normzahlRoh, z.praefix])).toEqual([
    ['2265', ['Can.']],
    ['2275', ['Can.']],
    ['2283', ['Can.']],
  ]);
  expect(ambiguitaeten.map((a) => a.wert)).toEqual(['2275']);
});

it.each([
  ['buchst', 'litera'],
  ['buchstabe', 'litera'],
  ['unterabs', 'unterabsatz'],
  ['halbs', 'halbsatz'],
])('Zusatzsynonym %s ist unabhängig von Punkt und Großschreibung', (wort, norm) => {
  for (const form of [wort, `${wort}.`, wort.toUpperCase(), `${wort.toUpperCase()}.`])
    expect(tokenisiere(form)[0]).toMatchObject({ art: 'zusatz', norm, wert: form });
});

it.each(['5aa-7ab', '5 –\t7', '5\n—\u00a07'])(
  'Bereiche erhalten vollständige Nummern und erlauben Leerraum: %s',
  (folge) => {
    expect(parseZitat(`§§ ${folge} BGB`).zitate.map((z) => z.normzahlRoh)).toEqual(
      folge.startsWith('5aa') ? ['5aa', '7ab'] : ['5', '7'],
    );
  },
);
