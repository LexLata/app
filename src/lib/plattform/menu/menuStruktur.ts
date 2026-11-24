// menuStruktur.ts
//
// Reine Daten für das Hamburger-Dropdown-Menü (Tableiste.tsx: ☰-Button auf
// Windows/Linux, testweise auch auf macOS bei aktivierter "Plattformfremde
// UI anzeigen"-Einstellung, siehe hamburgerMenu.ts). Gliederung/Verschachtelung
// ist bewusst ANDERS als die native Menübar (menu.rs) – siehe Absprache
// ("nur Struktur und Anzeige anders"); IDs und Labels werden mit menu.rs
// abgestimmt; die Tastenkürzel stammen aus dem gemeinsamen Katalog.
//
// KÜRZEL-ANZEIGE: `accelerator` wird per Menü-ID aus dem gemeinsamen
// Tastenkürzel-Katalog gelesen. Das OS stellt den Tauri-Accelerator
// plattformgerecht dar (⌘ auf macOS, Strg auf Windows/Linux).
//
// RISIKO bewusst in Kauf genommen (siehe Absprache): auf macOS existiert
// IMMER die echte native Menübar (menu.rs, app.set_menu – nicht nur im
// "Plattformfremde UI"-Testmodus), einige Accelerator hier sind dort
// bereits vergeben (u. a. CmdOrCtrl+Z/⇧Z für das native Bearbeiten-Menü,
// siehe dort). Eine zweite Registrierung durch dieses – wenn auch nur
// kurzlebige – Popup-Menü könnte dort kollidieren. Auf Windows/Linux gibt
// es dagegen GAR KEINE native Menübar (menu::einrichten wird nur unter
// target_os = "macos" aufgerufen, siehe lib.rs), dort ist das Risiko somit
// gleich null. Da das Dropdown auf macOS ohnehin nur zu Testzwecken
// existiert, wird das Risiko dort akzeptiert statt die Anzeige künstlich
// zu unterdrücken.
//
// Labels und IDs bleiben mit menu.rs von Hand abzustimmen. Die gemeinsame
// Kürzelquelle prüfen scripts/automatisch/tastenkuerzel-katalog.test.ts;
// die vollständige ID-Menge prüft das manuell aufgerufene Werkzeug
// scripts/werkzeuge/menuIdsAbgleichen.ts (keine Labels oder Kürzel).
//
// Jede ID hier muss einer ID in menu.rs entsprechen (icon_fuer/
// IconMenuItem::with_id) UND das zugehörige "ereignis" oder "befehl" muss
// tatsächlich empfangen werden (siehe hamburgerMenu.ts: entweder ein
// gezielte Sendung, auf die useMenueEvents.ts bereits hört – wie in menu.rs
// – oder ein rufeBefehl() auf einen bestehenden #[tauri::command]).

import type { Befehlsname } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';
import { tastenkuerzelKatalog } from '@/lib/plattform/tastenkuerzel/tastenkuerzel.index';
import type { MenueEreignis } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
/** Mit Rust abgestimmte Bausteine der beiden Normaktionen. */
export const NORM_MENU_TEXTE = {
  ersatz: 'Ausgewählte Norm',
  'favorit-speichern': {
    speichern: 'als Favoriten speichern',
    entfernen: 'aus Favoriten entfernen',
  },
  'lesezeichen-speichern': {
    speichern: 'als Lesezeichen speichern',
    entfernen: 'aus Lesezeichen entfernen',
  },
} as const;
/** Trennstrich statt eines echten Eintrags – id nur für Object-Identität
 *  innerhalb des Arrays (React-Keys u. Ä.), taucht in keinem Rust-/TS-
 *  Ereignis auf und wird vom ID-Abgleich-Skript (menuIdsAbgleichen.ts)
 *  ignoriert. */
interface MenuTrennstrich {
  trennstrich: true;
  id: string;
}

