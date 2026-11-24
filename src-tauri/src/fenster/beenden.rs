// fenster/beenden.rs
//
// Beenden der App über die Beenden-Anfrage (beenden_anfrage.rs): Nur wenn
// alle Fenster bereit sind, wird beendet; sonst bleibt alles offen.
//
// Beenden-Wege:
// - macOS: „LexLata beenden“ (⌘Q, natives `terminate:`), Dock „Beenden“ und
//   Abmelden/Herunterfahren fragen `applicationShouldTerminate:` am
//   App-Delegate. Tao beantwortet das nicht; `beenden_abfangen` ergänzt die
//   Methode, lehnt das sofortige Beenden ab und startet die Beenden-Anfrage.
// - Windows/Linux: Das Schließen des letzten Hauptfensters fragt
//   `hauptfenster_schliessen_freigeben` (useFensterRestore.ts).
// Der eigene Exit (`app.exit(0)`) trägt einen Code und läuft daher nicht
// erneut über die Anfrage (siehe `beenden_verhindern` in lib.rs); ebenso
// der Update-Neustart (`RESTART_EXIT_CODE`) und der Exit des NSIS-Installers.
use super::beenden_anfrage::{
    BeendenAnfrage, BeendenErgebnis, BeendenFenster, BeendenFrist, Frist, TauriFenster,
};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;

/// Gesetzt, sobald nach „alle bereit“ beendet wird.
static FREIGEGEBEN: AtomicBool = AtomicBool::new(false);

/// Gibt das Beenden frei, damit ein abschließender Exit (auch der
/// Update-Neustart) auf macOS nicht erneut abgefangen wird.
pub(crate) fn beenden_freigeben() {
    FREIGEGEBEN.store(true, Ordering::SeqCst);
}

/// `ExitRequested`: Tauri meldet `code=None` nur nach dem letzten zerstörten
/// Fenster (dann ist niemand mehr anzufragen); macOS bleibt dann offen.
/// `app.exit(code)` und der Update-Neustart (`RESTART_EXIT_CODE`) tragen
/// einen Code und laufen durch, ohne erneut anzufragen.
pub(crate) fn beenden_verhindern(macos: bool, code: Option<i32>) -> bool {
    macos && code.is_none()
}

/// Beendet nur, wenn alle Fenster bereit sind; `true` bei Beenden.
pub(crate) async fn beenden_wenn_bereit(
    anfrage: &BeendenAnfrage,
    fenster: &impl BeendenFenster,
    frist: &impl BeendenFrist,
    beenden: impl FnOnce(),
) -> bool {
    match anfrage.anfragen(fenster, frist).await {
        BeendenErgebnis::AlleBereit(vorbereitet) => {
            beenden_freigeben();
            beenden();
            vorbereitet.abschliessen();
            true
        }
        BeendenErgebnis::Abbruch => false,
        BeendenErgebnis::LaeuftBereits => {
            eprintln!("Beenden: Eine Beenden-Anfrage läuft bereits.");
            false
        }
    }
}

/// `true`: Das Hauptfenster `label` schließt wie bisher. `false`: Es war das
/// letzte Hauptfenster (nicht macOS); die Beenden-Anfrage lief und die App
/// beendet bzw. bleibt nach Abbruch offen.
async fn hauptfenster_schliessen(
    anfrage: &BeendenAnfrage,
    fenster: &impl BeendenFenster,
    frist: &impl BeendenFrist,
    beenden: impl FnOnce(),
    label: &str,
    macos: bool,
) -> bool {
    let weitere = fenster
        .offene_fenster()
        .iter()
        .any(|anderes| anderes != label && super::ist_hauptfenster(anderes));
    if macos || weitere {
        return true;
    }
    beenden_wenn_bereit(anfrage, fenster, frist, beenden).await;
    false
}

#[tauri::command]
pub async fn hauptfenster_schliessen_freigeben<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    window: tauri::WebviewWindow<R>,
) -> bool {
    hauptfenster_schliessen(
        &app.state::<BeendenAnfrage>(),
        &TauriFenster(&app),
        &Frist,
        || app.exit(0),
        window.label(),
        cfg!(target_os = "macos"),
    )
    .await
}

/// macOS: `applicationShouldTerminate:` am App-Delegate ergänzen (einmal, im Setup).
#[cfg(target_os = "macos")]
pub(crate) fn beenden_abfangen(app: &tauri::AppHandle) {
    macos::abfangen(app);
}

#[cfg(target_os = "macos")]
mod macos {
    use objc2::runtime::{AnyObject, Imp, Sel};
    use objc2::{msg_send, sel};
    use std::sync::atomic::Ordering;
    use std::sync::OnceLock;

    static APP: OnceLock<tauri::AppHandle> = OnceLock::new();
    const NS_TERMINATE_CANCEL: usize = 0;
    const NS_TERMINATE_NOW: usize = 1;

