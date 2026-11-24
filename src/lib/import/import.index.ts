// import.index.ts
//
// Öffentliche Schnittstelle des lib/import-Moduls (Deep Module nach
// Ousterhout: kleine, gut dokumentierte Außenfläche, die die tatsächliche
// Komplexität – Quellenwahl Bund/BW/Europa, Fallback-Verhalten,
// Parallelisierung, Formaterkennung-Weiterverarbeitung, Importindex-Handling –
// dahinter verbirgt).
//
// REGEL (durchgesetzt über dependency-cruiser, siehe scripts/automatisch/dependency-cruiser.cjs,
// Regel 'nur-import-index-darf-von-aussen-genutzt-werden'): Code außerhalb
// von src/lib/import/** darf ausschließlich aus DIESER Datei importieren,
// nie direkt aus den Unterordnern (bund/, bw/, eu/, basis/,
// importindex/, dispatch/). dispatch/ ist reine Implementierung hinter dieser Datei. lib/import selbst darf weiterhin frei aus jedem
// anderen Bereich importieren (persistenz, domain, …) – die Beschränkung
// gilt nur in Zugriffsrichtung "von außen nach rein".
//
// Eigene Logik hier ist nur die dynamische Quellenwahl beim Importindex und der
// Start des Präfixlaufs: Quellenfassaden werden erst im Vorgang dynamisch geladen;
// Typ-Reexports laden keine Quellenparser.

import type { ImportindexKategorie } from '@/lib/domain/normgeber';
import type { ImportindexErstellungErgebnis } from './importindex/importindex.index';
import { NORMGEBER_DE_BW, NORMGEBER_EU } from '@/lib/domain/normgeber';

// ---------------------------------------------------------------------------
// 1. Gesetze importieren (Internet + Datei-Rohverarbeitung)
// ---------------------------------------------------------------------------

/** Importiert je Eingabe vollständig und speichert erfolgreiche Gesetze.
 * Ohne Normgeberwahl Bund→BW nur bei fehlendem Bundeseintrag; explizite
 * Normgeber bleiben verbindlich. Weitere Angaben liefern nichtVerfuegbar. EU und mitgelieferte GesetzesXML-Dateien benötigen { kurztitel, abrufkennung} mit CELEX oder Dateiname.
 * Bestandsprüfung und Sperre verwenden den tatsächlichen Normgeber; neuere Bundle-Versionen dürfen ersetzen.
 * Einzelne Importfehler werden gesammelt; Referenzfehler hindern das Tagging
 * nicht; ihre gebündelte Diagnose sowie Lade-/Speicherbefunde gehen an den
 * optionalen vierten Meldungsempfänger. Ohne Empfänger gilt die Hauptfensteranzeige.
 * Fortschritt: laden mit optionaler Meldung, ok mit Gesetz, fehler mit ImportFehler.
 * Callbackfehler werden erst nach Ende aller gestarteten Arbeiten geworfen.
 * Registrierungen/Sperren liegen intern; manuelle Koordinationsfehler lassen
 * die Arbeit wie bisher zu. Batch-Ergebnisse folgen der Abschlussreihenfolge.
 */
export { importiereGesetze } from '@/lib/import/dispatch/gesetzImportDispatch';
/** Wartet nach einem beschaeftigt-Ergebnis höchstens hoechstdauerMs auf die
 * Freigabe der Gesetzsperre; true, sobald sie frei ist. Startet keinen Import. */
export { warteAufGesetzImport } from '@/lib/import/dispatch/importVorgang';
/** Repariert konkrete Dateiziele nach ihrer Quelle, einschließlich bestehender
 * Sicherungs-/Archivierungsregeln. Referenzfehler allein berechtigen nicht zur
 * Archivierung. Ergebnisse beschreiben jeden tatsächlich erreichten Zielzustand.
 */
export { repariereGesetze } from '@/lib/import/dispatch/gesetzReparaturDispatch';
/** Vollständiger Datei-Sammelvorgang mit interner Registrierung und einem
 * gemeinsamen Referenzkontext. Die Arbeit erhält eine begrenzte Dateioperation
 * und kann damit ihre bestehende Reihenfolge einschließlich anderer Dateiformate
 * beibehalten. Die Dateioperation verarbeitet den vorliegenden Gesetztext und
 * speichert neue Gesetze; Änderungen eines vorhandenen Gesetzes bleiben Konflikte
 * zur Nutzerentscheidung. nachbereitungBeiImport wirkt nur auf GesetzesXML.
 * Referenzfehler lassen Tagging und Import weiterlaufen; Format-/Speicherfehler
 * bleiben Fehler. Genau ein Referenzfehlerbanner nach
 * Abschluss, sofern nötig; der globale Schemaversion-Hinweis ist davon unabhängig
 * und bleibt auch nach erfolgreicher Wiederherstellung erhalten. Kein
 * öffentlicher Diagnosekontext.
 * Die übergebene Operation darf nur während der Arbeit verwendet werden;
 * alle gestarteten Aufrufe sind vor deren Ende abzuwarten. Freigabe im finally,
 * Arbeitsfehler bleiben erhalten. Leere Arbeit erzeugt kein Referenzfehlerbanner.
 */
