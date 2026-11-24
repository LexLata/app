// Prüft Dokumentreihenfolge und bevorzugte speicherbare Ziele über das öffentliche Norminterface.
import { expect, it } from 'vitest';
import fc from 'fast-check';
import { gesetzDarstellung, normaleNorm } from '@/test/gesetz/gesetzFabriken';
import { findeFavoritfaehigeNorm } from './norm.index';

it('überspringt Präambel und Überschrift zugunsten der ersten favoritenfähigen Norm', () => {
  const praambel = {
    typ: 'norm' as const,
    data: normaleNorm({ xmlId: 'p', bezeichnung: 'Präambel' }),
  };
  const kopf = {
    typ: 'ueberschrift' as const,
    data: {
      id: 'u',
      xmlId: 'ueberschrift:001',
      gliederungskennzahl: '001',
      ebene: 1,
      bezeichnung: 'Teil 1',
    },
  };
  const artikel = {
    typ: 'norm' as const,
    data: normaleNorm({ xmlId: 'a1', bezeichnung: 'Art. 1' }),
  };
  for (const erstes of [praambel, kopf]) {
    const gesetz = gesetzDarstellung({ elemente: [erstes, artikel] });
    expect(findeFavoritfaehigeNorm(gesetz)).toBe('a1');
    expect(findeFavoritfaehigeNorm(gesetz, erstes.data.xmlId)).toBe('a1');
  }
  expect(findeFavoritfaehigeNorm(gesetzDarstellung({ elemente: [praambel] }))).toBeUndefined();
});
it('wählt bei beliebiger Dokumentreihenfolge nur gültige Normen und erhält gültige bevorzugte Ziele', () => {
  fc.assert(
    fc.property(
      fc.uniqueArray(fc.integer({ min: 1, max: 999 }), { maxLength: 15 }),
      fc.boolean(),
      (zahlen, praambelVorne) => {
        const elemente = zahlen.map((zahl) => ({
          typ: 'norm' as const,
          data: normaleNorm({ xmlId: `a${zahl}`, bezeichnung: `Art. ${zahl}` }),
        }));
        if (praambelVorne)
          elemente.unshift({
            typ: 'norm',
            data: normaleNorm({ xmlId: 'p', bezeichnung: 'Präambel' }),
          });
        const gesetz = gesetzDarstellung({ elemente });
        const erste = zahlen[0];
        expect(findeFavoritfaehigeNorm(gesetz)).toBe(erste === undefined ? undefined : `a${erste}`);
        for (const zahl of zahlen)
          expect(findeFavoritfaehigeNorm(gesetz, `a${zahl}`)).toBe(`a${zahl}`);
      },
    ),
  );
});
