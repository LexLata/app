// fenster.rs
// Native Fenstersteuerung, Positionsabfrage und Fassade der Fenster-Begleitdateien.

pub(crate) mod ziehvorschau;

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

// Aufgeteilt nach Dot-Suffix-Konvention (analog zum Frontend) statt
// Unterordner, da das eigenständige Rust-Dateien mit klarem Bezug zu
// fenster.rs bleiben sollen. Re-exportiert (siehe unten), damit ALLE
// bestehenden Aufrufstellen (lib.rs, menu.rs, commands.rs) weiterhin über
// `fenster::X` bzw. `crate::fenster::X` funktionieren, ohne sie anzufassen.
mod erscheinungsbild;
pub use erscheinungsbild::fenster_farbschema_anwenden;

mod hauptfenster;
// Öffentliche Hauptfensterpfade samt generierter Tauri-Command-Makros erhalten.
pub use hauptfenster::*;

pub(crate) mod beenden;
pub(crate) mod beenden_anfrage;
mod hilfsfenster;
pub(crate) mod hinweise;
mod menu_normstatus;
mod menu_sync;
pub mod navigation;
pub(crate) mod tiefenlink;

pub use hilfsfenster::{
    einstellungen_fenster_oeffnen, kommentar_fenster_oeffnen, verweismarkierung_fenster_oeffnen,
};
#[cfg(target_os = "macos")]
pub(crate) use menu_normstatus::norm_menu_text;
#[cfg(any(target_os = "macos", test))]
pub(crate) use menu_sync::hat_sichtbare_bedienfenster;
pub use menu_sync::{
    fenster_abhaengige_menu_items_synchronisieren, fenster_menu_status_aktualisieren,
    markierungskonflikte_fenster_oeffnen, menu_item_aktivieren, menu_normstatus_melden,
    menue_fokus_merken, menueleiste_aktivieren, system_theme_melden,
};
pub(crate) use menu_sync::{
    ist_bedienfenster, ist_hauptfenster, menue_bei_ereignis_synchronisieren,
};
#[cfg(target_os = "macos")]
pub use menu_sync::{
    menue_fenster, menue_hauptfenster, AktuellesTheme, FensterMenueZustaende, MenuItemRegistry,
    MenueLeisteSubmenus,
};
pub use tiefenlink::tiefenlink_zielfenster_vordergrund;

// ---------------------------------------------------------------------
// Vordergrund-Logik für Tiefenlinks bei laufender App (lexlata://...).
//
// Hintergrund: Wenn eine andere App einen lexlata://-Link öffnet, während
// unsere App schon läuft, reicht ein normales setFocus()/show() auf
// macOS NICHT zuverlässig aus, sobald Fullscreen-Spaces beteiligt sind
// (entweder die aufrufende App oder unsere eigene App ist im Fullscreen)
// – das Fenster wird zwar "aktiv" (im ⌘-Tab-Switcher sichtbar), aber
// nicht in den aktuell sichtbaren Space geholt. AppKit braucht dafür
// explizit ein transient gesetztes collectionBehavior (MoveToActiveSpace)
// VOR dem Aktivieren. Daher der native Umweg hier statt eines reinen
// JS-seitigen setFocus()-Aufrufs.
//
// Zielfenster-Ermittlung: NSApplication.mainWindow() wird von AppKit
// unabhängig vom aktuellen App-Fokus gepflegt (zeigt das zuletzt aktiv
// genutzte Fenster) – is_focused() auf Tauri-Seite wäre hier ungeeignet,
// da beim Eintreffen eines Links bei laufender App per Definition kein Tauri-
// Fenster fokussiert ist (unsere App ist ja gerade nicht im Vordergrund).
#[cfg(target_os = "macos")]
pub(crate) fn label_des_mainwindow<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Option<String> {
    use std::sync::mpsc;
    use std::time::Duration;

    // Roher Zeiger ist nicht Send – als usize durch den Channel schicken
    // und erst nach Empfang zurückwandeln.
    let (sender, empfaenger) = mpsc::channel::<Option<usize>>();

    let geplant = app.run_on_main_thread(move || {
        use objc2_app_kit::NSApplication;
        use objc2_foundation::MainThreadMarker;

        let zeiger = MainThreadMarker::new().and_then(|mtm| {
            let ns_app = NSApplication::sharedApplication(mtm);
            ns_app.mainWindow()
        });
        let zeiger_als_usize =
            zeiger.map(|fenster| (&*fenster) as *const objc2_app_kit::NSWindow as usize);
        let _ = sender.send(zeiger_als_usize);
    });

    if geplant.is_err() {
        return None;
    }

    let ziel_zeiger = empfaenger
        .recv_timeout(Duration::from_secs(2))
        .ok()
        .flatten()?;

    app.webview_windows()
        .into_iter()
        .find(|(label, fenster)| {
            menu_sync::ist_bedienfenster(label)
                && fenster
                    .ns_window()
                    .map(|p| p as usize == ziel_zeiger)
                    .unwrap_or(false)
        })
        .map(|(label, _)| label)
}

