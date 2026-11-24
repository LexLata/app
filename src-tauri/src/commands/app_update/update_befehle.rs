// Tauri-Commands des App-Updates; melden jeden neuen Zustand allen Hauptfenstern.
use super::plugin::{self, installierbar, AppUpdateImProzess, PluginQuelle};
use super::{Anlass, AppUpdateMeldung, Installationsergebnis, Pruefergebnis};
use crate::fenster::beenden_anfrage::{BeendenAnfrage, Frist, TauriFenster};
use std::time::SystemTime;
use tauri::{Emitter, Manager};

const EREIGNIS: &str = "app-update-zustand";

fn an_hauptfenster_melden<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> impl Fn(&AppUpdateMeldung) + '_ {
    move |meldung| {
        hauptfenster_benachrichtigen(app.webview_windows().into_keys(), |label| {
            let _ = app.emit_to(label, EREIGNIS, meldung);
        });
    }
}

pub(super) fn hauptfenster_benachrichtigen(
    labels: impl IntoIterator<Item = String>,
    mut senden: impl FnMut(&str),
) {
    for label in labels {
        if crate::fenster::ist_hauptfenster(&label) {
            senden(&label);
        }
    }
}

#[tauri::command]
pub fn app_update_zustand(state: tauri::State<AppUpdateImProzess>) -> AppUpdateMeldung {
    state.meldung()
}

#[tauri::command]
pub async fn app_update_pruefen<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    anlass: Anlass,
) -> Result<Pruefergebnis, String> {
    let state = app.state::<AppUpdateImProzess>();
    let ergebnis = state
        .pruefen(
            anlass,
            SystemTime::now(),
            &PluginQuelle(app.clone()),
            installierbar(tauri::utils::platform::bundle_type()),
            an_hauptfenster_melden(&app),
        )
        .await;
    if let Some(detail) = &ergebnis.detail {
        eprintln!("App-Update: Prüfung fehlgeschlagen: {detail}");
    }
    Ok(ergebnis)
}

#[tauri::command]
pub fn app_update_ausblenden<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<AppUpdateImProzess>,
) {
    state.ausblenden(an_hauptfenster_melden(&app));
}

/// Kehrt nach Abschluss des Downloads zurück; den Verlauf melden die Zustandsereignisse.
#[tauri::command]
pub async fn app_update_herunterladen<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    let state = app.state::<AppUpdateImProzess>();
    state
        .herunterladen(&PluginQuelle(app.clone()), an_hauptfenster_melden(&app))
        .await
}

#[tauri::command]
pub async fn app_update_installieren<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<Installationsergebnis, String> {
    let state = app.state::<AppUpdateImProzess>();
    let anfrage = app.state::<BeendenAnfrage>();
    state
        .installieren(
            &PluginQuelle(app.clone()),
            &anfrage,
            &TauriFenster(&app),
            &Frist,
            an_hauptfenster_melden(&app),
        )
        .await
}

/// Öffnet die Release-Seite (Linux-Pakete ohne Selbstinstallation); feste Adresse.
#[tauri::command]
pub fn app_update_release_seite_oeffnen<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<(), String> {
    plugin::release_seite_oeffnen(&app)
}
