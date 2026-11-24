// fenster/hinweise.rs
// Flüchtige, bestätigte Hinweisübergabe an genau ein Hauptfenster.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

const WARTEFRIST: Duration = Duration::from_secs(30);
const WIEDERHOLUNG: Duration = Duration::from_millis(250);

#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum HinweisTyp {
    Info,
    Warnung,
    Fehler,
}

// Einzelmeldung eines Vorgangs für die gegliederte Anzeige im Hauptfenster.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct HinweisMeldung {
    text: String,
    typ: HinweisTyp,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    grund: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    betroffen: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
    // Sicherungsdatei relativ zum Datenordner; nur für den Sicherungshinweis.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    sicherung: Option<String>,
}

const MAX_MELDUNGEN: usize = 256;

// Keine Banneraktionen, Callbacks oder fachlichen Änderungs-/Historienzustände.
// `text` und `typ` fassen den Hinweis zusammen; `meldungen` enthält optional
// alle Meldungen eines Vorgangs, die das Hauptfenster gemeinsam gliedert.
#[derive(Clone, Debug, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Hinweis {
    text: String,
    typ: HinweisTyp,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    meldungen: Vec<HinweisMeldung>,
}

#[derive(Clone, Debug, serde::Serialize)]
pub(crate) struct Uebergabe {
    kennung: String,
    hinweis: Hinweis,
}

struct Auftrag {
    hinweis: Hinweis,
    oeffner: Option<String>,
    ziel: Option<String>,
    angenommen: Instant,
    neues_fenster_erlaubt: bool,
}

#[derive(Default)]
struct Zustand {
    auftraege: HashMap<String, Auftrag>,
    anmeldungen: HashMap<String, String>,
    bestaetigt: HashMap<String, Instant>,
    laeuft: bool,
    naechstes_fenster: u64,
}

#[derive(Default)]
pub(crate) struct HauptfensterHinweise(Mutex<Zustand>);

fn empfaenger(labels: &[String], oeffner: Option<&str>, fokus: Option<&str>) -> Option<String> {
    let mut hauptfenster: Vec<_> = labels
        .iter()
        .filter(|l| super::menu_sync::ist_hauptfenster(l))
        .collect();
    hauptfenster.sort();
    oeffner
        .into_iter()
        .chain(fokus)
        .find_map(|ziel| {
            hauptfenster
                .iter()
                .find(|l| l.as_str() == ziel)
                .map(|l| (*l).clone())
        })
        .or_else(|| hauptfenster.first().map(|l| (*l).clone()))
}

impl Zustand {
    fn annehmen(
        &mut self,
        kennung: String,
        hinweis: Hinweis,
        oeffner: Option<String>,
        jetzt: Instant,
    ) -> Result<(), String> {
        self.aufraeumen(jetzt);
        if let Some(auftrag) = self.auftraege.get(&kennung) {
            return if auftrag.hinweis == hinweis {
                Ok(())
            } else {
                Err("Hinweiskennung bereits anderweitig verwendet".into())
            };
        }
        if self.bestaetigt.contains_key(&kennung) {
            return Ok(());
        }
        if kennung.is_empty()
            || hinweis.text.trim().is_empty()
            || hinweis.meldungen.len() > MAX_MELDUNGEN
            || hinweis.meldungen.iter().any(|m| m.text.trim().is_empty())
            || self.auftraege.len() >= 256
        {
            return Err("Hinweisübergabe konnte nicht angenommen werden".into());
        }
        self.auftraege.insert(
            kennung,
            Auftrag {
                hinweis,
                oeffner,
                ziel: None,
                angenommen: jetzt,
                neues_fenster_erlaubt: true,
            },
        );
        Ok(())
    }

    fn aufraeumen(&mut self, jetzt: Instant) {
        self.auftraege.retain(|kennung, a| {
            let behalten = jetzt.duration_since(a.angenommen) < WARTEFRIST;
            if !behalten {
                eprintln!("Hauptfensterhinweis {kennung}: Übergabe nach 30 Sekunden beendet");
            }
            behalten
        });
        self.bestaetigt
            .retain(|_, zeit| jetzt.duration_since(*zeit) < WARTEFRIST);
    }

