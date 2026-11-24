// oeffnen.index.ts
// Öffentliche Schnittstelle der gemeinsamen Gesetzes- und Normsuche.

/** Letzte Anzeige je Gesetzesreferenz-Schlüssel als Zeitstempel in Millisekunden. */
export type { Anzeigezeitpunkte } from './oeffnenAnzeige';

/** Zerlegte Eingabe: Norm-/Artikelnummer oder Erwägungsgrund und optionale Gesetzesangabe. */
export type { Suchanfrage } from './oeffnenAnfrage';

/** Zerlegt eine Eingabe ohne Laden, Import, Navigation oder Änderung der Eingabedaten. */
export { parseSuchanfrage } from './oeffnenAnfrage';

/** Ein installiertes Gesetz oder ein noch nicht installiertes Importangebot. */
export type { SucheTreffer } from './oeffnen';

/** Anzeigetext je Quelle für den Hinweis bei Importangeboten. */
export { IMPORTINDEX_QUELLE_TEXT } from './oeffnen';

/** Berechnet sortierte Treffer ohne Import oder Navigation; höchstens 30 bei jeder Eingabe.
 * Anzeigezeitpunkte erhalten die Sortierung nach letzter Anzeige und die bisherige Rangfolge
 * bei gleichen oder fehlenden Zeitpunkten. Der optionale siebte Parameter aktivesElementId
 * gibt den Artikelkontext ausschließlich im gemeinten aktiven Gesetz vor (Darstellungs-ID).
 * Eine leere Eingabe liefert höchstens 30 installierte Gesetze: zuletzt angezeigte zuerst,
 * danach in Listenreihenfolge. */
export { berechneTreffer } from './oeffnen';

/** Eindeutige Listenschlüssel je Treffer, auch bei gleichen Treffern. */
export { trefferSchluessel } from './oeffnenTrefferSchluessel';

/** Einzelziel einer Norm; liefert null, wenn keine Norm passt oder Normpräfixe fehlen. */
export { loeseNormzielAuf } from './oeffnen';

/** Anzeige eines Importangebots ohne Kenntnis seiner einzelnen Normen. */
export { indexNormAnzeige } from './oeffnen';

/** Prüft, ob die Gesetzesangabe eine zusätzliche Importindexprüfung benötigt. */
export { brauchtImportindexPruefung } from './oeffnen';

/** Vollständiger persistierbarer Eintrag; unlesbare Dateien haben keine Suchdaten. */
export type {
  Suchverzeichniseintrag,
  LesbarerSuchverzeichniseintrag,
  Suchnorm,
  Dateistempel,
} from './suchverzeichnis';
export { leiteSuchverzeichniseintragAb } from './suchverzeichnis';
