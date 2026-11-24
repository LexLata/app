// fenster/beenden_anfrage.rs
//
// Beenden-Anfrage an alle offenen Fenster (flüchtig, prozessweit, höchstens
// eine gleichzeitig). Nur Rust kennt alle Fenster und kann ihre Antworten
// sammeln; Aufrufer sind das App-Update (Installation und Neustart) und das
// Beenden der App (beenden.rs).
//
// Ablauf: Erst die Hilfsfenster, dann die Hauptfenster. Jedes Fenster erhält
// `beenden-anfrage { id }` und antwortet über `beenden_anfrage_antworten`
// mit `bereit`. Hilfsfenster stellen ihre Schließschutz-Rückfrage,
// Hauptfenster beenden ihr Speichern und behalten ihre Sitzung. Die
// Fenster schließen dabei nicht selbst; der Aufrufer installiert bzw.
// beendet. Ein Fenster, das während der Anfrage verschwindet, gilt als
// bereit. Lehnt ein Fenster ab oder antwortet es nicht binnen der Frist je
// Stufe, erhalten alle angefragten Fenster außer den ablehnenden
// `beenden-anfrage-abbruch { id }` und arbeiten weiter. Bei einer offenen
// Rückfrage ruht die Frist; danach beginnt sie für übrige Fenster neu.
use std::collections::BTreeSet;
use std::future::Future;
use std::sync::Mutex;
use std::task::{Poll, Waker};
use std::time::Duration;

const FRIST: Duration = Duration::from_secs(30);
const EREIGNIS_ANFRAGE: &str = "beenden-anfrage";
const EREIGNIS_ABBRUCH: &str = "beenden-anfrage-abbruch";

pub(crate) enum BeendenErgebnis<'a, F: BeendenFenster> {
    AlleBereit(LaufWache<'a, F>),
    Abbruch,
    /// Eine andere Beenden-Anfrage läuft; kein Fenster wurde angefragt.
    LaeuftBereits,
}

/// Zugang zu den offenen Fenstern; in Tests ersetzt.
pub(crate) trait BeendenFenster {
    fn offene_fenster(&self) -> Vec<String>;
    fn anfrage_senden(&self, label: &str, id: u64);
    fn abbruch_senden(&self, label: &str, id: u64);
}

/// Frist je Stufe; in Tests ersetzt.
pub(crate) trait BeendenFrist {
    fn ablauf(&self) -> impl Future<Output = ()>;
}

struct Lauf {
    id: u64,
    /// Angefragte Fenster der laufenden Stufe ohne Antwort.
    offen: BTreeSet<String>,
    vorbereitet: Vec<String>,
    rueckfragen: BTreeSet<String>,
    frist_neu: bool,
    abgelehnt: bool,
    hilfsfenster_ermittlung_begonnen: bool,
    freigegeben: bool,
    waker: Option<Waker>,
}

#[derive(Default)]
struct Stand {
    letzte_id: u64,
    lauf: Option<Lauf>,
    hilfsfenster_im_bau: usize,
}

#[derive(Default)]
pub struct BeendenAnfrage(Mutex<Stand>);

/// Erfasst einen laufenden nativen Fensterbau ohne gehaltene Sperre.
pub(crate) struct HilfsfensterErstellung<'a> {
    anfrage: &'a BeendenAnfrage,
    geoeffnet: bool,
}

impl HilfsfensterErstellung<'_> {
    /// Ein neues Fenster zählt erst nach einem erfolgreichen nativen Bau.
    pub(crate) fn geoeffnet(mut self) {
        self.geoeffnet = true;
    }
}

impl Drop for HilfsfensterErstellung<'_> {
    fn drop(&mut self) {
        let mut stand = crate::sperren::sperren(&self.anfrage.0);
        stand.hilfsfenster_im_bau -= 1;
        if self.geoeffnet {
            if let Some(lauf) = stand
                .lauf
                .as_mut()
                .filter(|lauf| lauf.hilfsfenster_ermittlung_begonnen)
            {
                eprintln!("Beenden-Anfrage: Ein neues Hilfsfenster wurde geöffnet; abgebrochen.");
                lauf.abgelehnt = true;
                lauf.wecken();
            }
        }
    }
}

