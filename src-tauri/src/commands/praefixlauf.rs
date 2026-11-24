// commands/praefixlauf.rs
// Ausschließlich entwicklungsseitige Repository-Dateien; keine AppData-Ziele.
pub mod arbeitsdateien;
mod terminal;

use std::fs;
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Ausgabeart {
    #[default]
    Detail,
    Ergebnis,
    Status,
}

#[derive(Debug, serde::Serialize)]
pub struct Auftrag {
    normgeber: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    debug: Option<bool>,
    modus: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    anzahl: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    neu: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    kurztitel: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    gescheitert: Option<bool>,
    #[serde(skip)]
    datei: Option<PathBuf>,
    #[serde(skip)]
    arbeitsdaten: PathBuf,
}

fn absoluter_pfad(wert: Option<String>) -> Result<PathBuf, String> {
    let pfad = PathBuf::from(wert.ok_or("Präfixlauf-Ziel fehlt.")?);
    if !pfad.is_absolute()
        || pfad
            .components()
            .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
        || pfad.file_name().is_none()
    {
        return Err("Präfixlauf-Ziel muss ein gültiger absoluter Pfad sein.".into());
    }
    // Alle vorhandenen Vorfahren prüfen, auch oberhalb des Basisordners.
    for vorfahr in pfad.ancestors() {
        match fs::symlink_metadata(vorfahr) {
            Ok(m) if m.file_type().is_symlink() => {
                return Err("Symbolische Links sind im Präfixlauf-Ziel nicht erlaubt.".into())
            }
            Ok(m) if vorfahr != pfad.as_path() && !m.is_dir() => {
                return Err("Ein Elternteil des Präfixlauf-Ziels ist kein Ordner.".into())
            }
            Ok(_) => {}
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(pfad)
}

fn auftrag_aus<F>(mut lesen: F) -> Result<Option<Auftrag>, String>
where
    F: FnMut(&str) -> Option<String>,
{
    let Some(normgeber) = lesen("LEXLATA_PRAEFIXLAUF") else {
        return Ok(None);
    };
    let modus = lesen("LEXLATA_PRAEFIXLAUF_MODUS").ok_or("Modus fehlt.")?;
    if !["praefix", "quelldateien", "gesetzesxml", "auswerten"].contains(&modus.as_str()) {
        return Err("Ungültiger Modus.".into());
    }
    if !["de-bund", "de-bw", "eu"].contains(&normgeber.as_str())
        || (normgeber == "eu" && !["quelldateien", "gesetzesxml"].contains(&modus.as_str()))
    {
        return Err("Ungültiger Normgeber im Präfixlauf: de-bund, de-bw; eu nur für quelldateien und gesetzesxml.".into());
    }
    let anzahl = if modus == "auswerten" {
        if lesen("LEXLATA_PRAEFIXLAUF_ANZAHL").is_some() {
            return Err("Auswertung hat keine Anzahl.".into());
        }
        None
    } else {
        let wert = lesen("LEXLATA_PRAEFIXLAUF_ANZAHL").ok_or("Anzahl fehlt.")?;
        if !wert.bytes().all(|b| b.is_ascii_digit()) {
            return Err("Ungültige Anzahl.".into());
        }
        let zahl = wert.parse::<usize>().map_err(|_| "Ungültige Anzahl.")?;
        if zahl == 0 || zahl as u128 > 9_007_199_254_740_991 {
            return Err("Ungültige Anzahl.".into());
        }
        Some(zahl)
    };
    let debug = match lesen("LEXLATA_PRAEFIXLAUF_DEBUG").as_deref() {
        None => None,
        Some("1") => Some(true),
        _ => return Err("Ungültige Debugoption.".into()),
    };
    let neu = match lesen("LEXLATA_PRAEFIXLAUF_NEU").as_deref() {
        None => None,
        Some("1") if ["gesetzesxml", "quelldateien"].contains(&modus.as_str()) => Some(true),
        _ => return Err("Ungültige Neuerzeugungsoption.".into()),
    };
    let kurztitel = lesen("LEXLATA_PRAEFIXLAUF_KURZTITEL").map(|s| {
        s.split(',')
            .map(|k| k.trim().to_owned())
            .collect::<Vec<_>>()
    });
    if kurztitel
        .as_ref()
        .is_some_and(|liste| liste.iter().any(String::is_empty))
    {
        return Err("Leerer Kurztitel.".into());
    }
    let gescheitert = match lesen("LEXLATA_PRAEFIXLAUF_GESCHEITERT").as_deref() {
        None => None,
        Some("1") if kurztitel.is_none() && modus == "praefix" => Some(true),
        _ => return Err("Ungültige Fehlerauswahl.".into()),
    };
    let datei = match (modus.as_str(), lesen("LEXLATA_PRAEFIXLAUF_DATEI")) {
        ("praefix" | "auswerten", wert) => Some(absoluter_pfad(wert)?),
        (_, None) => None,
        _ => return Err("Dieser Modus erlaubt keinen Listenpfad.".into()),
    };
    let arbeitsdaten = absoluter_pfad(lesen("LEXLATA_PRAEFIXLAUF_ARBEITSDATEN"))?;
    if datei.as_ref().is_some_and(|datei| {
        datei.starts_with(&arbeitsdaten) || arbeitsdaten.starts_with(datei) || datei.is_dir()
    }) || (arbeitsdaten.exists() && !arbeitsdaten.is_dir())
    {
        return Err("Liste und Arbeitsordner müssen getrennte gültige Ziele sein.".into());
    }
    Ok(Some(Auftrag {
        normgeber,
        debug,
        modus,
        neu,
        anzahl,
        kurztitel,
        gescheitert,
        datei,
        arbeitsdaten,
    }))
}

fn fordere_auftrag<F>(lesen: F) -> Result<Auftrag, String>
where
    F: FnMut(&str) -> Option<String>,
{
    auftrag_aus(lesen)?.ok_or_else(|| "Kein gültiger Entwicklungsauftrag.".into())
}

/// Passt den Kontext vor dem automatischen Fensterbau an. Ungültige Aufträge
/// und normale Starts behalten ihre vollständige Konfiguration.
pub(crate) fn konfiguriere_hintergrundausfuehrung(
    konfiguration: &mut tauri::utils::config::Config,
    lesen: impl FnMut(&str) -> Option<String>,
) {
    if !matches!(auftrag_aus(lesen), Ok(Some(_))) {
        return;
    }
    if let Some(fenster) = konfiguration
        .app
        .windows
        .iter_mut()
        .find(|f| f.label == "main")
    {
        fenster.background_throttling =
            Some(tauri::utils::config::BackgroundThrottlingPolicy::Disabled);
    }
}

// Auch Auftrags-/Pfadprüfung und Terminalausgabe dürfen den Fensterloop nicht
// mit synchronen Dateisystemzugriffen oder einer blockierten Ausgabe aufhalten.
async fn im_hintergrund<T: Send + 'static>(
    arbeit: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(arbeit)
        .await
        .map_err(|e| format!("Präfixlauf-Hintergrundarbeit fehlgeschlagen: {e}"))?
}

fn mit_dateidiagnose<T>(
    bezeichnung: &str,
    arbeit: impl FnOnce() -> Result<T, String>,
    mut melden: impl FnMut(&str),
) -> Result<T, String> {
    let beginn = std::time::Instant::now();
    melden(&format!("Präfixlauf nativ: {bezeichnung}: Beginn"));
    let ergebnis = arbeit();
    let abschluss = match &ergebnis {
        Ok(_) => "abgeschlossen".to_string(),
        Err(fehler) => format!("fehlgeschlagen: {fehler}"),
    };
    melden(&format!(
        "Präfixlauf nativ: {bezeichnung}: {abschluss} ({:.2} s)",
        beginn.elapsed().as_secs_f64()
    ));
    ergebnis
}

async fn dateiarbeit_im_hintergrund<T: Send + 'static>(
    bezeichnung: String,
    arbeit: impl FnOnce(Auftrag) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    im_hintergrund(move || {
        mit_dateidiagnose(
            &bezeichnung,
            || arbeit(aktueller_auftrag()?),
            terminal::diagnose,
        )
    })
    .await
}

