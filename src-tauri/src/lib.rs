// lib.rs
// Richtet die Tauri-App mit Plugins, gemeinsamem Fenster- und Importzustand
// sowie den nativen Commands für Desktop und Mobile ein.

mod commands;
#[cfg(desktop)]
mod fenster;
#[cfg(desktop)]
mod landesrecht_import;
#[cfg(target_os = "macos")]
mod menu;
mod sperren;
#[cfg(any(target_os = "macos", test))]
mod tastenkuerzel;

#[cfg(desktop)]
use fenster::{
    einstellungen_fenster_oeffnen, fenster_alle_positionen, fenster_farbschema_anwenden,
    fenster_menu_status_aktualisieren, fenster_oeffnen_mit_label, fenster_vordergrund_holen,
    hinweise::{
        hauptfenster_hinweis_bestaetigen, hauptfenster_hinweis_senden,
        hauptfenster_hinweise_abmelden, hauptfenster_hinweise_bereit, hauptfenster_hinweise_lesen,
        HauptfensterHinweise,
    },
    kommentar_fenster_oeffnen, letzte_fenster_geometrie_lesen,
    markierungskonflikte_fenster_oeffnen, menu_item_aktivieren, menu_normstatus_melden,
    menueleiste_aktivieren,
    navigation::{
        interne_navigation_abmelden, interne_navigation_anzeigen, interne_navigation_bereit,
        interne_navigation_bestaetigen, interne_navigation_lesen, interne_navigation_senden,
        oeffnen_link_navigation_senden, Navigation,
    },
    neues_fenster_anfordern, system_theme_melden, tiefenlink_zielfenster_vordergrund,
    verweismarkierung_fenster_oeffnen, FensterGeometrie,
};
#[cfg(mobile)]
use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_deep_link::DeepLinkExt;

