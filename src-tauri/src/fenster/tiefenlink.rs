// fenster/tiefenlink.rs
//
// Zielfenster-/Vordergrundlogik für öffentliche OS-Tiefenlinks. Interne
// Konfliktklicks nutzen fenster/navigation.rs und dieselbe Hauptfensterauswahl,
// übergeben jedoch strukturierte Aufträge statt öffentlicher URLs.

use tauri::Manager;

/// Ermittelt ein vorhandenes Zielfenster und holt es in den Vordergrund.
/// Unter Windows/Linux werden ausschließlich Hauptfenster berücksichtigt;
/// macOS verwendet weiterhin seine native MainWindow-/Space-Logik.
pub fn tiefenlink_zielfenster_vordergrund(app: &tauri::AppHandle) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let label = super::label_des_mainwindow(app)
            .or_else(|| app.get_webview_window("main").map(|_| "main".to_string()))?;
        if let Some(fenster) = app.get_webview_window(&label) {
            super::fenster_nativ_vordergrund(&fenster);
        }
        Some(label)
    }
    #[cfg(not(target_os = "macos"))]
    {
        let fenster = app.webview_windows();
        let label = haupt_fenster_label(
            fenster
                .iter()
                .map(|(label, fenster)| (label.as_str(), fenster.is_focused().unwrap_or(false))),
        )?;
        if let Some(fenster) = fenster.get(&label) {
            let _ = fenster.unminimize();
            let _ = fenster.show();
            let _ = fenster.set_focus();
        }
        Some(label)
    }
}

// Entspricht den Hilfsfenster-Zweigen in main.tsx. Alle übrigen Labels
// rendern App.tsx und sind Hauptfenster, auch wiederhergestellte Fenster.
pub(super) fn haupt_fenster_label<'a>(
    fenster: impl IntoIterator<Item = (&'a str, bool)>,
) -> Option<String> {
    fenster
        .into_iter()
        .filter(|(label, _)| super::menu_sync::ist_hauptfenster(label))
        // Fokus bevorzugen, danach main, dann stabiles Label statt HashMap-Reihenfolge.
        .min_by_key(|(label, fokussiert)| (!*fokussiert, *label != "main", *label))
        .map(|(label, _)| label.to_string())
}

/// Öffnen-Links reservieren den Befehl und dekodieren genau ein Pfadsegment.
/// URL-Aufteilung bewusst vor dem Dekodieren: %2F bleibt Bestandteil des Texts.
pub fn parse_oeffnen_link(url: &str) -> Option<String> {
    let url = url.trim();
    let prefix = "lexlata://oeffnen/";
    if !url.get(..prefix.len())?.eq_ignore_ascii_case(prefix) {
        return None;
    }
    let segment = &url[prefix.len()..];
    if segment.is_empty() || segment.contains(['/', '?', '#']) {
        return None;
    }
    let mut bytes = Vec::new();
    let mut quelle = segment.as_bytes().iter().copied();
    while let Some(b) = quelle.next() {
        if b == b'%' {
            let a = (quelle.next()? as char).to_digit(16)?;
            let c = (quelle.next()? as char).to_digit(16)?;
            bytes.push((a * 16 + c) as u8);
        } else {
            bytes.push(b);
        }
    }
    let text = String::from_utf8(bytes).ok()?;
    if text.trim().is_empty() {
        None
    } else {
        Some(text)
    }
}

#[cfg(test)]
mod tests {
    use super::{haupt_fenster_label, parse_oeffnen_link};
    #[test]
    fn ziehvorschau_wird_auch_allein_oder_fokussiert_nie_zielfenster() {
        assert_eq!(haupt_fenster_label([("ziehvorschau", true)]), None);
        assert_eq!(
            haupt_fenster_label([("ziehvorschau", true), ("main", false)]),
            Some("main".into())
        );
    }
    #[test]
    fn oeffnen_link_parser_teilt_den_frontend_vertrag() {
        let vertraege: serde_json::Value = serde_json::from_str(include_str!(
            "../../../src/test/plattform/native-vertraege.json"
        ))
        .unwrap();
        for fall in vertraege["oeffnenLink"]["parser"].as_array().unwrap() {
            let erwartet = fall["suchtext"].as_str().map(str::to_string);
            assert_eq!(
                parse_oeffnen_link(fall["url"].as_str().unwrap()),
                erwartet,
                "{}",
                fall["url"]
            );
        }
    }

    #[test]
    fn fokussiertes_hauptfenster_hat_vorrang() {
        assert_eq!(
            haupt_fenster_label([("main", false), ("fenster-a", true)]),
            Some("fenster-a".into())
        );
    }

    #[test]
    fn main_ist_fallback_ohne_fokussiertes_hauptfenster() {
        assert_eq!(
            haupt_fenster_label([("fenster-a", false), ("main", false)]),
            Some("main".into())
        );
    }

    #[test]
    fn geschlossenes_main_und_fokussierte_hilfsfenster() {
        let fenster = [
            ("verweismarkierung-a", true),
            ("kommentar-a", true),
            ("markierungskonflikte", true),
            ("einstellungen", true),
            ("fenster-b", false),
            ("fenster-a", false),
        ];
        assert_eq!(haupt_fenster_label(fenster), Some("fenster-a".into()));
        assert_eq!(
            haupt_fenster_label(fenster.into_iter().rev()),
            Some("fenster-a".into())
        );
    }

    #[test]
    fn keine_hauptfenster_liefert_keinen_empfaenger() {
        assert_eq!(haupt_fenster_label([]), None);
        assert_eq!(
            haupt_fenster_label([
                ("verweismarkierung-a", true),
                ("kommentar-a", false),
                ("markierungskonflikte", false),
                ("einstellungen", false),
            ]),
            None
        );
    }
}