/// Hält die Anfrage bis zum Beenden exklusiv und gibt bei einem Abbruch
/// auch dann alle Fenster frei, wenn der Aufrufer den Future fallen lässt.
pub(crate) struct LaufWache<'a, F: BeendenFenster> {
    besitz: LaufBesitz<'a>,
    fenster: &'a F,
    id: u64,
    abgeschlossen: bool,
}

impl<F: BeendenFenster> LaufWache<'_, F> {
    pub(crate) fn abschliessen(mut self) {
        self.abgeschlossen = true;
    }
}

/// Gibt den Lauf erst nach dem Versand der Abbruchnachrichten frei.
struct LaufBesitz<'a> {
    stand: &'a Mutex<Stand>,
}

impl Drop for LaufBesitz<'_> {
    fn drop(&mut self) {
        crate::sperren::sperren(self.stand).lauf = None;
    }
}

impl<F: BeendenFenster> Drop for LaufWache<'_, F> {
    fn drop(&mut self) {
        if self.abgeschlossen {
            return;
        }
        let (vorbereitet, offen) = {
            let mut stand = crate::sperren::sperren(self.besitz.stand);
            let lauf = stand.lauf.as_mut().expect("Lauf gehört der Laufwache");
            (
                std::mem::take(&mut lauf.vorbereitet),
                std::mem::take(&mut lauf.offen),
            )
        };
        for label in vorbereitet.iter().chain(&offen) {
            self.fenster.abbruch_senden(label, self.id);
        }
    }
}

