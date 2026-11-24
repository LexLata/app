// Tests der App-Update-Übergänge mit ersetztem Plugin und ersetzten Fenstern.
#![cfg(test)]
use super::*;
use std::cell::{Cell, RefCell};
use std::future::Future;
use std::pin::pin;
use std::rc::Rc;
use std::task::{Context, Poll, Waker};

type TestUpdate = AppUpdate<TestFund, Vec<u8>>;
type Download = (Vec<(usize, Option<u64>)>, Result<Vec<u8>, AppUpdateFehler>);

struct TestFund {
    version: String,
    panik_beim_kopieren: Rc<Cell<bool>>,
}

impl Clone for TestFund {
    fn clone(&self) -> Self {
        assert!(
            !self.panik_beim_kopieren.get(),
            "Panik vor dem Aufruf des Installers"
        );
        Self {
            version: self.version.clone(),
            panik_beim_kopieren: Rc::clone(&self.panik_beim_kopieren),
        }
    }
}

/// Ersetzt das Plugin: zählt Aufrufe und antwortet erst nach `freigeben`.
/// Der Fund ist die Version; das Paket sind die geladenen Bytes.
struct TestQuelle {
    aufrufe: Cell<u32>,
    antwort: RefCell<Option<Result<Option<String>, AppUpdateFehler>>>,
    downloads: Cell<u32>,
    download: RefCell<Option<Download>>,
    installation: RefCell<Result<(), AppUpdateFehler>>,
    installiert: RefCell<Vec<(String, Vec<u8>)>>,
    fund_panik: Rc<Cell<bool>>,
}

fn keine_verbindung(detail: &str) -> AppUpdateFehler {
    AppUpdateFehler {
        grund: Fehlergrund::KeineVerbindung,
        detail: detail.into(),
    }
}

impl TestQuelle {
    fn mit(antwort: Result<Option<String>, String>) -> Self {
        let quelle = Self::wartend();
        quelle.freigeben(antwort);
        quelle
    }
    fn wartend() -> Self {
        Self {
            aufrufe: Cell::new(0),
            antwort: RefCell::new(None),
            downloads: Cell::new(0),
            download: RefCell::new(None),
            installation: RefCell::new(Ok(())),
            installiert: RefCell::new(Vec::new()),
            fund_panik: Rc::new(Cell::new(false)),
        }
    }
    fn freigeben(&self, antwort: Result<Option<String>, String>) {
        *self.antwort.borrow_mut() = Some(antwort.map_err(|detail| keine_verbindung(&detail)));
    }
    fn download_freigeben(
        &self,
        bloecke: Vec<(usize, Option<u64>)>,
        ergebnis: Result<Vec<u8>, AppUpdateFehler>,
    ) {
        *self.download.borrow_mut() = Some((bloecke, ergebnis));
    }
}

impl AppUpdateQuelle for TestQuelle {
    type Fund = TestFund;
    type Paket = Vec<u8>;

    async fn suchen(&self) -> Result<Option<(String, TestFund)>, AppUpdateFehler> {
        self.aufrufe.set(self.aufrufe.get() + 1);
        std::future::poll_fn(|_| match self.antwort.borrow_mut().take() {
            Some(antwort) => Poll::Ready(antwort),
            None => Poll::Pending,
        })
        .await
        .map(|fund| {
            fund.map(|version| {
                let fund = TestFund {
                    version: version.clone(),
                    panik_beim_kopieren: Rc::clone(&self.fund_panik),
                };
                (version, fund)
            })
        })
    }

    async fn herunterladen(
        &self,
        _fund: &TestFund,
        mut fortschritt: impl FnMut(usize, Option<u64>),
    ) -> Result<Vec<u8>, AppUpdateFehler> {
        self.downloads.set(self.downloads.get() + 1);
        let (bloecke, ergebnis) =
            std::future::poll_fn(|_| match self.download.borrow_mut().take() {
                Some(download) => Poll::Ready(download),
                None => Poll::Pending,
            })
            .await;
        for (laenge, gesamt) in bloecke {
            fortschritt(laenge, gesamt);
        }
        ergebnis
    }

    fn installieren(&self, fund: &TestFund, paket: &Vec<u8>) -> Result<(), AppUpdateFehler> {
        self.installiert
            .borrow_mut()
            .push((fund.version.clone(), paket.clone()));
        self.installation.borrow().clone()
    }
}

struct TestFenster<'a> {
    anfrage: &'a BeendenAnfrage,
    aufrufe: Cell<u32>,
    id: Cell<Option<u64>>,
    antwort: Option<bool>,
    abbrueche: RefCell<Vec<(String, u64)>>,
}

impl<'a> TestFenster<'a> {
    fn mit(anfrage: &'a BeendenAnfrage, antwort: Option<bool>) -> Self {
        Self {
            anfrage,
            aufrufe: Cell::new(0),
            id: Cell::new(None),
            antwort,
            abbrueche: RefCell::new(Vec::new()),
        }
    }
}

