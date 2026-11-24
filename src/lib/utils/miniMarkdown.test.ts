// Verhalten des begrenzten Markdown-Parsers und der einzigen Datenschutz-Textquelle.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { format, resolveConfig } from 'prettier';
import fc from 'fast-check';
import { parseMiniMarkdown } from './miniMarkdown';

const text = (inhalt: string) => ({ art: 'text', inhalt });

describe('parseMiniMarkdown', () => {
  it('liest Überschriften, Absätze und Zeilenfortsetzungen', () => {
    expect(parseMiniMarkdown('# Titel\n\nErste Zeile\nzweite Zeile\n\n### Detail')).toEqual([
      { art: 'ueberschrift', ebene: 1, inhalt: [text('Titel')] },
      { art: 'absatz', inhalt: [text('Erste Zeile zweite Zeile')] },
      { art: 'ueberschrift', ebene: 3, inhalt: [text('Detail')] },
    ]);
  });
  it('liest einfache Listen einschließlich eingerückter Fortsetzungszeilen', () => {
    expect(parseMiniMarkdown('- Eins\n  mit Fortsetzung\n- Zwei')).toEqual([
      { art: 'liste', eintraege: [[text('Eins mit Fortsetzung')], [text('Zwei')]] },
    ]);
  });
  it('liest Tabellen mit gleich breiten Zeilen und formatierten Zellen', () => {
    expect(parseMiniMarkdown('| A | B |\n| --- | :---: |\n| **fett** | `a_b` |')).toEqual([
      {
        art: 'tabelle',
        kopf: [[text('A')], [text('B')]],
        zeilen: [[[{ art: 'fett', inhalt: [text('fett')] }], [{ art: 'code', inhalt: 'a_b' }]]],
      },
    ]);
  });
  it('liest Fett, beide Kursivformen und wörtlichen Inline-Code', () => {
    expect(parseMiniMarkdown('**fett** *kursiv* _kursiv_ `a_b *x* <tag>`')).toEqual([
      {
        art: 'absatz',
        inhalt: [
          { art: 'fett', inhalt: [text('fett')] },
          text(' '),
          { art: 'kursiv', inhalt: [text('kursiv')] },
          text(' '),
          { art: 'kursiv', inhalt: [text('kursiv')] },
          text(' '),
          { art: 'code', inhalt: 'a_b *x* <tag>' },
        ],
      },
    ]);
  });
  it('entfernt mehrzeilige Kommentare, auch innerhalb eines Absatzes', () => {
    expect(parseMiniMarkdown('A<!-- verborgen\n<script>x</script> -->B')).toEqual([
      { art: 'absatz', inhalt: [text('AB')] },
    ]);
  });
  it('behält Kontaktplatzhalter als Text', () => {
    expect(parseMiniMarkdown('[Name / Projekt], [E-Mail-Adresse]')).toEqual([
      { art: 'absatz', inhalt: [text('[Name / Projekt], [E-Mail-Adresse]')] },
    ]);
  });
  it.each([
    '<script>alert(1)</script>',
    '<https://example.org>',
    '[Link](https://example.org)',
    '![Bild](x)',
    '[Link][ziel]',
    '[ziel]: https://example.org',
    '> Zitat',
    '1. Eins',
    '1) Eins',
    '- Eins\n  - Zwei',
    '- Eins\n  1. Zwei',
    '```\ncode\n```',
    '---',
    'Titel\n===',
    '####### Titel',
    '| A | B |\n| --- | --- |\n| Nur A |',
    '| A | B |',
    '**offen',
    '_offen',
    '`offen',
    '<!-- offen',
    '    eingerückter Code',
    '~~durchgestrichen~~',
  ])('weist nicht unterstützte oder beschädigte Syntax zurück: %s', (quelle) => {
    expect(() => parseMiniMarkdown(quelle)).toThrow();
  });
  it('behandelt beliebige Kursivzeichen im Code wörtlich', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('_', '*', 'a', ' ', '<', '>'), { minLength: 1 }),
        (zeichen) => {
          const inhalt = zeichen.join('');
          expect(parseMiniMarkdown('`' + inhalt + '`')).toEqual([
            { art: 'absatz', inhalt: [{ art: 'code', inhalt }] },
          ]);
        },
      ),
    );
  });
  it('liest die tatsächliche Rootdatei vor und nach Prettier mit Überschrift und Tabelle', async () => {
    const pfad = new URL('../../../DATENSCHUTZ.md', import.meta.url);
    const quelle = readFileSync(pfad, 'utf8');
    const formatiert = await format(quelle, {
      ...(await resolveConfig(pfad.pathname)),
      filepath: pfad.pathname,
    });
    const vorher = parseMiniMarkdown(quelle);
    expect(parseMiniMarkdown(formatiert)).toEqual(vorher);
    expect(vorher.some((block) => block.art === 'ueberschrift')).toBe(true);
    expect(vorher.some((block) => block.art === 'tabelle')).toBe(true);
  });
});
