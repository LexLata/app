// Vollständige Dateistempelliste ausschließlich für den festen Gesetzesordner.
use std::{fs, path::Path, time::SystemTime};

#[derive(Debug, serde::Serialize)]
pub struct Dateistempel {
    groesse: String,
    aenderungszeit: String,
}
#[derive(Debug, serde::Serialize)]
pub struct Gesetzdatei {
    name: String,
    dateistempel: Dateistempel,
}
fn zeittext(zeit: SystemTime) -> String {
    match zeit.duration_since(SystemTime::UNIX_EPOCH) {
        Ok(dauer) => dauer.as_nanos().to_string(),
        Err(fehler) => format!("-{}", fehler.duration().as_nanos()),
    }
}
fn lese_in_basis(basis: &Path) -> Result<Vec<Gesetzdatei>, String> {
    super::pruefe_eltern_ohne_symbolische_links(basis, Path::new("gesetze/datei"))?;
    let mut dateien = Vec::new();
    for eintrag in fs::read_dir(basis.join("gesetze")).map_err(|e| e.to_string())? {
        let eintrag = eintrag.map_err(|e| e.to_string())?;
        let name = eintrag
            .file_name()
            .into_string()
            .map_err(|_| "Dateiname ist kein Unicode.".to_string())?;
        if !name.to_lowercase().ends_with(".xml") {
            continue;
        }
        let metadaten = fs::symlink_metadata(eintrag.path()).map_err(|e| e.to_string())?;
        if !metadaten.file_type().is_file() {
            return Err(format!("Keine reguläre Gesetzesdatei: {name}"));
        }
        dateien.push(Gesetzdatei {
            name,
            dateistempel: Dateistempel {
                groesse: metadaten.len().to_string(),
                aenderungszeit: zeittext(metadaten.modified().map_err(|e| e.to_string())?),
            },
        });
    }
    dateien.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(dateien)
}
#[tauri::command]
pub async fn gesetz_dateistempel_lesen(app: tauri::AppHandle) -> Result<Vec<Gesetzdatei>, String> {
    let basis = crate::app_daten_basis_pfad(&app).map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || lese_in_basis(&basis))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn erhaelt_groesse_zeittext_und_grossgeschriebene_xml_endungen() {
        let basis = std::env::temp_dir().join(format!(
            "lexlata-stempel-{}",
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(basis.join("gesetze")).unwrap();
        let pfad = basis.join("gesetze/Probe_de-bund.XML");
        fs::write(&pfad, "1234567890").unwrap();
        fs::write(basis.join("gesetze/ignoriert.txt"), "ignoriert").unwrap();
        let erwartet = zeittext(fs::metadata(&pfad).unwrap().modified().unwrap());
        let daten = serde_json::to_value(lese_in_basis(&basis).unwrap()).unwrap();
        assert_eq!(
            daten,
            serde_json::json!([{ "name": "Probe_de-bund.XML", "dateistempel": { "groesse": "10", "aenderungszeit": erwartet }}])
        );
        fs::create_dir(basis.join("gesetze/ordner.xml")).unwrap();
        assert!(lese_in_basis(&basis).is_err());
        fs::remove_dir_all(&basis).unwrap();
        assert!(lese_in_basis(&basis).is_err());
        assert_eq!(
            zeittext(SystemTime::UNIX_EPOCH - std::time::Duration::new(1, 100)),
            "-1000000100"
        );
    }
    #[cfg(unix)]
    #[test]
    fn verweigert_symbolische_links_auch_bei_leeren_ordnern() {
        use std::os::unix::fs::symlink;
        let basis = std::env::temp_dir().join(format!(
            "lexlata-links-{}",
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(basis.join("ziel")).unwrap();
        symlink(basis.join("ziel"), basis.join("gesetze")).unwrap();
        assert!(lese_in_basis(&basis).is_err());
        fs::remove_file(basis.join("gesetze")).unwrap();
        fs::create_dir(basis.join("gesetze")).unwrap();
        symlink(basis.join("ziel"), basis.join("gesetze/Probe.xml")).unwrap();
        assert!(lese_in_basis(&basis).is_err());
        fs::remove_dir_all(&basis).unwrap();
    }
}
