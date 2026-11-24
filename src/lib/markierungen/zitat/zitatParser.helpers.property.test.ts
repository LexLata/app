// zitatParser.helpers.property.test.ts
//
// Property-based Tests (fast-check) für zitatParser.helpers.ts – Ergänzung
// zu zitatParser.helpers.test.ts, dritter fast-check-Anwendungsfall im
// Projekt nach gesetzesXMLParser.property.test.ts und
// zitatParser.tokenizer.property.test.ts (siehe dort für die generelle
// Begründung: property-based Tests nur dort einsetzen, wo eine klare,
// kompakte Invariante existiert – nicht als Ersatz für die
// beispielbasierten Tests).
//
// Geprüfte Invarianten:
//  1. istOrdnungszahlVorAltVarGr: liefert für JEDEN InterneZusatzArt-Wert
//     außer den vier erlaubten (alternative/variante/gruppe/halbsatz) immer
//     false – unabhängig von warOrdnungszahl. Direkte Ergänzung zur
//     Mutation-Testing-Analyse (mutant 12: die komplette Alt/Var/Gr/Hs-
//     Prüfung durch `true` ersetzt, siehe zitatParser.helpers.test.ts).
//  2. sammleVerfeinerungskette: kein Kettenglied stammt jemals von einem
//     Token AB (bzw. hinter) dem ersten Komma/Schrägstrich im
//     betrachteten Tokenbereich – die generische Fassung der Lücke, die bei
//     der Mutation-Testing-Analyse für die Komma-/Schrägstrich-
//     Abbruchbedingung entdeckt wurde (mutanten 173/174/175/177/178/180).

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { tokenisiere } from './zitatParser.tokenizer';
import type { InterneZusatzArt } from './zitatParser.tokenizer';
import { istOrdnungszahlVorAltVarGr, sammleVerfeinerungskette } from './zitatParser.helpers';

const ALLE_ZUSATZARTEN: InterneZusatzArt[] = [
  'absatz',
  'unterabsatz',
  'satz',
  'nummer',
  'litera',
  'gruppe',
  'variante',
  'halbsatz',
  'alternative',
];
const ERLAUBTE_ARTEN: ReadonlySet<InterneZusatzArt> = new Set([
  'alternative',
  'variante',
  'gruppe',
  'halbsatz',
]);
const NICHT_ERLAUBTE_ARTEN = ALLE_ZUSATZARTEN.filter((art) => !ERLAUBTE_ARTEN.has(art));

describe('istOrdnungszahlVorAltVarGr – Property: nur Alt/Var/Gr/Hs liefert true', () => {
  it('für jede ZusatzArt außer alternative/variante/gruppe/halbsatz: immer false', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.constantFrom(...NICHT_ERLAUBTE_ARTEN),
        (warOrdnungszahl, norm) => {
          const token = { art: 'zusatz', norm } as unknown as Parameters<
            typeof istOrdnungszahlVorAltVarGr
          >[1];
          expect(istOrdnungszahlVorAltVarGr(warOrdnungszahl, token)).toBe(false);
        },
      ),
    );
  });
});

/** Zufällige Folge aus Zusatzwort/Zahl/Buchstabe-Bausteinen mit genau EINEM
 *  Komma oder Schrägstrich irgendwo in der Mitte – bewusst nur aus Token-
 *  Bausteinen, die tokenisiere() eindeutig als 'zusatz'/'zahl'/'buchstabe'
 *  erkennt, damit die Property sich auf die Abbruchbedingung konzentriert
 *  statt auf Tokenizer-Grenzfälle. */
function ketteMitTrennerArbitrary(): fc.Arbitrary<{ text: string; trennerIndex: number }> {
  const zusatzwortBausteine = ['Abs', 'UAbs', 'Satz', 'Nr'];
  const wertBausteine = ['1', '2', '3', 'a', 'b'];
  const paarArbitrary = fc
    .tuple(fc.constantFrom(...zusatzwortBausteine), fc.constantFrom(...wertBausteine))
    .map(([wort, wert]) => `${wort} ${wert}`);

  return fc
    .tuple(
      fc.array(paarArbitrary, { minLength: 1, maxLength: 3 }),
      fc.array(paarArbitrary, { minLength: 1, maxLength: 3 }),
      fc.constantFrom(',', '/'),
    )
    .map(([vorTrenner, nachTrenner, trenner]) => {
      const vorText = vorTrenner.join(' ');
      const text = `${vorText}${trenner} ${nachTrenner.join(' ')}`;
      const trennerIndex = tokenisiere(vorText).length;
      return { text, trennerIndex };
    });
}

describe('sammleVerfeinerungskette – Property: nie über Komma/Schrägstrich hinaus', () => {
  it('für zufällige Ketten mit einem Trenner in der Mitte: alle gesammelten Werte stammen ausschließlich aus dem Bereich VOR dem Trenner', () => {
    fc.assert(
      fc.property(ketteMitTrennerArbitrary(), ({ text, trennerIndex }) => {
        const tokens = tokenisiere(text);
        const kette = sammleVerfeinerungskette(tokens, 0);
        // Der Bereich vor dem Trenner besteht ausschließlich aus
        // Zusatzwort+Wert-Paaren – jedes Paar liefert genau ein
        // Kettenglied. Die Kette darf also höchstens so viele Glieder wie
        // Paare VOR dem Trenner enthalten (nie mehr, auch bei mehreren
        // Paaren dahinter).
        const maxGlieder = Math.floor(trennerIndex / 2);
        expect(kette.length).toBeLessThanOrEqual(maxGlieder);
      }),
    );
  });
});
