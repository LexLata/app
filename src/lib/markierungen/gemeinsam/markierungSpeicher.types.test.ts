// markierungSpeicher.types.test.ts
// Prüft die vier fachlichen Markierungsarten am gemeinsamen Typvertrag.

import { it, expectTypeOf } from 'vitest';

it('MarkierungsTyp enthält ausschließlich die vier deutschen Formatwerte', () => {
  expectTypeOf<import('./markierungSpeicher.types').MarkierungsTyp>().toEqualTypeOf<
    'unterstreichung' | 'hervorhebung' | 'verweismarkierung' | 'kommentar'
  >();
});

it('verbietet unvollständige und vermischte Markierungsfälle', () => {
  type Eintrag = import('./markierungSpeicher.types').MarkierungsEintrag;
  const ausgangsstelle = { typ: 'erwaegungsgrund' as const, bezeichnung: 'E1' };
  const pauschal = { typ: 'pauschal' as const, elementstand: { textlaenge: 1 } };
  // @ts-expect-error Unterstreichungen benötigen einen vollständigen Bezugstext.
  const ohneBezug: Eintrag = { typ: 'unterstreichung', ausgangsstelle };
  // @ts-expect-error Unterstreichungen können nicht pauschal sein.
  const pauschaleLinie: Eintrag = { typ: 'unterstreichung', ausgangsstelle, bezug: pauschal };
  // @ts-expect-error Kommentare benötigen auch bei leerem Inhalt ihren Kommentartext.
  const ohneText: Eintrag = { typ: 'kommentar', ausgangsstelle, bezug: pauschal };
  // @ts-expect-error Verweismarkierungen benötigen ihren Verweisinhalt.
  const ohneVerweis: Eintrag = { typ: 'verweismarkierung', ausgangsstelle, bezug: pauschal };
  // @ts-expect-error Verweismarkierungen dürfen keinen Kommentartext tragen.
  const vermischt: Eintrag = {
    typ: 'verweismarkierung',
    ausgangsstelle,
    bezug: pauschal,
    verweisinhalt: { verweistext: '', verweisziele: [] },
    kommentarText: 'x',
  };
  const ohneStand: Eintrag = {
    typ: 'kommentar',
    ausgangsstelle,
    // @ts-expect-error Pauschale Markierungen benötigen den gespeicherten Elementstand.
    bezug: { typ: 'pauschal' as const },
    kommentarText: '',
  };
  expectTypeOf([
    ohneBezug,
    pauschaleLinie,
    ohneText,
    ohneVerweis,
    vermischt,
    ohneStand,
  ]).toBeArray();
});
