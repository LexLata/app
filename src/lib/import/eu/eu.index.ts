// eu.index.ts
// Fassade der EU-Quellenkonvertierung; Verzeichnisverwaltung liegt in importindex.
// Verzeichniszugriff und Speicherung liegen hinter ihren jeweiligen Fassaden.

/** Importiert verfügbare deutsche Formex-Fassungen und speichert mit Nachbereitung.
 * Liefert das gemeinsame Importergebnis; trennt Format-, Download-, Verbindungs-
 * und Verfügbarkeitsfehler. 404/406 erlauben genau einen Fassungsrückfall; nach erfolgreichem Speichern meldet der vorhandene Bannerweg eine abweichende Fassung.
 */
export { importiereVomInternetEU, aktualisierungVomInternetEU } from './gesetzImportEU';

/** Erstellt den deutschen EU-Importindex; Ergebnis enthält Anzahl oder Fehlertext.
 * Abbruch vor Speicherbeginn erhält den Bestand, Fehler schließen den Banner ab. */
export { erstelleEuImportindex } from './importindexErstellungEU';

/** Speicherfreie Beschaffung mit unterscheidbaren Ergänzungsursachen und Offline-Konvertierung. */
export { ladeEuQuelle } from './euDownload';
export type { EuHerkunft, EuQuelle, EuDownload } from './euDownload';
export { konvertiereEuQuelle } from './euKonvertierung';

export { extrahiereEuErwaegungsgruende } from './erwaegungsgruendeEU';