    fn verteilen(&mut self, labels: &[String], fokus: Option<&str>) -> Option<String> {
        let mut neues_label = None;
        let mut kandidaten = labels.to_vec();
        self.auftraege.retain(|kennung, a| {
            if a.ziel.as_ref().is_some_and(|l| !labels.contains(l)) {
                a.ziel = None;
            }
            if a.ziel.is_some() {
                return true;
            }
            a.ziel = empfaenger(&kandidaten, a.oeffner.as_deref(), fokus);
            if a.ziel.is_none() {
                if !a.neues_fenster_erlaubt {
                    eprintln!("Hauptfensterhinweis {kennung}: neu erzeugter Empfänger geschlossen");
                    return false;
                }
                self.naechstes_fenster += 1;
                let nanos = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_nanos();
                let label = format!("fenster-hinweis-{nanos:x}-{}", self.naechstes_fenster);
                kandidaten.push(label.clone());
                neues_label = Some(label.clone());
                a.ziel = Some(label);
            }
            if a.ziel == neues_label {
                a.neues_fenster_erlaubt = false;
            }
            true
        });
        neues_label
    }

    fn lesen(&self, label: &str, anmeldung: &str) -> Vec<Uebergabe> {
        if self.anmeldungen.get(label).map(String::as_str) != Some(anmeldung) {
            return vec![];
        }
        let mut hinweise: Vec<_> = self
            .auftraege
            .iter()
            .filter(|(_, a)| a.ziel.as_deref() == Some(label))
            .map(|(kennung, a)| Uebergabe {
                kennung: kennung.clone(),
                hinweis: a.hinweis.clone(),
            })
            .collect();
        hinweise.sort_by(|a, b| a.kennung.cmp(&b.kennung));
        hinweise
    }

    fn bestaetigen(&mut self, label: &str, anmeldung: &str, kennung: &str, jetzt: Instant) -> bool {
        if self.anmeldungen.get(label).map(String::as_str) != Some(anmeldung)
            || self
                .auftraege
                .get(kennung)
                .is_none_or(|a| a.ziel.as_deref() != Some(label))
        {
            return false;
        }
        self.auftraege.remove(kennung);
        self.bestaetigt.insert(kennung.into(), jetzt);
        true
    }
}

impl HauptfensterHinweise {
    fn zustand(&self) -> Result<std::sync::MutexGuard<'_, Zustand>, String> {
        // laeuft hängt am externen Verteiler-Task: nach dessen Panic kein
        // konsistenter Neustart garantiert. Deshalb vergiftete Zustände ablehnen.
        self.0.lock().map_err(|e| e.to_string())
    }

    pub(crate) fn schliessen(&self, label: &str) {
        if let Ok(mut z) = self.zustand() {
            z.anmeldungen.remove(label);
            for a in z.auftraege.values_mut() {
                if a.ziel.as_deref() == Some(label) {
                    a.ziel = None;
                }
            }
        }
    }
}

// Der Dienst gehört der App, nicht dem sendenden WebView. Fenstererzeugung
// und Vordergrundholen erfolgen stets ohne gehaltene Zustandssperre.
fn verteilen<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<bool, String> {
    verteilen_mit(app, |label| {
        super::neues_fenster(app, Some(label.into()), None)
    })
}

// Gemeinsame Auswahl für echte Fensterabfragen und prüfbare Fokus-Snapshots.
fn hauptfenster_fokus<'a>(
    fenster: impl IntoIterator<Item = (&'a str, bool)>,
    letzter_fokus: Option<&str>,
) -> Option<String> {
    let fenster: Vec<_> = fenster.into_iter().collect();
    fenster
        .iter()
        .find(|(label, fokussiert)| *fokussiert && super::menu_sync::ist_hauptfenster(label))
        .map(|(label, _)| *label)
        .or_else(|| {
            letzter_fokus.filter(|label| {
                super::menu_sync::ist_hauptfenster(label)
                    && fenster.iter().any(|(vorhanden, _)| vorhanden == label)
            })
        })
        .map(str::to_owned)
}

fn verteilen_mit<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    erzeugen: impl FnOnce(&str) -> Result<(), String>,
) -> Result<bool, String> {
    verteilen_und_wecken_mit(app, erzeugen, |label| {
        app.emit_to(label, "hauptfenster-hinweise-verfuegbar", ())
            .map_err(|e| e.to_string())
    })
}

