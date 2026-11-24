// fenster/menu_sync.rs
//
// Synchronisation des nativen macOS-Menüzustands (Ein-/Ausgrauen inkl.
// Icon-Wechsel, Theme-Wechsel, Menüleiste komplett sperren) mit dem
// TS-seitigen App-Zustand. Ausgelagert aus fenster.rs (siehe dort für
// Fenster-Erstellung/-Lebenszyklus allgemein) – dieses Modul ist bewusst
// auf "native Menü-Items verwalten" beschränkt, unabhängig davon, WIE ein
// Fenster entsteht. Enthält auch das Öffnen des Markierungskonflikte-
// Fensters, näher an dieser Gruppe als an den generischen Hilfsfenstern
// in fenster/hilfsfenster.rs.

use super::menu_normstatus::{maskiere_menue_text, norm_menu_text, MenueNormstatus};
use tauri::Manager;

/// Öffnet das SKALIERBARE Markierungskonflikte-Fenster (Liste aller
/// Markierungskonflikte, siehe markierungskonflikteSpeicher.ts). Anders als die
/// kompakten, festen Verweismarkierung-/Kommentar-Hilfsfenster (fenster/hilfsfenster.rs), da
/// hier eine potenziell längere Liste dargestellt wird. Singleton mit
/// festem Label "markierungskonflikte" (es gibt laut Absprache immer nur EIN
/// solches Fenster/eine solche Konfliktliste) – ein bereits offenes Fenster
/// wird bei erneutem Aufruf nur in den Vordergrund geholt statt ein zweites
/// zu erzeugen. Holt sich seine Daten beim Laden selbst (siehe
/// main.tsx-Label-Routing, MarkierungskonfliktFenster.tsx) – anders als beim
/// Verweismarkierung-/Kommentar-Fenster ist kein Kontext-Transfer nötig.
#[tauri::command]
pub fn markierungskonflikte_fenster_oeffnen(app: tauri::AppHandle) {
    // Unsichtbar-starten/sichtbar-machen (siehe useFensterSichtbarMachen.ts)
    // und fenster_collection_behavior_setzen (macOS-Space-Verhalten)
    // stecken zentral in resizables_singleton_fenster_oeffnen (fenster.rs).
    super::resizables_singleton_fenster_oeffnen(
        &app,
        "markierungskonflikte",
        "Markierungskonflikte",
        (620.0, 682.0),
        (480.0, 360.0),
    );
}

/// Hält alle Top-Level-Menüs (siehe menu.rs::einrichten), damit
/// menueleiste_aktivieren sie gesammelt aus-/eingrauen kann. Wird NUR auf
/// macOS gemanaged (siehe dortiger Kopfkommentar: einrichten() läuft nur
/// dort) – auf Windows/Linux liefert app.try_state() unten None, der
/// Command tut dann bewusst nichts (dort existiert ohnehin keine native
/// Menüleiste).
pub struct MenueLeisteSubmenus(pub Vec<tauri::menu::Submenu<tauri::Wry>>);

/// Graut die komplette native Menüleiste (alle Top-Level-Menüs) ein oder
/// aus – für die Dauer der Einführung (siehe useEinfuehrung.ts), damit der
/// Nutzer nicht über die Menüleiste an der Tutorial-Führung vorbeikommt.
#[tauri::command]
pub fn menueleiste_aktivieren(app: tauri::AppHandle, window: tauri::WebviewWindow, aktiv: bool) {
    if !ist_hauptfenster(window.label()) {
        return;
    }
    if let Some(bedingungen) = app.try_state::<FensterMenueZustaende>() {
        crate::sperren::sperren(&bedingungen.leiste).insert(window.label().to_owned(), aktiv);
    }
    if !sender_zustaendig(window.label(), menue_hauptfenster(&app).as_deref()) {
        return;
    }
    if let Some(state) = app.try_state::<MenueLeisteSubmenus>() {
        for submenu in &state.0 {
            let _ = submenu.set_enabled(aktiv);
        }
    }
}

/// Generischer Mechanismus für alle Einzel-Menüpunkte, die je nach
/// TS-seitigem Zustand aus-/eingegraut werden (siehe menu.rs::einrichten,
/// dort per app.manage() befüllt und registriert unter der jeweiligen
/// Menü-Item-ID). EIN generischer Mechanismus statt ein eigener
/// Struct+Command pro Menüpunkt – bei mittlerweile vielen Einzelfällen
/// (Zuletzt geschlossenen Tab öffnen, Gesetze aktualisieren, Alle
/// Lesezeichen entfernen, Schließen/Fenster schließen, ...) wäre eine Kopie
/// desselben Musters pro Punkt reine Duplication gewesen.
/// Wird NUR auf macOS gemanaged (siehe menu.rs-Kopfkommentar) – auf
/// anderen Plattformen liefert app.try_state() unten None, der Command
/// tut dann bewusst nichts.
pub struct MenuItemRegistry(
    pub std::collections::HashMap<&'static str, tauri::menu::IconMenuItem<tauri::Wry>>,
);

