// Flüchtiger App-Startfortschritt; Facharbeit und Dateien bleiben im Frontend.
use std::sync::Mutex;
use tauri::{Emitter, Manager};

/// Anzahl der Startaufgaben; muss `STARTAUFGABEN_ANZAHL` in
/// `src/hooks/app-start/startaufgaben.ts` entsprechen (automatisch geprüft).
pub(crate) const STARTAUFGABEN_ANZAHL: u8 = 5;

#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub struct Auftrag {
    kennung: u64,
    schritt: u8,
}
#[derive(Default)]
struct Zustand {
    fenster: Vec<(String, String)>,
    besitzer: Option<(String, String)>,
    kennung: u64,
    schritt: u8,
}
#[derive(Default)]
pub struct Startaufgaben(Mutex<Zustand>);

impl Zustand {
    fn auftrag(&self, label: &str, anmeldung: &str) -> Option<Auftrag> {
        (self.schritt < STARTAUFGABEN_ANZAHL
            && self
                .besitzer
                .as_ref()
                .is_some_and(|(l, a)| l == label && a == anmeldung))
        .then_some(Auftrag {
            kennung: self.kennung,
            schritt: self.schritt,
        })
    }
    fn waehlen(&mut self) {
        if self.besitzer.is_none() && self.schritt < STARTAUFGABEN_ANZAHL {
            self.besitzer = self.fenster.first().cloned();
            self.kennung += 1;
        }
    }
    fn anmelden(&mut self, label: &str, anmeldung: &str) -> Option<Auftrag> {
        if self
            .fenster
            .iter()
            .any(|(l, a)| l == label && a != anmeldung)
        {
            self.entfernen(label, None);
        }
        if !self
            .fenster
            .iter()
            .any(|(l, a)| l == label && a == anmeldung)
        {
            self.fenster.push((label.into(), anmeldung.into()));
        }
        self.waehlen();
        self.auftrag(label, anmeldung)
    }
    fn entfernen(&mut self, label: &str, anmeldung: Option<&str>) {
        let passt = |l: &str, a: &str| l == label && anmeldung.is_none_or(|erwartet| erwartet == a);
        self.fenster.retain(|(l, a)| !passt(l, a));
        if self.besitzer.as_ref().is_some_and(|(l, a)| passt(l, a)) {
            self.besitzer = None;
            self.waehlen();
        }
    }
    fn abschliessen(&mut self, label: &str, anmeldung: &str, auftrag: &Auftrag) -> Option<Auftrag> {
        if self.auftrag(label, anmeldung).as_ref() != Some(auftrag) {
            return None;
        }
        self.schritt += 1;
        self.auftrag(label, anmeldung)
    }
}

#[tauri::command]
pub fn startaufgaben_anmelden<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<Startaufgaben>,
    anmeldung: String,
) -> Result<Option<Auftrag>, String> {
    #[cfg(desktop)]
    if !crate::fenster::ist_hauptfenster(window.label()) {
        return Err("Kein Hauptfenster".into());
    }
    Ok(crate::sperren::sperren(&state.0).anmelden(window.label(), &anmeldung))
}

#[tauri::command]
pub fn startaufgaben_lesen<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<Startaufgaben>,
    anmeldung: String,
) -> Option<Auftrag> {
    crate::sperren::sperren(&state.0).auftrag(window.label(), &anmeldung)
}

#[tauri::command]
pub fn startaufgaben_abschliessen<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<Startaufgaben>,
    anmeldung: String,
    kennung: u64,
    schritt: u8,
) -> Option<Auftrag> {
    let auftrag = crate::sperren::sperren(&state.0).abschliessen(
        window.label(),
        &anmeldung,
        &Auftrag { kennung, schritt },
    );
    benachrichtigen(window.app_handle(), &state);
    auftrag
}

#[tauri::command]
pub fn startaufgaben_fortschritt(state: tauri::State<Startaufgaben>) -> u8 {
    crate::sperren::sperren(&state.0).schritt
}

fn benachrichtigen<R: tauri::Runtime>(app: &tauri::AppHandle<R>, state: &Startaufgaben) {
    let fenster = crate::sperren::sperren(&state.0).fenster.clone();
    for (label, _) in fenster {
        let _ = app.emit_to(label, "startaufgaben-verfuegbar", ());
    }
}

#[tauri::command]
pub fn startaufgaben_abmelden<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<Startaufgaben>,
    anmeldung: String,
) {
    crate::sperren::sperren(&state.0).entfernen(window.label(), Some(&anmeldung));
    benachrichtigen(window.app_handle(), &state);
}