fn verteilen_und_wecken_mit<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    erzeugen: impl FnOnce(&str) -> Result<(), String>,
    mut wecken: impl FnMut(&str) -> Result<(), String>,
) -> Result<bool, String> {
    let labels: Vec<_> = app.webview_windows().into_keys().collect();
    let fenster = app.webview_windows();
    let letzter_fokus = app
        .try_state::<super::menu_sync::FensterMenueZustaende>()
        .and_then(|z| crate::sperren::sperren(&z.letzter_fokus).clone());
    let fokus = hauptfenster_fokus(
        fenster
            .iter()
            .map(|(label, f)| (label.as_str(), f.is_focused().unwrap_or(false))),
        letzter_fokus.as_deref(),
    );
    #[cfg(target_os = "macos")]
    let fokus = fokus
        .filter(|l| super::menu_sync::ist_hauptfenster(l))
        .or_else(|| {
            super::hat_native_fenster::<R>()
                .then(|| super::label_des_mainwindow(app))
                .flatten()
                .filter(|label| super::menu_sync::ist_hauptfenster(label) && labels.contains(label))
        });
    let hinweise = app.state::<HauptfensterHinweise>();
    let neu = {
        let mut z = hinweise.zustand()?;
        z.aufraeumen(Instant::now());
        z.verteilen(&labels, fokus.as_deref())
    };
    if let Some(label) = neu {
        if let Err(fehler) = erzeugen(&label) {
            let mut z = hinweise.zustand()?;
            z.auftraege.retain(|kennung, a| {
                if a.ziel.as_deref() != Some(&label) {
                    return true;
                }
                eprintln!("Hauptfensterhinweis {kennung}: Fensterstart fehlgeschlagen: {fehler}");
                false
            });
        }
    }
    let empfaenger = {
        let mut z = hinweise.zustand()?;
        if z.auftraege.is_empty() {
            z.laeuft = false;
            return Ok(false);
        }
        // Kein zweiter Hinweisbestand: nur Ziele offener Aufträge aufwecken.
        // Solange sie unbestätigt sind, versucht derselbe Verteiler es erneut.
        let mut empfaenger: Vec<_> = z
            .auftraege
            .values()
            .filter_map(|a| a.ziel.as_ref())
            .filter(|label| z.anmeldungen.contains_key(*label))
            .cloned()
            .collect();
        empfaenger.sort();
        empfaenger.dedup();
        empfaenger
    };
    for label in empfaenger {
        if let Err(fehler) = wecken(&label) {
            eprintln!("Hauptfensterhinweise {label}: Weckversuch fehlgeschlagen: {fehler}");
        }
    }
    Ok(true)
}

