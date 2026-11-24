// Führt die optionalen Formulardaten in einen vollständigen Bezug einer Markierung über.

import type { Textstelle } from '@/lib/domain/textpfad/textpfad.index';
import type { Bezugstext, Elementstand, Pauschal } from './markierungSpeicher.types';

/** Formular- und Historienwerte werden erst nach dieser Prüfung zu einer Markierung. */
export function markierungsBezug(angaben: {
  textstelle?: Textstelle;
  bezugstext?: string;
  elementstand?: Elementstand;
}): Bezugstext | Pauschal {
  if (angaben.textstelle !== undefined && angaben.bezugstext !== undefined) {
    return { typ: 'bezugstext', textstelle: angaben.textstelle, bezugstext: angaben.bezugstext };
  }
  if (
    angaben.textstelle === undefined &&
    angaben.bezugstext === undefined &&
    angaben.elementstand !== undefined
  ) {
    return { typ: 'pauschal', elementstand: angaben.elementstand };
  }
  throw new Error('Der Bezug der Markierung ist unvollständig.');
}
