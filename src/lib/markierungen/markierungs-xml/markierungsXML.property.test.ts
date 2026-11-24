import { gesetzesreferenz } from '@/test/gesetz/gesetzFabriken';
import { markierungsEintrag } from '@/test/markierungen/markierungsFabriken';
// Property-Tests für das neue Markierungsformat: beliebig tiefe Wiederholungspfade
// und tolerante Zeichenattribute erhalten dieselbe fachliche Identität.

import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { elementstand as testElementstand } from '@/test/markierungen/elementstandFabrik';
import { expect, it } from 'vitest';
import fc from 'fast-check';
import { baueXML, parseEintraege } from './markierungs-xml.index';
import { pruefeXmlWohlgeformtheit } from '@/test/plattform/xmlPruefung';
import { normAusgangsstelle } from '@/test/markierungen/ausgangsstelleFabrik';

it('erhält tiefe Eintragsketten samt Wiederholungen und beiden Satzpositionen', () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          ebene: fc.constantFrom('nummer' as const, 'litera' as const),
          bezeichnung: fc
            .string({ minLength: 1, maxLength: 10 })
            .filter(
              (s) => s.trim() === s && [...s].every((zeichen) => zeichen.charCodeAt(0) >= 32),
            ),
          wiederholung: fc.integer({ min: 1, max: 10 }),
        }),
        { minLength: 1, maxLength: 12 },
      ),
      fc.integer({ min: 0, max: 1000 }),
      fc.option(
        fc
          .array(fc.constantFrom('§', 'Anhang', 'Art.', 'A&<>"', ''), {
            minLength: 1,
            maxLength: 3,
          })
          .filter((p) => p.some(Boolean)),
        { nil: undefined },
      ),
      (eintraege, start, praefix) => {
        const xml = baueXML(gesetzesreferenz({ kurztitel: 'BGB & Co' }), [
          markierungsEintrag({
            typ: 'unterstreichung',
            ausgangsstelle: normAusgangsstelle(
              [(praefix ?? ['§']).at(-1), '1'].filter(Boolean).join(' '),
            ),

            bezug: {
              typ: 'bezugstext' as const,
              textstelle: {
                pfad: normtextPfad({ eintraege, satz: 2, satzInEintrag: 3 }),
                zeichenbereichStart: start,
                zeichenbereichEnde: start + 5,
              },
              bezugstext: 'abcde',
            },
          }),
        ]);
        expect(() => pruefeXmlWohlgeformtheit(xml)).not.toThrow();
        const tolerant = xml.replace(
          `<zeichenbereich start="${start}" ende="${start + 5}"/>`,
          `<zeichenbereich  ende = "${start + 5}"\n start = "${start}" />`,
        );
        const parsed = parseEintraege(tolerant).eintraege[0];
        expect(parsed?.bezug.textstelle?.pfad.eintraege).toEqual(eintraege);
        expect(parsed).toMatchObject({
          ausgangsstelle: normAusgangsstelle(
            [(praefix ?? ['§']).at(-1), '1'].filter(Boolean).join(' '),
          ),
          bezug: {
            typ: 'bezugstext' as const,
            textstelle: {
              pfad: { typ: 'normtext' as const, satz: 2, satzInEintrag: 3 },
              zeichenbereichStart: start,
              zeichenbereichEnde: start + 5,
            },
            bezugstext: 'abcde',
          },
        });
      },
    ),
  );
});

it('erhält alle Verweiszielfälle einschließlich Lücken im Verweistext', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 100 }),
      fc.integer({ min: 1, max: 100 }),
      fc.constantFrom(
        'zielnorm' as const,
        'zielnormOhneElementstand' as const,
        'ganzesGesetz' as const,
      ),
      (start, laenge, typ) => {
        const gesetz = gesetzesreferenz({ kurztitel: 'GG' });
        const verweistextZeichenbereich: [number, number] = [start, start + laenge];
        const ziel: import('@/lib/markierungen/gemeinsam/gemeinsam.index').Verweisziel =
          typ === 'ganzesGesetz'
            ? { typ, gesetz, verweistextZeichenbereich }
            : typ === 'zielnorm'
              ? {
                  typ,
                  gesetz,
                  bezeichnung: 'Art. 1',

                  verweistextZeichenbereich,
                  elementstand: { textlaenge: laenge },
                }
              : { typ, gesetz, bezeichnung: '1', verweistextZeichenbereich };
        const eintrag: import('@/lib/markierungen/gemeinsam/gemeinsam.index').MarkierungsEintrag =
          markierungsEintrag({
            bezug: { typ: 'pauschal' as const, elementstand: testElementstand() },
            typ: 'verweismarkierung',
            ausgangsstelle: normAusgangsstelle('§ 1'),
            verweisinhalt: { verweistext: 'x'.repeat(start + laenge + 2), verweisziele: [ziel] },
          });
        const gelesen = parseEintraege(baueXML(gesetzesreferenz({ kurztitel: 'BGB' }), [eintrag]));
        expect(gelesen.befunde).toEqual([]);
        expect(gelesen.eintraege).toEqual([eintrag]);
      },
    ),
  );
});

it('erhält alle sechs Markierungsfälle samt leeren Inhalten im vollständigen XML-Rundlauf', async () => {
  const { unterstreichung, hervorhebung, kommentar, verweismarkierung, bezugstext, pauschal } =
    await import('@/test/markierungen/markierungsFabriken');
  const text = fc
    .array(fc.constantFrom('a', 'ß', '😀', '&', '<', '>', '"', '\n'), { maxLength: 30 })
    .map((zeichen) => zeichen.join(''));
  fc.assert(
    fc.property(text, text, fc.nat({ max: 1000 }), (bezug, inhalt, start) => {
      const konkret = bezugstext({
        textstelle: {
          pfad: normtextPfad({}),
          zeichenbereichStart: start,
          zeichenbereichEnde: start + bezug.length,
        },
        bezugstext: bezug,
      });
      const allgemein = pauschal({ textlaenge: bezug.length });
      const verweisinhalt = { verweistext: inhalt, verweisziele: [] };
      const eintraege = [
        unterstreichung({ bezug: konkret }),
        hervorhebung({ bezug: konkret }),
        kommentar({ bezug: konkret, kommentarText: inhalt }),
        kommentar({ bezug: allgemein, kommentarText: inhalt }),
        verweismarkierung({ bezug: konkret, verweisinhalt }),
        verweismarkierung({ bezug: allgemein, verweisinhalt }),
      ];
      expect(parseEintraege(baueXML(gesetzesreferenz(), eintraege))).toEqual({
        eintraege: [
          eintraege[3],
          eintraege[5],
          eintraege[0],
          eintraege[1],
          eintraege[2],
          eintraege[4],
        ],
        befunde: [],
      });
    }),
  );
});
