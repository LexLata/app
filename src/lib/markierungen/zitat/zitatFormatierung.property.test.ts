// zitatFormatierung.property.test.ts
//
// Property-based Tests (fast-check) für zitatFormatierung.ts – Ergänzung zu
// zitatFormatierung.test.ts, vierter fast-check-Anwendungsfall im Projekt
// nach gesetzesXMLParser.property.test.ts, zitatParser.tokenizer.property.test.ts
// und zitatParser.helpers.property.test.ts (siehe dort für die generelle
// Begründung: property-based Tests nur dort einsetzen, wo eine klare,
// kompakte Invariante existiert – nicht als Ersatz für die
// beispielbasierten Tests).
//
// Geprüfte Invariante (private Funktion zuRoemischGemischt, nur indirekt
// über formatiereZitat + roemischeAbsaetze:true erreichbar):
//  Ein bereits von Klammern/Punkten befreiter Absatz-Rohwert wird GENAU
//  dann in "<römische Zahl><Buchstaben-Suffix>" umgewandelt, wenn er
//  vollständig dem Muster <Ziffernfolge><Buchstabenfolge> entspricht –
//  sonst unverändert durchgereicht. Direkte Ergänzung zur
//  Mutation-Testing-Analyse (Regex-Mutanten, die den ^-Anker, den $-Anker
//  bzw. \d+ durch \d ersetzten und mangels mehrstelliger/versetzter
//  Testfälle überlebten).

import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { formatiereZitat, type ZitatEinstellungenWerte } from './zitatFormatierung';
import { zahlZuRoemisch } from '@/lib/utils/roemischeZahlen';

const ROEMISCH: ZitatEinstellungenWerte = {
  abkuerzungenAktiv: true,
  ohnePunkt: false,
  roemischeAbsaetze: true,
};

const KLEINBUCHSTABEN = 'abcdefghijklmnopqrstuvwxyz'.split('');
const ALPHANUMERISCH = '0123456789abcdefghijklmnopqrstuvwxyz'.split('');

describe('zuRoemischGemischt (via formatiereZitat) – Property: Ziffernfolge + optionaler Buchstaben-Suffix', () => {
  it('für JEDE Ziffernfolge (auch mehrstellig) mit optionalem Buchstaben-Suffix: römische Zahl + unveränderter Suffix', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc
          .array(fc.constantFrom(...KLEINBUCHSTABEN), { minLength: 0, maxLength: 3 })
          .map((zeichen) => zeichen.join('')),
        (n, suffix) => {
          const ergebnis = formatiereZitat(
            '§ 433',
            'BGB',
            normtextPfad({ absatz: `${n}${suffix}` }),
            ROEMISCH,
          );
          expect(ergebnis).toBe(`§ 433 ${zahlZuRoemisch(n)}${suffix} BGB`);
        },
      ),
    );
  });
});

describe('zuRoemischGemischt (via formatiereZitat) – Property: unerwartetes Format bleibt unverändert', () => {
  it('für jede alphanumerische Zeichenkette, die NICHT dem Muster <Ziffernfolge><Buchstabenfolge> entspricht, wird der Absatz-Rohwert unverändert durchgereicht', () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.constantFrom(...ALPHANUMERISCH), { minLength: 1, maxLength: 6 })
          .map((zeichen) => zeichen.join(''))
          .filter((s) => !/^\d+[a-zA-Z]*$/.test(s)),
        (roh) => {
          const ergebnis = formatiereZitat('§ 433', 'BGB', normtextPfad({ absatz: roh }), ROEMISCH);
          expect(ergebnis).toBe(`§ 433 ${roh} BGB`);
        },
      ),
    );
  });
});