/// Hält das aktuell bekannte Erscheinungsbild (Hell/Dunkel) als App-weiten
/// Zustand vor, damit Code, der ein Icon setzt (siehe setze_menu_item_status
/// unten), nicht jedes Mal ein Fenster abfragen muss, um zu wissen, welche
/// der beiden Icon-Farbvarianten gerade richtig ist. Wird über
/// system_theme_melden (unten) von der JS-Seite aktualisiert.
#[derive(Default)]
pub struct AktuellesTheme(pub std::sync::atomic::AtomicBool);

/// Das echte System-Farbschema steuert ausschließlich die nativen Menü-Icons.
/// Auf macOS hält Tao den Systemzustand getrennt von unserer fensterlokalen
/// NSAppearance: Wir überschreiben NSApplication nicht. matchMedia kann im
/// erzwungenen Fenster dagegen dessen Hell-/Dunkel-Schema spiegeln.
#[tauri::command]
pub fn system_theme_melden(app: tauri::AppHandle, window: tauri::WebviewWindow, dunkel: bool) {
    #[cfg(target_os = "macos")]
    let dunkel = window
        .theme()
        .map(|theme| theme == tauri::Theme::Dark)
        .unwrap_or(dunkel);
    #[cfg(not(target_os = "macos"))]
    let _ = window;
    theme_aktualisieren(&app, dunkel);
}

/// Zentraler Ein-/Ausgrau-Setzer für Menüpunkte MIT Icon: setzt sowohl
/// set_enabled als auch das passende Icon (hell/dunkel × aktiv/inaktiv, siehe
/// menu::menu_icon_aktualisieren) – Grund: Tauri dimmt eigene Bitmap-Icons NICHT
/// automatisch beim Ausgrauen (das tut es nur bei den eingebauten
/// NativeIcon-Symbolen, siehe Absprache), wir müssen das also selbst
/// nachbilden. ALLE Stellen in dieser Datei, die zuvor nur `item.set_enabled`
/// aufgerufen haben, rufen jetzt stattdessen diese Funktion auf.
fn setze_menu_item_status(
    app: &tauri::AppHandle,
    id: &str,
    item: &tauri::menu::IconMenuItem<tauri::Wry>,
    aktiv: bool,
) {
    let _ = item.set_enabled(aktiv);
    #[cfg(target_os = "macos")]
    {
        let dunkel = app
            .try_state::<AktuellesTheme>()
            .map(|t| t.0.load(std::sync::atomic::Ordering::Relaxed))
            .unwrap_or(false);
        crate::menu::menu_icon_aktualisieren(app, id, item, dunkel, aktiv);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, id);
    }
}

/// Interner Kern von system_theme_melden – ebenfalls direkt (ohne
/// Command-Overhead) aufrufbar, aktuell aber ausschließlich von dort
/// verwendet.
fn theme_aktualisieren(app: &tauri::AppHandle, dunkel: bool) {
    if let Some(state) = app.try_state::<AktuellesTheme>() {
        state.0.store(dunkel, std::sync::atomic::Ordering::Relaxed);
    }
    #[cfg(target_os = "macos")]
    crate::menu::menu_icons_theme_aktualisieren(app, dunkel);
}

/// Technische Snapshots fensterlokaler Menüwerte und Einführungssperren.
/// Fokuswechsel dürfen niemals den zuletzt von einem fremden Fenster gemeldeten
/// Zustand übernehmen. Gemeinsame Werte werden hier nicht gespeichert.
#[derive(Default)]
pub struct FensterMenueZustaende {
    pub fenster: std::sync::Mutex<
        std::collections::HashMap<String, std::collections::HashMap<String, bool>>,
    >,
    pub normen: std::sync::Mutex<std::collections::HashMap<String, MenueNormstatus>>,
    pub leiste: std::sync::Mutex<std::collections::HashMap<String, bool>>,
    // Auch Hilfsfenster merken: Sie sperren die Umleitung an ein Hauptfenster.
    pub letzter_fokus: std::sync::Mutex<Option<String>>,
}

impl FensterMenueZustaende {
    fn normstatus_melden(&self, sender: &str, status: MenueNormstatus, ziel: Option<&str>) -> bool {
        if !ist_hauptfenster(sender) {
            return false;
        }
        crate::sperren::sperren(&self.normen).insert(sender.to_owned(), status);
        sender_zustaendig(sender, ziel)
    }