impl BeendenFenster for TestFenster<'_> {
    fn offene_fenster(&self) -> Vec<String> {
        self.aufrufe.set(self.aufrufe.get() + 1);
        vec!["main".into()]
    }
    fn anfrage_senden(&self, label: &str, id: u64) {
        self.id.set(Some(id));
        if let Some(bereit) = self.antwort {
            self.anfrage.antworten(label, id, bereit);
        }
    }
    fn abbruch_senden(&self, label: &str, id: u64) {
        self.abbrueche.borrow_mut().push((label.into(), id));
    }
}

struct TestFrist;

impl BeendenFrist for TestFrist {
    fn ablauf(&self) -> impl Future<Output = ()> {
        std::future::pending()
    }
}

fn einmal_abfragen<F: Future>(future: std::pin::Pin<&mut F>) -> Poll<F::Output> {
    future.poll(&mut Context::from_waker(Waker::noop()))
}

fn fertig<F: Future>(future: F) -> F::Output {
    match einmal_abfragen(pin!(future)) {
        Poll::Ready(wert) => wert,
        Poll::Pending => panic!("Future sollte sofort fertig sein"),
    }
}

fn verfuegbar(version: &str, ausgeblendet: bool) -> AppUpdateZustand {
    AppUpdateZustand::Verfuegbar {
        version: version.into(),
        installierbar: true,
        ausgeblendet,
    }
}

fn herunterladen(prozent: Option<u8>) -> AppUpdateZustand {
    AppUpdateZustand::Herunterladen {
        version: "1.2.3".into(),
        prozent,
        ausgeblendet: false,
    }
}

fn bereit(ausgeblendet: bool) -> AppUpdateZustand {
    AppUpdateZustand::Bereit {
        version: "1.2.3".into(),
        ausgeblendet,
    }
}

/// Update 1.2.3 gefunden (installierbar wie angegeben).
fn mit_angebot(installierbar: bool) -> (TestUpdate, TestQuelle) {
    let update = TestUpdate::default();
    let quelle = TestQuelle::mit(Ok(Some("1.2.3".into())));
    fertig(update.pruefen(
        Anlass::Manuell,
        SystemTime::now(),
        &quelle,
        installierbar,
        |_| {},
    ));
    (update, quelle)
}

/// Update 1.2.3 heruntergeladen und bereit.
fn mit_bereitem_update() -> (TestUpdate, TestQuelle) {
    let (update, quelle) = mit_angebot(true);
    quelle.download_freigeben(vec![], Ok(vec![1, 2, 3]));
    fertig(update.herunterladen(&quelle, |_| {})).unwrap();
    assert_eq!(update.meldung().zustand, bereit(false));
    (update, quelle)
}

#[test]
fn fund_fuehrt_von_ruhe_ueber_pruefung_zu_verfuegbar() {
    let update = TestUpdate::default();
    let gemeldet = RefCell::new(Vec::new());
    let quelle = TestQuelle::mit(Ok(Some("1.2.3".into())));
    let ergebnis = fertig(
        update.pruefen(Anlass::Manuell, SystemTime::now(), &quelle, true, |z| {
            gemeldet.borrow_mut().push(z.zustand.clone())
        }),
    );
    assert_eq!(ergebnis, Pruefergebnis::nur(Ergebnisart::Gefunden));
    assert_eq!(
        *gemeldet.borrow(),
        vec![AppUpdateZustand::Pruefung, verfuegbar("1.2.3", false)]
    );
    assert_eq!(update.meldung().zustand, verfuegbar("1.2.3", false));
}

#[test]
fn ohne_fund_endet_die_pruefung_in_ruhe_mit_aktuell() {
    let update = TestUpdate::default();
    let gemeldet = RefCell::new(Vec::new());
    let ergebnis = fertig(update.pruefen(
        Anlass::Manuell,
        SystemTime::now(),
        &TestQuelle::mit(Ok(None)),
        true,
        |z| gemeldet.borrow_mut().push(z.zustand.clone()),
    ));
    assert_eq!(ergebnis, Pruefergebnis::nur(Ergebnisart::Aktuell));
    assert_eq!(
        *gemeldet.borrow(),
        vec![AppUpdateZustand::Pruefung, AppUpdateZustand::Ruhe]
    );
    assert_eq!(update.meldung().zustand, AppUpdateZustand::Ruhe);
}

