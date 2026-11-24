// gesetzTypes.normarten.test.ts
// Der Compiler schließt unvollständige und widersprüchliche Normarten aus.
import { normaleNorm, gliederungsartikel, erwaegungsgrund } from '@/test/gesetz/gesetzFabriken';
import { expect, it } from 'vitest';
import type { NormDarstellung } from './gesetzTypes';

it('unterscheidet jede Normart auch mit Wegfallstatus', () => {
  for (const status of [undefined, 'weggefallen'] as const) {
    expect(normaleNorm({ status }).art).toBe('normal');
    expect(gliederungsartikel({ status }).art).toBe('gliederungsartikel');
    expect(erwaegungsgrund({ status }).art).toBe('erwaegungsgrund');
  }
});

const basis = { id: 'n', xmlId: 'n', bezeichnung: '1', absaetze: [] };
// @ts-expect-error Ein Erwägungsgrund trägt keine Gliederungsebene.
const widerspruch: NormDarstellung = { ...basis, art: 'erwaegungsgrund', gliederungsEbene: 1 };
// @ts-expect-error Ein Gliederungsartikel legt überschriftartiges Verhalten ausdrücklich fest.
const unvollstaendig: NormDarstellung = {
  ...basis,
  art: 'gliederungsartikel',
  gliederungsEbene: 1,
};
// @ts-expect-error Jede Norm benennt ihre Normart.
const ohneArt: NormDarstellung = basis;
void [widerspruch, unvollstaendig, ohneArt];
