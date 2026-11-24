// aktives-element.index.ts
// Öffentliche Grenze der flüchtigen aktiven Norm.
/** Liest den fensterlokalen Stand oder null; bei gleichem Inhalt bleibt die Snapshotidentität stabil. */
export { liesSpeicherbareNorm } from './aktivesElementZustand';
/** Die sichtbare Gesetzestextansicht schreibt über ihre Hülle und leert beim Verdecken oder Abbau
 * mit null. Inhaltliche Änderungen benachrichtigen alle Abonnenten synchron. */
export { schreibeSpeicherbareNorm } from './aktivesElementZustand';
/** Abonniert Änderungen ohne sofortigen Aufruf und liefert die Abmeldung. */
export { abonniereSpeicherbareNorm } from './aktivesElementZustand';
/** Eindeutig speicherbare Norm mit Gesetzesreferenz, vollständiger Bezeichnung und Favoritenstatus. */
export type { SpeicherbareNorm } from './aktivesElementZustand';
