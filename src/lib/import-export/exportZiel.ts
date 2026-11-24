// exportZiel.ts
// Gemeinsamer Speichern-Dialog für Sammel- und Einzelgesetzexporte. Merkt nur
// bestätigte Exportordner in der bestehenden, rechnerspezifischen Einstellungsablage.
// Fehler beim Lesen oder Merken verhindern den bestätigten Export nicht.
// Dünne I/O-Orchestrierung ohne eigene fachliche Logik; die nativen
// Anzeige-/Originaldatenvertrag ist in exportZiel.test.ts abgesichert;
// die sichtbare native Darstellung wird manuell in der App geprüft.

import { nativeDateiSpeichern } from '@/lib/plattform/tauriHelpers';
import {
  downloadsOrdner,
  ermittleDateiordner,
  verbindeDateipfad,
} from '@/lib/plattform/dateipfade';
import { LETZTER_EXPORT_ORDNER_KEY } from '@/lib/einstellungen/einstellungen.index';

export async function waehleExportZiel(
  dateiname: string,
  dialogFilter: { name: string; extensions: string[] },
): Promise<string | null> {
  let ordner: string | null = null;
  try {
    ordner = localStorage.getItem(LETZTER_EXPORT_ORDNER_KEY);
  } catch {
    // Ohne verfügbare Einstellungsablage beginnt der Dialog in Downloads.
  }
  let defaultPath = dateiname;
  try {
    ordner ||= await downloadsOrdner();
    defaultPath = await verbindeDateipfad(ordner, dateiname);
  } catch {
    // Falls die Pfadauflösung scheitert, bleibt der Dateiname vorausgewählt.
  }
  const pfad = await nativeDateiSpeichern({ defaultPath, filters: [dialogFilter] });
  if (!pfad) return null;
  try {
    localStorage.setItem(LETZTER_EXPORT_ORDNER_KEY, await ermittleDateiordner(pfad));
  } catch {
    // Der bestätigte Dateipfad bleibt auch ohne erfolgreiches Merken nutzbar.
  }
  return pfad;
}
