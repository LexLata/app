// tabVerlauf.property.test.ts
//
// Property-basierter Test (fast-check) für verlaufEintragHinzufuegen mit
// einer "position" außerhalb des gültigen Bereichs [0, eintraege.length) –
// deckt Mutation-Testing-Lücken ab (siehe Chatverlauf), die die bestehenden
// Beispiel-Tests in tabVerlauf.test.ts nicht abdecken, weil dort position
// immer aus regulärer Navigation stammt. Das ist kein rein akademisches
// Szenario: TabVerlauf wird über geschlosseneTabsSpeicher.ts in localStorage
// persistiert. Der JSON-Leser verwirft ungültige Zeiger; die reine Logik
// bleibt auch bei unmittelbar übergebenen ungültigen Zuständen wohldefiniert. Analog zur bestehenden Konvention in
// normAufloesung.property.test.ts.

import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { describe, it, expect, assert } from 'vitest';
import fc from 'fast-check';
import { verlaufEintragHinzufuegen } from '@/lib/domain/app/tabVerlauf';
import type { TabVerlauf, VerlaufEintrag } from '@/lib/domain/appTypes';

describe('Property: verlaufEintragHinzufuegen mit position außerhalb [0, eintraege.length)', () => {
  it('MUTATIONSTEST: bei ungültiger position bleibt die bestehende Reihenfolge unverändert (nur Dedupe + Voranstellen), keine Verschiebung und kein undefined-Eintrag', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 5 }), // n = Anzahl bestehender Einträge
        fc.constantFrom('negativ', 'zuGross'),
        fc.integer({ min: 0, max: 5 }), // Abstand zur gültigen Grenze
        (n, art, abstand) => {
          const liste: VerlaufEintrag[] = Array.from({ length: n }, (_, i) => ({
            gesetzesreferenz: gesetzesreferenz({ kurztitel: 'g1' }),
            xmlId: `e${i}`,
          }));
          // "negativ": position < 0. "zuGross": position >= n (inkl. der
          // Grenze position === n selbst, wenn abstand === 0 – genau das
          // deckt den "<="-Mutanten der oberen Grenze ab).
          const position = art === 'negativ' ? -(abstand + 1) : n + abstand;
          const verlauf: TabVerlauf = { eintraege: liste, position };
          const neuerEintrag: VerlaufEintrag = {
            gesetzesreferenz: gesetzesreferenz({ kurztitel: 'g1' }),
            xmlId: 'NEU',
          };

          const ergebnis = verlaufEintragHinzufuegen(verlauf, neuerEintrag);

          const erwartet = [
            neuerEintrag,
            ...liste.filter(
              (e) =>
                !(
                  e.gesetzesreferenz.kurztitel === neuerEintrag.gesetzesreferenz.kurztitel &&
                  e.xmlId === neuerEintrag.xmlId
                ),
            ),
          ];
          expect(ergebnis.eintraege).toEqual(erwartet);
          expect(ergebnis.position).toBe(0);
        },
      ),
    );
  });
});

it('erhält die Verlaufsinvarianten bei beliebigen Sprüngen und Schritten', async () => {
  const { leererVerlauf, verlaufSprung, verlaufAktivierungMelden, verlaufSchrittNavigieren } =
    await import('./tabVerlauf');
  fc.assert(
    fc.property(
      fc.array(fc.tuple(fc.constantFrom('sprung', 'schritt'), fc.integer({ min: 0, max: 150 })), {
        maxLength: 300,
      }),
      (aktionen) => {
        let v = leererVerlauf();
        for (const [art, id] of aktionen) {
          const ziel = {
            gesetzesreferenz: gesetzesreferenz({ kurztitel: 'g1' }),
            xmlId: String(id),
          };
          const vorher = v.eintraege;
          v =
            art === 'sprung'
              ? verlaufSprung(v, ziel)
              : verlaufAktivierungMelden(v, ziel, 'schritt');
          if (art === 'schritt') expect(v.eintraege).toBe(vorher);
          else expect(v.eintraege.length).toBeLessThanOrEqual(vorher.length + 2);
          expect(new Set(v.eintraege.map((e) => e.xmlId)).size).toBe(v.eintraege.length);
          expect(v.eintraege.length).toBeLessThanOrEqual(100);
          expect(v.position).toBeGreaterThanOrEqual(0);
          expect(v.position).toBeLessThan(Math.max(1, v.eintraege.length));
          if (
            v.eintraege.length &&
            v.aktivesElement &&
            v.aktivesElement.xmlId !== v.eintraege[v.position]?.xmlId
          ) {
            const zurueck = verlaufSchrittNavigieren(v, 'zurueck');

            assert(zurueck);
            const vor = verlaufSchrittNavigieren(zurueck.verlauf, 'vorwaerts');

            assert(vor);
            expect(vor.ziel).toEqual(v.aktivesElement);
            expect(vor.verlauf.eintraege).toBe(v.eintraege);
          }
        }
      },
    ),
  );
});
