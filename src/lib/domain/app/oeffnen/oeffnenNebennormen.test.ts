import {
  alsSuchverzeichniseintraege,
  alsSuchverzeichniseintrag,
} from '@/test/suchverzeichnis/suchverzeichnisFabriken';
// oeffnenNebennormen.test.ts
// Nebennormen und gemeinte Gesetze über die öffentliche Suchschnittstelle.
import { expect, it } from 'vitest';
import { gesetzDarstellung, gesetzMitNormen, erwaegungsgrund } from '@/test/gesetz/gesetzFabriken';
import { ermittlePraefixstruktur } from '@/lib/domain/praefixstruktur';
import { berechneTreffer, loeseNormzielAuf, parseSuchanfrage } from './oeffnen.index';

const gesetz = (bezeichnungen: string[], kurztitel = 'LBO', normgeber = 'de-bund') =>
  gesetzMitNormen(bezeichnungen, { kurztitel, normgeber, langtitel: 'Gesetz über Baurecht' });
const bezeichnungen = (text: string, g: ReturnType<typeof gesetz>, aktiv = true) =>
  berechneTreffer(text, alsSuchverzeichniseintraege([g]), aktiv ? g : null, null).map((t) =>
    t.art === 'installiert' ? t.norm?.bezeichnung : undefined,
  );

it.each([
  ['§ 1', 'paragraph'],
  ['§1', 'paragraph'],
  ['Art. 1', 'artikel'],
  ['Artikel 1', 'artikel'],
  ['Art 1 GG', 'artikel'],
  ['§ 1 BGB', 'paragraph'],
  ['1', undefined],
  ['Art115V', undefined],
  ['e1', undefined],
  ['229 3', undefined],
  ['Art. 229 3', undefined],
])('erkennt das Normpräfix von %s', (text, familie) => {
  expect(parseSuchanfrage(text).normPraefix).toBe(familie);
});
it.each([
  ['Anlage 1', '1'],
  ['Anhang 1', '1'],
  ['Muster 7', '7'],
  ['Formblatt 2', '2'],
  ['Tabelle 3', '3'],
  ['1. Regel', '1'],
  ['Anhang 1a', '1a'],
  ['Anlage 12', '12'],
  ['Anlage 3 (zu § 5)', '3'],
  ['Anlage (zu § 5 Absatz 1)', '5'],
  ['Anhang zur Verordnung Nr. 1907/2006', '1907'],
])('findet %s über die erste Zahl %s', (bezeichnung, nummer) => {
  const g = gesetz(['§ 99', bezeichnung]);
  expect(bezeichnungen(nummer, g)).toEqual([bezeichnung]);
  expect(
    loeseNormzielAuf(parseSuchanfrage(nummer), alsSuchverzeichniseintrag(g))?.bezeichnung,
  ).toBe(bezeichnung);
});
it('vergleicht ganze Nebennormzahlen und schließt römische Zahlen und Erwägungsgründe aus', () => {
  expect(bezeichnungen('1', gesetz(['§ 99', 'Anhang 1a', 'Anlage 12', 'Anhang I']))).toEqual([]);
  expect(bezeichnungen('5', gesetz(['§ 99', 'Anlage 3 (zu § 5)']))).toEqual([]);
  const g = gesetz(['§ 99', 'Muster 3']);
  expect(bezeichnungen('3', g)).toEqual(['Muster 3']);
  expect(ermittlePraefixstruktur(gesetz(['Muster 3'])).praefixstruktur).toBe('ohne-praefix');
  expect(bezeichnungen('2', gesetz(['1.', '2.']))).toEqual(['2.']);
  const e = gesetzDarstellung({ elemente: [{ typ: 'norm', data: erwaegungsgrund() }] });
  expect(bezeichnungen('1', e)).toEqual([]);
});
it('ordnet die Hauptnorm vor allen Nebennormen und findet gemeinte Gesetze auch ohne Hauptnorm', () => {
  const g = gesetz(['Anlage 1', '§ 1', 'Anhang 1']);
  for (const text of ['1', '1 LBO'])
    expect(bezeichnungen(text, g)).toEqual(['§ 1', 'Anlage 1', 'Anhang 1']);
  expect(bezeichnungen('1', gesetz(['§ 7', 'Anlage 1', 'Muster 1']))).toEqual([
    'Anlage 1',
    'Muster 1',
  ]);
});
it('bietet bei Normpräfix, zwei Zahlen und Erwägungsgrund keine Nebennormen an', () => {
  const g = gesetz(['§ 1', 'Anlage 1']);
  for (const text of ['§ 1', 'Art. 1', '§ 1 LBO']) expect(bezeichnungen(text, g)).toEqual(['§ 1']);
  for (const text of ['229 1', 'e1']) expect(bezeichnungen(text, g)).toEqual([]);
});
it('begrenzt die Treffer eines aktiven Gesetzes auf 30 und lässt Fragmente bei einem Treffer je Gesetz', () => {
  const g = gesetz(['§ 1', ...Array.from({ length: 35 }, () => 'Muster 1')]);
  expect(bezeichnungen('1', g)).toHaveLength(30);
  expect(bezeichnungen('1', g)[0]).toBe('§ 1');
  expect(bezeichnungen('1 l', g)).toEqual(['§ 1']);
  const gesetze = Array.from({ length: 20 }, (_, i) => gesetz(['§ 1', 'Anlage 1'], `G${i}`));
  expect(berechneTreffer('1 g', alsSuchverzeichniseintraege(gesetze), null, null)).toHaveLength(20);
  expect(
    berechneTreffer('1 Baurecht', alsSuchverzeichniseintraege(gesetze), null, null),
  ).toHaveLength(20);
});

