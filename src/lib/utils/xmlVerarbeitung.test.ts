// xmlVerarbeitung.test.ts
//
// Eigenständige Tests für escapeXML/unescapeXML. Bisher nur indirekt über
// markierungsXML.test.ts (dort primär Roundtrips ganzer
// Markierungs-Einträge, escapeXML/unescapeXML selbst nie isoliert geprüft)
// abgedeckt – diese Datei ergänzt gezielte Einzelfälle sowie die
// Reihenfolge-Randfälle, auf die der Kopfkommentar der Quelldatei
// hinweist (5-Entity-Superset, &amp; zuletzt beim Unescape).

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { execFileSync } from 'node:child_process';
import {
  escapeXML,
  optionaleXmlAttribut,
  unescapeXML,
  isoZeitstempel,
  liesVerarbeitungszeitstempel,
  ersetzeUnzulaessigeXmlZeichen,
} from './xmlVerarbeitung';

describe('optionaleXmlAttribut', () => {
  it('lässt fehlende Werte weg und maskiert vorhandene Attributwerte', () => {
    expect(optionaleXmlAttribut('quelle', undefined)).toBe('');
    expect(optionaleXmlAttribut('quelle', `A&B"`)).toBe(' quelle="A&amp;B&quot;"');
  });
});

describe('escapeXML', () => {
  it('escaped alle 5 Sonderzeichen einzeln', () => {
    expect(escapeXML('&')).toBe('&amp;');
    expect(escapeXML('<')).toBe('&lt;');
    expect(escapeXML('>')).toBe('&gt;');
    expect(escapeXML('"')).toBe('&quot;');
    expect(escapeXML("'")).toBe('&apos;');
  });

  it('escaped alle 5 Zeichen gemeinsam in einem String', () => {
    expect(escapeXML(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&apos;');
  });

  it('lässt Text ohne Sonderzeichen unverändert', () => {
    expect(escapeXML('§ 1 Abs. 2 BGB')).toBe('§ 1 Abs. 2 BGB');
  });

  it('leerer String bleibt leer', () => {
    expect(escapeXML('')).toBe('');
  });

  it('Edge-Case: & wird zuerst escaped, sodass ein literales "&lt;" im Text nicht fälschlich als Entity stehen bleibt, sondern selbst als &amp;lt; erkennbar bleibt', () => {
    // Wäre die Reihenfolge vertauscht (z.B. erst < ersetzen, dann &), gäbe
    // es hier keinen Unterschied – der Test dokumentiert die Absicht, nicht
    // einen tatsächlichen Bug bei anderer Reihenfolge (siehe unescapeXML,
    // wo die Reihenfolge tatsächlich beobachtbar wird).
    expect(escapeXML('&lt;')).toBe('&amp;lt;');
  });
});

describe('unescapeXML', () => {
  it('unescaped alle 5 Entities einzeln', () => {
    expect(unescapeXML('&amp;')).toBe('&');
    expect(unescapeXML('&lt;')).toBe('<');
    expect(unescapeXML('&gt;')).toBe('>');
    expect(unescapeXML('&quot;')).toBe('"');
    expect(unescapeXML('&apos;')).toBe("'");
  });

  it('unescaped alle 5 Entities gemeinsam in einem String', () => {
    expect(unescapeXML('&amp;&lt;&gt;&quot;&apos;')).toBe(`&<>"'`);
  });

  it('lässt Text ohne Entities unverändert', () => {
    expect(unescapeXML('§ 1 Abs. 2 BGB')).toBe('§ 1 Abs. 2 BGB');
  });

  it('leerer String bleibt leer', () => {
    expect(unescapeXML('')).toBe('');
  });

  it('Edge-Case: &amp; wird bewusst zuletzt ersetzt – ein escapter Text bleibt dadurch korrekt entschachtelt statt kaputt doppelt-decodiert', () => {
    // escapeXML('&lt;') ergibt '&amp;lt;' (siehe Test oben). Würde
    // unescapeXML stattdessen &amp; ZUERST ersetzen, entstünde aus
    // '&amp;lt;' zunächst '&lt;', und die anschließende &lt;-Ersetzung
    // würde daraus fälschlich '<' machen statt korrekt '&lt;'
    // zurückzuerhalten.
    expect(unescapeXML('&amp;lt;')).toBe('&lt;');
  });

  it('Edge-Case: mehrfach verschachtelte &amp;-Ketten werden nur EINMAL entschachtelt (kein rekursives Decodieren)', () => {
    expect(unescapeXML('&amp;amp;')).toBe('&amp;');
  });

  it('unbekannte/nicht unterstützte Entities (z.B. numerische &#38;) bleiben unverändert stehen', () => {
    expect(unescapeXML('&#38;')).toBe('&#38;');
  });
});

describe('escapeXML/unescapeXML – Roundtrip', () => {
  it('escapeXML gefolgt von unescapeXML liefert für jeden beliebigen String das Original zurück', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(unescapeXML(escapeXML(s))).toBe(s);
      }),
    );
  });

  it('Roundtrip gilt auch für Strings, die bereits entity-artige Teilstrings enthalten (z.B. literal "&amp;" oder "&lt;" als Nutzertext)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom('&amp;', '&lt;', '&gt;', '&quot;', '&apos;', '&', '<', '>')),
        (teile) => {
          const s = teile.join('');
          expect(unescapeXML(escapeXML(s))).toBe(s);
        },
      ),
    );
  });

  it('escapeXML erzeugt nie eines der vier spitzen/Anführungszeichen roh im Ergebnis (alles vollständig escaped)', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const escaped = escapeXML(s);
        expect(escaped).not.toMatch(/[<>"']/);
      }),
    );
  });
});