impl BeendenAnfrage {
    /// Vormerken, bevor Tauri ein neues Hilfsfenster erzeugt.
    /// Nach der Beenden-Freigabe darf kein weiterer Bau beginnen.
    pub(crate) fn hilfsfenster_vormerken(&self) -> Option<HilfsfensterErstellung<'_>> {
        let mut stand = crate::sperren::sperren(&self.0);
        if stand.lauf.as_ref().is_some_and(|lauf| lauf.freigegeben) {
            return None;
        }
        stand.hilfsfenster_im_bau += 1;
        Some(HilfsfensterErstellung {
            anfrage: self,
            geoeffnet: false,
        })
    }

    pub(crate) async fn anfragen<'a, F: BeendenFenster>(
        &'a self,
        fenster: &'a F,
        frist: &impl BeendenFrist,
    ) -> BeendenErgebnis<'a, F> {
        let id = {
            let mut stand = crate::sperren::sperren(&self.0);
            if stand.lauf.is_some() {
                return BeendenErgebnis::LaeuftBereits;
            }
            stand.letzte_id += 1;
            let id = stand.letzte_id;
            stand.lauf = Some(Lauf {
                id,
                offen: BTreeSet::new(),
                vorbereitet: Vec::new(),
                rueckfragen: BTreeSet::new(),
                frist_neu: false,
                abgelehnt: false,
                hilfsfenster_ermittlung_begonnen: false,
                freigegeben: false,
                waker: None,
            });
            id
        };
        let wache = LaufWache {
            besitz: LaufBesitz { stand: &self.0 },
            fenster,
            id,
            abgeschlossen: false,
        };

        // Bis hier erfolgreich gebaute Hilfsfenster erfasst die folgende
        // Ermittlung. Ab jetzt könnte ein neues Fenster darin fehlen.
        crate::sperren::sperren(&self.0)
            .lauf
            .as_mut()
            .expect("Lauf gehört der Laufwache")
            .hilfsfenster_ermittlung_begonnen = true;
        for hauptfenster in [false, true] {
            let stufe: Vec<String> = fenster
                .offene_fenster()
                .into_iter()
                .filter(|label| {
                    super::ist_bedienfenster(label)
                        && super::ist_hauptfenster(label) == hauptfenster
                })
                .collect();
            if stufe.is_empty() {
                continue;
            }
            if let Some(lauf) = crate::sperren::sperren(&self.0).lauf.as_mut() {
                if lauf.abgelehnt {
                    return BeendenErgebnis::Abbruch;
                }
                lauf.offen = stufe.iter().cloned().collect();
                lauf.frist_neu = false;
            }
            let noch_offen = fenster.offene_fenster();
            for label in &stufe {
                if noch_offen.contains(label) {
                    fenster.anfrage_senden(label, id);
                } else {
                    self.fenster_verschwunden(label);
                }
            }
            if !self.stufe_abwarten(frist).await {
                return BeendenErgebnis::Abbruch;
            }
        }

        // Eine Erzeugung und die endgültige Freigabe dürfen sich nicht
        // überschneiden, auch wenn alle angefragten Fenster bereit sind.
        {
            let mut stand = crate::sperren::sperren(&self.0);
            if stand.hilfsfenster_im_bau != 0 {
                eprintln!("Beenden-Anfrage: Ein Hilfsfenster wird noch geöffnet; abgebrochen.");
                return BeendenErgebnis::Abbruch;
            }
            let lauf = stand.lauf.as_mut().expect("Lauf gehört der Laufwache");
            if lauf.abgelehnt {
                return BeendenErgebnis::Abbruch;
            }
            lauf.freigegeben = true;
        }
        BeendenErgebnis::AlleBereit(wache)
    }

    /// `true`, sobald alle Fenster der Stufe bereit oder verschwunden sind.
    async fn stufe_abwarten(&self, frist: &impl BeendenFrist) -> bool {
        let mut ablauf = None;
        std::future::poll_fn(|cx| {
            let mut stand = crate::sperren::sperren(&self.0);
            let Some(lauf) = stand.lauf.as_mut() else {
                return Poll::Ready(false);
            };
            if lauf.abgelehnt {
                return Poll::Ready(false);
            }
            if lauf.offen.is_empty() {
                return Poll::Ready(true);
            }
            lauf.waker = Some(cx.waker().clone());
            if std::mem::take(&mut lauf.frist_neu) || !lauf.rueckfragen.is_empty() {
                ablauf = None;
            }
            if !lauf.rueckfragen.is_empty() {
                return Poll::Pending;
            }
            if ablauf
                .get_or_insert_with(|| Box::pin(frist.ablauf()))
                .as_mut()
                .poll(cx)
                .is_ready()
            {
                eprintln!(
                    "Beenden-Anfrage: Keine rechtzeitige Antwort von {:?}; abgebrochen.",
                    lauf.offen
                );
                return Poll::Ready(false);
            }
            Poll::Pending
        })
        .await
    }

    pub(crate) fn rueckfrage(&self, label: &str, id: u64) {
        let mut stand = crate::sperren::sperren(&self.0);
        let Some(lauf) = stand.lauf.as_mut().filter(|lauf| lauf.id == id) else {
            return;
        };
        if lauf.offen.contains(label) && lauf.rueckfragen.insert(label.to_string()) {
            lauf.frist_neu = true;
            lauf.wecken();
        }
    }

    /// Antwort eines Fensters; veraltete oder unerwartete Antworten zählen nicht.
    pub(crate) fn antworten(&self, label: &str, id: u64, bereit: bool) {
        let mut stand = crate::sperren::sperren(&self.0);
        let Some(lauf) = stand.lauf.as_mut().filter(|lauf| lauf.id == id) else {
            return;
        };
        if !lauf.offen.remove(label) {
            return;
        }
        if bereit {
            lauf.vorbereitet.push(label.to_string());
        } else {
            lauf.abgelehnt = true;
        }
        lauf.rueckfragen.remove(label);
        lauf.wecken();
    }

    /// Ein verschwundenes Fenster gilt als bereit und braucht keine Abbruchnachricht.
    pub(crate) fn fenster_verschwunden(&self, label: &str) {
        let mut stand = crate::sperren::sperren(&self.0);
        let Some(lauf) = stand.lauf.as_mut() else {
            return;
        };
        lauf.vorbereitet.retain(|vorbereitet| vorbereitet != label);
        if lauf.offen.remove(label) {
            lauf.rueckfragen.remove(label);
            lauf.wecken();
        }
    }
}

