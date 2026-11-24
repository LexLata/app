// Einstellungen bleiben im localStorage die Laufzeitquelle. Import und Zurücksetzen
// ändern den Bestand; das Backup im Datenordner schützt zusätzlich vor Datenverlust.
// Nur beim leeren Startbestand wird das geprüfte Backup vor dem ersten Render
// wiederhergestellt. XML-Aufbau und Übernahme liegen intern in einstellungenXML.ts.
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { LETZTER_EXPORT_ORDNER_KEY } from '@/lib/einstellungen/speicherschluessel';
import {
  EXPORTIERBARE_SCHLUESSEL,
  uebernehmeEinstellungenXML,
  sendeStorageEvent,
} from './einstellungenXML';
import { loescheEinstellungenBackup, meldeEinstellungenGeaendert } from './einstellungenBackup';
export {
  baueEinstellungenXML,
  keineEinstellungExplizitGesetzt,
  einstellungenOhneVerarbeitungszeit,
} from './einstellungenXML';

// Zurücksetzen umfasst zusätzlich den nicht exportierbaren letzten Exportordner.
const ALLE_SCHLUESSEL = [...EXPORTIERBARE_SCHLUESSEL, LETZTER_EXPORT_ORDNER_KEY];

/** Liefert den tatsächlichen Übernahmestand und meldet Einzelprobleme an den
 * Importbesitzer. Sein verzögertes Backup ist vor Rückgabe als Folgelauf erfasst.
 * Wiederherstellung nutzt die interne Übernahme ohne erneute Backup-Schreibung. */
export function wendeEinstellungenXMLAn(xml: string, empfangen?: AktionsMeldungEmpfaenger) {
  const ergebnis = uebernehmeEinstellungenXML(xml);
  for (const text of ergebnis.fehler)
    empfangen?.({
      typ: 'fehler',
      art: 'fehler',
      anlass: 'import',
      aenderungsstand: ergebnis.aenderungsstand,
      text,
    });
  meldeEinstellungenGeaendert(undefined, empfangen);
  return ergebnis;
}

/** Reset-Button (EinstellungenFenster.tsx): setzt ALLE Einstellungen
 *  zurück, inklusive letztem Exportordner (siehe ALLE_SCHLUESSEL-Kommentar
 *  oben) – anders als wendeEinstellungenXMLAn gibt es hier nichts zu
 *  übernehmen, nur zu entfernen. */
export async function setzeEinstellungenZurueck(): Promise<{ erfolgreich: boolean }> {
  try {
    await loescheEinstellungenBackup(() => {
      for (const schluessel of ALLE_SCHLUESSEL) {
        try {
          localStorage.removeItem(schluessel);
        } catch {
          /* localStorage nicht verfügbar */
        }
        sendeStorageEvent(schluessel, null);
      }
    });
    return { erfolgreich: true };
  } catch {
    return { erfolgreich: false };
  }
}
