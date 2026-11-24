// commands/datei_io.rs
// Prüft App-Daten-Pfade und bündelt Dateisperre sowie Tauri-Commands.
// Schreiben, Verarbeitungszeit und Archivieren liegen in Begleitdateien.

use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

mod archivieren;
pub(crate) mod dateistempel;
mod schreiben;
mod verarbeitungszeit;

use archivieren::archiviere_in_basis;
// Byteweises Schreiben nutzt nur der Entwicklerlauf (nur im Entwicklungsbau).
#[cfg(all(desktop, debug_assertions))]
pub(crate) use schreiben::atomar_bytes_in_basis_schreiben;
pub(crate) use schreiben::atomar_in_basis_schreiben;
use verarbeitungszeit::{auffrische_verarbeitungszeit_in_basis, pruefe_auffrischungs_zugriff};

// Die Sperre stimmt nur Zugriffe dieses LexLata-Prozesses ab. Sie ersetzt
// keine Dateisperre gegenüber anderen Instanzen oder externen Programmen.
static DATEI_IO_SPERRE: Mutex<()> = Mutex::new(());

#[derive(Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ArchivierungsStatus {
    Archiviert,
    Fehlt,
    Veraendert,
    GesichertAberNichtEntfernt,
}

#[derive(Debug, serde::Serialize)]
pub struct ArchivierungsErgebnis {
    pub status: ArchivierungsStatus,
    pub sicherungspfad: Option<String>,
}

pub(crate) fn validiere_relativen_pfad(relativer_pfad: &str) -> Result<PathBuf, String> {
    if relativer_pfad.is_empty() {
        return Err("Der App-Daten-Pfad darf nicht leer sein.".to_string());
    }

    let pfad = PathBuf::from(relativer_pfad);
    if pfad.is_absolute()
        // components() normalisiert innere und abschließende Punkte weg.
        || relativer_pfad.split(std::path::is_separator).any(|teil| teil == ".")
        || !pfad
            .components()
            .all(|teil| matches!(teil, Component::Normal(_)))
    {
        return Err(
            "Der App-Daten-Pfad muss relativ sein und darf nur normale Pfadteile enthalten."
                .to_string(),
        );
    }
    Ok(pfad)
}

fn pruefe_eltern_ohne_symbolische_links(basis: &Path, relativer_pfad: &Path) -> Result<(), String> {
    let mut aktuell = basis.to_path_buf();
    // Zuerst den Basisordner selbst prüfen, danach seine Unterordner.
    let eltern = relativer_pfad.parent().unwrap_or_else(|| Path::new(""));
    for teil in std::iter::once(None).chain(eltern.components().map(Some)) {
        if let Some(teil) = teil {
            aktuell.push(teil.as_os_str());
        }
        match fs::symlink_metadata(&aktuell) {
            Ok(metadaten) if metadaten.file_type().is_symlink() => {
                return Err(format!(
                    "Symbolische Links sind im App-Daten-Pfad nicht erlaubt: {}",
                    aktuell.display()
                ));
            }
            Ok(metadaten) if !metadaten.is_dir() => {
                return Err(format!(
                    "Eine Elternkomponente ist kein Ordner: {}",
                    aktuell.display()
                ));
            }
            Ok(_) => {}
            Err(fehler) if fehler.kind() == std::io::ErrorKind::NotFound => break,
            Err(fehler) => {
                return Err(format!(
                    "Elternordner konnte nicht geprüft werden ({}): {fehler}",
                    aktuell.display()
                ));
            }
        }
    }
    Ok(())
}

fn mit_datei_io_sperre<T>(zugriff: impl FnOnce() -> Result<T, String>) -> Result<T, String> {
    // Panic kann mehrstufige Dateiänderungen unterbrechen: keine weiteren Zugriffe.
    let _sperre = DATEI_IO_SPERRE
        .lock()
        .map_err(|_| "Datei-Zugriffssperre ist defekt.".to_string())?;
    zugriff()
}

fn mit_token_datei_io_sperre<T>(
    sperren: &super::DateiSperren,
    sitzung: u64,
    pfad: &Path,
    token: Option<&str>,
    zugriff: impl FnOnce() -> Result<T, String>,
) -> Result<T, String> {
    mit_datei_io_sperre(|| {
        let _operation = token
            .map(|t| sperren.operation(sitzung, &pfad.to_string_lossy(), t))
            .transpose()?;
        zugriff()
    })
}

