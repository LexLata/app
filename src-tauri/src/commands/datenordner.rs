// commands/datenordner.rs
// Öffnet einen Ordner des LexLata-Datenordners im Dateimanager (Desktop).
// Die Oberfläche hat keine eigene Opener-Berechtigung: Sie kann nur diesen
// Befehl mit einem relativen Ordner aufrufen. Dateien (etwa eingeschleuste
// Skripte) und Ziele außerhalb des Datenordners werden nie geöffnet.

use std::fs;
use std::path::{Path, PathBuf};

use super::datei_io::validiere_relativen_pfad;

/// Ermittelt den zu öffnenden Ordner: ohne Angabe den Datenordner selbst,
/// sonst den relativen Ordner darin. Jeder Pfadteil muss ein echter Ordner
/// sein (keine Datei, kein symbolischer Link); das Ziel muss existieren.
fn ordner_im_datenordner(basis: &Path, relativer_ordner: Option<&str>) -> Result<PathBuf, String> {
    let relativ = match relativer_ordner {
        None => PathBuf::new(),
        Some(ordner) => validiere_relativen_pfad(ordner)?,
    };
    let mut aktuell = basis.to_path_buf();
    for teil in std::iter::once(None).chain(relativ.components().map(Some)) {
        if let Some(teil) = teil {
            aktuell.push(teil.as_os_str());
        }
        let metadaten = fs::symlink_metadata(&aktuell).map_err(|fehler| {
            format!("Ordner nicht vorhanden ({}): {fehler}", aktuell.display())
        })?;
        if metadaten.file_type().is_symlink() {
            return Err(format!(
                "Symbolische Links werden nicht geöffnet: {}",
                aktuell.display()
            ));
        }
        if !metadaten.is_dir() {
            return Err(format!("Kein Ordner: {}", aktuell.display()));
        }
    }
    // Zweite Sicherung: das aufgelöste Ziel liegt im aufgelösten Datenordner.
    let ziel = fs::canonicalize(&aktuell).map_err(|fehler| fehler.to_string())?;
    let basis = fs::canonicalize(basis).map_err(|fehler| fehler.to_string())?;
    if !ziel.starts_with(&basis) {
        return Err(format!(
            "Ordner liegt nicht im Datenordner: {}",
            ziel.display()
        ));
    }
    Ok(ziel)
}

/// Öffnet den Datenordner oder einen Ordner darin im Dateimanager.
#[tauri::command]
pub async fn datenordner_oeffnen<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    relativer_ordner: Option<String>,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let basis = crate::app_daten_basis_pfad(&app)
        .map_err(|fehler| format!("App-Daten-Ordner konnte nicht ermittelt werden: {fehler}"))?;
    let ziel = ordner_im_datenordner(&basis, relativer_ordner.as_deref())?;
    app.opener()
        .open_path(ziel.to_string_lossy(), None::<&str>)
        .map_err(|fehler| fehler.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    static TEST_ZAEHLER: AtomicU64 = AtomicU64::new(0);

    struct TestOrdner(PathBuf);

    impl TestOrdner {
        fn neu() -> Self {
            let nummer = TEST_ZAEHLER.fetch_add(1, Ordering::Relaxed);
            let pfad = std::env::temp_dir().join(format!(
                "lexlata-datenordner-test-{}-{nummer}",
                std::process::id()
            ));
            fs::create_dir_all(pfad.join("basis/markierungen")).unwrap();
            fs::create_dir_all(pfad.join("aussen")).unwrap();
            fs::write(pfad.join("basis/markierungen/skript.bat"), "x").unwrap();
            Self(pfad)
        }

        fn basis(&self) -> PathBuf {
            self.0.join("basis")
        }
    }

    impl Drop for TestOrdner {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn oeffnet_datenordner_und_ordner_darin() {
        let ordner = TestOrdner::neu();
        let basis = fs::canonicalize(ordner.basis()).unwrap();
        assert_eq!(ordner_im_datenordner(&ordner.basis(), None).unwrap(), basis);
        assert_eq!(
            ordner_im_datenordner(&ordner.basis(), Some("markierungen")).unwrap(),
            basis.join("markierungen")
        );
    }

    #[test]
    fn lehnt_ausbruch_und_absolute_pfade_ab() {
        let ordner = TestOrdner::neu();
        for pfad in [
            "..",
            "../aussen",
            "markierungen/../..",
            "/",
            "",
            "./markierungen",
        ] {
            assert!(
                ordner_im_datenordner(&ordner.basis(), Some(pfad)).is_err(),
                "{pfad} muss abgelehnt werden"
            );
        }
        let absolut = ordner.0.join("aussen").to_string_lossy().into_owned();
        assert!(ordner_im_datenordner(&ordner.basis(), Some(&absolut)).is_err());
    }

    #[test]
    fn lehnt_datei_und_fehlenden_ordner_ab() {
        let ordner = TestOrdner::neu();
        assert!(ordner_im_datenordner(&ordner.basis(), Some("markierungen/skript.bat")).is_err());
        assert!(ordner_im_datenordner(&ordner.basis(), Some("fehlt")).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn lehnt_symbolischen_link_aus_dem_datenordner_heraus_ab() {
        let ordner = TestOrdner::neu();
        std::os::unix::fs::symlink(ordner.0.join("aussen"), ordner.basis().join("verweis"))
            .unwrap();
        assert!(ordner_im_datenordner(&ordner.basis(), Some("verweis")).is_err());
    }
}