interface MenuEintrag {
  trennstrich?: false;
  id: string;
  label: string;
  /** Nativer Tauri-Accelerator-String, siehe Kopfkommentar (Risiko/
   *  Konvention). Aus dem gemeinsamen Katalog abgeleitet. */
  accelerator?: string;
  /** Name des Tauri-Events, das beim Klick per emit() ausgelöst wird –
   *  GENAU der Event-Name, auf den useMenueEvents.ts bereits hört (siehe
   *  dort), identisch zu dem, was der jeweilige menu.rs-Zweig per
   *  gezielte native Sendung auslöst. So läuft die komplette bestehende
   *  Handler-Kette (inkl. Fokus-Checks/Einführungs-Sperre) unverändert
   *  auch für Klicks aus dem Dropdown. */
  ereignis?: MenueEreignis;
  /** Für die wenigen Fälle, in denen menu.rs KEIN emit() nutzt, sondern
   *  eine Rust-Funktion/einen bereits registrierten #[tauri::command]
   *  direkt aufruft (siehe menu.rs: "neues-fenster", "markierungskonflikte").
   *  Name des #[tauri::command], wird per rufeBefehl() aufgerufen. */
  befehl?: Extract<Befehlsname, 'neues_fenster_anfordern' | 'markierungskonflikte_fenster_oeffnen'>;
  /** Verschachtelte Einträge – rendert als natives Submenu mit ">"-Chevron
   *  (siehe hamburgerMenu.ts). Ein Eintrag hat entweder kinder ODER
   *  ereignis/befehl, nie beides. */
  kinder?: MenuKnoten[];
}

export type MenuKnoten = MenuEintrag | MenuTrennstrich;

function acceleratorFuer(id: string): string {
  const eintrag = tastenkuerzelKatalog.find((eintrag) => eintrag.id === id);
  if (!eintrag) throw new Error(`Unbekanntes Tastenkürzel: ${id}`);
  return eintrag.accelerator;
}

