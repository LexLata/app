// fenster/erscheinungsbild.rs
// Synchronisiert native Titelleisten und den Hintergrund unter dem Webseiteninhalt.
use tauri::webview::Color;

#[derive(Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Farbschema {
    System,
    Hell,
    Dunkel,
}

fn fenster_theme(farbschema: Farbschema) -> Option<tauri::Theme> {
    match farbschema {
        Farbschema::System => None,
        Farbschema::Hell => Some(tauri::Theme::Light),
        Farbschema::Dunkel => Some(tauri::Theme::Dark),
    }
}

fn hintergrund(dunkel: bool) -> Color {
    // Entspricht --bg-haupt in index.css und dem Start-Hintergrund in index.html.
    if dunkel {
        Color(30, 30, 30, 255)
    } else {
        Color(255, 255, 255, 255)
    }
}

#[tauri::command]
pub async fn fenster_farbschema_anwenden(
    window: tauri::WebviewWindow,
    farbschema: Farbschema,
    dunkel: bool,
) -> Result<(), String> {
    #[cfg(not(target_os = "macos"))]
    window
        .set_theme(fenster_theme(farbschema))
        .map_err(|e| e.to_string())?;
    let farbe = hintergrund(dunkel);
    window
        .set_background_color(Some(farbe))
        .map_err(|e| e.to_string())?;

    // Tauri setzt zur Laufzeit auf macOS nur NSWindow.backgroundColor.
    // Die Fläche unter der WKWebView-Seite benötigt zusätzlich ihre eigene Farbe.
    #[cfg(target_os = "macos")]
    {
        let (sender, empfaenger) = tokio::sync::oneshot::channel();
        window
            .with_webview(move |plattform| {
                use objc2::{msg_send, sel};
                use objc2_app_kit::{NSAppearance, NSAppearanceCustomization, NSColor, NSWindow};
                use objc2_foundation::NSString;
                use objc2_web_kit::WKWebView;
                // SAFETY: Tauri liefert die WKWebView auf dem Hauptthread und
                // hält sie für die Dauer dieses Closures am Leben.
                let webview = unsafe { &*(plattform.inner() as *const WKWebView) };
                // Nur dieses Fenster umfärben; set_theme würde NSApplication überschreiben.
                // SAFETY: Tauri hält auch dieses NSWindow im Hauptthread-Closure am Leben.
                let fenster = unsafe { &*(plattform.ns_window() as *const NSWindow) };
                let erscheinungsbild = fenster_theme(farbschema).and_then(|theme| {
                    let name = NSString::from_str(match theme {
                        tauri::Theme::Dark => "NSAppearanceNameDarkAqua",
                        _ => "NSAppearanceNameAqua",
                    });
                    NSAppearance::appearanceNamed(&name)
                });
                fenster.setAppearance(erscheinungsbild.as_deref());
                // SAFETY: Lebende WKWebView am Hauptthread; NSObject kennt respondsToSelector:.
                let untergrund_verfuegbar: bool = unsafe {
                    msg_send![webview, respondsToSelector: sel!(setUnderPageBackgroundColor:)]
                };
                if untergrund_verfuegbar {
                    let farbe = NSColor::colorWithSRGBRed_green_blue_alpha(
                        farbe.0 as f64 / 255.0,
                        farbe.1 as f64 / 255.0,
                        farbe.2 as f64 / 255.0,
                        farbe.3 as f64 / 255.0,
                    );
                    // SAFETY: Verfügbarkeit zuvor geprüft; WebView und NSColor sind hier gültig.
                    unsafe {
                        webview.setUnderPageBackgroundColor(Some(&farbe));
                    }
                }
                let _ = sender.send(());
            })
            .map_err(|e| e.to_string())?;
        empfaenger.await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn system_folgt_dem_betriebssystem_und_explizite_schemata_erzwingen_das_theme() {
        assert_eq!(fenster_theme(Farbschema::System), None);
        assert_eq!(fenster_theme(Farbschema::Hell), Some(tauri::Theme::Light));
        assert_eq!(fenster_theme(Farbschema::Dunkel), Some(tauri::Theme::Dark));
        assert_eq!(hintergrund(true), Color(30, 30, 30, 255));
        assert_eq!(hintergrund(false), Color(255, 255, 255, 255));
    }
}
