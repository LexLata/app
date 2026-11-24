// Prüft volle Ausgangsbezeichnungen und ihre tolerante, präfixgetreue Auflösung.
import { describe, expect, it } from 'vitest';
import { gesetzDarstellung, normDarstellung } from '@/test/gesetz/gesetzFabriken';
import type { DarstellungsElement } from '@/lib/domain/gesetzTypes';
import { bildeAusgangskennung, loeseNormAusgangsstelleAuf } from './normAusgangsstelle';
import { gleicheNormBezeichnung } from './verweisAufloesung';

function element(bezeichnung: string, xmlId = 'norm'): DarstellungsElement {
  return { typ: 'norm', data: normDarstellung({ bezeichnung, xmlId }) };
}
describe('volle Ausgangsbezeichnung', () => {
  it.each(['§ 433', '§3', 'Anhang 1'])('bewahrt die Quellschreibweise %s', (bezeichnung) => {
    const norm = element(bezeichnung);
    expect(bildeAusgangskennung(gesetzDarstellung({ elemente: [norm] }), norm)).toEqual({
      typ: 'norm',
      bezeichnung,
    });
  });
  it.each([
    ['§ 433', '§ 433', true],
    ['§3', '§ 3', true],
    ['Art. 1', 'Artikel 1', true],
    ['art. 229 § 3', 'Art. 229 § 3', true],
    ['§ 12a', '§ 12A', true],
    ['§§ 3 bis 6', '§§ 3 bis 6', true],
    ['§ 1', 'Art. 1', false],
    ['§ 1', 'Anhang 1', false],
    ['433', '§ 433', false],
    ['Art. 229 § 3', 'Art. 230 § 3', false],
    ['  Präambel   Text ', 'Präambel Text', true],
  ])('vergleicht %s und %s zu %s', (a, b, erwartet) => {
    expect(gleicheNormBezeichnung(a, b)).toBe(erwartet);
  });
  it.each([
    ['§3', '§ 3'],
    ['§ 3', '§3'],
  ])('findet %s bei Quellschreibweise %s', (bezeichnung, quelle) => {
    const norm = element(quelle);
    expect(
      loeseNormAusgangsstelleAuf(gesetzDarstellung({ elemente: [norm] }), {
        typ: 'norm',
        bezeichnung,
      }).norm,
    ).toBe(norm.data);
  });
  it('ordnet eine alte bloße Zahl keiner Norm mit Präfix zu', () => {
    expect(
      loeseNormAusgangsstelleAuf(gesetzDarstellung({ elemente: [element('§ 433')] }), {
        typ: 'norm',
        bezeichnung: '433',
      }).anzahlTreffer,
    ).toBe(0);
  });
});
