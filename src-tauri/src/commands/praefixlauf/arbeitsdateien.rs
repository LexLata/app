// commands/praefixlauf/arbeitsdateien.rs
// Sichere Repository-Arbeitsdateien für Quellen, Herkunft und GesetzesXML.
use super::*;

#[derive(Debug, Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Dateiart {
    Quelle,
    Konsolidiert,
    Original,
    Herkunft,
    Gesetzesxml,
}

fn ordner_und_endung(auftrag: &Auftrag, art: Dateiart) -> Result<(PathBuf, &str), String> {
    let basis = &auftrag.arbeitsdaten;
    let normgeber = auftrag.normgeber.as_str();
    match (normgeber, art) {
        (_, Dateiart::Gesetzesxml) => Ok((basis.join("gesetzesxml").join(normgeber), "xml")),
        ("de-bund", Dateiart::Quelle) => Ok((basis.join("quelldateien/de-bund"), "xml")),
        ("de-bw", Dateiart::Quelle) => Ok((basis.join("quelldateien/de-bw"), "html")),
        ("eu", Dateiart::Herkunft) => Ok((basis.join("quelldateien/eu/herkunft"), "json")),
        ("eu", Dateiart::Konsolidiert) => Ok((basis.join("quelldateien/eu/konsolidiert"), "zip")),
        ("eu", Dateiart::Original) => Ok((basis.join("quelldateien/eu/original"), "zip")),
        _ => Err("Dateiart passt nicht zum Normgeber.".into()),
    }
}

pub(super) fn dateipfad(
    auftrag: &Auftrag,
    art: Dateiart,
    kurztitel: &str,
) -> Result<PathBuf, String> {
    let (ordner, endung) = ordner_und_endung(auftrag, art)?;
    let ziel = ordner.join(arbeitsdateiname(kurztitel, endung)?);
    absoluter_pfad(Some(ziel.to_string_lossy().into_owned()))
}

fn dekodiere(name: &str) -> Result<String, String> {
    let mut bytes = Vec::new();
    let mut rest = name.as_bytes();
    while let Some((&erstes, danach)) = rest.split_first() {
        if erstes == b'%' {
            let hex = rest.get(1..3).ok_or("Ungültiger Arbeitsdateiname.")?;
            let hex = std::str::from_utf8(hex).map_err(|e| e.to_string())?;
            bytes.push(u8::from_str_radix(hex, 16).map_err(|e| e.to_string())?);
            rest = &rest[3..];
        } else {
            bytes.push(erstes);
            rest = danach;
        }
    }
    String::from_utf8(bytes).map_err(|e| e.to_string())
}

fn bestand(auftrag: &Auftrag, art: Dateiart) -> Result<Vec<String>, String> {
    let (ordner, endung) = ordner_und_endung(auftrag, art)?;
    absoluter_pfad(Some(ordner.to_string_lossy().into_owned()))?;
    let eintraege = match fs::read_dir(&ordner) {
        Ok(e) => e,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(e.to_string()),
    };
    let mut titel = Vec::new();
    let mut eindeutig = std::collections::HashSet::new();
    for eintrag in eintraege {
        let pfad = eintrag.map_err(|e| e.to_string())?.path();
        absoluter_pfad(Some(pfad.to_string_lossy().into_owned()))?;
        if pfad.is_file() && pfad.extension().is_some_and(|e| e == endung) {
            let name = pfad
                .file_stem()
                .and_then(|s| s.to_str())
                .ok_or("Ungültiger Dateiname.")?;
            let name = dekodiere(name)?;
            if !eindeutig.insert(name.to_lowercase()) {
                return Err(format!("Mehrdeutiger Arbeitsdateibestand: {name}"));
            }
            titel.push(name);
        }
    }
    titel.sort();
    Ok(titel)
}