    fn normstatus_fuer_ziel(&self, ziel: Option<&str>) -> MenueNormstatus {
        ziel.and_then(|label| crate::sperren::sperren(&self.normen).get(label).cloned())
            .unwrap_or_default()
    }

    fn bereinige(&self, vorhanden: impl Fn(&str) -> bool) {
        crate::sperren::sperren(&self.fenster).retain(|label, _| vorhanden(label));
        crate::sperren::sperren(&self.leiste).retain(|label, _| vorhanden(label));
        crate::sperren::sperren(&self.normen).retain(|label, _| vorhanden(label));
    }
}

fn normtexte_anwenden(app: &tauri::AppHandle, status: &MenueNormstatus) {
    if let Some(registry) = app.try_state::<MenuItemRegistry>() {
        for id in ["favorit-speichern", "lesezeichen-speichern"] {
            if let Some(item) = registry.0.get(id) {
                let _ = item.set_text(maskiere_menue_text(&norm_menu_text(id, status)));
            }
        }
    }
}

#[tauri::command]
pub fn menu_normstatus_melden(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    status: MenueNormstatus,
) {
    if let Some(zustaende) = app.try_state::<FensterMenueZustaende>() {
        let ziel = menue_hauptfenster(&app);
        if zustaende.normstatus_melden(window.label(), status, ziel.as_deref()) {
            normtexte_anwenden(&app, &zustaende.normstatus_fuer_ziel(ziel.as_deref()));
        }
    }
}

pub(crate) fn ist_bedienfenster(label: &str) -> bool {
    label != super::ziehvorschau::LABEL
}

/// Sichtbare Bedienfenster bestimmen weiterhin den Öffnungsweg für geschlossene Tabs.
#[cfg(any(target_os = "macos", test))]
pub(crate) fn hat_sichtbare_bedienfenster<'a>(
    fenster: impl IntoIterator<Item = (&'a str, bool)>,
) -> bool {
    fenster
        .into_iter()
        .any(|(label, sichtbar)| ist_bedienfenster(label) && sichtbar)
}

pub(crate) fn menue_bei_ereignis_synchronisieren(event: &tauri::WindowEvent) -> bool {
    !matches!(event, tauri::WindowEvent::Moved(_))
}

pub fn ist_hauptfenster(label: &str) -> bool {
    !label.starts_with("verweismarkierung-")
        && !label.starts_with("kommentar-")
        && label != "markierungskonflikte"
        && label != "einstellungen"
        && ist_bedienfenster(label)
}

/// Fokusverlust an eine andere App löscht die Menüzuordnung nicht.
/// Hilfsfensterfokus wird ebenfalls gemerkt und erlaubt keine Umleitung.
pub fn menue_fokus_merken<R: tauri::Runtime>(app: &tauri::AppHandle<R>, label: &str) {
    if !ist_bedienfenster(label) {
        return;
    }
    if let Some(zustaende) = app.try_state::<FensterMenueZustaende>() {
        *crate::sperren::sperren(&zustaende.letzter_fokus) = Some(label.to_owned());
    }
}

pub fn menue_hauptfenster(app: &tauri::AppHandle) -> Option<String> {
    menue_fenster(app).filter(|label| ist_hauptfenster(label))
}

/// Schließbefehle dürfen auch das aktive Hilfsfenster erreichen.
pub fn menue_fenster(app: &tauri::AppHandle) -> Option<String> {
    let fenster = app.webview_windows();
    let snapshot: Vec<_> = fenster
        .iter()
        .filter(|(label, _)| ist_bedienfenster(label))
        .map(|(label, f)| {
            (
                label.as_str(),
                f.is_focused().unwrap_or(false),
                f.is_visible().unwrap_or(false),
            )
        })
        .collect();
    let zustaende = app.try_state::<FensterMenueZustaende>()?;
    let mut letzter_fokus = crate::sperren::sperren(&zustaende.letzter_fokus);
    if let Some((label, _, _)) = snapshot.iter().find(|(_, fokus, _)| *fokus) {
        *letzter_fokus = Some((*label).to_owned());
    }
    if letzter_fokus.as_ref().is_some_and(|ziel| {
        !snapshot
            .iter()
            .any(|(label, _, sichtbar)| label == ziel && *sichtbar)
    }) {
        *letzter_fokus = None;
    }
    menue_fenster_label(snapshot, letzter_fokus.as_deref())
}

#[cfg(test)]
fn menue_hauptfenster_label<'a>(
    fenster: impl IntoIterator<Item = (&'a str, bool, bool)>,
    letzter_fokus: Option<&str>,
) -> Option<String> {
    menue_fenster_label(fenster, letzter_fokus).filter(|label| ist_hauptfenster(label))
}

