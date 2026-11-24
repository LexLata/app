// Bestimmt das aktive Element nach dem Scrollen aus einer von oben nach unten
// geordneten Sichtbarkeitsliste. Nur Normen haben einen Körper; bei Überschriften
// ist koerperSichtbar daher false. Die IDs sind die IDs der Darstellungselemente.
export type ElementSichtbarkeit = {
  id: string;
  titelSichtbar: boolean;
  koerperSichtbar: boolean;
};

export function aktivesElementNachfuehren(
  aktivesElementId: string | null,
  sichtbarkeitsliste: readonly ElementSichtbarkeit[],
): string | null {
  const aktivesElement = sichtbarkeitsliste.find((element) => element.id === aktivesElementId);
  if (aktivesElement?.titelSichtbar || aktivesElement?.koerperSichtbar) return aktivesElementId;

  return (
    sichtbarkeitsliste.find((element) => element.titelSichtbar)?.id ??
    sichtbarkeitsliste.find((element) => element.koerperSichtbar)?.id ??
    aktivesElementId
  );
}
