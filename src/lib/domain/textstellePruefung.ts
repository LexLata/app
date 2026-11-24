// Wertprüfung serialisierter Textpositionen mit denselben Fallgrenzen wie Textpfad.
import type { Textstelle, Textpfad } from './textpfadTypes';
import { liesTextpfadEintraege } from './textpfad/textpfad.index';
import { istObjekt, istText, istGanzzahl, optional } from './uebergabePruefung';
function istTextpfad(w: unknown): w is Textpfad {
  if (!istObjekt(w)) return false;
  if (w.typ === 'bereich')
    return (
      ['amtlicherTitel', 'nichtamtlicherTitel', 'bezeichnung'].includes(String(w.bereich)) &&
      ['absatz', 'absatzWiederholung', 'unterabsatz', 'satz', 'eintraege', 'satzInEintrag'].every(
        (k) => w[k] === undefined,
      )
    );
  if (w.typ !== 'normtext' || w.bereich !== undefined) return false;
  return (
    optional(w.absatz, istText) &&
    optional(w.absatzWiederholung, istGanzzahl) &&
    optional(w.unterabsatz, istText) &&
    optional(w.satz, istGanzzahl) &&
    (w.eintraege === undefined
      ? w.satzInEintrag === undefined
      : liesTextpfadEintraege(w.eintraege) !== undefined && optional(w.satzInEintrag, istGanzzahl))
  );
}
export function istTextstelle(w: unknown): w is Textstelle {
  return (
    istObjekt(w) &&
    istTextpfad(w.pfad) &&
    istGanzzahl(w.zeichenbereichStart) &&
    istGanzzahl(w.zeichenbereichEnde) &&
    w.zeichenbereichEnde >= w.zeichenbereichStart
  );
}