fn loesche_in_basis(basis: &Path, pfad: &Path) -> Result<(), String> {
    pruefe_eltern_ohne_symbolische_links(basis, pfad)?;
    match fs::remove_file(basis.join(pfad)) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn app_daten_loeschen(
    app: tauri::AppHandle,
    window: tauri::Window,
    relativer_pfad: String,
    token: Option<String>,
    vorgang: Option<String>,
) -> Result<(), String> {
    let sitzung = super::datei_sperre::fenster_sitzung(&window)?;
    let sperren = tauri::Manager::state::<super::DateiSperren>(&app)
        .inner()
        .clone();
    let pfad = validiere_relativen_pfad(&relativer_pfad)?;
    let basis = crate::app_daten_basis_pfad(&app).map_err(|e| e.to_string())?;
    let mut quell_guard = sperren.quell_operation(sitzung, &pfad, vorgang.as_deref())?;
    tauri::async_runtime::spawn_blocking(move || {
        let ergebnis =
            mit_token_datei_io_sperre(&sperren, sitzung, &pfad, token.as_deref(), || {
                loesche_in_basis(&basis, &pfad)
            });
        if ergebnis.is_ok() {
            if let Some(g) = quell_guard.as_mut() {
                g.erfolgreich();
            }
        }
        ergebnis
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn atomar_datei_schreiben(
    app: tauri::AppHandle,
    window: tauri::Window,
    token: Option<String>,
    vorgang: Option<String>,
    nur_verarbeitungszeit: Option<bool>,
    relativer_pfad: String,
    inhalt: String,
) -> Result<(), String> {
    let sitzung = super::datei_sperre::fenster_sitzung(&window)?;
    let sperren = tauri::Manager::state::<super::DateiSperren>(&app)
        .inner()
        .clone();
    let relativer_pfad = validiere_relativen_pfad(&relativer_pfad)?;
    let basis = crate::app_daten_basis_pfad(&app)
        .map_err(|fehler| format!("App-Daten-Ordner konnte nicht ermittelt werden: {fehler}"))?;

    let auffrischen = nur_verarbeitungszeit.unwrap_or(false);
    let mut quell_guard = if auffrischen {
        pruefe_auffrischungs_zugriff(&relativer_pfad, token.as_deref(), vorgang.as_deref())?;
        None
    } else {
        sperren.quell_operation(sitzung, &relativer_pfad, vorgang.as_deref())?
    };
    tauri::async_runtime::spawn_blocking(move || {
        let ergebnis =
            mit_token_datei_io_sperre(&sperren, sitzung, &relativer_pfad, token.as_deref(), || {
                if auffrischen {
                    auffrische_verarbeitungszeit_in_basis(&basis, &relativer_pfad, &inhalt)
                } else {
                    atomar_in_basis_schreiben(&basis, &relativer_pfad, &inhalt)
                }
            });
        if ergebnis.is_ok() {
            if let Some(g) = quell_guard.as_mut() {
                g.erfolgreich();
            }
        }
        ergebnis
    })
    .await
    .map_err(|fehler| format!("Datei-Schreibvorgang wurde unerwartet abgebrochen: {fehler}"))?
}

#[tauri::command]
pub async fn archiviere_beschaedigte_datei<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    token: Option<String>,
    vorgang: Option<String>,
    relativer_pfad: String,
    erwarteter_inhalt: String,
) -> Result<ArchivierungsErgebnis, String> {
    let sitzung = super::datei_sperre::fenster_sitzung(&window)?;
    let sperren = tauri::Manager::state::<super::DateiSperren>(&app)
        .inner()
        .clone();
    let relativer_pfad = validiere_relativen_pfad(&relativer_pfad)?;
    let basis = crate::app_daten_basis_pfad(&app)
        .map_err(|fehler| format!("App-Daten-Ordner konnte nicht ermittelt werden: {fehler}"))?;

    let mut quell_guard = sperren.quell_operation(sitzung, &relativer_pfad, vorgang.as_deref())?;
    tauri::async_runtime::spawn_blocking(move || {
        let ergebnis =
            mit_token_datei_io_sperre(&sperren, sitzung, &relativer_pfad, token.as_deref(), || {
                archiviere_in_basis(&basis, &relativer_pfad, &erwarteter_inhalt)
            });
        if ergebnis.is_ok() {
            if let Some(g) = quell_guard.as_mut() {
                g.erfolgreich();
            }
        }
        ergebnis
    })
    .await
    .map_err(|fehler| format!("Datei-Sicherung wurde unerwartet abgebrochen: {fehler}"))?
}

/// Sichert unter denselben Token- und Quellenschutzregeln wie der Schreibbefehl.
#[tauri::command]
pub async fn sichere_abweichende_version<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::Window<R>,
    token: Option<String>,
    vorgang: Option<String>,
    relativer_pfad: String,
) -> Result<String, String> {
    let sitzung = super::datei_sperre::fenster_sitzung(&window)?;
    let sperren = tauri::Manager::state::<super::DateiSperren>(&app)
        .inner()
        .clone();
    let pfad = validiere_relativen_pfad(&relativer_pfad)?;
    let basis = crate::app_daten_basis_pfad(&app)
        .map_err(|fehler| format!("App-Daten-Ordner konnte nicht ermittelt werden: {fehler}"))?;
    let mut quell_guard = sperren.quell_operation(sitzung, &pfad, vorgang.as_deref())?;
    tauri::async_runtime::spawn_blocking(move || {
        let ergebnis =
            mit_token_datei_io_sperre(&sperren, sitzung, &pfad, token.as_deref(), || {
                archivieren::sichere_abweichende_version_in_basis(&basis, &pfad)
            });
        if ergebnis.is_ok() {
            if let Some(g) = quell_guard.as_mut() {
                g.erfolgreich();
            }
        }
        ergebnis
    })
    .await
    .map_err(|fehler| format!("Datei-Sicherung wurde unerwartet abgebrochen: {fehler}"))?
}

#[cfg(test)]
mod versionssicherung_tests;

#[cfg(test)]
mod tests {
    use super::archivieren::archiviere_in_basis_mit_entfernen;
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    static TEST_ZAEHLER: AtomicU64 = AtomicU64::new(0);

    pub(super) struct TestOrdner(pub(super) PathBuf);

    impl TestOrdner {
        pub(super) fn neu() -> Self {
            let nummer = TEST_ZAEHLER.fetch_add(1, Ordering::Relaxed);
            let pfad = std::env::temp_dir().join(format!(
                "lexlata-atomar-test-{}-{nummer}",
                std::process::id()
            ));
            fs::create_dir(&pfad).unwrap();
            Self(pfad)
        }
    }

    impl Drop for TestOrdner {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    pub(super) fn dateinamen(pfad: &Path) -> Vec<String> {
        let mut namen = fs::read_dir(pfad)
            .unwrap()
            .map(|eintrag| eintrag.unwrap().file_name().to_string_lossy().into_owned())
            .collect::<Vec<_>>();
        namen.sort();
        namen
    }

    #[test]
    fn wartende_auffrischung_liest_neuen_bestand_erst_unter_globaler_sperre() {
        let ordner = TestOrdner::neu();
        fs::create_dir(ordner.0.join("gesetze")).unwrap();
        let pfad = PathBuf::from("gesetze/BGB.xml");
        let alt = "<gesetz><infos><verarbeitungszeit>2025-01-01T00:00:00Z</verarbeitungszeit></infos><inhalt>Alt</inhalt></gesetz>";
        fs::write(ordner.0.join(&pfad), alt).unwrap();
        let neu = alt.replace("2025", "2026");
        let aktuell = alt.replace("Alt", "Zwischenzeitlich geändert");
        let s = super::super::DateiSperren::default();
        let token = tauri::async_runtime::block_on(s.erwerben(
            1,
            "gesetze/BGB.xml",
            std::time::Duration::from_secs(1),
        ))
        .unwrap();
        let io = DATEI_IO_SPERRE.lock().unwrap();
        let basis = ordner.0.clone();
        let (bereit, wartet) = std::sync::mpsc::channel();
        let task = std::thread::spawn(move || {
            pruefe_auffrischungs_zugriff(&pfad, Some(&token), None).unwrap();
            bereit.send(()).unwrap();
            mit_token_datei_io_sperre(&s, 1, &pfad, Some(&token), || {
                auffrische_verarbeitungszeit_in_basis(&basis, &pfad, &neu)
            })
        });
        wartet
            .recv_timeout(std::time::Duration::from_secs(1))
            .unwrap();
        fs::write(ordner.0.join("gesetze/BGB.xml"), &aktuell).unwrap();
        drop(io);
        assert!(task.join().unwrap().is_err());
        assert_eq!(
            fs::read_to_string(ordner.0.join("gesetze/BGB.xml")).unwrap(),
            aktuell
        );
    }

    #[test]
    fn fehlender_vorgang_verhindert_jede_quellmutation_mit_und_ohne_token() {
        for ordnername in ["gesetze", "markierungen", "nichtamtliche-titel"] {
            for art in ["schreiben", "loeschen", "archivieren"] {
                for mit_token in [false, true] {
                    for endung in ["xml", "XML", "xMl"] {
                        let ordner = TestOrdner::neu();
                        fs::create_dir(ordner.0.join(ordnername)).unwrap();
                        let pfad = PathBuf::from(format!("{ordnername}/BGB.{endung}"));
                        fs::write(ordner.0.join(&pfad), "bleibt").unwrap();
                        let sperren = super::super::DateiSperren::default();
                        let token = mit_token.then(|| {
                            tauri::async_runtime::block_on(sperren.erwerben(
                                1,
                                &pfad.to_string_lossy(),
                                std::time::Duration::from_secs(1),
                            ))
                            .unwrap()
                        });
                        let mut ausgefuehrt = false;
                        let ergebnis = sperren.quell_operation(1, &pfad, None).and_then(|_guard| {
                            mit_token_datei_io_sperre(&sperren, 1, &pfad, token.as_deref(), || {
                                ausgefuehrt = true;
                                match art {
                                    "schreiben" => {
                                        atomar_in_basis_schreiben(&ordner.0, &pfad, "neu")
                                    }
                                    "loeschen" => loesche_in_basis(&ordner.0, &pfad),
                                    _ => {
                                        archiviere_in_basis(&ordner.0, &pfad, "bleibt").map(|_| ())
                                    }
                                }
                            })
                        });
                        assert!(ergebnis.is_err());
                        assert!(!ausgefuehrt);
                        assert_eq!(fs::read_to_string(ordner.0.join(&pfad)).unwrap(), "bleibt");
                        assert_eq!(fs::read_dir(ordner.0.join(ordnername)).unwrap().count(), 1);
                    }
                }
            }
        }
    }

    #[test]
    fn auffrischungsweg_bewahrt_pfadsitzungs_und_tokenpflicht() {
        let pfad = Path::new("gesetze/BGB.XML");
        assert!(pruefe_auffrischungs_zugriff(pfad, Some("t"), None).is_ok());
        assert!(pruefe_auffrischungs_zugriff(pfad, None, None).is_err());
        assert!(pruefe_auffrischungs_zugriff(pfad, Some("t"), Some("v")).is_err());
        for falsch in [
            "markierungen/BGB.xml",
            "nichtamtliche-titel/BGB.xml",
            "gesetze/BGB.json",
            "gesetze/unter/BGB.xml",
        ] {
            assert!(pruefe_auffrischungs_zugriff(Path::new(falsch), Some("t"), None).is_err());
        }
        let s = super::super::DateiSperren::default();
        let t = tauri::async_runtime::block_on(s.erwerben(
            1,
            "gesetze/BGB.XML",
            std::time::Duration::from_secs(1),
        ))
        .unwrap();
        for (sitzung, datei, token) in [
            (2, "gesetze/BGB.XML", t.as_str()),
            (1, "gesetze/ZPO.xml", t.as_str()),
            (1, "gesetze/BGB.XML", "falsch"),
        ] {
            let mut zugriff = false;
            assert!(
                mit_token_datei_io_sperre(&s, sitzung, Path::new(datei), Some(token), || {
                    zugriff = true;
                    Ok(())
                })
                .is_err()
            );
            assert!(!zugriff);
        }
        s.schliessen(1).unwrap();
        assert!(mit_token_datei_io_sperre(&s, 1, pfad, Some(&t), || Ok(())).is_err());
    }

    #[test]
    fn quell_guards_ueberdauern_fensterverlust_vor_und_waehrend_tatsaechlicher_io() {
        let frist = std::time::Duration::from_secs(2);
        for ordnername in ["gesetze", "markierungen", "nichtamtliche-titel"] {
            for art in ["schreiben", "loeschen", "archivieren"] {
                for mit_token in [false, true] {
                    for vor_io in [false, true] {
                        let ordner = TestOrdner::neu();
                        fs::create_dir(ordner.0.join(ordnername)).unwrap();
                        let pfad = PathBuf::from(format!("{ordnername}/BGB.xml"));
                        fs::write(ordner.0.join(&pfad), "defekt").unwrap();
                        let s = super::super::DateiSperren::default();
                        let t = tauri::async_runtime::block_on(s.erwerben(
                            1,
                            "markierungskonflikte.xml",
                            frist,
                        ))
                        .unwrap();
                        let v = s.vorgang_registrieren(1, &t).unwrap();
                        s.freigeben(1, &t).unwrap();
                        let token = mit_token.then(|| {
                            tauri::async_runtime::block_on(s.erwerben(
                                1,
                                &pfad.to_string_lossy(),
                                frist,
                            ))
                            .unwrap()
                        });
                        let mut guard = s.quell_operation(1, &pfad, Some(&v)).unwrap().unwrap();
                        let io = vor_io.then(|| DATEI_IO_SPERRE.lock().unwrap());
                        let andere = s.clone();
                        let basis = ordner.0.clone();
                        let (bereit, empfang) = std::sync::mpsc::channel();
                        let (weiter, warten) = std::sync::mpsc::channel();
                        let task = std::thread::spawn(move || {
                            if vor_io {
                                bereit.send(()).unwrap();
                            }
                            let ergebnis = mit_token_datei_io_sperre(
                                &andere,
                                1,
                                &pfad,
                                token.as_deref(),
                                || {
                                    if !vor_io {
                                        bereit.send(()).unwrap();
                                        warten.recv_timeout(frist).unwrap();
                                    }
                                    match art {
                                        "schreiben" => {
                                            atomar_in_basis_schreiben(&basis, &pfad, "neu")
                                        }
                                        "loeschen" => loesche_in_basis(&basis, &pfad),
                                        _ => {
                                            archiviere_in_basis(&basis, &pfad, "defekt").map(|_| ())
                                        }
                                    }
                                },
                            );
                            if ergebnis.is_ok() {
                                guard.erfolgreich();
                            }
                            drop(guard);
                            ergebnis
                        });
                        empfang.recv_timeout(frist).unwrap();
                        s.schliessen(1).unwrap();
                        let t2 = tauri::async_runtime::block_on(s.erwerben(
                            2,
                            "markierungskonflikte.xml",
                            frist,
                        ))
                        .unwrap();
                        assert!(s.vorgang_aktion(2, &t2, &[], "voll").is_err());
                        assert_eq!(
                            s.vorgang_aktion(2, &t2, &[], "stand")
                                .unwrap()
                                .offene_quellen,
                            1
                        );
                        if vor_io {
                            drop(io);
                        } else {
                            weiter.send(()).unwrap();
                        }
                        let ergebnis = task.join().unwrap();
                        assert_eq!(ergebnis.is_err(), vor_io && mit_token);
                        let stand = s.vorgang_aktion(2, &t2, &[], "stand").unwrap();
                        assert_eq!(stand.offene_quellen, 0);
                        assert_eq!(stand.offene_pruefungen, 1);
                        assert!(stand.vollbedarf);
                        s.vorgang_aktion(2, &t2, &[], "voll").unwrap();
                    }
                }
            }
        }
    }

    #[test]
    fn wartender_io_zugriff_prueft_token_erst_nach_io_sperre() {
        let sperren = super::super::DateiSperren::default();
        let token = tauri::async_runtime::block_on(sperren.erwerben(
            1,
            "daten.xml",
            std::time::Duration::from_secs(1),
        ))
        .unwrap();
        let io = DATEI_IO_SPERRE.lock().unwrap();
        let andere = sperren.clone();
        let anderer_token = token.clone();
        let (bereit, empfang) = std::sync::mpsc::channel();
        let wartend = std::thread::spawn(move || {
            bereit.send(()).unwrap();
            mit_token_datei_io_sperre(
                &andere,
                1,
                Path::new("daten.xml"),
                Some(&anderer_token),
                || panic!("Ungültiger Token darf nicht auf Datei zugreifen"),
            ) as Result<(), String>
        });
        empfang
            .recv_timeout(std::time::Duration::from_secs(1))
            .unwrap();
        sperren.schliessen(1).unwrap();
        drop(io);
        assert!(wartend.join().unwrap().is_err());
    }

    #[test]
    fn schliessen_waehrend_io_behaelt_guard_bis_zum_abschluss() {
        let sperren = super::super::DateiSperren::default();
        let token = tauri::async_runtime::block_on(sperren.erwerben(
            1,
            "daten.xml",
            std::time::Duration::from_secs(1),
        ))
        .unwrap();
        let andere = sperren.clone();
        let (bereit, empfang) = std::sync::mpsc::channel();
        let (weiter, warten) = std::sync::mpsc::channel();
        let laufend = std::thread::spawn(move || {
            mit_token_datei_io_sperre(&andere, 1, Path::new("daten.xml"), Some(&token), || {
                bereit.send(()).unwrap();
                warten
                    .recv_timeout(std::time::Duration::from_secs(2))
                    .unwrap();
                Ok(())
            })
        });
        empfang
            .recv_timeout(std::time::Duration::from_secs(2))
            .unwrap();
        sperren.schliessen(1).unwrap();
        tauri::async_runtime::block_on(async {
            assert_eq!(
                sperren
                    .erwerben(2, "daten.xml", std::time::Duration::from_millis(20))
                    .await
                    .unwrap_err(),
                "wartefrist"
            );
        });
        weiter.send(()).unwrap();
        laufend.join().unwrap().unwrap();
        tauri::async_runtime::block_on(async {
            assert!(sperren
                .erwerben(2, "daten.xml", std::time::Duration::from_secs(1))
                .await
                .is_ok());
        });
    }

    #[test]
    fn tokenlose_loeschung_wartet_auf_native_io_sperre() {
        let ordner = TestOrdner::neu();
        fs::write(ordner.0.join("daten.xml"), "bleibt").unwrap();
        let io = DATEI_IO_SPERRE.lock().unwrap();
        let basis = ordner.0.clone();
        let (bereit, empfang) = std::sync::mpsc::channel();
        let (fertig, abschluss) = std::sync::mpsc::channel();
        let wartend = std::thread::spawn(move || {
            bereit.send(()).unwrap();
            let ergebnis = mit_token_datei_io_sperre(
                &super::super::DateiSperren::default(),
                1,
                Path::new("daten.xml"),
                None,
                || loesche_in_basis(&basis, Path::new("daten.xml")),
            );
            fertig.send(ergebnis).unwrap();
        });
        empfang
            .recv_timeout(std::time::Duration::from_secs(1))
            .unwrap();
        assert!(matches!(
            abschluss.recv_timeout(std::time::Duration::from_millis(20)),
            Err(std::sync::mpsc::RecvTimeoutError::Timeout)
        ));
        assert!(ordner.0.join("daten.xml").exists());
        drop(io);
        abschluss
            .recv_timeout(std::time::Duration::from_secs(2))
            .unwrap()
            .unwrap();
        wartend.join().unwrap();
        assert!(!ordner.0.join("daten.xml").exists());
    }

    #[test]
    fn loeschung_ist_bei_fehlender_datei_wirkungslos_und_prueft_token() {
        let ordner = TestOrdner::neu();
        let pfad = Path::new("daten.xml");
        loesche_in_basis(&ordner.0, pfad).unwrap();
        fs::write(ordner.0.join(pfad), "bleibt").unwrap();
        let sperren = super::super::DateiSperren::default();
        assert!(
            mit_token_datei_io_sperre(&sperren, 1, pfad, Some("ungueltig"), || loesche_in_basis(
                &ordner.0, pfad
            ))
            .is_err()
        );
        assert_eq!(fs::read_to_string(ordner.0.join(pfad)).unwrap(), "bleibt");
        let token = tauri::async_runtime::block_on(sperren.erwerben(
            1,
            "daten.xml",
            std::time::Duration::from_secs(1),
        ))
        .unwrap();
        mit_token_datei_io_sperre(&sperren, 1, pfad, Some(&token), || {
            loesche_in_basis(&ordner.0, pfad)
        })
        .unwrap();
        assert!(!ordner.0.join(pfad).exists());
        mit_token_datei_io_sperre(&sperren, 1, pfad, Some(&token), || {
            loesche_in_basis(&ordner.0, pfad)
        })
        .unwrap();
    }

    #[test]
    fn lehnt_unsichere_relative_pfade_ab() {
        for pfad in ["", ".", "../a.xml", "a/../b.xml", "/absolut.xml"] {
            assert!(validiere_relativen_pfad(pfad).is_err(), "Pfad: {pfad}");
        }
        assert!(validiere_relativen_pfad("ordner/datei.xml").is_ok());
    }

    #[test]
    fn lehnt_punktkomponenten_vor_der_normalisierung_ab() {
        for pfad in ["./datei.xml", "ordner/./datei.xml", "ordner/."] {
            assert!(validiere_relativen_pfad(pfad).is_err(), "Pfad: {pfad}");
        }
        #[cfg(windows)]
        for pfad in [r".\datei.xml", r"ordner\.\datei.xml", r"ordner\."] {
            assert!(validiere_relativen_pfad(pfad).is_err(), "Pfad: {pfad}");
        }
        assert!(validiere_relativen_pfad("ordner/.datei.xml").is_ok());
        assert!(validiere_relativen_pfad("ordner/datei..xml").is_ok());
    }

    #[cfg(unix)]
    #[test]
    fn lehnt_symbolischen_link_in_elternkomponente_ab() {
        use std::os::unix::fs::symlink;

        let ordner = TestOrdner::neu();
        let ausserhalb = TestOrdner::neu();
        symlink(&ausserhalb.0, ordner.0.join("link")).unwrap();

        assert!(atomar_in_basis_schreiben(&ordner.0, Path::new("link/daten.xml"), "neu").is_err());
        assert!(!ausserhalb.0.join("daten.xml").exists());
    }

    #[cfg(unix)]
    #[test]
    fn lehnt_symbolischen_link_als_basisordner_ab() {
        let ordner = TestOrdner::neu();
        let ausserhalb = TestOrdner::neu();
        let basis = ordner.0.join("LexLata");
        std::os::unix::fs::symlink(&ausserhalb.0, &basis).unwrap();
        fs::write(ausserhalb.0.join("daten.xml"), "alt").unwrap();

        assert!(atomar_in_basis_schreiben(&basis, Path::new("daten.xml"), "neu").is_err());
        assert_eq!(
            fs::read_to_string(ausserhalb.0.join("daten.xml")).unwrap(),
            "alt"
        );
        assert_eq!(dateinamen(&ausserhalb.0), ["daten.xml"]);
    }

    #[test]
    fn parallele_archivierungen_sichern_nur_einmal() {
        let ordner = TestOrdner::neu();
        let pfad = PathBuf::from("daten.xml");
        fs::write(ordner.0.join(&pfad), "beschaedigt").unwrap();
        let mut threads = Vec::new();
        for _ in 0..2 {
            let basis = ordner.0.clone();
            let pfad = pfad.clone();
            threads.push(std::thread::spawn(move || {
                mit_datei_io_sperre(|| archiviere_in_basis(&basis, &pfad, "beschaedigt"))
            }));
        }

        let ergebnisse = threads
            .into_iter()
            .map(|thread| thread.join().unwrap().unwrap().status)
            .collect::<Vec<_>>();
        assert_eq!(
            ergebnisse
                .iter()
                .filter(|status| **status == ArchivierungsStatus::Archiviert)
                .count(),
            1
        );
        assert_eq!(
            ergebnisse
                .iter()
                .filter(|status| **status == ArchivierungsStatus::Fehlt)
                .count(),
            1
        );
    }

    #[test]
    fn atomarer_schreibvorgang_wartet_auf_laufende_archivierung() {
        let ordner = TestOrdner::neu();
        let pfad = PathBuf::from("daten.xml");
        fs::write(ordner.0.join(&pfad), "beschaedigt").unwrap();
        let (entfernen_bereit_senden, entfernen_bereit_empfangen) = std::sync::mpsc::channel();
        let (entfernen_freigeben, entfernen_freigabe_empfangen) = std::sync::mpsc::channel();
        let basis = ordner.0.clone();
        let archiv_pfad = pfad.clone();
        let archivierung = std::thread::spawn(move || {
            mit_datei_io_sperre(|| {
                archiviere_in_basis_mit_entfernen(&basis, &archiv_pfad, "beschaedigt", |ziel| {
                    entfernen_bereit_senden.send(()).unwrap();
                    entfernen_freigabe_empfangen.recv().unwrap();
                    fs::remove_file(ziel)
                })
            })
        });
        entfernen_bereit_empfangen
            .recv_timeout(std::time::Duration::from_secs(10))
            .unwrap();
        let (schreiben_bereit_senden, schreiben_bereit_empfangen) = std::sync::mpsc::channel();
        let basis = ordner.0.clone();
        let schreiben_pfad = pfad.clone();
        let schreiben = std::thread::spawn(move || {
            mit_datei_io_sperre(|| {
                schreiben_bereit_senden.send(()).unwrap();
                atomar_in_basis_schreiben(&basis, &schreiben_pfad, "neu")
            })
        });
        assert!(schreiben_bereit_empfangen
            .recv_timeout(std::time::Duration::from_millis(100))
            .is_err());
        entfernen_freigeben.send(()).unwrap();
        archivierung.join().unwrap().unwrap();
        schreiben.join().unwrap().unwrap();

        assert_eq!(fs::read_to_string(ordner.0.join(pfad)).unwrap(), "neu");
    }
}

#[cfg(test)]
mod native_vertrag_tests {
    use super::*;
    #[test]
    fn archivierungs_command_entnimmt_feldnamen_typen_und_optionale_argumente() {
        let daten: serde_json::Value = serde_json::from_str(include_str!(
            "../../../src/test/plattform/native-vertraege.json"
        ))
        .unwrap();
        let app = tauri::test::mock_builder()
            .manage(super::super::DateiSperren::default())
            .invoke_handler(tauri::generate_handler![archiviere_beschaedigte_datei])
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let main = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        let aufruf = |body| {
            tauri::test::get_ipc_response(
                &main,
                tauri::webview::InvokeRequest {
                    cmd: daten["archivierung"]["command"].as_str().unwrap().into(),
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
        // Der absichtlich unbekannte Vorgang verhindert Datei-I/O nach erfolgreicher Argumententnahme.
        assert_eq!(
            aufruf(daten["archivierung"]["argumente"].clone()).unwrap_err(),
            serde_json::json!("Vorgang ist ungültig.")
        );
        let mut ohne_optionale = daten["archivierung"]["argumente"].clone();
        ohne_optionale.as_object_mut().unwrap().remove("token");
        ohne_optionale.as_object_mut().unwrap().remove("vorgang");
        assert_eq!(
            aufruf(ohne_optionale).unwrap_err(),
            serde_json::json!("Prüfpflichtige Quelle benötigt einen vorgemerkten Vorgang.")
        );
        for feld in ["relativerPfad", "erwarteterInhalt"] {
            let mut fehlt = daten["archivierung"]["argumente"].clone();
            fehlt.as_object_mut().unwrap().remove(feld);
            assert!(aufruf(fehlt)
                .unwrap_err()
                .as_str()
                .unwrap()
                .contains("missing required key"));
            let mut falsch = daten["archivierung"]["argumente"].clone();
            falsch[feld] = serde_json::json!(false);
            assert!(aufruf(falsch)
                .unwrap_err()
                .as_str()
                .unwrap()
                .contains("invalid type"));
        }
    }
    #[test]
    fn archivierung_serialisiert_alle_status_und_optionale_pfade() {
        let daten: serde_json::Value = serde_json::from_str(include_str!(
            "../../../src/test/plattform/native-vertraege.json"
        ))
        .unwrap();
        for (index, status) in [
            ArchivierungsStatus::Archiviert,
            ArchivierungsStatus::Fehlt,
            ArchivierungsStatus::Veraendert,
            ArchivierungsStatus::GesichertAberNichtEntfernt,
        ]
        .into_iter()
        .enumerate()
        {
            let erwartet = &daten["archivierung"]["ergebnisse"][index];
            let ergebnis = ArchivierungsErgebnis {
                status,
                sicherungspfad: erwartet["sicherungspfad"].as_str().map(str::to_string),
            };
            assert_eq!(serde_json::to_value(ergebnis).unwrap(), *erwartet);
        }
        let command = daten["archivierung"]["command"].as_str().unwrap();
        assert_eq!(
            include_str!("../lib.rs")
                .matches(&format!("commands::datei_io::{command},"))
                .count(),
            2
        );
    }
}