#[test]
fn manuelle_pruefung_waehrend_laufender_pruefung_ruft_das_plugin_nicht_erneut() {
    let update = TestUpdate::default();
    let quelle = TestQuelle::wartend();
    let mut erste = pin!(update.pruefen(Anlass::Manuell, SystemTime::now(), &quelle, true, |_| {}));
    assert!(einmal_abfragen(erste.as_mut()).is_pending());
    assert_eq!(update.meldung().zustand, AppUpdateZustand::Pruefung);

    let zweite = fertig(update.pruefen(Anlass::Manuell, SystemTime::now(), &quelle, true, |_| {}));
    assert_eq!(
        zweite,
        Pruefergebnis::laeuft_bereits(LaufenderVorgang::Pruefung)
    );
    assert_eq!(quelle.aufrufe.get(), 1);

    quelle.freigeben(Ok(Some("2.0.0".into())));
    assert_eq!(
        einmal_abfragen(erste.as_mut()),
        Poll::Ready(Pruefergebnis::nur(Ergebnisart::Gefunden))
    );
    assert_eq!(quelle.aufrufe.get(), 1);
}

#[test]
fn prueffehler_liefert_fehler_und_laesst_den_zustand_unveraendert() {
    let update = TestUpdate::default();
    fertig(update.pruefen(
        Anlass::Manuell,
        SystemTime::now(),
        &TestQuelle::mit(Ok(Some("1.2.3".into()))),
        true,
        |_| {},
    ));
    update.ausblenden(|_| {});
    let vorher = update.meldung().zustand;

    let ergebnis = fertig(update.pruefen(
        Anlass::Manuell,
        SystemTime::now(),
        &TestQuelle::mit(Err("keine Verbindung".into())),
        true,
        |_| {},
    ));
    assert_eq!(
        ergebnis,
        Pruefergebnis {
            ergebnis: Ergebnisart::Fehler,
            laufender_vorgang: None,
            grund: Some(Fehlergrund::KeineVerbindung),
            detail: Some("keine Verbindung".into()),
        }
    );
    assert_eq!(update.meldung().zustand, vorher);
}

#[test]
fn ausblenden_setzt_ausgeblendet_und_benachrichtigt() {
    let update = TestUpdate::default();
    fertig(update.pruefen(
        Anlass::Manuell,
        SystemTime::now(),
        &TestQuelle::mit(Ok(Some("1.2.3".into()))),
        true,
        |_| {},
    ));
    let gemeldet = RefCell::new(Vec::new());
    update.ausblenden(|z| gemeldet.borrow_mut().push(z.zustand.clone()));
    assert_eq!(update.meldung().zustand, verfuegbar("1.2.3", true));
    assert_eq!(*gemeldet.borrow(), vec![verfuegbar("1.2.3", true)]);
}

#[test]
fn neuer_fund_zeigt_ein_ausgeblendetes_update_wieder() {
    let update = TestUpdate::default();
    fertig(update.pruefen(
        Anlass::Manuell,
        SystemTime::now(),
        &TestQuelle::mit(Ok(Some("1.2.3".into()))),
        true,
        |_| {},
    ));
    update.ausblenden(|_| {});
    fertig(update.pruefen(
        Anlass::Manuell,
        SystemTime::now(),
        &TestQuelle::mit(Ok(Some("1.2.3".into()))),
        true,
        |_| {},
    ));
    assert_eq!(update.meldung().zustand, verfuegbar("1.2.3", false));
}

#[test]
fn ausblenden_ohne_angebot_aendert_und_meldet_nichts() {
    let update = TestUpdate::default();
    let gemeldet = Cell::new(0);
    update.ausblenden(|_| gemeldet.set(gemeldet.get() + 1));
    assert_eq!(update.meldung().zustand, AppUpdateZustand::Ruhe);
    assert_eq!(gemeldet.get(), 0);
}

#[test]
fn fund_bei_deb_oder_rpm_ist_nicht_installierbar() {
    let update = TestUpdate::default();
    fertig(update.pruefen(
        Anlass::Manuell,
        SystemTime::now(),
        &TestQuelle::mit(Ok(Some("1.2.3".into()))),
        false,
        |_| {},
    ));
    assert_eq!(
        update.meldung().zustand,
        AppUpdateZustand::Verfuegbar {
            version: "1.2.3".into(),
            installierbar: false,
            ausgeblendet: false,
        }
    );
}

#[test]
fn zustand_und_ergebnis_folgen_dem_vertrag() {
    assert_eq!(
        serde_json::to_value(AppUpdateZustand::Ruhe).unwrap(),
        serde_json::json!({ "art": "ruhe" })
    );
    assert_eq!(
        serde_json::to_value(verfuegbar("1.2.3", true)).unwrap(),
        serde_json::json!({
            "art": "verfuegbar",
            "version": "1.2.3",
            "installierbar": true,
            "ausgeblendet": true
        })
    );
    assert_eq!(
        serde_json::to_value(Pruefergebnis::laeuft_bereits(LaufenderVorgang::Pruefung)).unwrap(),
        serde_json::json!({ "ergebnis": "laeuftBereits", "laufenderVorgang": "pruefung" })
    );
    assert_eq!(
        serde_json::to_value(Pruefergebnis::laeuft_bereits(
            LaufenderVorgang::Herunterladen
        ))
        .unwrap(),
        serde_json::json!({ "ergebnis": "laeuftBereits", "laufenderVorgang": "herunterladen" })
    );
    assert_eq!(
        serde_json::from_value::<Anlass>(serde_json::json!("manuell")).unwrap(),
        Anlass::Manuell
    );
    assert_eq!(
        serde_json::from_value::<Anlass>(serde_json::json!("automatisch")).unwrap(),
        Anlass::Automatisch
    );
    assert_eq!(
        serde_json::to_value(Pruefergebnis::nur(Ergebnisart::NichtFaellig)).unwrap(),
        serde_json::json!({ "ergebnis": "nichtFaellig" })
    );
}

