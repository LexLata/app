// gesetzDarstellungAuswertung.property.test.ts
//
// Property-basierter Test (fast-check) für normTextLaenge – deckt die
// Kombinatorik aus Absatz/Unterabsatz/Satz/Listen-Eintrag-Fortsetzungen ab,
// die Beispiel-Tests in gesetzDarstellungAuswertung.test.ts nur einzeln abdecken
// (siehe Mutation-Testing-Analyse im Chatverlauf). Analog zur bestehenden
// Konvention in normAufloesung.property.test.ts.

import { normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { normTextLaenge } from './gesetzDarstellungAuswertung';
import type {
  AbsatzDarstellung,
  ListenEintragDarstellung,
  NormDarstellung,
  SatzDarstellung,
} from '@/lib/domain/gesetzTypes';

// Bewusst FLACHE Listen-Einträge (kein eigenes saetze/untereintraege) – die
// mehrfache Rekursionsebene ist bereits per Beispiel-Test abgedeckt, hier
// geht es um die Kombinatorik der Längen-Arithmetik selbst.
const eintragArb: fc.Arbitrary<ListenEintragDarstellung> = fc.record({
  id: fc.uuid(),
  bezeichnung: fc.constant('1.'),
  ebene: fc.constantFrom('nummer', 'litera'),
  text: fc.string({ maxLength: 6 }),
  fortsetzung: fc.option(fc.string({ maxLength: 4 }), { nil: undefined }),
  untereintraege: fc.constant([]),
});

const satzArb: fc.Arbitrary<SatzDarstellung> = fc.record({
  id: fc.uuid(),
  text: fc.string({ maxLength: 6 }),
  fortsetzung: fc.option(fc.string({ maxLength: 4 }), { nil: undefined }),
  eintraege: fc.array(eintragArb, { maxLength: 3 }),
});

const absatzArb: fc.Arbitrary<AbsatzDarstellung> = fc.oneof(
  // Normalfall: Sätze direkt am Absatz.
  fc.record({
    id: fc.uuid(),
    saetze: fc.array(satzArb, { minLength: 1, maxLength: 3 }),
  }),
  // EU-Recht-Fall: Sätze in Unterabsätzen, abs.saetze leer.
  fc.record({
    id: fc.uuid(),
    saetze: fc.constant([] as SatzDarstellung[]),
    unterabsaetze: fc.array(
      fc.record({
        id: fc.uuid(),
        bezeichnung: fc.integer({ min: 1, max: 9 }).map(String),
        saetze: fc.array(satzArb, { minLength: 1, maxLength: 2 }),
      }),
      { minLength: 1, maxLength: 2 },
    ),
  }),
);

function erwarteteLaenge(absaetze: AbsatzDarstellung[]): number {
  let laenge = 0;
  const zaehleEintrag = (e: ListenEintragDarstellung) => {
    laenge += e.text.length + (e.fortsetzung ?? '').length;
  };
  const zaehleSatz = (s: SatzDarstellung) => {
    laenge += s.text.length + (s.fortsetzung ?? '').length;
    for (const e of s.eintraege) zaehleEintrag(e);
  };
  for (const abs of absaetze) {
    if (abs.unterabsaetze) {
      for (const ua of abs.unterabsaetze) for (const s of ua.saetze) zaehleSatz(s);
    } else {
      for (const s of abs.saetze) zaehleSatz(s);
    }
  }
  return laenge;
}

describe('Property: normTextLaenge', () => {
  it('entspricht für beliebige Absatz-/Unterabsatz-/Satz-/Eintrag-Kombinationen der unabhängig berechneten Summe', () => {
    fc.assert(
      fc.property(fc.array(absatzArb, { minLength: 0, maxLength: 4 }), (absaetze) => {
        const norm: NormDarstellung = normaleNorm({
          id: 'n1',
          xmlId: 'n1',
          bezeichnung: '§ 1',
          absaetze,
        });
        expect(normTextLaenge(norm)).toBe(erwarteteLaenge(absaetze));
      }),
    );
  });
});
