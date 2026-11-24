// importindex.index.ts
// Fassade für geprüfte Importindizes, Europa-Verzeichnis und vollständige
// Indexvorgänge. Quellenparser bleiben unabhängig. Andere Importsubmodule
// verwenden ausschließlich diese Fassade.

export type { ImportindexKategorie, ImportindexSucheEintrag } from './importindexSuche';
/** Metadaten ohne Standardinstallation; unlesbare Felder ergeben null. */
export { importindexStatus } from '@/lib/import/importindex/importindexSuche';
/** Strikter Inhaltzugriff mit demselben Wiederherstellungsweg; endgültige Fehler
 * werfen. Leere Liste ist von einem nicht lesbaren Verzeichnis zu unterscheiden.
 */
export { alleImportindexEintraege } from '@/lib/import/importindex/importindexSuche';
/** Prüft XML/Quelle/Zeit vor Änderung; ungültige Eingabe lässt den Bestand unangetastet. */
export { uebernehmeImportindexDatei } from '@/lib/import/importindex/importindexSuche';
/** Synchroner Status des aktuellen Fensters, keine fensterübergreifende Sperre. */
export { istImportindexAktiv } from '@/lib/import/importindex/importindexErstellungSteuerung';
/** Reiner Export vorhandener lesbarer Dateien ohne Standardinstallation. */
export { leseImportindizesFuerExport } from '@/lib/import/importindex/importindexExport';
/** Geprüfter Startup-Abgleich, Einzelfehler isolieren. */
export { synchronisiereStartupImportindizes } from '@/lib/import/importindex/importindexVorinstallation';
/** Explizite geprüfte Standardinstallation, wirft bei unbrauchbarer Ressource/I/O-Fehler. */
export { stelleStandardWieder } from '@/lib/import/importindex/importindexVorinstallation';

// ---------------------------------------------------------------------------
// Interne Verträge für Quellen, Nachbereitung und Dispatch.
// ---------------------------------------------------------------------------

/** null nur bei fehlendem Treffer in einem lesbaren Importindex; endgültiger Importindexfehler wirft. */
export { sucheImImportindex } from '@/lib/import/importindex/importindexSuche';
/** null nur bei fehlendem Treffer in einem lesbaren Importindex; endgültiger Importindexfehler wirft. */
export { sucheImImportindexPerLangtitel } from '@/lib/import/importindex/importindexSuche';
/** Formatfehler eines Importindex mit verständlicher Ursache. */
export { ImportindexFormatFehler } from '@/lib/import/importindex/importindexSuche';

/** Quellenerstellung benötigt diese reinen gemeinsamen Erstellungsbausteine. */
export { type ImportindexEintrag } from '@/lib/import/importindex/importindexErstellung';
export { type ImportindexErstellungErgebnis } from '@/lib/import/importindex/importindexErstellung';
/** Sortiert die übergebene Eintragsliste und markiert Duplikate; liefert dieselbe Liste. Keine I/O-Zugriffe. */
export { sortiereUndMarkiereDuplikate } from '@/lib/import/importindex/importindexErstellung';
/** Serialisiert Einträge als Importindex-XML mit Metadaten; keine Speicherung oder I/O-Zugriffe. */
export { serialisiereImportindex } from '@/lib/import/importindex/importindexErstellung';
/** Liefert bei leerer Live-Liste eine Fehlermeldung, sonst null; keine Nebenwirkungen. */
export { pruefeNichtLeer } from '@/lib/import/importindex/importindexErstellung';
/** Bestehender gemeinsamer Speicherabschluss; validiert vor Ersetzen, bewahrt
 * BW-Attribute/Backupregeln und wirft bei Schreibfehlern.
 */
export { speichereImportindexAktualisierung } from '@/lib/import/importindex/importindexErstellung';

/** Registriert eine Kategorie im aktuellen Fenster, stellt den Bannerkontext
 * bereit und gibt garantiert im finally frei. Bereits aktiv ergibt erfolg:false
 * ohne zweite Arbeit. Überraschende geworfene Fehler als Importindexfehler behandeln
 * und Banner abschließen; kein dauerhaft laufendes Banner hinterlassen.
 * Die Arbeit liefert Abbruch/Erfolg/Fehler im bestehenden Indexergebnisformat.
 * Die Prozessregistrierung ist unabhängig von der kurzen Schreibkoordination:
 * vorbereitende Leseschritte dürfen nicht auf das Ende des eigenen Live-Laufs
 * warten. Beim Warten auf den Schreibabschnitt vor beginneSpeichern bleibt der
 * Lauf abbrechbar. Wiederanzeige eines versteckten Banners
 * nach beginneSpeichern stellt die Abbrechen-Schaltfläche nicht wieder her.
 */
export { mitImportindexVorgang } from '@/lib/import/importindex/importindexErstellungSteuerung';
export { type ProzessBanner } from '@/lib/import/importindex/importindexErstellungSteuerung';
/** Liest validierte Grundlage und aktuellen Rohbestand zusammen, ohne Installation.
 * Liefert den Snapshot für die erneute Speicherprüfung; fehlende gültige Grundlage wirft. */
export { leseImportindexAbgleichsSnapshot } from './importindexZugriff';

/** Validiert Importindex-XML und liefert verwendbare Einträge; keine I/O-Nebenwirkungen.
 * Ungültige Struktur/Quelle/Version/Zeit wirft ImportindexFormatFehler. */
export { parseImportindex } from './importindexValidierung';

export type { VerzeichnisFehler } from './importindexVertrag.types';

/** Liest eine Referenzquelle. Bund/BW werden bei defektem Bestand einmal durch
 * einen geprüften Standard ersetzt und erneut gelesen. Endgültige I/O-/Formatfehler
 * erscheinen als Diagnosen neben den verbleibenden Einträgen, nicht als Throw.
 * Europarecht vereint kuratierte CELEX-Angebote mit mitgelieferten GesetzesXML-Dateien (derzeit EMRK, Normgeber Europarat); Parserimplementierungen
 * werden nicht geladen. Diese Operation zeigt selbst kein Nachbereitungsbanner.
 * Der globale Schemaversion-Hinweis beim Persistenzlesen ist davon unabhängig
 * und bleibt auch nach erfolgreicher Wiederherstellung erhalten.
 */
export { leseReferenzVerzeichnis } from './importindexZugriff';
/** Liefert Europa-Angebot für die bestehende Suche; Teilfehler werfen nicht und
 * bleiben über leseReferenzVerzeichnis für die Nachbereitung zugänglich.
 */
export { leseEuropaVerzeichnis } from './europaVerzeichnis';

export type { ImportindexStatus } from './importindexSuche';

/** Benachrichtigt ausschließlich nach erfolgreicher Indexschreibung; mit Abmeldung. */
export { beiImportindexGeschrieben, importindexAbsender } from './importindexAenderung';
/** Diagnostischer Inhaltzugriff, auch für die kuratierte EU-Überlagerung. */
export { leseImportindexEintraegeMitDiagnosen } from './importindexZugriff';