fn stunden(n: u64) -> Duration {
    Duration::from_secs(n * 60 * 60)
}

/// Automatische Prüfung zum Zeitpunkt `start + versatz`.
fn automatisch(
    update: &TestUpdate,
    start: SystemTime,
    versatz: Duration,
    quelle: &TestQuelle,
) -> Pruefergebnis {
    fertig(update.pruefen(Anlass::Automatisch, start + versatz, quelle, true, |_| {}))
}

#[test]
fn automatische_pruefung_ist_erst_nach_24_stunden_wieder_faellig() {
    let update = TestUpdate::default();
    let start = SystemTime::now();
    let quelle = TestQuelle::mit(Ok(None));
    assert_eq!(
        automatisch(&update, start, Duration::ZERO, &quelle),
        Pruefergebnis::nur(Ergebnisart::Aktuell)
    );

    let ohne_netz = TestQuelle::wartend();
    assert_eq!(
        automatisch(&update, start, stunden(23), &ohne_netz),
        Pruefergebnis::nur(Ergebnisart::NichtFaellig)
    );
    assert_eq!(ohne_netz.aufrufe.get(), 0);

    let spaeter = TestQuelle::mit(Ok(Some("1.2.3".into())));
    assert_eq!(
        automatisch(&update, start, stunden(24), &spaeter),
        Pruefergebnis::nur(Ergebnisart::Gefunden)
    );
    assert_eq!(spaeter.aufrufe.get(), 1);
}

fn minuten(n: u64) -> Duration {
    Duration::from_secs(n * 60)
}

#[test]
fn nach_rueckwaertssprung_mit_mehr_als_24_stunden_bis_zur_faelligkeit_wird_geprueft() {
    let update = TestUpdate::default();
    let start = SystemTime::UNIX_EPOCH + stunden(48);
    let quelle = TestQuelle::mit(Ok(None));
    assert_eq!(
        automatisch(&update, start, Duration::ZERO, &quelle).ergebnis,
        Ergebnisart::Aktuell
    );
    let zurueckgestellt = start - Duration::from_secs(1);
    quelle.freigeben(Ok(None));
    assert_eq!(
        automatisch(&update, zurueckgestellt, Duration::ZERO, &quelle).ergebnis,
        Ergebnisart::Aktuell
    );
    assert_eq!(quelle.aufrufe.get(), 2);
}

#[test]
fn nach_fehlgeschlagener_automatischer_pruefung_ist_die_naechste_nach_einer_stunde_faellig() {
    let update = TestUpdate::default();
    let start = SystemTime::now();
    let fehler = TestQuelle::mit(Err("keine Verbindung".into()));
    assert_eq!(
        automatisch(&update, start, Duration::ZERO, &fehler).ergebnis,
        Ergebnisart::Fehler
    );
    let ohne_netz = TestQuelle::wartend();
    assert_eq!(
        automatisch(&update, start, minuten(59), &ohne_netz),
        Pruefergebnis::nur(Ergebnisart::NichtFaellig)
    );
    assert_eq!(ohne_netz.aufrufe.get(), 0);

    let wieder = TestQuelle::mit(Ok(None));
    assert_eq!(
        automatisch(&update, start, minuten(60), &wieder),
        Pruefergebnis::nur(Ergebnisart::Aktuell)
    );
    assert_eq!(wieder.aufrufe.get(), 1);

    // Nach dem Erfolg gilt wieder der Abstand von 24 h.
    assert_eq!(
        automatisch(&update, start, minuten(60) + stunden(23), &ohne_netz),
        Pruefergebnis::nur(Ergebnisart::NichtFaellig)
    );
    assert_eq!(
        automatisch(
            &update,
            start,
            minuten(60) + stunden(24),
            &TestQuelle::mit(Ok(None))
        ),
        Pruefergebnis::nur(Ergebnisart::Aktuell)
    );
}

