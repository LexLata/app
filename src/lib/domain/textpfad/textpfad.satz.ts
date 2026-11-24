// Gemeinsame Satzauflösung: Ein fehlender Satz-Schritt bezeichnet Satz 1.
// Der XML-Schreiber lässt bei genau einem Satz dessen Wrapper weg.
export function satzNummer(wert: number | undefined): number {
  return wert ?? 1;
}
