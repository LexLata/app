// menu.index.ts
// Öffentlicher Zugang zu Menüdefinition, Darstellung und fensterlokaler Synchronisierung.

/** Bestehende Menüdefinition für den externen Menüaufbau und den ID-Abgleich. */
export { HAMBURGER_MENU_STRUKTUR } from './menuStruktur';
/** Knoten der bestehenden Menüdefinition. */
export type { MenuKnoten } from './menuStruktur';
/** Asynchrone Iconauflösung; unbekannte IDs und Ressourcenfehler ergeben null.
 * Fehler beim Laden der Tauri-Pfad-API werden weitergegeben. */
export { menuIconPfad } from './menuIcons';
/** Momentaufnahme des Systemfarbschemas, ohne eigenen Zustand oder Subscription. */
export { aktuellDunkel } from './menuIcons';
/** Setzt den fensterlokalen Aktivzustand und stößt die native Aktualisierung an,
 * ohne auf sie zu warten oder ihren Erfolg zu garantieren. */
export { setzeAktiv } from './menuAktivZustandStore';
/** Liest den Aktivzustand synchron; bisher ungesetzte IDs gelten als aktiv. */
export { istAktiv } from './menuAktivZustandStore';
/** Merkt den Gesetzstatus dieses Fensters und aktualisiert die zugehörigen Menüeinträge. */
export { meldeGesetzOffenStatus } from './menueZustandSync';
/** Merkt den Auswahlstatus dieses Fensters und aktualisiert die zugehörigen Menüeinträge. */
export { meldeTextAuswahlStatus } from './menueZustandSync';
/** Registriert die erneute Meldung lokaler Werte bei gezielten Fokus-Anfragen.
 * Der Callback aktualisiert ausschließlich den gemeinsamen Stapelstatus.
 * Liefert eine Aufräumfunktion, auch für Abbruch während der Anmeldung. */
export { registriereMenuZustandAnfrageListener } from './menueZustandSync';

/** Meldet den lokalen Normstatus bei Änderungen und liefert Normaktionstexte. */
export { meldeNormstatus, menuText } from './menuAktivZustandStore';
/** Fensterlokaler Normstatus für die Meldung an das Menü. */
export type { MenueNormstatus } from './menuAktivZustandStore';
