// Koordiniert das native macOS-Menü, seine Registry und die Menüaktionen.
mod anwendung;
mod bearbeiten;
mod icons;
mod navigationsmenue;

use crate::fenster::{
    einstellungen_fenster_oeffnen, fenster_abhaengige_menu_items_synchronisieren,
    markierungskonflikte_fenster_oeffnen, neues_fenster, neues_fenster_kaskadiert,
    MenuItemRegistry,
};
use icons::menu_icons_sichtbar_machen;
pub use icons::{menu_icon_aktualisieren, menu_icons_theme_aktualisieren};
use tauri::menu::Menu;
use tauri::Emitter;
use tauri::Manager;

// Baut die native Menüleiste auf und registriert den Event-Handler dafür.
// Nur auf macOS aufgerufen (siehe lib.rs::run) – Windows/Linux haben hier
// (noch) keine native Menüleiste.
pub fn einrichten(app: &tauri::App) -> tauri::Result<()> {
    let handle = app.handle();
    // Anfangszustand: vor dem ersten Fenster-Mount kennen wir das echte
    // System-Erscheinungsbild noch nicht (das kommt erst per
    // system_theme_melden von der JS-Seite, siehe fenster/menu_sync.rs für
    // die Begründung) – Default hell, useFarbschema.ts korrigiert das
    // unmittelbar beim Mount des ersten Fensters.
    let dunkel = false;

    let mut menu_item_registry = std::collections::HashMap::new();
    let lexlata_menu = anwendung::lexlata(handle, dunkel, &mut menu_item_registry)?;
    let ablage_menu = anwendung::ablage(handle, dunkel, &mut menu_item_registry)?;
    let bearbeiten_menu = bearbeiten::bearbeiten(handle)?;
    let navigation_menu = navigationsmenue::navigation(handle, dunkel, &mut menu_item_registry)?;
    let markierungen_menu =
        navigationsmenue::markierungen(handle, dunkel, &mut menu_item_registry)?;
    let fenster_menu = anwendung::fenster(handle)?;
    let hilfe_menu = anwendung::hilfe(handle, dunkel, &mut menu_item_registry)?;

    let menu = Menu::with_items(
        handle,
        &[
            &lexlata_menu,
            &ablage_menu,
            &bearbeiten_menu,
            &navigation_menu,
            &markierungen_menu,
            &fenster_menu,
            &hilfe_menu,
        ],
    )?;

    app.set_menu(menu)?;
    // ACHTUNG Reihenfolge: fenster_abhaengige_menu_items_synchronisieren
    // (fenster.rs) greift auf Index 3 ("Navigation") und 4 ("Markierungen")
    // dieses Vektors zu, um die kompletten Submenus grau zu schalten, statt
    // (wie bei den einzelnen MenuItems unten) jeweils ein eigenes Handle in
    // der MenuItemRegistry vorzuhalten – Submenu<Wry> ist hier absichtlich
    // NICHT dupliziert/geklont, siehe Kommentar dort. Bei Änderung dieser
    // Reihenfolge zwingend auch fenster.rs anpassen.
    handle.manage(crate::fenster::MenueLeisteSubmenus(vec![
        lexlata_menu,
        ablage_menu,
        bearbeiten_menu,
        navigation_menu,
        markierungen_menu,
        fenster_menu,
        hilfe_menu,
    ]));

    // Registry für alle Einzel-Menüpunkte, die je nach TS-seitigem Zustand
    // aus-/eingegraut werden (siehe MenuItemRegistry-Kommentar in
    // fenster.rs). "letzter-tab"/"gesetze-aktualisieren"/
    // "alle-lesezeichen-entfernen" werden von dort synchronisiert;
    // die übrigen unten direkt aus fenster_abhaengige_menu_items_synchronisieren
    // (grau, wenn kein Fenster offen ist).
    menu_icons_sichtbar_machen(
        handle,
        menu_item_registry.iter().map(|(id, item)| (*id, item)),
    );
    handle.manage(MenuItemRegistry(menu_item_registry));
    // Fensterlokale Snapshots und die zuletzt aktive Menüzuordnung.
    handle.manage(crate::fenster::FensterMenueZustaende::default());
    // Startzustand hell (siehe `let dunkel = false;` oben) – wird beim
    // ersten Fenster-Fokus (siehe lib.rs::run) sofort mit dem echten
    // System-Erscheinungsbild überschrieben.
    handle.manage(crate::fenster::AktuellesTheme::default());

    // Startzustand: beim allerersten Aufbau ist noch kein Fenster sichtbar
    // (siehe neues_fenster: .visible(false), Anzeige folgt erst über
    // useFensterRestore.ts) – "Schließen"/"Fenster schließen" also zunächst
    // grau; der WindowEvent-Handler in lib.rs::run übernimmt danach jede
    // weitere Aktualisierung.
    fenster_abhaengige_menu_items_synchronisieren(handle);

    app.on_menu_event(move |app_handle, event| match event.id().as_ref() {
        "neues-fenster" => {
            // Kaskaden-Geometrie-Berechnung (Größe vom fokussierten Fenster
            // übernehmen, macOS-Versatz, Sonderfälle Vollbild/maximiert)
            // lebt jetzt zentral in neues_fenster_kaskadiert (fenster.rs) –
            // siehe Kommentar dort für die Details und den zweiten
            // Aufrufer (Hamburger-Dropdown unter Windows/Linux).
            if let Err(e) = neues_fenster_kaskadiert(app_handle) {
                eprintln!("Neues Fenster: {e}");
            }
        }
        "neuer-tab" => {
            if crate::commands::effektiv_keine_fenster_offen(app_handle) {
                if let Err(e) = neues_fenster(app_handle, None, None) {
                    eprintln!("Neues Fenster: {e}");
                }
            } else {
                sende_an_menue_hauptfenster(app_handle, "leerentab-oeffnen", ());
            }
        }
        "letzter-tab" => {
            // Ist kein Fenster offen (macOS-App bleibt nach Schließen aller
            // Fenster im Dock aktiv), läuft ein bloßes emit ins Leere – es
            // existiert noch kein JS-Listener. Analog zu "neuer-tab" wird
            // dann stattdessen ein neues Fenster erzeugt; das Flag sagt
            // diesem Fenster beim Start (siehe letzter_tab_anfrage_lesen in
            // commands.rs), dass es den zuletzt geschlossenen Tab statt
            // eines leeren Anfangstabs zeigen soll.
            //
            // Bewusst effektiv_keine_fenster_offen() statt
            // webview_windows().is_empty(): Das versteckte "main"-Fenster
            // (siehe useFensterRestore.ts, initialRestore – main bleibt beim
            // Start unsichtbar liegen, wenn der Inhalt in anderen Fenstern
            // lag) taucht in webview_windows() dauerhaft auf, obwohl der
            // Nutzer kein Fenster sieht. is_empty() würde dann fälschlich
            // immer den emit-Zweig nehmen, der ins Leere läuft.
            if crate::commands::effektiv_keine_fenster_offen(app_handle) {
                let state = app_handle.state::<crate::commands::LetzterTabAnfrage>();
                *crate::sperren::sperren(&state.0) = true;
                if let Err(e) = neues_fenster(app_handle, None, None) {
                    *crate::sperren::sperren(&state.0) = false;
                    eprintln!("Neues Fenster: {e}");
                }
            } else {
                sende_an_menue_hauptfenster(app_handle, "letzter-tab-oeffnen", ());
            }
        }
        "schliessen-tab" => {
            sende_schliessanfrage(app_handle, false);
        }
        "fenster-schliessen" => {
            sende_schliessanfrage(app_handle, true);
        }
        "oeffnen" => {
            sende_an_menue_hauptfenster(app_handle, "oeffnen-overlay-oeffnen", ());
        }
        "volltext-suche" => {
            sende_an_menue_hauptfenster(app_handle, "volltext-suche-oeffnen", ());
        }
        "volltext-alle" => {
            sende_an_menue_hauptfenster(app_handle, "volltext-alle-oeffnen", ());
        }
        "gesetzesuebersicht" => {
            sende_an_menue_hauptfenster(app_handle, "gesetzesuebersicht-oeffnen", ());
        }
        "verlauf-anzeigen" => {
            sende_an_menue_hauptfenster(app_handle, "verlauf-anzeigen-oeffnen", ());
        }
        "einstellungen" => {
            // Direkt aufgerufen statt emit("einstellungen-oeffnen", ()) an
            // einen JS-Listener (analog markierungskonflikte_fenster_oeffnen
            // oben): Einstellungen ist ein eigenständiges Fenster ohne
            // Bezug zu App.tsx-State (siehe tauriHelpers.ts-Kommentar,
            // Vorgänger war ein Overlay in App.tsx). Der bisherige Umweg
            // über einen nur in App.tsx registrierten Listener bedeutete,
            // dass der Menüpunkt ohne offenes Hauptfenster (macOS bleibt
            // nach Schließen aller Fenster aktiv) sichtbar aktiv, aber
            // wirkungslos war.
            einstellungen_fenster_oeffnen(app_handle.clone());
        }
        "dateien-importieren" => {
            sende_an_menue_hauptfenster(app_handle, "dateien-importieren-anfrage", ());
        }
        "gesetze-aktualisieren" => {
            sende_an_menue_hauptfenster(app_handle, "gesetze-aktualisieren-oeffnen", ());
        }
        "markierungskonflikte" => {
            markierungskonflikte_fenster_oeffnen(app_handle.clone());
        }
        "gesetzesindizes-aktualisieren" => {
            sende_an_menue_hauptfenster(app_handle, "gesetzesindizes-oeffnen", ());
        }
        "gesetz-info" => {
            sende_an_menue_hauptfenster(app_handle, "gesetz-info-oeffnen", ());
        }
        "export" => {
            sende_an_menue_hauptfenster(app_handle, "export-oeffnen", ());
        }
        "lesezeichen-speichern" => {
            sende_an_menue_hauptfenster(app_handle, "lesezeichen-speichern", ());
        }
        "favorit-speichern" => {
            sende_an_menue_hauptfenster(app_handle, "favorit-speichern", ());
        }
        "favoriten-hinzufuegen" => {
            sende_an_menue_hauptfenster(app_handle, "favoriten-hinzufuegen-oeffnen", ());
        }
        "unterstreichen" => {
            sende_an_menue_hauptfenster(app_handle, "unterstreichen-anfrage", ());
        }
        "hervorheben" => {
            sende_an_menue_hauptfenster(app_handle, "hervorheben-anfrage", ());
        }
        "verweismarkierung" => {
            sende_an_menue_hauptfenster(app_handle, "verweismarkierung-anfrage", ());
        }
        "kommentar" => {
            sende_an_menue_hauptfenster(app_handle, "kommentar-anfrage", ());
        }
        "markierung-rueckgaengig" => {
            sende_an_menue_hauptfenster(app_handle, "markierung-rueckgaengig-anfrage", ());
        }
        "markierung-wiederholen" => {
            sende_an_menue_hauptfenster(app_handle, "markierung-wiederholen-anfrage", ());
        }
        "alle-lesezeichen-entfernen" => {
            sende_an_menue_hauptfenster(app_handle, "alle-lesezeichen-entfernen-anfrage", ());
        }
        "tastenkuerzel" => {
            sende_an_menue_hauptfenster(app_handle, "tastenkuerzel-oeffnen", ());
        }
        "datenschutz" => {
            sende_an_menue_hauptfenster(app_handle, "datenschutz-oeffnen", ());
        }
        "ueber" => {
            sende_an_menue_hauptfenster(app_handle, "ueber-oeffnen", ());
        }
        "nach-updates-suchen" => {
            sende_an_menue_hauptfenster(app_handle, "nach-updates-suchen-anfrage", ());
        }
        "einfuehrung-neu-starten" => {
            sende_an_menue_hauptfenster(app_handle, "einfuehrung-neu-starten-anfrage", ());
        }
        _ => {}
    });

    Ok(())
}

/// Menüstatus und Befehle verwenden dasselbe Ziel, auch bei externer App.
/// Keine Umleitung bei Hilfsfensterfokus und keine globale Ersatzsendung.
fn sende_an_menue_hauptfenster(app: &tauri::AppHandle, name: &str, payload: ()) {
    if let Some(label) = crate::fenster::menue_hauptfenster(app) {
        let _ = app.emit_to(label, name, payload);
    }
}

/// Hilfsfenster verwenden für beide Tastenkürzel ihre vorhandene Schließroutine.
fn sende_schliessanfrage(app: &tauri::AppHandle, ganzes_fenster: bool) {
    if let Some(label) = crate::fenster::menue_fenster(app) {
        let name = if ganzes_fenster && crate::fenster::ist_hauptfenster(&label) {
            "fenster-schliessen-anfrage"
        } else {
            "schliessen-anfrage"
        };
        let _ = app.emit_to(label, name, ());
    }
}
