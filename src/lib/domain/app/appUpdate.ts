// appUpdate.ts
// Vertrag des App-Update-Zustands, den Rust (commands/app_update.rs) an alle
// Hauptfenster meldet. Feldnamen sind mit Rust abgestimmt; reine Typen.

/** Verständlicher Grund eines Fehlers; das technische Detail steht daneben. */
export type AppUpdateFehlergrund = 'keineVerbindung' | 'signatur' | 'sonstiges';

export type AppUpdateZustand =
  | { art: 'ruhe' }
  | { art: 'pruefung' }
  | { art: 'verfuegbar'; version: string; installierbar: boolean; ausgeblendet: boolean }
  | { art: 'herunterladen'; version: string; prozent: number | null; ausgeblendet: boolean }
  | { art: 'bereit'; version: string; ausgeblendet: boolean }
  | {
      art: 'fehler';
      version: string | null;
      grund: AppUpdateFehlergrund;
      detail: string;
      ausgeblendet: boolean;
    };

/** Zustand und seine Reihenfolge im laufenden App-Prozess. */
export type AppUpdateMeldung = AppUpdateZustand & { folge: number };

export type AppUpdateAnlass = 'automatisch' | 'manuell';

/** Ergebnis einer konkreten Updateprüfung, zusätzlich zum gemeldeten Zustand.
 *  Bei `fehler`: `grund` für die Anzeige, `detail` (englisch) nur für die Konsole. */
export interface AppUpdatePruefergebnis {
  ergebnis: 'gefunden' | 'aktuell' | 'nichtFaellig' | 'laeuftBereits' | 'fehler';
  laufenderVorgang?: 'pruefung' | 'herunterladen';
  grund?: AppUpdateFehlergrund;
  detail?: string;
}

/** Ergebnis der Beenden-Anfrage vor der Installation oder Rückkehr des Installers. */
export type AppUpdateInstallationsergebnis =
  'beendenLaeuftBereits' | 'abbruch' | 'installationAufgerufen';
