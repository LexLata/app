// markierungSpeicher.hinzufuegen.property.test.ts
//
// Property-basierter Test (fast-check) für bereichUeberlappt: die
// Grenzfall-Kombinatorik zweier halboffener Intervalle ([start, ende)) ist
// mit Beispiel-Tests nur unvollständig abzudecken (siehe Mutation-Testing-
// Analyse im Chatverlauf, mutant 27 – die "<"-Grenze in
// a.zeichenbereichStart < b.zeichenbereichEnde wurde von den bisherigen Beispiel-Tests
// nur in EINER Reihenfolge (a vor b) geprüft, bei der die zweite Bedingung
// bereits false ist und den Fehler maskiert). Analog zur bestehenden
// Konvention in normAufloesung.property.test.ts.

// Referenzimplementierung über reine Zahlen-Intervalle (halboffen [start, ende)):
// zwei Intervalle überlappen genau dann, wenn jedes vor dem Ende des anderen
// beginnt.

import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { bereichUeberlappt } from './markierungSpeicher.hinzufuegen';

import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

function ueberlapptReferenz(aStart: number, aEnde: number, bStart: number, bEnde: number): boolean {
  return aStart < bEnde && aEnde > bStart;
}

describe('Property: bereichUeberlappt (gleiche bezeichnung/Pfad)', () => {
  it('entspricht der Referenz-Intervall-Überlappung für beliebige, gültige Start/Ende-Paare', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 100 })),
        fc.tuple(fc.integer({ min: 0, max: 100 }), fc.integer({ min: 0, max: 100 })),
        fc.option(fc.array(fc.constantFrom('§', 'Anhang', 'Art.', ''), { maxLength: 3 }), {
          nil: undefined,
        }),
        ([aStart, aEndeRoh], [bStart, bEndeRoh], praefix) => {
          // zeichenbereichEnde muss > zeichenbereichStart sein (gültiger, nicht-leerer Bereich)
          const aEnde = aStart + aEndeRoh + 1;
          const bEnde = bStart + bEndeRoh + 1;
          const a = {
            ausgangsstelle: normAusgangsstelle(
              [(praefix ?? ['§']).at(-1), '1'].filter(Boolean).join(' '),
            ),

            bezug: {
              typ: 'bezugstext' as const,
              textstelle: {
                pfad: normtextPfad({}),
                zeichenbereichStart: aStart,
                zeichenbereichEnde: aEnde,
              },
              bezugstext: '',
            },
          };
          const b = {
            ausgangsstelle: normAusgangsstelle(
              [(praefix ?? ['§']).at(-1), '1'].filter(Boolean).join(' '),
            ),

            bezug: {
              typ: 'bezugstext' as const,
              textstelle: {
                pfad: normtextPfad({}),
                zeichenbereichStart: bStart,
                zeichenbereichEnde: bEnde,
              },
              bezugstext: '',
            },
          };
          expect(bereichUeberlappt(a, b)).toBe(ueberlapptReferenz(aStart, aEnde, bStart, bEnde));
        },
      ),
    );
  });

  it('MUTATIONSTEST: exaktes Berühren an der Grenze (b beginnt genau dort, wo a endet) ist in BEIDEN Reihenfolgen false', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 1, max: 50 }),
        (start, laengeA, laengeB) => {
          const grenze = start + laengeA;
          const a = {
            ausgangsstelle: normAusgangsstelle('§ 1'),
            bezug: {
              typ: 'bezugstext' as const,
              textstelle: {
                pfad: normtextPfad({}),
                zeichenbereichStart: start,
                zeichenbereichEnde: grenze,
              },
              bezugstext: '',
            },
          };
          const b = {
            ausgangsstelle: normAusgangsstelle('§ 1'),
            bezug: {
              typ: 'bezugstext' as const,
              textstelle: {
                pfad: normtextPfad({}),
                zeichenbereichStart: grenze,
                zeichenbereichEnde: grenze + laengeB,
              },
              bezugstext: '',
            },
          };
          expect(bereichUeberlappt(a, b)).toBe(false);
          expect(bereichUeberlappt(b, a)).toBe(false);
        },
      ),
    );
  });
});
