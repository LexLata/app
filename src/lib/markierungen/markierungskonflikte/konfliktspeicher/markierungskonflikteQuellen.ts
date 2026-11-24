// Bestimmt die strikt zu ladenden Gesetzquellen tatsächlich geprüfter Markierungen.
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import type { MarkierungsEintrag } from '@/lib/markierungen/gemeinsam/gemeinsam.index';

/** Normziele ohne eigenes Gesetz gehören zum Ausgangsgesetz. Ziele ohne
 * Elementstand und Verweise auf ganze Gesetze erzeugen keine Zielkonflikte. */
export function gesetzquellenDerMarkierungen(
  ausgang: Gesetzesreferenz,
  eintraege: readonly MarkierungsEintrag[],
  nurZielgesetze?: ReadonlySet<string>,
): Gesetzesreferenz[] {
  const referenzen = new Map([[gesetzesreferenzSchluessel(ausgang), ausgang]]);
  for (const eintrag of eintraege) {
    if (eintrag.typ !== 'verweismarkierung') continue;
    for (const ziel of eintrag.verweisinhalt.verweisziele) {
      if (ziel.typ !== 'zielnorm' || !ziel.gesetz) continue;
      const schluessel = gesetzesreferenzSchluessel(ziel.gesetz);
      if (!nurZielgesetze || nurZielgesetze.has(schluessel))
        referenzen.set(schluessel, ziel.gesetz);
    }
  }
  return [...referenzen.values()];
}
