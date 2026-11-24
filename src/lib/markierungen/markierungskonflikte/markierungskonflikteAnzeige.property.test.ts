import { gesetzDarstellung, gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// markierungskonflikteAnzeige.property.test.ts
//
// Property-basierter Test (fast-check) für verifiziereKonfliktEintraege aus
// markierungskonflikteAnzeige.ts – Ergänzung zu markierungskonflikteAnzeige.test.ts
// nach der Mutation-Testing-Analyse (siehe Chatverlauf). Analog zur
// bestehenden Konvention in normAufloesung.property.test.ts: property-based
// Tests nur dort, wo eine klare, kompakte Invariante existiert.
//
// Geprüfte Invariante: der "unveraendert"-Vergleich (zielKonflikte.length ===
// alt.zielKonflikte.length && zielKonflikte.every(z => alt.zielKonflikte.
// some(...))) ist bewusst ein Multiset-Vergleich über {gesetz, typ}-Paare,
// KEIN Array-Vergleich – die Reihenfolge von alt.zielKonflikte (wie sie z.B.
// beim Parsen von markierungskonflikte.xml anfällt) darf das Ergebnis von
// "veraendert" nicht beeinflussen. Ein einzelnes Beispiel (siehe
// markierungskonflikteAnzeige.test.ts) deckt das nur punktuell ab – zufällige
// Permutationen über unterschiedlich viele Ziele decken es robuster ab und
// killen dabei gezielt die length-/every-Mutanten aus der Mutation-Testing-
// Analyse (IDs 103, 106), statt nur ein einzelnes Beispiel dagegenzuhalten.

import { bereichPfad } from '@/test/gesetz/textpfadFabrik';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { verweisziel } from '@/test/markierungen/verweiszielFabrik';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { verifiziereKonfliktEintraege } from './markierungskonflikteAnzeige.verifizieren';
import type { MarkierungsEintrag, Verweisziel } from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import {
  bestimmeIdentifizierendeFelder,
  identitaetsSchluessel,
} from '@/lib/markierungen/gemeinsam/gemeinsam.index';
import type { GesetzDarstellung, NormDarstellung } from '@/lib/domain/gesetzTypes';
import type { GeparsterKonfliktEintrag } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import { erstelleGespeicherteGesetzKonflikte } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

function gesetz(kurztitel: string, normen: NormDarstellung[] = []): GesetzDarstellung {
  return gesetzDarstellung({
    kurztitel,
    langtitel: kurztitel,
    hatGliederungsartikel: false,
    elemente: normen.map((n) => ({ typ: 'norm' as const, data: n })),
  });
}

// Baut einen Verweis-Eintrag, der auf jedes der übergebenen (fiktiven,
// niemals in alleGesetze enthaltenen) Zielgesetze EIN Zitat abgibt – jedes
// Ziel wird dadurch deterministisch zu zielGesetzFehlt (Gesetz fehlt
// komplett), siehe verarbeiteZitatZiel in markierungskonfliktPruefung.ts.
function verweisAufFehlendeGesetze(zielKurztitel: string[]): MarkierungsEintrag {
  const verweistext = zielKurztitel.join(' ');
  let position = 0;
  const verweisziele: Verweisziel[] = zielKurztitel.map((kt, i) => {
    const bezeichnung = String(i + 1);
    const start = position;
    position += bezeichnung.length + 1;
    return verweisziel({
      typ: 'zielnorm',
      gesetz: gesetzesreferenz({ kurztitel: kt }),
      bezeichnung,
      verweistextZeichenbereich: [start, start + bezeichnung.length],
      elementstand: { textlaenge: 1 },
    });
  });
  return markierungsEintrag({
    bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
    typ: 'verweismarkierung',
    ausgangsstelle: normAusgangsstelle('§ 433'),
    verweisinhalt: { verweistext, verweisziele },
  }) as MarkierungsEintrag;
}

// Kurztitel-Arbitrary: kurze, eindeutige Buchstaben-Strings, die NICHT als
// echtes Gesetz existieren: Das Ausgangsgesetz enthält Klammern und liegt
// damit außerhalb dieses Buchstaben-Generators; kein generiertes Ziel entfällt.
function fehlendeZielKonflikte(kurztitel: string[]): GeparsterKonfliktEintrag['zielKonflikte'] {
  // Ein Gesetzskonflikt pro vollständiger Identität; alle generierten
  // Schreibweisen bleiben in den Live-Zitaten erhalten.
  return [
    ...new Map(
      kurztitel.map((kt) => [
        gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: kt })),
        { gesetz: gesetzesreferenz({ kurztitel: kt }), typ: 'zielGesetzFehlt' as const },
      ]),
    ).values(),
  ];
}

