import { gesetzMitNormen, gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// markierungskonfliktPruefung.property.test.ts
//
// Property-basierter Test (fast-check) für das Lesen von Zeichengrenzen: eine kombinatorische
// Grenzfall-Prüfung (XML-Grenzen unabhängig optional), die Beispiel-Tests
// nur unvollständig abdecken würden (siehe Mutation-Testing-Analyse im
// Chatverlauf, mutant 3/4/6 – dieselbe Logik war vor der Extraktion
// zusätzlich in identitaetsSchluessel/pruefeEigenenKonflikt dupliziert,
// siehe mutant 137/138/140 bzw. 158/159/161). Analog zur bestehenden
// Konvention in normAufloesung.property.test.ts.

import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { zielnormTestdaten } from '@/test/markierungen/verweiszielFabrik';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import type { MarkierungsEintrag, Verweisziel } from './markierungSpeicher.types';
import { parseEintraege } from '@/lib/markierungen/markierungs-xml/markierungs-xml.index';
import { berechneZielKonflikte, identitaetsSchluessel } from './markierungskonfliktPruefung';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

describe('Property: Zeichengrenzen beim Lesen', () => {
  it('meldet unabhängig fehlende Zeichengrenzen als Befund', () => {
    fc.assert(
      fc.property(
        fc.option(fc.nat(), { nil: undefined }),
        fc.option(fc.nat(), { nil: undefined }),
        (start, ende) => {
          const zeichenbereich = `${start === undefined ? '' : ` start="${start}"`}${ende === undefined ? '' : ` ende="${ende}"`}`;
          const [gelesen] = parseEintraege(
            `<markierungen><infos><gesetz normgeber="de-bund">TestG</gesetz></infos><inhalt><kommentar><bezeichnung>§ 1</bezeichnung><textstelle><absatz>(1)</absatz><zeichenbereich${zeichenbereich}/></textstelle><bezugstext>Text</bezugstext><kommentartext>Kommentar</kommentartext></kommentar></inhalt></markierungen>`,
          ).eintraege;
          const vollstaendig = start !== undefined && ende !== undefined && start <= ende;
          if (vollstaendig) expect(gelesen?.bezug.typ).toBe('bezugstext');
          else expect(gelesen).toBeUndefined();
        },
      ),
    );
  });
});

it('unterschiedliche Ausgangspräfixe trennen alle generierten Textstellen', () => {
  fc.assert(
    fc.property(fc.nat(), fc.nat(), fc.string(), (start, laenge, bezeichnung) => {
      const basis = markierungsEintrag({
        typ: 'unterstreichung' as const,
        ausgangsstelle: normAusgangsstelle(['§', bezeichnung].filter(Boolean).join(' ')),
        bezug: {
          typ: 'bezugstext' as const,
          textstelle: {
            pfad: normtextPfad({}),
            zeichenbereichStart: start,
            zeichenbereichEnde: start + laenge + 1,
          },
          bezugstext: '',
        },
      });
      const paragraph = identitaetsSchluessel(
        markierungsEintrag({
          ...basis,
          ausgangsstelle: normAusgangsstelle(['§', bezeichnung].filter(Boolean).join(' ')),
        }),
      );
      const anhang = identitaetsSchluessel(
        markierungsEintrag({
          ...basis,
          ausgangsstelle: normAusgangsstelle(['Anhang', bezeichnung].filter(Boolean).join(' ')),
        }),
      );
      expect(paragraph).not.toBe(anhang);
      expect(
        identitaetsSchluessel(
          markierungsEintrag({
            ...basis,
            ausgangsstelle: normAusgangsstelle(['', bezeichnung].filter(Boolean).join(' ')),
          }),
        ),
      ).not.toBe(identitaetsSchluessel(basis));
    }),
  );
});

it('gruppiert beliebige Zielnormlisten verlustfrei nach Gesetz und Befund in stabiler Reihenfolge', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          gesetz: fc.constantFrom('GG', 'BGB', 'fehlt'),
          bezeichnung: fc.constantFrom('10', '5', '999'),
          verknuepft: fc.boolean(),
          passt: fc.boolean(),
        }),
      ),
      (liste) => {
        const gesetze: GesetzDarstellung[] = ['GG', 'BGB'].map((kurztitel) =>
          gesetzMitNormen(['Art. 10', 'Art. 5', 'Art. 5'], {
            kurztitel,
            langtitel: kurztitel,
            hatGliederungsartikel: false,
          }),
        );
        const verweisziele = liste.map((z): Verweisziel =>
          zielnormTestdaten({
            bezeichnung: `Art. ${z.bezeichnung}`,
            gesetz: gesetzesreferenz({ kurztitel: z.gesetz }),
            verweistextZeichenbereich: [0, 0],
            ...(z.verknuepft ? { elementstand: { textlaenge: z.passt ? 0 : 1 } } : {}),
          }),
        );
        const eintrag: MarkierungsEintrag = markierungsEintrag({
          bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
          typ: 'verweismarkierung',
          ausgangsstelle: normAusgangsstelle('§ 1'),
          verweisinhalt: { verweistext: '', verweisziele },
        });
        const result = berechneZielKonflikte(eintrag, gesetze[0]!, gesetze);
        expect(berechneZielKonflikte(eintrag, gesetze[0]!, gesetze)).toEqual(result);
        expect(new Set(result.map((k) => `${k.gesetz.kurztitel}:${k.typ}`)).size).toBe(
          result.length,
        );
        for (const name of ['GG', 'BGB', 'fehlt']) {
          const konflikte = result.filter((k) => k.gesetz.kurztitel === name);
          if (name === 'fehlt')
            expect(konflikte.every((k) => k.typ === 'zielGesetzFehlt')).toBe(true);
          else
            expect(konflikte.map((k) => k.typ)).toEqual(
              ['zielNormUnpassend', 'zielNormFehlt'].filter((typ) =>
                konflikte.some((k) => k.typ === typ),
              ),
            );
          const erwartet = liste
            .filter(
              (z) =>
                z.gesetz === name &&
                z.verknuepft &&
                (name === 'fehlt' || z.bezeichnung !== '10' || !z.passt),
            )
            .map((z) => `Art. ${z.bezeichnung}`)
            .sort();
          expect(
            konflikte.flatMap((k) => k.bezeichnungen.map((z) => z.bezeichnung)).sort(),
          ).toEqual(erwartet);
          for (const k of konflikte) {
            expect(
              k.bezeichnungen.every((z) =>
                k.typ === 'zielGesetzFehlt'
                  ? z.befund === undefined
                  : k.typ === 'zielNormUnpassend'
                    ? z.befund === 'unpassend'
                    : z.befund === 'fehlt' || z.befund === 'nichtEindeutig',
              ),
            ).toBe(true);
          }
        }
        const reihenfolge = [...new Set(liste.map((z) => z.gesetz))].filter((name) =>
          result.some((k) => k.gesetz.kurztitel === name),
        );
        expect([...new Set(result.map((k) => k.gesetz.kurztitel))]).toEqual(reihenfolge);
      },
    ),
  );
});