export { mitGesetzDateiImport } from '@/lib/import/dispatch/gesetzDateiVerarbeitung';
/** Reine Erkennung, keine Validierung/Installation und keine Nebenwirkungen. */
export { erkenneGesetzDateiFormat, istHtmlDatei } from '@/lib/import/dispatch/gesetzDateiFormat';
export type {
  GesetzReparaturZiel,
  GesetzReparaturErgebnis,
  ImportFehler,
  ImportFehlerGrund,
  ImportEinzelErgebnis,
  AktualisierungsErgebnis,
  AktualisierbareGesetzeErgebnis,
  GesetzDateiErgebnis,
  GesetzDateiFormat,
  ImportindexExportDatei,
} from '@/lib/import/importVertrag.types';

// ---------------------------------------------------------------------------
// 2. Gesetze aktualisieren
// ---------------------------------------------------------------------------

/** Reine Auswahl, Zeitermittlung und Nachrichtenformatierung; keine Aktualisierung. */
export { ermittleFaelligeGesetze } from '@/lib/import/dispatch/aktualisierungsKandidaten';
/** Liest benötigte Indizes einmal; unlesbarer Index verwirft die gesamte Auswahl, ohne Aktualisierung. */
export { ermittleAktualisierbareGesetze } from '@/lib/import/dispatch/aktualisierungsKandidaten';
/** Reine Zeitermittlung ohne Dateizugriffe. */
export { ermittleFruehesteVerarbeitungszeit } from '@/lib/import/dispatch/aktualisierungsKandidaten';
/** Formatiert Ergebnisse erfolgreicher Aktualisierungen ohne Nebenwirkungen. */
export {
  baueAktualisierungsNachricht,
  type AktualisierungsKategorie,
} from '@/lib/import/dispatch/aktualisierungsNachricht';
/** Aktualisiert Bund/BW/EU anhand des Normgebers mit interner Registrierung/Sperre.
 * Unveränderter Inhalt bewahrt die Darstellung/Element-IDs und frischt nur das
 * Prüfdatum auf.
 * Fehler werden zurückgegeben; Fehler eines Fortschritt-Callbacks können werfen.
 * Der optionale dritte Meldungsempfänger erhält Lade-/Speicherbefunde und die
 * gemeinsame Referenzdiagnose. Ohne Empfänger gilt die Hauptfensteranzeige.
 * Bei manuellen Koordinationsfehlern läuft die Arbeit mit der bestehenden Degradation weiter.
 */
export { aktualisiereGesetz } from '@/lib/import/dispatch/gesetzAktualisierungDispatch';
/** Aktualisiert einen manuellen Batch; isoliert Einzel-/Teilfehler.
 * Fortschritt und fehlgeschlagene Gesetze enthalten die vollständige Ausgangsreferenz.
 * Bei ok enthält ergebnis die Kategorie, bei fehler den ImportFehler.
 * Callbackfehler erst nach allen gestarteten Arbeiten und interner Freigabe werfen.
 * Der optionale dritte Meldungsempfänger sammelt Hinweise und Fehler mit Gesetzesreferenz.
 * Manuelle Koordinationsfehler erlauben weiterhin die Arbeit.
 */
export { aktualisiereGesetze } from '@/lib/import/dispatch/gesetzAktualisierungDispatch';
/** Startet einen automatischen Batch nur nach erfolgreicher atomarer Registrierung.
 * Laufende Vorgänge oder Koordinationsfehler ergeben zurueckgestellt ohne Arbeit.
 * Registrierung umfasst Indexvorprüfung und Aktualisierung und wird bei jedem Abschluss freigegeben.
 * Ein unlesbarer benötigter Index ergibt importindexNichtLesbar ohne Quellenabruf.
 * Ohne Kandidaten erfolgreiches leeres Ergebnis ohne Meldung; kein verschachtelter Vorgang.
 * Der optionale zweite Meldungsempfänger erhält dieselben Befunde wie der manuelle Batch.
 */
export { aktualisiereGesetzeAutomatisch } from '@/lib/import/dispatch/gesetzAktualisierungDispatch';

// ---------------------------------------------------------------------------
// 3. Importindex (Bundesrecht / Landesrecht BW) verwalten
// ---------------------------------------------------------------------------

