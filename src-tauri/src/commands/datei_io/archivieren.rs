// Sichert beschädigte Dateien vor dem Entfernen und abweichende Versionen als Kopie.

use super::{pruefe_eltern_ohne_symbolische_links, ArchivierungsErgebnis, ArchivierungsStatus};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static SICHERUNGS_DATEI_ZAEHLER: AtomicU64 = AtomicU64::new(0);

fn zeitstempel_ohne_doppelpunkt(millis_seit_epoch: u128) -> String {
    let sekunden = millis_seit_epoch / 1_000;
    let millisekunden = millis_seit_epoch % 1_000;
    let tage = (sekunden / 86_400) as i64;
    let sekunden_im_tag = sekunden % 86_400;
    // Gregorianische Kalenderrechnung nach Howard Hinnant, ohne zusätzliche
    // Abhängigkeit für einen rein lokalen Sicherungsdateinamen.
    let z = tage + 719_468;
    let era = z / 146_097;
    let tag_im_zyklus = z - era * 146_097;
    let jahr_im_zyklus = (tag_im_zyklus - tag_im_zyklus / 1_460 + tag_im_zyklus / 36_524
        - tag_im_zyklus / 146_096)
        / 365;
    let mut jahr = jahr_im_zyklus + era * 400;
    let tag_im_jahr =
        tag_im_zyklus - (365 * jahr_im_zyklus + jahr_im_zyklus / 4 - jahr_im_zyklus / 100);
    let monat_index = (5 * tag_im_jahr + 2) / 153;
    let tag = tag_im_jahr - (153 * monat_index + 2) / 5 + 1;
    let monat = monat_index + if monat_index < 10 { 3 } else { -9 };
    if monat <= 2 {
        jahr += 1;
    }
    let stunde = sekunden_im_tag / 3_600;
    let minute = (sekunden_im_tag % 3_600) / 60;
    let sekunde = sekunden_im_tag % 60;
    format!("{jahr:04}{monat:02}{tag:02}T{stunde:02}{minute:02}{sekunde:02}.{millisekunden:03}Z")
}

fn sicherungs_datei_anlegen_mit_nummer<N>(
    ziel: &Path,
    anlass: &str,
    zeitstempel: &str,
    mut naechste_nummer: N,
    prozess_id: u32,
) -> Result<(PathBuf, fs::File), String>
where
    N: FnMut() -> u64,
{
    let eltern = ziel
        .parent()
        .ok_or_else(|| "Zieldatei hat keinen Elternordner.".to_string())?;
    let dateiname = ziel
        .file_name()
        .ok_or_else(|| "Zieldatei hat keinen Dateinamen.".to_string())?
        .to_string_lossy();
    for _ in 0..1_000 {
        let nummer = naechste_nummer();
        let sicherungspfad = eltern.join(format!(
            "{dateiname}.{anlass}-{zeitstempel}-{prozess_id}-{nummer}.bak",
        ));
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&sicherungspfad)
        {
            Ok(datei) => return Ok((sicherungspfad, datei)),
            Err(fehler) if fehler.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(fehler) => {
                return Err(format!(
                    "Sicherungsdatei konnte nicht angelegt werden ({}): {fehler}",
                    sicherungspfad.display()
                ));
            }
        }
    }

    Err(
        "Nach 1000 Versuchen konnte kein eindeutiger Sicherungsdateiname erzeugt werden."
            .to_string(),
    )
}

fn sicherungs_datei_anlegen(ziel: &Path, anlass: &str) -> Result<(PathBuf, fs::File), String> {
    let millis_seit_epoch = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    sicherungs_datei_anlegen_mit_nummer(
        ziel,
        anlass,
        &zeitstempel_ohne_doppelpunkt(millis_seit_epoch),
        || SICHERUNGS_DATEI_ZAEHLER.fetch_add(1, Ordering::Relaxed),
        std::process::id(),
    )
}

