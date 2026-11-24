// zitatParser.tokenizer.property.test.ts
//
// Property-based Test (fast-check) für tokenisiere() (zitatParser.tokenizer.ts)
// – Ergänzung zu zitatParser.tokenizer.test.ts, zweiter fast-check-Anwendungsfall
// im Projekt nach gesetzesXMLParser.property.test.ts (siehe dort für die
// generelle Begründung: property-based Tests nur dort einsetzen, wo eine
// klare, kompakte Invariante existiert – nicht als Ersatz für die
// beispielbasierten Tests, die die einzelnen Tokenarten/Sonderfälle prüfen).
//
// Geprüfte Invarianten, für beliebige aus realistischen Zitat-Bausteinen
// zusammengesetzte Texte:
//  1. Tokens überlappen sich nie und sind streng aufsteigend nach Position
//     sortiert (token[i].ende <= token[i+1].start), alle Offsets liegen
//     innerhalb der Textlänge.
//  2. token.wert entspricht text.slice(start, ende) – MIT EINER bekannten
//     Ausnahme: die römische Absatz-Kurzform mit unmittelbar folgendem
//     Punkt (z.B. "III."). Dort wird der Punkt in `ende` mitkonsumiert
//     (schließt ihn also in die Token-Spanne ein), aber NICHT in `wert`
//     übernommen – anders als bei allen anderen Wort-/Zusatz-Tokens mit
//     Punkt (z.B. "Abs.", siehe entsprechender Test in
//     zitatParser.tokenizer.test.ts), wo `wert` den Punkt behält. Das
//     widerspricht dem Wert-Kommentar in zitatParser.tokenizer.ts ("Roher
//     Text wie eingegeben") und wurde bei dieser Mutation-Testing-Analyse
//     entdeckt (siehe Chatverlauf) – hier bewusst nur dokumentiert statt
//     stillschweigend "repariert", damit dieser Test nicht an einer
//     eventuellen künftigen Korrektur vorbeiredet.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { tokenisiere } from './zitatParser.tokenizer';

/**
 * Text aus einer zufälligen Folge realistischer Zitat-Bausteine
 * (Symbole/Zusatzwörter/Sonderwörter/Zahlen/Satzzeichen/Litera-Kandidaten),
 * mit zufälligem (auch leerem) Trenner zwischen den Bausteinen – bewusst
 * AUCH ohne Leerzeichen, um Grenzfälle wie unmittelbar aufeinanderfolgende
 * Tokens ("III." mit direkt folgendem Punkt, "1a" etc.) mit abzudecken.
 */
function zitatFragmentArbitrary(): fc.Arbitrary<string> {
  const bausteine = [
    '§',
    '§§',
    'Art',
    'Artikel',
    'Artt',
    'Abs',
    'Absatz',
    'S',
    'Satz',
    'Nr',
    'lit',
    'Var',
    'Hs',
    'Alt',
    'Gr',
    'iVm',
    'i.V.m.',
    'aE',
    'a.E.',
    'am',
    'Ende',
    'analog',
    'vgl',
    'ZPO',
    'BGB',
    'SGB',
    'III',
    'IV',
    'IIII',
    'a',
    'aa',
    'ab',
    '1',
    '280',
    '1a',
    '1bb',
    '.',
    ',',
    ';',
    '/',
    '(',
    ')',
  ];
  return fc.array(fc.constantFrom(...bausteine), { minLength: 0, maxLength: 10 }).chain((teile) =>
    fc
      .array(fc.constantFrom('', ' '), {
        minLength: Math.max(0, teile.length - 1),
        maxLength: Math.max(0, teile.length - 1),
      })
      .map((trenner) => teile.map((t, i) => t + (trenner[i] ?? '')).join('')),
  );
}