const ausgangsgesetz = 'BGB (vorhanden)';
const kurztitelArb = fc.string({ minLength: 2, maxLength: 5 }).filter((s) => /^[A-Za-z]+$/.test(s));

describe('Property: verifiziereKonfliktEintraege – Reihenfolge von zielKonflikte', () => {
  it('erkennt ein inzwischen vorhandenes Zielgesetz als veränderten Konflikt', () => {
    const eigenesGesetz = gesetz('BGB');
    const live = verweisAufFehlendeGesetze(['BGB', 'AA']);
    const alt: GeparsterKonfliktEintrag = {
      eigenerKonflikt: undefined,
      zielKonflikte: [
        { gesetz: gesetzesreferenz({ kurztitel: 'AA' }), typ: 'zielGesetzFehlt' },
        { gesetz: gesetzesreferenz({ kurztitel: 'BGB' }), typ: 'zielGesetzFehlt' },
      ],
      schluessel: identitaetsSchluessel(live),
    };
    const result = verifiziereKonfliktEintraege(
      [alt],
      [live],
      eigenesGesetz,
      [eigenesGesetz],
      gesetzesreferenz({ kurztitel: 'BGB' }),
      new Set(),
    );
    expect(result.veraendert).toBe(true);
  });

  it('MUTATIONSTEST: Permutation von alt.zielKonflikte ändert "veraendert" nicht, solange dieselben (gesetz, typ)-Paare vorliegen', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(kurztitelArb, { minLength: 1, maxLength: 6 }).chain((zielKurztitel) =>
          fc.tuple(
            fc.constant(zielKurztitel),
            fc.shuffledSubarray(zielKurztitel, {
              minLength: zielKurztitel.length,
              maxLength: zielKurztitel.length,
            }),
          ),
        ),
        ([zielKurztitel, permutiert]) => {
          const eigenesGesetz = gesetz(ausgangsgesetz);
          const live = verweisAufFehlendeGesetze(zielKurztitel);
          const alt: GeparsterKonfliktEintrag = {
            eigenerKonflikt: undefined,
            zielKonflikte: fehlendeZielKonflikte(permutiert),
            schluessel: identitaetsSchluessel(live),
          };
          const result = verifiziereKonfliktEintraege(
            [alt],
            [live],
            eigenesGesetz,
            [eigenesGesetz],
            gesetzesreferenz({ kurztitel: ausgangsgesetz }),
            new Set(),
          );
          expect(result.veraendert).toBe(false);
        },
      ),
    );
  });

  it('MUTATIONSTEST: fehlt EIN bekanntes Ziel im aktuellen Verweis, wird das trotz sonst identischer Ziele als "verändert" erkannt (Längen-Änderung)', () => {
    fc.assert(
      fc.property(fc.uniqueArray(kurztitelArb, { minLength: 2, maxLength: 6 }), (zielKurztitel) => {
        const eigenesGesetz = gesetz(ausgangsgesetz);
        // live zitiert absichtlich EIN Ziel weniger als alt kannte:
        const entfernt = gesetzesreferenzSchluessel(
          gesetzesreferenz({ kurztitel: zielKurztitel[0]! }),
        );
        const live = verweisAufFehlendeGesetze(
          zielKurztitel.filter(
            (kt) => gesetzesreferenzSchluessel(gesetzesreferenz({ kurztitel: kt })) !== entfernt,
          ),
        );
        const alt: GeparsterKonfliktEintrag = {
          eigenerKonflikt: undefined,
          zielKonflikte: fehlendeZielKonflikte(zielKurztitel),
          schluessel: identitaetsSchluessel(live),
        };
        const result = verifiziereKonfliktEintraege(
          [alt],
          [live],
          eigenesGesetz,
          [eigenesGesetz],
          gesetzesreferenz({ kurztitel: ausgangsgesetz }),
          new Set(),
        );
        expect(result.veraendert).toBe(true);
      }),
    );
  });
});

