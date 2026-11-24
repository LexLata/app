// importabschluss.index.ts
// Fassade für den Abschluss eines Gesetzesimports und seine Ergebnistypen.

/** Validiert Normgeber, taggt, vergleicht und speichert. Referenzfehler erlauben
 * Rest-/Leerlisten und werden im Diagnosekontext gebündelt. Format-/Speicherfehler
 * sind Ergebnisse; Callbackfehler und Reparaturzielabbruch können werfen.
 * Bei unverändertem Inhalt nur Prüfdatum erneuern, Darstellung/Element-IDs bewahren.
 * Optionaler Meldungsempfänger sammelt Speicherbefunde synchron. Eine gescheiterte
 * Titelergänzung nach Gesetzesspeicherung bleibt Erfolg mit Hinweis, keine Wiederholung.
 */
export { taggeUndSpeichereGesetzesXML } from '@/lib/import/importabschluss/gesetzImportAbschluss';
/** Taggt mit den verfügbaren Referenzen des Normgebers; ohne Normgeber
 * nur mit Eigenzuordnungen und ohne Referenzverzeichnisse zu lesen.
 * Quellenfehler hindern die Rückgabe nicht. Kein Speichern. Ohne übergebenen
 * Kontext verwendet die Operation einen eigenen Diagnosekontext. Gibt XML zurück;
 * unlesbares XML oder ein zum XML unpassender Normgeber wirft vor Quellenzugriff.
 */
export { taggeGesetzesXML } from '@/lib/import/importabschluss/gesetzImportAbschluss';
/** Vergleich ignoriert Verarbeitungszeit; neu/unveraendert/geaendert.
 * Reiner Bestandsvergleich, keine Speicherung; Leseprobleme können werfen.
 */
export { vergleicheGesetzesXMLMitBestand } from '@/lib/import/importabschluss/gesetzImportAbschluss';
/** Tokenisiert GesetzesXML und taggt Verweise nach dessen Normgeber;
 * ohne bekannten Normgeber nur Eigenzuordnungen ohne Quellenzugriff.
 * Keine Speicherung. Referenzfehler verhindern keinen der Schritte.
 * Bei nicht lesbaren Kernfeldern bleibt es bei der defensiven Tokenisierung;
 */
export { nachbereiteGesetzesXML } from '@/lib/import/importabschluss/gesetzesXMLNachbereiten';
/** Übernimmt bereits vorverarbeitetes EU-Bundle-XML ohne erneutes Tagging.
 * Vergleicht vorhandene Version derselben Quelle, ersetzt nur neuere Versionen;
 * gleiche/ältere oder Format-/Speicherfehler liefern art:fehler. Bestandslese- und
 * Fortschritt-Callbackfehler können werfen; neuere Versionen bewahren die Schreibweise des Bestands.
 * Optionaler Empfänger erhält Lade-/Speicherbefunde; Titel-Folgefehler erhält den Importerfolg.
 */
export { importiereGesetzesXML } from '@/lib/import/importabschluss/gesetzesXMLImport';

/** Begrenzter Kontext für vollständige Einzel-/Sammelarbeit. Meldet im finally
 * eingeschränkte Referenzen gebündelt an den optionalen Vorgangsempfänger;
 * ohne Empfänger bleibt das gemeinsame Hauptfensterbanner der Standard.
 * Arbeitsfehler bleiben erhalten; alle gestarteten Worker muss die Arbeit vor
 * ihrem Ende abwarten. Kontext endet mit dem Vorgang, keine dauerhaften Caches.
 */
export { mitReferenzKontext } from './referenzKontext';
export type { ReferenzKontext } from './referenzKontext';

/** Prüft die vollständige Reparaturreferenz und die konkrete Dateiidentität. */
export { pruefeReparaturreferenz } from './gesetzImportZiel';

export { pruefeDateibestandVorErstimport } from './gesetzImportZiel';
