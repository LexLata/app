// gesetzDateiImport.ts
// Datei-Import (lokale XML/HTML-Datei oder ZIP-Archiv öffnen). Bleibt auf
// Dialog-Öffnen + Datei-Lesen (Text bzw. Binär bei ZIP) beschränkt – die
// gesamte Formaterkennung, Dopplungserkennung und das eigentliche
// Schreiben/Zusammenführen läuft über dateiImport.ts (siehe dort für
// die Aufteilung in sofortigen Import/Bericht/Konflikt). Ausgelagert aus
// gesetzSpeicher.ts.

import { readTextFile, readFile } from '@tauri-apps/plugin-fs';
import { nativeDateiOeffnen } from '@/lib/plattform/tauriHelpers';
import { entpackeZip, verarbeiteDateien } from '@/lib/import-export/datei-import/dateiImport';
import type {
  DateiImportFortschrittEmpfaenger,
  RohDatei,
  DateiImportErgebnis,
  ImportFehler,
} from '@/lib/import-export/datei-import/dateiImport.types';

/** Liest ausgewählte oder gedroppte Pfade (ZIP binär, andere als Text) und
 * verarbeitet sie. Lesefehler werden im Ergebnis gesammelt, während andere
 * Dateien erfolgreich importiert werden können; nicht abgefangene Fehler aus
 * der Verarbeitung werden weitergereicht. Der Fortschrittsempfänger erhält
 * vor jedem Pfad eine Meldung der Lesephase, danach die Meldungen von
 * verarbeiteDateien einschließlich der Schlussmeldung.
 *
 * Vertrag: Verarbeitet ausgewählte Pfade; eine leere Liste ergibt ein leeres Ergebnis.
 * Lese-, ZIP- und dateibezogene Verarbeitungsfehler werden mit Dateinamen
 * gesammelt und die übrigen Dateien sequenziell weiterverarbeitet. Erfolge,
 * unveränderte Dateien, offene Konflikte und Fehler können gemeinsam auftreten.
 * Herkunft bleibt auch für Konfliktentscheidungen erhalten. Nicht lesbare
 * Markierungseinträge werden mit Ausgangsstelle und Grund im Bericht geführt;
 * ausschließlich ungültiger Eingang ändert keinen Bestand. Synchrone Hinweise
 * der Nutzerdatenspeicher bleiben samt Bestandsquelle beim jeweiligen Dateiimport.
 * Abweichende Eingangsschemaversionen und tatsächlich verwendete Referenzdiagnosen
 * werden dateiweise im Bericht gesammelt, ohne zusätzlichen Hauptfensterhinweis.
 * Markierungsaktionen warten nach Quellfreigabe höchstens 30 Sekunden auf
 * registrierte Folgeläufe. Nicht bestätigte Abschlüsse und spätere Befunde
 * ergänzen dieselben Berichtseinträge; deren Anzeigeanschluss ist abmeldbar.
 * Ein fehlgeschlagenes Fensterereignis nach Speicherung ist ein Folgehinweis;
 * Speicherfehler liefern keinen erfolgreichen Berichtseintrag.
 * Einstellungen melden einzelne Übernahmefehler und den tatsächlichen Stand;
 * ihr verzögertes Backup gehört mit eigener Fehleranzeige zum selben Abschluss.
 * Fehler beim Aufbau oder Abschluss des gemeinsamen Importvorgangs dürfen
 * werfen. Bereits ausgeführte Schreiboperationen bleiben auch bei späteren
 * Fehlern erhalten; es gibt keinen Rollback und keine automatische Wiederholung. */
export async function importierePfade(
  pfadListe: string[],
  fortschritt?: DateiImportFortschrittEmpfaenger,
): Promise<DateiImportErgebnis> {
  const dateien: RohDatei[] = [];
  const leseFehler: ImportFehler[] = [];

  for (const [index, pfad] of pfadListe.entries()) {
    const dateiname = pfad.split(/[/\\]/).pop() ?? pfad;
    fortschritt?.({ phase: 'lesen', erledigt: index, gesamt: pfadListe.length, datei: dateiname });
    const mehrfach =
      pfadListe.filter((p) => (p.split(/[/\\]/).pop() ?? p) === dateiname).length > 1;
    const quelle = mehrfach ? pfad : dateiname;
    try {
      if (pfad.toLowerCase().endsWith('.zip')) {
        const binaerDaten = await readFile(pfad);
        dateien.push(...(await entpackeZip(binaerDaten.buffer as ArrayBuffer, quelle)));
      } else {
        dateien.push({ name: dateiname, inhalt: await readTextFile(pfad), quelle });
      }
    } catch (e) {
      console.error(`Datei-Import: ${quelle} nicht lesbar:`, e);
      leseFehler.push({ grund: 'lesefehler', datei: quelle, detail: String(e) });
    }
  }

  const ergebnis = await verarbeiteDateien(dateien, fortschritt);
  if (leseFehler.length > 0) ergebnis.fehler.push(...leseFehler);
  return ergebnis;
}

/** Öffnet einen nativen Datei-Dialog mit Mehrfachauswahl (XML/HTML/ZIP).
 * Liefert die gewählten Pfade oder null bei Abbruch; gelesen wird nichts. */
export async function waehleImportDateien(): Promise<string[] | null> {
  const pfade = await nativeDateiOeffnen({
    multiple: true,
    filters: [{ name: 'Gesetzesdatei', extensions: ['xml', 'html', 'htm', 'zip'] }],
  });
  if (!pfade || (Array.isArray(pfade) && pfade.length === 0)) return null; // Abgebrochen
  return Array.isArray(pfade) ? pfade : [pfade];
}
