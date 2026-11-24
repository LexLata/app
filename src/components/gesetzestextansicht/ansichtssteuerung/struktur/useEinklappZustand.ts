// useEinklappZustand.ts
// DOM-freie Ableitung der Unterartikel aus der Dokumentstruktur.
import type { DarstellungsElement } from '@/lib/domain/gesetzTypes';
function naechsterArtikelScope(
  el: DarstellungsElement,
  artikelEbene: number | null,
): { artikelEbene: number | null; istUnterArtikel: boolean } {
  if (el.typ === 'norm') {
    if (el.data.art === 'gliederungsartikel' && el.data.ueberschriftartig) {
      return { artikelEbene: el.data.gliederungsEbene, istUnterArtikel: false };
    }
    const scopeEndetHier =
      el.data.art === 'gliederungsartikel' &&
      artikelEbene !== null &&
      el.data.gliederungsEbene <= artikelEbene;
    return { artikelEbene: scopeEndetHier ? null : artikelEbene, istUnterArtikel: false };
  }
  // el.typ === 'ueberschrift'
  if (artikelEbene === null) return { artikelEbene, istUnterArtikel: false };
  if (el.data.ebene <= artikelEbene) return { artikelEbene: null, istUnterArtikel: false };
  return { artikelEbene, istUnterArtikel: true };
}

// Überschriften, die hierarchisch unter einem überschriftsartigen Gliederungsartikel
// liegen (z. B. Unterabschnitte innerhalb von Art. 229 EGBGB). Berechnet aus
// elemente (Dokumentstruktur, nicht Ansichtszustand) – ändert sich nur bei Import.
// Solange wir uns "im Scope" eines Gliederungsartikels befinden (artikelEbene gesetzt),
// werden alle tieferen Überschriften als untergeordnet markiert. Der Scope endet, sobald
// eine Überschrift oder ein Gliederungsartikel auf gleicher/höherer Ebene erscheint.
export function ermittleUnterArtikelIds(elemente: DarstellungsElement[]): Set<string> {
  const ids = new Set<string>();
  let artikelEbene: number | null = null;
  for (const el of elemente) {
    const ergebnis = naechsterArtikelScope(el, artikelEbene);
    artikelEbene = ergebnis.artikelEbene;
    if (ergebnis.istUnterArtikel) ids.add(el.data.id);
  }
  return ids;
}