describe('Verarbeitungszeitstempel', () => {
  it('schreibt UTC mit Z ohne Millisekunden', () => {
    expect(isoZeitstempel(new Date('2024-06-15T10:30:00.123+02:00'))).toBe('2024-06-15T08:30:00Z');
    expect(isoZeitstempel(new Date('2024-01-01T00:00:00Z'))).toBe('2024-01-01T00:00:00Z');
  });

  it.each([
    undefined,
    '',
    ' ',
    '2024-01-01',
    '1.1.2024 12:00',
    'kein Datum',
    '2024-02-30T12:00:00',
    '2023-02-29T12:00:00Z',
    '2024-13-01T12:00:00',
    '2024-01-01T24:00:00',
    '2024-01-01T12:60:00',
    '2024-01-01T12:00:60',
    '2024-01-01T12:00:00+24:00',
    '2024-01-01T12:00:00+01:60',
  ])('weist ungültigen Wert %s zurück', (wert) => {
    expect(liesVerarbeitungszeitstempel(wert)).toBeUndefined();
  });

  it.each(['UTC', 'Europe/Berlin'])(
    'liest unabhängig von der Systemzeitzone %s in einem eigenen Prozess',
    (zeitzone) => {
      const werte = [
        '2024-01-15T12:30:00',
        '2024-07-15T12:30:00',
        '2024-01-15T12:30:00+01:00',
        '2024-07-15T12:30:00+02:00',
        '2024-02-29T12:30:00.123Z',
        '2024-02-29T12:30:00.123',
        '2024-07-15T12:30:00-03:30',
      ];
      const code = `import { liesVerarbeitungszeitstempel } from './src/lib/utils/xmlVerarbeitung.ts';
      process.stdout.write(JSON.stringify(${JSON.stringify(werte)}.map(wert => liesVerarbeitungszeitstempel(wert)?.toISOString())));`;
      const ergebnis = execFileSync(process.execPath, ['--import', 'tsx', '--eval', code], {
        env: { ...process.env, TZ: zeitzone },
        encoding: 'utf8',
      });
      expect(JSON.parse(ergebnis)).toEqual([
        '2024-01-15T12:30:00.000Z',
        '2024-07-15T12:30:00.000Z',
        '2024-01-15T11:30:00.000Z',
        '2024-07-15T10:30:00.000Z',
        '2024-02-29T12:30:00.123Z',
        '2024-02-29T12:30:00.123Z',
        '2024-07-15T16:00:00.000Z',
      ]);
    },
  );
});

describe('ersetzeUnzulaessigeXmlZeichen', () => {
  // Erwartung nach XML 1.0 (Char-Produktion), unabhängig von der Implementierung.
  it.each([
    ['Zeilentabulator U+000B', 'a\u000Bb', 'a\nb'],
    ['Seitenvorschub U+000C', 'a\u000Cb', 'a\nb'],
    ['einzelnes hohes Surrogat', 'a\uD83Db', 'a\uFFFDb'],
    ['einzelnes niedriges Surrogat', 'a\uDE00b', 'a\uFFFDb'],
    ['hohes Surrogat am Ende', 'a\uD83D', 'a\uFFFD'],
    ['vertauschtes Surrogatpaar', '\uDE00\uD83D', '\uFFFD\uFFFD'],
    ['U+0000', 'a\u0000b', 'a b'],
    ['U+0007', 'a\u0007b', 'a b'],
    ['U+001B', 'a\u001Bb', 'a b'],
    ['U+FFFE', 'a\uFFFEb', 'a b'],
    ['U+FFFF', 'a\uFFFFb', 'a b'],
    ['mehrere gemischt', '\u000B\u0001x\uFFFF\u000C', '\n x \n'],
  ])('ersetzt %s', (_name, eingabe, erwartet) => {
    expect(ersetzeUnzulaessigeXmlZeichen(eingabe)).toBe(erwartet);
    expect(ersetzeUnzulaessigeXmlZeichen(eingabe)).toHaveLength(eingabe.length);
  });

  it.each([
    ['TAB', 'a\tb'],
    ['LF', 'a\nb'],
    ['CR', 'a\rb'],
    ['U+0085', 'a\u0085b'],
    ['U+2028', 'a\u2028b'],
    ['U+00AD', 'a\u00ADb'],
    ['gültiges Surrogatpaar', 'a\uD83D\uDE00b'],
    ['normalen Text', '§ 1 Abs. 2 BGB – „Zitat“'],
    ['den leeren Text', ''],
    ['U+FFFD und U+E000', '\uFFFD\uE000'],
  ])('lässt %s unverändert', (_name, eingabe) => {
    expect(ersetzeUnzulaessigeXmlZeichen(eingabe)).toBe(eingabe);
  });

  it('erhält die Länge und ist idempotent für beliebige UTF-16-Folgen', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 0xffff })).map((c) => String.fromCharCode(...c)),
        (text) => {
          const einmal = ersetzeUnzulaessigeXmlZeichen(text);
          expect(einmal).toHaveLength(text.length);
          expect(ersetzeUnzulaessigeXmlZeichen(einmal)).toBe(einmal);
          expect(einmal).toMatch(
            /^(?:[\t\n\r\u0020-\uD7FF\uE000-\uFFFD]|[\uD800-\uDBFF][\uDC00-\uDFFF])*$/,
          );
        },
      ),
    );
  });
});
