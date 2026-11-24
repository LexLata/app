// menueZustandSync.ts
// Merkt den Gesetz-/Auswahlstatus dieses Fensters und pflegt den lokalen Menüstore.
// Eine native Fokus-Anfrage wird ausschließlich im eigenen WebView beantwortet;
// der Store liefert dafür die zuletzt bekannten lokalen Werte erneut an Rust.

import { hoereImEigenenFenster } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
import {
  synchronisiereNativenZustand,
  setzeAktiv,
} from '@/lib/plattform/menu/menuAktivZustandStore';

let istGesetzOffen = false;
let hatTextAuswahl = false;

const GESETZ_ABHAENGIGE_IDS = [
  'volltext-suche',
  'verlauf-anzeigen',
  'gesetz-info',
  'favorit-speichern',
  'favoriten-hinzufuegen',
  'lesezeichen-speichern',
  'verweismarkierung',
  'kommentar',
] as const;
const AUSWAHL_ABHAENGIGE_IDS = ['unterstreichen', 'hervorheben'] as const;

function gesetzStatusSenden(): void {
  for (const id of GESETZ_ABHAENGIGE_IDS) setzeAktiv(id, istGesetzOffen);
}

function auswahlStatusSenden(): void {
  for (const id of AUSWAHL_ABHAENGIGE_IDS) setzeAktiv(id, hatTextAuswahl);
}

/** Von App.tsx/useAppTabs.ts bei jeder Änderung aufgerufen (aktiver Tab
 *  wechselt, Tab bekommt/verliert sein Gesetz). */
export function meldeGesetzOffenStatus(offen: boolean): void {
  istGesetzOffen = offen;
  gesetzStatusSenden();
}

/** Von useTextauswahl.ts bei jeder `selectionchange` aufgerufen. */
export function meldeTextAuswahlStatus(auswahl: boolean): void {
  hatTextAuswahl = auswahl;
  auswahlStatusSenden();
}

/** Antwortet nur auf Anfragen an das eigene WebView. Der lokale Store meldet
 * fensterlokale Werte erneut; der Callback gleicht den gemeinsamen Stapel ab.
 * Rust prüft vor Anwendung lokaler Werte nochmals das zuständige Menüziel. */
export function registriereMenuZustandAnfrageListener(
  synchronisiereGeschlosseneTabs: () => void,
): () => void {
  const anmeldung = hoereImEigenenFenster('menu-zustand-anfordern', () => {
    synchronisiereNativenZustand();
    synchronisiereGeschlosseneTabs();
  });
  void anmeldung.bereit.catch((fehler) =>
    console.error('Menüzustandsanfrage konnte nicht angemeldet werden:', fehler),
  );
  return anmeldung.abmelden;
}