pub fn fenster_zerstoert<R: tauri::Runtime>(window: &tauri::Window<R>) {
    let state = window.state::<Startaufgaben>();
    crate::sperren::sperren(&state.0).entfernen(window.label(), None);
    benachrichtigen(window.app_handle(), &state);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zwei_fenster_erhalten_jeden_schritt_nur_einmal() {
        let mut z = Zustand::default();
        assert_eq!(z.anmelden("main", "a").unwrap().schritt, 0);
        assert_eq!(z.anmelden("zweites", "b"), None);
        let mut auftrag = z.auftrag("main", "a").unwrap();
        for schritt in 0..STARTAUFGABEN_ANZAHL {
            assert_eq!(auftrag.schritt, schritt);
            let naechster = z.abschliessen("main", "a", &auftrag);
            if schritt < STARTAUFGABEN_ANZAHL - 1 {
                auftrag = naechster.unwrap();
            } else {
                assert_eq!(naechster, None);
            }
        }
        assert_eq!(z.anmelden("drittes", "c"), None);
    }

    #[test]
    fn zerstoerter_besitzer_wird_sofort_ersetzt_alter_abschluss_ist_wirkungslos() {
        let mut z = Zustand::default();
        let alt = z.anmelden("main", "a").unwrap();
        z.anmelden("zweites", "b");
        let laufend = z.abschliessen("main", "a", &alt).unwrap();
        z.entfernen("main", None);
        let neu = z.auftrag("zweites", "b").unwrap();
        assert_eq!(neu.schritt, 1);
        assert_ne!(neu.kennung, laufend.kennung);
        assert_eq!(z.abschliessen("main", "a", &laufend), None);
        assert_eq!(z.auftrag("zweites", "b"), Some(neu));
    }

    #[test]
    fn ohne_offenes_fenster_setzt_naechste_anmeldung_den_stand_fort() {
        let mut z = Zustand::default();
        let a = z.anmelden("main", "a").unwrap();
        z.abschliessen("main", "a", &a);
        z.entfernen("main", None);
        let neu = z.anmelden("neues", "b").unwrap();
        assert_eq!(neu.schritt, 1);
        z.entfernen("neues", Some("veraltete-anmeldung"));
        assert_eq!(z.auftrag("neues", "b"), Some(neu));
    }
    #[test]
    fn native_fenster_uebernehmen_nach_zerstoerung_und_wehren_alte_bestaetigungen_ab() {
        let app = tauri::test::mock_builder()
            .manage(Startaufgaben::default())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let main = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        let zweites = tauri::WebviewWindowBuilder::new(&app, "zweites", Default::default())
            .build()
            .unwrap();
        let alt = startaufgaben_anmelden(main.clone(), app.state(), "a".into())
            .unwrap()
            .unwrap();
        assert_eq!(
            startaufgaben_anmelden(zweites.clone(), app.state(), "b".into()).unwrap(),
            None
        );
        let laufend = startaufgaben_abschliessen(
            main.clone(),
            app.state(),
            "a".into(),
            alt.kennung,
            alt.schritt,
        )
        .unwrap();
        fenster_zerstoert(&main.as_ref().window());
        let neu = startaufgaben_lesen(zweites.clone(), app.state(), "b".into()).unwrap();
        assert_eq!(neu.schritt, 1);
        assert_ne!(neu.kennung, laufend.kennung);
        assert_eq!(
            startaufgaben_abschliessen(
                main,
                app.state(),
                "a".into(),
                laufend.kennung,
                laufend.schritt
            ),
            None
        );
        assert_eq!(
            startaufgaben_lesen(zweites.clone(), app.state(), "b".into()),
            Some(neu)
        );
        fenster_zerstoert(&zweites.as_ref().window());
        let neues = tauri::WebviewWindowBuilder::new(&app, "neues", Default::default())
            .build()
            .unwrap();
        assert_eq!(
            startaufgaben_anmelden(neues, app.state(), "c".into())
                .unwrap()
                .unwrap()
                .schritt,
            1
        );
    }

    #[test]
    fn hilfsfenster_erhalten_keine_startaufgaben() {
        let app = tauri::test::mock_builder()
            .manage(Startaufgaben::default())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let hilfe = tauri::WebviewWindowBuilder::new(&app, "einstellungen", Default::default())
            .build()
            .unwrap();
        assert!(startaufgaben_anmelden(hilfe, app.state(), "a".into()).is_err());
    }
    #[test]
    fn neue_anmeldung_desselben_fensters_verliert_den_fortschritt_nicht() {
        let mut z = Zustand::default();
        let a = z.anmelden("main", "alt").unwrap();
        z.abschliessen("main", "alt", &a);
        let neu = z.anmelden("main", "neu");
        assert_eq!(neu.as_ref().map(|a| a.schritt), Some(1));
        z.entfernen("main", Some("alt"));
        assert_eq!(z.auftrag("main", "neu"), neu);
    }
}