#[test]
fn fehlgeschlagene_manuelle_pruefung_verkuerzt_die_automatische_faelligkeit_nicht() {
    let update = TestUpdate::default();
    let start = SystemTime::now();
    automatisch(&update, start, Duration::ZERO, &TestQuelle::mit(Ok(None)));
    fertig(update.pruefen(
        Anlass::Manuell,
        start + stunden(2),
        &TestQuelle::mit(Err("keine Verbindung".into())),
        true,
        |_| {},
    ));
    assert_eq!(
        automatisch(&update, start, stunden(4), &TestQuelle::wartend()),
        Pruefergebnis::nur(Ergebnisart::NichtFaellig)
    );
}

#[test]
fn manuelle_pruefung_verschiebt_die_automatische_faelligkeit_nicht() {
    let update = TestUpdate::default();
    let start = SystemTime::now();
    automatisch(&update, start, Duration::ZERO, &TestQuelle::mit(Ok(None)));
    fertig(update.pruefen(
        Anlass::Manuell,
        start + stunden(20),
        &TestQuelle::mit(Ok(None)),
        true,
        |_| {},
    ));
    assert_eq!(
        automatisch(&update, start, stunden(24), &TestQuelle::mit(Ok(None))),
        Pruefergebnis::nur(Ergebnisart::Aktuell)
    );
}

#[test]
fn manuelle_pruefung_macht_die_erste_automatische_nicht_unfaellig() {
    let update = TestUpdate::default();
    let start = SystemTime::now();
    fertig(update.pruefen(
        Anlass::Manuell,
        start,
        &TestQuelle::mit(Ok(None)),
        true,
        |_| {},
    ));
    assert_eq!(
        automatisch(&update, start, stunden(1), &TestQuelle::mit(Ok(None))),
        Pruefergebnis::nur(Ergebnisart::Aktuell)
    );
}

#[test]
fn nicht_faellige_automatische_pruefung_aendert_und_meldet_nichts() {
    let update = TestUpdate::default();
    let start = SystemTime::now();
    automatisch(
        &update,
        start,
        Duration::ZERO,
        &TestQuelle::mit(Ok(Some("1.2.3".into()))),
    );
    let gemeldet = Cell::new(0);
    fertig(update.pruefen(
        Anlass::Automatisch,
        start + stunden(1),
        &TestQuelle::wartend(),
        true,
        |_| gemeldet.set(gemeldet.get() + 1),
    ));
    assert_eq!(gemeldet.get(), 0);
    assert_eq!(update.meldung().zustand, verfuegbar("1.2.3", false));
}

#[test]
fn download_fuehrt_von_verfuegbar_ueber_herunterladen_zu_bereit() {
    let (update, quelle) = mit_angebot(true);
    let gemeldet = RefCell::new(Vec::new());
    let vor_download = update.meldung();
    let mut download =
        pin!(update.herunterladen(&quelle, |z| gemeldet.borrow_mut().push(z.clone())));
    assert!(einmal_abfragen(download.as_mut()).is_pending());
    assert_eq!(update.meldung().zustand, herunterladen(None));

    quelle.download_freigeben(
        vec![
            (10, Some(200)),
            (1, Some(200)),
            (89, Some(200)),
            (100, Some(200)),
        ],
        Ok(vec![7; 200]),
    );
    assert_eq!(einmal_abfragen(download.as_mut()), Poll::Ready(Ok(())));
    // Gedrosselt auf ganze Prozent: 5 % → 5 % (unverändert) → 50 % → 100 %.
    assert_eq!(
        gemeldet
            .borrow()
            .iter()
            .map(|meldung| meldung.zustand.clone())
            .collect::<Vec<_>>(),
        vec![
            herunterladen(None),
            herunterladen(Some(5)),
            herunterladen(Some(50)),
            herunterladen(Some(100)),
            bereit(false),
        ]
    );
    let gemeldet = gemeldet.borrow();
    assert!(vor_download.folge < gemeldet[0].folge);
    assert!(gemeldet
        .windows(2)
        .all(|paar| paar[0].folge < paar[1].folge));
    assert_eq!(gemeldet.last(), Some(&update.meldung()));
    // Nicht sofort installiert.
    assert!(quelle.installiert.borrow().is_empty());
}

#[test]
fn ohne_bekannte_groesse_meldet_der_download_keinen_prozentwert() {
    let (update, quelle) = mit_angebot(true);
    quelle.download_freigeben(vec![(10, None), (10, None)], Ok(vec![1]));
    let gemeldet = RefCell::new(Vec::new());
    fertig(update.herunterladen(&quelle, |z| gemeldet.borrow_mut().push(z.zustand.clone())))
        .unwrap();
    assert_eq!(*gemeldet.borrow(), vec![herunterladen(None), bereit(false)]);
}

