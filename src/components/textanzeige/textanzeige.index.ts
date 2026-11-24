// textanzeige.index.ts
// Einzige öffentliche Grenze für sichtbaren Text und Textattribute.
/** Zeigt Rohtext mit automatischem Umbruchschutz; Hervorhebungen beziehen sich auf UTF-16-Positionen.
 * Ungültige Bereiche werfen RangeError. Optionen erhalten ausschließlich Plaintext. */
export { TextAnzeige } from './TextAnzeige';
/** Erzeugt das gewählte HTML-Element und schützt title, placeholder, aria-label und alt.
 * Eingabewerte, Ref, Events und Layoutkinder werden unverändert weitergereicht. */
export { TextAttributElement } from './TextAttributElement';
export type { HervorhebungsBereich } from './textanzeige.types';
