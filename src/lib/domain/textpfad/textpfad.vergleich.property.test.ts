// textpfad.vergleich.property.test.ts
//
// Property-basierter Test (fast-check) für pfadGleich() – gezielt gegen die
// Mutation-Testing-Analyse im Chatverlauf: pfadGleich vergleicht mehrere
// Felder über `feld ?? undefined`. Ein `??`→`&&`-Tippfehler wäre für
// FALSY-Werte (0, '', undefined) nicht sichtbar (`x && undefined` verhält
// sich dort identisch zu `x ?? undefined`), fällt aber bei TRUTHY Werten
// (z.B. unterabsatz: '[2]') durch: `'2' && undefined` ergibt `undefined` statt `'2'`.
// Einzelbeispiel-Tests mit einem festen Wert würden das nur zufällig
// aufdecken – die Property prüft stattdessen über den ganzen Wertebereich
// (inkl. 0 und undefined), dass pfadGleich für jedes betroffene Feld exakt
// der strukturellen Gleichheit entspricht.

import { normtextPfad } from '@/test/gesetz/textpfadFabrik';
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { pfadGleich, vergleicheTextpfad } from '@/lib/domain/textpfad/textpfad.vergleich';

describe('Property: pfadGleich – unterabsatz/satz/satzInEintrag', () => {
  it('vergleicht Unterabsätze exakt und fehlende Satzschritte wie Satz 1', () => {
    const wert = fc.oneof(fc.constant(undefined), fc.integer({ min: 0, max: 20 }));
    fc.assert(
      fc.property(wert, wert, (a, b) => {
        expect(
          pfadGleich(
            normtextPfad({ unterabsatz: a === undefined ? undefined : String(a) }),
            normtextPfad({ unterabsatz: b === undefined ? undefined : String(b) }),
          ),
        ).toBe(a === b);
        expect(pfadGleich(normtextPfad({ satz: a }), normtextPfad({ satz: b }))).toBe(
          (a ?? 1) === (b ?? 1),
        );
        expect(
          pfadGleich(
            normtextPfad({ eintraege: [{ ebene: 'nummer', bezeichnung: '1' }], satzInEintrag: a }),
            normtextPfad({ eintraege: [{ ebene: 'nummer', bezeichnung: '1' }], satzInEintrag: b }),
          ),
        ).toBe((a ?? 1) === (b ?? 1));
      }),
    );
  });
});

it('ordnet Unterabsatz-Bezeichnungen numerisch, fehlenden Bezug vor jedem vorhandenen', () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 200 }), fc.integer({ min: 1, max: 200 }), (a, b) => {
      expect(
        Math.sign(
          vergleicheTextpfad(
            normtextPfad({ unterabsatz: `[${a}]` }),
            normtextPfad({ unterabsatz: `[${b}]` }),
          ),
        ),
      ).toBe(Math.sign(a - b));
      expect(
        vergleicheTextpfad(normtextPfad({}), normtextPfad({ unterabsatz: `[${a}]` })),
      ).toBeLessThan(0);
      expect(
        vergleicheTextpfad(normtextPfad({ unterabsatz: `[${a}]` }), normtextPfad({})),
      ).toBeGreaterThan(0);
    }),
  );
  expect(
    vergleicheTextpfad(normtextPfad({ unterabsatz: '[2]' }), normtextPfad({ unterabsatz: '[10]' })),
  ).toBeLessThan(0);
  expect(
    vergleicheTextpfad(normtextPfad({ unterabsatz: '[2]' }), normtextPfad({ unterabsatz: '[2]' })),
  ).toBe(0);
  expect(vergleicheTextpfad(normtextPfad({}), normtextPfad({ unterabsatz: '[0]' }))).toBeLessThan(
    0,
  );
});
