// commands.rs
// Ordnet die nativen Commands nach Datei-I/O, Fensterzustand und Import.
// Typen und Fenster-Helfer bleiben für bestehende Rust-Aufrufstellen verfügbar.

// App-Update (Updater-Plugin) nur am Desktop.
#[cfg(desktop)]
pub(crate) mod app_update;
pub(crate) mod datei_io;
// Datenordner im Dateimanager öffnen: nur am Desktop.
#[cfg(desktop)]
pub(crate) mod datenordner;
pub(crate) mod fensteranfragen;
pub(crate) mod import;

#[cfg(target_os = "macos")]
pub use fensteranfragen::effektiv_keine_fenster_offen;
pub use fensteranfragen::{
    KommentarKontexte, LetzterTabAnfrage, TabUebertragungen, VerweismarkierungKontexte,
};
pub use import::{GesetzImportSperre, ImportAktualisierungVorgaenge};

pub(crate) mod datei_sperre;
pub use datei_sperre::DateiSperren;

// Entwicklerlauf: nur im Entwicklungsbau übersetzt.
#[cfg(all(desktop, debug_assertions))]
pub(crate) mod praefixlauf;

pub(crate) mod startaufgaben;
