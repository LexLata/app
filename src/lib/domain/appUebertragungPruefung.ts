// Prüft die vollständigen, über Fenstergrenzen übertragenen Tabdaten.
import type { TabUebertragung, VerlaufEintrag } from './appTypes';
import type { Gesetzesreferenz } from './gesetzTypes';
import { istGueltigerNormgeber } from './gesetzesreferenz';
import { istObjekt, istText, istZahl, istGanzzahl, istListe, optional } from './uebergabePruefung';

export function istGesetzesreferenz(w: unknown): w is Gesetzesreferenz {
  return (
    istObjekt(w) &&
    istText(w.normgeber) &&
    istGueltigerNormgeber(w.normgeber) &&
    istText(w.kurztitel)
  );
}
function istVerlaufEintrag(w: unknown): w is VerlaufEintrag {
  return istObjekt(w) && istGesetzesreferenz(w.gesetzesreferenz) && istText(w.xmlId);
}
export function istTabUebertragung(w: unknown): w is TabUebertragung {
  return (
    istObjekt(w) &&
    optional(
      w.transport,
      (t): t is NonNullable<TabUebertragung['transport']> =>
        istObjekt(t) && istText(t.kennung) && istText(t.quellLabel) && istZahl(t.gueltigBis),
    ) &&
    optional(w.gesetzesreferenz, istGesetzesreferenz) &&
    optional(w.initialNorm, istText) &&
    optional(
      w.scrollPosition,
      (p): p is NonNullable<TabUebertragung['scrollPosition']> =>
        istObjekt(p) && istGanzzahl(p.index) && istZahl(p.offset),
    ) &&
    optional(
      w.einklappZustand,
      (e): e is NonNullable<TabUebertragung['einklappZustand']> =>
        istObjekt(e) &&
        istListe(e.ueberschriftenXmlId, istText) &&
        istListe(e.normenXmlId, istText) &&
        (e.aktivesElementXmlId === null || istText(e.aktivesElementXmlId)),
    ) &&
    optional(
      w.verlauf,
      (v): v is NonNullable<TabUebertragung['verlauf']> =>
        istObjekt(v) && istListe(v.eintraege, istVerlaufEintrag) && istGanzzahl(v.position),
    )
  );
}
