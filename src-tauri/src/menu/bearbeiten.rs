// Baut das native Bearbeiten-Menü.
use tauri::menu::{PredefinedMenuItem, Submenu};

pub(super) fn bearbeiten(handle: &tauri::AppHandle) -> tauri::Result<Submenu<tauri::Wry>> {
    let bearbeiten_menu = Submenu::with_items(
        handle,
        "Bearbeiten",
        true,
        &[
            &PredefinedMenuItem::undo(handle, Some("Rückgängig"))?,
            &PredefinedMenuItem::redo(handle, Some("Wiederholen"))?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::cut(handle, Some("Ausschneiden"))?,
            &PredefinedMenuItem::copy(handle, Some("Kopieren"))?,
            &PredefinedMenuItem::paste(handle, Some("Einfügen"))?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::select_all(handle, Some("Alles auswählen"))?,
        ],
    )?;

    Ok(bearbeiten_menu)
}
