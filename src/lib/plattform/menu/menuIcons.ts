// menuIcons.ts
//
// TS-seitiges Pendant zu icon_fuer() in menu.rs: liefert für eine
// Menüpunkt-ID den Pfad zur passenden PNG-Icon-Ressource (hell/dunkel ×
// aktiv/inaktiv), für das Hamburger-Dropdown-Menü (hamburgerMenu.ts) auf
// Windows/Linux. Nutzt DIESELBEN Bild-Dateien wie die native macOS-Menübar
// (src-tauri/icons/menu/{light,dark}{,-disabled}/*.png) – zusätzlich als
// Tauri-Resource gebündelt (siehe tauri.conf.json: bundle.resources,
// Eintrag "icons/menu") und über resolveResource() erreichbar, statt eine
// zweite Icon-Quelle/-Kopie zu pflegen.
//
// Icon-Zuordnungen werden mit icon_fuer() in menu.rs von Hand abgestimmt.
// Tastenkürzel dagegen lesen beide Menüs aus dem gemeinsamen Katalog.

const ICON_DATEI: Record<string, string> = {
  'alle-lesezeichen-entfernen': 'alle_lesezeichen_entfernen.png',
  tastenkuerzel: 'tastenkuerzel.png',
  datenschutz: 'datenschutz.png',
  // Bewusst dasselbe Lucide-Info-Icon wie gesetz-info.
  ueber: 'gesetz_info.png',
  'dateien-importieren': 'dateien_importieren.png',
  'einfuehrung-neu-starten': 'einfuehrung_neu_starten.png',
  einstellungen: 'einstellungen.png',
  export: 'export.png',
  'favorit-speichern': 'favorit_speichern.png',
  'favoriten-hinzufuegen': 'favoriten_hinzufuegen.png',
  'fenster-schliessen': 'fenster_schliessen.png',
  'gesetz-info': 'gesetz_info.png',
  'gesetze-aktualisieren': 'gesetze_aktualisieren.png',
  'gesetzesindizes-aktualisieren': 'gesetzesindizes_aktualisieren.png',
  oeffnen: 'oeffnen.png',
  gesetzesuebersicht: 'gesetzesuebersicht.png',
  hervorheben: 'hervorheben.png',
  kommentar: 'kommentar.png',
  'lesezeichen-speichern': 'lesezeichen_speichern.png',
  'letzter-tab': 'letzter_tab.png',
  'markierung-rueckgaengig': 'markierung_rueckgaengig.png',
  'markierung-wiederholen': 'markierung_wiederholen.png',
  markierungskonflikte: 'markierungskonflikte.png',
  'nach-updates-suchen': 'nach_updates_suchen.png',
  'neuer-tab': 'neuer_tab.png',
  'neues-fenster': 'neues_fenster.png',
  verweismarkierung: 'verweismarkierung.png',
  'schliessen-tab': 'schliessen_tab.png',
  unterstreichen: 'unterstreichen.png',
  'verlauf-anzeigen': 'verlauf_anzeigen.png',
  'volltext-alle': 'volltext_alle.png',
  'volltext-suche': 'volltext_suche.png',
};

/** Icon-ID je Submenu-Header (siehe Absprache): statt eigener Icons pro
 *  Kategorie wird pragmatisch das Icon eines seiner Kinder übernommen. Kein
 *  Gegenstück in menu.rs nötig – die native Menübar zeigt an den
 *  entsprechenden Submenu-Titeln ohnehin keine Icons (dort nur die Chevrons
 *  von IconMenuItem für die BLATT-Einträge). */
const SUBMENU_ICON_ID: Record<string, string> = {
  hilfe: 'einfuehrung-neu-starten',
  fenster: 'neues-fenster',
  dateien: 'dateien-importieren',
  navigation: 'oeffnen',
  'lesezeichen-favoriten': 'favorit-speichern',
  markierungen: 'hervorheben',
};

/** Liefert den auflösbaren Dateipfad zum Icon einer Menüpunkt- oder
 *  Submenu-Header-ID, oder null bei unbekannter ID (z. B. Trennstriche,
 *  siehe Aufrufer). `aktiv` steuert nur bei Blatt-Einträgen die
 *  ausgegraute Variante (siehe menuAktivZustandStore.ts: istAktiv) –
 *  Submenu-Header bekommen (wie in der Menübar) immer die aktive Variante,
 *  da sie selbst nie ausgegraut werden (siehe Kopfkommentar
 *  menuAktivZustandStore.ts: das Dropdown ist nur innerhalb eines bereits
 *  offenen, fokussierten Fensters erreichbar). */
export async function menuIconPfad(
  id: string,
  dunkel: boolean,
  aktiv: boolean,
): Promise<string | null> {
  const istSubmenuHeader = id in SUBMENU_ICON_ID;
  const iconDateiId = SUBMENU_ICON_ID[id] ?? id;
  const datei = ICON_DATEI[iconDateiId];
  if (!datei) return null;
  const effektivAktiv = istSubmenuHeader ? true : aktiv;
  const ordner = dunkel
    ? effektivAktiv
      ? 'dark'
      : 'dark-disabled'
    : effektivAktiv
      ? 'light'
      : 'light-disabled';
  const { ressourcenPfad: resolveResource } = await import('@/lib/plattform/dateipfade');
  try {
    return await resolveResource(`icons/menu/${ordner}/${datei}`);
  } catch {
    return null; // z. B. Browser-Dev-Modus ohne Tauri
  }
}

/** Echtes System-Farbschema, direkt per matchMedia abgefragt – NICHT über
 *  data-farbschema auf <html> (das spiegelt die App-EINSTELLUNG
 *  "Farbschema", die bewusst vom System abweichen kann, siehe
 *  useFarbschema.ts). Das native Hamburger-Popup-Menü wird vom
 *  Betriebssystem selbst gezeichnet (Windows-App-Theme bzw. GTK-Theme) und
 *  folgt daher IMMER dem echten System-Schema, unabhängig von der
 *  App-Einstellung – ein hier wie in der App erzwungenes, abweichendes
 *  Schema kann man ihm (wie schon der nativen macOS-Menüleiste, siehe
 *  fenster/menu_sync.rs::system_theme_melden) nicht aufzwingen. Die
 *  Icon-Auswahl muss deshalb zum ECHTEN Schema passen, nicht zur
 *  App-Einstellung. Kein eigener React-State/Hook nötig, da beim
 *  Menü-Aufbau (zeigeHamburgerMenu) ohnehin nur ein synchroner Snapshot
 *  gebraucht wird, kein Live-Update. */
export function aktuellDunkel(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
