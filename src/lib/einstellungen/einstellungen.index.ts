/**
 * Öffentliche Schnittstelle der Einstellungen: Speicherschlüssel, typisierte
 * Leser, Meldung „Einstellung geändert“, Backup, Zurücksetzen,
 * Einstellungs-XML und die Farbauswahl der einstellbaren Farben.
 * React-Hooks liegen in hooks/einstellungen.
 */

/** localStorage-Schlüssel der einzelnen Einstellungen. Werte nur über diese
 *  Konstanten lesen und schreiben; geänderte exportierbare Werte zusätzlich
 *  über meldeEinstellungenGeaendert melden. */
export {
  ABKUERZUNGEN_AKTIV_KEY,
  APP_AKZENTFARBE_KEY,
  AUTO_AKTUALISIERUNGS_INTERVALL_KEY,
  BLOCKSATZ_KEY,
  EU_DURCHFUEHRUNGSAKT_SUCHE_KEY,
  EU_FASSUNG_KEY,
  FARBSCHEMA_KEY,
  GESETZESTEXT_AKZENTFARBE_KEY,
  HERVORHEBUNGSFARBE_KEY,
  LEISTEN_SCHRIFT_KEY,
  LEISTEN_TAUSCHEN_KEY,
  APP_UPDATES_AUTOMATISCH_SUCHEN_KEY,
  LESBARE_ZEILENLAENGE_BREITE_KEY,
  LESBARE_ZEILENLAENGE_KEY,
  LETZTER_EXPORT_ORDNER_KEY,
  LINUX_TITELLEISTEN_KEY,
  MARKIERUNGEN_DEAKTIVIERT_KEY,
  MARKIERUNGSKONFLIKT_ERKLAERUNG_GELESEN_KEY,
  MINIMALISTISCHER_MODUS_KEY,
  NACHBEREITUNG_BEI_IMPORT_KEY,
  OHNE_PUNKT_KEY,
  PLATTFORMFREMDE_UI_KEY,
  RANDBREITE_KEY,
  ROEMISCHE_ABSAETZE_KEY,
  SATZ_NEU_ZEILE_KEY,
  SCHRIFTART_KEY,
  SCHRIFT_KEY,
  SILBENTRENNUNG_KEY,
  STRUKTURKONTEXTLEISTE_GROESSE_KEY,
  SEITENLEISTEN_TASTENKUERZEL_KEY,
  UI_GROESSE_KEY,
  ZEILENABSTAND_KEY,
} from './speicherschluessel';

/** Typisierte Leser: parse… deutet einen localStorage-Rohwert, lese… liest ihn
 *  selbst. Unbekannte Werte und ein nicht verfügbarer localStorage ergeben den
 *  Standardwert; es wird nie geworfen. */
export { leseEuFassung, parseEuFassung } from './euFassung';
export { parseEuDurchfuehrungsaktSuche } from './euDurchfuehrungsaktSuche';
/** Ob bei der EU-Suche Durchführungsakte einbezogen werden. */
export type { EuDurchfuehrungsaktSuche } from './euDurchfuehrungsaktSuche';
export { leseNachbereitungBeiImport, parseNachbereitungBeiImport } from './nachbereitungBeiImport';
/** Nachbereitung beim Import: aus, Verweise, Sätze oder beides. */
export type { NachbereitungBeiImport } from './nachbereitungBeiImport';

/** Backup der exportierbaren Einstellungen im Datenordner.
 *  meldeEinstellungenGeaendert: nach einer Änderung (ohne Schlüssel: nach
 *  vollständigem Import) wird das Backup verzögert neu geschrieben; nicht
 *  exportierbare Schlüssel bleiben ohne Wirkung.
 *  registriereEinstellungenBackupMeldung: meldet Schreibfehler (Text) und
 *  späteren Erfolg (undefined) an das Fenster; liefert die Abmeldung.
 *  stelleEinstellungenAusBackupWiederHer: übernimmt das Backup nur, wenn noch
 *  keine Einstellung gesetzt ist; liefert 'wiederhergestellt', 'nichts-zu-tun'
 *  oder 'fehler' statt zu werfen. */
export {
  meldeEinstellungenGeaendert,
  registriereEinstellungenBackupMeldung,
  stelleEinstellungenAusBackupWiederHer,
} from './einstellungenBackup';
/** Einstellungs-XML und Zurücksetzen.
 *  baueEinstellungenXML: XML aus den ausdrücklich gesetzten Einstellungen.
 *  einstellungenOhneVerarbeitungszeit: XML ohne Zeitstempel für Inhaltsvergleiche.
 *  keineEinstellungExplizitGesetzt: ob noch keine exportierbare Einstellung gesetzt ist.
 *  setzeEinstellungenZurueck: entfernt alle Einstellungen samt Backup und
 *  aktualisiert die Anzeige; liefert { erfolgreich } statt zu werfen.
 *  wendeEinstellungenXMLAn: übernimmt eine Einstellungs-XML, meldet
 *  Einzelprobleme an den Empfänger, stößt das Backup an und liefert den
 *  Übernahmestand. */
export {
  baueEinstellungenXML,
  einstellungenOhneVerarbeitungszeit,
  keineEinstellungExplizitGesetzt,
  setzeEinstellungenZurueck,
  wendeEinstellungenXMLAn,
} from './einstellungenSpeicher';

/** Einstellbare Farben: Auswahlliste mit Beschriftung, Standardfarbe und
 *  Typprüfung gelesener Rohwerte. */
export { FARBWAHL_OPTIONEN, FARBWAHL_STANDARD, istFarbwahl } from './farbpalette';
/** Name einer einstellbaren Farbe. */
export type { Farbwahl } from './farbpalette';
