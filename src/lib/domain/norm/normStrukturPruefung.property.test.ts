// normStrukturPruefung.property.test.ts
//
// Property-basierte Tests (fast-check) für normStrukturPruefung.ts.
//
// Hintergrund (siehe Mutationstest-Analyse im Chatverlauf): mehrere
// überlebende Mutanten in eintraegeImKontext/pruefeSatz/
// pruefeZusatzangabeMitKette wurden erst durch handgeschriebene Beispiele mit
// bewusst konstruierter Doppeldeutigkeit sichtbar (derselbe Wert existiert an
// zwei Stellen im Baum, nur eine davon ist im gegebenen Kontext korrekt
// erreichbar). Statt diese Fälle einzeln von Hand zu pflegen, prüft dieser
// Test die zugrunde liegende Invariante generalisiert:
//
//   Eine auf Absatz/Unterabsatz/Satz/Nummer gescopte Suche darf NIEMALS
//   einen Treffer aus einem anderen Geschwister-Ast (anderer Satz im
//   selben Absatz, anderer Unterabsatz, andere Nummer im selben Satz)
//   liefern – unabhängig davon, welche Werte dort zufällig vorkommen.
//
// Das deckt die gesamte in der Analyse gefundene Fehlerklasse
// "Kontextverlust wird durch Zufallstreffer maskiert" ab, statt nur die
// konkret gefundenen Einzelfälle.

import { normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { pruefeZusatzangabe } from '@/lib/domain/norm/normStrukturPruefung';
import type {
  AbsatzDarstellung,
  ListenEintragDarstellung,
  NormDarstellung,
  SatzDarstellung,
  UnterabsatzDarstellung,
} from '@/lib/domain/gesetzTypes';

// ---------------------------------------------------------------------------
// Minimale, kolokierte Test-Factories – bewusst nicht aus
// normStrukturPruefung.test.ts importiert (Testdateien importieren keine
// anderen Testdateien), aber inhaltlich identisch zu deren Konvention.
// ---------------------------------------------------------------------------

let idZaehler = 0;
function naechsteId(): string {
  idZaehler += 1;
  return `id-${idZaehler}`;
}

function nummerEintrag(wert: number): ListenEintragDarstellung {
  return {
    id: naechsteId(),
    bezeichnung: `${wert}.`,
    ebene: 'nummer',
    text: `${wert}.`,
    untereintraege: [],
  };
}

function literaEintrag(buchstabe: string): ListenEintragDarstellung {
  return {
    id: naechsteId(),
    bezeichnung: `${buchstabe})`,
    ebene: 'litera',
    text: `${buchstabe})`,
    untereintraege: [],
  };
}

function satz(zahl: number, eintraege: ListenEintragDarstellung[]): SatzDarstellung {
  return { id: naechsteId(), zahl, text: `Satz ${zahl}`, eintraege };
}

function absatz(
  bezeichnung: string,
  saetze: SatzDarstellung[] = [],
  unterabsaetze?: UnterabsatzDarstellung[],
): AbsatzDarstellung {
  return { id: naechsteId(), bezeichnung, saetze: unterabsaetze ? [] : saetze, unterabsaetze };
}

function unterabsatz(bezeichnung: string, saetze: SatzDarstellung[]): UnterabsatzDarstellung {
  return { id: naechsteId(), bezeichnung, saetze };
}

function norm(absaetze: AbsatzDarstellung[]): NormDarstellung {
  return normaleNorm({ id: naechsteId(), xmlId: naechsteId(), bezeichnung: '§ 1', absaetze });
}

// Ein Pool disjunkter Zahlen, in zwei nicht-leere Hälften gesplittet – Basis
// für "zwei Geschwister-Äste mit garantiert unterschiedlichem Inhalt".
const zahlenPoolArb = fc
  .uniqueArray(fc.integer({ min: 1, max: 80 }), { minLength: 2, maxLength: 16 })
  .map((pool) => {
    const mid = Math.max(1, Math.floor(pool.length / 2));
    return [pool.slice(0, mid), pool.slice(mid)] as const;
  })
  .filter(([a, b]) => a.length > 0 && b.length > 0);

const buchstabenPoolArb = fc
  .uniqueArray(fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'), {
    minLength: 2,
    maxLength: 8,
  })
  .map((pool) => {
    const mid = Math.max(1, Math.floor(pool.length / 2));
    return [pool.slice(0, mid), pool.slice(mid)] as const;
  })
  .filter(([a, b]) => a.length > 0 && b.length > 0);