fn aktueller_auftrag() -> Result<Auftrag, String> {
    fordere_auftrag(|k| std::env::var(k).ok())
}

fn schreibe_ziel(ziel: &Path, xml: &str) -> Result<(), String> {
    let basis = ziel.parent().ok_or("Ziel hat keinen Basisordner.")?;
    absoluter_pfad(Some(ziel.to_string_lossy().into_owned()))?;
    fs::create_dir_all(basis).map_err(|e| e.to_string())?;
    absoluter_pfad(Some(ziel.to_string_lossy().into_owned()))?;
    super::datei_io::atomar_in_basis_schreiben(
        basis,
        Path::new(ziel.file_name().ok_or("Dateiname fehlt.")?),
        xml,
    )
}

// Lesbare plattformgerechte Arbeitsdateinamen; Grenzfälle im Rust-Test.
fn gesetz_pfad(auftrag: &Auftrag, normgeber: &str, kurztitel: &str) -> Result<PathBuf, String> {
    if normgeber != auftrag.normgeber {
        return Err("Ungültige Gesetzesreferenz.".into());
    }
    arbeitsdateien::dateipfad(auftrag, arbeitsdateien::Dateiart::Gesetzesxml, kurztitel)
}

fn arbeitsdateiname(kurztitel: &str, endung: &str) -> Result<String, String> {
    if kurztitel.trim().is_empty() {
        return Err("Ungültige Gesetzesreferenz.".into());
    }
    let stamm = kurztitel
        .split('.')
        .next()
        .unwrap_or("")
        .trim_end_matches(' ')
        .to_uppercase();
    let reserviert = matches!(stamm.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || ["COM", "LPT"].iter().any(|praefix| {
            stamm
                .strip_prefix(praefix)
                .is_some_and(|rest| rest.chars().count() == 1 && "123456789¹²³".contains(rest))
        });
    let ende = kurztitel.trim_end_matches([' ', '.']).len();
    let mut name = String::new();
    for (index, zeichen) in kurztitel.char_indices() {
        if "<>:\"/\\|?*%".contains(zeichen)
            || zeichen.is_control()
            || index >= ende
            || (reserviert && index == 0)
        {
            let mut puffer = [0; 4];
            for byte in zeichen.encode_utf8(&mut puffer).bytes() {
                name.push_str(&format!("%{byte:02X}"));
            }
        } else {
            name.push(zeichen);
        }
    }
    name.push('.');
    name.push_str(endung);
    if name.len() > 255 || name.encode_utf16().count() > 255 {
        return Err("Kurztitel ergibt einen zu langen Arbeitsdateinamen.".into());
    }
    Ok(name)
}

fn schreibe_bericht(auftrag: &Auftrag, zeitstempel: &str, inhalt: &str) -> Result<PathBuf, String> {
    use std::sync::atomic::{AtomicU64, Ordering};
    static NUMMER: AtomicU64 = AtomicU64::new(0);
    if zeitstempel.is_empty()
        || zeitstempel.len() > 30
        || !zeitstempel
            .bytes()
            .all(|c| c.is_ascii_digit() || b"-TZ".contains(&c))
    {
        return Err("Ungültiger Berichtszeitstempel.".into());
    }
    let basis = auftrag.arbeitsdaten.join("berichte");
    absoluter_pfad(Some(basis.to_string_lossy().into_owned()))?;
    fs::create_dir_all(&basis).map_err(|e| e.to_string())?;
    absoluter_pfad(Some(basis.to_string_lossy().into_owned()))?;
    // Reservierung mit create_new schützt auch bei gleichen Zeitstempeln ältere Berichte.
    loop {
        let nr = NUMMER.fetch_add(1, Ordering::Relaxed);
        let ziel = basis.join(format!(
            "fehler-{}-{}-{zeitstempel}-{nr}.txt",
            auftrag.modus, auftrag.normgeber
        ));
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&ziel)
        {
            Ok(datei) => {
                drop(datei);
                if let Err(fehler) = schreibe_ziel(&ziel, inhalt) {
                    let _ = fs::remove_file(&ziel);
                    return Err(fehler);
                }
                return Ok(ziel);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e.to_string()),
        }
    }
}
#[tauri::command]
pub async fn praefixlauf_bericht_schreiben(
    zeitstempel: String,
    inhalt: String,
) -> Result<String, String> {
    dateiarbeit_im_hintergrund("Fehlerbericht schreiben".into(), move |auftrag| {
        Ok(schreibe_bericht(&auftrag, &zeitstempel, &inhalt)?
            .to_string_lossy()
            .into_owned())
    })
    .await
}