// Holt ein bestimmtes Fenster nativ in den Vordergrund – inkl. Space-
// Wechsel, falls nötig (siehe Erklärung oben). Wird NUR auf dem einen,
// zuvor über label_des_mainwindow() ermittelten Zielfenster aufgerufen,
// nicht auf allen offenen Fenstern (sonst konkurrieren mehrere Fenster
// um den Fokus, was sich in der Praxis gegenseitig blockiert hat).
#[cfg(target_os = "macos")]
pub(crate) fn fenster_nativ_vordergrund<R: tauri::Runtime>(fenster: &tauri::WebviewWindow<R>) {
    // MockRuntime besitzt kein NSView. Schon ns_window() würde dessen
    // Platzhalterzeiger dereferenzieren, noch vor dem Hauptthread-Aufruf.
    if !hat_native_fenster::<R>() {
        return;
    }
    let Ok(ns_zeiger) = fenster.ns_window() else {
        return;
    };
    let zeiger_als_usize = ns_zeiger as usize;

    let _ = fenster.run_on_main_thread(move || {
        use objc2_app_kit::{NSApplication, NSWindow, NSWindowCollectionBehavior};
        use objc2_foundation::MainThreadMarker;

        let Some(mtm) = MainThreadMarker::new() else {
            return;
        };
        let ns_fenster_ptr = zeiger_als_usize as *mut NSWindow;
        // SAFETY: Zeiger stammt unmittelbar zuvor aus fenster.ns_window()
        // desselben, noch existierenden Fensters und wird nur auf dem
        // Hauptthread dereferenziert.
        let ns_fenster: &NSWindow = unsafe { &*ns_fenster_ptr };

        // Fenster soll in den GERADE aktiven Space wandern, statt darauf
        // zu warten, dass macOS selbst dorthin wechselt (das passiert bei
        // beteiligten Fullscreen-Spaces nicht zuverlässig).
        ns_fenster.setCollectionBehavior(NSWindowCollectionBehavior::MoveToActiveSpace);

        let ns_app = NSApplication::sharedApplication(mtm);
        // activate() ersetzt das deprecated activateIgnoringOtherApps(true)
        // – gleiches Verhalten (App wird unabhängig vom Fokus anderer
        // Apps aktiviert), neuer Name seit neueren AppKit-Versionen.
        ns_app.activate();
        // makeKeyAndOrderFront statt orderFrontRegardless: Letzteres ändert
        // nur die Z-Reihenfolge, macht das Fenster aber NICHT zum Key Window
        // (= fokussiert). Fiel beim Tiefenlink-Aufrufer nicht auf, weil dort
        // die App typischerweise erst aus dem Hintergrund aktiviert wird und
        // macOS dabei oft ohnehin ein zuvor aktives Fenster als Key wieder
        // herstellt. Ruft man diese Funktion dagegen auf, während die App
        // bereits im Vordergrund ist (nur ein ANDERES eigenes Fenster ist
        // gerade aktiv – z. B. beim Cross-Window-Tab-Drop), bleibt das
        // Zielfenster ohne explizites makeKeyAndOrderFront im Hintergrund
        // liegen, obwohl activate() "erfolgreich" war.
        ns_fenster.makeKeyAndOrderFront(None);
    });
}

