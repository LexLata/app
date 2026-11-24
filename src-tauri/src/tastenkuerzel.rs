// Liest die nativen Menü-Accelerator aus dem gemeinsamen Tastenkürzel-Katalog.
use std::sync::OnceLock;

const KATALOG_JSON: &str =
    include_str!("../../src/lib/plattform/tastenkuerzel/tastenkuerzelKatalog.json");

#[derive(serde::Deserialize)]
struct Tastenkuerzel {
    id: String,
    accelerator: String,
    menue: bool,
}

pub(crate) fn accelerator(id: &str) -> Option<&'static str> {
    static KATALOG: OnceLock<Vec<Tastenkuerzel>> = OnceLock::new();
    KATALOG
        .get_or_init(|| {
            serde_json::from_str(KATALOG_JSON).expect("Ungültiger Tastenkürzel-Katalog")
        })
        .iter()
        .find(|eintrag| eintrag.id == id && eintrag.menue)
        .map(|eintrag| eintrag.accelerator.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn katalog_ist_parsebar_und_alle_menueeintraege_haben_accelerator() {
        let katalog: serde_json::Value = serde_json::from_str(KATALOG_JSON).unwrap();
        let eintraege = katalog.as_array().unwrap();
        let mut anzahl = 0;
        for eintrag in eintraege {
            if eintrag["menue"] == true {
                let id = eintrag["id"].as_str().unwrap();
                assert_eq!(
                    accelerator(id),
                    Some(eintrag["accelerator"].as_str().unwrap())
                );
                anzahl += 1;
            }
        }
        assert_eq!(anzahl, 22);
    }

    #[test]
    fn oeffnen_verwendet_die_beschlossene_belegung() {
        assert_eq!(accelerator("oeffnen"), Some("CmdOrCtrl+O"));
    }

    #[test]
    fn ohne_menuefreigabe_oder_unbekannte_id_kein_accelerator() {
        assert_eq!(accelerator("markierung-rueckgaengig"), None);
        assert_eq!(accelerator("unbekannt"), None);
    }
}
