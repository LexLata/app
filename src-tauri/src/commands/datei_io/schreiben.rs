// Atomare Schreibvorgänge mit temporären Dateien und begrenztem Rename-Retry.

use super::pruefe_eltern_ohne_symbolische_links;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static TEMP_DATEI_ZAEHLER: AtomicU64 = AtomicU64::new(0);

fn temp_datei_anlegen(ziel: &Path) -> Result<(PathBuf, fs::File), String> {
    let eltern = ziel
        .parent()
        .ok_or_else(|| "Zieldatei hat keinen Elternordner.".to_string())?;
    let dateiname = ziel
        .file_name()
        .ok_or_else(|| "Zieldatei hat keinen Dateinamen.".to_string())?
        .to_string_lossy();

    for _ in 0..1_000 {
        let nummer = TEMP_DATEI_ZAEHLER.fetch_add(1, Ordering::Relaxed);
        let temp_pfad = eltern.join(format!(
            ".{dateiname}.lexlata-{}-{nummer}.tmp",
            std::process::id()
        ));
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_pfad)
        {
            Ok(datei) => return Ok((temp_pfad, datei)),
            Err(fehler) if fehler.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(fehler) => {
                return Err(format!(
                    "Temp-Datei konnte nicht angelegt werden ({}): {fehler}",
                    temp_pfad.display()
                ));
            }
        }
    }

    Err("Nach 1000 Versuchen konnte kein eindeutiger Temp-Dateiname erzeugt werden.".to_string())
}

fn ist_voruebergehender_windows_rename_fehler(fehler: &std::io::Error) -> bool {
    // Win32: ERROR_SHARING_VIOLATION (32) und ERROR_LOCK_VIOLATION (33).
    matches!(fehler.raw_os_error(), Some(32 | 33))
}

fn rename_mit_retry<R, P>(
    mut rename: R,
    mut pause: P,
    windows_retry_aktiv: bool,
) -> std::io::Result<()>
where
    R: FnMut() -> std::io::Result<()>,
    P: FnMut(),
{
    for versuch in 0..3 {
        match rename() {
            Ok(()) => return Ok(()),
            Err(fehler)
                if windows_retry_aktiv
                    && versuch < 2
                    && ist_voruebergehender_windows_rename_fehler(&fehler) =>
            {
                pause();
            }
            Err(fehler) => return Err(fehler),
        }
    }
    unreachable!("Die Schleife gibt spätestens nach dem dritten Versuch zurück")
}

fn atomar_in_basis_schreiben_mit_rename<R>(
    basis: &Path,
    relativer_pfad: &Path,
    inhalt: &[u8],
    mut rename: R,
) -> Result<(), String>
where
    R: FnMut(&Path, &Path) -> std::io::Result<()>,
{
    pruefe_eltern_ohne_symbolische_links(basis, relativer_pfad)?;
    let ziel = basis.join(relativer_pfad);
    let (temp_pfad, mut temp_datei) = temp_datei_anlegen(&ziel)?;

    let schreib_ergebnis = temp_datei
        .write_all(inhalt)
        .and_then(|_| temp_datei.sync_all());
    drop(temp_datei);

    if let Err(fehler) = schreib_ergebnis {
        let _ = fs::remove_file(&temp_pfad);
        return Err(format!(
            "Temp-Datei konnte nicht vollständig geschrieben und synchronisiert werden ({}): {fehler}",
            temp_pfad.display()
        ));
    }

    let rename_ergebnis = rename_mit_retry(
        || rename(&temp_pfad, &ziel),
        || std::thread::sleep(std::time::Duration::from_millis(50)),
        cfg!(target_os = "windows"),
    );
    if let Err(fehler) = rename_ergebnis {
        let _ = fs::remove_file(&temp_pfad);
        return Err(format!(
            "Temp-Datei konnte das Ziel nicht ersetzen ({}): {fehler}",
            ziel.display()
        ));
    }

    Ok(())
}

pub(crate) fn atomar_in_basis_schreiben(
    basis: &Path,
    relativer_pfad: &Path,
    inhalt: &str,
) -> Result<(), String> {
    atomar_bytes_in_basis_schreiben(basis, relativer_pfad, inhalt.as_bytes())
}

pub(crate) fn atomar_bytes_in_basis_schreiben(
    basis: &Path,
    relativer_pfad: &Path,
    inhalt: &[u8],
) -> Result<(), String> {
    atomar_in_basis_schreiben_mit_rename(basis, relativer_pfad, inhalt, |von, nach| {
        fs::rename(von, nach)
    })
}

// Bytebereiche statt Neu-Serialisierung: außerhalb genau dieses Textknotens
// müssen sämtliche Bytes identisch bleiben, einschließlich Normtext und Referenz.

#[cfg(test)]
mod tests {
    use super::super::tests::{dateinamen, TestOrdner};
    use super::*;
    #[test]
    fn schreibt_neue_datei_und_ersetzt_bestehende_vollstaendig() {
        let ordner = TestOrdner::neu();

        atomar_in_basis_schreiben(&ordner.0, Path::new("daten.xml"), "neu").unwrap();
        assert_eq!(
            fs::read_to_string(ordner.0.join("daten.xml")).unwrap(),
            "neu"
        );

        atomar_in_basis_schreiben(&ordner.0, Path::new("daten.xml"), "ersetzt").unwrap();
        assert_eq!(
            fs::read_to_string(ordner.0.join("daten.xml")).unwrap(),
            "ersetzt"
        );
        assert_eq!(dateinamen(&ordner.0), ["daten.xml"]);
    }