    extern "C-unwind" fn soll_beenden(
        _delegate: *mut AnyObject,
        _sel: Sel,
        _sender: *mut AnyObject,
    ) -> usize {
        let Some(app) = APP.get() else {
            return NS_TERMINATE_NOW;
        };
        if super::FREIGEGEBEN.load(Ordering::SeqCst) {
            return NS_TERMINATE_NOW;
        }
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            use super::{BeendenAnfrage, Frist, TauriFenster};
            use tauri::Manager;
            super::beenden_wenn_bereit(
                &app.state::<BeendenAnfrage>(),
                &TauriFenster(&app),
                &Frist,
                || app.exit(0),
            )
            .await;
        });
        NS_TERMINATE_CANCEL
    }

    pub(super) fn abfangen(app: &tauri::AppHandle) {
        if APP.set(app.clone()).is_err() {
            return;
        }
        let Some(mtm) = objc2_foundation::MainThreadMarker::new() else {
            eprintln!("Beenden: Abfangen nur im Hauptthread möglich.");
            return;
        };
        let ns_app = objc2_app_kit::NSApplication::sharedApplication(mtm);
        // SAFETY: `delegate` ist ein gewöhnlicher Getter von NSApplication.
        let delegate: *mut AnyObject = unsafe { msg_send![&*ns_app, delegate] };
        // SAFETY: Der Delegate lebt so lange wie die App.
        let Some(delegate) = (unsafe { delegate.as_ref() }) else {
            eprintln!("Beenden: Kein App-Delegate; natives Beenden bleibt ungeschützt.");
            return;
        };
        let klasse = delegate.class();
        type Methode = extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject) -> usize;
        let funktion: Methode = soll_beenden;
        // SAFETY: Signatur entspricht `- (NSApplicationTerminateReply)
        // applicationShouldTerminate:(NSApplication *)sender` ("Q@:@").
        let ergaenzt = unsafe {
            objc2::ffi::class_addMethod(
                klasse as *const _ as *mut _,
                sel!(applicationShouldTerminate:),
                std::mem::transmute::<Methode, Imp>(funktion),
                c"Q@:@".as_ptr(),
            )
        };
        if !ergaenzt.as_bool() {
            eprintln!("Beenden: applicationShouldTerminate: nicht ergänzt.");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::{Cell, RefCell};
    use std::future::Future;

    struct TestFenster<'a> {
        anfrage: &'a BeendenAnfrage,
        bereit: bool,
        labels: &'a [&'a str],
        protokoll: RefCell<Vec<&'static str>>,
    }

    impl<'a> TestFenster<'a> {
        fn mit(anfrage: &'a BeendenAnfrage, bereit: bool, labels: &'a [&'a str]) -> Self {
            Self {
                anfrage,
                bereit,
                labels,
                protokoll: RefCell::new(Vec::new()),
            }
        }
    }

    impl BeendenFenster for TestFenster<'_> {
        fn offene_fenster(&self) -> Vec<String> {
            self.labels.iter().map(|label| label.to_string()).collect()
        }
        fn anfrage_senden(&self, label: &str, id: u64) {
            self.protokoll.borrow_mut().push("anfrage");
            self.anfrage.antworten(label, id, self.bereit);
        }
        fn abbruch_senden(&self, _label: &str, _id: u64) {}
    }

    fn ausfuehren<F: Future>(future: F) -> F::Output {
        tauri::async_runtime::block_on(future)
    }

    #[test]
    fn nur_automatisches_beenden_auf_macos_wird_verhindert() {
        assert!(beenden_verhindern(true, None));
        // Eigener Exit nach der Beenden-Anfrage und Update-Neustart laufen durch.
        for code in [Some(0), Some(1), Some(7), Some(tauri::RESTART_EXIT_CODE)] {
            assert!(!beenden_verhindern(true, code));
            assert!(!beenden_verhindern(false, code));
        }
        assert!(!beenden_verhindern(false, None));
    }

    #[test]
    fn beenden_fragt_an_und_beendet_nur_bei_alle_bereit() {
        let anfrage = BeendenAnfrage::default();
        for bereit in [true, false] {
            let fenster = TestFenster::mit(&anfrage, bereit, &["main"]);
            let beendet = ausfuehren(beenden_wenn_bereit(&anfrage, &fenster, &Frist, || {
                fenster.protokoll.borrow_mut().push("exit");
            }));
            assert_eq!(beendet, bereit);
            let erwartet = if bereit {
                vec!["anfrage", "exit"]
            } else {
                vec!["anfrage"]
            };
            assert_eq!(*fenster.protokoll.borrow(), erwartet);
        }
    }

    #[test]
    fn letztes_hauptfenster_unter_windows_linux_fuehrt_ueber_die_anfrage() {
        let anfrage = BeendenAnfrage::default();
        for bereit in [true, false] {
            let fenster = TestFenster::mit(&anfrage, bereit, &["main"]);
            let beendet = Cell::new(false);
            assert!(!ausfuehren(hauptfenster_schliessen(
                &anfrage,
                &fenster,
                &Frist,
                || beendet.set(true),
                "main",
                false,
            )));
            assert_eq!(*fenster.protokoll.borrow(), vec!["anfrage"]);
            assert_eq!(beendet.get(), bereit);
        }
    }

    #[test]
    fn weitere_hauptfenster_oder_macos_schliessen_wie_bisher() {
        let anfrage = BeendenAnfrage::default();
        for (macos, labels) in [(true, &["main"][..]), (false, &["main", "fenster-2"][..])] {
            let fenster = TestFenster::mit(&anfrage, true, labels);
            assert!(ausfuehren(hauptfenster_schliessen(
                &anfrage,
                &fenster,
                &Frist,
                || panic!("Die App darf nicht beendet werden"),
                "main",
                macos,
            )));
            assert!(fenster.protokoll.borrow().is_empty());
        }
    }
}
