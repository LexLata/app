// Landesrecht-Import – Linux-spezifische Auswertung von JavaScript im
// nativen webkit2gtk-WebView.
//
// UNGETESTET – Verifikation folgt über GitHub-Actions-Build für diese
// Plattform (macOS ist die einzige hier real testbare Plattform).
//
// ACHTUNG (Risiko, siehe Plan): platform_webview.inner() liefert unter Linux
// bereits ein fertiges webkit2gtk::WebView. Die genaue Parameterreihenfolge/
// -typen von evaluate_javascript (world_name, source_uri, cancellable,
// callback) hängen von der webkit2gtk-Crate-Version ab und konnten hier
// nicht kompiliert/verifiziert werden (kein Rust-Toolchain im
// Erstellungs-Environment). Bitte bei Gelegenheit gegen docs.rs für die im
// Projekt gepinnte Version gegenprüfen.
//
// GTK-Hauptthread: with_webview() wird von Tauri intern bereits so
// ausgeführt, dass GTK-Aufrufe zulässig sind; ein zusätzliches
// run_on_main_thread ist hier daher NICHT eingebaut, um keine doppelte
// Thread-Umschaltung/Deadlock-Gefahr zu riskieren. Falls sich beim Testen
// zeigt, dass der Aufruf aus dem async-Kontext heraus (Tokio-Worker-Thread)
// dennoch nicht auf dem GTK-Hauptthread landet, muss der with_webview-Aufruf
// zusätzlich in app.run_on_main_thread(...) eingebettet werden.

#![cfg(target_os = "linux")]

use std::sync::Mutex;
use tokio::sync::oneshot;
use tokio::time::{timeout, Duration};
use webkit2gtk::WebViewExt;

const TIMEOUT: Duration = Duration::from_secs(15);

pub async fn javascript_auswerten(
    fenster: &tauri::WebviewWindow,
    skript: &str,
) -> Result<String, String> {
    let (sender, receiver) = oneshot::channel::<Result<String, String>>();
    let skript = skript.to_string();
    let sender = Mutex::new(Some(sender));

    fenster
        .with_webview(move |platform_webview| {
            let webview = platform_webview.inner();

            webview.evaluate_javascript(
                &skript,
                None, // world_name: Default-Welt
                None, // source_uri: nur für Fehlermeldungen relevant
                None::<&gtk::gio::Cancellable>,
                move |ergebnis| {
                    let Some(sender) = crate::sperren::sperren(&sender).take() else {
                        return;
                    };
                    match ergebnis {
                        Ok(wert) => {
                            // JSCValue -> String; to_string() liefert die
                            // JS-String-Repräsentation des Rückgabewerts.
                            let text = wert.to_string();
                            let _ = sender.send(Ok(text));
                        }
                        Err(e) => {
                            let _ = sender
                                .send(Err(format!("JavaScript-Auswertung fehlgeschlagen: {e}")));
                        }
                    }
                },
            );
        })
        .map_err(|e| format!("Zugriff auf natives WebView fehlgeschlagen: {e}"))?;

    match timeout(TIMEOUT, receiver).await {
        Ok(Ok(ergebnis)) => ergebnis,
        Ok(Err(_)) => Err("Kanal wurde geschlossen, bevor Ergebnis empfangen wurde.".to_string()),
        Err(_) => Err("Zeitüberschreitung beim Auswerten des JavaScript.".to_string()),
    }
}