fn archiviere_in_basis_mit_sicherung_schreiben<R, S>(
    basis: &Path,
    relativer_pfad: &Path,
    erwarteter_inhalt: &str,
    entfernen: R,
    sicherung_schreiben: S,
) -> Result<ArchivierungsErgebnis, String>
where
    R: FnOnce(&Path) -> std::io::Result<()>,
    S: FnOnce(fs::File, &str) -> std::io::Result<()>,
{
    pruefe_eltern_ohne_symbolische_links(basis, relativer_pfad)?;
    let ziel = basis.join(relativer_pfad);
    let inhalt = match fs::read_to_string(&ziel) {
        Ok(inhalt) => inhalt,
        Err(fehler) if fehler.kind() == std::io::ErrorKind::NotFound => {
            return Ok(ArchivierungsErgebnis {
                status: ArchivierungsStatus::Fehlt,
                sicherungspfad: None,
            });
        }
        Err(fehler) => {
            return Err(format!(
                "Beschädigte Datei konnte nicht gelesen werden ({}): {fehler}",
                ziel.display()
            ));
        }
    };
    if inhalt != erwarteter_inhalt {
        return Ok(ArchivierungsErgebnis {
            status: ArchivierungsStatus::Veraendert,
            sicherungspfad: None,
        });
    }

    let (sicherungspfad, sicherungsdatei) = sicherungs_datei_anlegen(&ziel, "beschaedigt")?;
    let schreib_ergebnis = sicherung_schreiben(sicherungsdatei, &inhalt);
    if let Err(fehler) = schreib_ergebnis {
        let _ = fs::remove_file(&sicherungspfad);
        return Err(format!(
            "Sicherungsdatei konnte nicht vollständig geschrieben und synchronisiert werden ({}): {fehler}",
            sicherungspfad.display()
        ));
    }

    let relativer_sicherungspfad = sicherungspfad
        .strip_prefix(basis)
        .map_err(|fehler| format!("Sicherungspfad konnte nicht abgeleitet werden: {fehler}"))?
        .to_string_lossy()
        .into_owned();
    if let Err(_fehler) = entfernen(&ziel) {
        return Ok(ArchivierungsErgebnis {
            status: ArchivierungsStatus::GesichertAberNichtEntfernt,
            sicherungspfad: Some(relativer_sicherungspfad),
        });
    }
    Ok(ArchivierungsErgebnis {
        status: ArchivierungsStatus::Archiviert,
        sicherungspfad: Some(relativer_sicherungspfad),
    })
}

pub(super) fn archiviere_in_basis_mit_entfernen<F>(
    basis: &Path,
    relativer_pfad: &Path,
    erwarteter_inhalt: &str,
    entfernen: F,
) -> Result<ArchivierungsErgebnis, String>
where
    F: FnOnce(&Path) -> std::io::Result<()>,
{
    archiviere_in_basis_mit_sicherung_schreiben(
        basis,
        relativer_pfad,
        erwarteter_inhalt,
        entfernen,
        |mut sicherungsdatei, inhalt| {
            sicherungsdatei
                .write_all(inhalt.as_bytes())
                .and_then(|_| sicherungsdatei.sync_all())
        },
    )
}

pub(super) fn archiviere_in_basis(
    basis: &Path,
    relativer_pfad: &Path,
    erwarteter_inhalt: &str,
) -> Result<ArchivierungsErgebnis, String> {
    archiviere_in_basis_mit_entfernen(basis, relativer_pfad, erwarteter_inhalt, |pfad| {
        fs::remove_file(pfad)
    })
}