// ---------------------------------------------------------------------------
// Property 1: Satz-Scoping innerhalb eines Absatzes (verallgemeinert die in
// der Analyse gefundenen Lücken rund um pruefeSatz/eintraegeImKontext bei
// {absatz, satz}-Kontext).
// ---------------------------------------------------------------------------

describe('Property: Nummer-Suche scopet korrekt auf einen Satz, kein Leck aus dem Geschwister-Satz', () => {
  it('ein Wert aus Satz 1 wird nie unter Satz 2 gefunden und umgekehrt', () => {
    fc.assert(
      fc.property(zahlenPoolArb, fc.integer({ min: 1, max: 90 }), (pools, gesuchtRoh) => {
        const [satz1Werte, satz2Werte] = pools;
        const n = norm([
          absatz('(1)', [
            satz(1, satz1Werte.map(nummerEintrag)),
            satz(2, satz2Werte.map(nummerEintrag)),
          ]),
        ]);
        const gesucht = String(gesuchtRoh);
        const erwartetSatz1 = satz1Werte.includes(gesuchtRoh);
        const erwartetSatz2 = satz2Werte.includes(gesuchtRoh);

        expect(pruefeZusatzangabe(n, 'nummer', gesucht, { absatz: '1', satz: '1' })).toBe(
          erwartetSatz1,
        );
        expect(pruefeZusatzangabe(n, 'nummer', gesucht, { absatz: '1', satz: '2' })).toBe(
          erwartetSatz2,
        );
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Satz-Scoping innerhalb eines Unterabsatzes – verallgemeinert
// die Kontextverlust-Lücke aus eintraegeImKontext (Unterabsatz-Zweig) sowie
// den entsprechenden pruefeZusatzangabeMitKette-Fall.
// ---------------------------------------------------------------------------

describe('Property: Nummer-Suche scopet korrekt auf einen Unterabsatz, kein Leck aus dem Geschwister-Unterabsatz', () => {
  it('ein Wert aus Unterabsatz 1 wird nie unter Unterabsatz 2 gefunden und umgekehrt', () => {
    fc.assert(
      fc.property(zahlenPoolArb, fc.integer({ min: 1, max: 90 }), (pools, gesuchtRoh) => {
        const [uabs1Werte, uabs2Werte] = pools;
        const n = norm([
          absatz(
            '(1)',
            [],
            [
              unterabsatz('[1]', [satz(1, uabs1Werte.map(nummerEintrag))]),
              unterabsatz('[2]', [satz(1, uabs2Werte.map(nummerEintrag))]),
            ],
          ),
        ]);
        const gesucht = String(gesuchtRoh);
        const erwartetUabs1 = uabs1Werte.includes(gesuchtRoh);
        const erwartetUabs2 = uabs2Werte.includes(gesuchtRoh);

        expect(pruefeZusatzangabe(n, 'nummer', gesucht, { absatz: '1', unterabsatz: '1' })).toBe(
          erwartetUabs1,
        );
        expect(pruefeZusatzangabe(n, 'nummer', gesucht, { absatz: '1', unterabsatz: '2' })).toBe(
          erwartetUabs2,
        );
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Litera-Scoping auf eine Nummer – verallgemeinert die
// Kontextverlust-Lücke im 'nummer'-Zweig von pruefeZusatzangabeMitKette (siehe
// Test "Kontextverlust-Erkennung: nummer-Kontext bleibt beim litera-Schritt
// erhalten" in normStrukturPruefung.test.ts).
// ---------------------------------------------------------------------------

describe('Property: Litera-Suche scopet korrekt auf eine Nummer, kein Leck aus der Geschwister-Nummer', () => {
  it('ein Buchstabe aus Nr. 1 wird nie unter Nr. 2 gefunden und umgekehrt', () => {
    fc.assert(
      fc.property(
        buchstabenPoolArb,
        fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'),
        (pools, gesucht) => {
          const [nr1Buchstaben, nr2Buchstaben] = pools;
          const n = norm([
            absatz('(1)', [
              satz(1, [
                { ...nummerEintrag(1), untereintraege: nr1Buchstaben.map(literaEintrag) },
                { ...nummerEintrag(2), untereintraege: nr2Buchstaben.map(literaEintrag) },
              ]),
            ]),
          ]);
          const erwartetNr1 = nr1Buchstaben.includes(gesucht);
          const erwartetNr2 = nr2Buchstaben.includes(gesucht);

          expect(
            pruefeZusatzangabe(n, 'litera', gesucht, { absatz: '1', satz: '1', nummer: '1' }),
          ).toBe(erwartetNr1);
          expect(
            pruefeZusatzangabe(n, 'litera', gesucht, { absatz: '1', satz: '1', nummer: '2' }),
          ).toBe(erwartetNr2);
        },
      ),
    );
  });
});