// Ohne explizit gesetztes collectionBehavior überlässt AppKit die Space-
// Zuordnung eines Fensters offenbar einer fehlerhaften Heuristik.
// Beobachtet wurden u. a.: neue Fenster, die über einem Fullscreen-Fenster
// statt in einem eigenen Space erscheinen; ⌥-Tab/⌃→ (Space-Navigation),
// die zwischen unseren Fenstern nicht mehr zuverlässig funktioniert
// (Mission Control war davon nicht betroffen – deutet auf fehlerhafte
// interne Space-Zuordnung statt auf ein reines Rendering-Problem hin).
//
// WICHTIG: betrifft auch das "main"-Fenster, das NICHT über neues_fenster()
// läuft, sondern direkt von Tauri aus tauri.conf.json erzeugt wird (siehe
// setup() in lib.rs) – wurde dort ursprünglich übersehen und ist ein
// wahrscheinlicher Grund, warum die obigen Symptome bestehen blieben,
// sobald ausgerechnet main fullscreen war: ein Fenster ohne korrektes
// collectionBehavior neben einem mit korrektem verwirrt AppKits
// Fenster-Zyklus-Tracking (⌥-Tab "vergisst" irgendwann das aktive Fenster).
//
// Daher hier explizit gesetzt: am normalen Fenster-/Space-Zyklus
// teilnehmend (ParticipatesInCycle), vom System verwaltet (Managed), als
// primäres, eigenständig fullscreen-fähiges Fenster (FullScreenPrimary).
//
// GESCHEITERTES EXPERIMENT (nicht erneut versuchen, siehe Konversations-
// verlauf): FullScreenAuxiliary statt FullScreenPrimary sollte verhindern,
// dass show()/orderFront() das Fenster an den gerade aktiven (Fullscreen-)
// Space eines anderen Fensters derselben App bindet. Ergebnis: weder wurde
// das eigentliche ⌘N-Problem (neues Fenster erscheint über dem Fullscreen-
// Fenster) behoben, noch konnte das betroffene Fenster danach noch
// eigenständig fullscreen werden – reiner Nachteil ohne Nutzen, daher
// zurückgenommen auf FullScreenPrimary.
// Gemeinsame Implementierung für markierungskonflikte_fenster_oeffnen
// (fenster/menu_sync.rs) und einstellungen_fenster_oeffnen (fenster/hilfsfenster.rs)
// – vorher zwei bis auf Label/Titel/Größe identische Funktionen. Anders als
// hilfsfenster_oeffnen (fenster/hilfsfenster.rs, für Verweismarkierung/Kommentar):
// RESIZABLE statt fester Größe, mit Singleton-Fokus-Check UND
// fenster_collection_behavior_setzen (korrektes macOS-Spaces/Fullscreen-
// Verhalten, siehe Kommentar dort) – Verweismarkierung/Kommentar brauchen das
// nicht, da sie als ephemere Hilfsfenster nicht am normalen Fenster-/Space-Zyklus
// teilnehmen sollen.
pub fn resizables_singleton_fenster_oeffnen(
    app: &tauri::AppHandle,
    label: &str,
    titel: &str,
    groesse: (f64, f64),
    min_groesse: (f64, f64),
) {
    if let Some(fenster) = app.get_webview_window(label) {
        let _ = fenster.unminimize();
        let _ = fenster.show();
        let _ = fenster.set_focus();
        return;
    }
    let anfrage = app.state::<beenden_anfrage::BeendenAnfrage>();
    let Some(erstellung) = anfrage.hilfsfenster_vormerken() else {
        return;
    };

    #[allow(unused_mut)]
    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title(titel)
        .inner_size(groesse.0, groesse.1)
        .min_inner_size(min_groesse.0, min_groesse.1)
        .center()
        // Unsichtbar starten (gleiches Muster wie neues_fenster() oben bzw.
        // hilfsfenster_oeffnen in fenster/hilfsfenster.rs): sonst zeigt sich kurz
        // der weiße background_color-Fallback, bevor React den ersten
        // Frame gemalt hat ("weißes Aufblitzen"). JS-seitig macht
        // useFensterSichtbarMachen.ts (EinstellungenFenster.tsx/
        // MarkierungskonfliktFenster.tsx) das Fenster nach dem ersten
        // Render sichtbar. Zentral hier statt an jeder Aufrufstelle, da
        // beide Singleton-Fenster (Einstellungen, Markierungskonflikte)
        // diese Funktion gemeinsam nutzen.
        .visible(false)
        .background_color(tauri::webview::Color(255, 255, 255, 255));

    #[cfg(target_os = "macos")]
    {
        builder = builder.title_bar_style(tauri::TitleBarStyle::Visible);
    }

    match builder.build() {
        Ok(fenster) => {
            erstellung.geoeffnet();
            fenster_collection_behavior_setzen(&fenster);
        }
        Err(e) => eprintln!(
            "resizables_singleton_fenster_oeffnen({label}): Fenstererstellung fehlgeschlagen: {e}"
        ),
    }
}

