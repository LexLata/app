// bw.index.ts
// Fassade der BW-Quelle; WebView-/Formatwissen bleibt hinter dieser Fassade.

/** Reine BW-HTML-Konvertierung, keine WebView-/Dateizugriffe oder Referenzbeschaffung. */
export { importiereGesetzHTMLBW } from '@/lib/import/bw/HTMLImporterBW';

/** Löst den BW-Indexeintrag auf, prüft quellenbezogenen aktuellen Bestand,
 * lädt per WebView, konvertiert, taggt und speichert. Dispatch besitzt
 * Registrierung/Gesetzsperre. Endgültige Importindexfehler sind kein nichtImIndex.
 * Reparaturzielprüfung bleibt wirksam und wird nicht durch die normale
 * Erstimport-Duplikatprüfung blockiert. Referenzfehler hindern das Tagging nicht.
 * Ergebnis: Gesetz oder Importfehler; I/O-, Callback- und Zielprüfungsfehler können werfen.
 */
export { importiereGesetzVomInternetBW } from '@/lib/import/bw/gesetzImportBW';

/** Aktualisiert ein konkretes BW-Gesetz mit gemeinsamem Speicherabschluss.
 * Der Diagnosekontext umfasst bei Batch-Aufrufen alle gestarteten Einzelarbeiten.
 * Registrierung/Gesetzsperre liegen beim Dispatch.
 * Ergebnis: aktualisiert/unverändert oder Importfehler; I/O-/Callbackfehler können werfen.
 */
export { aktualisierungGesetzVomInternetBW } from '@/lib/import/bw/gesetzImportBW';

/** Vollständiger attributerhaltender Live-Abgleich mit mitImportindexVorgang;
 * Abbruch nach letzten Lade-/Warteschritten und vor Speicherbeginn beachten.
 */
export { erstelleLandesrechtBWImportindexNeu } from '@/lib/import/bw/importindexErstellungBW';

/** Lädt den ausgewählten Indexeintrag und konvertiert ohne App-Speicherung. */
export { ladeGesetzHTMLBW, parseGeladenesGesetz } from './gesetzDownloadBW';