/// Kopiert das vollständige Original; erst nach erfolgreichem Sync darf der Aufrufer schreiben.
pub(super) fn sichere_abweichende_version_in_basis(
    basis: &Path,
    relativer_pfad: &Path,
) -> Result<String, String> {
    pruefe_eltern_ohne_symbolische_links(basis, relativer_pfad)?;
    let ziel = basis.join(relativer_pfad);
    let mut original = fs::File::open(&ziel)
        .map_err(|fehler| format!("Originaldatei konnte nicht gelesen werden: {fehler}"))?;
    let (sicherungspfad, mut sicherungsdatei) =
        sicherungs_datei_anlegen(&ziel, "abweichende-version")?;
    if let Err(fehler) =
        std::io::copy(&mut original, &mut sicherungsdatei).and_then(|_| sicherungsdatei.sync_all())
    {
        drop(sicherungsdatei);
        let _ = fs::remove_file(&sicherungspfad);
        return Err(format!(
            "Sicherung konnte nicht vollständig geschrieben und synchronisiert werden: {fehler}"
        ));
    }
    sicherungspfad
        .strip_prefix(basis)
        .map(|pfad| pfad.to_string_lossy().into_owned())
        .map_err(|fehler| format!("Sicherungspfad konnte nicht abgeleitet werden: {fehler}"))
}

#[cfg(test)]
mod tests {
    use super::super::tests::{dateinamen, TestOrdner};
    use super::*;
    #[test]
    fn archivierung_meldet_fehlende_und_veraenderte_originaldatei() {
        let ordner = TestOrdner::neu();
        let pfad = Path::new("daten.xml");

        assert_eq!(
            archiviere_in_basis(&ordner.0, pfad, "erwartet")
                .unwrap()
                .status,
            ArchivierungsStatus::Fehlt
        );

        fs::write(ordner.0.join(pfad), "tatsaechlich").unwrap();
        assert_eq!(
            archiviere_in_basis(&ordner.0, pfad, "erwartet")
                .unwrap()
                .status,
            ArchivierungsStatus::Veraendert
        );
        assert_eq!(
            fs::read_to_string(ordner.0.join(pfad)).unwrap(),
            "tatsaechlich"
        );
    }

    #[test]
    fn archivierung_sichert_eindeutig_und_entfernt_nur_den_geprueften_inhalt() {
        let ordner = TestOrdner::neu();
        let pfad = Path::new("ordner/daten.xml");
        fs::create_dir(ordner.0.join("ordner")).unwrap();
        fs::write(ordner.0.join(pfad), "beschaedigt").unwrap();
        fs::write(
            ordner.0.join("ordner/daten.xml.beschaedigt-vorhanden.bak"),
            "alt",
        )
        .unwrap();

        let ergebnis = archiviere_in_basis(&ordner.0, pfad, "beschaedigt").unwrap();

        assert_eq!(ergebnis.status, ArchivierungsStatus::Archiviert);
        assert!(!ordner.0.join(pfad).exists());
        let sicherung = ergebnis.sicherungspfad.unwrap();
        let sicherungspfad = Path::new(&sicherung);
        assert_eq!(sicherungspfad.parent(), pfad.parent());
        let sicherungsname = sicherungspfad.file_name().unwrap().to_str().unwrap();
        assert!(sicherungsname.starts_with("daten.xml.beschaedigt-"));
        assert!(sicherungsname.ends_with(".bak"));
        assert_eq!(
            fs::read_to_string(ordner.0.join(sicherung)).unwrap(),
            "beschaedigt"
        );
        assert_eq!(
            fs::read_to_string(ordner.0.join("ordner/daten.xml.beschaedigt-vorhanden.bak"))
                .unwrap(),
            "alt"
        );
    }

    #[test]
    fn archivierung_meldet_sicherung_wenn_entfernen_scheitert() {
        let ordner = TestOrdner::neu();
        let pfad = Path::new("daten.xml");
        fs::write(ordner.0.join(pfad), "beschaedigt").unwrap();

        let ergebnis = archiviere_in_basis_mit_entfernen(&ordner.0, pfad, "beschaedigt", |_pfad| {
            Err(std::io::Error::other("gesperrt"))
        })
        .unwrap();

        assert_eq!(
            ergebnis.status,
            ArchivierungsStatus::GesichertAberNichtEntfernt
        );
        assert!(ordner.0.join(pfad).exists());
        let sicherung = ergebnis.sicherungspfad.unwrap();
        assert_eq!(
            fs::read_to_string(ordner.0.join(sicherung)).unwrap(),
            "beschaedigt"
        );
    }

