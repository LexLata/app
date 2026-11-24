// Kurzlebige, fenstergebundene Aufträge. Ereignisse wecken nur den Empfänger;
// die einzige Auftragskopie bleibt bis zur kennungsgebundenen Bestätigung hier.
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

#[derive(Clone, serde::Serialize, serde::Deserialize, Debug, PartialEq)]
pub struct Gesetzesreferenz {
    kurztitel: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    normgeber: Option<String>,
}
#[derive(Clone, serde::Serialize, serde::Deserialize, Debug, PartialEq)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum Ziel {
    Norm {
        bezeichnung: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        praefix: Option<Vec<String>>,
    },
    Ueberschrift {
        gliederungskennzahl: String,
    },
}
#[derive(Clone, serde::Serialize, serde::Deserialize, Debug, PartialEq)]
pub struct InternerAuftrag {
    gesetz: Gesetzesreferenz,
    ziel: Ziel,
}
#[derive(Clone, serde::Serialize, serde::Deserialize, Debug, PartialEq)]
#[serde(untagged)]
pub enum Auftrag {
    Intern(InternerAuftrag),
    Oeffnen { r#type: String, suchtext: String },
}
#[derive(Clone, serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Uebergabe {
    kennung: u64,
    auftrag: Auftrag,
    neues_fenster: bool,
}
#[derive(Default)]
struct Fenster {
    bereit: Option<String>,
    abgemeldete: HashSet<String>,
    reserviert: bool,
    neues_fenster: bool,
    auftrag: Option<Uebergabe>,
    fokus_zurueck: Option<String>,
}
#[derive(Default)]
struct Zustand {
    kennung: u64,
    oeffnen_link_beim_app_start_gelesen: bool,
    oeffnen_link_os_empfangen: bool,
    fenster: HashMap<String, Fenster>,
}
#[derive(Default)]
pub struct Navigation(Mutex<Zustand>);
impl Navigation {
    // Auswahl und Reservierung unter derselben Sperre; Erzeugung erst danach.
    fn ablegen(
        &self,
        vorhanden: Option<String>,
        auftrag: Auftrag,
        sender: String,
    ) -> Result<(String, bool, bool), String> {
        let mut z = crate::sperren::sperren(&self.0);
        let reserviert = z
            .fenster
            .iter()
            .find(|(_, f)| f.reserviert)
            .map(|(l, _)| l.clone());
        z.kennung += 1;
        let kennung = z.kennung;
        let neu = vorhanden.is_none() && reserviert.is_none();
        let label = vorhanden
            .or(reserviert)
            .unwrap_or_else(|| format!("fenster-navigation-{kennung}"));
        let f = z.fenster.entry(label.clone()).or_default();
        if neu {
            f.reserviert = true;
            f.neues_fenster = true;
        }
        f.auftrag = Some(Uebergabe {
            kennung,
            auftrag,
            neues_fenster: f.neues_fenster,
        });
        f.fokus_zurueck = Some(sender);
        Ok((label, neu, f.bereit.is_some()))
    }
    fn uebergeben(
        &self,
        vorhanden: Option<String>,
        auftrag: Auftrag,
        sender: String,
        erzeugen: impl FnOnce(&str) -> Result<(), String>,
    ) -> Result<(String, bool), String> {
        let (label, neu, bereit) = self.ablegen(vorhanden, auftrag, sender)?;
        if neu {
            if let Err(e) = erzeugen(&label) {
                self.schliessen(&label);
                return Err(e);
            }
        }
        Ok((label, bereit))
    }
    pub fn ist_interner_start(&self, label: &str) -> bool {
        crate::sperren::sperren(&self.0)
            .fenster
            .get(label)
            .is_some_and(|f| f.reserviert)
    }
    pub fn schliessen(&self, label: &str) {
        crate::sperren::sperren(&self.0).fenster.remove(label);
    }
    fn lesen(&self, label: &str, anmeldung: &str) -> Result<Option<Uebergabe>, String> {
        let z = crate::sperren::sperren(&self.0);
        Ok(z.fenster
            .get(label)
            .filter(|f| f.bereit.as_deref() == Some(anmeldung))
            .and_then(|f| f.auftrag.clone()))
    }
    fn bereit(&self, label: &str, anmeldung: String) -> Result<Option<Uebergabe>, String> {
        let mut z = crate::sperren::sperren(&self.0);
        let f = z.fenster.entry(label.into()).or_default();
        if f.abgemeldete.contains(&anmeldung) {
            return Ok(None);
        }
        f.bereit = Some(anmeldung);
        f.reserviert = false;
        Ok(f.auftrag.clone())
    }
    fn pausieren(&self, label: &str, anmeldung: &str) -> Result<(), String> {
        let mut z = crate::sperren::sperren(&self.0);
        if let Some(f) = z.fenster.get_mut(label) {
            if f.bereit.as_deref() == Some(anmeldung) {
                f.bereit = None;
            }
        }
        Ok(())
    }
    fn bestaetigen(&self, label: &str, anmeldung: &str, kennung: u64) -> Result<(), String> {
        let mut z = crate::sperren::sperren(&self.0);
        if let Some(f) = z.fenster.get_mut(label) {
            if f.bereit.as_deref() == Some(anmeldung)
                && f.auftrag.as_ref().is_some_and(|a| a.kennung == kennung)
            {
                f.auftrag = None;
                f.neues_fenster = false;
            }
        }
        Ok(())
    }
    fn abmelden(&self, label: &str, anmeldung: &str) -> Result<(), String> {
        let mut z = crate::sperren::sperren(&self.0);
        let f = z.fenster.entry(label.into()).or_default();
        f.abgemeldete.insert(anmeldung.into());
        if f.bereit.as_deref() == Some(anmeldung) {
            f.bereit = None;
        }
        Ok(())
    }
}