#[derive(Debug, serde::Serialize)]
pub struct Dateistand {
    quellen: Vec<String>,
    gesetzesxml: Vec<String>,
    konsolidiert: Vec<String>,
    original: Vec<String>,
}
fn dateistand(auftrag: &Auftrag) -> Result<Dateistand, String> {
    let eu = auftrag.normgeber == "eu";
    Ok(Dateistand {
        quellen: bestand(
            auftrag,
            if eu {
                Dateiart::Herkunft
            } else {
                Dateiart::Quelle
            },
        )?,
        gesetzesxml: bestand(auftrag, Dateiart::Gesetzesxml)?,
        konsolidiert: if eu {
            bestand(auftrag, Dateiart::Konsolidiert)?
        } else {
            Vec::new()
        },
        original: if eu {
            bestand(auftrag, Dateiart::Original)?
        } else {
            Vec::new()
        },
    })
}
fn lesen(auftrag: &Auftrag, art: Dateiart, kurztitel: &str) -> Result<Option<Vec<u8>>, String> {
    match fs::read(dateipfad(auftrag, art, kurztitel)?) {
        Ok(inhalt) => Ok(Some(inhalt)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}
fn schreiben(
    auftrag: &Auftrag,
    art: Dateiart,
    kurztitel: &str,
    inhalt: &[u8],
) -> Result<(), String> {
    let ziel = dateipfad(auftrag, art, kurztitel)?;
    let basis = ziel.parent().ok_or("Basisordner fehlt.")?;
    fs::create_dir_all(basis).map_err(|e| e.to_string())?;
    absoluter_pfad(Some(ziel.to_string_lossy().into_owned()))?;
    super::super::datei_io::atomar_bytes_in_basis_schreiben(
        basis,
        Path::new(ziel.file_name().ok_or("Dateiname fehlt.")?),
        inhalt,
    )
}
fn loeschen(auftrag: &Auftrag, art: Dateiart, kurztitel: &str) -> Result<(), String> {
    if !matches!(art, Dateiart::Herkunft | Dateiart::Gesetzesxml) {
        return Err("Nur Herkunftsangabe und GesetzesXML dürfen gelöscht werden.".into());
    }
    match fs::remove_file(dateipfad(auftrag, art, kurztitel)?) {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn praefixlauf_dateistand() -> Result<Dateistand, String> {
    dateiarbeit_im_hintergrund("Dateistand lesen".into(), |auftrag| dateistand(&auftrag)).await
}
#[tauri::command]
pub async fn praefixlauf_arbeitsdatei_lesen(
    art: Dateiart,
    kurztitel: String,
) -> Result<Option<String>, String> {
    dateiarbeit_im_hintergrund(
        format!("Arbeitsdatei lesen ({kurztitel})"),
        move |auftrag| {
            if matches!(art, Dateiart::Konsolidiert | Dateiart::Original) {
                return Err("Archive als Bytes lesen.".into());
            }
            lesen(&auftrag, art, &kurztitel)?
                .map(|bytes| String::from_utf8(bytes).map_err(|e| e.to_string()))
                .transpose()
        },
    )
    .await
}
#[tauri::command]
pub async fn praefixlauf_arbeitsdatei_schreiben(
    art: Dateiart,
    kurztitel: String,
    inhalt: String,
) -> Result<(), String> {
    dateiarbeit_im_hintergrund(
        format!("Arbeitsdatei schreiben ({kurztitel})"),
        move |auftrag| {
            if matches!(art, Dateiart::Konsolidiert | Dateiart::Original) {
                return Err("Archive als Bytes schreiben.".into());
            }
            schreiben(&auftrag, art, &kurztitel, inhalt.as_bytes())
        },
    )
    .await
}
#[tauri::command]
pub async fn praefixlauf_archiv_lesen(
    art: Dateiart,
    kurztitel: String,
) -> Result<Option<Vec<u8>>, String> {
    dateiarbeit_im_hintergrund(format!("Archiv lesen ({kurztitel})"), move |auftrag| {
        if !matches!(art, Dateiart::Konsolidiert | Dateiart::Original) {
            return Err("Keine Archivart.".into());
        }
        lesen(&auftrag, art, &kurztitel)
    })
    .await
}
#[tauri::command]
pub async fn praefixlauf_archiv_schreiben(
    art: Dateiart,
    kurztitel: String,
    inhalt: Vec<u8>,
) -> Result<(), String> {
    dateiarbeit_im_hintergrund(format!("Archiv schreiben ({kurztitel})"), move |auftrag| {
        if !matches!(art, Dateiart::Konsolidiert | Dateiart::Original) {
            return Err("Keine Archivart.".into());
        }
        schreiben(&auftrag, art, &kurztitel, &inhalt)
    })
    .await
}
#[tauri::command]
pub async fn praefixlauf_arbeitsdatei_loeschen(
    art: Dateiart,
    kurztitel: String,
) -> Result<(), String> {
    dateiarbeit_im_hintergrund(
        format!("Arbeitsdatei löschen ({kurztitel})"),
        move |auftrag| loeschen(&auftrag, art, &kurztitel),
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::super::tests::{lese, variablen, Ordner};
    use super::*;

    fn auftrag(ordner: &Ordner, normgeber: &str) -> Auftrag {
        let mut vars = variablen(&ordner.0);
        vars.insert("LEXLATA_PRAEFIXLAUF".into(), normgeber.into());
        if normgeber == "eu" {
            vars.insert("LEXLATA_PRAEFIXLAUF_MODUS".into(), "quelldateien".into());
            vars.remove("LEXLATA_PRAEFIXLAUF_DATEI");
        }
        lese(&vars).unwrap().unwrap()
    }
    #[test]
    fn mehrdeutige_physische_titel_werden_fuer_jede_dateiart_abgewiesen() {
        let o = Ordner::neu();
        for normgeber in ["de-bund", "de-bw", "eu"] {
            let a = auftrag(&o, normgeber);
            let arten = if normgeber == "eu" {
                vec![
                    Dateiart::Konsolidiert,
                    Dateiart::Original,
                    Dateiart::Herkunft,
                    Dateiart::Gesetzesxml,
                ]
            } else {
                vec![Dateiart::Quelle, Dateiart::Gesetzesxml]
            };
            for art in arten {
                let oben = dateipfad(&a, art, "GG").unwrap();
                let unten = dateipfad(&a, art, "gg").unwrap();
                fs::create_dir_all(oben.parent().unwrap()).unwrap();
                fs::write(&oben, b"oben").unwrap();
                fs::write(&unten, b"unten").unwrap();
                // Auf case-insensitiven Dateisystemen kann dieser Bestand nicht entstehen.
                if fs::read_dir(oben.parent().unwrap()).unwrap().count() == 2 {
                    assert!(bestand(&a, art).unwrap_err().contains("Mehrdeutiger"));
                    assert!(dateistand(&a).is_err());
                }
                fs::remove_file(&oben).unwrap();
                if unten.exists() {
                    fs::remove_file(&unten).unwrap();
                }
            }
        }
    }
    #[test]
    fn dateistand_liefert_tatsaechliche_schreibweise_fuer_dateizugriffe() {
        let o = Ordner::neu();
        for normgeber in ["de-bund", "de-bw", "eu"] {
            let a = auftrag(&o, normgeber);
            let arten = if normgeber == "eu" {
                vec![
                    Dateiart::Konsolidiert,
                    Dateiart::Original,
                    Dateiart::Herkunft,
                    Dateiart::Gesetzesxml,
                ]
            } else {
                vec![Dateiart::Quelle, Dateiart::Gesetzesxml]
            };
            for art in arten {
                schreiben(&a, art, "gG/Ä", b"alt").unwrap();
                let namen = bestand(&a, art).unwrap();
                assert_eq!(namen, ["gG/Ä"]);
                let name = &namen[0];
                assert_eq!(lesen(&a, art, name).unwrap(), Some(b"alt".to_vec()));
                schreiben(&a, art, name, b"neu").unwrap();
                assert_eq!(lesen(&a, art, name).unwrap(), Some(b"neu".to_vec()));
                assert_eq!(bestand(&a, art).unwrap().len(), 1);
                if matches!(art, Dateiart::Herkunft | Dateiart::Gesetzesxml) {
                    loeschen(&a, art, name).unwrap();
                    assert!(bestand(&a, art).unwrap().is_empty());
                    schreiben(&a, art, name, b"wieder").unwrap();
                    assert_eq!(bestand(&a, art).unwrap(), ["gG/Ä"]);
                }
            }
        }
    }
    #[test]
    fn fehlende_dateien_sind_kein_fehler_und_binaere_archive_bleiben_unveraendert() {
        let o = Ordner::neu();
        let a = auftrag(&o, "eu");
        for art in [Dateiart::Gesetzesxml, Dateiart::Herkunft] {
            assert_eq!(lesen(&a, art, "CON").unwrap(), None);
            loeschen(&a, art, "CON").unwrap();
            schreiben(&a, art, "CON", b"alt").unwrap();
            loeschen(&a, art, "CON").unwrap();
            assert_eq!(lesen(&a, art, "CON").unwrap(), None);
        }
        let bytes = [0, 255, 128, 42];
        for art in [Dateiart::Konsolidiert, Dateiart::Original] {
            schreiben(&a, art, "Ä/%..", b"alt").unwrap();
            schreiben(&a, art, "Ä/%..", &bytes).unwrap();
            assert_eq!(lesen(&a, art, "Ä/%..").unwrap(), Some(bytes.to_vec()));
            let (ordner, _) = ordner_und_endung(&a, art).unwrap();
            assert_eq!(fs::read_dir(ordner).unwrap().count(), 1);
        }
    }
    #[test]
    fn dateistand_trennt_quellen_gesetzesxml_und_verwaiste_archive() {
        let o = Ordner::neu();
        let a = auftrag(&o, "eu");
        schreiben(&a, Dateiart::Konsolidiert, "Basis/ohne Herkunft", b"zip").unwrap();
        schreiben(&a, Dateiart::Original, "Original%ohne Herkunft", b"zip").unwrap();
        schreiben(&a, Dateiart::Herkunft, "EU A", b"{}").unwrap();
        schreiben(&a, Dateiart::Gesetzesxml, "EU B", b"<gesetz/>").unwrap();
        let stand = dateistand(&a).unwrap();
        assert_eq!(stand.quellen, ["EU A"]);
        assert_eq!(stand.gesetzesxml, ["EU B"]);
        assert_eq!(stand.konsolidiert, ["Basis/ohne Herkunft"]);
        assert_eq!(stand.original, ["Original%ohne Herkunft"]);
        for normgeber in ["de-bund", "de-bw"] {
            let a = auftrag(&o, normgeber);
            schreiben(&a, Dateiart::Quelle, "A/B", b"quelle").unwrap();
            schreiben(&a, Dateiart::Gesetzesxml, "C", b"xml").unwrap();
            let stand = dateistand(&a).unwrap();
            assert_eq!(stand.quellen, ["A/B"]);
            assert_eq!(stand.gesetzesxml, ["C"]);
        }
    }
    #[test]
    fn namensbildung_ist_fuer_alle_dateiarten_umkehrbar_und_begrenzt() {
        let o = Ordner::neu();
        for normgeber in ["de-bund", "de-bw", "eu"] {
            let a = auftrag(&o, normgeber);
            let arten = if normgeber == "eu" {
                vec![
                    Dateiart::Konsolidiert,
                    Dateiart::Original,
                    Dateiart::Herkunft,
                    Dateiart::Gesetzesxml,
                ]
            } else {
                vec![Dateiart::Quelle, Dateiart::Gesetzesxml]
            };
            for art in arten {
                for titel in [
                    "CON",
                    "con.txt",
                    "LPT¹",
                    "COM9",
                    "COM0",
                    "A. ",
                    "a\n?*<>:\"|b",
                    "Ä/CON\\..",
                    "a%2Fb",
                    "..",
                    "§12PflAFinV",
                ] {
                    let ziel = dateipfad(&a, art, titel).unwrap();
                    assert_eq!(
                        dekodiere(ziel.file_stem().unwrap().to_str().unwrap()).unwrap(),
                        titel
                    );
                    assert!(ziel.starts_with(&a.arbeitsdaten));
                }
                assert!(dateipfad(&a, art, &"a".repeat(256)).is_err());
                assert!(dateipfad(&a, art, " ").is_err());
            }
        }
    }
    #[cfg(unix)]
    #[test]
    fn lesen_schreiben_loeschen_und_bestand_verweigern_symlinks() {
        use std::os::unix::fs::symlink;
        let o = Ordner::neu();
        let fremd = Ordner::neu();
        let a = auftrag(&o, "eu");
        for art in [
            Dateiart::Konsolidiert,
            Dateiart::Original,
            Dateiart::Herkunft,
            Dateiart::Gesetzesxml,
        ] {
            let ziel = dateipfad(&a, art, "A").unwrap();
            fs::create_dir_all(ziel.parent().unwrap()).unwrap();
            let datei = fremd.0.join("fremd");
            fs::write(&datei, [255, 1]).unwrap();
            symlink(&datei, &ziel).unwrap();
            assert!(lesen(&a, art, "A").is_err());
            assert!(schreiben(&a, art, "A", &[128]).is_err());
            assert!(bestand(&a, art).is_err());
            assert!(loeschen(&a, art, "A").is_err());
            assert_eq!(fs::read(&datei).unwrap(), [255, 1]);
            fs::remove_file(ziel).unwrap();
            let (ordner, _) = ordner_und_endung(&a, art).unwrap();
            fs::remove_dir(&ordner).unwrap();
            symlink(&fremd.0, &ordner).unwrap();
            assert!(schreiben(&a, art, "A", &[128]).is_err());
            assert!(loeschen(&a, art, "A").is_err());
        }
    }
}

#[cfg(test)]
mod befehlstests {
    use super::*;
    #[tokio::test]
    async fn alle_arbeitsdateibefehle_verweigern_ohne_entwicklungsauftrag() {
        assert!(praefixlauf_dateistand().await.is_err());
        assert!(
            praefixlauf_arbeitsdatei_lesen(Dateiart::Quelle, "GG".into())
                .await
                .is_err()
        );
        assert!(
            praefixlauf_arbeitsdatei_schreiben(Dateiart::Quelle, "GG".into(), "xml".into())
                .await
                .is_err()
        );
        assert!(praefixlauf_archiv_lesen(Dateiart::Original, "EU".into())
            .await
            .is_err());
        assert!(
            praefixlauf_archiv_schreiben(Dateiart::Original, "EU".into(), vec![255])
                .await
                .is_err()
        );
        assert!(
            praefixlauf_arbeitsdatei_loeschen(Dateiart::Gesetzesxml, "GG".into())
                .await
                .is_err()
        );
    }
}