fn menue_fenster_label<'a>(
    fenster: impl IntoIterator<Item = (&'a str, bool, bool)>,
    letzter_fokus: Option<&str>,
) -> Option<String> {
    let fenster: Vec<_> = fenster
        .into_iter()
        .filter(|(label, _, _)| ist_bedienfenster(label))
        .collect();
    let ziel = fenster
        .iter()
        .find(|(_, fokus, _)| *fokus)
        .map(|(label, _, _)| *label)
        .or(letzter_fokus)?;
    fenster
        .into_iter()
        .find(|(label, _, sichtbar)| *label == ziel && *sichtbar)
        .map(|(label, _, _)| label.to_owned())
}

fn sender_zustaendig(sender: &str, fokus: Option<&str>) -> bool {
    ist_hauptfenster(sender) && fokus == Some(sender)
}
fn ist_gemeinsamer_status(id: &str) -> bool {
    id == "letzter-tab"
}

/// Die Fensteridentität stammt aus Tauri, niemals aus einem JS-Argument.
/// Andere Hauptfenster pflegen nur ihren Snapshot; allein das Menüziel ändert das native Menü.
#[tauri::command]
pub fn menu_item_aktivieren(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    id: String,
    aktiv: bool,
) {
    if !ist_gemeinsamer_status(&id) {
        if !ist_hauptfenster(window.label()) {
            return;
        }
        if let Some(bedingungen) = app.try_state::<FensterMenueZustaende>() {
            crate::sperren::sperren(&bedingungen.fenster)
                .entry(window.label().to_owned())
                .or_default()
                .insert(id.clone(), aktiv);
        }
        let fokus = menue_hauptfenster(&app);
        if !sender_zustaendig(window.label(), fokus.as_deref()) {
            return;
        }
    }
    if let Some(state) = app.try_state::<MenuItemRegistry>() {
        if let Some(item) = state.0.get(id.as_str()) {
            setze_menu_item_status(&app, &id, item, aktiv);
        }
    }
}

const HAUPTFENSTER_ABHAENGIGE_IDS: &[&str] = &[
    "gesetzesuebersicht",
    "dateien-importieren",
    "gesetzesindizes-aktualisieren",
    "export",
    "einfuehrung-neu-starten",
    "tastenkuerzel",
    "datenschutz",
    "ueber",
    "nach-updates-suchen",
    // Diese beiden haben KEIN eigenes TS-seitiges Signal (anders als
    // z. B. "volltext-suche"/"verlauf-anzeigen", siehe
    // menueZustandSync.ts::GESETZ_ABHAENGIGE_IDS) und hingen bisher
    // rein am Submenu-Graying weiter unten (Navigation/Markierungen)
    // – das dimmt zwar den Text, aber NICHT das Icon (siehe
    // setze_menu_item_status-Kommentar), da es item.set_enabled nie
    // einzeln aufruft. Ergänzt, damit auch ihr Icon bei "kein
    // Fenster offen" korrekt umspringt.
    "oeffnen",
    "volltext-alle",
];

const FENSTERLOKALE_IDS: &[&str] = &[
    "gesetze-aktualisieren",
    "gesetz-info",
    "volltext-suche",
    "verlauf-anzeigen",
    "favorit-speichern",
    "favoriten-hinzufuegen",
    "lesezeichen-speichern",
    "unterstreichen",
    "hervorheben",
    "verweismarkierung",
    "kommentar",
    "markierung-rueckgaengig",
    "markierung-wiederholen",
    "alle-lesezeichen-entfernen",
];

/// Reine Fensterregeln; fehlende Snapshot-Werte bleiben inaktiv.
fn menu_item_ist_aktiv(
    id: &str,
    hauptfenster: bool,
    schliessziel: bool,
    snapshot: Option<&std::collections::HashMap<String, bool>>,
) -> bool {
    if HAUPTFENSTER_ABHAENGIGE_IDS.contains(&id) {
        hauptfenster
    } else if ["schliessen-tab", "fenster-schliessen"].contains(&id) {
        schliessziel
    } else if FENSTERLOKALE_IDS.contains(&id) {
        hauptfenster && snapshot.and_then(|s| s.get(id)).copied().unwrap_or(false)
    } else {
        id == "markierungskonflikte"
    }
}

fn submenu_ist_erreichbar(index: usize, hauptfenster: bool, leiste_aktiv: bool) -> bool {
    leiste_aktiv
        && match index {
            3 => hauptfenster,
            _ => true,
        }
}

