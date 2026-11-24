// dateistempel-spike.rs
// Isolierter Phase-1-Versuch: reale Dateistempel ohne Tauri oder Nutzerdaten.
// Aufruf: rustc --edition 2021 -O <datei> -o /tmp/dateistempel-spike
// Tests: rustc --edition 2021 --test <datei> -o /tmp/dateistempel-tests
use std::fs;
use std::io;
use std::path::Path;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

#[derive(Debug, PartialEq, Eq)]
struct Dateistempel {
    name: String,
    groesse: String,
    aenderungszeit: String,
}

// Vorzeichenbehaftete Nanosekunden seit Unix-Epoche als Dezimaltext:
// keine Rundung durch JavaScript-Zahlen, keine Abhängigkeit von Zeitzonen.
fn zeittext(zeit: SystemTime) -> String {
    match zeit.duration_since(UNIX_EPOCH) {
        Ok(abstand) => abstand.as_nanos().to_string(),
        Err(fehler) => format!("-{}", fehler.duration().as_nanos()),
    }
}

fn stempel(pfad: &Path, name: String) -> io::Result<Dateistempel> {
    let daten = fs::symlink_metadata(pfad)?;
    if !daten.is_file() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "Keine reguläre Gesetzesdatei",
        ));
    }
    Ok(Dateistempel {
        name,
        groesse: daten.len().to_string(),
        aenderungszeit: zeittext(daten.modified()?),
    })
}

// Produktionskommando erhält keinen Pfad vom Frontend: Basis nativ auflösen,
// festen Unterordner `gesetze` prüfen. Hier ist die Basis nur Testeingabe.
fn sammle(basis: &Path) -> io::Result<Vec<Dateistempel>> {
    for pfad in [basis.to_path_buf(), basis.join("gesetze")] {
        let daten = fs::symlink_metadata(pfad)?;
        if !daten.is_dir() || daten.file_type().is_symlink() {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Kein regulärer Ordner",
            ));
        }
    }
    let mut ergebnis = Vec::new();
    for eintrag in fs::read_dir(basis.join("gesetze"))? {
        let eintrag = eintrag?;
        let name = eintrag.file_name().into_string().map_err(|_| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                "Dateiname ist kein Unicode-Text",
            )
        })?;
        if name.ends_with(".xml") {
            ergebnis.push(stempel(&eintrag.path(), name)?);
        }
    }
    ergebnis.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(ergebnis)
}

fn zeitreihe(mut aktion: impl FnMut()) -> (f64, f64, f64) {
    let mut zeiten = Vec::new();
    for _ in 0..101 {
        let start = Instant::now();
        aktion();
        zeiten.push(start.elapsed().as_secs_f64() * 1000.0);
    }
    zeiten.sort_by(f64::total_cmp);
    (zeiten[0], zeiten[50], zeiten[100])
}

fn main() -> io::Result<()> {
    let basis = std::env::temp_dir().join(format!("lexlata-dateistempel-{}", std::process::id()));
    fs::create_dir(&basis)?;
    let ergebnis = (|| {
        fs::create_dir(basis.join("gesetze"))?;
        let namen: Vec<_> = (0..500).map(|i| format!("Gesetz-{i:03}.xml")).collect();
        for name in &namen {
            fs::write(basis.join("gesetze").join(name), b"<gesetz />")?;
        }
        let start = Instant::now();
        let bestand = sammle(&basis)?;
        println!(
            "Dateien: {}; erster Sammellauf: {:.3} ms",
            bestand.len(),
            start.elapsed().as_secs_f64() * 1000.0
        );
        println!(
            "101 warme Sammellaeufe min/median/max ms: {:?}",
            zeitreihe(|| {
                std::hint::black_box(sammle(&basis).unwrap());
            })
        );
        println!(
            "101 warme Einzelstatusfolgen min/median/max ms: {:?}",
            zeitreihe(|| {
                for name in &namen {
                    std::hint::black_box(
                        stempel(&basis.join("gesetze").join(name), name.clone()).unwrap(),
                    );
                }
            })
        );
        let datei = fs::File::options()
            .write(true)
            .open(basis.join("gesetze").join(&namen[0]))?;
        let gesetzt = UNIX_EPOCH + std::time::Duration::new(1_700_000_000, 123_456_789);
        datei.set_times(fs::FileTimes::new().set_modified(gesetzt))?;
        println!(
            "Zeitprobe gesetzt: {}; gelesen: {}",
            zeittext(gesetzt),
            stempel(&basis.join("gesetze").join(&namen[0]), namen[0].clone())?.aenderungszeit
        );
        Ok(())
    })();
    fs::remove_dir_all(basis)?;
    ergebnis
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn zeittext_erhaelt_nanosekunden_auch_vor_der_epoche() {
        assert_eq!(zeittext(UNIX_EPOCH), "0");
        assert_eq!(zeittext(UNIX_EPOCH + Duration::new(1, 1)), "1000000001");
        assert_eq!(zeittext(UNIX_EPOCH - Duration::new(1, 1)), "-1000000001");
    }

    #[test]
    fn sammellauf_liefert_namen_groesse_und_unveraenderte_zeit() -> io::Result<()> {
        let basis =
            std::env::temp_dir().join(format!("lexlata-stempeltest-{}", std::process::id()));
        fs::create_dir(&basis)?;
        let ergebnis = (|| {
            assert!(sammle(&basis).is_err());
            fs::create_dir(basis.join("gesetze"))?;
            assert_eq!(sammle(&basis)?, vec![]);
            fs::write(basis.join("gesetze/B.xml"), b"abc")?;
            fs::write(basis.join("gesetze/ignoriert.txt"), b"x")?;
            let datei = fs::File::options()
                .write(true)
                .open(basis.join("gesetze/B.xml"))?;
            datei.set_times(
                fs::FileTimes::new().set_modified(UNIX_EPOCH + Duration::from_secs(42)),
            )?;
            assert_eq!(
                sammle(&basis)?,
                vec![Dateistempel {
                    name: "B.xml".into(),
                    groesse: "3".into(),
                    aenderungszeit: "42000000000".into(),
                }]
            );
            fs::create_dir(basis.join("gesetze/kein-gesetz.xml"))?;
            assert!(sammle(&basis).is_err());
            Ok(())
        })();
        fs::remove_dir_all(basis)?;
        ergebnis
    }
}