it('behandelt das fast-check-Gegenbeispiel nn/nN als ein Zielgesetz', () => {
  const eigenes = gesetz(ausgangsgesetz);
  const live = verweisAufFehlendeGesetze(['nn', 'nN']);
  const alt: GeparsterKonfliktEintrag = {
    eigenerKonflikt: undefined,
    zielKonflikte: fehlendeZielKonflikte(['nN', 'nn']),
    schluessel: identitaetsSchluessel(live),
  };
  const ergebnis = verifiziereKonfliktEintraege(
    [alt],
    [live],
    eigenes,
    [eigenes],
    eigenes,
    new Set(),
  );
  expect(ergebnis.veraendert).toBe(false);
  expect(ergebnis.neueEintraege[0]?.zielKonflikte).toHaveLength(1);
});

it('gespeicherte Darstellungsfelder und Identität überstehen XML-Maskierung unabhängig von Live-Daten', () => {
  const text = fc
    .array(fc.constantFrom('a', '1', '|', '&', '<', '>', '"', "'", '§'), {
      minLength: 1,
      maxLength: 30,
    })
    .map((zeichen) => zeichen.join(''));
  fc.assert(
    fc.property(
      text,
      text,
      fc.constantFrom('unterstreichung', 'hervorhebung', 'kommentar', 'verweismarkierung'),
      (bezeichnung, identitaet, typ) => {
        const original: MarkierungsEintrag = markierungsEintrag({
          typ,
          ausgangsstelle: normAusgangsstelle(['§', bezeichnung].filter(Boolean).join(' ')),

          ...(typ === 'kommentar'
            ? { kommentarText: identitaet }
            : typ === 'verweismarkierung'
              ? { verweisinhalt: { verweistext: identitaet, verweisziele: [] } }
              : {
                  bezug: {
                    typ: 'bezugstext' as const,
                    textstelle: {
                      pfad: bereichPfad('nichtamtlicherTitel' as const),
                      zeichenbereichStart: 1,
                      zeichenbereichEnde: 4,
                    },
                    bezugstext: '',
                  },
                }),
        }) as MarkierungsEintrag;
        const gespeichert = erstelleGespeicherteGesetzKonflikte({
          gesetz: { kurztitel: 'Gleich', normgeber: 'de-bund' },
          eintraege: [
            {
              ausgangsstelle: original.ausgangsstelle,

              markierungstyp: original.typ,
              eigenerKonflikt: 'bezugstextFehltOderUnpassend',
              zielKonflikte: [
                { gesetz: { kurztitel: 'Gleich', normgeber: 'de-bw' }, typ: 'zielNormUnpassend' },
              ],
              ...bestimmeIdentifizierendeFelder(original),
            },
          ],
        });
        expect(gespeichert.eintraege).toEqual([
          {
            ausgangsstelle: normAusgangsstelle(
              [['§'].at(-1), bezeichnung].filter(Boolean).join(' '),
            ),

            markierungstyp: typ,
            bereich: original.bezug.textstelle?.pfad.bereich,
            eigenerKonflikt: 'bezugstextFehltOderUnpassend',
            zielKonflikte: [
              { gesetz: { kurztitel: 'Gleich', normgeber: 'de-bw' }, typ: 'zielNormUnpassend' },
            ],
            schluessel: identitaetsSchluessel(original),
          },
        ]);
      },
    ),
  );
});
