// bund.index.ts
// Fassade der Bundesrechtsquelle; Nachbereitung/Speicherung bleiben intern delegiert.

/** Reine BJA-XML-Konvertierung; keine Netz-/Dateizugriffe oder Referenzbeschaffung. */
export { importiereBundXML } from '@/lib/import/bund/XMLImporterBund';

/** Löst den Bundesindexeintrag auf, prüft quellenbezogenen aktuellen Bestand,
 * lädt/entpackt/konvertiert/taggt/speichert. Registrierung/Gesetzsperre übernimmt
 * Dispatch. Importindexfehler werfen oder liefern format/sonstiger, niemals nichtImIndex;
 * nichtImIndex nur bei gültigem Importindex ohne Treffer. Zielprüfung ist Reparaturpfad
 * und darf nicht durch eine pauschale Erstimport-Duplikatprüfung blockiert werden.
 * Referenzfehler laufen über den gemeinsamen Kontext, Tagging läuft weiter.
 * Ergebnis: Gesetz oder Importfehler; I/O-, Callback- und Zielprüfungsfehler können werfen.
 */
export { importiereVomInternet } from '@/lib/import/bund/gesetzImportBund';

/** Aktualisiert ein konkretes Bundesgesetz mit Bestandsvergleich/Speicherabschluss;
 * Diagnosekontext aus einem Batch weiterreichen. Eigene Vorgangsregistrierung
 * oder Gesetzsperre ist hier nicht Bestandteil der Operation.
 * Ergebnis: aktualisiert/unverändert oder Importfehler; I/O-/Callbackfehler können werfen.
 */
export { aktualisierungVomInternet } from '@/lib/import/bund/gesetzImportBund';

/** Vollständiger Live-Indexlauf über mitImportindexVorgang, kooperativ abbrechbar bis
 * Speicherbeginn; Anzeigen/Fehler/Freigabe liegen im gemeinsamen Vorgangsvertrag.
 */
export { erstelleBundesImportindex } from '@/lib/import/bund/importindexErstellungBund';
export { ladeUndEntpackeVonGesetzeImInternet } from './gesetzDownloadBund';