/// Absoluter Pfad zum LexLata-Datenordner. Bewusst NICHT über
/// `app_data_dir()`, das nach dem Identifier ("org.lexlata") benannt wäre
/// statt sprechend "LexLata" – siehe Umbenennung Gesetze -> LexLata.
/// `local_data_dir()` liefert das Basisverzeichnis OHNE Identifier-Suffix
/// (macOS: ~/Library/Application Support). Gegenstück in TypeScript:
/// appDatenPfad()/appDatenBasisPfad() in appDatenZugriff.ts – beide Seiten
/// müssen bei einer künftigen Umbenennung synchron bleiben.
pub(crate) fn app_daten_basis_pfad<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<std::path::PathBuf, tauri::Error> {
    #[cfg(not(test))]
    return Ok(app.path().local_data_dir()?.join("LexLata"));
    // Testbetrieb: niemals den echten Datenordner des Nutzers berühren, sondern
    // einen je Testlauf eindeutigen Wegwerfordner. Parallele Tests im selben
    // Lauf teilen ihn und verwenden deshalb eindeutige Dateinamen.
    #[cfg(test)]
    {
        let _ = app;
        Ok(std::env::temp_dir().join(format!("lexlata-testdaten-{}", std::process::id())))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default();

    // Muss vor den übrigen Plugins laufen: zweite Prozesse beenden, bevor
    // deren Fenster/Setup starten. Links leitet das Plugin selbst weiter.
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // Ohne URL aktiviert der zweite normale Start die vorhandene App.
            // Mit URL übernimmt ausschließlich der zentrale Deep-Link-Empfänger.
            if args.len() == 1 {
                tiefenlink_zielfenster_vordergrund(app);
            }
        }));
    }

    builder = builder
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_opener::init())
        .manage(commands::LetzterTabAnfrage::default())
        .manage(commands::TabUebertragungen::default())
        .manage(commands::VerweismarkierungKontexte::default())
        .manage(commands::KommentarKontexte::default())
        .manage(commands::ImportAktualisierungVorgaenge::default())
        .manage(commands::GesetzImportSperre::default())
        .manage(commands::DateiSperren::default())
        .manage(commands::startaufgaben::Startaufgaben::default())
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) {
                commands::fensteranfragen::fenster_zerstoert(window);
                commands::startaufgaben::fenster_zerstoert(window);
                #[cfg(desktop)]
                fenster::beenden_anfrage::fenster_zerstoert(window);
            }
        });

    #[cfg(desktop)]
    {
        builder = fenster::beenden_anfrage::einrichten(commands::app_update::einrichten(builder))
            .manage(fenster::ziehvorschau::Ziehvorschau::<tauri::Wry>::default())
            .manage(Navigation::default())
            .manage(HauptfensterHinweise::default());
    }

    // Nur Desktop: Mehrfenster, Menü, Updater und Landesrecht-BW-Importer fehlen auf iOS/Android.
    #[cfg(desktop)]
    {
        builder = builder.invoke_handler(tauri::generate_handler![
            #[cfg(debug_assertions)]
            commands::praefixlauf::praefixlauf_auftrag,
            #[cfg(debug_assertions)]
            commands::praefixlauf::arbeitsdateien::praefixlauf_dateistand,
            #[cfg(debug_assertions)]
            commands::praefixlauf::arbeitsdateien::praefixlauf_arbeitsdatei_lesen,
            #[cfg(debug_assertions)]
            commands::praefixlauf::arbeitsdateien::praefixlauf_arbeitsdatei_schreiben,
            #[cfg(debug_assertions)]
            commands::praefixlauf::arbeitsdateien::praefixlauf_archiv_lesen,
            #[cfg(debug_assertions)]
            commands::praefixlauf::arbeitsdateien::praefixlauf_archiv_schreiben,
            #[cfg(debug_assertions)]
            commands::praefixlauf::arbeitsdateien::praefixlauf_arbeitsdatei_loeschen,
            #[cfg(debug_assertions)]
            commands::praefixlauf::praefixlauf_datei_lesen,
            #[cfg(debug_assertions)]
            commands::praefixlauf::praefixlauf_datei_schreiben,
            #[cfg(debug_assertions)]
            commands::praefixlauf::praefixlauf_gesetz_schreiben,
            #[cfg(debug_assertions)]
            commands::praefixlauf::praefixlauf_bericht_schreiben,
            #[cfg(debug_assertions)]
            commands::praefixlauf::praefixlauf_ausgabe,
            #[cfg(debug_assertions)]
            commands::praefixlauf::praefixlauf_beenden,
            commands::startaufgaben::startaufgaben_anmelden,
            commands::startaufgaben::startaufgaben_lesen,
            commands::startaufgaben::startaufgaben_fortschritt,
            commands::startaufgaben::startaufgaben_abschliessen,
            commands::startaufgaben::startaufgaben_abmelden,
            commands::app_update::app_update_zustand,
            commands::app_update::app_update_pruefen,
            commands::app_update::app_update_ausblenden,
            commands::app_update::app_update_herunterladen,
            commands::app_update::app_update_installieren,
            commands::app_update::app_update_release_seite_oeffnen,
            fenster::beenden_anfrage::beenden_anfrage_antworten,
            fenster::beenden_anfrage::beenden_anfrage_rueckfrage,
            fenster::beenden::hauptfenster_schliessen_freigeben,
            commands::datei_io::dateistempel::gesetz_dateistempel_lesen,
            commands::datei_io::atomar_datei_schreiben,
            commands::datei_io::app_daten_loeschen,
            commands::datei_sperre::datei_sperre_erwerben,
            commands::datei_sperre::datei_sperre_freigeben,
            commands::datei_sperre::datei_sperre_unterbrechen,
            commands::datei_sperre::datei_sperre_fortsetzen,
            commands::datei_sperre::pruefvorgang_registrieren,
            commands::datei_sperre::pruefvorgang_abbrechen,
            commands::datei_sperre::pruefvorgang_quelle_abschliessen,
            commands::datei_sperre::pruefvorgang_fehler,
            commands::datei_sperre::pruefvorgang_teilpruefung_abschliessen,
            commands::datei_sperre::pruefvorgang_abfragen,
            commands::datei_sperre::pruefvorgang_vollbedarf,
            commands::datei_sperre::pruefvorgang_wiederholung_uebernehmen,
            commands::datei_sperre::pruefvorgang_vollpruefung_abschliessen,
            commands::datei_sperre::pruefvorgang_quellen_abwarten,
            commands::datei_io::archiviere_beschaedigte_datei,
            commands::datei_io::sichere_abweichende_version,
            commands::datenordner::datenordner_oeffnen,
            commands::fensteranfragen::letzter_tab_anfrage_lesen,
            commands::fensteranfragen::tab_uebertragung_ablegen,
            commands::fensteranfragen::tab_uebertragung_abholen,
            commands::fensteranfragen::tab_uebertragung_verwerfen,
            commands::fensteranfragen::verweismarkierung_kontext_ablegen,
            commands::fensteranfragen::verweismarkierung_kontext_abholen,
            commands::fensteranfragen::kommentar_kontext_ablegen,
            commands::fensteranfragen::kommentar_kontext_abholen,
            commands::import::import_aktualisierung_starten,
            commands::import::import_aktualisierung_automatisch_starten,
            commands::import::import_aktualisierung_beenden,
            commands::import::gesetz_import_sperre_versuchen_zu_erhalten,
            commands::import::gesetz_import_sperre_freigeben,
            fenster_oeffnen_mit_label,
            fenster_alle_positionen,
            fenster::ziehvorschau::ziehvorschau_oeffnen,
            fenster::ziehvorschau::ziehvorschau_bewegen,
            fenster::ziehvorschau::ziehvorschau_verbergen,
            fenster::ziehvorschau::ziehvorschau_schliessen,
            fenster_vordergrund_holen,
            landesrecht_import::lade_gesetz_html_bw,
            landesrecht_import::lade_landesrecht_uebersichtsseite,
            landesrecht_import::lade_landesrecht_dokumentseite,
            verweismarkierung_fenster_oeffnen,
            kommentar_fenster_oeffnen,
            einstellungen_fenster_oeffnen,
            markierungskonflikte_fenster_oeffnen,
            menueleiste_aktivieren,
            menu_item_aktivieren,
            menu_normstatus_melden,
            fenster_menu_status_aktualisieren,
            system_theme_melden,
            fenster_farbschema_anwenden,
            interne_navigation_senden,
            oeffnen_link_navigation_senden,
            interne_navigation_bereit,
            interne_navigation_lesen,
            interne_navigation_bestaetigen,
            interne_navigation_abmelden,
            interne_navigation_anzeigen,
            hauptfenster_hinweis_senden,
            hauptfenster_hinweise_bereit,
            hauptfenster_hinweise_lesen,
            hauptfenster_hinweis_bestaetigen,
            hauptfenster_hinweise_abmelden,
            neues_fenster_anfordern
        ]);
    }
    #[cfg(not(desktop))]
    {
        builder = builder.invoke_handler(tauri::generate_handler![
            commands::startaufgaben::startaufgaben_anmelden,
            commands::startaufgaben::startaufgaben_lesen,
            commands::startaufgaben::startaufgaben_fortschritt,
            commands::startaufgaben::startaufgaben_abschliessen,
            commands::startaufgaben::startaufgaben_abmelden,
            commands::datei_io::dateistempel::gesetz_dateistempel_lesen,
            commands::datei_io::atomar_datei_schreiben,
            commands::datei_io::app_daten_loeschen,
            commands::datei_sperre::datei_sperre_erwerben,
            commands::datei_sperre::datei_sperre_freigeben,
            commands::datei_sperre::datei_sperre_unterbrechen,
            commands::datei_sperre::datei_sperre_fortsetzen,
            commands::datei_sperre::pruefvorgang_registrieren,
            commands::datei_sperre::pruefvorgang_abbrechen,
            commands::datei_sperre::pruefvorgang_quelle_abschliessen,
            commands::datei_sperre::pruefvorgang_fehler,
            commands::datei_sperre::pruefvorgang_teilpruefung_abschliessen,
            commands::datei_sperre::pruefvorgang_abfragen,
            commands::datei_sperre::pruefvorgang_vollbedarf,
            commands::datei_sperre::pruefvorgang_wiederholung_uebernehmen,
            commands::datei_sperre::pruefvorgang_vollpruefung_abschliessen,
            commands::datei_sperre::pruefvorgang_quellen_abwarten,
            commands::datei_io::archiviere_beschaedigte_datei,
            commands::datei_io::sichere_abweichende_version,
            commands::fensteranfragen::letzter_tab_anfrage_lesen,
            commands::fensteranfragen::tab_uebertragung_ablegen,
            commands::fensteranfragen::tab_uebertragung_abholen,
            commands::fensteranfragen::tab_uebertragung_verwerfen,
            commands::fensteranfragen::verweismarkierung_kontext_ablegen,
            commands::fensteranfragen::verweismarkierung_kontext_abholen,
            commands::fensteranfragen::kommentar_kontext_ablegen,
            commands::fensteranfragen::kommentar_kontext_abholen,
            commands::import::import_aktualisierung_starten,
            commands::import::import_aktualisierung_automatisch_starten,
            commands::import::import_aktualisierung_beenden,
            commands::import::gesetz_import_sperre_versuchen_zu_erhalten,
            commands::import::gesetz_import_sperre_freigeben
        ]);
    }

    // generate_context liefert die gebündelte Konfiguration; Änderung muss vor
    // build erfolgen, weil Tauri main vor unserem setup-Callback erzeugt.
    let kontext = tauri::generate_context!();
    // Entwicklerlauf nur im Entwicklungsbau (siehe commands/praefixlauf.rs).
    #[cfg(all(desktop, debug_assertions))]
    let kontext = {
        let mut kontext = kontext;
        commands::praefixlauf::konfiguriere_hintergrundausfuehrung(kontext.config_mut(), |k| {
            std::env::var(k).ok()
        });
        kontext
    };

    builder
        .setup(|app| {
            // ⌘Q, Dock „Beenden“ und Abmelden über die Beenden-Anfrage (fenster/beenden.rs).
            #[cfg(target_os = "macos")]
            fenster::beenden::beenden_abfangen(app.handle());

            // Unterdrückt "Start Dictation…" und "Emoji & Symbols" – von
            // macOS AUSSERHALB unseres eigenen Menüaufbaus (menu.rs) an das
            // Bearbeiten-Menü angehängt, sobald es Standard-Textfeld-Einträge
            // enthält. Es gibt dafür keinen Tauri-Parameter (anders als bei
            // den PredefinedMenuItems in menu.rs) – nur den dokumentierten,
            // wenn auch inoffiziellen NSUserDefaults-Weg. "AutoFill" (dritter
            // von Claudia beobachteter Eintrag) hat nach Recherche KEIN
            // bekanntes Äquivalent dafür; laut mehreren Cocoa-Foren/-Threads
            // existiert dafür kein NSUserDefaults-Schlüssel. Best-effort,
            // von mir NICHT auf echtem macOS getestet – bitte gegenprüfen.
            #[cfg(target_os = "macos")]
            {
                for key in [
                    "NSDisabledDictationMenuItem",
                    "NSDisabledCharacterPaletteMenuItem",
                ] {
                    let _ = std::process::Command::new("defaults")
                        .args(["write", "org.lexlata", key, "-bool", "true"])
                        .output();
                }
            }

            // main wird von Tauri bereits beim Start aus tauri.conf.json mit
            // fester Default-Größe erzeugt (unsichtbar, siehe "visible": false
            // dort). Die zuletzt gespeicherte Größe/Position liegt aber in
            // localStorage, das aus Rust nicht erreichbar ist – ohne diesen
            // Schritt müsste main also erst sichtbar werden und dann per JS
            // auf die richtige Größe springen, was auf macOS trotz
            // "visible": false zu einem kurzen Aufblitzen in Default-Größe
            // führen kann (bekannte Tauri/macOS-Eigenheit, siehe z. B.
            // tauri-apps/tauri#8981). Hier wird daher synchron eine kleine
            // Zusatzdatei gelesen, die useFensterRestore.ts bei jedem
            // Speichervorgang für main neben localStorage mitschreibt, und
            // die Größe/Position von main SOFORT gesetzt, bevor überhaupt
            // irgendein Fenster sichtbar wird. Das JS-seitige
            // geometrieAnwenden() für main bleibt als Fallback bestehen
            // (z. B. für den allerersten Start, wenn diese Datei noch nicht
            // existiert).
            //
            // Hat main selbst noch keine eigene gespeicherte Geometrie (z. B.
            // erster Start, oder main wurde zuletzt bewusst per ⌘W
            // geschlossen), greift zusätzlich derselbe Fallback wie in
            // fenster::neues_fenster(): die zuletzt von irgendeinem Fenster
            // gespeicherte Geometrie aus letzte-fenster-geometrie.json.
            //
            // Fenstergeometrie/-zustand (Größe, Position, maximiert) gibt es
            // auf Mobile nicht – dort füllt das Betriebssystem den ganzen
            // Bildschirm, kein Äquivalent zu WebviewWindow::maximize() nötig.
            #[cfg(desktop)]
            {
                if let Some(haupt_fenster) = app.get_webview_window("main") {
                    if let Ok(pfad) = app_daten_basis_pfad(app.handle()) {
                        // Liegt seit der Einstellungen-Export/-Import-Umstellung im
                        // gemeinsamen "einstellungen"-Unterordner (Gegenstück:
                        // EINSTELLUNGEN_ORDNER in appDatenZugriff.ts) statt im
                        // AppData-Root.
                        let datei = pfad
                            .join("einstellungen")
                            .join("haupt-fenster-geometrie.json");
                        let geometrie = std::fs::read_to_string(&datei)
                            .ok()
                            .and_then(|inhalt| {
                                serde_json::from_str::<FensterGeometrie>(&inhalt).ok()
                            })
                            .or_else(|| letzte_fenster_geometrie_lesen(app.handle()));
                        if let Some(g) = geometrie {
                            let _ = haupt_fenster.set_size(tauri::Size::Physical(
                                tauri::PhysicalSize {
                                    width: g.breite,
                                    height: g.hoehe,
                                },
                            ));
                            #[cfg(target_os = "macos")]
                            {
                                let _ = haupt_fenster.set_position(tauri::Position::Physical(
                                    tauri::PhysicalPosition { x: g.x, y: g.y },
                                ));
                            }
                            if g.maximiert {
                                let _ = haupt_fenster.maximize();
                            }
                        }
                    }
                }
            }

            // Native Menüleiste – nur auf macOS, Windows hat hier (noch) keine.
            #[cfg(target_os = "macos")]
            {
                menu::einrichten(app)?;
            }

            // Tiefenlinks bei laufender App (lexlata://...): Das Deep-Link-Plugin
            // liefert das "deep-link://new-url"-Event App-weit – würde man
            // es (wie zuvor) per onOpenUrl direkt im JS jedes einzelnen
            // Fensters abonnieren, verarbeiten und fokussieren alle offenen
            // Fenster den Link gleichzeitig und konkurrieren dabei um den
            // Vordergrund. Daher hier zentral EINMAL auf Rust-Seite: Ziel-
            // fenster ermitteln, nativ in den Vordergrund holen (siehe
            // tiefenlink_zielfenster_vordergrund – inkl. macOS-Fullscreen-
            // Space-Sonderfall) und den eigentlichen Link-Inhalt per
            // emit_to NUR an dieses eine Fenster weiterreichen. Auf Mobile
            // gibt es nur ein Fenster/eine Szene – dort reicht ein direktes
            // emit an alle.
            let app_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                let urls = event.urls();
                #[cfg(desktop)]
                {
                    if let Some(url) = urls.first() {
                        match fenster::navigation::oeffnen_link_aus_url_empfangen(
                            &app_handle,
                            url.as_str(),
                            false,
                        ) {
                            Ok(true) => return,
                            Err(fehler) => {
                                eprintln!("Öffnen-Link konnte nicht übergeben werden: {fehler}");
                                return;
                            }
                            Ok(false) => {}
                        }
                    }
                    if let Some(label) = tiefenlink_zielfenster_vordergrund(&app_handle) {
                        fenster::tiefenlinks_an_fenster(
                            &app_handle,
                            &label,
                            urls.into_iter().map(|url| url.to_string()).collect(),
                        );
                    }
                }
                #[cfg(not(desktop))]
                {
                    let _ = app_handle.emit("tiefenlink-oeffnen", urls);
                }
            });

            // Initiale Öffnen-Links gehören bereits vor dem ersten JS-Empfänger
            // in denselben Speicher. getCurrent im Frontend entscheidet nur
            // über Restore/Sichtbarkeit; sein Suchauftrag wird nativ dedupliziert.
            #[cfg(desktop)]
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                if let Some(url) = urls.first() {
                    if let Err(fehler) = fenster::navigation::oeffnen_link_aus_url_empfangen(
                        app.handle(),
                        url.as_str(),
                        true,
                    ) {
                        eprintln!("App-Start-Öffnen-Link konnte nicht übergeben werden: {fehler}");
                    }
                }
            }

            Ok(())
        })
        .build(kontext)
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            // Auf macOS bleibt die App nach dem letzten Fenster geöffnet.
            // Explizites Beenden einschließlich Prüflauf reicht seinen Code weiter.
            if let tauri::RunEvent::ExitRequested { ref api, code, .. } = event {
                if fenster::beenden::beenden_verhindern(cfg!(target_os = "macos"), code) {
                    api.prevent_exit();
                }
            }

            // Fokuswechsel: Das fokussierte Fenster liefert seinen fensterspezifischen
            // Menüzustand für die app-globale Menüleiste nach (menueZustandSync.ts).
            if let tauri::RunEvent::WindowEvent {
                ref label,
                event: tauri::WindowEvent::Focused(true),
                ..
            } = event
            {
                if fenster::ist_bedienfenster(label) {
                    fenster::menue_fokus_merken(app_handle, label.as_str());
                    fenster::menu_zustand_anfordern(app_handle, label.as_str());
                }
            }

            // Fensterlokale NSAppearance verändert NSApplication nicht.
            // Tauris System-ThemeChanged hält deshalb Menü-Icons auch dann
            // aktuell, wenn die App ein anderes Farbschema erzwingt.
            if let tauri::RunEvent::WindowEvent {
                ref label,
                event: tauri::WindowEvent::ThemeChanged(theme),
                ..
            } = event
            {
                if let Some(window) = app_handle.get_webview_window(label) {
                    fenster::system_theme_melden(
                        app_handle.clone(),
                        window,
                        theme == tauri::Theme::Dark,
                    );
                }
            }

            // "Schließen"/"Fenster schließen" im Ablage-Menü sollen grau sein,
            // wenn es kein sichtbares Fenster mehr gibt (siehe menu.rs). Da
            // Sichtbarkeit sich bei jedem Anzeigen/Schließen/Minimieren eines
            // BELIEBIGEN Fensters ändern kann, hier bei jedem WindowEvent neu
            // berechnen statt an einzelne Event-Varianten zu koppeln – die
            // Prüfung selbst ist billig (siehe effektiv_keine_fenster_offen).
            if let tauri::RunEvent::WindowEvent { ref event, .. } = event {
                if fenster::menue_bei_ereignis_synchronisieren(event) {
                    fenster::fenster_abhaengige_menu_items_synchronisieren(app_handle);
                }
            }
        });
}
