// fenster/ziehvorschau.rs – Native Ziehvorschau mit serialisiertem Fensterlebenszyklus.
// Alle nativen Operationen laufen auf einem Worker unter derselben Sperre.
// Schließen beendet die Kennung vorher; ein laufender Aufbau räumt sein eigenes
// Handle auf, bevor ein weiterer Aufbau das feste Label wiederverwenden darf.
mod fensterplatz;
mod zustand;
use fensterplatz::Fensterplatz;

use std::sync::Mutex;
use tauri::Manager;
use zustand::{Zug, ZugZustand};

pub(crate) const LABEL: &str = "ziehvorschau";

pub struct Ziehvorschau<R: tauri::Runtime = tauri::Wry> {
    zug: Mutex<ZugZustand>,
    fenster: Mutex<Fensterplatz<tauri::WebviewWindow<R>>>,
}

impl<R: tauri::Runtime> Default for Ziehvorschau<R> {
    fn default() -> Self {
        Self {
            zug: Mutex::default(),
            fenster: Mutex::default(),
        }
    }
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Aussehen {
    hintergrund: String,
    hintergrund_nativ: Option<[u8; 4]>,
    textfarbe: String,
    schrift: String,
    innenabstand: String,
    eckenradius: String,
}

fn seiten_url(titel: &str, aussehen: &Aussehen) -> Result<tauri::WebviewUrl, String> {
    let mut url: tauri::Url =
        tauri::Url::parse("tauri://localhost/ziehvorschau.html").map_err(|e| e.to_string())?;
    url.query_pairs_mut().extend_pairs([
        ("titel", titel),
        ("hintergrund", &aussehen.hintergrund),
        ("textfarbe", &aussehen.textfarbe),
        ("schrift", &aussehen.schrift),
        ("innenabstand", &aussehen.innenabstand),
        ("eckenradius", &aussehen.eckenradius),
    ]);
    Ok(tauri::WebviewUrl::App(
        format!("ziehvorschau.html?{}", url.query().unwrap_or_default()).into(),
    ))
}

// destroy() stellt eine native Nachricht zu. Erst nach dem tatsächlichen
// Entfernen aus Tauris Registry ist das Label für den nächsten Aufbau frei.
fn fenster_entfernen<R: tauri::Runtime>(fenster: &tauri::WebviewWindow<R>) -> Result<(), String> {
    if fenster.app_handle().get_webview_window(LABEL).is_none() {
        return Ok(());
    }
    fenster.destroy().map_err(|e| e.to_string())?;
    let frist = std::time::Instant::now() + std::time::Duration::from_secs(2);
    while fenster.app_handle().get_webview_window(LABEL).is_some() {
        if std::time::Instant::now() >= frist {
            return Err("Ziehvorschaufenster wurde noch nicht zerstört.".into());
        }
        std::thread::sleep(std::time::Duration::from_millis(2));
    }
    Ok(())
}

#[tauri::command]
pub async fn ziehvorschau_oeffnen<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::WebviewWindow<R>,
    zugkennung: u64,
    titel: String,
    aussehen: Aussehen,
) -> Result<(), String> {
    if zugkennung > 9_007_199_254_740_991 {
        return Err("Ungültige Zugkennung.".into());
    }
    let zug = Zug {
        quelle: window.label().into(),
        kennung: zugkennung,
    };
    if !crate::sperren::sperren(&app.state::<Ziehvorschau<R>>().zug).oeffnen(&zug) {
        return Ok(());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let zustand = app.state::<Ziehvorschau<R>>();
        let mut slot = crate::sperren::sperren(&zustand.fenster);
        slot.aufbauen(
            &zug,
            &zustand.zug,
            || {
                let builder =
                    tauri::WebviewWindowBuilder::new(&app, LABEL, seiten_url(&titel, &aussehen)?)
                        .title("Ziehvorschau")
                        .inner_size(180.0, 34.0)
                        .visible(false)
                        .decorations(cfg!(target_os = "macos"))
                        .resizable(false)
                        .minimizable(false)
                        .maximizable(false)
                        .closable(false)
                        .shadow(true)
                        .focused(false)
                        .focusable(false)
                        .always_on_top(true)
                        .skip_taskbar(true);
                let builder = if let Some([rot, gruen, blau, _]) = aussehen.hintergrund_nativ {
                    // Bereits beim Bau setzen: Die Seite kann beim ersten show()
                    // noch laden. Fenster und Webview teilen dieselbe opake Farbe.
                    builder.background_color(tauri::window::Color(rot, gruen, blau, 255))
                } else {
                    builder
                };
                // Wie im Hauptfenster reicht die Webansicht unter die versteckte
                // Titelleiste. Der Titled-Stil erhält die opaken nativen Ecken.
                #[cfg(target_os = "macos")]
                let builder = builder
                    .title_bar_style(tauri::TitleBarStyle::Overlay)
                    .hidden_title(true);
                builder.build().map_err(|e| e.to_string())
            },
            |fenster| {
                fenster
                    .set_ignore_cursor_events(false)
                    .map_err(|e| e.to_string())?;
                // Diese Hauptthread-Nachricht steht vor den späteren Positions-/
                // Sichtbarkeitsnachrichten desselben serialisierten Workers.
                #[cfg(target_os = "macos")]
                fenster
                    .with_webview(|plattform| {
                        use objc2_app_kit::{NSWindow, NSWindowButton};
                        // SAFETY: Tauri hält dieses NSWindow für die Dauer der
                        // Hauptthread-Closure am Leben.
                        let fenster = unsafe { &*(plattform.ns_window() as *const NSWindow) };
                        for art in [
                            NSWindowButton::CloseButton,
                            NSWindowButton::MiniaturizeButton,
                            NSWindowButton::ZoomButton,
                        ] {
                            if let Some(button) = fenster.standardWindowButton(art) {
                                button.setHidden(true);
                            }
                        }
                    })
                    .map_err(|e| e.to_string())?;
                Ok(())
            },
            fenster_entfernen,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

async fn fenster_aendern<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    zug: Zug,
    position: Option<(f64, f64)>,
    schliessen: bool,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let zustand = app.state::<Ziehvorschau<R>>();
        let mut slot = crate::sperren::sperren(&zustand.fenster);
        if !slot.gehoert(&zug) {
            return Ok(());
        }
        if schliessen {
            return slot.aufraeumen(fenster_entfernen);
        }
        let z = crate::sperren::sperren(&zustand.zug);
        if !z.passt(&zug) {
            return Ok(());
        }
        let (_, fenster) = slot.fenster.as_ref().unwrap();
        if let Some((x, y)) = position {
            if !x.is_finite() || !y.is_finite() {
                return Err("Ungültige Zeigerposition.".into());
            }
            fenster
                .set_position(tauri::LogicalPosition::new(x - 90.0, y - 17.0))
                .map_err(|e| e.to_string())?;
            fenster.show().map_err(|e| e.to_string())
        } else {
            fenster.hide().map_err(|e| e.to_string())
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn ziehvorschau_bewegen<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::WebviewWindow<R>,
    zugkennung: u64,
    x: f64,
    y: f64,
) -> Result<(), String> {
    fenster_aendern(
        app,
        Zug {
            quelle: window.label().into(),
            kennung: zugkennung,
        },
        Some((x, y)),
        false,
    )
    .await
}
#[tauri::command]
pub async fn ziehvorschau_verbergen<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::WebviewWindow<R>,
    zugkennung: u64,
) -> Result<(), String> {
    fenster_aendern(
        app,
        Zug {
            quelle: window.label().into(),
            kennung: zugkennung,
        },
        None,
        false,
    )
    .await
}
#[tauri::command]
pub async fn ziehvorschau_schliessen<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::WebviewWindow<R>,
    zugkennung: u64,
) -> Result<(), String> {
    let zug = Zug {
        quelle: window.label().into(),
        kennung: zugkennung,
    };
    crate::sperren::sperren(&app.state::<Ziehvorschau<R>>().zug).schliessen(&zug);
    fenster_aendern(app, zug, None, true).await
}

pub fn quelle_zerstoert<R: tauri::Runtime>(window: &tauri::Window<R>) {
    let zustand = window.state::<Ziehvorschau<R>>();
    let mut z = crate::sperren::sperren(&zustand.zug);
    let zug = z.aktiv.clone().filter(|zug| zug.quelle == window.label());
    z.quelle_schliessen(window.label());
    drop(z);
    if let Some(zug) = zug {
        let app = window.app_handle().clone();
        tauri::async_runtime::spawn(async move {
            if let Err(e) = fenster_aendern(app, zug, None, true).await {
                eprintln!("Ziehvorschau aufräumen: {e}");
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn echte_commands_verhindern_anlegen_nach_abschluss_und_ignorieren_alte_kennungen() {
        tauri::async_runtime::block_on(async {
            let app = tauri::test::mock_builder()
                .manage(Ziehvorschau::<tauri::test::MockRuntime>::default())
                .build(tauri::test::mock_context(tauri::test::noop_assets()))
                .unwrap();
            let quelle = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
                .build()
                .unwrap();
            let aussehen = || Aussehen {
                hintergrund: "white".into(),
                hintergrund_nativ: Some([30, 30, 30, 255]),
                textfarbe: "black".into(),
                schrift: "14px Arial".into(),
                innenabstand: "5px 12px 5px 14px".into(),
                eckenradius: "7px".into(),
            };
            ziehvorschau_bewegen(app.handle().clone(), quelle.clone(), 1, 10.0, 10.0)
                .await
                .unwrap();
            assert!(app.get_webview_window(LABEL).is_none());
            ziehvorschau_schliessen(app.handle().clone(), quelle.clone(), 1)
                .await
                .unwrap();
            ziehvorschau_oeffnen(
                app.handle().clone(),
                quelle.clone(),
                1,
                "A".into(),
                aussehen(),
            )
            .await
            .unwrap();
            assert!(app.get_webview_window(LABEL).is_none());
            ziehvorschau_oeffnen(
                app.handle().clone(),
                quelle.clone(),
                2,
                "B".into(),
                aussehen(),
            )
            .await
            .unwrap();
            assert!(app.get_webview_window(LABEL).is_some());
            ziehvorschau_oeffnen(
                app.handle().clone(),
                quelle.clone(),
                3,
                "C".into(),
                aussehen(),
            )
            .await
            .unwrap();
            ziehvorschau_bewegen(app.handle().clone(), quelle.clone(), 1, 10.0, 10.0)
                .await
                .unwrap();
            ziehvorschau_verbergen(app.handle().clone(), quelle.clone(), 1)
                .await
                .unwrap();
            ziehvorschau_schliessen(app.handle().clone(), quelle.clone(), 1)
                .await
                .unwrap();
            assert!(app.get_webview_window(LABEL).is_some());
            assert_eq!(app.webview_windows().len(), 2);
        });
    }
    #[test]
    fn minimaler_seiteneinstieg_transportiert_aussehen_ohne_code_interpretation() {
        let aussehen = Aussehen {
            hintergrund: "#112233".into(),
            hintergrund_nativ: Some([17, 34, 51, 255]),
            textfarbe: "white".into(),
            schrift: "14px Arial".into(),
            innenabstand: "5px 12px 5px 14px".into(),
            eckenradius: "7px".into(),
        };
        let tauri::WebviewUrl::App(pfad) = seiten_url("BGB & <Titel>?", &aussehen).unwrap() else {
            panic!("App-Seite erwartet");
        };
        let url =
            tauri::Url::parse(&format!("tauri://localhost/{}", pfad.to_str().unwrap())).unwrap();
        let werte: std::collections::HashMap<_, _> = url.query_pairs().into_owned().collect();
        assert_eq!(url.path(), "/ziehvorschau.html");
        assert_eq!(werte["titel"], "BGB & <Titel>?");
        assert_eq!(werte["hintergrund"], aussehen.hintergrund);
        assert_eq!(werte["textfarbe"], aussehen.textfarbe);
        assert_eq!(werte["schrift"], aussehen.schrift);
        assert_eq!(werte["innenabstand"], aussehen.innenabstand);
        assert_eq!(werte["eckenradius"], aussehen.eckenradius);
    }
}