// Nur Wry besitzt echte Betriebssystemfenster. MockRuntime liefert auf macOS
// einen Platzhalter für NSView; schon ns_window() würde ihn dereferenzieren.
#[cfg(any(target_os = "macos", test))]
pub(super) fn hat_native_fenster<R: tauri::Runtime>() -> bool {
    std::any::TypeId::of::<R>() == std::any::TypeId::of::<tauri::Wry>()
}

pub fn fenster_collection_behavior_setzen<R: tauri::Runtime>(fenster: &tauri::WebviewWindow<R>) {
    #[cfg(target_os = "macos")]
    {
        if !hat_native_fenster::<R>() {
            return;
        }
        let zeiger_als_usize = match fenster.ns_window() {
            Ok(p) => p as usize,
            Err(_) => 0,
        };
        if zeiger_als_usize == 0 {
            return;
        }
        let _ = fenster.run_on_main_thread(move || {
            use objc2_app_kit::{NSWindow, NSWindowCollectionBehavior};

            let ns_fenster_ptr = zeiger_als_usize as *mut NSWindow;
            // SAFETY: Zeiger stammt unmittelbar zuvor aus fenster.ns_window()
            // desselben, noch existierenden Fensters und wird nur auf dem
            // Hauptthread dereferenziert (analog zu fenster_nativ_vordergrund).
            let ns_fenster: &NSWindow = unsafe { &*ns_fenster_ptr };
            ns_fenster.setCollectionBehavior(
                NSWindowCollectionBehavior::Managed
                    | NSWindowCollectionBehavior::ParticipatesInCycle
                    | NSWindowCollectionBehavior::FullScreenPrimary,
            );
        });
    }
    #[cfg(not(target_os = "macos"))]
    {
        // Auf Windows/Linux gibt es kein vergleichbares Space-/Fullscreen-
        // Konzept auf Fensterebene – nichts zu tun.
        let _ = fenster;
    }
}

