// useAppUpdatesAutomatischSuchen.ts
// Einstellung „Automatisch nach Updates suchen“ (Allgemein, Vorgabe an).
// Die automatische Updateprüfung in useAutomatischeUpdatepruefung.ts liest den Wert vor jeder
// Anfrage frisch, damit eine Änderung ohne Neumount ab dem nächsten Takt wirkt.
import { APP_UPDATES_AUTOMATISCH_SUCHEN_KEY } from '@/lib/einstellungen/einstellungen.index';
import { useLocalStorageState } from '@/hooks/einstellungen/useLocalStorageState';

/** Nur ein ausdrückliches `false` schaltet ab; fehlend oder ungültig bleibt an. */
function parse(roh: string | null): boolean {
  return roh !== 'false';
}

export function useAppUpdatesAutomatischSuchen() {
  const [appUpdatesAutomatischSuchen, setAppUpdatesAutomatischSuchen] =
    useLocalStorageState<boolean>(APP_UPDATES_AUTOMATISCH_SUCHEN_KEY, true, { parse });
  return { appUpdatesAutomatischSuchen, setAppUpdatesAutomatischSuchen };
}

export function leseAppUpdatesAutomatischSuchen(): boolean {
  try {
    return parse(localStorage.getItem(APP_UPDATES_AUTOMATISCH_SUCHEN_KEY));
  } catch {
    return true;
  }
}