it('beschränkt den Rückfall mit Präfix und erhält ohne Präfix ein Einzelziel je Gesetz', () => {
  const lbo = gesetz(['§ 1', 'Anlage 1']);
  const g2 = gesetz(['§ 7', 'Muster 1', 'Anhang 1'], 'G2');
  const g3 = gesetz(['Art. 1', 'Anlage 1'], 'G3');
  const g4 = gesetz(['§ 9'], 'G4');
  for (const [eingabe, erwartet] of [
    ['1', ['§ 1', 'Muster 1', 'Art. 1']],
    ['§ 1', ['§ 1']],
    ['Art. 1', ['Art. 1']],
  ] as const) {
    expect(
      berechneTreffer(eingabe, alsSuchverzeichniseintraege([lbo, g2, g3, g4]), g4, null).map((t) =>
        t.art === 'installiert' ? t.norm?.bezeichnung : null,
      ),
    ).toEqual(erwartet);
  }
  expect(
    berechneTreffer('1 LBO', alsSuchverzeichniseintraege([lbo, g4]), g4, null).map((t) =>
      t.art === 'installiert' ? t.norm?.bezeichnung : null,
    ),
  ).toEqual(['§ 1', 'Anlage 1']);
  expect(bezeichnungen('Art. 1', gesetz(['Can. 1', 'Anlage 1']))).toEqual(['Can. 1']);
});

it('schneidet innerhalb eines gemeinten Gesetzes nach der Hauptnorm und 29 Nebennormen ab', () => {
  const g = gesetz(['Anlage 1', '§ 1', ...Array.from({ length: 35 }, () => 'Muster 1')]);
  const weiteres = gesetz(['§ 1'], 'Anderes');
  for (const eingabe of ['1', '1 LBO']) {
    const treffer = berechneTreffer(eingabe, alsSuchverzeichniseintraege([g, weiteres]), g, null);
    expect(treffer.map((t) => (t.art === 'installiert' ? t.norm?.xmlId : null))).toEqual([
      '1',
      '0',
      ...Array.from({ length: 28 }, (_, i) => String(i + 2)),
    ]);
  }
});