// ---------------------------------------------------------------------
// Cross-Window-Tab-Drop (Tab aus einem Fenster in ein anderes bereits
// bestehendes Fenster ziehen, siehe Tableiste.tsx / App.tsx:
// handleTabInFensterAufnehmen).
//
// Ohne Live-Vorschau während des Drags (siehe Planung) reicht ein einmaliger
// Snapshot der Bildschirm-Rechtecke aller offenen Fenster beim Drag-Start:
// Tableiste.tsx vergleicht damit rein lokal (kein IPC pro Pointermove), ob
// der Cursor beim Loslassen über einem ANDEREN Fenster liegt.
#[derive(serde::Serialize)]
pub struct FensterPosition {
    pub label: String,
    pub x: i32,
    pub y: i32,
    pub breite: u32,
    pub hoehe: u32,
}

/// Liefert Bildschirm-Position/-Größe aller aktuell SICHTBAREN Fenster
/// (physische Pixel, wie outer_position()/outer_size() sie liefern – passt
/// damit direkt zu e.screenX/screenY auf der JS-Seite). Unsichtbare Fenster
/// (z. B. "main" während der Initialisierung vor fensterAnzeigen())
/// werden ausgeschlossen, da sie ohnehin kein gültiges Drop-Ziel sind.
#[tauri::command]
pub fn fenster_alle_positionen(app: tauri::AppHandle) -> Vec<FensterPosition> {
    app.webview_windows()
        .into_iter()
        .filter_map(|(label, fenster)| {
            if !ist_positionsziel(&label, fenster.is_visible().unwrap_or(false)) {
                return None;
            }
            let pos = fenster.outer_position().ok()?;
            let size = fenster.outer_size().ok()?;
            Some(FensterPosition {
                label,
                x: pos.x,
                y: pos.y,
                breite: size.width,
                hoehe: size.height,
            })
        })
        .collect()
}

/// Holt ein bestimmtes Fenster anhand seines Labels in den Vordergrund –
/// wiederverwendet dieselbe native macOS-Logik wie
/// tiefenlink_zielfenster_vordergrund (inkl. Fullscreen-Space-Sonderfall),
/// nur mit bereits bekanntem statt erst zu ermittelndem Ziel-Label. Wird von
/// App.tsx nach einem Cross-Window-Tab-Drop aufgerufen, damit das
/// aufnehmende Fenster sichtbar in den Vordergrund kommt.
#[tauri::command]
pub fn fenster_vordergrund_holen(app: tauri::AppHandle, label: String) {
    let Some(fenster) = app.get_webview_window(&label) else {
        return;
    };
    #[cfg(target_os = "macos")]
    {
        fenster_nativ_vordergrund(&fenster);
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = fenster.unminimize();
        let _ = fenster.show();
        let _ = fenster.set_focus();
    }
}

// Benannte native Ereignisgrenzen; beide Start-/Tiefenlinkwege verwenden dieselben Nutzlasten.
pub(crate) fn menu_zustand_anfordern<R: tauri::Runtime>(app: &tauri::AppHandle<R>, label: &str) {
    use tauri::Emitter;
    let _ = app.emit_to(label, "menu-zustand-anfordern", ());
}
pub(crate) fn tiefenlinks_an_fenster<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
    urls: Vec<String>,
) {
    use tauri::Emitter;
    let _ = app.emit_to(label, "tiefenlink-oeffnen", urls);
}

fn ist_positionsziel(label: &str, sichtbar: bool) -> bool {
    menu_sync::ist_bedienfenster(label) && sichtbar
}

