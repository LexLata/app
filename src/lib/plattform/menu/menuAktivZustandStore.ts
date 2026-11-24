// menuAktivZustandStore.ts
// Fensterlokaler Aktivzustand für das Hamburger-Menü und native Statusmeldungen.
// Jeder ☰-Klick liest die aktuellen Werte. Rust ordnet Statusmeldungen dem echten
// aufrufenden Fenster zu und prüft das zuständige Menüziel; der gemeinsame Stapel
// geschlossener Tabs bleibt gesondert. Bei Fokuswechsel werden lokale Werte erneut
// gemeldet, auch Undo/Redo. Der Stapelwert wird aus der Persistenz neu abgeglichen.

import { menuItemAktivieren, menuNormstatusMelden } from '@/lib/plattform/tauriHelpers';

import { NORM_MENU_TEXTE } from './menuStruktur';

export interface MenueNormstatus {
  bezeichnung: string | null;
  ist_favorit: boolean;
  ist_lesezeichen: boolean;
}
let normstatus: MenueNormstatus = { bezeichnung: null, ist_favorit: false, ist_lesezeichen: false };

/** Speichert nur diesen Fensterstand; unveränderte Werte erzeugen keine native Meldung. */
export function meldeNormstatus(wert: MenueNormstatus): void {
  if (
    normstatus.bezeichnung === wert.bezeichnung &&
    normstatus.ist_favorit === wert.ist_favorit &&
    normstatus.ist_lesezeichen === wert.ist_lesezeichen
  )
    return;
  normstatus = { ...wert };
  void menuNormstatusMelden(normstatus);
}

/** Sichtbarer Text der Normaktionen; andere Menüpunkte behalten ihre Beschriftung. */
export function menuText(id: string): string | null {
  if (id !== 'favorit-speichern' && id !== 'lesezeichen-speichern') return null;
  const gespeichert =
    normstatus.bezeichnung !== null &&
    (id === 'favorit-speichern' ? normstatus.ist_favorit : normstatus.ist_lesezeichen);
  return `${normstatus.bezeichnung ?? NORM_MENU_TEXTE.ersatz} ${NORM_MENU_TEXTE[id][gespeichert ? 'entfernen' : 'speichern']}`;
}

let zustand: Record<string, boolean> = {};

/** Setzt den Aktiv-Zustand einer Menüpunkt-ID (siehe menu.rs für die
 *  vergebene ID) und stößt den bestehenden Rust-Push (native Mac-Menübar,
 *  no-op außerhalb Tauri/macOS) an. Das Dropdown liest den neuen Zustand
 *  erst beim nächsten ☰-Klick über istAktiv() (siehe hamburgerMenu.ts) –
 *  keine Benachrichtigung dafür nötig. */
export function setzeAktiv(id: string, aktiv: boolean): void {
  zustand = { ...zustand, [id]: aktiv };
  void menuItemAktivieren(id, aktiv);
}

/** Aktiv-Zustand einer ID – fehlt sie im Store (z. B. weil noch nie
 *  gesetzt, oder weil sie TS-seitig gar nicht gepflegt wird, siehe
 *  Kopfkommentar), gilt sie als aktiv. */
export function istAktiv(id: string): boolean {
  return zustand[id] ?? true;
}

/** Bei Fokuswechsel lokale Werte erneut melden, einschließlich Undo/Redo.
 * Der gemeinsame Stapelwert muss separat aus dem aktuellen Stapel kommen. */
export function synchronisiereNativenZustand(): void {
  void menuNormstatusMelden(normstatus);
  for (const [id, aktiv] of Object.entries(zustand)) {
    if (id !== 'letzter-tab') void menuItemAktivieren(id, aktiv);
  }
}
