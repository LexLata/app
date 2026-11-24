// Sichtbare Texte und native Zugriffstastenmaskierung der Normaktionen.

/// Flüchtiger Normstatus je Hauptfenster; keine Meldung bedeutet keine bestimmbare Norm.
#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Deserialize)]
pub struct MenueNormstatus {
    pub bezeichnung: Option<String>,
    pub ist_favorit: bool,
    pub ist_lesezeichen: bool,
}

pub const NORM_ERSATZ: &str = "Ausgewählte Norm";
pub const FAVORIT_SPEICHERN: &str = "als Favoriten speichern";
pub const FAVORIT_ENTFERNEN: &str = "aus Favoriten entfernen";
pub const LESEZEICHEN_SPEICHERN: &str = "als Lesezeichen speichern";
pub const LESEZEICHEN_ENTFERNEN: &str = "aus Lesezeichen entfernen";

pub fn norm_menu_text(id: &str, status: &MenueNormstatus) -> String {
    let hat_norm = status.bezeichnung.is_some();
    let aktion = match id {
        "favorit-speichern" if hat_norm && status.ist_favorit => FAVORIT_ENTFERNEN,
        "favorit-speichern" => FAVORIT_SPEICHERN,
        "lesezeichen-speichern" if hat_norm && status.ist_lesezeichen => LESEZEICHEN_ENTFERNEN,
        _ => LESEZEICHEN_SPEICHERN,
    };
    format!(
        "{} {}",
        status.bezeichnung.as_deref().unwrap_or(NORM_ERSATZ),
        aktion
    )
}

/// Muda verwendet & als Zugriffstastenmarkierung (auch macOS entfernt sie).
/// Unterstriche maskiert das GTK-Backend bereits selbst.
pub(super) fn maskiere_menue_text(text: &str) -> String {
    text.replace('&', "&&")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn normtexte_fuer_speichern_entfernen_ersatz_und_sonderzeichen() {
        for (bezeichnung, gespeichert, favorit, lesezeichen) in [
            (
                None,
                false,
                "Ausgewählte Norm als Favoriten speichern",
                "Ausgewählte Norm als Lesezeichen speichern",
            ),
            (
                Some("§ 4"),
                false,
                "§ 4 als Favoriten speichern",
                "§ 4 als Lesezeichen speichern",
            ),
            (
                Some("§ 4"),
                true,
                "§ 4 aus Favoriten entfernen",
                "§ 4 aus Lesezeichen entfernen",
            ),
            (
                Some("Art. 229 § 3"),
                true,
                "Art. 229 § 3 aus Favoriten entfernen",
                "Art. 229 § 3 aus Lesezeichen entfernen",
            ),
            (
                Some("A & B_C"),
                false,
                "A & B_C als Favoriten speichern",
                "A & B_C als Lesezeichen speichern",
            ),
        ] {
            let status = MenueNormstatus {
                bezeichnung: bezeichnung.map(str::to_owned),
                ist_favorit: gespeichert,
                ist_lesezeichen: gespeichert,
            };
            assert_eq!(norm_menu_text("favorit-speichern", &status), favorit);
            assert_eq!(
                norm_menu_text("lesezeichen-speichern", &status),
                lesezeichen
            );
        }
        assert_eq!(maskiere_menue_text("A & B_C"), "A && B_C");
    }
}