// Der native Timer bleibt auch sichtbar, wenn die WebView-Ereignisschleife stockt.
struct BwDiagnoseStand {
    kuerzel: String,
    schritt: String,
    beginn: std::time::Instant,
    schrittbeginn: std::time::Instant,
}
impl BwDiagnoseStand {
    fn meldung(&self) -> String {
        format!(
            "BW-Abruf {}: wartet weiterhin bei „{}“ ({} s, insgesamt {} s)",
            self.kuerzel,
            self.schritt,
            self.schrittbeginn.elapsed().as_secs(),
            self.beginn.elapsed().as_secs()
        )
    }
}
pub(crate) struct BwDiagnose {
    stand: std::sync::Arc<std::sync::Mutex<BwDiagnoseStand>>,
    timer: tauri::async_runtime::JoinHandle<()>,
}
impl BwDiagnose {
    fn neu(kuerzel: &str) -> Self {
        let jetzt = std::time::Instant::now();
        let stand = std::sync::Arc::new(std::sync::Mutex::new(BwDiagnoseStand {
            kuerzel: kuerzel.into(),
            schritt: "Beginn".into(),
            beginn: jetzt,
            schrittbeginn: jetzt,
        }));
        let geteilt = stand.clone();
        let timer = tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(10)).await;
                terminal::diagnose(&crate::sperren::sperren(&geteilt).meldung());
            }
        });
        Self { stand, timer }
    }
    pub(crate) fn schritt(&self, schritt: &str) {
        let mut stand = crate::sperren::sperren(&self.stand);
        stand.schritt = schritt.into();
        stand.schrittbeginn = std::time::Instant::now();
        terminal::diagnose(&format!("BW-Abruf {}: {}", stand.kuerzel, stand.schritt));
    }
}
impl Drop for BwDiagnose {
    fn drop(&mut self) {
        self.timer.abort();
    }
}
pub(crate) fn beobachte_bw(kuerzel: &str) -> Option<BwDiagnose> {
    let auftrag = aktueller_auftrag().ok()?;
    (auftrag.normgeber == "de-bw").then(|| BwDiagnose::neu(kuerzel))
}