export const HAMBURGER_MENU_STRUKTUR: MenuKnoten[] = [
  {
    id: 'gesetzesuebersicht',
    label: 'Gesetze verwalten',
    accelerator: acceleratorFuer('gesetzesuebersicht'),
    ereignis: 'gesetzesuebersicht-oeffnen',
  },
  {
    id: 'einstellungen',
    label: 'Einstellungen…',
    accelerator: acceleratorFuer('einstellungen'),
    ereignis: 'einstellungen-oeffnen',
  },
  {
    id: 'fenster',
    label: 'Fenster',
    kinder: [
      {
        id: 'neues-fenster',
        label: 'Neues Fenster',
        accelerator: acceleratorFuer('neues-fenster'),
        befehl: 'neues_fenster_anfordern',
      },
      {
        id: 'neuer-tab',
        label: 'Neuer Tab',
        accelerator: acceleratorFuer('neuer-tab'),
        ereignis: 'leerentab-oeffnen',
      },
      {
        id: 'letzter-tab',
        label: 'Zuletzt geschlossenen Tab öffnen',
        accelerator: acceleratorFuer('letzter-tab'),
        ereignis: 'letzter-tab-oeffnen',
      },
      { trennstrich: true, id: 'trennstrich-fenster-1' },
      {
        id: 'schliessen-tab',
        label: 'Tab schließen',
        accelerator: acceleratorFuer('schliessen-tab'),
        ereignis: 'schliessen-anfrage',
      },
      {
        id: 'fenster-schliessen',
        label: 'Fenster schließen',
        accelerator: acceleratorFuer('fenster-schliessen'),
        ereignis: 'fenster-schliessen-anfrage',
      },
    ],
  },
  {
    id: 'dateien',
    label: 'Dateien',
    kinder: [
      {
        id: 'gesetz-info',
        label: 'Informationen zum geöffneten Gesetz',
        accelerator: acceleratorFuer('gesetz-info'),
        ereignis: 'gesetz-info-oeffnen',
      },
      {
        id: 'dateien-importieren',
        label: 'Dateien importieren…',
        accelerator: acceleratorFuer('dateien-importieren'),
        ereignis: 'dateien-importieren-anfrage',
      },
      {
        id: 'gesetze-aktualisieren',
        label: 'Gesetze aktualisieren',
        accelerator: acceleratorFuer('gesetze-aktualisieren'),
        ereignis: 'gesetze-aktualisieren-oeffnen',
      },
      {
        id: 'gesetzesindizes-aktualisieren',
        label: 'Importindizes aktualisieren',
        ereignis: 'gesetzesindizes-oeffnen',
      },
      {
        id: 'export',
        label: 'Export',
        accelerator: acceleratorFuer('export'),
        ereignis: 'export-oeffnen',
      },
    ],
  },
  {
    id: 'navigation',
    label: 'Navigation',
    kinder: [
      {
        id: 'oeffnen',
        label: 'Gesetz oder Norm öffnen',
        accelerator: acceleratorFuer('oeffnen'),
        ereignis: 'oeffnen-overlay-oeffnen',
      },
      {
        id: 'volltext-suche',
        label: 'Suche im geöffneten Gesetz',
        accelerator: acceleratorFuer('volltext-suche'),
        ereignis: 'volltext-suche-oeffnen',
      },
      {
        id: 'volltext-alle',
        label: 'Suche in allen Gesetzen',
        accelerator: acceleratorFuer('volltext-alle'),
        ereignis: 'volltext-alle-oeffnen',
      },
      {
        id: 'verlauf-anzeigen',
        label: 'Verlauf anzeigen',
        accelerator: acceleratorFuer('verlauf-anzeigen'),
        ereignis: 'verlauf-anzeigen-oeffnen',
      },
    ],
  },
  {
    id: 'lesezeichen-favoriten',
    label: 'Favoriten und Lesezeichen',
    kinder: [
      {
        id: 'favorit-speichern',
        label: `${NORM_MENU_TEXTE.ersatz} ${NORM_MENU_TEXTE['favorit-speichern'].speichern}`,
        accelerator: acceleratorFuer('favorit-speichern'),
        ereignis: 'favorit-speichern',
      },
      {
        id: 'favoriten-hinzufuegen',
        label: 'Mehrere Favoriten hinzufügen',
        ereignis: 'favoriten-hinzufuegen-oeffnen',
      },
      {
        id: 'lesezeichen-speichern',
        label: `${NORM_MENU_TEXTE.ersatz} ${NORM_MENU_TEXTE['lesezeichen-speichern'].speichern}`,
        accelerator: acceleratorFuer('lesezeichen-speichern'),
        ereignis: 'lesezeichen-speichern',
      },
      {
        id: 'alle-lesezeichen-entfernen',
        label: 'Alle Lesezeichen löschen',
        accelerator: acceleratorFuer('alle-lesezeichen-entfernen'),
        ereignis: 'alle-lesezeichen-entfernen-anfrage',
      },
    ],
  },
  {
    id: 'markierungen',
    label: 'Markierungen',
    kinder: [
      {
        id: 'unterstreichen',
        label: 'Unterstreichen',
        accelerator: acceleratorFuer('unterstreichen'),
        ereignis: 'unterstreichen-anfrage',
      },
      {
        id: 'hervorheben',
        label: 'Hervorheben',
        accelerator: acceleratorFuer('hervorheben'),
        ereignis: 'hervorheben-anfrage',
      },
      {
        id: 'verweismarkierung',
        label: 'Verweis',
        accelerator: acceleratorFuer('verweismarkierung'),
        ereignis: 'verweismarkierung-anfrage',
      },
      {
        id: 'kommentar',
        label: 'Kommentar',
        accelerator: acceleratorFuer('kommentar'),
        ereignis: 'kommentar-anfrage',
      },
      { trennstrich: true, id: 'trennstrich-markierungen-1' },
      // Anders als die Menübar (dort bewusst OHNE accelerator, siehe
      // menu.rs, wegen Kollision mit dem nativen Bearbeiten-Undo/Redo):
      // hier MIT Anzeige – auf Windows/Linux gibt es keine Kollision (kein
      // natives Bearbeiten-Menü), auf macOS wird das Kollisionsrisiko
      // bewusst in Kauf genommen (siehe Kopfkommentar).
      {
        id: 'markierung-rueckgaengig',
        label: 'Markierung rückgängig',
        accelerator: acceleratorFuer('markierung-rueckgaengig'),
        ereignis: 'markierung-rueckgaengig-anfrage',
      },
      {
        id: 'markierung-wiederholen',
        label: 'Markierung wiederholen',
        accelerator: acceleratorFuer('markierung-wiederholen'),
        ereignis: 'markierung-wiederholen-anfrage',
      },
      { trennstrich: true, id: 'trennstrich-markierungen-2' },
      {
        id: 'markierungskonflikte',
        label: 'Markierungskonflikte verwalten',
        befehl: 'markierungskonflikte_fenster_oeffnen',
      },
    ],
  },
  {
    id: 'hilfe',
    label: 'Hilfe',
    kinder: [
      {
        id: 'einfuehrung-neu-starten',
        label: 'Einführung erneut durchführen',
        ereignis: 'einfuehrung-neu-starten-anfrage',
      },
      { id: 'tastenkuerzel', label: 'Tastenkürzel', ereignis: 'tastenkuerzel-oeffnen' },
      { id: 'datenschutz', label: 'Datenschutz', ereignis: 'datenschutz-oeffnen' },
      { id: 'ueber', label: 'Über LexLata', ereignis: 'ueber-oeffnen' },
      {
        id: 'nach-updates-suchen',
        label: 'Nach Updates suchen…',
        ereignis: 'nach-updates-suchen-anfrage',
      },
    ],
  },
];