#[test]
fn signaturfehler_fuehrt_zu_fehler_signatur_ohne_installation() {
    let (update, quelle) = mit_angebot(true);
    quelle.download_freigeben(
        vec![(5, Some(5))],
        Err(AppUpdateFehler {
            grund: Fehlergrund::Signatur,
            detail: "signature mismatch".into(),
        }),
    );
    fertig(update.herunterladen(&quelle, |_| {})).unwrap();
    assert_eq!(
        update.meldung().zustand,
        AppUpdateZustand::Fehler {
            version: Some("1.2.3".into()),
            grund: Fehlergrund::Signatur,
            detail: "signature mismatch".into(),
            ausgeblendet: false,
        }
    );
    assert!(quelle.installiert.borrow().is_empty());
    // Ohne geladenes Paket gibt es nichts zu installieren.
    let anfrage = BeendenAnfrage::default();
    let fenster = TestFenster::mit(&anfrage, Some(true));
    assert!(fertig(update.installieren(&quelle, &anfrage, &fenster, &TestFrist, |_| {})).is_err());
    assert!(quelle.installiert.borrow().is_empty());
}

#[test]
fn erneuter_versuch_nach_fehler_laedt_dasselbe_update_erneut() {
    let (update, quelle) = mit_angebot(true);
    quelle.download_freigeben(vec![], Err(keine_verbindung("connect")));
    fertig(update.herunterladen(&quelle, |_| {})).unwrap();
    assert!(matches!(
        update.meldung().zustand,
        AppUpdateZustand::Fehler {
            grund: Fehlergrund::KeineVerbindung,
            ..
        }
    ));
    quelle.download_freigeben(vec![], Ok(vec![1]));
    fertig(update.herunterladen(&quelle, |_| {})).unwrap();
    assert_eq!(update.meldung().zustand, bereit(false));
    assert_eq!(quelle.downloads.get(), 2);
}

#[test]
fn zweiter_download_aufruf_waehrend_des_downloads_startet_keinen_zweiten() {
    let (update, quelle) = mit_angebot(true);
    let mut erster = pin!(update.herunterladen(&quelle, |_| {}));
    assert!(einmal_abfragen(erster.as_mut()).is_pending());
    let gemeldet = Cell::new(0);
    assert_eq!(
        fertig(update.herunterladen(&quelle, |_| gemeldet.set(gemeldet.get() + 1))),
        Ok(())
    );
    assert_eq!(gemeldet.get(), 0);
    assert_eq!(quelle.downloads.get(), 1);
    quelle.download_freigeben(vec![], Ok(vec![1]));
    assert_eq!(einmal_abfragen(erster.as_mut()), Poll::Ready(Ok(())));
    assert_eq!(quelle.downloads.get(), 1);
}

#[test]
fn ohne_installierbares_angebot_wird_nicht_heruntergeladen() {
    let update = TestUpdate::default();
    let quelle = TestQuelle::wartend();
    assert!(fertig(update.herunterladen(&quelle, |_| {})).is_err());

    let (update, quelle) = mit_angebot(false);
    assert!(fertig(update.herunterladen(&quelle, |_| {})).is_err());
    assert_eq!(quelle.downloads.get(), 0);
    assert_eq!(
        update.meldung().zustand,
        AppUpdateZustand::Verfuegbar {
            version: "1.2.3".into(),
            installierbar: false,
            ausgeblendet: false,
        }
    );
}

#[test]
fn installation_beginnt_erst_wenn_alle_fenster_bereit_sind() {
    let (update, quelle) = mit_bereitem_update();
    let anfrage = BeendenAnfrage::default();
    let fenster = TestFenster::mit(&anfrage, None);
    let mut installation =
        pin!(update.installieren(&quelle, &anfrage, &fenster, &TestFrist, |_| {}));
    assert!(einmal_abfragen(installation.as_mut()).is_pending());
    assert!(quelle.installiert.borrow().is_empty());

    anfrage.antworten("main", fenster.id.get().unwrap(), true);
    assert_eq!(
        einmal_abfragen(installation.as_mut()),
        Poll::Ready(Ok(Installationsergebnis::InstallationAufgerufen))
    );
    assert_eq!(
        *quelle.installiert.borrow(),
        vec![("1.2.3".to_string(), vec![1, 2, 3])]
    );
}

#[test]
fn abgebrochene_beenden_anfrage_fuehrt_zurueck_zu_bereit_ohne_installation() {
    let (update, quelle) = mit_bereitem_update();
    let gemeldet = Cell::new(0);
    let anfrage = BeendenAnfrage::default();
    let fenster = TestFenster::mit(&anfrage, Some(false));
    assert_eq!(
        fertig(
            update.installieren(&quelle, &anfrage, &fenster, &TestFrist, |_| gemeldet
                .set(gemeldet.get() + 1))
        ),
        Ok(Installationsergebnis::Abbruch)
    );
    assert!(quelle.installiert.borrow().is_empty());
    assert!(fenster.abbrueche.borrow().is_empty());
    assert_eq!(update.meldung().zustand, bereit(false));
    assert_eq!(gemeldet.get(), 0);
    let fenster = TestFenster::mit(&anfrage, Some(true));
    fertig(update.installieren(&quelle, &anfrage, &fenster, &TestFrist, |_| {})).unwrap();
    assert_eq!(
        *quelle.installiert.borrow(),
        vec![("1.2.3".to_string(), vec![1, 2, 3])]
    );
}

