// Landesrecht-Import – macOS-spezifische Auswertung von JavaScript im
// nativen WKWebView. Dies ist die einzige der drei Plattform-Implementierungen,
// die tatsächlich lokal getestet werden kann (Entwicklung erfolgt auf macOS).
//
// Zugriff über WebviewWindow::with_webview(...): platform_webview.inner()
// liefert auf macOS nur *mut c_void, das per objc2/objc2-web-kit als
// &WKWebView interpretiert wird. evaluateJavaScript:completionHandler: ist
// ein klassischer ObjC-Completion-Handler (kein Future) – die Brücke zu
// async Rust erfolgt über einen lokalen oneshot-Kanal.
//
// ACHTUNG (Risiko, siehe Plan): Die exakte Methoden-Signatur von
// objc2-web-kit für evaluateJavaScript:completionHandler: kann sich je nach
// Crate-Version leicht unterscheiden (insbesondere der msg_send!-Aufruf
// sowie die genauen Typen von Ergebnis/Fehler im Block). Bitte nach
// `cargo check` lokal prüfen und ggf. anpassen – hier nicht kompilierbar
// verifizierbar (kein Rust-Toolchain im Erstellungs-Environment).

#![cfg(target_os = "macos")]

use block2::RcBlock;
use objc2_foundation::NSString;
use objc2_web_kit::WKWebView;
use std::sync::Mutex;
use tokio::sync::oneshot;
use tokio::time::{timeout, Duration};

const TIMEOUT: Duration = Duration::from_secs(15);

pub async fn javascript_auswerten(
    fenster: &tauri::WebviewWindow,
    skript: &str,
) -> Result<String, String> {
    let (sender, receiver) = oneshot::channel::<Result<String, String>>();
    let skript = skript.to_string();
    // WKWebView ruft den Completion-Handler genau einmal auf; die Mutex<Option<_>>
    // -Hülle ist trotzdem nötig, weil der Block als Fn (nicht FnOnce) registriert
    // werden muss, oneshot::Sender::send aber den Sender per Wert konsumiert.
    let sender = Mutex::new(Some(sender));

    fenster
        .with_webview(move |platform_webview| {
            let webview_ptr = platform_webview.inner() as *mut WKWebView;
            // SAFETY: Tauri hält den WKWebView-Zeiger während dieses Hauptthread-Closures gültig.
            let webview: &WKWebView = unsafe { &*webview_ptr };

            let ns_skript = NSString::from_str(&skript);

            let handler = RcBlock::new(
                move |ergebnis: *mut objc2::runtime::AnyObject,
                      fehler: *mut objc2::runtime::AnyObject| {
                    let Some(sender) = crate::sperren::sperren(&sender).take() else {
                        return;
                    };
                    // SAFETY: WebKit hält die Callback-Objekte während des Aufrufs gültig.
                    // Die internen Skripte liefern ausschließlich Strings (NSString);
                    // vor dem Dereferenzieren wird das Ergebnis auf null geprüft.
                    unsafe {
                        if !fehler.is_null() {
                            let _ = sender.send(Err(
                                "JavaScript-Auswertung meldete einen Fehler.".to_string()
                            ));
                        } else if !ergebnis.is_null() {
                            let ns_ergebnis: &NSString = &*(ergebnis as *const NSString);
                            let _ = sender.send(Ok(ns_ergebnis.to_string()));
                        } else {
                            let _ = sender.send(Ok(String::new()));
                        }
                    }
                },
            );

            // SAFETY: WKWebView und NSString leben während des Hauptthread-Aufrufs;
            // der kopierte Completion-Block wird von WebKit bis zum Rückruf gehalten.
            unsafe {
                let _: () = objc2::msg_send![
                    webview,
                    evaluateJavaScript: &*ns_skript,
                    completionHandler: &*handler
                ];
            }
        })
        .map_err(|e| format!("Zugriff auf natives WebView fehlgeschlagen: {e}"))?;

    match timeout(TIMEOUT, receiver).await {
        Ok(Ok(ergebnis)) => ergebnis,
        Ok(Err(_)) => Err("Kanal wurde geschlossen, bevor Ergebnis empfangen wurde.".to_string()),
        Err(_) => Err("Zeitüberschreitung beim Auswerten des JavaScript.".to_string()),
    }
}