pub fn benachrichtigen<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: &str,
) -> Result<(), String> {
    app.emit_to(label, "interne-navigation-vorhanden", ())
        .map_err(|e| e.to_string())
}
// Kein gespeicherter Fokusabschluss eines alten Auftrags: unmittelbar vor dem
// tatsächlichen Anzeigen wird immer die aktuelle Fokusabsicht gelesen.
fn anzeigen<R: tauri::Runtime>(app: &tauri::AppHandle<R>, label: &str) -> Result<bool, String> {
    if app.get_webview_window(label).is_none() {
        return Ok(false);
    }
    let fokus = crate::sperren::sperren(&app.state::<Navigation>().0)
        .fenster
        .get(label)
        .and_then(|f| f.fokus_zurueck.clone());
    if fokus.is_none() {
        return Ok(false);
    }
    if let Some(f) = app.get_webview_window(label) {
        f.unminimize().map_err(|e| e.to_string())?;
        f.show().map_err(|e| e.to_string())?;
    }
    // show kann selbst fokussieren. Auch ein auf dem macOS-Hauptthread
    // verzögert ausgeführter Abschluss liest erst dort die aktuelle Absicht.
    #[cfg(target_os = "macos")]
    if super::hat_native_fenster::<R>() {
        let handle = app.clone();
        let label = label.to_string();
        app.run_on_main_thread(move || {
            let sender = crate::sperren::sperren(&handle.state::<Navigation>().0)
                .fenster
                .get(&label)
                .and_then(|f| f.fokus_zurueck.clone());
            let Some(sender) = sender else {
                return;
            };
            if handle.get_webview_window(&label).is_none() {
                return;
            }
            let Some(f) =
                handle.get_webview_window(if sender.is_empty() { &label } else { &sender })
            else {
                return;
            };
            if sender.is_empty() {
                use objc2_app_kit::{NSApplication, NSWindow, NSWindowCollectionBehavior};
                use objc2_foundation::MainThreadMarker;
                let Some(mtm) = MainThreadMarker::new() else {
                    return;
                };
                let Ok(ptr) = f.ns_window() else {
                    return;
                };
                // SAFETY: Lebendes NSWindow unmittelbar zuvor auf dem Hauptthread ermittelt.
                let ns_fenster = unsafe { &*(ptr as *mut NSWindow) };
                ns_fenster.setCollectionBehavior(NSWindowCollectionBehavior::MoveToActiveSpace);
                NSApplication::sharedApplication(mtm).activate();
                ns_fenster.makeKeyAndOrderFront(None);
            } else {
                let _ = f.set_focus();
            }
        })
        .map_err(|e| e.to_string())?;
        return Ok(true);
    }
    // Auch MockRuntime auf macOS durchläuft Anzeigen und Fokusübergabe,
    // jedoch ausschließlich über die sicheren Runtime-Operationen.
    {
        let aktuell = crate::sperren::sperren(&app.state::<Navigation>().0)
            .fenster
            .get(label)
            .and_then(|f| f.fokus_zurueck.clone());
        if let Some(sender) = aktuell {
            if let Some(f) = app.get_webview_window(if sender.is_empty() { label } else { &sender })
            {
                f.set_focus().map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(true)
}
// Während der Initialisierung können Hauptfenster vorübergehend unsichtbar
// sein. Vorhandene sichtbare Hauptfenster haben Vorrang; ohne sie bleibt
// die bisherige Auswahl erhalten.
fn internes_zielfenster_label<'a>(
    fenster: impl IntoIterator<Item = (&'a str, bool)>,
) -> Option<String> {
    let fenster: Vec<_> = fenster.into_iter().collect();
    super::tiefenlink::haupt_fenster_label(
        fenster
            .iter()
            .filter(|(_, sichtbar)| *sichtbar)
            .map(|(label, _)| (*label, false)),
    )
    .or_else(|| {
        super::tiefenlink::haupt_fenster_label(fenster.iter().map(|(label, _)| (*label, false)))
    })
}
#[tauri::command]
pub fn interne_navigation_senden<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    aufrufer: tauri::WebviewWindow<R>,
    auftrag: Auftrag,
) -> Result<(), String> {
    let fenster = app.webview_windows();
    let vorhanden = internes_zielfenster_label(
        fenster
            .iter()
            .map(|(label, f)| (label.as_str(), f.is_visible().unwrap_or(false))),
    );
    let (label, bereit) = app.state::<Navigation>().uebergeben(
        vorhanden,
        auftrag,
        aufrufer.label().into(),
        |label| super::neues_fenster(&app, Some(label.into()), None),
    )?;
    if bereit {
        anzeigen(&app, &label)?;
    }
    if bereit {
        benachrichtigen(&app, &label)?;
    }
    Ok(())
}
#[tauri::command]
pub fn interne_navigation_bereit<R: tauri::Runtime>(
    fenster: tauri::WebviewWindow<R>,
    anmeldung: String,
    bereit: Option<bool>,
) -> Result<Option<Uebergabe>, String> {
    let navigation = fenster.state::<Navigation>();
    if bereit == Some(false) {
        navigation.pausieren(fenster.label(), &anmeldung)?;
        Ok(None)
    } else {
        navigation.bereit(fenster.label(), anmeldung)
    }
}

#[tauri::command]
pub fn interne_navigation_lesen<R: tauri::Runtime>(
    fenster: tauri::WebviewWindow<R>,
    anmeldung: String,
) -> Result<Option<Uebergabe>, String> {
    fenster
        .state::<Navigation>()
        .lesen(fenster.label(), &anmeldung)
}
#[tauri::command]
pub fn interne_navigation_bestaetigen<R: tauri::Runtime>(
    fenster: tauri::WebviewWindow<R>,
    anmeldung: String,
    kennung: u64,
) -> Result<(), String> {
    fenster
        .state::<Navigation>()
        .bestaetigen(fenster.label(), &anmeldung, kennung)
}
#[tauri::command]
pub fn interne_navigation_abmelden<R: tauri::Runtime>(
    fenster: tauri::WebviewWindow<R>,
    anmeldung: String,
) -> Result<(), String> {
    fenster
        .state::<Navigation>()
        .abmelden(fenster.label(), &anmeldung)
}
#[tauri::command]
pub fn interne_navigation_anzeigen<R: tauri::Runtime>(
    fenster: tauri::WebviewWindow<R>,
    anmeldung: Option<String>,
    kennung: Option<u64>,
) -> Result<bool, String> {
    if let (Some(anmeldung), Some(kennung)) = (anmeldung, kennung) {
        let aktuell = fenster
            .state::<Navigation>()
            .lesen(fenster.label(), &anmeldung)?;
        if aktuell.is_none_or(|a| a.kennung != kennung) {
            return Ok(false);
        }
    }
    anzeigen(fenster.app_handle(), fenster.label())
}

// Native OS-Empfangsgrenze: Gesetzes-/Normlinks bleiben beim bisherigen Transport.
pub fn oeffnen_link_aus_url_empfangen<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    url: &str,
    beim_app_start: bool,
) -> Result<bool, String> {
    let Some(suchtext) = super::tiefenlink::parse_oeffnen_link(url) else {
        return Ok(false);
    };
    oeffnen_link_empfangen(app, suchtext, beim_app_start)?;
    Ok(true)
}

// OS und App-Start legen ausschließlich in denselben Speicher wie interne Klicks ab.
pub fn oeffnen_link_empfangen<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    suchtext: String,
    beim_app_start: bool,
) -> Result<(), String> {
    {
        let navigation = app.state::<Navigation>();
        let mut z = crate::sperren::sperren(&navigation.0);
        if beim_app_start {
            if z.oeffnen_link_beim_app_start_gelesen || z.oeffnen_link_os_empfangen || z.kennung > 0
            {
                return Ok(());
            }
            z.oeffnen_link_beim_app_start_gelesen = true;
        } else {
            z.oeffnen_link_os_empfangen = true;
        }
    }
    let vorhanden = super::tiefenlink::haupt_fenster_label(
        app.webview_windows()
            .iter()
            .map(|(l, f)| (l.as_str(), f.is_focused().unwrap_or(false))),
    );
    let (label, bereit) = app.state::<Navigation>().uebergeben(
        vorhanden,
        Auftrag::Oeffnen {
            r#type: "oeffnen".into(),
            suchtext,
        },
        String::new(),
        |label| super::neues_fenster(app, Some(label.into()), None),
    )?;
    if beim_app_start {
        let navigation = app.state::<Navigation>();
        if let Some(f) = crate::sperren::sperren(&navigation.0)
            .fenster
            .get_mut(&label)
        {
            f.neues_fenster = true;
            if let Some(a) = &mut f.auftrag {
                a.neues_fenster = true;
            }
        };
    }
    if bereit {
        anzeigen(app, &label)?;
        benachrichtigen(app, &label)?;
    }
    Ok(())
}
#[tauri::command]
pub fn oeffnen_link_navigation_senden<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    fenster: tauri::WebviewWindow<R>,
    auftrag: Auftrag,
    beim_app_start: bool,
) -> Result<(), String> {
    if beim_app_start && fenster.label() != "main" {
        return Ok(());
    }
    match auftrag {
        Auftrag::Oeffnen { r#type, suchtext }
            if r#type == "oeffnen" && !suchtext.trim().is_empty() =>
        {
            oeffnen_link_empfangen(&app, suchtext, beim_app_start)
        }
        _ => Err("Ungültiger Suchauftrag".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ziehvorschau_zaehlt_nie_als_internes_zielfenster() {
        assert_eq!(internes_zielfenster_label([("ziehvorschau", true)]), None);
        assert_eq!(
            internes_zielfenster_label([("ziehvorschau", true), ("main", false)]),
            Some("main".into())
        );
    }
    #[test]
    fn simulierte_fenster_erzeugen_und_anzeigen_ohne_native_zeigerzugriffe() {
        let app = tauri::test::mock_builder()
            .manage(Navigation::default())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        // Auf macOS muss die echte Fenstererzeugungsgrenze ebenfalls ohne
        // AppKit-Zugriff funktionieren; der Test wird auf keiner Plattform ignoriert.
        super::super::neues_fenster(app.handle(), Some("main".into()), None).unwrap();
        let main = app.get_webview_window("main").unwrap();
        assert!(!interne_navigation_anzeigen(main.clone(), None, None).unwrap());
        oeffnen_link_empfangen(app.handle(), "433 BGB".into(), false).unwrap();
        let n = app.state::<Navigation>();
        let a = n.bereit("main", "sitzung".into()).unwrap().unwrap();
        assert!(
            interne_navigation_anzeigen(main, Some("sitzung".into()), Some(a.kennung)).unwrap()
        );
        assert_eq!(
            n.lesen("main", "sitzung").unwrap().unwrap().kennung,
            a.kennung
        );
        n.bestaetigen("main", "sitzung", a.kennung).unwrap();
        assert!(n.lesen("main", "sitzung").unwrap().is_none());
    }
    fn auftrag(kennung: &str) -> Auftrag {
        Auftrag::Intern(InternerAuftrag {
            gesetz: Gesetzesreferenz {
                kurztitel: "BGB".into(),
                normgeber: Some("Bund".into()),
            },
            ziel: Ziel::Ueberschrift {
                gliederungskennzahl: kennung.into(),
            },
        })
    }
    #[test]
    fn reservierung_letzter_auftrag_und_bestaetigung() {
        let n = Navigation::default();
        let (label, neu, bereit) = n
            .ablegen(None, auftrag("010"), "markierungskonflikte".into())
            .unwrap();
        assert!(neu);
        assert!(!bereit);
        let (label2, neu2, _) = n
            .ablegen(None, auftrag("020"), "markierungskonflikte".into())
            .unwrap();
        assert_eq!(label, label2);
        assert!(!neu2);
        let a = n.bereit(&label, "sitzung".into()).unwrap().unwrap();
        assert_eq!(a.auftrag, auftrag("020"));
        assert!(a.neues_fenster);
        n.ablegen(
            Some(label.clone()),
            auftrag("030"),
            "markierungskonflikte".into(),
        )
        .unwrap();
        n.bestaetigen(&label, "sitzung", a.kennung).unwrap();
        let b = n.lesen(&label, "sitzung").unwrap().unwrap();
        assert_eq!(b.auftrag, auftrag("030"));
        n.pausieren(&label, "sitzung").unwrap();
        assert!(n.lesen(&label, "sitzung").unwrap().is_none());
        assert_eq!(
            n.bereit(&label, "sitzung".into()).unwrap().unwrap().kennung,
            b.kennung
        );
        assert!(n.lesen("anderes-fenster", "sitzung").unwrap().is_none());
        n.bereit(&label, "neu".into()).unwrap();
        n.abmelden(&label, "sitzung").unwrap();
        assert!(n.bereit(&label, "sitzung".into()).unwrap().is_none());
        n.bestaetigen(&label, "sitzung", b.kennung).unwrap();
        assert!(n.lesen(&label, "sitzung").unwrap().is_none());
        assert!(n.lesen(&label, "neu").unwrap().is_some());
        n.bestaetigen(&label, "neu", b.kennung).unwrap();
        assert!(n.lesen(&label, "neu").unwrap().is_none());
        n.schliessen(&label);
        assert!(n.0.lock().unwrap().fenster.is_empty());
    }
    #[test]
    fn ablage_vor_erzeugung_und_auswertbarer_erzeugungsfehler() {
        let n = Navigation::default();
        let fehler = n.uebergeben(None, auftrag("010"), "sender".into(), |label| {
            // Die echte Übergabefunktion ruft den Erzeuger ohne Sperre auf.
            let z = n.0.lock().unwrap();
            assert_eq!(
                z.fenster[label].auftrag.as_ref().unwrap().auftrag,
                auftrag("010")
            );
            assert!(z.fenster[label].reserviert);
            drop(z);
            let (zweites_label, neu, _) = n.ablegen(None, auftrag("020"), "sender".into()).unwrap();
            assert_eq!(label, zweites_label);
            assert!(!neu);
            Err("Erzeugung fehlgeschlagen".into())
        });
        assert_eq!(fehler.unwrap_err(), "Erzeugung fehlgeschlagen");
        assert!(n.0.lock().unwrap().fenster.is_empty());
    }
    #[test]
    fn konkurrierende_erzeugungen_reservieren_genau_ein_label() {
        let n = std::sync::Arc::new(Navigation::default());
        let aufrufe: Vec<_> = (0..20)
            .map(|i| {
                let n = n.clone();
                std::thread::spawn(move || {
                    n.ablegen(None, auftrag(&i.to_string()), "sender".into())
                        .unwrap()
                })
            })
            .collect();
        let ergebnisse: Vec<_> = aufrufe.into_iter().map(|f| f.join().unwrap()).collect();
        assert_eq!(ergebnisse.iter().filter(|(_, neu, _)| *neu).count(), 1);
        assert!(ergebnisse.iter().all(|(l, _, _)| l == &ergebnisse[0].0));
        n.schliessen(&ergebnisse[0].0);
        assert!(n.ablegen(None, auftrag("neu"), "sender".into()).unwrap().1);
    }
    #[test]
    fn tatsaechlicher_sendebefehl_erzeugt_nur_ein_hauptfenster_und_behaelt_den_letzten_auftrag() {
        let app = tauri::test::mock_builder()
            .manage(Navigation::default())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let sender = tauri::WebviewWindowBuilder::new(
            &app,
            "markierungskonflikte",
            tauri::WebviewUrl::App("index.html".into()),
        )
        .build()
        .unwrap();
        interne_navigation_senden(app.handle().clone(), sender.clone(), auftrag("010")).unwrap();
        let label = super::super::tiefenlink::haupt_fenster_label(
            app.webview_windows().keys().map(|l| (l.as_str(), false)),
        )
        .unwrap();
        let n = app.state::<Navigation>();
        assert!(n.ist_interner_start(&label));
        assert_eq!(app.webview_windows().len(), 2);
        interne_navigation_senden(app.handle().clone(), sender, auftrag("020")).unwrap();
        assert_eq!(app.webview_windows().len(), 2);
        assert_eq!(
            n.bereit(&label, "listener".into())
                .unwrap()
                .unwrap()
                .auftrag,
            auftrag("020")
        );
    }
    #[test]
    fn konfliktklicks_nutzen_sichtbares_restore_fenster_statt_verborgenem_main() {
        let fenster = [
            ("main", false),
            ("fenster-wiederhergestellt", true),
            ("markierungskonflikte", true),
        ];
        let n = Navigation::default();
        n.bereit("main", "main-sitzung".into()).unwrap();
        n.bereit("fenster-wiederhergestellt", "ziel-sitzung".into())
            .unwrap();
        for gliederungskennzahl in ["010", "020"] {
            let vorhanden = internes_zielfenster_label(fenster);
            let (label, neu, bereit) = n
                .ablegen(
                    vorhanden,
                    auftrag(gliederungskennzahl),
                    "markierungskonflikte".into(),
                )
                .unwrap();
            assert_eq!(label, "fenster-wiederhergestellt");
            assert!(!neu);
            assert!(bereit);
            assert!(n.lesen("main", "main-sitzung").unwrap().is_none());
            let a = n.lesen(&label, "ziel-sitzung").unwrap().unwrap();
            assert_eq!(a.auftrag, auftrag(gliederungskennzahl));
            assert!(!a.neues_fenster);
            n.bestaetigen(&label, "ziel-sitzung", a.kennung).unwrap();
        }
        assert_eq!(
            internes_zielfenster_label(fenster.into_iter().rev()),
            Some("fenster-wiederhergestellt".into())
        );
    }
    #[test]
    fn interne_fensterwahl_behaelt_reihenfolge_und_fallback() {
        assert_eq!(
            internes_zielfenster_label([("fenster-a", true), ("main", true)]),
            Some("main".into())
        );
        assert_eq!(
            internes_zielfenster_label([("fenster-a", false), ("main", false)]),
            Some("main".into())
        );
        assert_eq!(
            internes_zielfenster_label([("markierungskonflikte", true), ("main", false)]),
            Some("main".into())
        );
        assert_eq!(
            internes_zielfenster_label([("markierungskonflikte", true)]),
            None
        );
    }
    #[test]
    fn optionaler_normpraefix_und_normgeber_serialisieren_wie_im_frontend() {
        for ziel in [
            serde_json::json!({"type": "norm", "bezeichnung": "1"}),
            serde_json::json!({"type": "norm", "bezeichnung": "1", "praefix": ["Anhang"]}),
        ] {
            let json = serde_json::json!({"gesetz": {"kurztitel": "X"}, "ziel": ziel});
            let auftrag: Auftrag = serde_json::from_value(json.clone()).unwrap();
            assert_eq!(serde_json::to_value(auftrag).unwrap(), json);
        }
        assert!(serde_json::from_value::<Auftrag>(serde_json::json!({"gesetz": {"kurztitel": "X"}, "ziel": {"type": "norm", "gliederungskennzahl": "010"}})).is_err());
    }
    #[test]
    fn tatsaechliche_commands_und_serialisierung_sind_fenstergebunden() {
        use tauri::Listener;
        let vertraege: serde_json::Value = serde_json::from_str(include_str!(
            "../../../src/test/plattform/native-vertraege.json"
        ))
        .unwrap();
        let vertrag = &vertraege["navigation"];
        let app = tauri::test::mock_builder()
            .manage(Navigation::default())
            .invoke_handler(tauri::generate_handler![
                interne_navigation_senden,
                oeffnen_link_navigation_senden,
                interne_navigation_bereit,
                interne_navigation_lesen,
                interne_navigation_bestaetigen,
                interne_navigation_abmelden,
                interne_navigation_anzeigen
            ])
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let main = tauri::WebviewWindowBuilder::new(
            &app,
            "main",
            tauri::WebviewUrl::App("index.html".into()),
        )
        .build()
        .unwrap();
        let fremd = tauri::WebviewWindowBuilder::new(
            &app,
            "anderes-fenster",
            tauri::WebviewUrl::App("index.html".into()),
        )
        .build()
        .unwrap();
        let ipc = |fenster: &tauri::WebviewWindow<tauri::test::MockRuntime>, cmd: &str, body| {
            tauri::test::get_ipc_response(
                fenster,
                tauri::webview::InvokeRequest {
                    cmd: cmd.into(),
                    callback: tauri::ipc::CallbackFn(0),
                    error: tauri::ipc::CallbackFn(1),
                    url: if cfg!(windows) {
                        "http://tauri.localhost"
                    } else {
                        "tauri://localhost"
                    }
                    .parse()
                    .unwrap(),
                    body: tauri::ipc::InvokeBody::Json(body),
                    headers: Default::default(),
                    invoke_key: tauri::test::INVOKE_KEY.into(),
                },
            )
            .map(|r| r.deserialize::<serde_json::Value>().unwrap())
        };
        let anmeldung = serde_json::json!({ "anmeldung": "sitzung" });
        assert_eq!(
            ipc(&main, "interne_navigation_bereit", anmeldung.clone()).unwrap(),
            serde_json::Value::Null
        );
        let empfang = std::sync::Arc::new(Mutex::new(Vec::new()));
        let p = empfang.clone();
        app.listen_any(vertrag["ereignis"]["name"].as_str().unwrap(), move |e| {
            p.lock().unwrap().push(e.payload().to_string())
        });
        let ziel = vertrag["auftrag"].clone();
        ipc(
            &fremd,
            "interne_navigation_senden",
            serde_json::json!({"auftrag": ziel}),
        )
        .unwrap();
        assert_eq!(
            *empfang.lock().unwrap(),
            vec![serde_json::to_string(&vertrag["ereignis"]["payload"]).unwrap()]
        );
        let a = ipc(&main, "interne_navigation_lesen", anmeldung.clone()).unwrap();
        assert_eq!(a, vertrag["uebergabe"]);
        ipc(&fremd, "interne_navigation_bereit", anmeldung.clone()).unwrap();
        assert_eq!(
            ipc(
                &fremd,
                "interne_navigation_lesen",
                serde_json::json!({"anmeldung": "sitzung", "label": "main"})
            )
            .unwrap(),
            serde_json::Value::Null
        );
        ipc(
            &fremd,
            "interne_navigation_bestaetigen",
            serde_json::json!({"anmeldung": "sitzung", "kennung": a["kennung"]}),
        )
        .unwrap();
        assert_eq!(
            ipc(&main, "interne_navigation_lesen", anmeldung.clone()).unwrap(),
            a
        );
        ipc(
            &main,
            "interne_navigation_bestaetigen",
            serde_json::json!({"anmeldung": "sitzung", "kennung": a["kennung"]}),
        )
        .unwrap();
        assert_eq!(
            ipc(&main, "interne_navigation_lesen", anmeldung).unwrap(),
            serde_json::Value::Null
        );
        let suche = &vertraege["oeffnenLink"];
        ipc(
            &main,
            suche["sendenCommand"].as_str().unwrap(),
            serde_json::json!({"auftrag": suche["auftrag"], "beimAppStart": false}),
        )
        .unwrap();
        assert_eq!(
            ipc(
                &main,
                "interne_navigation_lesen",
                serde_json::json!({"anmeldung": "sitzung"})
            )
            .unwrap(),
            suche["uebergabe"]
        );
        // Echte IPC-Deserialisierung: beide Werte müssen beim richtigen Feld ankommen.
        for beim_app_start in [true, false] {
            *app.state::<Navigation>().0.lock().unwrap() = Zustand::default();
            ipc(
                &main,
                "oeffnen_link_navigation_senden",
                serde_json::json!({"auftrag": suche["auftrag"], "beimAppStart": beim_app_start}),
            )
            .unwrap();
            let navigation = app.state::<Navigation>();
            let uebergabe = navigation
                .bereit("main", "payload-test".into())
                .unwrap()
                .unwrap();
            assert_eq!(uebergabe.neues_fenster, beim_app_start);
            assert_eq!(
                serde_json::to_value(uebergabe.auftrag).unwrap(),
                suche["auftrag"]
            );
        }
        assert!(include_str!("../lib.rs").contains("app.deep_link().on_open_url"));
        assert!(include_str!("../lib.rs").contains("navigation::oeffnen_link_aus_url_empfangen"));
        for command in [
            "interne_navigation_senden",
            "oeffnen_link_navigation_senden",
            "interne_navigation_bereit",
            "interne_navigation_lesen",
            "interne_navigation_bestaetigen",
            "interne_navigation_abmelden",
            "interne_navigation_anzeigen",
        ] {
            assert!(include_str!("../lib.rs").contains(&format!("{command},")));
        }
        app.manage(crate::fenster::hinweise::HauptfensterHinweise::default());
        app.manage(crate::commands::DateiSperren::default());
        app.manage(crate::fenster::ziehvorschau::Ziehvorschau::<
            tauri::test::MockRuntime,
        >::default());
        crate::commands::fensteranfragen::fenster_zerstoert(&main.as_ref().window());
        assert_eq!(
            ipc(
                &main,
                "interne_navigation_lesen",
                serde_json::json!({"anmeldung": "sitzung"})
            )
            .unwrap(),
            serde_json::Value::Null
        );
    }
    #[test]
    fn oeffnen_link_os_und_app_start_werden_einmal_uebergeben_und_arten_loesen_einander_ab() {
        let app = tauri::test::mock_builder()
            .manage(Navigation::default())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let sender = tauri::WebviewWindowBuilder::new(
            &app,
            "markierungskonflikte",
            tauri::WebviewUrl::App("index.html".into()),
        )
        .build()
        .unwrap();
        // Kein Hauptfenster, der OS-Empfang reserviert und erzeugt genau eines.
        assert!(
            !oeffnen_link_aus_url_empfangen(app.handle(), "lexlata://de-bund/bgb/433", false)
                .unwrap()
        );
        assert_eq!(app.webview_windows().len(), 1);
        assert!(
            oeffnen_link_aus_url_empfangen(app.handle(), "lexlata://oeffnen/1%20X", false).unwrap()
        );
        let label = super::super::tiefenlink::haupt_fenster_label(
            app.webview_windows().keys().map(|l| (l.as_str(), false)),
        )
        .unwrap();
        let ziel = app.get_webview_window(&label).unwrap();
        ziel.hide().unwrap();
        ziel.minimize().unwrap();
        assert!(
            oeffnen_link_aus_url_empfangen(app.handle(), "lexlata://oeffnen/433%20BGB", false)
                .unwrap()
        );
        assert_eq!(app.webview_windows().len(), 2);
        let n = app.state::<Navigation>();
        let a = n.bereit(&label, "sitzung".into()).unwrap().unwrap();
        assert_eq!(
            a.auftrag,
            Auftrag::Oeffnen {
                r#type: "oeffnen".into(),
                suchtext: "433 BGB".into()
            }
        );
        // getCurrent enthält auch URLs bei laufender App: daraus entsteht keine zweite Kopie.
        oeffnen_link_empfangen(app.handle(), "433 BGB".into(), true).unwrap();
        assert_eq!(
            n.lesen(&label, "sitzung").unwrap().unwrap().kennung,
            a.kennung
        );
        interne_navigation_senden(app.handle().clone(), sender.clone(), auftrag("010")).unwrap();
        let b = n.lesen(&label, "sitzung").unwrap().unwrap();
        assert_eq!(b.auftrag, auftrag("010"));
        n.bestaetigen(&label, "sitzung", a.kennung).unwrap();
        assert_eq!(
            n.lesen(&label, "sitzung").unwrap().unwrap().kennung,
            b.kennung
        );
        assert_eq!(
            n.0.lock().unwrap().fenster[&label].fokus_zurueck.as_deref(),
            Some("markierungskonflikte")
        );
        oeffnen_link_empfangen(app.handle(), "1 BGB".into(), false).unwrap();
        let c = n.lesen(&label, "sitzung").unwrap().unwrap();
        assert!(c.kennung > b.kennung);
        assert_eq!(
            n.0.lock().unwrap().fenster[&label].fokus_zurueck.as_deref(),
            Some("")
        );
        assert!(!interne_navigation_anzeigen(
            ziel.clone(),
            Some("sitzung".into()),
            Some(b.kennung)
        )
        .unwrap());
        n.abmelden(&label, "sitzung").unwrap();
        assert!(n.bereit(&label, "sitzung".into()).unwrap().is_none());
        assert_eq!(
            n.bereit(&label, "neu".into()).unwrap().unwrap().kennung,
            c.kennung
        );
        n.schliessen(&label);
        assert!(n.lesen(&label, "neu").unwrap().is_none());
        assert!(n.0.lock().unwrap().fenster.is_empty());
    }
    #[test]
    fn app_start_main_ist_einmalig_und_befuellt_den_initialtab() {
        let app = tauri::test::mock_builder()
            .manage(Navigation::default())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let main = tauri::WebviewWindowBuilder::new(
            &app,
            "main",
            tauri::WebviewUrl::App("index.html".into()),
        )
        .build()
        .unwrap();
        let suchauftrag = Auftrag::Oeffnen {
            r#type: "oeffnen".into(),
            suchtext: "433 BGB".into(),
        };
        assert!(
            oeffnen_link_aus_url_empfangen(app.handle(), "lexlata://oeffnen/433%20BGB", true)
                .unwrap()
        );
        // Die spätere Frontend-Lesung derselben Start-URL ist nur Restore-Kontext.
        oeffnen_link_navigation_senden(
            app.handle().clone(),
            main.clone(),
            suchauftrag.clone(),
            true,
        )
        .unwrap();
        let n = app.state::<Navigation>();
        let a = n.bereit("main", "sitzung".into()).unwrap().unwrap();
        assert!(a.neues_fenster);
        n.bestaetigen("main", "sitzung", a.kennung).unwrap();
        oeffnen_link_navigation_senden(app.handle().clone(), main, suchauftrag, true).unwrap();
        assert!(n.lesen("main", "sitzung").unwrap().is_none());
        assert_eq!(app.webview_windows().len(), 1);
    }
    #[test]
    fn app_start_url_nachlesen_ersetzt_keinen_neueren_internen_klick() {
        let app = tauri::test::mock_builder()
            .manage(Navigation::default())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let main = tauri::WebviewWindowBuilder::new(
            &app,
            "main",
            tauri::WebviewUrl::App("index.html".into()),
        )
        .build()
        .unwrap();
        assert!(
            oeffnen_link_aus_url_empfangen(app.handle(), "lexlata://oeffnen/433%20BGB", true)
                .unwrap()
        );
        interne_navigation_senden(app.handle().clone(), main.clone(), auftrag("010")).unwrap();
        oeffnen_link_navigation_senden(
            app.handle().clone(),
            main,
            Auftrag::Oeffnen {
                r#type: "oeffnen".into(),
                suchtext: "433 BGB".into(),
            },
            true,
        )
        .unwrap();
        let n = app.state::<Navigation>();
        let a = n.bereit("main", "sitzung".into()).unwrap().unwrap();
        assert_eq!(a.auftrag, auftrag("010"));
        assert!(a.neues_fenster);
        assert_eq!(
            n.0.lock().unwrap().fenster["main"].fokus_zurueck.as_deref(),
            Some("main")
        );
    }
}
