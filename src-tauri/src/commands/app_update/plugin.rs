// Dünne Schicht zum Updater-Plugin (nur Rust-API, keine JS-Freigabe): Suche,
// Download mit Signaturprüfung gegen `plugins.updater.pubkey`, Installation
// und Neustart. Plugin-Fehler werden hier auf verständliche Gründe abgebildet;
// das englische Detail bleibt für die Konsole.
//
// Vor der Installation läuft die Beenden-Anfrage an alle Fenster
// (fenster/beenden_anfrage.rs). Nur wenn alle Fenster bereit sind, wird
// installiert und neu gestartet; die Fenster schließen nicht einzeln.
use super::{AppUpdate, AppUpdateFehler, AppUpdateQuelle, Fehlergrund};
use tauri::utils::config::BundleType;

const RELEASE_SEITE: &str = "https://github.com/LexLata/app/releases/latest";

/// Prozessweiter Zustand mit den Typen des Plugins.
pub(super) type AppUpdateImProzess = AppUpdate<tauri_plugin_updater::Update, Vec<u8>>;

/// Registriert Zustand und Updater-Plugin.
pub fn einrichten<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder
        .manage(AppUpdateImProzess::default())
        .plugin(tauri_plugin_updater::Builder::new().build())
}

/// Bei Linux-Paketen aus `.deb`/`.rpm` verweist die App für das App-Update
/// auf die Release-Seite. Alle übrigen Installationsarten
/// (AppImage, macOS-Bundle, Windows-Installer, unbekannt) gelten als installierbar.
pub(super) fn installierbar(installationsart: Option<BundleType>) -> bool {
    !matches!(installationsart, Some(BundleType::Deb | BundleType::Rpm))
}

/// Signaturfehler getrennt; fehlende Verbindung nur bei Verbindungs- oder
/// Zeitüberschreitungsfehlern der Anfrage, alles Übrige ist `sonstiges`.
pub(super) fn einordnen(fehler: tauri_plugin_updater::Error) -> AppUpdateFehler {
    use tauri_plugin_updater::Error;
    let grund = match &fehler {
        Error::Minisign(_)
        | Error::Base64(_)
        | Error::SignatureUtf8(_)
        | Error::SignedVersionMismatch { .. }
        | Error::MissingSignedVersion => Fehlergrund::Signatur,
        Error::Reqwest(anfrage) if anfrage.is_connect() || anfrage.is_timeout() => {
            Fehlergrund::KeineVerbindung
        }
        _ => Fehlergrund::Sonstiges,
    };
    AppUpdateFehler {
        grund,
        detail: fehler.to_string(),
    }
}

pub(super) struct PluginQuelle<R: tauri::Runtime>(pub(super) tauri::AppHandle<R>);

impl<R: tauri::Runtime> AppUpdateQuelle for PluginQuelle<R> {
    type Fund = tauri_plugin_updater::Update;
    type Paket = Vec<u8>;

    async fn suchen(&self) -> Result<Option<(String, Self::Fund)>, AppUpdateFehler> {
        use tauri_plugin_updater::UpdaterExt;
        let updater = self.0.updater().map_err(einordnen)?;
        let update = updater.check().await.map_err(einordnen)?;
        Ok(update.map(|update| (update.version.clone(), update)))
    }

    async fn herunterladen(
        &self,
        fund: &Self::Fund,
        fortschritt: impl FnMut(usize, Option<u64>),
    ) -> Result<Self::Paket, AppUpdateFehler> {
        fund.download(fortschritt, || {}).await.map_err(einordnen)
    }

    fn installieren(&self, fund: &Self::Fund, paket: &Self::Paket) -> Result<(), AppUpdateFehler> {
        // Windows: Das Plugin startet den NSIS-Installer und beendet den Prozess.
        fund.install(paket).map_err(einordnen)?;
        crate::fenster::beenden::beenden_freigeben();
        self.0.restart()
    }
}

pub(super) fn release_seite_oeffnen<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(RELEASE_SEITE, None::<&str>)
        .map_err(|fehler| fehler.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri_plugin_updater::Error;

    #[test]
    fn nur_deb_und_rpm_sind_nicht_selbst_installierbar() {
        assert!(!installierbar(Some(BundleType::Deb)));
        assert!(!installierbar(Some(BundleType::Rpm)));
        for art in [
            BundleType::AppImage,
            BundleType::App,
            BundleType::Dmg,
            BundleType::Nsis,
            BundleType::Msi,
        ] {
            assert!(installierbar(Some(art.clone())), "{art:?}");
        }
        assert!(installierbar(None));
    }

    #[test]
    fn signaturfehler_werden_als_signatur_eingeordnet() {
        for fehler in [
            Error::SignatureUtf8("x".into()),
            Error::MissingSignedVersion,
            Error::SignedVersionMismatch {
                signed: "1.0.0".into(),
                announced: "2.0.0".into(),
            },
        ] {
            assert_eq!(einordnen(fehler).grund, Fehlergrund::Signatur);
        }
    }

    #[test]
    fn uebrige_fehler_sind_sonstiges_und_behalten_das_detail() {
        let eingeordnet = einordnen(Error::ReleaseNotFound);
        assert_eq!(eingeordnet.grund, Fehlergrund::Sonstiges);
        assert_eq!(
            eingeordnet.detail,
            "Could not fetch a valid release JSON from the remote"
        );
        assert_eq!(
            einordnen(Error::Network("status 404".into())).grund,
            Fehlergrund::Sonstiges
        );
    }
}
