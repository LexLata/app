// Öffentliche Schnittstelle des lib/import-export-Moduls (Deep Module nach
// Ousterhout: schmale Schnittstelle, viel verborgene Logik).
// Bündelt den Dateiimport samt Konfliktauflösung und die Speicheroperationen
// für den Export. Die innere Fassade erhält die dynamische
// Ladegrenze der Datei-/Dialogimplementierung.
//
// REGEL (durchgesetzt über dependency-cruiser, siehe
// scripts/automatisch/modulgrenzen.cjs): Code außerhalb von
// src/lib/import-export/** darf ausschließlich aus DIESER Datei
// importieren, nie direkt aus den Unterordnern.

// ---------------------------------------------------------------------------
// datei-import/ – Datei-Import (Datei-Dialog-Mehrfachauswahl/ZIP) +
// Konfliktauflösung nach Nutzerentscheidung.
// ---------------------------------------------------------------------------

export type {
  ImportKonflikt,
  ImportAktion,
  BerichtEintrag,
  DateiImportErgebnis,
  DateiImportZustand,
  ImportFehler,
} from '@/lib/import-export/datei-import/datei-import.index';

export {
  gliedereImportbericht,
  betroffenesGesetz,
  meldungAlsImportFehler,
  waehleImportDateien,
  starteDateiImport,
  abonniereDateiImportZustand,
  verwerfeDateiImportErgebnis,
  leseDateiImportZustand,
  useDateiImportZustand,
  istReinerImportErfolg,
  dateiImportErfolgstext,
  ermittleImportAktionen,
  loeseImportKonflikt,
} from '@/lib/import-export/datei-import/datei-import.index';

// ---------------------------------------------------------------------------
// exportSpeicher.ts – App-Sicherung als ZIP.
// ---------------------------------------------------------------------------

export type { ExportKategorie } from '@/lib/import-export/exportSpeicher';

export { exportiere } from '@/lib/import-export/exportSpeicher';

export { waehleExportZiel } from '@/lib/import-export/exportZiel';

export { ImportAbschlussFehler } from '@/lib/import-export/datei-import/datei-import.index';
