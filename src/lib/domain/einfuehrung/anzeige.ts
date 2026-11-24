// anzeige.ts
// Ordnet den internen Teilaktionen die angezeigten Einführungsschritte zu.

/** Höchste Teilaktion vor dem Abschluss. */
export const LETZTE_TEILAKTION = 7;
/** Anzahl der angezeigten Einführungsschritte. */
export const GESAMT_EINFUEHRUNGSSCHRITTE = 5;
const EINFUEHRUNGSSCHRITTE = [1, 2, 3, 3, 4, 5, 5, 5];

/** Angezeigter Einführungsschritt für Teilaktionen 0 bis LETZTE_TEILAKTION.
 * Für den Abschluss gibt es keinen Einführungsschritt: nicht aufrufen. */
export function einfuehrungsschritt(teilaktion: number): number {
  const schritt = EINFUEHRUNGSSCHRITTE[teilaktion];
  if (schritt === undefined)
    throw new RangeError('Keine Einführungsschrittanzeige für diese Teilaktion.');
  return schritt;
}

/** Inhalt für die aktuelle Teilaktion, einschließlich der Favorit-Entfernen-Variante. */
export function inhaltsTeilaktion(teilaktion: number, istAktuellFavorit: boolean): number {
  return teilaktion === 2 && istAktuellFavorit ? 3 : teilaktion;
}
