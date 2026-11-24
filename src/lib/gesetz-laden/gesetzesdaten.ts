// Gleicht gelesene Gesetzesdaten fachlich ab: unabhängig von den flüchtigen Parse-IDs und
// von der Verarbeitungszeit, die sich auch ohne inhaltliche Änderung erneuert.
import type { GesetzDarstellung } from '@/lib/domain/gesetzTypes';

/** XML-IDs, Texte und Verweise bleiben Teil des Vergleichs; Laufzeit-IDs und Verarbeitungszeit entfallen. */
function fachlicheGesetzesdaten(gesetz: GesetzDarstellung): string {
  return JSON.stringify(gesetz, (feld, wert: unknown) =>
    feld === 'id' || feld === 'verarbeitungszeit' ? undefined : wert,
  );
}

/**
 * Fachlich gleiche Daten behalten das bisherige Objekt samt Laufzeit-IDs; nur eine geänderte
 * Verarbeitungszeit wird übernommen. Sonst gelten die neuen Daten als fachliche Änderung.
 */
export function gleicheGesetzesdatenAb(
  bisher: GesetzDarstellung | undefined,
  neu: GesetzDarstellung,
): { gesetz: GesetzDarstellung; fachlichGeaendert: boolean } {
  if (!bisher || (bisher !== neu && fachlicheGesetzesdaten(bisher) !== fachlicheGesetzesdaten(neu)))
    return { gesetz: neu, fachlichGeaendert: true };
  const gleicheZeit = bisher.verarbeitungszeit?.getTime() === neu.verarbeitungszeit?.getTime();
  return {
    gesetz: gleicheZeit ? bisher : { ...bisher, verarbeitungszeit: neu.verarbeitungszeit },
    fachlichGeaendert: false,
  };
}
