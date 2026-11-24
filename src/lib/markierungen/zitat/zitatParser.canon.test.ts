// Canon-Klassifizierung aus echten, profilfrei erzeugten Token.
// Alias-, Zusatz- und Quelltextverträge bleiben durch die Auslagerung erhalten.

import { it, expect } from 'vitest';
import fc from 'fast-check';
import { tokenisiere } from './zitatParser.tokenizer';
import { wendeCanonKontextAn } from './zitatParser.canon';

it.each(['Abs.', 'lit. a'])(
  'Der Canon-Absatzanker endet an der Zusatzangabe %s ohne weitere Normzahl',
  (zusatz) => {
    const text = `Can. 1 ${zusatz} § 2`;
    const tokens = wendeCanonKontextAn(tokenisiere(text), () => true, text);
    expect(tokens.find((token) => token.wert === '§')).toMatchObject({ art: 'symbol', norm: '§' });
  },
);

it('Ein überlesenes vgl. erhält den Canon-Absatzanker', () => {
  const text = 'Can. 1 vgl. § 2';
  const tokens = wendeCanonKontextAn(tokenisiere(text), () => true, text);
  expect(tokens.find((token) => token.wert === '§')).toMatchObject({
    art: 'zusatz',
    norm: 'absatz',
  });
});

it.each(['§', '§§', 'Art.', 'Artt.', 'Can.', 'Cann.'])(
  'Nur Paragraphensymbol %s mit folgender Zahl wird zum Canon-Absatz',
  (symbol) => {
    const text = `Can. 1 ${symbol} 2`;
    const tokens = wendeCanonKontextAn(tokenisiere(text), () => true, text);
    const token = tokens.find((t) => t.start === text.indexOf(symbol, 7));
    expect(token?.art).toBe(symbol === '§' || symbol === '§§' ? 'zusatz' : 'symbol');
    if (symbol === '§' || symbol === '§§') expect(token?.norm).toBe('absatz');
  },
);

it.each(['BGB', ';'])('Nach %s wird der Canon-Anker für eine neue Zahl neu bestimmt', (grenze) => {
  const text = `Can. 1 ${grenze} 2 § 3`;
  const tokens = wendeCanonKontextAn(
    tokenisiere(text),
    (position) => position !== text.indexOf('2'),
    text,
  );
  // Die neue Normzahl gehört keinem Canon-Profil an. Auch ein anschließend
  // aktives Profil macht ihren Paragraphen nicht zum Absatz des früheren Canon.
  expect(tokens.find((token) => token.wert === '§')).toMatchObject({
    art: 'symbol',
    norm: '§',
  });
});

it('Canon-Aliase und Zusätze sind auf das aktive Profil begrenzt', () => {
  expect(
    wendeCanonKontextAn(
      tokenisiere('c. 1 cc. 2 n. 3 nn. 4 and et or to lit. n'),
      () => true,
      'c. 1 cc. 2 n. 3 nn. 4 and et or to lit. n',
    ).map((t) => [t.art, t.norm]),
  ).toEqual([
    ['symbol', 'Can'],
    ['zahl', undefined],
    ['symbol', 'Cann'],
    ['zahl', undefined],
    ['zusatz', 'nummer'],
    ['zahl', undefined],
    ['zusatz', 'nummer'],
    ['zahl', undefined],
    ['komma', undefined],
    ['komma', undefined],
    ['wort', undefined],
    ['wort', undefined],
    ['zusatz', 'litera'],
    ['buchstabe', undefined],
  ]);
  expect(
    wendeCanonKontextAn(tokenisiere('c. x cc. x can 1'), () => true, 'c. x cc. x can 1').some(
      (t) => t.norm === 'Can' || t.norm === 'Cann',
    ),
  ).toBe(false);
});

it('Canon-Token und Zitatbereiche erhalten jeden Quelltext ohne Lücken', async () => {
  const { parseZitat } = await import('./zitatParser');
  fc.assert(
    fc.property(
      fc.constantFrom('Can.', 'c.', 'canon', 'Kan.', 'Canons', 'cann.', 'cc.'),
      fc.array(fc.integer({ min: 1, max: 9999 }), { minLength: 1, maxLength: 5 }),
      fc.constantFrom(' ', '\u00a0', '\t', '  '),
      fc.constantFrom('und', 'and', 'et'),
      (alias, zahlen, leerraum, konnektor) => {
        const text = `${alias}${leerraum}${zahlen.map((n) => `${n},${leerraum}§${leerraum}1`).join(`, ${konnektor} `)}`;
        const tokens = wendeCanonKontextAn(tokenisiere(text), () => true, text);
        for (const token of tokens) expect(text.slice(token.start, token.ende)).toBe(token.wert);
        const { zitate } = parseZitat(text, () => 'canon');
        expect(zitate[0]!.textStart).toBe(0);
        expect(zitate.at(-1)!.textEnde).toBe(text.length);
        expect(zitate.map((z) => text.slice(z.textStart, z.textEnde)).join('')).toBe(text);
        for (let i = 1; i < zitate.length; i++)
          expect(zitate[i]!.textStart).toBe(zitate[i - 1]!.textEnde);
        expect(zitate.every((z) => z.praefix?.[0] === 'Can.')).toBe(true);
      },
    ),
  );
});

it('Canon-Pluralschreibweisen gelten unabhängig von Groß- und Kleinschreibung', () => {
  const text = 'CANN. 1 CANONS 2 CANONES 3 CC. 4 KANONES 5';
  const tokens = wendeCanonKontextAn(tokenisiere(text), () => true, text);
  expect(tokens.filter((t) => t.art === 'symbol').map((t) => t.norm)).toEqual(
    Array(5).fill('Cann'),
  );
});

it('n. und nn. bleiben unmittelbar nach Litera Zusatzwerte statt Nummernzeichen', () => {
  const text = 'Can. 1 lit. n. lit. nn.';
  const tokens = wendeCanonKontextAn(tokenisiere(text), () => true, text);
  expect(
    tokens.filter((t) => t.wert === 'n.' || t.wert === 'nn.').map((t) => [t.art, t.norm]),
  ).toEqual([
    ['buchstabe', undefined],
    ['buchstabe', undefined],
  ]);
});

it('Canon-Kürzel und Trennwörter müssen vollständige Wörter sein', () => {
  const text = 'an. ann. band. bet. anders etwa';
  const tokens = wendeCanonKontextAn(tokenisiere(text), () => true, text);
  expect(tokens.map((t) => [t.art, t.norm, t.wert])).toEqual(
    text.split(' ').map((wort) => ['wort', undefined, wort]),
  );
});

it('Canon-Nummernkürzel gelten auch in Großbuchstaben', () => {
  const text = 'Can. 1 N. 2 NN. 3';
  const tokens = wendeCanonKontextAn(tokenisiere(text), () => true, text);
  expect(
    tokens.filter((t) => t.wert === 'N.' || t.wert === 'NN.').map((t) => [t.art, t.norm]),
  ).toEqual([
    ['zusatz', 'nummer'],
    ['zusatz', 'nummer'],
  ]);
});

it.each(['§', '§§'])(
  'Paragraphensymbol %s ohne folgende Zahl bleibt im Canon ein Normsymbol',
  (symbol) => {
    const text = `Can. 1 ${symbol} BGB`;
    expect(
      wendeCanonKontextAn(tokenisiere(text), () => true, text).find((t) => t.wert === symbol),
    ).toMatchObject({ art: 'symbol', norm: symbol });
  },
);