/// Synchronisiert Bedienaktionen mit dem zuständigen Hauptfenster, auch bei externer App.
/// Globale Fensteröffnungswege behalten ihre eigene Zuständigkeit. Technische
/// Snapshots verschwundener Fenster werden bei diesem Lebenszyklusabgleich entfernt.
pub fn fenster_abhaengige_menu_items_synchronisieren(app: &tauri::AppHandle) {
    let fenster = app.webview_windows();
    if let Some(zustaende) = app.try_state::<FensterMenueZustaende>() {
        zustaende.bereinige(|label| fenster.contains_key(label));
    }
    let schliessziel = menue_fenster(app);
    let fokus = schliessziel.clone().filter(|label| ist_hauptfenster(label));
    let aktiv = fokus.is_some();
    let normstatus = app
        .try_state::<FensterMenueZustaende>()
        .map(|zustaende| zustaende.normstatus_fuer_ziel(fokus.as_deref()))
        .unwrap_or_default();
    normtexte_anwenden(app, &normstatus);
    if let Some(state) = app.try_state::<MenuItemRegistry>() {
        for &id in HAUPTFENSTER_ABHAENGIGE_IDS {
            if let Some(item) = state.0.get(id) {
                setze_menu_item_status(
                    app,
                    id,
                    item,
                    menu_item_ist_aktiv(id, aktiv, schliessziel.is_some(), None),
                );
            }
        }
    }
    if let Some(state) = app.try_state::<MenuItemRegistry>() {
        for id in ["schliessen-tab", "fenster-schliessen"] {
            if let Some(item) = state.0.get(id) {
                setze_menu_item_status(
                    app,
                    id,
                    item,
                    menu_item_ist_aktiv(id, aktiv, schliessziel.is_some(), None),
                );
            }
        }
    }
    // Fensterlokale TS-Werte ausschließlich aus dem Snapshot des zuständigen Hauptfensters.
    // Ein unbekannter Status bleibt bis zur gezielten Frontend-Anfrage deaktiviert.
    if let Some(state) = app.try_state::<MenuItemRegistry>() {
        if let Some(bedingungen) = app.try_state::<FensterMenueZustaende>() {
            let map = crate::sperren::sperren(&bedingungen.fenster);
            let snapshot = fokus.as_ref().and_then(|label| map.get(label));
            for &id in FENSTERLOKALE_IDS {
                if let Some(item) = state.0.get(id) {
                    setze_menu_item_status(
                        app,
                        id,
                        item,
                        menu_item_ist_aktiv(id, aktiv, schliessziel.is_some(), snapshot),
                    );
                }
            }
        }
    }
    // Die Einführungssperre bleibt auch bei externer App an das Menüziel gebunden.
    let leiste_aktiv = app
        .try_state::<FensterMenueZustaende>()
        .map(|bedingungen| {
            let leiste = crate::sperren::sperren(&bedingungen.leiste);
            fokus
                .as_ref()
                .and_then(|label| leiste.get(label))
                .copied()
                .unwrap_or(true)
        })
        .unwrap_or(true);
    if let Some(state) = app.try_state::<MenueLeisteSubmenus>() {
        for (index, submenu) in state.0.iter().enumerate() {
            // Markierungen enthält den globalen Öffnungsweg für Konflikte.
            // Dessen Erreichbarkeit bleibt auch ohne Fenster erhalten.
            let _ = submenu.set_enabled(submenu_ist_erreichbar(index, aktiv, leiste_aktiv));
        }
    }
}