export type {
  ImportindexKategorie,
  ImportindexStatus,
} from '@/lib/import/importindex/importindex.index';
/** Liest Aktivstatus/Metadaten, installiert keinen Standard.
 * Nicht lesbare Metadaten ergeben null; aktiv bezeichnet nur die lokale Prozessmap.
 */
export { importindexStatus } from '@/lib/import/importindex/importindex.index';
/** Prüft importiertes Importindex-XML vor jeder Änderung des Bestands.
 * Übernimmt nur einen gültigen neueren Stand. Ungültige Eingabe wirft einen
 * verständlichen Formatfehler; I/O-Fehler können werfen. Kein Schreiben bei Fehler.
 */
export { uebernehmeImportindexDatei } from '@/lib/import/importindex/importindex.index';
/** Synchroner Status eines Indexprozesses im aktuellen Fenster. */
export { istImportindexAktiv } from '@/lib/import/importindex/importindex.index';
/** Liefert vorhandene Exportdateien; keine Installation, unlesbare Dateien auslassen. */
export { leseImportindizesFuerExport } from '@/lib/import/importindex/importindex.index';
/** Prüft und synchronisiert beide mitgelieferten Indizes beim Start;
 * ein Einzelfehler verhindert nicht die andere Kategorie.
 */
export { synchronisiereStartupImportindizes } from '@/lib/import/importindex/importindex.index';
/** Installiert ausdrücklich den zuvor geprüften Bundle-Standard; kann bei
 * unbrauchbarer Ressource oder I/O-Fehlern werfen. Kein ungeprüftes Ersetzen.
 */
export { stelleStandardWieder } from '@/lib/import/importindex/importindex.index';

/** Liefert verfügbares Bund-/BW-/Europa-Angebot; Quellenfehler verwerfen nur
 * deren Treffer. Indexzugriff kann bei defektem Bestand den Standard installieren.
 * Installierte Gesetze werden hier nicht herausgefiltert; Aufrufer wählen Treffer.
 */
export {
  sucheKandidatenAlleQuellen,
  leseImportindexZwischenspeicher,
  istImportindexSuchbestandAktuell,
  istImportindexSuchbestandVollstaendig,
  beiImportindexInvalidiert,
} from './importindexZwischenspeicher';

/** Führt Live-Importindexaktualisierung mit Fortschrittsbanner durch. Sperre gilt im
 * selben Fenster je Kategorie. Abbruch vor Speicherbeginn erhält den Bestand;
 * ab Speicherbeginn ist das Schreiben abzuschließen und nicht mehr abbrechbar.
 * Im abbrechbaren Abschnitt nur lesen, nötigenfalls den geprüften Standard
 * im Arbeitsspeicher verwenden. Keine vorbereitende Standardinstallation;
 * auch beim Warten auf den Schreibabschnitt bleibt der Lauf abbrechbar.
 * Fehler/Abbruch/bereits laufender Vorgang ergeben erfolg:false mit Anzeigetext.
 */
export async function aktualisiereImportindex(
  kategorie: ImportindexKategorie,
): Promise<ImportindexErstellungErgebnis> {
  if (kategorie === NORMGEBER_EU) {
    const { erstelleEuImportindex } = await import('@/lib/import/eu/eu.index');
    return erstelleEuImportindex();
  }
  if (kategorie === NORMGEBER_DE_BW) {
    const { erstelleLandesrechtBWImportindexNeu } = await import('@/lib/import/bw/bw.index');
    return erstelleLandesrechtBWImportindexNeu();
  }
  const { erstelleBundesImportindex } = await import('@/lib/import/bund/bund.index');
  return erstelleBundesImportindex();
}

// ---------------------------------------------------------------------------
// 4. Konstanten & gemeinsame Fehlerbehandlung
// ---------------------------------------------------------------------------

export type { ImportFehlerKategorie } from '@/lib/import/basis/basis.index';
/** Erkennt Verbindungsfehler für zusätzliche Hinweise bei Suchimporten. */
export { FEHLERTEXT_KEINE_VERBINDUNG, istVerbindungsFehler } from '@/lib/import/basis/basis.index';

export type { GesetzDateiImport } from '@/lib/import/importVertrag.types';

/** Vollständige Kandidaten und Import eines unverändert gewählten Ziels. */
export {
  ladeGesetzeskandidaten,
  importiereGesetzesreferenz,
  importiereGesetzesreferenzen,
} from '@/lib/import/dispatch/gesetzesreferenzImport';

export type { GesetzesreferenzImportErgebnis } from '@/lib/import/dispatch/gesetzesreferenzImport';

/** Führt den Entwicklerauftrag ohne fachliche App-Initialisierung aus. */
export async function startePraefixlauf(
  auftrag: import('@/lib/plattform/praefixlaufAuftrag').PraefixlaufAuftrag,
): Promise<void> {
  const { startePraefixlauf: starten } = await import('./praefixlaufStart');
  await starten(auftrag);
}
