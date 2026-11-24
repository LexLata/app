// Gültige Elementstände und Ausgangsstellen für Markierungstests.

import type { MarkierungsEintrag } from '@/lib/markierungen/markierungen.index';

type Elementstand = Extract<MarkierungsEintrag['bezug'], { typ: 'pauschal' }>['elementstand'];

export function elementstand(werte: Partial<Elementstand> = {}): Elementstand {
  return { textlaenge: 0, ...werte };
}

export function ausgangsstelle(
  werte: Partial<Pick<MarkierungsEintrag, 'ausgangsstelle'>> = {},
): Pick<MarkierungsEintrag, 'ausgangsstelle'> {
  return { ausgangsstelle: { typ: 'norm', bezeichnung: '§ 1' }, ...werte };
}