    #[test]
    fn parallele_schreibvorgaenge_hinterlassen_nur_eine_vollstaendige_fassung() {
        let ordner = TestOrdner::neu();
        let (bereit_senden, bereit_empfangen) = std::sync::mpsc::channel();
        let mut freigaben = Vec::new();
        let mut threads = Vec::new();
        for zeichen in ["A", "B"] {
            let basis = ordner.0.clone();
            let bereit = bereit_senden.clone();
            let (freigeben, warten) = std::sync::mpsc::channel();
            freigaben.push(freigeben);
            threads.push(std::thread::spawn(move || {
                let mut gemeldet = false;
                atomar_in_basis_schreiben_mit_rename(
                    &basis,
                    Path::new("daten.xml"),
                    zeichen.repeat(100_000).as_bytes(),
                    |von, nach| {
                        if !gemeldet {
                            bereit.send(von.to_path_buf()).unwrap();
                            // Begrenztes Warten verhindert einen hängenden Test bei Fehlern.
                            warten
                                .recv_timeout(std::time::Duration::from_secs(10))
                                .unwrap();
                            gemeldet = true;
                        }
                        fs::rename(von, nach)
                    },
                )
            }));
        }
        drop(bereit_senden);
        let temp_a = bereit_empfangen
            .recv_timeout(std::time::Duration::from_secs(10))
            .unwrap();
        let temp_b = bereit_empfangen
            .recv_timeout(std::time::Duration::from_secs(10))
            .unwrap();
        assert_ne!(temp_a, temp_b);
        assert!(temp_a.is_file() && temp_b.is_file());
        assert_eq!(dateinamen(&ordner.0).len(), 2);
        for freigabe in freigaben {
            freigabe.send(()).unwrap();
        }
        for thread in threads {
            thread.join().unwrap().unwrap();
        }

        let inhalt = fs::read_to_string(ordner.0.join("daten.xml")).unwrap();
        assert!(inhalt == "A".repeat(100_000) || inhalt == "B".repeat(100_000));
        assert_eq!(dateinamen(&ordner.0), ["daten.xml"]);
    }

    #[test]
    fn rename_fehler_bereinigt_temp_datei_und_belaesst_ziel() {
        let ordner = TestOrdner::neu();
        fs::write(ordner.0.join("daten.xml"), "alt").unwrap();

        let fehler = atomar_in_basis_schreiben_mit_rename(
            &ordner.0,
            Path::new("daten.xml"),
            b"neu",
            |_von, _nach| Err(std::io::Error::other("Testfehler")),
        )
        .unwrap_err();

        assert!(fehler.contains("Testfehler"));
        assert_eq!(
            fs::read_to_string(ordner.0.join("daten.xml")).unwrap(),
            "alt"
        );
        assert_eq!(dateinamen(&ordner.0), ["daten.xml"]);
    }

    #[test]
    fn windows_retry_beendet_nach_fruehem_erfolg() {
        for erfolg_bei in [1, 2] {
            let mut versuche = 0;
            let mut pausen = 0;
            rename_mit_retry(
                || {
                    versuche += 1;
                    if versuche < erfolg_bei {
                        Err(std::io::Error::from_raw_os_error(33))
                    } else {
                        Ok(())
                    }
                },
                || pausen += 1,
                true,
            )
            .unwrap();
            assert_eq!(versuche, erfolg_bei);
            assert_eq!(pausen, erfolg_bei - 1);
        }
    }

    #[test]
    fn windows_retry_begrenzt_sperrfehler_und_bleibt_sonst_inaktiv() {
        for code in [32, 33] {
            for windows in [true, false] {
                let mut versuche = 0;
                let mut pausen = 0;
                let fehler = rename_mit_retry(
                    || {
                        versuche += 1;
                        Err(std::io::Error::from_raw_os_error(code))
                    },
                    || pausen += 1,
                    windows,
                )
                .unwrap_err();
                assert_eq!(fehler.raw_os_error(), Some(code));
                assert_eq!(versuche, if windows { 3 } else { 1 });
                assert_eq!(pausen, if windows { 2 } else { 0 });
            }
        }
    }

    #[test]
    fn windows_retry_erkennt_nur_lock_fehler_und_begrenzt_versuche() {
        assert!(ist_voruebergehender_windows_rename_fehler(
            &std::io::Error::from_raw_os_error(32)
        ));
        assert!(ist_voruebergehender_windows_rename_fehler(
            &std::io::Error::from_raw_os_error(33)
        ));
        assert!(!ist_voruebergehender_windows_rename_fehler(
            &std::io::Error::from_raw_os_error(5)
        ));

        let mut versuche = 0;
        let mut pausen = 0;
        rename_mit_retry(
            || {
                versuche += 1;
                if versuche < 3 {
                    Err(std::io::Error::from_raw_os_error(32))
                } else {
                    Ok(())
                }
            },
            || pausen += 1,
            true,
        )
        .unwrap();
        assert_eq!(versuche, 3);
        assert_eq!(pausen, 2);

        let mut dauerhafte_versuche = 0;
        assert!(rename_mit_retry(
            || {
                dauerhafte_versuche += 1;
                Err(std::io::Error::from_raw_os_error(5))
            },
            || panic!("darf nicht warten"),
            true,
        )
        .is_err());
        assert_eq!(dauerhafte_versuche, 1);
    }
}