#[test]
fn installieren_ausserhalb_von_bereit_wird_abgelehnt() {
    let anfrage = BeendenAnfrage::default();
    let fenster = TestFenster::mit(&anfrage, Some(true));
    let update = TestUpdate::default();
    let quelle = TestQuelle::wartend();
    assert!(fertig(update.installieren(&quelle, &anfrage, &fenster, &TestFrist, |_| {})).is_err());

    let (update, quelle) = mit_angebot(true);
    assert!(fertig(update.installieren(&quelle, &anfrage, &fenster, &TestFrist, |_| {})).is_err());
    let mut download = pin!(update.herunterladen(&quelle, |_| {}));
    assert!(einmal_abfragen(download.as_mut()).is_pending());
    assert!(fertig(update.installieren(&quelle, &anfrage, &fenster, &TestFrist, |_| {})).is_err());
    assert_eq!(fenster.aufrufe.get(), 0);
    assert!(quelle.installiert.borrow().is_empty());
}

#[test]
fn installation_und_beenden_blockieren_einander_und_freigabe_ist_moeglich() {
    use crate::fenster::beenden::beenden_wenn_bereit;

    let (update, quelle) = mit_bereitem_update();
    let anfrage = BeendenAnfrage::default();
    let fenster = TestFenster::mit(&anfrage, None);
    let andere_fenster = TestFenster::mit(&anfrage, Some(true));
    {
        let mut beenden = pin!(beenden_wenn_bereit(&anfrage, &fenster, &TestFrist, || {}));
        assert!(einmal_abfragen(beenden.as_mut()).is_pending());
        let ergebnis =
            fertig(update.installieren(&quelle, &anfrage, &andere_fenster, &TestFrist, |_| {}));
        assert_eq!(
            serde_json::to_value(ergebnis.unwrap()).unwrap(),
            "beendenLaeuftBereits"
        );
        assert_eq!(andere_fenster.aufrufe.get(), 0);
    }
    {
        let mut installation =
            pin!(update.installieren(&quelle, &anfrage, &fenster, &TestFrist, |_| {}));
        assert!(einmal_abfragen(installation.as_mut()).is_pending());
        assert!(!fertig(beenden_wenn_bereit(
            &anfrage,
            &andere_fenster,
            &TestFrist,
            || panic!("App wurde beendet")
        )));
        assert_eq!(
            fertig(update.installieren(&quelle, &anfrage, &andere_fenster, &TestFrist, |_| {})),
            Ok(Installationsergebnis::BeendenLaeuftBereits)
        );
        assert_eq!(andere_fenster.aufrufe.get(), 0);
    }
    assert_eq!(fenster.abbrueche.borrow().len(), 2);
    assert!(
        fertig(update.installieren(&quelle, &anfrage, &andere_fenster, &TestFrist, |_| {})).is_ok()
    );
}

#[test]
fn panik_nach_allen_zusagen_gibt_fenster_und_installation_frei() {
    let (update, quelle) = mit_bereitem_update();
    let anfrage = BeendenAnfrage::default();
    let fenster = TestFenster::mit(&anfrage, Some(true));
    quelle.fund_panik.set(true);
    let fehlgeschlagen = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        fertig(update.installieren(&quelle, &anfrage, &fenster, &TestFrist, |_| {}))
    }));
    assert!(fehlgeschlagen.is_err());
    assert_eq!(
        *fenster.abbrueche.borrow(),
        vec![("main".into(), fenster.id.get().unwrap())]
    );
    assert_eq!(update.meldung().zustand, bereit(false));
    assert!(quelle.installiert.borrow().is_empty());

    quelle.fund_panik.set(false);
    assert!(fertig(update.installieren(&quelle, &anfrage, &fenster, &TestFrist, |_| {})).is_ok());
    assert_eq!(quelle.installiert.borrow().len(), 1);
}

#[test]
fn installationsfehler_fuehrt_zu_fehler_und_erlaubt_erneuten_download() {
    let (update, quelle) = mit_bereitem_update();
    *quelle.installation.borrow_mut() = Err(AppUpdateFehler {
        grund: Fehlergrund::Sonstiges,
        detail: "rename failed".into(),
    });
    let gemeldet = RefCell::new(Vec::new());
    let anfrage = BeendenAnfrage::default();
    let fenster = TestFenster::mit(&anfrage, Some(true));
    fertig(
        update.installieren(&quelle, &anfrage, &fenster, &TestFrist, |z| {
            gemeldet.borrow_mut().push(z.zustand.clone())
        }),
    )
    .unwrap();
    assert_eq!(
        *fenster.abbrueche.borrow(),
        vec![("main".into(), fenster.id.get().unwrap())]
    );
    let fehler = AppUpdateZustand::Fehler {
        version: Some("1.2.3".into()),
        grund: Fehlergrund::Sonstiges,
        detail: "rename failed".into(),
        ausgeblendet: false,
    };
    assert_eq!(*gemeldet.borrow(), vec![fehler.clone()]);
    assert_eq!(update.meldung().zustand, fehler);
    quelle.download_freigeben(vec![], Ok(vec![4]));
    fertig(update.herunterladen(&quelle, |_| {})).unwrap();
    assert_eq!(update.meldung().zustand, bereit(false));
}