impl Lauf {
    fn wecken(&mut self) {
        if let Some(waker) = self.waker.take() {
            waker.wake();
        }
    }
}

#[derive(Clone, serde::Serialize)]
struct Nachricht {
    id: u64,
}

pub(crate) struct TauriFenster<'a, R: tauri::Runtime>(pub(crate) &'a tauri::AppHandle<R>);

impl<R: tauri::Runtime> BeendenFenster for TauriFenster<'_, R> {
    fn offene_fenster(&self) -> Vec<String> {
        use tauri::Manager;
        self.0.webview_windows().into_keys().collect()
    }
    fn anfrage_senden(&self, label: &str, id: u64) {
        senden(self.0, label, EREIGNIS_ANFRAGE, id);
    }
    fn abbruch_senden(&self, label: &str, id: u64) {
        senden(self.0, label, EREIGNIS_ABBRUCH, id);
    }
}

fn senden<R: tauri::Runtime>(app: &tauri::AppHandle<R>, label: &str, ereignis: &str, id: u64) {
    use tauri::Emitter;
    // Ein nicht erreichbares Fenster antwortet nicht; die Frist bricht dann ab.
    if let Err(fehler) = app.emit_to(label, ereignis, Nachricht { id }) {
        eprintln!("Beenden-Anfrage: {ereignis} an {label} nicht zugestellt: {fehler}");
    }
}

pub(crate) struct Frist;

impl BeendenFrist for Frist {
    fn ablauf(&self) -> impl Future<Output = ()> {
        tokio::time::sleep(FRIST)
    }
}

pub(crate) fn einrichten<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.manage(BeendenAnfrage::default())
}

#[tauri::command]
pub fn beenden_anfrage_antworten<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<BeendenAnfrage>,
    id: u64,
    bereit: bool,
) {
    state.antworten(window.label(), id, bereit);
}

#[tauri::command]
pub fn beenden_anfrage_rueckfrage<R: tauri::Runtime>(
    window: tauri::WebviewWindow<R>,
    state: tauri::State<BeendenAnfrage>,
    id: u64,
) {
    state.rueckfrage(window.label(), id);
}