#[tauri::command]
pub async fn praefixlauf_auftrag() -> Result<Option<Auftrag>, String> {
    im_hintergrund(|| auftrag_aus(|k| std::env::var(k).ok())).await
}
#[tauri::command]
pub async fn praefixlauf_datei_lesen() -> Result<Option<String>, String> {
    dateiarbeit_im_hintergrund(
        "PräfixstrukturXML lesen".into(),
        |auftrag| match fs::read_to_string(auftrag.datei.ok_or("Listenpfad fehlt.")?) {
            Ok(xml) => Ok(Some(xml)),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.to_string()),
        },
    )
    .await
}
#[tauri::command]
pub async fn praefixlauf_datei_schreiben(xml: String) -> Result<(), String> {
    dateiarbeit_im_hintergrund("PräfixstrukturXML schreiben".into(), move |auftrag| {
        schreibe_ziel(&auftrag.datei.ok_or("Listenpfad fehlt.")?, &xml)
    })
    .await
}
#[tauri::command]
pub async fn praefixlauf_gesetz_schreiben(
    normgeber: String,
    kurztitel: String,
    xml: String,
) -> Result<(), String> {
    dateiarbeit_im_hintergrund(
        format!("GesetzesXML schreiben ({kurztitel})"),
        move |auftrag| schreibe_ziel(&gesetz_pfad(&auftrag, &normgeber, &kurztitel)?, &xml),
    )
    .await
}
#[tauri::command]
pub async fn praefixlauf_ausgabe(zeile: String, art: Option<Ausgabeart>) -> Result<(), String> {
    im_hintergrund(move || terminal::ausgeben(art.unwrap_or_default(), &zeile)).await
}
#[tauri::command]
pub async fn praefixlauf_beenden(app: tauri::AppHandle, code: i32) -> Result<(), String> {
    im_hintergrund(|| {
        aktueller_auftrag()?;
        terminal::beenden()
    })
    .await?;
    app.exit(code);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    static NR: AtomicU64 = AtomicU64::new(0);
    pub(super) struct Ordner(pub(super) PathBuf);
    impl Ordner {
        pub(super) fn neu() -> Self {
            let pfad = std::env::temp_dir().canonicalize().unwrap().join(format!(
                "lexlata-praefix-{}-{}",
                std::process::id(),
                NR.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&pfad).unwrap();
            Self(pfad)
        }
    }
    impl Drop for Ordner {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    pub(super) fn variablen(basis: &Path) -> std::collections::HashMap<String, String> {
        [
            ("LEXLATA_PRAEFIXLAUF", "de-bund".into()),
            ("LEXLATA_PRAEFIXLAUF_MODUS", "praefix".into()),
            ("LEXLATA_PRAEFIXLAUF_ANZAHL", "10".into()),
            (
                "LEXLATA_PRAEFIXLAUF_DATEI",
                basis
                    .join("listen/de-bund.xml")
                    .to_string_lossy()
                    .into_owned(),
            ),
            (
                "LEXLATA_PRAEFIXLAUF_ARBEITSDATEN",
                basis.join("gesetze").to_string_lossy().into_owned(),
            ),
        ]
        .into_iter()
        .map(|(k, v)| (k.into(), v))
        .collect()
    }
    pub(super) fn lese(
        vars: &std::collections::HashMap<String, String>,
    ) -> Result<Option<Auftrag>, String> {
        auftrag_aus(|k| vars.get(k).cloned())
    }
    #[test]
    fn debugoption_wird_ausdruecklich_weitergegeben() {
        let ordner = Ordner::neu();
        let mut vars = variablen(&ordner.0);
        assert_eq!(lese(&vars).unwrap().unwrap().debug, None);
        vars.insert("LEXLATA_PRAEFIXLAUF_DEBUG".into(), "1".into());
        assert_eq!(lese(&vars).unwrap().unwrap().debug, Some(true));
    }
    #[test]
    fn alte_entwicklerargumente_nennen_die_gueltigen_codes() {
        let ordner = Ordner::neu();
        for normgeber in ["bund", "bw", "Bund", "europarat"] {
            let mut vars = variablen(&ordner.0);
            vars.insert("LEXLATA_PRAEFIXLAUF".into(), normgeber.into());
            let fehler = lese(&vars).unwrap_err();
            assert!(fehler.contains("de-bund"));
            assert!(fehler.contains("de-bw"));
            assert!(fehler.contains("eu"));
        }
    }
    #[test]
    fn ungueltige_auftraege() {
        let ordner = Ordner::neu();
        let vars = variablen(&ordner.0);
        assert!(auftrag_aus(|_| None).unwrap().is_none());
        fs::write(ordner.0.join("datei-statt-ordner"), "Inhalt").unwrap();
        for name in [
            "LEXLATA_PRAEFIXLAUF_DATEI",
            "LEXLATA_PRAEFIXLAUF_ARBEITSDATEN",
        ] {
            let mut v = vars.clone();
            v.insert(
                name.into(),
                ordner
                    .0
                    .join("datei-statt-ordner/ziel")
                    .to_string_lossy()
                    .into_owned(),
            );
            assert!(lese(&v).is_err());
        }
        let auftrag = lese(&vars).unwrap().unwrap();
        assert_eq!(auftrag.anzahl, Some(10));
        assert_eq!(auftrag.normgeber, "de-bund");
        for (name, werte) in [
            ("LEXLATA_PRAEFIXLAUF", vec!["", "eu"]),
            (
                "LEXLATA_PRAEFIXLAUF_ANZAHL",
                vec!["", "0", "-1", "1.5", "9007199254740992"],
            ),
            ("LEXLATA_PRAEFIXLAUF_KURZTITEL", vec!["", "GG,", "GG, ,BGB"]),
            ("LEXLATA_PRAEFIXLAUF_GESCHEITERT", vec!["", "0", "true"]),
            ("LEXLATA_PRAEFIXLAUF_DEBUG", vec!["", "0", "true"]),
            ("LEXLATA_PRAEFIXLAUF_DATEI", vec!["", "relativ.xml"]),
            ("LEXLATA_PRAEFIXLAUF_ARBEITSDATEN", vec!["", "relativ"]),
        ] {
            for wert in werte {
                let mut v = vars.clone();
                v.insert(name.into(), wert.into());
                assert!(lese(&v).is_err(), "{name}={wert}");
            }
        }
        for name in [
            "LEXLATA_PRAEFIXLAUF_ANZAHL",
            "LEXLATA_PRAEFIXLAUF_DATEI",
            "LEXLATA_PRAEFIXLAUF_ARBEITSDATEN",
        ] {
            let mut v = vars.clone();
            v.remove(name);
            assert!(lese(&v).is_err());
        }
        let mut v = vars.clone();
        v.insert("LEXLATA_PRAEFIXLAUF_KURZTITEL".into(), "GG, BGB".into());
        assert_eq!(
            lese(&v).unwrap().unwrap().kurztitel.unwrap(),
            vec!["GG", "BGB"]
        );
        for ziel in [
            ordner.0.join("gesetze"),
            ordner.0.join("gesetze/de-bund.xml"),
        ] {
            let mut v = vars.clone();
            v.insert(
                "LEXLATA_PRAEFIXLAUF_DATEI".into(),
                ziel.to_string_lossy().into_owned(),
            );
            assert!(lese(&v).is_err());
        }
    }
    #[test]
    fn modi_normgeber_pfade_und_optionen_stimmen_ueberein() {
        let o = Ordner::neu();
        for modus in ["praefix", "auswerten", "quelldateien", "gesetzesxml"] {
            for normgeber in ["de-bund", "de-bw", "eu"] {
                let mut vars = variablen(&o.0);
                vars.insert("LEXLATA_PRAEFIXLAUF_MODUS".into(), modus.into());
                vars.insert("LEXLATA_PRAEFIXLAUF".into(), normgeber.into());
                if modus == "auswerten" {
                    vars.remove("LEXLATA_PRAEFIXLAUF_ANZAHL");
                }
                if ["quelldateien", "gesetzesxml"].contains(&modus) {
                    vars.remove("LEXLATA_PRAEFIXLAUF_DATEI");
                }
                let gueltig = normgeber != "eu" || ["quelldateien", "gesetzesxml"].contains(&modus);
                assert_eq!(lese(&vars).is_ok(), gueltig, "{modus}/{normgeber}");
                if !gueltig {
                    continue;
                }
                for (option, erlaubt) in [
                    (
                        "LEXLATA_PRAEFIXLAUF_NEU",
                        ["gesetzesxml", "quelldateien"].contains(&modus),
                    ),
                    ("LEXLATA_PRAEFIXLAUF_GESCHEITERT", modus == "praefix"),
                ] {
                    let mut v = vars.clone();
                    v.insert(option.into(), "1".into());
                    assert_eq!(lese(&v).is_ok(), erlaubt, "{modus}/{option}");
                }
                let mut v = vars.clone();
                v.remove("LEXLATA_PRAEFIXLAUF_ARBEITSDATEN");
                assert!(lese(&v).is_err());
                let mut v = vars.clone();
                if ["praefix", "auswerten"].contains(&modus) {
                    v.remove("LEXLATA_PRAEFIXLAUF_DATEI");
                } else {
                    v.insert(
                        "LEXLATA_PRAEFIXLAUF_DATEI".into(),
                        o.0.join("liste.xml").to_string_lossy().into_owned(),
                    );
                }
                assert!(lese(&v).is_err());
            }
        }
        for modus in [None, Some("unbekannt")] {
            let mut vars = variablen(&o.0);
            vars.remove("LEXLATA_PRAEFIXLAUF_MODUS");
            if let Some(modus) = modus {
                vars.insert("LEXLATA_PRAEFIXLAUF_MODUS".into(), modus.into());
            }
            assert!(lese(&vars).is_err());
        }
    }
    #[test]
    fn fehlerauswahl_wird_eindeutig_an_den_prueflauf_weitergegeben() {
        let o = Ordner::neu();
        let mut vars = variablen(&o.0);
        assert!(lese(&vars).unwrap().unwrap().gescheitert.is_none());
        vars.insert("LEXLATA_PRAEFIXLAUF_GESCHEITERT".into(), "1".into());
        let auftrag = lese(&vars).unwrap().unwrap();
        assert_eq!(auftrag.gescheitert, Some(true));
        assert_eq!(serde_json::to_value(auftrag).unwrap()["gescheitert"], true);
        vars.insert("LEXLATA_PRAEFIXLAUF_KURZTITEL".into(), "GG".into());
        assert!(lese(&vars).is_err());
    }
    #[test]
    fn sichere_namen_und_atomares_ersetzen() {
        let o = Ordner::neu();
        let a = lese(&variablen(&o.0)).unwrap().unwrap();
        assert_eq!(
            gesetz_pfad(&a, "de-bund", "Ä/CON\\..").unwrap(),
            a.arbeitsdaten
                .join("gesetzesxml")
                .join("de-bund/Ä%2FCON%5C%2E%2E.xml")
        );
        assert_eq!(
            gesetz_pfad(&a, "de-bund", "GG").unwrap(),
            a.arbeitsdaten.join("gesetzesxml").join("de-bund/GG.xml")
        );
        let faelle = [
            ("GG", "GG.xml"),
            ("BAW/BAFAG", "BAW%2FBAFAG.xml"),
            ("Ä/CON\\..", "Ä%2FCON%5C%2E%2E.xml"),
            ("a%2Fb", "a%252Fb.xml"),
            ("CON", "%43ON.xml"),
            ("con.txt", "%63on.txt.xml"),
            ("LPT¹", "%4CPT¹.xml"),
            ("COM9", "%43OM9.xml"),
            ("COM0", "COM0.xml"),
            ("A. ", "A%2E%20.xml"),
            ("a\n?*<>:\"|b", "a%0A%3F%2A%3C%3E%3A%22%7Cb.xml"),
            ("§12PflAFinV", "§12PflAFinV.xml"),
        ];
        for (kurztitel, erwartet) in faelle {
            assert_eq!(
                gesetz_pfad(&a, "de-bund", kurztitel).unwrap(),
                a.arbeitsdaten
                    .join("gesetzesxml")
                    .join("de-bund")
                    .join(erwartet)
            );
        }
        assert_ne!(
            gesetz_pfad(&a, "de-bund", "a/b").unwrap(),
            gesetz_pfad(&a, "de-bund", "ab").unwrap()
        );
        assert!(gesetz_pfad(&a, "de-bw", "GG").is_err());
        assert!(gesetz_pfad(&a, "de-bund", " ").is_err());
        for ziel in [
            a.datei.clone().unwrap(),
            gesetz_pfad(&a, "de-bund", "GG").unwrap(),
        ] {
            schreibe_ziel(&ziel, "<alt/>").unwrap();
            schreibe_ziel(&ziel, "<neu/>").unwrap();
            assert_eq!(fs::read_to_string(&ziel).unwrap(), "<neu/>");
            assert_eq!(fs::read_dir(ziel.parent().unwrap()).unwrap().count(), 1);
        }
        let falsch = o.0.join("fehler.xml");
        fs::create_dir(&falsch).unwrap();
        assert!(schreibe_ziel(&falsch, "neu").is_err());
        assert!(falsch.is_dir());
        assert!(fs::read_dir(&o.0).unwrap().all(|e| !e
            .unwrap()
            .file_name()
            .to_string_lossy()
            .contains(".tmp")));
    }
    #[test]
    fn datei_commands_ohne_auftrag_verweigern() {
        let o = Ordner::neu();
        let vars = variablen(&o.0);
        assert!(fordere_auftrag(|_| None).is_err());
        assert!(fordere_auftrag(|_| Some("ungültig".into())).is_err());
        assert!(fordere_auftrag(|k| vars.get(k).cloned()).is_ok());
    }
    #[cfg(unix)]
    #[test]
    fn symlinks_verlassen_den_zielbereich_nicht() {
        use std::os::unix::fs::symlink;
        let o = Ordner::neu();
        let ausserhalb = Ordner::neu();
        symlink(&ausserhalb.0, o.0.join("link")).unwrap();
        assert!(schreibe_ziel(&o.0.join("link/test.xml"), "neu").is_err());
        assert!(!ausserhalb.0.join("test.xml").exists());
        fs::write(ausserhalb.0.join("ziel.xml"), "alt").unwrap();
        symlink(ausserhalb.0.join("ziel.xml"), o.0.join("datei.xml")).unwrap();
        assert!(schreibe_ziel(&o.0.join("datei.xml"), "neu").is_err());
        assert_eq!(
            fs::read_to_string(ausserhalb.0.join("ziel.xml")).unwrap(),
            "alt"
        );
    }
    #[test]
    fn fehlerberichte_bleiben_getrennt_und_im_arbeitsordner() {
        let o = Ordner::neu();
        let a = lese(&variablen(&o.0)).unwrap().unwrap();
        let zeit = "2026-10-18T12-30-00-000Z";
        let erster = schreibe_bericht(&a, zeit, "LBO: Abruf fehlgeschlagen").unwrap();
        let zweiter = schreibe_bericht(&a, zeit, "Keine Gesetzfehler").unwrap();
        assert_ne!(erster, zweiter);
        assert_eq!(
            erster.parent(),
            Some(a.arbeitsdaten.join("berichte").as_path())
        );
        assert!(erster
            .file_name()
            .unwrap()
            .to_str()
            .unwrap()
            .starts_with("fehler-praefix-de-bund-2026-10-18"));
        assert_eq!(
            fs::read_to_string(erster).unwrap(),
            "LBO: Abruf fehlgeschlagen"
        );
        assert_eq!(fs::read_to_string(zweiter).unwrap(), "Keine Gesetzfehler");
        assert!(schreibe_bericht(&a, "../fremd", "Fehler").is_err());
    }
    #[cfg(unix)]
    #[test]
    fn fehlerbericht_verweigert_symlinks() {
        let o = Ordner::neu();
        let ausserhalb = Ordner::neu();
        let a = lese(&variablen(&o.0)).unwrap().unwrap();
        fs::remove_dir_all(&o.0).unwrap();
        std::os::unix::fs::symlink(&ausserhalb.0, &o.0).unwrap();
        assert!(schreibe_bericht(&a, "2026-10-18", "Fehler").is_err());
        assert_eq!(fs::read_dir(&ausserhalb.0).unwrap().count(), 0);
        fs::remove_file(&o.0).unwrap();
    }

    #[test]
    fn native_bw_diagnose_zeigt_aktuellen_schritt_und_zeit() {
        let diagnose = BwDiagnose::neu("LBO");
        diagnose.schritt("Fenster schließen");
        let mut stand = crate::sperren::sperren(&diagnose.stand);
        stand.beginn = std::time::Instant::now() - std::time::Duration::from_secs(25);
        stand.schrittbeginn = std::time::Instant::now() - std::time::Duration::from_secs(10);
        assert_eq!(
            stand.meldung(),
            "BW-Abruf LBO: wartet weiterhin bei „Fenster schließen“ (10 s, insgesamt 25 s)"
        );
    }
    #[test]
    fn nur_gueltiger_entwicklungsauftrag_gibt_hauptfenster_hintergrundausfuehrung_frei() {
        let o = Ordner::neu();
        let vars = variablen(&o.0);
        let original: tauri::utils::config::Config =
            serde_json::from_str(include_str!("../../tauri.conf.json")).unwrap();
        for umgebung in [std::collections::HashMap::new(), {
            let mut v = vars.clone();
            v.insert("LEXLATA_PRAEFIXLAUF_ANZAHL".into(), "0".into());
            v
        }] {
            let mut konfiguration = original.clone();
            konfiguriere_hintergrundausfuehrung(&mut konfiguration, |k| umgebung.get(k).cloned());
            assert_eq!(
                serde_json::to_value(&konfiguration).unwrap(),
                serde_json::to_value(&original).unwrap()
            );
        }
        let mut konfiguration = original.clone();
        let mut hilfsfenster = original.app.windows[0].clone();
        hilfsfenster.label = "hilfe".into();
        konfiguration.app.windows.push(hilfsfenster.clone());
        konfiguriere_hintergrundausfuehrung(&mut konfiguration, |k| vars.get(k).cloned());
        let mut erwartet = original;
        erwartet.app.windows[0].background_throttling =
            Some(tauri::utils::config::BackgroundThrottlingPolicy::Disabled);
        erwartet.app.windows.push(hilfsfenster);
        assert_eq!(
            serde_json::to_value(&konfiguration).unwrap(),
            serde_json::to_value(&erwartet).unwrap()
        );
        assert!(!konfiguration.app.windows[0].visible);
    }

    #[tokio::test(flavor = "current_thread")]
    async fn dateiarbeit_laeuft_auf_anderem_thread_und_gibt_schreibfehler_unveraendert_zurueck() {
        let aufrufer = std::thread::current().id();
        let thread = im_hintergrund(|| Ok(std::thread::current().id()))
            .await
            .unwrap();
        assert_ne!(thread, aufrufer);
        let fehler = im_hintergrund(|| Err::<(), _>("Schreibfehler".to_string()))
            .await
            .unwrap_err();
        assert_eq!(fehler, "Schreibfehler");
    }
    #[tokio::test(flavor = "current_thread")]
    async fn ausstehende_dateiarbeit_blockiert_async_fortsetzung_nicht_und_meldet_keinen_fruehen_erfolg(
    ) {
        let (begonnen, beginn) = tokio::sync::oneshot::channel();
        let (freigabe, warten) = std::sync::mpsc::channel();
        let mut arbeit = tokio::spawn(async move {
            im_hintergrund(move || {
                begonnen.send(()).unwrap();
                warten
                    .recv_timeout(std::time::Duration::from_secs(5))
                    .map_err(|e| e.to_string())?;
                Ok("bestätigt gespeichert")
            })
            .await
        });
        beginn.await.unwrap();
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(1), &mut arbeit)
                .await
                .is_err()
        );
        freigabe.send(()).unwrap();
        assert_eq!(arbeit.await.unwrap().unwrap(), "bestätigt gespeichert");
    }

    #[test]
    fn native_dateidiagnose_umfasst_arbeit_und_erhaelt_erfolg_sowie_fehler() {
        for fehler in [false, true] {
            let o = Ordner::neu();
            let ziel = o.0.join("gesetz.xml");
            let meldungen = std::cell::RefCell::new(Vec::new());
            let ergebnis = mit_dateidiagnose(
                "GesetzesXML schreiben (GG)",
                || {
                    meldungen.borrow_mut().push("Arbeit".to_string());
                    if fehler {
                        Err("Datenträgerfehler".to_string())
                    } else {
                        schreibe_ziel(&ziel, "<gesetz/>")
                    }
                },
                |meldung| {
                    if meldung.contains(": abgeschlossen") {
                        assert_eq!(fs::read_to_string(&ziel).unwrap(), "<gesetz/>");
                    }
                    meldungen.borrow_mut().push(meldung.to_string());
                },
            );
            let meldungen = meldungen.into_inner();
            assert_eq!(meldungen.len(), 3);
            assert!(meldungen[0].ends_with(": Beginn"));
            assert_eq!(meldungen[1], "Arbeit");
            if fehler {
                assert_eq!(ergebnis.unwrap_err(), "Datenträgerfehler");
                assert!(meldungen[2].contains("fehlgeschlagen: Datenträgerfehler"));
            } else {
                assert!(ergebnis.is_ok());
                assert!(meldungen[2].contains(": abgeschlossen"));
            }
        }
    }
}