#[test]
fn pruefung_waehrend_download_oder_bereit_prueft_nicht_und_zeigt_das_angebot_wieder() {
    let (update, quelle) = mit_angebot(true);
    let mut download = pin!(update.herunterladen(&quelle, |_| {}));
    assert!(einmal_abfragen(download.as_mut()).is_pending());
    update.ausblenden(|_| {});
    let ohne_netz = TestQuelle::wartend();
    let gemeldet = RefCell::new(Vec::new());
    assert_eq!(
        fertig(
            update.pruefen(Anlass::Manuell, SystemTime::now(), &ohne_netz, true, |z| {
                update_befehle::hauptfenster_benachrichtigen(
                    ["main", "kommentar-1", "fenster-2", "ziehvorschau"].map(String::from),
                    |label| {
                        gemeldet
                            .borrow_mut()
                            .push((label.to_string(), z.zustand.clone()))
                    },
                );
            })
        ),
        Pruefergebnis::laeuft_bereits(LaufenderVorgang::Herunterladen)
    );
    assert_eq!(
        *gemeldet.borrow(),
        vec![
            ("main".into(), herunterladen(None)),
            ("fenster-2".into(), herunterladen(None)),
        ]
    );

    quelle.download_freigeben(vec![], Ok(vec![1]));
    assert_eq!(einmal_abfragen(download.as_mut()), Poll::Ready(Ok(())));
    update.ausblenden(|_| {});
    assert_eq!(update.meldung().zustand, bereit(true));
    assert_eq!(
        fertig(update.pruefen(
            Anlass::Automatisch,
            SystemTime::now(),
            &ohne_netz,
            true,
            |_| {}
        )),
        Pruefergebnis::nur(Ergebnisart::Gefunden)
    );
    assert_eq!(update.meldung().zustand, bereit(false));
    assert_eq!(ohne_netz.aufrufe.get(), 0);
    // Das geladene Paket bleibt erhalten.
    let anfrage = BeendenAnfrage::default();
    let fenster = TestFenster::mit(&anfrage, Some(true));
    fertig(update.installieren(&quelle, &anfrage, &fenster, &TestFrist, |_| {})).unwrap();
    assert_eq!(quelle.installiert.borrow().len(), 1);
}

#[test]
fn ausblenden_gilt_fuer_jede_stufe_des_angebots() {
    let (update, _quelle) = mit_bereitem_update();
    let gemeldet = RefCell::new(Vec::new());
    update.ausblenden(|z| gemeldet.borrow_mut().push(z.zustand.clone()));
    assert_eq!(*gemeldet.borrow(), vec![bereit(true)]);
}

#[test]
fn neue_stufen_folgen_dem_vertrag() {
    assert_eq!(
        serde_json::to_value(herunterladen(Some(42))).unwrap(),
        serde_json::json!({
            "art": "herunterladen", "version": "1.2.3", "prozent": 42, "ausgeblendet": false
        })
    );
    assert_eq!(
        serde_json::to_value(bereit(false)).unwrap(),
        serde_json::json!({ "art": "bereit", "version": "1.2.3", "ausgeblendet": false })
    );
    assert_eq!(
        serde_json::to_value(AppUpdateZustand::Fehler {
            version: Some("1.2.3".into()),
            grund: Fehlergrund::KeineVerbindung,
            detail: "x".into(),
            ausgeblendet: false,
        })
        .unwrap(),
        serde_json::json!({
            "art": "fehler", "version": "1.2.3", "grund": "keineVerbindung",
            "detail": "x", "ausgeblendet": false
        })
    );
    assert_eq!(
        serde_json::to_value(Pruefergebnis {
            ergebnis: Ergebnisart::Fehler,
            laufender_vorgang: None,
            grund: Some(Fehlergrund::Sonstiges),
            detail: Some("x".into()),
        })
        .unwrap(),
        serde_json::json!({ "ergebnis": "fehler", "grund": "sonstiges", "detail": "x" })
    );
}

#[test]
fn prozent_rundet_ab_und_begrenzt_auf_hundert() {
    assert_eq!(prozent(0, Some(200)), Some(0));
    assert_eq!(prozent(199, Some(200)), Some(99));
    assert_eq!(prozent(300, Some(200)), Some(100));
    assert_eq!(prozent(10, Some(0)), None);
    assert_eq!(prozent(10, None), None);
}