pub(crate) fn fenster_zerstoert<R: tauri::Runtime>(window: &tauri::Window<R>) {
    use tauri::Manager;
    if let Some(state) = window.try_state::<BeendenAnfrage>() {
        state.fenster_verschwunden(window.label());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::{Cell, RefCell};
    use std::pin::pin;
    use std::task::Context;

    /// Ersetzte Fenster: zeichnet Anfragen und Abbruchnachrichten auf.
    struct TestFenster {
        offen: RefCell<Vec<String>>,
        anfragen: RefCell<Vec<(String, u64)>>,
        abbrueche: RefCell<Vec<String>>,
        bei_ermittlung: RefCell<Option<Box<dyn FnOnce()>>>,
        beim_ermitteln_verschwinden: Cell<bool>,
        panik_beim_senden: Cell<bool>,
    }

    impl TestFenster {
        fn mit(labels: &[&str]) -> Self {
            Self {
                offen: RefCell::new(labels.iter().map(|l| l.to_string()).collect()),
                anfragen: RefCell::new(Vec::new()),
                abbrueche: RefCell::new(Vec::new()),
                bei_ermittlung: RefCell::new(None),
                beim_ermitteln_verschwinden: Cell::new(false),
                panik_beim_senden: Cell::new(false),
            }
        }
        fn angefragt(&self) -> Vec<String> {
            self.anfragen
                .borrow()
                .iter()
                .map(|(l, _)| l.clone())
                .collect()
        }
        fn id(&self) -> u64 {
            self.anfragen.borrow()[0].1
        }
    }

    impl BeendenFenster for TestFenster {
        fn offene_fenster(&self) -> Vec<String> {
            let offen = self.offen.borrow().clone();
            if let Some(aktion) = self.bei_ermittlung.borrow_mut().take() {
                aktion();
            }
            if self.beim_ermitteln_verschwinden.replace(false) {
                self.offen.borrow_mut().clear();
            }
            offen
        }
        fn anfrage_senden(&self, label: &str, id: u64) {
            assert!(!self.panik_beim_senden.get(), "Panik beim Senden");
            self.anfragen.borrow_mut().push((label.into(), id));
        }
        fn abbruch_senden(&self, label: &str, _id: u64) {
            self.abbrueche.borrow_mut().push(label.into());
        }
    }

    /// Ersetzte Uhr: Die Frist läuft erst nach `ablaufen` ab.
    #[derive(Default)]
    struct TestFrist(Cell<bool>);

    impl BeendenFrist for TestFrist {
        fn ablauf(&self) -> impl Future<Output = ()> {
            std::future::poll_fn(|_| {
                if self.0.get() {
                    Poll::Ready(())
                } else {
                    Poll::Pending
                }
            })
        }
    }

    fn abfragen<F: Future>(future: std::pin::Pin<&mut F>) -> Poll<F::Output> {
        future.poll(&mut Context::from_waker(Waker::noop()))
    }

    const HILFS: &str = "kommentar-1";
    const HAUPT: &str = "main";
    const HAUPT2: &str = "fenster-2";

    #[test]
    fn alle_bereit_ergibt_bereit_und_fragt_erst_hilfs_dann_hauptfenster() {
        let anfrage = BeendenAnfrage::default();
        let fenster = TestFenster::mit(&[HAUPT, HILFS, HAUPT2, "ziehvorschau"]);
        let frist = TestFrist::default();
        let mut lauf = pin!(anfrage.anfragen(&fenster, &frist));

        assert!(abfragen(lauf.as_mut()).is_pending());
        assert_eq!(fenster.angefragt(), vec![HILFS]);
        let id = fenster.id();
        anfrage.antworten(HILFS, id, true);

        assert!(abfragen(lauf.as_mut()).is_pending());
        assert_eq!(fenster.angefragt(), vec![HILFS, HAUPT, HAUPT2]);
        anfrage.antworten(HAUPT, id, true);
        assert!(abfragen(lauf.as_mut()).is_pending());
        anfrage.antworten(HAUPT2, id, true);

        match abfragen(lauf.as_mut()) {
            Poll::Ready(BeendenErgebnis::AlleBereit(wache)) => wache.abschliessen(),
            _ => panic!("Alle Fenster sollten bereit sein"),
        };
        assert!(fenster.abbrueche.borrow().is_empty());
    }

    #[test]
    fn ablehnendes_hilfsfenster_bricht_ab_ohne_hauptfenster_anzufragen() {
        let anfrage = BeendenAnfrage::default();
        let fenster = TestFenster::mit(&[HAUPT, HILFS, "verweismarkierung-1"]);
        let frist = TestFrist::default();
        let mut lauf = pin!(anfrage.anfragen(&fenster, &frist));
        assert!(abfragen(lauf.as_mut()).is_pending());
        let id = fenster.id();
        anfrage.antworten("verweismarkierung-1", id, true);
        anfrage.antworten(HILFS, id, false);

        assert!(matches!(
            abfragen(lauf.as_mut()),
            Poll::Ready(BeendenErgebnis::Abbruch)
        ));
        assert!(!fenster.angefragt().contains(&HAUPT.to_string()));
        // Das bereits vorbereitete Fenster erhält die Abbruchnachricht, das ablehnende nicht.
        assert_eq!(*fenster.abbrueche.borrow(), vec!["verweismarkierung-1"]);
    }

    #[test]
    fn nach_abbruch_erhalten_vorbereitete_hauptfenster_die_abbruchnachricht() {
        let anfrage = BeendenAnfrage::default();
        let fenster = TestFenster::mit(&[HAUPT, HAUPT2, HILFS]);
        let frist = TestFrist::default();
        let mut lauf = pin!(anfrage.anfragen(&fenster, &frist));
        assert!(abfragen(lauf.as_mut()).is_pending());
        let id = fenster.id();
        anfrage.antworten(HILFS, id, true);
        assert!(abfragen(lauf.as_mut()).is_pending());
        anfrage.antworten(HAUPT, id, true);
        anfrage.antworten(HAUPT2, id, false);

        assert!(matches!(
            abfragen(lauf.as_mut()),
            Poll::Ready(BeendenErgebnis::Abbruch)
        ));
        let mut abbrueche = fenster.abbrueche.borrow().clone();
        abbrueche.sort();
        assert_eq!(abbrueche, vec![HILFS.to_string(), HAUPT.to_string()]);
    }

    #[test]
    fn ueberschrittene_frist_bricht_ab() {
        let anfrage = BeendenAnfrage::default();
        let fenster = TestFenster::mit(&[HAUPT]);
        let frist = TestFrist::default();
        let mut lauf = pin!(anfrage.anfragen(&fenster, &frist));
        assert!(abfragen(lauf.as_mut()).is_pending());
        frist.0.set(true);

        assert!(matches!(
            abfragen(lauf.as_mut()),
            Poll::Ready(BeendenErgebnis::Abbruch)
        ));
        // Auch das säumige Fenster erhält die Abbruchnachricht.
        assert_eq!(*fenster.abbrueche.borrow(), vec![HAUPT]);
        // Eine verspätete Antwort ändert nichts mehr; neue Anfragen sind möglich.
        anfrage.antworten(HAUPT, fenster.id(), true);
        let mut neu = pin!(anfrage.anfragen(&fenster, &frist));
        assert!(matches!(
            abfragen(neu.as_mut()),
            Poll::Ready(BeendenErgebnis::Abbruch)
        ));
    }

    #[test]
    fn verschwundenes_fenster_zaehlt_als_bereit() {
        let anfrage = BeendenAnfrage::default();
        let fenster = TestFenster::mit(&[HAUPT, HILFS]);
        let frist = TestFrist::default();
        let mut lauf = pin!(anfrage.anfragen(&fenster, &frist));
        assert!(abfragen(lauf.as_mut()).is_pending());
        anfrage.fenster_verschwunden(HILFS);
        assert!(abfragen(lauf.as_mut()).is_pending());
        anfrage.fenster_verschwunden(HAUPT);

        match abfragen(lauf.as_mut()) {
            Poll::Ready(BeendenErgebnis::AlleBereit(wache)) => wache.abschliessen(),
            _ => panic!("Alle Fenster sollten bereit sein"),
        };
    }

    #[test]
    fn neues_hilfsfenster_bricht_die_laufende_hauptfensterstufe_ab() {
        let anfrage = BeendenAnfrage::default();
        let fenster = TestFenster::mit(&[HILFS, HAUPT, HAUPT2]);
        let frist = TestFrist::default();
        let mut lauf = pin!(anfrage.anfragen(&fenster, &frist));
        assert!(abfragen(lauf.as_mut()).is_pending());
        let id = fenster.id();
        anfrage.antworten(HILFS, id, true);
        assert!(abfragen(lauf.as_mut()).is_pending());
        anfrage.antworten(HAUPT, id, true);
        anfrage.hilfsfenster_vormerken().unwrap().geoeffnet();

        assert!(matches!(
            abfragen(lauf.as_mut()),
            Poll::Ready(BeendenErgebnis::Abbruch)
        ));
        assert_eq!(*fenster.abbrueche.borrow(), vec![HILFS, HAUPT, HAUPT2]);
    }

    #[test]
    fn nur_vor_der_ermittlung_geoeffnetes_hilfsfenster_wird_regulaer_befragt() {
        let anfrage = std::rc::Rc::new(BeendenAnfrage::default());
        let fenster = TestFenster::mit(&[HILFS]);
        let frist = TestFrist::default();
        let mut lauf = pin!(anfrage.anfragen(&fenster, &frist));
        anfrage.hilfsfenster_vormerken().unwrap().geoeffnet();
        assert!(abfragen(lauf.as_mut()).is_pending());
        assert_eq!(fenster.angefragt(), vec![HILFS]);
        anfrage.antworten(HILFS, fenster.id(), true);
        let Poll::Ready(BeendenErgebnis::AlleBereit(wache)) = abfragen(lauf.as_mut()) else {
            panic!("Das bereits erfasste Hilfsfenster ist bereit");
        };
        wache.abschliessen();

        let neue_anfrage = std::rc::Rc::clone(&anfrage);
        let fenster = TestFenster::mit(&[HAUPT]);
        fenster.bei_ermittlung.replace(Some(Box::new(move || {
            neue_anfrage.hilfsfenster_vormerken().unwrap().geoeffnet();
        })));
        let mut lauf = pin!(anfrage.anfragen(&fenster, &frist));
        assert!(matches!(
            abfragen(lauf.as_mut()),
            Poll::Ready(BeendenErgebnis::Abbruch)
        ));
        assert!(fenster.angefragt().is_empty());
    }

    #[test]
    fn freigabe_und_neues_hilfsfenster_schliessen_einander_aus() {
        let anfrage = BeendenAnfrage::default();
        let fenster = TestFenster::mit(&[HAUPT]);
        let frist = TestFrist::default();
        let reservierung = anfrage.hilfsfenster_vormerken().unwrap();
        let mut lauf = pin!(anfrage.anfragen(&fenster, &frist));
        assert!(abfragen(lauf.as_mut()).is_pending());
        anfrage.antworten(HAUPT, fenster.id(), true);
        assert!(matches!(
            abfragen(lauf.as_mut()),
            Poll::Ready(BeendenErgebnis::Abbruch)
        ));
        assert_eq!(*fenster.abbrueche.borrow(), vec![HAUPT]);

        drop(reservierung);
        let mut neu = pin!(anfrage.anfragen(&fenster, &frist));
        assert!(abfragen(neu.as_mut()).is_pending());
        // Eine erfolglose Fenstererstellung während einer Anfrage bleibt folgenlos.
        drop(anfrage.hilfsfenster_vormerken().unwrap());
        let id = fenster.anfragen.borrow().last().unwrap().1;
        anfrage.antworten(HAUPT, id, true);
        let Poll::Ready(BeendenErgebnis::AlleBereit(wache)) = abfragen(neu.as_mut()) else {
            panic!("Die erfolglose Erstellung soll nicht weiter sperren");
        };
        assert!(anfrage.hilfsfenster_vormerken().is_none());
        drop(wache);
        assert!(anfrage.hilfsfenster_vormerken().is_some());
        assert_eq!(*fenster.abbrueche.borrow(), vec![HAUPT, HAUPT]);
    }

    #[test]
    fn zwischen_ermittlung_und_versand_verschwundenes_fenster_erfordert_keine_frist() {
        let anfrage = BeendenAnfrage::default();
        let fenster = TestFenster::mit(&[HILFS]);
        fenster.beim_ermitteln_verschwinden.set(true);
        let frist = TestFrist::default();
        let mut lauf = pin!(anfrage.anfragen(&fenster, &frist));

        match abfragen(lauf.as_mut()) {
            Poll::Ready(BeendenErgebnis::AlleBereit(wache)) => wache.abschliessen(),
            _ => panic!("Das verschwundene Fenster sollte als bereit gelten"),
        }
        assert!(fenster.angefragt().is_empty());
    }

    #[derive(Default)]
    struct TestUhr(Cell<Duration>);

    impl BeendenFrist for TestUhr {
        fn ablauf(&self) -> impl Future<Output = ()> {
            let ablauf = self.0.get() + FRIST;
            std::future::poll_fn(move |_| {
                if self.0.get() >= ablauf {
                    Poll::Ready(())
                } else {
                    Poll::Pending
                }
            })
        }
    }

    #[test]
    fn offene_rueckfrage_haelt_frist_an_und_nach_antwort_beginnt_sie_neu() {
        let zweites_hilfsfenster = "verweismarkierung-1";
        let anfrage = BeendenAnfrage::default();
        let fenster = TestFenster::mit(&[HILFS, zweites_hilfsfenster]);
        let uhr = TestUhr::default();
        let mut lauf = pin!(anfrage.anfragen(&fenster, &uhr));

        assert!(abfragen(lauf.as_mut()).is_pending());
        let id = fenster.id();
        uhr.0.set(Duration::from_secs(15));
        anfrage.rueckfrage(HILFS, id);
        assert!(abfragen(lauf.as_mut()).is_pending());

        uhr.0.set(Duration::from_secs(61));
        assert!(abfragen(lauf.as_mut()).is_pending());
        assert!(fenster.abbrueche.borrow().is_empty());
        anfrage.antworten(HILFS, id, true);
        assert!(abfragen(lauf.as_mut()).is_pending());

        anfrage.rueckfrage(zweites_hilfsfenster, id - 1);
        uhr.0.set(Duration::from_secs(90));
        assert!(abfragen(lauf.as_mut()).is_pending());
        uhr.0.set(Duration::from_secs(91));
        assert!(matches!(
            abfragen(lauf.as_mut()),
            Poll::Ready(BeendenErgebnis::Abbruch)
        ));
        assert_eq!(
            *fenster.abbrueche.borrow(),
            vec![HILFS, zweites_hilfsfenster]
        );
    }

    #[test]
    fn neue_anfrage_nach_panik_beim_senden_moeglich() {
        let anfrage = BeendenAnfrage::default();
        let fenster = TestFenster::mit(&[HAUPT]);
        let frist = TestFrist::default();
        fenster.panik_beim_senden.set(true);
        let fehlgeschlagen = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let mut lauf = pin!(anfrage.anfragen(&fenster, &frist));
            let _ = abfragen(lauf.as_mut());
        }));
        assert!(fehlgeschlagen.is_err());
        assert_eq!(*fenster.abbrueche.borrow(), vec![HAUPT]);

        fenster.panik_beim_senden.set(false);
        let mut lauf = pin!(anfrage.anfragen(&fenster, &frist));
        assert!(abfragen(lauf.as_mut()).is_pending());
        assert_eq!(fenster.angefragt(), vec![HAUPT]);
    }

    #[test]
    fn zweite_gleichzeitige_anfrage_wird_ohne_fensteraufruf_abgelehnt() {
        let anfrage = BeendenAnfrage::default();
        let fenster = TestFenster::mit(&[HAUPT]);
        let zweite_fenster = TestFenster::mit(&[HAUPT]);
        let frist = TestFrist::default();
        let mut erste = pin!(anfrage.anfragen(&fenster, &frist));
        assert!(abfragen(erste.as_mut()).is_pending());

        let mut zweite = pin!(anfrage.anfragen(&zweite_fenster, &frist));
        assert!(matches!(
            abfragen(zweite.as_mut()),
            Poll::Ready(BeendenErgebnis::LaeuftBereits)
        ));
        assert!(zweite_fenster.anfragen.borrow().is_empty());

        anfrage.antworten(HAUPT, fenster.id(), true);
        match abfragen(erste.as_mut()) {
            Poll::Ready(BeendenErgebnis::AlleBereit(wache)) => wache.abschliessen(),
            _ => panic!("Alle Fenster sollten bereit sein"),
        };
    }

    #[test]
    fn antworten_fremder_anfragen_zaehlen_nicht() {
        let anfrage = BeendenAnfrage::default();
        let fenster = TestFenster::mit(&[HAUPT]);
        let frist = TestFrist::default();
        let mut lauf = pin!(anfrage.anfragen(&fenster, &frist));
        assert!(abfragen(lauf.as_mut()).is_pending());
        anfrage.antworten(HAUPT, fenster.id() + 1, false);
        anfrage.antworten(HAUPT2, fenster.id(), false);
        assert!(abfragen(lauf.as_mut()).is_pending());
    }

    #[test]
    fn unabgeschlossene_anfrage_benachrichtigt_die_vorbereiteten_fenster_einmal() {
        let anfrage = BeendenAnfrage::default();
        let fenster = TestFenster::mit(&[HAUPT]);
        let frist = TestFrist::default();
        {
            let mut lauf = pin!(anfrage.anfragen(&fenster, &frist));
            assert!(abfragen(lauf.as_mut()).is_pending());
            anfrage.antworten(HAUPT, fenster.id(), true);
            assert!(matches!(
                abfragen(lauf.as_mut()),
                Poll::Ready(BeendenErgebnis::AlleBereit(_))
            ));
        }
        assert_eq!(*fenster.abbrueche.borrow(), vec![HAUPT]);
    }
}