/// Von useFensterRestore.ts NACH getCurrentWindow().show() aufgerufen.
///
/// GRUND: Der WindowEvent-Handler in lib.rs::run deckt Schließen/Zerstören
/// eines Fensters zuverlässig ab (dafür feuert der Windowing-Layer
/// garantiert CloseRequested/Destroyed), aber für das erstmalige SICHTBAR-
/// WERDEN eines zunächst unsichtbar erzeugten Fensters (siehe fenster.rs:
/// neues_fenster: .visible(false), Anzeige separat über fensterAnzeigen())
/// gibt es in Tauris WindowEvent-Enum keine "Shown"-Variante – show() allein
/// löst dort nichts Beobachtbares aus. Ohne diesen expliziten Aufruf bliebe
/// "Schließen"/"Fenster schließen" nach dem ersten Fensteraufbau u.U.
/// dauerhaft grau, obwohl ein Fenster sichtbar ist.
#[tauri::command]
pub fn fenster_menu_status_aktualisieren(app: tauri::AppHandle) {
    fenster_abhaengige_menu_items_synchronisieren(&app);
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn nur_sichtbare_bedienfenster_verhindern_das_oeffnen_eines_neuen_fensters() {
        assert!(!hat_sichtbare_bedienfenster([]));
        assert!(!hat_sichtbare_bedienfenster([
            ("main", false),
            ("ziehvorschau", true),
        ]));
        assert!(hat_sichtbare_bedienfenster([("main", true)]));
        assert!(hat_sichtbare_bedienfenster([
            ("main", false),
            ("einstellungen", true),
        ]));
    }

    #[test]
    fn normstatus_folgt_nur_dem_menueziel_und_entfernt_verschwundene_fenster() {
        let zustaende = FensterMenueZustaende::default();
        zustaende.normstatus_melden(
            "main",
            MenueNormstatus {
                bezeichnung: Some("§ 1".into()),
                ..Default::default()
            },
            Some("main"),
        );
        assert!(!zustaende.normstatus_melden(
            "fenster-2",
            MenueNormstatus {
                bezeichnung: Some("§ 2".into()),
                ..Default::default()
            },
            Some("main")
        ));
        assert_eq!(
            zustaende
                .normstatus_fuer_ziel(Some("main"))
                .bezeichnung
                .as_deref(),
            Some("§ 1")
        );
        assert_eq!(
            zustaende
                .normstatus_fuer_ziel(Some("fenster-2"))
                .bezeichnung
                .as_deref(),
            Some("§ 2")
        );
        assert_eq!(
            zustaende.normstatus_fuer_ziel(Some("unbekannt")),
            MenueNormstatus::default()
        );
        assert_eq!(
            zustaende.normstatus_fuer_ziel(None),
            MenueNormstatus::default()
        );
        assert!(!zustaende.normstatus_melden(
            "einstellungen",
            MenueNormstatus::default(),
            Some("einstellungen")
        ));
        zustaende.bereinige(|label| label == "main");
        assert_eq!(
            zustaende.normstatus_fuer_ziel(Some("fenster-2")),
            MenueNormstatus::default()
        );
        assert_eq!(crate::sperren::sperren(&zustaende.normen).len(), 1);
    }

    #[test]
    fn markierungen_ohne_fenster_und_bei_hilfsfenster_erreichbar_navigation_nur_im_hauptfenster() {
        for hauptfenster in [false, true] {
            assert!(submenu_ist_erreichbar(4, hauptfenster, true));
            assert_eq!(submenu_ist_erreichbar(3, hauptfenster, true), hauptfenster);
            for index in 0..7 {
                assert!(!submenu_ist_erreichbar(index, hauptfenster, false));
            }
        }
    }
    #[test]
    fn markierungskonflikte_bleiben_in_allen_fensterlagen_aktiv() {
        for (hauptfenster, schliessziel) in [(false, false), (false, true), (true, true)] {
            for wert in [None, Some(false), Some(true)] {
                let snapshot = wert.map(|wert| {
                    [("markierungskonflikte".to_owned(), wert)]
                        .into_iter()
                        .collect()
                });
                assert!(menu_item_ist_aktiv(
                    "markierungskonflikte",
                    hauptfenster,
                    schliessziel,
                    snapshot.as_ref()
                ));
            }
        }
        let menu = include_str!("../menu/navigationsmenue.rs");
        let anlage = menu
            .split("let markierungskonflikte_item =")
            .nth(1)
            .unwrap()
            .split(")?;")
            .next()
            .unwrap();
        assert!(anlage.contains("true,"));
        // Der dauerhaft aktiv angelegte Punkt darf von keiner Fenstergruppe überschrieben werden.
        assert!(!HAUPTFENSTER_ABHAENGIGE_IDS.contains(&"markierungskonflikte"));
        assert!(!FENSTERLOKALE_IDS.contains(&"markierungskonflikte"));
        let synchronisation = include_str!("menu_sync.rs")
            .split("pub fn fenster_abhaengige_menu_items_synchronisieren")
            .nth(1)
            .unwrap()
            .split("/// Von useFensterRestore")
            .next()
            .unwrap();
        assert!(!synchronisation.contains("\"markierungskonflikte\""));
    }
    #[test]
    fn regelmatrix_fuer_hauptfenster_schliessen_und_fensterlokale_werte() {
        let lokale_ids = [
            "gesetze-aktualisieren",
            "gesetz-info",
            "volltext-suche",
            "verlauf-anzeigen",
            "favorit-speichern",
            "favoriten-hinzufuegen",
            "lesezeichen-speichern",
            "unterstreichen",
            "hervorheben",
            "verweismarkierung",
            "kommentar",
            "markierung-rueckgaengig",
            "markierung-wiederholen",
            "alle-lesezeichen-entfernen",
        ];
        let hauptfenster_ids = [
            "gesetzesuebersicht",
            "dateien-importieren",
            "gesetzesindizes-aktualisieren",
            "export",
            "einfuehrung-neu-starten",
            "tastenkuerzel",
            "datenschutz",
            "ueber",
            "nach-updates-suchen",
            "oeffnen",
            "volltext-alle",
        ];
        assert_eq!(HAUPTFENSTER_ABHAENGIGE_IDS, hauptfenster_ids);
        assert_eq!(FENSTERLOKALE_IDS, lokale_ids);
        for (lage, hauptfenster, schliessziel, wert) in [
            ("kein Fenster", false, false, None),
            ("Hilfsfenster", false, true, Some(true)),
            ("Hauptfenster ohne Snapshot", true, true, None),
            ("Hauptfenster mit true", true, true, Some(true)),
            ("Hauptfenster mit false", true, true, Some(false)),
        ] {
            let snapshot = wert.map(|wert| {
                lokale_ids
                    .into_iter()
                    .map(|id| (id.to_owned(), wert))
                    .collect()
            });
            for id in hauptfenster_ids {
                assert_eq!(
                    menu_item_ist_aktiv(id, hauptfenster, schliessziel, snapshot.as_ref()),
                    hauptfenster,
                    "{lage}: {id}"
                );
            }
            for id in ["schliessen-tab", "fenster-schliessen"] {
                assert_eq!(
                    menu_item_ist_aktiv(id, hauptfenster, schliessziel, snapshot.as_ref()),
                    schliessziel,
                    "{lage}: {id}"
                );
            }
            for id in lokale_ids {
                assert_eq!(
                    menu_item_ist_aktiv(id, hauptfenster, schliessziel, snapshot.as_ref()),
                    hauptfenster && wert == Some(true),
                    "{lage}: {id}"
                );
            }
            let leer = std::collections::HashMap::new();
            for id in lokale_ids {
                assert!(
                    !menu_item_ist_aktiv(id, hauptfenster, schliessziel, Some(&leer)),
                    "{lage}: fehlender Wert {id}"
                );
            }
        }
    }
    #[test]
    fn ziehvorschau_ist_weder_hauptfenster_noch_menueziel() {
        assert!(!ist_hauptfenster("ziehvorschau"));
        assert!(ist_hauptfenster("main"));
        assert_eq!(
            menue_fenster_label([("ziehvorschau", true, true)], None),
            None
        );
        assert_eq!(
            menue_fenster_label([("ziehvorschau", true, true)], Some("ziehvorschau")),
            None
        );
        assert_eq!(
            menue_fenster_label(
                [("ziehvorschau", true, true), ("main", false, true)],
                Some("main")
            ),
            Some("main".into())
        );
    }
    #[test]
    fn ziehvorschaufokus_veraendert_den_gemerkten_fokus_nicht() {
        let app = tauri::test::mock_builder()
            .manage(FensterMenueZustaende::default())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        menue_fokus_merken(app.handle(), "main");
        menue_fokus_merken(app.handle(), "ziehvorschau");
        assert_eq!(
            app.state::<FensterMenueZustaende>()
                .letzter_fokus
                .lock()
                .unwrap()
                .as_deref(),
            Some("main")
        );
    }
    #[test]
    fn nur_bewegungen_lassen_die_menuesynchronisation_aus() {
        use tauri::{PhysicalPosition, PhysicalSize, WindowEvent as E};
        assert!(!menue_bei_ereignis_synchronisieren(&E::Moved(
            PhysicalPosition::new(2, 3)
        )));
        for ereignis in [
            E::Focused(true),
            E::Focused(false),
            E::Resized(PhysicalSize::new(2, 3)),
            E::Destroyed,
            E::ThemeChanged(tauri::Theme::Dark),
            E::DragDrop(tauri::DragDropEvent::Leave),
        ] {
            assert!(menue_bei_ereignis_synchronisieren(&ereignis));
        }
    }
    #[test]
    fn datenschutz_ist_hauptfenstergebunden_und_nativ_registriert() {
        let menu = include_str!("../menu/anwendung.rs");
        assert!(menu.contains("menu_item_registry.insert(\"datenschutz\", datenschutz_item)"));
        assert!(HAUPTFENSTER_ABHAENGIGE_IDS.contains(&"datenschutz"));
        assert!(menue_hauptfenster_label([("main", true, true)], None).is_some());
        assert!(menue_hauptfenster_label([], None).is_none());
        assert!(menue_hauptfenster_label([("einstellungen", true, true)], None).is_none());
    }
    #[test]
    fn ueber_ist_hauptfenstergebunden_und_ersetzt_das_systemfenster() {
        let menu = include_str!("../menu/anwendung.rs").replace("\r\n", "\n");
        // Genau ein nativer Eintrag (App-Menü), registriert zum Ausgrauen.
        assert_eq!(
            menu.matches("with_id(\n        handle,\n        \"ueber\"")
                .count(),
            1
        );
        assert_eq!(menu.matches("\"ueber\"").count(), 2);
        let app_menue = menu.split("pub(super) fn ablage").next().unwrap();
        assert!(app_menue.contains("menu_item_registry.insert(\"ueber\", ueber_item)"));
        assert!(app_menue.contains("&ueber_item,"));
        assert!(!menu.contains("PredefinedMenuItem::about"));
        assert!(HAUPTFENSTER_ABHAENGIGE_IDS.contains(&"ueber"));
        let ereignisse = include_str!("../menu.rs").replace("\r\n", "\n");
        assert!(ereignisse.contains(
            "\"ueber\" => {\n            sende_an_menue_hauptfenster(app_handle, \"ueber-oeffnen\", ());"
        ));
    }
    #[test]
    fn nur_der_hauptfenster_sender_des_menueziels_ist_zustaendig() {
        assert!(sender_zustaendig("main", Some("main")));
        assert!(sender_zustaendig("fenster-123", Some("fenster-123")));
        assert!(!sender_zustaendig("main", Some("fenster-123")));
        assert!(!sender_zustaendig("main", Some("kommentar-123")));
        assert!(!sender_zustaendig("main", None));
        for label in [
            "kommentar-123",
            "verweismarkierung-123",
            "einstellungen",
            "markierungskonflikte",
        ] {
            assert!(!sender_zustaendig(label, Some(label)));
        }
    }
    #[test]
    fn externer_fokusverlust_behaelt_das_zuletzt_aktive_hauptfenster() {
        let fenster = [("main", false, true), ("fenster-2", false, true)];
        assert_eq!(
            menue_hauptfenster_label(fenster, Some("main")),
            Some("main".into())
        );
        assert_eq!(
            menue_hauptfenster_label(fenster, Some("fenster-2")),
            Some("fenster-2".into())
        );
        assert_eq!(menue_hauptfenster_label(fenster, None), None);
    }
    #[test]
    fn aktueller_fokus_hat_vorrang_vor_dem_gemerkten_fenster() {
        assert_eq!(
            menue_hauptfenster_label(
                [("main", false, true), ("fenster-2", true, true)],
                Some("main")
            ),
            Some("fenster-2".into())
        );
        assert_eq!(
            menue_hauptfenster_label(
                [("main", true, true), ("fenster-2", false, true)],
                Some("fenster-2")
            ),
            Some("main".into())
        );
    }
    #[test]
    fn hilfsfenster_erlauben_auch_nach_externem_fokusverlust_keine_umleitung() {
        for label in [
            "kommentar-123",
            "verweismarkierung-123",
            "einstellungen",
            "markierungskonflikte",
        ] {
            assert_eq!(
                menue_hauptfenster_label(
                    [("main", false, true), (label, true, true)],
                    Some("main")
                ),
                None
            );
            assert_eq!(
                menue_hauptfenster_label(
                    [("main", false, true), (label, false, true)],
                    Some(label)
                ),
                None
            );
        }
    }
    #[test]
    fn geschlossenes_oder_verstecktes_ziel_hat_keinen_beliebigen_ersatz() {
        assert_eq!(
            menue_hauptfenster_label([("main", false, true)], Some("fenster-2")),
            None
        );
        assert_eq!(
            menue_hauptfenster_label(
                [("main", false, false), ("fenster-2", false, true)],
                Some("main")
            ),
            None
        );
        assert_eq!(
            menue_hauptfenster_label([("main", true, false)], Some("main")),
            None
        );
        assert_eq!(menue_hauptfenster_label([], Some("main")), None);
    }
    #[test]
    fn schliessen_erreicht_auch_hilfsfenster_ohne_umleitung() {
        for label in [
            "kommentar-123",
            "verweismarkierung-123",
            "einstellungen",
            "markierungskonflikte",
        ] {
            let fenster = [("main", false, true), (label, true, true)];
            assert_eq!(
                menue_fenster_label(fenster, Some("main")),
                Some(label.into())
            );
            assert_eq!(menue_hauptfenster_label(fenster, Some("main")), None);
            assert_eq!(
                menue_fenster_label([("main", false, true), (label, false, true)], Some(label)),
                Some(label.into())
            );
            assert_eq!(
                menue_fenster_label([("main", false, true), (label, false, false)], Some(label)),
                None
            );
            assert_eq!(
                menue_fenster_label([("main", false, true)], Some(label)),
                None
            );
        }
    }
    #[test]
    fn gemeinsame_werte_bleiben_vom_fokus_getrennt() {
        assert!(ist_gemeinsamer_status("letzter-tab"));
        for id in [
            "gesetz-info",
            "markierung-rueckgaengig",
            "gesetze-aktualisieren",
            "alle-lesezeichen-entfernen",
        ] {
            assert!(!ist_gemeinsamer_status(id));
        }
    }
}
