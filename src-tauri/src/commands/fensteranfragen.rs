// commands/fensteranfragen.rs
// Verwaltet kurzlebige Fensteranfragen und die Übergabe von Kontextdaten
// zwischen Hauptfenster und eigenständigen Fenstern.

use tauri::Manager;

// Überbrückt die kurze Zeitspanne zwischen "⇧⌘T ohne offenes Fenster wurde
// im nativen Menü geklickt" (menu.rs, macOS) und "das daraufhin neu
// erzeugte Fenster ist fertig gemountet und fragt nach". Ein `emit` an
// dieser Stelle würde ins Leere laufen, weil beim Klick noch kein
// JS-Listener existiert (das Fenster wird ja gerade erst erzeugt) – anders
// als beim bereits offenen/fokussierten Fenster, wo der bestehende Weg über
// `emit_to(label, "letzter-tab-oeffnen", ())` weiterhin funktioniert.
//
// Bewusst ein einzelnes Bool statt z. B. einer Fenster-Label-Map: Der Fall
// tritt nur ein, wenn KEIN Fenster offen ist, wodurch als Reaktion darauf
// auch nur genau ein neues Fenster entsteht – es gibt also nie mehrere
// gleichzeitig "wartende" Fenster, die eine Zuordnung bräuchten.
#[derive(Default)]
pub struct LetzterTabAnfrage(pub std::sync::Mutex<bool>);

/// Wird von App.tsx beim Start jedes Fensters einmalig abgefragt. Liefert
/// `true` genau dann, wenn dieses Fenster als Reaktion auf ⇧⌘T ohne
/// vorheriges offenes Fenster erzeugt wurde – und setzt das Flag dabei
/// zurück, damit ein später normal geöffnetes Fenster (z. B. "Neues
/// Fenster") nicht fälschlich denselben Zustand liest.
#[tauri::command]
pub fn letzter_tab_anfrage_lesen(state: tauri::State<LetzterTabAnfrage>) -> bool {
    let mut anfrage = crate::sperren::sperren(&state.0);
    std::mem::take(&mut *anfrage)
}

/// Ersetzt `app_handle.webview_windows().is_empty()` in menu.rs. Grund:
/// Das versteckte "main"-Fenster (siehe useFensterRestore.ts, initialRestore
/// – main bleibt beim Start per fensterVerstecken() unsichtbar liegen, wenn
/// der eigentliche Inhalt in anderen Fenstern lag) taucht in
/// webview_windows() dauerhaft auf, obwohl der Nutzer kein Fenster sieht.
/// Ein reiner Existenz-Check (is_empty()) ist daher kein verlässliches
/// Signal für "kein Fenster offen" – entscheidend ist Sichtbarkeit.
#[cfg(any(target_os = "macos", test))]
pub fn effektiv_keine_fenster_offen<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> bool {
    !crate::fenster::hat_sichtbare_bedienfenster(
        app.webview_windows()
            .iter()
            .map(|(label, fenster)| (label.as_str(), fenster.is_visible().unwrap_or(false))),
    )
}

