// seitenleisten.index.ts
//
// Öffentliche Schnittstelle des Moduls components/seitenleisten: die
// Seitenleisten der Hauptansicht (Favoritenleiste, Lesezeichenleiste,
// Schnellaktionen) samt ihrer Anordnung. Seitenleisten in Hilfsfenstern
// (z. B. die Konfliktseitenleiste) gehören nicht hierher.
//
// REGEL (dependency-cruiser, siehe scripts/automatisch/modulgrenzen.cjs):
// Code außerhalb von src/components/seitenleisten/** darf ausschließlich aus
// DIESER Datei importieren. Das Modul importiert nichts aus der
// Gesetzestextansicht; diese meldet den Favoritenstatus per Callback.

/** Ordnet Favoritenleiste, Lesezeichenleiste und Schnellaktionen neben dem Text an. */
export { Seitenleistenanordnung } from './Seitenleistenanordnung';
/** Gemeinsamer Rahmen einer Seitenleiste der Hauptansicht. */
export { Seitenleiste } from './Seitenleiste';
/** Schaltflächen der Hauptansicht (Suche, Favorit, Lesezeichen, Zu-/Aufklappen);
 *  ohne geöffnetes Gesetz sind alle außer der Suche gesperrt. Die Aktionen
 *  selbst führt der Aufrufer über die Callbacks aus. */
export { Schnellaktionen, FavoritSchnellaktion } from './Schnellaktionen';
/** Listet die Favoriten mit Tastaturhinweisen; ein Klick meldet die XML-ID an den Aufrufer. */
export { Favoritenleiste } from './favoriten/Favoritenleiste';
/** Listet die Lesezeichen; ein Klick meldet Bezeichnung und Gesetz an den Aufrufer. */
export { Lesezeichenleiste } from './lesezeichen/Lesezeichenleiste';

/** Lädt die Favoriten eines Gesetzes und registriert deren Tastaturkürzel.
 * Nicht auflösbare Ziele werden ausgelassen; Ladefehler liefern weiterhin
 * eine leere Liste. Listener werden beim Ende der Instanz aufgeräumt. */
export { useFavoritenleiste } from './favoriten/useFavoritenleiste';
/** Favoritenziel mit Anzeige-Bezeichnung und XML-ID. */
export type { FavoritenEintrag } from './favoriten/useFavoritenleiste';

/** Wiederverwendete Zeichen für Suche und Zuklappen. Ohne Größe gilt die Standardgröße;
 * numerische Icon-Größen oder em-Angaben erlauben die Einbettung neben Text. */
export { SucheIcon, ZuklappenIcon } from './SeitenleistenAktionen';
