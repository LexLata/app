// erlaubteAktionen.ts
// Gemeinsame Erlaubt-Matrix der Einführung, ohne Zustand oder Oberflächenabhängigkeit.
export type EinfuehrungsAktion =
  | 'oeffnen-overlay-zeigen'
  | 'suche-navigieren'
  | 'favorit-speichern'
  | 'lesezeichen-speichern'
  | 'alles-zuklappen'
  | 'alles-aufklappen'
  | 'suche-schliessen'
  | 'suche-neuer-tab'
  | 'norm-wechseln'
  | 'ueberschrift-waehlen'
  | 'titel-ein-ausklappen'
  | 'favorit-aufrufen'
  | 'lesezeichen-aufrufen'
  | 'verweis-aufrufen'
  | 'tab-leiste';
const ERLAUBTE_TEILAKTIONEN: Record<EinfuehrungsAktion, readonly number[]> = {
  'oeffnen-overlay-zeigen': [0],
  'suche-navigieren': [1],
  'favorit-speichern': [2, 3],
  'lesezeichen-speichern': [4],
  'alles-zuklappen': [6],
  'alles-aufklappen': [7],
  'suche-schliessen': [],
  'suche-neuer-tab': [],
  'norm-wechseln': [2, 4, 5, 6, 7, 8],
  'ueberschrift-waehlen': [5, 6, 7, 8],
  'titel-ein-ausklappen': [5, 6, 7, 8],
  'favorit-aufrufen': [2, 4, 5, 6, 7, 8],
  'lesezeichen-aufrufen': [4, 5, 6, 7, 8],
  'verweis-aufrufen': [],
  'tab-leiste': [],
};
export function istErlaubt(teilaktion: number, aktion: EinfuehrungsAktion): boolean {
  return ERLAUBTE_TEILAKTIONEN[aktion].includes(Math.min(teilaktion, 8));
}