// Verweismarkierung- und Kommentarkontexte verwenden getrennte Ablagen mit
// gleichem technischen Aufbau. Tabübertragungen ergänzen weiter unten einen
// Überschreibschutz und gezieltes Verwerfen für fehlgeschlagene Übertragungen.
macro_rules! uebertragungs_speicher {
    (
        $(#[$struct_meta:meta])*
        $struct_name:ident,
        $(#[$ablegen_meta:meta])*
        $ablegen_fn:ident,
        $(#[$abholen_meta:meta])*
        $abholen_fn:ident
    ) => {
        $(#[$struct_meta])*
        #[derive(Default)]
        pub struct $struct_name(pub std::sync::Mutex<std::collections::HashMap<String, String>>);

        $(#[$ablegen_meta])*
        #[tauri::command]
        pub fn $ablegen_fn(
            state: tauri::State<$struct_name>,
            label: String,
            payload: String,
        ) {
            crate::sperren::sperren(&state.0).insert(label, payload);
        }

        $(#[$abholen_meta])*
        #[tauri::command]
        pub fn $abholen_fn(
            state: tauri::State<$struct_name>,
            label: String,
        ) -> Option<String> {
            crate::sperren::sperren(&state.0).remove(&label)
        }
    };
}

/// Kurzlebige, gegen Überschreiben geschützte Tabablage; JSON bleibt undurchsichtig.
#[derive(Default)]
pub struct TabUebertragungen(pub std::sync::Mutex<std::collections::HashMap<String, String>>);

#[tauri::command]
pub fn tab_uebertragung_ablegen(
    state: tauri::State<TabUebertragungen>,
    label: String,
    payload: String,
) -> Result<(), String> {
    let mut ablagen = crate::sperren::sperren(&state.0);
    if ablagen.contains_key(&label) {
        return Err("Für das Zielfenster wartet bereits eine Tab-Übertragung.".into());
    }
    ablagen.insert(label, payload);
    Ok(())
}

#[tauri::command]
pub fn tab_uebertragung_abholen(
    state: tauri::State<TabUebertragungen>,
    label: String,
) -> Option<String> {
    crate::sperren::sperren(&state.0).remove(&label)
}

/// Ein gescheiterter Sender darf keine inzwischen neu abgelegte Übertragung entfernen.
#[tauri::command]
pub fn tab_uebertragung_verwerfen(
    state: tauri::State<TabUebertragungen>,
    label: String,
    payload: String,
) {
    let mut ablagen = crate::sperren::sperren(&state.0);
    if ablagen.get(&label) == Some(&payload) {
        ablagen.remove(&label);
    }
}

uebertragungs_speicher!(
    /// Kurzlebiger Speicher für die Startdaten des eigenständigen
    /// Verweismarkierung-Fensters (siehe VerweismarkierungKontext in appTypes.ts,
    /// useMarkierungen.ts: handleVerweismarkierungAnfrage, fenster.rs:
    /// verweismarkierung_fenster_oeffnen) – exakt dasselbe Ablage-Muster wie
    /// TabUebertragungen oben, nur mit eigenem Zustand, da beide
    /// Übertragungen inhaltlich unabhängig sind und potenziell zeitgleich
    /// (mehrere offene Verweismarkierung-Fenster) vorliegen können.
    VerweismarkierungKontexte,
    verweismarkierung_kontext_ablegen,
    verweismarkierung_kontext_abholen
);

uebertragungs_speicher!(
    /// Pendant zu VerweismarkierungKontexte für das Kommentar-Fenster (siehe
    /// KommentarKontext in appTypes.ts, useMarkierungen.ts:
    /// handleKommentarAnfrage, fenster.rs: kommentar_fenster_oeffnen) –
    /// eigener State-Typ statt Wiederverwendung von VerweismarkierungKontexte, da
    /// beide Übertragungen inhaltlich unabhängig sind und potenziell
    /// zeitgleich vorliegen können (gleiches Argument wie bei
    /// VerweismarkierungKontexte selbst oben).
    KommentarKontexte,
    kommentar_kontext_ablegen,
    kommentar_kontext_abholen
);

/// Gemeinsames Aufräumen beim tatsächlichen Zerstören, auch auf Mobile.
pub fn fenster_zerstoert<R: tauri::Runtime>(window: &tauri::Window<R>) {
    #[cfg(desktop)]
    {
        window
            .state::<crate::fenster::navigation::Navigation>()
            .schliessen(window.label());
        window
            .state::<crate::fenster::hinweise::HauptfensterHinweise>()
            .schliessen(window.label());
        crate::fenster::ziehvorschau::quelle_zerstoert(window);
    }
    let result = super::datei_sperre::fenster_sitzung(window)
        .and_then(|sitzung| window.state::<super::DateiSperren>().schliessen(sitzung));
    if let Err(e) = result {
        eprintln!("Dateisperren beim Fensterschließen: {e}");
    }
}

#[cfg(test)]
mod tab_uebertragung_tests {
    use super::*;
    use tauri::Manager;

    #[test]
    fn erkennt_fehlende_bedienfenster_beim_wiederoeffnen_geschlossener_tabs() {
        let app = tauri::test::mock_builder()
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        assert!(effektiv_keine_fenster_offen(app.handle()));
        let vorschau = tauri::WebviewWindowBuilder::new(&app, "ziehvorschau", Default::default())
            .build()
            .unwrap();
        vorschau.show().unwrap();
        assert!(effektiv_keine_fenster_offen(app.handle()));
        // Der Tauri-Mock meldet vorhandene Fenster immer als sichtbar.
        tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        assert!(!effektiv_keine_fenster_offen(app.handle()));
    }

    #[test]
    fn bestehende_ablage_bleibt_bei_parallelversuch_und_fremdem_abbruch_erhalten() {
        let app = tauri::test::mock_builder()
            .manage(TabUebertragungen::default())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        assert!(tab_uebertragung_ablegen(app.state(), "ziel".into(), "erste".into()).is_ok());
        assert!(tab_uebertragung_ablegen(app.state(), "ziel".into(), "zweite".into()).is_err());
        tab_uebertragung_verwerfen(app.state(), "ziel".into(), "zweite".into());
        assert_eq!(
            tab_uebertragung_abholen(app.state(), "ziel".into()),
            Some("erste".into())
        );
        assert_eq!(tab_uebertragung_abholen(app.state(), "ziel".into()), None);
        assert!(tab_uebertragung_ablegen(app.state(), "ziel".into(), "zweite".into()).is_ok());
        tab_uebertragung_verwerfen(app.state(), "ziel".into(), "zweite".into());
        assert_eq!(tab_uebertragung_abholen(app.state(), "ziel".into()), None);
    }

    #[test]
    fn tab_commands_reichen_json_unveraendert_ueber_die_ipc_grenze() {
        let app = tauri::test::mock_builder()
            .manage(TabUebertragungen::default())
            .invoke_handler(tauri::generate_handler![
                tab_uebertragung_ablegen,
                tab_uebertragung_abholen,
                tab_uebertragung_verwerfen
            ])
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let fenster = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        let ipc = |cmd: &str, body| {
            tauri::test::get_ipc_response(
                &fenster,
                tauri::webview::InvokeRequest {
                    cmd: cmd.into(),
                    callback: tauri::ipc::CallbackFn(0),
                    error: tauri::ipc::CallbackFn(1),
                    url: if cfg!(windows) {
                        "http://tauri.localhost"
                    } else {
                        "tauri://localhost"
                    }
                    .parse()
                    .unwrap(),
                    body: tauri::ipc::InvokeBody::Json(body),
                    headers: Default::default(),
                    invoke_key: tauri::test::INVOKE_KEY.into(),
                },
            )
        };
        let payload = r#"{"gesetzesreferenz":{"kurztitel":"Bgb","normgeber":"bund"},"transport":{"kennung":"eins","quellLabel":"quelle","gueltigBis":123}}"#;
        let ablage = serde_json::json!({"label": "ziel", "payload": payload});
        assert!(ipc("tab_uebertragung_ablegen", ablage.clone()).is_ok());
        assert!(ipc("tab_uebertragung_ablegen", ablage.clone()).is_err());
        assert!(ipc(
            "tab_uebertragung_verwerfen",
            serde_json::json!({"label": "ziel", "payload": "fremd"})
        )
        .is_ok());
        assert_eq!(
            ipc(
                "tab_uebertragung_abholen",
                serde_json::json!({"label": "ziel"})
            )
            .unwrap()
            .deserialize::<Option<String>>()
            .unwrap(),
            Some(payload.into())
        );
        assert!(ipc("tab_uebertragung_ablegen", ablage.clone()).is_ok());
        assert!(ipc("tab_uebertragung_verwerfen", ablage).is_ok());
        assert_eq!(
            ipc(
                "tab_uebertragung_abholen",
                serde_json::json!({"label": "ziel"})
            )
            .unwrap()
            .deserialize::<Option<String>>()
            .unwrap(),
            None
        );
    }
}
