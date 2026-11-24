// Native Commands für Dateisperren und Prüfvorgänge; verwenden den gemeinsamen Zustand.
use super::{fenster_sitzung, DateiSperren, VorgangsStand, DATEI_SPERRE_FRIST};

#[tauri::command]
pub fn pruefvorgang_registrieren(
    window: tauri::Window,
    sperren: tauri::State<'_, DateiSperren>,
    konflikt_token: String,
) -> Result<String, String> {
    sperren.vorgang_registrieren(fenster_sitzung(&window)?, &konflikt_token)
}
#[tauri::command]
pub async fn pruefvorgang_quellen_abwarten(
    window: tauri::Window,
    sperren: tauri::State<'_, DateiSperren>,
) -> Result<(), String> {
    sperren.quellen_abwarten(fenster_sitzung(&window)?).await
}

#[tauri::command]
pub fn datei_sperre_unterbrechen(
    window: tauri::Window,
    sperren: tauri::State<'_, DateiSperren>,
    token: String,
) -> Result<(), String> {
    sperren.unterbrechen(fenster_sitzung(&window)?, &token)
}
#[tauri::command]
pub async fn datei_sperre_fortsetzen(
    window: tauri::Window,
    sperren: tauri::State<'_, DateiSperren>,
    token: String,
) -> Result<bool, String> {
    let sitzung = fenster_sitzung(&window)?;
    sperren
        .fortsetzen(sitzung, &token, DATEI_SPERRE_FRIST)
        .await
}

#[tauri::command]
pub async fn datei_sperre_erwerben(
    window: tauri::Window,
    sperren: tauri::State<'_, DateiSperren>,
    relativer_pfad: String,
) -> Result<String, String> {
    let sitzung = fenster_sitzung(&window)?;
    sperren
        .erwerben(sitzung, &relativer_pfad, DATEI_SPERRE_FRIST)
        .await
}
#[tauri::command]
pub fn datei_sperre_freigeben(
    window: tauri::Window,
    sperren: tauri::State<'_, DateiSperren>,
    token: String,
) -> Result<(), String> {
    sperren.freigeben(fenster_sitzung(&window)?, &token)
}

#[tauri::command]
pub fn pruefvorgang_abbrechen(
    window: tauri::Window,
    sperren: tauri::State<'_, DateiSperren>,
    konflikt_token: String,
    vorgaenge: Vec<String>,
) -> Result<VorgangsStand, String> {
    sperren.vorgang_aktion(
        fenster_sitzung(&window)?,
        &konflikt_token,
        &vorgaenge,
        "abbrechen",
    )
}

#[tauri::command]
pub fn pruefvorgang_quelle_abschliessen(
    window: tauri::Window,
    sperren: tauri::State<'_, DateiSperren>,
    konflikt_token: String,
    vorgaenge: Vec<String>,
) -> Result<VorgangsStand, String> {
    sperren.vorgang_aktion(
        fenster_sitzung(&window)?,
        &konflikt_token,
        &vorgaenge,
        "quelle",
    )
}

#[tauri::command]
pub fn pruefvorgang_fehler(
    window: tauri::Window,
    sperren: tauri::State<'_, DateiSperren>,
    konflikt_token: String,
    vorgaenge: Vec<String>,
) -> Result<VorgangsStand, String> {
    sperren.vorgang_aktion(
        fenster_sitzung(&window)?,
        &konflikt_token,
        &vorgaenge,
        "fehler",
    )
}

#[tauri::command]
pub fn pruefvorgang_teilpruefung_abschliessen(
    window: tauri::Window,
    sperren: tauri::State<'_, DateiSperren>,
    konflikt_token: String,
    vorgaenge: Vec<String>,
) -> Result<VorgangsStand, String> {
    sperren.vorgang_aktion(
        fenster_sitzung(&window)?,
        &konflikt_token,
        &vorgaenge,
        "teil",
    )
}

#[tauri::command]
pub fn pruefvorgang_abfragen<R: tauri::Runtime>(
    window: tauri::Window<R>,
    sperren: tauri::State<'_, DateiSperren>,
    konflikt_token: String,
    vorgaenge: Vec<String>,
) -> Result<VorgangsStand, String> {
    sperren.vorgang_aktion(
        fenster_sitzung(&window)?,
        &konflikt_token,
        &vorgaenge,
        "stand",
    )
}

#[tauri::command]
pub fn pruefvorgang_vollbedarf(
    window: tauri::Window,
    sperren: tauri::State<'_, DateiSperren>,
    konflikt_token: String,
    vorgaenge: Vec<String>,
) -> Result<VorgangsStand, String> {
    sperren.vorgang_aktion(
        fenster_sitzung(&window)?,
        &konflikt_token,
        &vorgaenge,
        "bedarf",
    )
}

#[tauri::command]
pub fn pruefvorgang_vollpruefung_abschliessen(
    window: tauri::Window,
    sperren: tauri::State<'_, DateiSperren>,
    konflikt_token: String,
    vorgaenge: Vec<String>,
) -> Result<VorgangsStand, String> {
    sperren.vorgang_aktion(
        fenster_sitzung(&window)?,
        &konflikt_token,
        &vorgaenge,
        "voll",
    )
}

#[tauri::command]
pub fn pruefvorgang_wiederholung_uebernehmen(
    window: tauri::Window,
    sperren: tauri::State<'_, DateiSperren>,
    konflikt_token: String,
) -> Result<bool, String> {
    sperren.wiederholung_uebernehmen(fenster_sitzung(&window)?, &konflikt_token)
}