#[tauri::command]
pub(crate) fn hauptfenster_hinweis_senden<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    kennung: String,
    hinweis: Hinweis,
    oeffner: Option<String>,
) -> Result<(), String> {
    let starten = {
        let hinweise = app.state::<HauptfensterHinweise>();
        let mut z = hinweise.zustand()?;
        z.annehmen(kennung, hinweis, oeffner, Instant::now())?;
        let starten = !z.laeuft && !z.auftraege.is_empty();
        if starten {
            z.laeuft = true;
        }
        starten
    };
    if starten {
        tauri::async_runtime::spawn(async move {
            loop {
                match verteilen(&app) {
                    Ok(true) => tokio::time::sleep(WIEDERHOLUNG).await,
                    Ok(false) => break,
                    Err(fehler) => {
                        eprintln!("Hauptfensterhinweise: {fehler}");
                        break;
                    }
                }
            }
        });
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn hauptfenster_hinweise_bereit<R: tauri::Runtime>(
    fenster: tauri::WebviewWindow<R>,
    anmeldung: String,
) -> Result<(), String> {
    if !super::menu_sync::ist_hauptfenster(fenster.label()) || anmeldung.is_empty() {
        return Err("Hinweisempfang benötigt ein Hauptfenster und eine Anmeldung".into());
    }
    fenster
        .state::<HauptfensterHinweise>()
        .zustand()?
        .anmeldungen
        .insert(fenster.label().into(), anmeldung);
    Ok(())
}

#[tauri::command]
pub(crate) fn hauptfenster_hinweise_lesen<R: tauri::Runtime>(
    fenster: tauri::WebviewWindow<R>,
    anmeldung: String,
) -> Result<Vec<Uebergabe>, String> {
    lesen_mit(&fenster, &anmeldung, |operation| {
        match operation {
            "Wiederherstellen" => fenster.unminimize(),
            "Anzeigen" => fenster.show(),
            _ => fenster.set_focus(),
        }
        .map_err(|e| e.to_string())
    })
}

fn lesen_mit<R: tauri::Runtime>(
    fenster: &tauri::WebviewWindow<R>,
    anmeldung: &str,
    mut operation: impl FnMut(&str) -> Result<(), String>,
) -> Result<Vec<Uebergabe>, String> {
    let hinweise = fenster.state::<HauptfensterHinweise>();
    let daten = {
        let mut z = hinweise.zustand()?;
        z.aufraeumen(Instant::now());
        z.lesen(fenster.label(), anmeldung)
    };
    if !daten.is_empty() {
        for name in ["Wiederherstellen", "Anzeigen", "Fokussieren"] {
            if let Err(fehler) = operation(name) {
                eprintln!("Hauptfensterhinweise: {name} fehlgeschlagen: {fehler}");
            }
        }
        #[cfg(target_os = "macos")]
        super::fenster_nativ_vordergrund(fenster);
    }
    Ok(daten)
}

#[tauri::command]
pub(crate) fn hauptfenster_hinweis_bestaetigen<R: tauri::Runtime>(
    fenster: tauri::WebviewWindow<R>,
    anmeldung: String,
    kennung: String,
) -> Result<(), String> {
    let hinweise = fenster.state::<HauptfensterHinweise>();
    let mut z = hinweise.zustand()?;
    z.aufraeumen(Instant::now());
    z.bestaetigen(fenster.label(), &anmeldung, &kennung, Instant::now());
    Ok(())
}

#[tauri::command]
pub(crate) fn hauptfenster_hinweise_abmelden<R: tauri::Runtime>(
    fenster: tauri::WebviewWindow<R>,
    anmeldung: String,
) -> Result<(), String> {
    let hinweise = fenster.state::<HauptfensterHinweise>();
    let mut z = hinweise.zustand()?;
    if z.anmeldungen.get(fenster.label()) == Some(&anmeldung) {
        z.anmeldungen.remove(fenster.label());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hinweis() -> Hinweis {
        Hinweis {
            text: "Gespeichert; Prüfung offen.".into(),
            typ: HinweisTyp::Warnung,
            meldungen: Vec::new(),
        }
    }

    #[test]
    fn jeder_fensterfehler_laesst_hinweise_uebernehmen_und_bestaetigen() {
        for fehler in ["Wiederherstellen", "Anzeigen", "Fokussieren"] {
            let app = app();
            let main = fenster(&app, "main");
            let zustand = app.state::<HauptfensterHinweise>();
            zustand
                .0
                .lock()
                .unwrap()
                .annehmen("id".into(), hinweis(), None, Instant::now())
                .unwrap();
            verteilen(app.handle()).unwrap();
            hauptfenster_hinweise_bereit(main.clone(), "s".into()).unwrap();
            let mut operationen = Vec::new();
            let daten = lesen_mit(&main, "s", |name| {
                operationen.push(name.to_owned());
                if name == fehler {
                    Err("gezielter Fensterfehler".into())
                } else {
                    Ok(())
                }
            })
            .expect("Fensterfehler darf Hinweisrückgabe nicht verhindern");
            assert_eq!(daten.len(), 1);
            assert_eq!(operationen, ["Wiederherstellen", "Anzeigen", "Fokussieren"]);
            hauptfenster_hinweis_bestaetigen(main, "s".into(), daten[0].kennung.clone()).unwrap();
            assert!(zustand.0.lock().unwrap().auftraege.is_empty());
        }
    }

    #[test]
    fn weckfehler_wird_nur_bei_offenem_auftrag_wiederholt_bis_zur_bestaetigung() {
        let app = app();
        let main = fenster(&app, "main");
        let _fremd = fenster(&app, "fenster-fremd");
        let zustand = app.state::<HauptfensterHinweise>();
        hauptfenster_hinweise_bereit(main.clone(), "s".into()).unwrap();
        let weckversuche = std::cell::Cell::new(0);
        let verteilen = || {
            verteilen_und_wecken_mit(
                app.handle(),
                |_| panic!("Empfänger vorhanden"),
                |label| {
                    assert_eq!(label, "main");
                    weckversuche.set(weckversuche.get() + 1);
                    Err("gezielter Weckfehler".into())
                },
            )
            .unwrap()
        };
        assert!(!verteilen());
        zustand
            .0
            .lock()
            .unwrap()
            .annehmen("id".into(), hinweis(), Some("main".into()), Instant::now())
            .unwrap();
        assert!(verteilen());
        assert!(verteilen());
        assert_eq!(weckversuche.get(), 2);
        let daten = hauptfenster_hinweise_lesen(main.clone(), "s".into()).unwrap();
        assert_eq!(daten.len(), 1);
        hauptfenster_hinweis_bestaetigen(main, "s".into(), "id".into()).unwrap();
        assert!(!verteilen());
        assert_eq!(weckversuche.get(), 2);
    }

    #[test]
    fn echter_verteiler_weckt_nur_den_bereiten_empfaenger_offener_auftraege() {
        use tauri::Listener;
        let app = app();
        let main = fenster(&app, "main");
        let fremd = fenster(&app, "fenster-fremd");
        let empfangen = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let zaehler = empfangen.clone();
        main.listen("hauptfenster-hinweise-verfuegbar", move |ereignis| {
            assert_eq!(ereignis.payload(), "null");
            zaehler.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        });
        fremd.listen("hauptfenster-hinweise-verfuegbar", |_| {
            panic!("kein fremdes Fenster wecken")
        });
        let zustand = app.state::<HauptfensterHinweise>();
        zustand
            .0
            .lock()
            .unwrap()
            .annehmen("id".into(), hinweis(), Some("main".into()), Instant::now())
            .unwrap();
        assert!(verteilen(app.handle()).unwrap());
        assert_eq!(empfangen.load(std::sync::atomic::Ordering::SeqCst), 0);
        hauptfenster_hinweise_bereit(main.clone(), "s".into()).unwrap();
        assert!(verteilen(app.handle()).unwrap());
        assert_eq!(empfangen.load(std::sync::atomic::Ordering::SeqCst), 1);
        hauptfenster_hinweis_bestaetigen(main, "s".into(), "id".into()).unwrap();
        assert!(!verteilen(app.handle()).unwrap());
        assert_eq!(empfangen.load(std::sync::atomic::Ordering::SeqCst), 1);
    }

    #[test]
    fn oeffner_vor_fokus_vor_eindeutigem_ersatz() {
        let labels = vec!["fenster-b".into(), "main".into(), "kommentar-1".into()];
        assert_eq!(
            empfaenger(&labels, Some("fenster-b"), Some("main")),
            Some("fenster-b".into())
        );
        assert_eq!(
            empfaenger(&labels, Some("geschlossen"), Some("main")),
            Some("main".into())
        );
        assert_eq!(empfaenger(&labels, None, None), Some("fenster-b".into()));
        assert_eq!(empfaenger(&["einstellungen".into()], None, None), None);
    }

    #[test]
    fn annahme_bleibt_bis_bestaetigung_und_ist_duplikatfrei() {
        let mut z = Zustand::default();
        let jetzt = Instant::now();
        z.annehmen("id".into(), hinweis(), Some("main".into()), jetzt)
            .unwrap();
        z.annehmen("id".into(), hinweis(), None, jetzt).unwrap();
        assert_eq!(z.auftraege.len(), 1);
        z.auftraege.get_mut("id").unwrap().ziel = Some("main".into());
        assert!(z.lesen("main", "sitzung").is_empty());
        z.anmeldungen.insert("main".into(), "sitzung".into());
        assert_eq!(z.lesen("main", "sitzung").len(), 1);
        assert!(!z.bestaetigen("fremd", "sitzung", "id", jetzt));
        assert!(!z.bestaetigen("main", "fremd", "id", jetzt));
        assert!(z.bestaetigen("main", "sitzung", "id", jetzt));
        z.annehmen("id".into(), hinweis(), None, jetzt).unwrap();
        assert!(z.auftraege.is_empty());
        z.aufraeumen(jetzt + WARTEFRIST);
        assert!(z.bestaetigt.is_empty());
    }

    fn app() -> tauri::App<tauri::test::MockRuntime> {
        tauri::test::mock_builder()
            .manage(HauptfensterHinweise::default())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap()
    }
    fn fenster(
        app: &tauri::App<tauri::test::MockRuntime>,
        label: &str,
    ) -> tauri::WebviewWindow<tauri::test::MockRuntime> {
        tauri::WebviewWindowBuilder::new(app, label, tauri::WebviewUrl::App("index.html".into()))
            .build()
            .unwrap()
    }

    #[test]
    fn parallele_annahme_reserviert_einen_empfaenger_und_startfehler_beendet_alle() {
        let app = app();
        let z = app.state::<HauptfensterHinweise>();
        for i in 0..20 {
            z.0.lock()
                .unwrap()
                .annehmen(i.to_string(), hinweis(), None, Instant::now())
                .unwrap();
        }
        let erzeugungen = std::cell::Cell::new(0);
        assert!(!verteilen_mit(app.handle(), |label| {
            erzeugungen.set(erzeugungen.get() + 1);
            // Die Annahme ist fertig, die Sperre nicht über die Erzeugung gehalten.
            let zustand = z.0.lock().unwrap();
            assert_eq!(zustand.auftraege.len(), 20);
            assert!(zustand
                .auftraege
                .values()
                .all(|a| a.ziel.as_deref() == Some(label)));
            Err("Startfehler".into())
        })
        .unwrap());
        assert_eq!(erzeugungen.get(), 1);
        assert!(z.0.lock().unwrap().auftraege.is_empty());
        assert!(
            !verteilen_mit(app.handle(), |_| panic!("kein weiterer Erzeugungsversuch")).unwrap()
        );
    }

    #[test]
    fn langsamer_neuer_empfaenger_wird_nicht_erneut_erzeugt_und_frist_raeumt_auf() {
        let app = app();
        let z = app.state::<HauptfensterHinweise>();
        let jetzt = Instant::now();
        z.0.lock()
            .unwrap()
            .annehmen("id".into(), hinweis(), None, jetzt)
            .unwrap();
        assert!(verteilen(app.handle()).unwrap());
        assert_eq!(app.webview_windows().len(), 1);
        for _ in 0..5 {
            assert!(verteilen(app.handle()).unwrap());
        }
        assert_eq!(app.webview_windows().len(), 1);
        let label = app.webview_windows().into_keys().next().unwrap();
        let f = app.get_webview_window(&label).unwrap();
        assert!(hauptfenster_hinweise_lesen(f.clone(), "sitzung".into())
            .unwrap()
            .is_empty());
        hauptfenster_hinweise_bereit(f.clone(), "sitzung".into()).unwrap();
        let daten = hauptfenster_hinweise_lesen(f, "sitzung".into()).unwrap();
        assert_eq!(daten.len(), 1);
        z.0.lock().unwrap().aufraeumen(jetzt + WARTEFRIST);
        assert!(!verteilen(app.handle()).unwrap());
        assert!(z.0.lock().unwrap().auftraege.is_empty());
    }

    #[test]
    fn schliesswettlauf_verteilt_an_ersatz_aber_erzeugt_keine_fensterfolge() {
        let mut z = Zustand::default();
        z.annehmen("id".into(), hinweis(), Some("main".into()), Instant::now())
            .unwrap();
        assert!(z
            .verteilen(&["main".into(), "fenster-2".into()], None)
            .is_none());
        assert_eq!(z.auftraege["id"].ziel.as_deref(), Some("main"));
        assert!(z.verteilen(&["fenster-2".into()], None).is_none());
        assert_eq!(z.auftraege["id"].ziel.as_deref(), Some("fenster-2"));
        assert!(z.verteilen(&[], None).is_some());
        assert!(z.verteilen(&[], None).is_none());
        assert!(z.auftraege.is_empty());
    }

    #[test]
    fn echte_commands_binden_empfang_an_fenster_und_anmeldung() {
        let app = app();
        let main = fenster(&app, "main");
        let ersatz = fenster(&app, "fenster-2");
        let sender = fenster(&app, "kommentar-1");
        let zustand = app.state::<HauptfensterHinweise>();
        zustand
            .0
            .lock()
            .unwrap()
            .annehmen("id".into(), hinweis(), Some("main".into()), Instant::now())
            .unwrap();
        verteilen(app.handle()).unwrap();
        assert!(hauptfenster_hinweise_bereit(sender, "s".into()).is_err());
        // MockRuntime gibt feste Werte für Fokus, Sichtbarkeit und Minimierung
        // zurück; diese Aufrufe prüfen nur den Commandweg, keine native Bedienwirkung.
        main.minimize().unwrap();
        main.hide().unwrap();
        hauptfenster_hinweise_bereit(main.clone(), "s".into()).unwrap();
        hauptfenster_hinweise_bereit(ersatz.clone(), "s".into()).unwrap();
        assert!(hauptfenster_hinweise_lesen(ersatz.clone(), "s".into())
            .unwrap()
            .is_empty());
        let daten = hauptfenster_hinweise_lesen(main.clone(), "s".into()).unwrap();
        assert_eq!(
            serde_json::to_value(&daten).unwrap(),
            serde_json::json!([{ "kennung": "id", "hinweis": { "text": "Gespeichert; Prüfung offen.", "typ": "warnung" } }])
        );
        hauptfenster_hinweis_bestaetigen(ersatz, "s".into(), "id".into()).unwrap();
        assert_eq!(
            hauptfenster_hinweise_lesen(main.clone(), "s".into())
                .unwrap()
                .len(),
            1
        );
        hauptfenster_hinweise_bereit(main.clone(), "neu".into()).unwrap();
        hauptfenster_hinweise_abmelden(main.clone(), "s".into()).unwrap();
        assert_eq!(
            hauptfenster_hinweise_lesen(main.clone(), "neu".into())
                .unwrap()
                .len(),
            1
        );
        hauptfenster_hinweis_bestaetigen(main.clone(), "s".into(), "id".into()).unwrap();
        assert_eq!(
            hauptfenster_hinweise_lesen(main.clone(), "neu".into())
                .unwrap()
                .len(),
            1
        );
        hauptfenster_hinweis_bestaetigen(main.clone(), "neu".into(), "id".into()).unwrap();
        assert!(hauptfenster_hinweise_lesen(main, "neu".into())
            .unwrap()
            .is_empty());
        zustand.schliessen("main");
        assert!(!zustand.0.lock().unwrap().anmeldungen.contains_key("main"));
    }

    #[test]
    fn hinweise_sind_serialisierbar_ohne_banneraktionen() {
        assert!(serde_json::from_value::<Hinweis>(
            serde_json::json!({"text": "X", "typ": "warnung", "aktion": {"label": "Speichern"}})
        )
        .is_err());
        for typ in ["info", "warnung", "fehler"] {
            let json = serde_json::json!({"text": "X", "typ": typ});
            let h: Hinweis = serde_json::from_value(json.clone()).unwrap();
            assert_eq!(serde_json::to_value(h).unwrap(), json);
        }
    }

    #[test]
    fn hinweise_transportieren_alle_meldungen_eines_vorgangs() {
        let json = serde_json::json!({"text": "A\nB", "typ": "fehler", "meldungen": [
            {"text": "A", "typ": "warnung", "grund": "titelNichtErgaenzt", "betroffen": "BGB", "detail": "x"},
            {"text": "B", "typ": "fehler"}
        ]});
        let h: Hinweis = serde_json::from_value(json.clone()).unwrap();
        assert_eq!(serde_json::to_value(h).unwrap(), json);
        assert!(
            serde_json::from_value::<Hinweis>(serde_json::json!({"text": "A", "typ": "info",
            "meldungen": [{"text": "A", "typ": "info", "art": "hinweis"}]}))
            .is_err()
        );
    }

    #[test]
    fn gleichzeitige_annahmen_verlieren_keinen_hinweis() {
        let hinweise = std::sync::Arc::new(HauptfensterHinweise::default());
        let threads: Vec<_> = (0..20)
            .map(|i| {
                let hinweise = hinweise.clone();
                std::thread::spawn(move || {
                    hinweise
                        .0
                        .lock()
                        .unwrap()
                        .annehmen(i.to_string(), hinweis(), None, Instant::now())
                        .unwrap()
                })
            })
            .collect();
        for thread in threads {
            thread.join().unwrap();
        }
        let mut z = hinweise.0.lock().unwrap();
        let label = z.verteilen(&[], None).unwrap();
        assert_eq!(z.auftraege.len(), 20);
        assert!(z
            .auftraege
            .values()
            .all(|a| a.ziel.as_ref() == Some(&label)));
    }

    #[test]
    fn ipc_annahme_ist_absenderunabhaengig_und_nur_nutzlasten_werden_uebertragen() {
        let app = tauri::test::mock_builder()
            .manage(HauptfensterHinweise::default())
            .invoke_handler(tauri::generate_handler![
                hauptfenster_hinweis_senden,
                hauptfenster_hinweise_bereit,
                hauptfenster_hinweise_lesen,
                hauptfenster_hinweis_bestaetigen,
                hauptfenster_hinweise_abmelden
            ])
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let main = fenster(&app, "main");
        let sender = fenster(&app, "kommentar-ipc");
        let ipc = |f: &tauri::WebviewWindow<tauri::test::MockRuntime>, cmd: &str, body| {
            tauri::test::get_ipc_response(
                f,
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
        let sendung = serde_json::json!({"kennung": "ipc-id", "hinweis": {"text": "Gespeichert", "typ": "warnung"}, "oeffner": "main"});
        assert_eq!(
            ipc(&sender, "hauptfenster_hinweis_senden", sendung.clone()).unwrap(),
            serde_json::Value::Null
        );
        let zustand = app.state::<HauptfensterHinweise>();
        // Vor jeder Absenderfreigabe besitzt bereits die native App den Hinweis.
        assert!(zustand.0.lock().unwrap().auftraege.contains_key("ipc-id"));
        zustand.schliessen(sender.label());
        assert!(zustand.0.lock().unwrap().auftraege.contains_key("ipc-id"));
        let frist = Instant::now() + Duration::from_secs(2);
        while zustand.0.lock().unwrap().auftraege["ipc-id"].ziel.is_none() {
            assert!(Instant::now() < frist);
            std::thread::sleep(Duration::from_millis(5));
        }
        let anmeldung = serde_json::json!({"anmeldung": "sitzung"});
        assert_eq!(
            ipc(&main, "hauptfenster_hinweise_lesen", anmeldung.clone()).unwrap(),
            serde_json::json!([])
        );
        ipc(&main, "hauptfenster_hinweise_bereit", anmeldung.clone()).unwrap();
        let daten = ipc(&main, "hauptfenster_hinweise_lesen", anmeldung.clone()).unwrap();
        assert_eq!(
            daten,
            serde_json::json!([{"kennung": "ipc-id", "hinweis": {"text": "Gespeichert", "typ": "warnung"}}])
        );
        ipc(
            &main,
            "hauptfenster_hinweis_bestaetigen",
            serde_json::json!({"anmeldung": "sitzung", "kennung": "ipc-id"}),
        )
        .unwrap();
        ipc(&sender, "hauptfenster_hinweis_senden", sendung).unwrap();
        assert_eq!(
            ipc(&main, "hauptfenster_hinweise_lesen", anmeldung.clone()).unwrap(),
            serde_json::json!([])
        );
        ipc(&main, "hauptfenster_hinweise_abmelden", anmeldung).unwrap();
        assert!(!zustand.0.lock().unwrap().anmeldungen.contains_key("main"));
        for command in [
            "hauptfenster_hinweis_senden",
            "hauptfenster_hinweise_bereit",
            "hauptfenster_hinweise_lesen",
            "hauptfenster_hinweis_bestaetigen",
            "hauptfenster_hinweise_abmelden",
        ] {
            assert!(include_str!("../lib.rs").contains(&format!("{command},")));
        }
        ipc(
            &main,
            "hauptfenster_hinweise_bereit",
            serde_json::json!({"anmeldung": "sitzung"}),
        )
        .unwrap();
        app.manage(crate::fenster::navigation::Navigation::default());
        app.manage(crate::commands::DateiSperren::default());
        app.manage(crate::fenster::ziehvorschau::Ziehvorschau::<
            tauri::test::MockRuntime,
        >::default());
        crate::commands::fensteranfragen::fenster_zerstoert(&main.as_ref().window());
        assert!(!zustand.0.lock().unwrap().anmeldungen.contains_key("main"));
    }

    #[test]
    fn nativer_uebergabeweg_verwendet_den_vorhandenen_letzten_hauptfensterfokus() {
        let app = app();
        app.manage(super::super::menu_sync::FensterMenueZustaende::default());
        let _a = fenster(&app, "fenster-a");
        let _z = fenster(&app, "fenster-z");
        let _sender = fenster(&app, "kommentar-1");
        *app.state::<super::super::menu_sync::FensterMenueZustaende>()
            .letzter_fokus
            .lock()
            .unwrap() = Some("fenster-z".into());
        let hinweise = app.state::<HauptfensterHinweise>();
        hinweise
            .0
            .lock()
            .unwrap()
            .annehmen("id".into(), hinweis(), None, Instant::now())
            .unwrap();
        verteilen(app.handle()).unwrap();
        assert_eq!(
            hinweise.0.lock().unwrap().auftraege["id"].ziel.as_deref(),
            Some("fenster-z")
        );
    }

    #[test]
    fn fokussiertes_hilfsfenster_verdrangt_nicht_das_letzte_hauptfenster() {
        // MockRuntime meldet is_focused immer false; dieser Snapshot prüft
        // dieselbe produktive Auswahl mit einem tatsächlich fokussierten Hilfsfenster.
        let snapshot = [
            ("fenster-a", false),
            ("fenster-z", false),
            ("kommentar-1", true),
        ];
        let labels = snapshot
            .iter()
            .map(|(label, _)| (*label).into())
            .collect::<Vec<_>>();
        let fokus = hauptfenster_fokus(snapshot, Some("fenster-z"));
        assert_eq!(
            empfaenger(&labels, None, fokus.as_deref()),
            Some("fenster-z".into())
        );
        assert_eq!(hauptfenster_fokus(snapshot, Some("geschlossen")), None);
        assert_eq!(hauptfenster_fokus(snapshot, Some("kommentar-1")), None);
        assert_eq!(
            hauptfenster_fokus(
                [("fenster-a", true), ("fenster-z", false)],
                Some("fenster-z")
            ),
            Some("fenster-a".into())
        );
    }
}
