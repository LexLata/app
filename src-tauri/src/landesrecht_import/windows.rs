// Landesrecht-Import – Windows-spezifische Auswertung von JavaScript im
// nativen WebView2 (ICoreWebView2).
//
// Der Antwortkanal ist zwischen Aufruf und Rückruf geteilt: Auch ein sofortiger
// Fehler von ExecuteScript muss den wartenden Import mit der Ursache beenden.
// WebView2 liefert Ergebnisse JSON-kodiert; String-Ergebnisse werden dekodiert.
// Die Auswertung im echten WebView benötigt weiterhin einen Windows-Laufzeittest.

#![cfg(target_os = "windows")]

use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;
use tokio::time::{timeout, Duration};
use webview2_com::ExecuteScriptCompletedHandler;
use windows::core::HSTRING;

const TIMEOUT: Duration = Duration::from_secs(15);

pub async fn javascript_auswerten(
    fenster: &tauri::WebviewWindow,
    skript: &str,
) -> Result<String, String> {
    let (sender, receiver) = oneshot::channel::<Result<String, String>>();
    let skript = skript.to_string();
    let sender = Arc::new(Mutex::new(Some(sender)));

    fenster
        .with_webview(move |platform_webview| {
            let controller = platform_webview.controller();
            // SAFETY: Tauri stellt den gültigen Controller im Hauptthread bereit;
            // der COM-Aufruf gibt eine eigene Referenz auf dessen WebView zurück.
            let core_webview = match unsafe { controller.CoreWebView2() } {
                Ok(webview) => webview,
                Err(e) => {
                    if let Some(sender) = crate::sperren::sperren(&sender).take() {
                        let _ = sender.send(Err(format!("CoreWebView2 nicht verfügbar: {e:?}")));
                    }
                    return;
                }
            };

            let sender_im_rueckruf = Arc::clone(&sender);
            let handler = ExecuteScriptCompletedHandler::create(Box::new(
                move |fehlercode, json_ergebnis| {
                    let Some(sender) = crate::sperren::sperren(&sender_im_rueckruf).take() else {
                        return Ok(());
                    };
                    if fehlercode.is_err() {
                        let _ = sender.send(Err(format!(
                            "JavaScript-Auswertung fehlgeschlagen: {fehlercode:?}"
                        )));
                    } else {
                        // ExecuteScript liefert JSON-kodiertes Ergebnis (z. B.
                        // "\"...\"" bei einem String) – hier wieder in einen
                        // reinen String dekodieren, falls JSON-Parsing fehlschlägt
                        // wird der Rohwert unverändert zurückgegeben.
                        let text =
                            serde_json::from_str::<String>(&json_ergebnis).unwrap_or(json_ergebnis);
                        let _ = sender.send(Ok(text));
                    }
                    Ok(())
                },
            ));

            // SAFETY: WebView und Skript sind während des Hauptthread-Aufrufs
            // gültig; WebView2 hält den COM-Handler bis zum späteren Rückruf.
            let ergebnis =
                unsafe { core_webview.ExecuteScript(&HSTRING::from(skript.as_str()), &handler) };
            if let Err(e) = ergebnis {
                if let Some(sender) = crate::sperren::sperren(&sender).take() {
                    let _ = sender.send(Err(format!("ExecuteScript fehlgeschlagen: {e:?}")));
                }
            }
        })
        .map_err(|e| format!("Zugriff auf natives WebView fehlgeschlagen: {e}"))?;

    match timeout(TIMEOUT, receiver).await {
        Ok(Ok(ergebnis)) => ergebnis,
        Ok(Err(_)) => Err("Kanal wurde geschlossen, bevor Ergebnis empfangen wurde.".to_string()),
        Err(_) => Err("Zeitüberschreitung beim Auswerten des JavaScript.".to_string()),
    }
}