describe('tokenisiere – Property: Token-Offsets', () => {
  it('für beliebigen Text: Tokens überlappen sich nie, sind aufsteigend sortiert, und alle Offsets liegen innerhalb der Textlänge', () => {
    fc.assert(
      fc.property(zitatFragmentArbitrary(), (text) => {
        const tokens = tokenisiere(text);
        for (let i = 0; i < tokens.length; i++) {
          const t = tokens[i]!;
          expect(t.start).toBeGreaterThanOrEqual(0);
          expect(t.ende).toBeGreaterThan(t.start);
          expect(t.ende).toBeLessThanOrEqual(text.length);
          if (i > 0) {
            expect(t.start).toBeGreaterThanOrEqual(tokens[i - 1]!.ende);
          }
        }
      }),
    );
  });

  it('token.wert entspricht text.slice(start, ende) – außer bei der dokumentierten Ausnahme "römische Absatz-Kurzform mit Punkt" (siehe Kopfkommentar)', () => {
    fc.assert(
      fc.property(zitatFragmentArbitrary(), (text) => {
        const tokens = tokenisiere(text);
        for (const t of tokens) {
          const istRoemischMitPunkt =
            t.art === 'zusatz' && t.roemischWert !== undefined && text[t.ende - 1] === '.';
          if (!istRoemischMitPunkt) {
            expect(t.wert).toBe(text.slice(t.start, t.ende));
          }
        }
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// SONDER_MUSTER: optionale Punkte/Leerzeichen an JEDER dafür vorgesehenen
// Stelle (nicht nur den in zitatParser.tokenizer.test.ts fest verdrahteten
// Beispielen "iVm"/"i.V.m."/"aE"/"a.E."/"am Ende") – Ergänzung aus der
// Mutation-Testing-Analyse (siehe Chatverlauf): mehrere Regex-Mutanten
// überlebten, weil bislang keine Kombinationen wie "i Vm" (Leerzeichen statt
// Punkt) oder "am  Ende" (mehrere Leerzeichen) geprüft wurden.
// ---------------------------------------------------------------------------

describe('tokenisiere – Property: SONDER_MUSTER mit beliebigen optionalen Trennzeichen', () => {
  it('"i" + (.)(_) + V/v + (.)(_) + M/m + (.) wird IMMER als ein einziges komma-Token über den gesamten Text erkannt', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.constantFrom('V', 'v'),
        fc.boolean(),
        fc.boolean(),
        fc.constantFrom('M', 'm'),
        fc.boolean(),
        (punkt1, leerzeichen1, vBuchstabe, punkt2, leerzeichen2, mBuchstabe, punkt3) => {
          const text =
            'i' +
            (punkt1 ? '.' : '') +
            (leerzeichen1 ? ' ' : '') +
            vBuchstabe +
            (punkt2 ? '.' : '') +
            (leerzeichen2 ? ' ' : '') +
            mBuchstabe +
            (punkt3 ? '.' : '');
          const tokens = tokenisiere(text);
          expect(tokens).toEqual([{ art: 'komma', start: 0, ende: text.length, wert: text }]);
        },
      ),
    );
  });

  it('"a" + (.)(_) + E/e + (.) wird IMMER als ein einziges sonstige-Token über den gesamten Text erkannt', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.constantFrom('E', 'e'),
        fc.boolean(),
        (punkt1, leerzeichen1, eBuchstabe, punkt2) => {
          const text =
            'a' +
            (punkt1 ? '.' : '') +
            (leerzeichen1 ? ' ' : '') +
            eBuchstabe +
            (punkt2 ? '.' : '');
          const tokens = tokenisiere(text);
          expect(tokens).toEqual([{ art: 'sonstige', start: 0, ende: text.length, wert: text }]);
        },
      ),
    );
  });

  it('"am" + ein oder mehrere Leerzeichen + "Ende" wird IMMER als ein einziges sonstige-Token erkannt (nicht nur bei genau einem Leerzeichen)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 6 }), (anzahlLeerzeichen) => {
        const text = 'am' + ' '.repeat(anzahlLeerzeichen) + 'Ende';
        const tokens = tokenisiere(text);
        expect(tokens).toEqual([{ art: 'sonstige', start: 0, ende: text.length, wert: text }]);
      }),
    );
  });
});