    #[test]
    fn fehlgeschlagenes_schreiben_oder_syncen_der_sicherung_belaesst_original() {
        for fehlertext in ["Schreibfehler", "Sync-Fehler"] {
            let ordner = TestOrdner::neu();
            let pfad = Path::new("daten.xml");
            fs::write(ordner.0.join(pfad), "beschaedigt").unwrap();

            let fehler = archiviere_in_basis_mit_sicherung_schreiben(
                &ordner.0,
                pfad,
                "beschaedigt",
                |ziel| fs::remove_file(ziel),
                |_datei, _inhalt| Err(std::io::Error::other(fehlertext)),
            )
            .unwrap_err();

            assert!(fehler.contains(fehlertext));
            assert_eq!(
                fs::read_to_string(ordner.0.join(pfad)).unwrap(),
                "beschaedigt"
            );
            assert_eq!(dateinamen(&ordner.0), ["daten.xml"]);
        }
    }

    #[test]
    fn sicherungen_im_selben_zeitpunkt_und_kollisionen_erhalten_eindeutige_namen() {
        let ordner = TestOrdner::neu();
        let ziel = ordner.0.join("daten.xml");
        let zeitstempel = "20260924T091234.567Z";
        fs::write(
            ordner
                .0
                .join("daten.xml.beschaedigt-20260924T091234.567Z-77-0.bak"),
            "bereits-da",
        )
        .unwrap();
        let mut nummer = 0;

        let (erstes_pfad, erstes) = sicherungs_datei_anlegen_mit_nummer(
            &ziel,
            "beschaedigt",
            zeitstempel,
            || {
                let ergebnis = nummer;
                nummer += 1;
                ergebnis
            },
            77,
        )
        .unwrap();
        drop(erstes);
        let (zweites_pfad, zweites) = sicherungs_datei_anlegen_mit_nummer(
            &ziel,
            "beschaedigt",
            zeitstempel,
            || {
                let ergebnis = nummer;
                nummer += 1;
                ergebnis
            },
            77,
        )
        .unwrap();
        drop(zweites);

        assert_ne!(erstes_pfad, zweites_pfad);
        assert!(erstes_pfad
            .file_name()
            .unwrap()
            .to_string_lossy()
            .ends_with("-1.bak"));
        assert!(zweites_pfad
            .file_name()
            .unwrap()
            .to_string_lossy()
            .ends_with("-2.bak"));
        assert_eq!(
            fs::read_to_string(
                ordner
                    .0
                    .join("daten.xml.beschaedigt-20260924T091234.567Z-77-0.bak")
            )
            .unwrap(),
            "bereits-da"
        );
    }

    #[test]
    fn versionssicherungen_umgehen_namenskollisionen_ohne_ueberschreiben() {
        let ordner = TestOrdner::neu();
        let ziel = ordner.0.join("daten.xml");
        let vorhanden = ordner
            .0
            .join("daten.xml.abweichende-version-20261105T120000.000Z-77-0.bak");
        fs::write(&vorhanden, "vorhanden").unwrap();
        let mut nummer = 0;
        let (pfad, datei) = sicherungs_datei_anlegen_mit_nummer(
            &ziel,
            "abweichende-version",
            "20261105T120000.000Z",
            || {
                let wert = nummer;
                nummer += 1;
                wert
            },
            77,
        )
        .unwrap();
        drop(datei);
        assert_eq!(
            pfad.file_name().unwrap(),
            "daten.xml.abweichende-version-20261105T120000.000Z-77-1.bak"
        );
        assert_eq!(fs::read_to_string(vorhanden).unwrap(), "vorhanden");
    }

    #[test]
    fn zeitstempel_ist_lesbar_und_enthaelt_keine_doppelpunkte() {
        assert_eq!(zeitstempel_ohne_doppelpunkt(0), "19700101T000000.000Z");
        assert_eq!(
            zeitstempel_ohne_doppelpunkt(1_727_169_874_567),
            "20240924T092434.567Z"
        );
    }
}