#[cfg(test)]
mod native_vertrag_tests {
    use super::*;
    #[test]
    fn nur_echte_fensterlaufzeit_erlaubt_native_zeigerzugriffe() {
        assert!(hat_native_fenster::<tauri::Wry>());
        assert!(!hat_native_fenster::<tauri::test::MockRuntime>());
    }
    #[cfg(target_os = "macos")]
    #[test]
    fn mockfenster_vordergrund_bleibt_ohne_nativen_zeigerzugriff() {
        let app = tauri::test::mock_app();
        let fenster = tauri::WebviewWindowBuilder::new(
            &app,
            "main",
            tauri::WebviewUrl::App("index.html".into()),
        )
        .build()
        .unwrap();
        // Der macOS-Mock enthält einen ungültigen NSView-Platzhalter. Ein
        // nativer Zeigerzugriff würde den Testprozess statt einer Assertion beenden.
        fenster_nativ_vordergrund(&fenster);
        assert_eq!(fenster.label(), "main");
    }
    #[test]
    fn fensterposition_serialisierung_und_geometrie_entgegennahme() {
        let daten: serde_json::Value = serde_json::from_str(include_str!(
            "../../src/test/plattform/native-vertraege.json"
        ))
        .unwrap();
        let position = FensterPosition {
            label: "main".into(),
            x: -800,
            y: 20,
            breite: 800,
            hoehe: 600,
        };
        assert_eq!(
            serde_json::to_value(position).unwrap(),
            daten["fenster"]["position"]
        );
        let geometrie: FensterGeometrie =
            serde_json::from_value(daten["fenster"]["geometrie"].clone()).unwrap();
        assert_eq!(geometrie.breite, 800);
        assert_eq!(geometrie.hoehe, 600);
        assert!(!geometrie.maximiert);
        assert!(serde_json::from_value::<Option<FensterGeometrie>>(
            daten["fenster"]["ohneGeometrie"].clone()
        )
        .unwrap()
        .is_none());
        #[cfg(target_os = "macos")]
        {
            assert_eq!(geometrie.x, -800);
            assert_eq!(geometrie.y, 20);
        }
        for falsch in daten["fenster"]["ungueltigeGeometrien"].as_array().unwrap() {
            assert!(serde_json::from_value::<FensterGeometrie>(falsch.clone()).is_err());
        }
        for name in ["positionCommand", "oeffnenCommand"] {
            let command = daten["fenster"][name].as_str().unwrap();
            // Positionen sind Desktop-Commands; Fensteröffnen steht im Desktop-Handler.
            assert!(include_str!("lib.rs").contains(&format!("{command},")));
        }
    }
    #[test]
    fn native_ereignisse_serialisieren_an_der_tatsaechlichen_sendegrenze() {
        use tauri::Listener;
        let daten: serde_json::Value = serde_json::from_str(include_str!(
            "../../src/test/plattform/native-vertraege.json"
        ))
        .unwrap();
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let empfang = std::sync::Arc::new(std::sync::Mutex::new(Vec::new()));
        for art in ["zustandsanfrage", "tiefenlink"] {
            let empfang = empfang.clone();
            app.listen_any(
                daten["ereignisse"][art]["name"].as_str().unwrap(),
                move |e| {
                    empfang
                        .lock()
                        .unwrap()
                        .push(serde_json::from_str::<serde_json::Value>(e.payload()).unwrap());
                },
            );
        }
        menu_zustand_anfordern(app.handle(), "main");
        tiefenlinks_an_fenster(app.handle(), "main", vec!["lexlata://de-bund/BGB/1".into()]);
        assert_eq!(
            *empfang.lock().unwrap(),
            vec![
                daten["ereignisse"]["zustandsanfrage"]["payload"].clone(),
                daten["ereignisse"]["tiefenlink"]["payload"].clone()
            ]
        );
        assert!(
            include_str!("menu.rs").contains(daten["ereignisse"]["undo"]["name"].as_str().unwrap())
        );
    }
}

#[cfg(test)]
mod positionsziel_tests {
    #[test]
    fn sichtbare_ziehvorschau_wird_nie_als_dropziel_geliefert() {
        assert!(!super::ist_positionsziel("ziehvorschau", true));
        assert!(!super::ist_positionsziel("ziehvorschau", false));
        assert!(super::ist_positionsziel("main", true));
        assert!(!super::ist_positionsziel("main", false));
    }
}
