// Prozessweiter Zustand für FIFO-Dateisperren und Prüfvorgänge; Commands in der Begleitdatei.
mod befehle;
mod unterbrechung;
// Auch die von Tauri erzeugten Command-Makros für namespacierte Registrierung weiterreichen.
pub use befehle::*;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::Manager;
use tokio::sync::{Mutex as AsyncMutex, OwnedMutexGuard};
const DATEI_SPERRE_FRIST: Duration = Duration::from_secs(10);
const KONFLIKTDATEI: &str = "markierungskonflikte.xml";
static SITZUNG_ZAEHLER: AtomicU64 = AtomicU64::new(1);
struct Sitzung(u64);
impl tauri::Resource for Sitzung {}

// Die Ressource gehört zum tatsächlichen Fenster, nicht zu dessen wiederverwendbarem Label.
pub(crate) fn fenster_sitzung<R: tauri::Runtime>(window: &tauri::Window<R>) -> Result<u64, String> {
    let mut table = window.resources_table();
    let rid = table
        .names()
        .find_map(|(rid, name)| (name == std::any::type_name::<Sitzung>()).then_some(rid));
    if let Some(rid) = rid {
        return table
            .get::<Sitzung>(rid)
            .map(|s| s.0)
            .map_err(|e| e.to_string());
    }
    let id = SITZUNG_ZAEHLER.fetch_add(1, Ordering::Relaxed);
    table.add(Sitzung(id));
    Ok(id)
}

#[derive(Default)]
struct Verwaltung {
    dateien: HashMap<String, Arc<AsyncMutex<()>>>,
    tokens: HashMap<String, Halter>,
    geschlossen: HashSet<u64>,
    nummer: u64,
    vorgaenge: HashMap<String, Vorgang>,
    vollbedarf: bool,
    wiederholung: Wiederholung,
    // Zählt Prüfvorgangsänderungen und schreibende Zugriffe auf die Konfliktdatei;
    // eine unterbrochene Sperre erkennt daran fremde Änderungen.
    aenderungen: u64,
}
// Flüchtiger Abschlussverbrauch, kein fachlicher Auftrag. Nur ein erfolgreicher
// Vollabschluss räumt eine bereits verbrauchte Fehlerphase auf; auch Fehler
// neuer Hilfsquellen dürfen während der Wiederholung keine weitere Runde eröffnen.
#[derive(Default)]
enum Wiederholung {
    #[default]
    KeinFehler,
    Offen,
    Verbraucht,
}
struct Halter {
    pfad: String,
    sitzung: u64,
    // None: Sperre ist unterbrochen; der Token erlaubt dann keinerlei Zugriff.
    _guard: Option<OwnedMutexGuard<()>>,
    gueltig: bool,
    operationen: usize,
    unterbrochen_bei: Option<u64>,
}
#[derive(Clone, Default)]
pub struct DateiSperren(Arc<Mutex<Verwaltung>>, Arc<tokio::sync::Notify>);
struct Vorgang {
    sitzung: u64,
    quelle: bool,
    guards: usize,
    begonnen: bool,
    fehler: bool,
}
#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct VorgangsStand {
    pub(crate) offene_quellen: usize,
    pub(crate) offene_pruefungen: usize,
    pub(crate) vollbedarf: bool,
}
impl DateiSperren {
    fn zustand(&self) -> Result<std::sync::MutexGuard<'_, Verwaltung>, String> {
        // Gekoppelte Token-/Vorgangszähler können nach Panic unvollständig sein: sperren.
        self.0
            .lock()
            .map_err(|_| "Dateisperren-Verwaltung ist defekt.".to_string())
    }
    pub(crate) async fn erwerben(
        &self,
        sitzung: u64,
        pfad: &str,
        frist: Duration,
    ) -> Result<String, String> {
        let pfad = super::datei_io::validiere_relativen_pfad(pfad)?
            .to_string_lossy()
            .to_lowercase();
        let mutex = {
            let mut z = self.zustand()?;
            if z.geschlossen.contains(&sitzung) {
                return Err("Fenster ist geschlossen.".into());
            }
            z.dateien.entry(pfad.clone()).or_default().clone()
        };
        let guard = tokio::time::timeout(frist, mutex.lock_owned())
            .await
            .map_err(|_| "wartefrist".to_string())?;
        let mut z = self.zustand()?;
        if z.geschlossen.contains(&sitzung) {
            return Err("Fenster ist geschlossen.".into());
        }
        z.nummer = z
            .nummer
            .checked_add(1)
            .ok_or("Sperrtoken-Zähler ist erschöpft.")?;
        let token = z.nummer.to_string();
        z.tokens.insert(
            token.clone(),
            Halter {
                pfad,
                sitzung,
                _guard: Some(guard),
                gueltig: true,
                operationen: 0,
                unterbrochen_bei: None,
            },
        );
        Ok(token)
    }
    pub(crate) fn freigeben(&self, sitzung: u64, token: &str) -> Result<(), String> {
        let mut z = self.zustand()?;
        if let Some(h) = z.tokens.get_mut(token) {
            if h.sitzung != sitzung {
                return Err("Sperrtoken gehört einem anderen Fenster.".into());
            }
            h.gueltig = false;
            if h.operationen == 0 {
                z.tokens.remove(token);
            }
        }
        Ok(())
    }
    pub(crate) fn schliessen(&self, sitzung: u64) -> Result<(), String> {
        let mut z = self.zustand()?;
        z.geschlossen.insert(sitzung);
        z.tokens.retain(|_, h| {
            if h.sitzung == sitzung {
                h.gueltig = false;
            }
            h.gueltig || h.operationen > 0
        });
        let mut verloren = false;
        let mut neuer_fehler = false;
        for v in z.vorgaenge.values_mut().filter(|v| v.sitzung == sitzung) {
            verloren = true;
            neuer_fehler |= !v.fehler;
            v.fehler = true;
            if v.guards == 0 {
                v.quelle = false;
            }
        }
        z.vollbedarf |= verloren;
        if verloren {
            z.merke_aenderung();
        }
        if neuer_fehler {
            z.merke_fehler();
        }
        self.1.notify_waiters();
        Ok(())
    }
    // Unterbrechen und Fortsetzen: datei_sperre/unterbrechung.rs.
    // Erst NACH Erwerb der globalen I/O-Sperre aufrufen: wartende Operationen
    // werden nach Freigabe/Schließen vor jedem tatsächlichen Zugriff abgewiesen.
    pub(crate) fn operation(
        &self,
        sitzung: u64,
        pfad: &str,
        token: &str,
    ) -> Result<DateiOperation, String> {
        let mut z = self.zustand()?;
        let h = z.tokens.get_mut(token).ok_or("Sperrtoken ist ungültig.")?;
        if !h.gueltig || h._guard.is_none() || h.sitzung != sitzung || h.pfad != pfad.to_lowercase()
        {
            return Err("Sperrtoken passt nicht zu Fenster oder Datei.".into());
        }
        h.operationen += 1;
        if h.pfad == KONFLIKTDATEI {
            z.merke_aenderung();
        }
        Ok(DateiOperation {
            sperren: self.clone(),
            token: token.into(),
        })
    }
}
impl Verwaltung {
    fn merke_aenderung(&mut self) {
        self.aenderungen = self.aenderungen.wrapping_add(1);
    }
    fn merke_fehler(&mut self) {
        self.vollbedarf = true;
        if !matches!(self.wiederholung, Wiederholung::Verbraucht) {
            self.wiederholung = Wiederholung::Offen;
        }
    }
    fn konflikt_token(&self, sitzung: u64, token: &str) -> Result<(), String> {
        let h = self
            .tokens
            .get(token)
            .ok_or("Konfliktsperrtoken ist ungültig.")?;
        if self.geschlossen.contains(&sitzung)
            || !h.gueltig
            || h._guard.is_none()
            || h.sitzung != sitzung
            || h.pfad != KONFLIKTDATEI
        {
            return Err("Konfliktsperrtoken passt nicht zur Sitzung.".into());
        }
        Ok(())
    }
    fn stand(&self) -> VorgangsStand {
        VorgangsStand {
            offene_quellen: self.vorgaenge.values().filter(|v| v.quelle).count(),
            offene_pruefungen: self.vorgaenge.values().filter(|v| !v.quelle).count(),
            vollbedarf: self.vollbedarf,
        }
    }
}
impl DateiSperren {
    // Der Aufrufer reiht erst den Vollprüflauf ein und wartet außerhalb der
    // Konfliktsperre auf Quellen. Übernahme und anschließende Vollprüfung liegen
    // dann unter derselben Sperre; parallele Fenster können nie beide übernehmen.
    pub(crate) fn wiederholung_uebernehmen(
        &self,
        sitzung: u64,
        token: &str,
    ) -> Result<bool, String> {
        let mut z = self.zustand()?;
        z.konflikt_token(sitzung, token)?;
        if z.stand().offene_quellen > 0 {
            return Err("Quellen sind noch offen.".into());
        }
        if z.vollbedarf && matches!(z.wiederholung, Wiederholung::Offen) {
            z.wiederholung = Wiederholung::Verbraucht;
            Ok(true)
        } else {
            Ok(false)
        }
    }
    pub(crate) fn vorgang_registrieren(&self, sitzung: u64, token: &str) -> Result<String, String> {
        let mut z = self.zustand()?;
        z.konflikt_token(sitzung, token)?;
        z.nummer = z
            .nummer
            .checked_add(1)
            .ok_or("Vorgangszähler ist erschöpft.")?;
        let id = format!("v{}", z.nummer);
        z.merke_aenderung();
        z.vorgaenge.insert(
            id.clone(),
            Vorgang {
                sitzung,
                quelle: true,
                guards: 0,
                begonnen: false,
                fehler: false,
            },
        );
        Ok(id)
    }
    pub(crate) fn vorgang_aktion(
        &self,
        sitzung: u64,
        token: &str,
        vorgaenge: &[String],
        aktion: &str,
    ) -> Result<VorgangsStand, String> {
        let mut z = self.zustand()?;
        z.konflikt_token(sitzung, token)?;
        // Erst alle Verweise prüfen: ein fremder oder verfrühter Abschluss verändert nichts.
        for id in vorgaenge {
            if let Some(v) = z.vorgaenge.get(id) {
                if v.sitzung != sitzung {
                    return Err("Vorgang gehört einer anderen Sitzung.".into());
                }
                if v.guards > 0 && aktion != "fehler" {
                    return Err("Quellzugriffe laufen noch.".into());
                }
                if aktion == "abbrechen" && (!v.quelle || v.begonnen) {
                    return Err("Quelle wurde bereits begonnen.".into());
                }
                if aktion == "teil" && v.quelle {
                    return Err("Quelle ist noch offen.".into());
                }
            }
        }
        match aktion {
            "voll" => {
                if z.stand().offene_quellen > 0 {
                    return Err("Quellen sind noch offen.".into());
                }
                z.vorgaenge.clear();
                z.vollbedarf = false;
                z.wiederholung = Wiederholung::KeinFehler;
            }
            "bedarf" => z.vollbedarf = true,
            "fehler" => {
                // Ein verspäteter Fehler zu bereits erledigten Verweisen eröffnet keinen neuen Bedarf.
                let neuer_quellfehler = vorgaenge
                    .iter()
                    .any(|id| z.vorgaenge.get(id).is_some_and(|v| !v.fehler));
                if vorgaenge.is_empty() || vorgaenge.iter().any(|id| z.vorgaenge.contains_key(id)) {
                    z.vollbedarf = true;
                    if neuer_quellfehler || matches!(z.wiederholung, Wiederholung::KeinFehler) {
                        z.merke_fehler();
                    }
                }
                for id in vorgaenge {
                    if let Some(v) = z.vorgaenge.get_mut(id) {
                        v.fehler = true;
                        if v.guards == 0 {
                            v.quelle = false;
                        }
                    }
                }
            }
            "quelle" => {
                for id in vorgaenge {
                    if let Some(v) = z.vorgaenge.get_mut(id) {
                        v.quelle = false;
                    }
                }
            }
            "abbrechen" | "teil" => {
                for id in vorgaenge {
                    z.vorgaenge.remove(id);
                }
            }
            "stand" => {}
            _ => return Err("Unbekannter Vorgangsabschluss.".into()),
        }
        if aktion != "stand" {
            z.merke_aenderung();
        }
        let stand = z.stand();
        self.1.notify_waiters();
        Ok(stand)
    }
    // Vor spawn_blocking anmelden; keine Dateiberechtigung und kein Ersatz für Tokenprüfung.
    pub(crate) fn quell_operation(
        &self,
        sitzung: u64,
        pfad: &std::path::Path,
        vorgang: Option<&str>,
    ) -> Result<Option<QuellOperation>, String> {
        let segmente: Vec<_> = pfad.iter().collect();
        let ist_quelle = segmente.len() == 2
            && matches!(
                segmente[0].to_str(),
                Some("gesetze" | "markierungen" | "nichtamtliche-titel")
            )
            && pfad
                .extension()
                .and_then(|e| e.to_str())
                .is_some_and(|e| e.eq_ignore_ascii_case("xml"));
        if !ist_quelle {
            return if vorgang.is_some() {
                Err("Vorgangsverweis ist für diesen Dateityp nicht erlaubt.".into())
            } else {
                Ok(None)
            };
        }
        let id = vorgang.ok_or("Prüfpflichtige Quelle benötigt einen vorgemerkten Vorgang.")?;
        let mut z = self.zustand()?;
        if z.geschlossen.contains(&sitzung) {
            return Err("Fenster ist geschlossen.".into());
        }
        let v = z.vorgaenge.get_mut(id).ok_or("Vorgang ist ungültig.")?;
        if v.sitzung != sitzung || !v.quelle {
            return Err("Vorgang passt nicht zur aktiven Quellphase.".into());
        }
        v.guards += 1;
        v.begonnen = true;
        Ok(Some(QuellOperation {
            sperren: self.clone(),
            vorgang: id.into(),
            erfolgreich: false,
        }))
    }
    async fn quellen_abwarten(&self, sitzung: u64) -> Result<(), String> {
        tokio::time::timeout(DATEI_SPERRE_FRIST, async {
            loop {
                let notified = self.1.notified();
                tokio::pin!(notified);
                notified.as_mut().enable();
                {
                    let z = self.zustand()?;
                    if z.geschlossen.contains(&sitzung) {
                        return Err("Fenster ist geschlossen.".into());
                    }
                    if z.stand().offene_quellen == 0 {
                        return Ok(());
                    }
                }
                notified.await;
            }
        })
        .await
        .map_err(|_| "wartefrist".to_string())?
    }
}
pub(crate) struct QuellOperation {
    sperren: DateiSperren,
    vorgang: String,
    erfolgreich: bool,
}
impl QuellOperation {
    pub(crate) fn erfolgreich(&mut self) {
        self.erfolgreich = true;
    }
}
impl Drop for QuellOperation {
    fn drop(&mut self) {
        if let Ok(mut z) = self.sperren.zustand() {
            let geschlossen = z
                .vorgaenge
                .get(&self.vorgang)
                .is_some_and(|v| z.geschlossen.contains(&v.sitzung));
            if !self.erfolgreich {
                z.vollbedarf = true;
                if z.vorgaenge.get(&self.vorgang).is_some_and(|v| !v.fehler) {
                    z.merke_fehler();
                }
            }
            z.merke_aenderung();
            if let Some(v) = z.vorgaenge.get_mut(&self.vorgang) {
                v.guards -= 1;
                v.fehler |= !self.erfolgreich;
                if v.guards == 0 && (geschlossen || v.fehler) {
                    v.quelle = false;
                }
            }
            self.sperren.1.notify_waiters();
        }
    }
}
pub(crate) struct DateiOperation {
    sperren: DateiSperren,
    token: String,
}
impl Drop for DateiOperation {
    fn drop(&mut self) {
        match self.sperren.zustand() {
            Ok(mut z) => {
                if let Some(h) = z.tokens.get_mut(&self.token) {
                    h.operationen -= 1;
                    if !h.gueltig && h.operationen == 0 {
                        z.tokens.remove(&self.token);
                    }
                }
            }
            Err(e) => eprintln!("Dateisperre konnte nicht bereinigt werden: {e}"),
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    async fn einreihen<F: std::future::Future>(future: std::pin::Pin<&mut F>) {
        let mut future = future;
        std::future::poll_fn(|cx| {
            assert!(future.as_mut().poll(cx).is_pending());
            std::task::Poll::Ready(())
        })
        .await;
    }
    #[test]
    fn wiederholung_wird_fensteruebergreifend_nur_einmal_uebernommen() {
        tauri::async_runtime::block_on(async {
            let s = DateiSperren::default();
            let t = s
                .erwerben(1, "markierungskonflikte.xml", Duration::from_secs(1))
                .await
                .unwrap();
            assert!(!s.wiederholung_uebernehmen(1, &t).unwrap());
            s.vorgang_aktion(1, &t, &[], "fehler").unwrap();
            assert!(s.wiederholung_uebernehmen(1, &t).unwrap());
            s.vorgang_aktion(1, &t, &[], "fehler").unwrap();
            s.vorgang_aktion(1, &t, &[], "bedarf").unwrap();
            s.vorgang_aktion(1, &t, &[], "teil").unwrap();
            assert!(!s.wiederholung_uebernehmen(1, &t).unwrap());
            s.freigeben(1, &t).unwrap();
            let t = s
                .erwerben(2, "markierungskonflikte.xml", Duration::from_secs(1))
                .await
                .unwrap();
            assert!(!s.wiederholung_uebernehmen(2, &t).unwrap());
            s.vorgang_aktion(2, &t, &[], "voll").unwrap();
            assert!(!s.wiederholung_uebernehmen(2, &t).unwrap());
            s.vorgang_aktion(2, &t, &[], "fehler").unwrap();
            assert!(s.wiederholung_uebernehmen(2, &t).unwrap());
        });
    }

    #[test]
    fn neue_quellfehler_erneuern_keine_bereits_verbrauchte_fehlerphase() {
        tauri::async_runtime::block_on(async {
            let s = DateiSperren::default();
            let t = s
                .erwerben(1, "markierungskonflikte.xml", Duration::from_secs(1))
                .await
                .unwrap();
            let a = s.vorgang_registrieren(1, &t).unwrap();
            s.vorgang_aktion(1, &t, std::slice::from_ref(&a), "fehler")
                .unwrap();
            assert!(s.wiederholung_uebernehmen(1, &t).unwrap());
            s.vorgang_aktion(1, &t, std::slice::from_ref(&a), "fehler")
                .unwrap();
            assert!(!s.wiederholung_uebernehmen(1, &t).unwrap());
            let b = s.vorgang_registrieren(1, &t).unwrap();
            // Noch offene Quellen dürfen auch eine verfügbare Wiederholung nicht verbrauchen.
            assert!(s.wiederholung_uebernehmen(1, &t).is_err());
            s.vorgang_aktion(1, &t, std::slice::from_ref(&b), "fehler")
                .unwrap();
            assert!(!s.wiederholung_uebernehmen(1, &t).unwrap());
            s.vorgang_aktion(1, &t, &[], "voll").unwrap();
            s.vorgang_aktion(1, &t, &[a, b], "fehler").unwrap();
            assert!(!s.wiederholung_uebernehmen(1, &t).unwrap());
            assert!(!s.zustand().unwrap().vollbedarf);
        });
    }

    #[test]
    fn wiederholung_bleibt_bei_offenen_quellen_und_falschem_token_unverbraucht() {
        tauri::async_runtime::block_on(async {
            let s = DateiSperren::default();
            let t = s
                .erwerben(1, "markierungskonflikte.xml", Duration::from_secs(1))
                .await
                .unwrap();
            let a = s.vorgang_registrieren(1, &t).unwrap();
            s.vorgang_aktion(1, &t, &[], "fehler").unwrap();
            assert!(s.wiederholung_uebernehmen(1, &t).is_err());
            assert!(s.wiederholung_uebernehmen(2, &t).is_err());
            s.vorgang_aktion(1, &t, &[a], "quelle").unwrap();
            assert!(s.wiederholung_uebernehmen(1, "falsch").is_err());
            assert!(s.wiederholung_uebernehmen(1, &t).unwrap());
        });
    }

    #[test]
    fn nativer_io_fehler_eroeffnet_keine_doppelte_wiederholung_durch_js_abschluss() {
        tauri::async_runtime::block_on(async {
            let s = DateiSperren::default();
            let t = s
                .erwerben(1, "markierungskonflikte.xml", Duration::from_secs(1))
                .await
                .unwrap();
            let a = s.vorgang_registrieren(1, &t).unwrap();
            let guard = s
                .quell_operation(1, std::path::Path::new("gesetze/A.xml"), Some(&a))
                .unwrap()
                .unwrap();
            drop(guard);
            assert!(s.wiederholung_uebernehmen(1, &t).unwrap());
            s.vorgang_aktion(1, &t, &[a], "fehler").unwrap();
            assert!(!s.wiederholung_uebernehmen(1, &t).unwrap());
        });
    }

    #[test]
    fn konkurrierende_fenster_uebernehmen_zusammen_genau_eine_wiederholung() {
        tauri::async_runtime::block_on(async {
            let s = DateiSperren::default();
            let t = s
                .erwerben(1, "markierungskonflikte.xml", Duration::from_secs(1))
                .await
                .unwrap();
            s.vorgang_aktion(1, &t, &[], "fehler").unwrap();
            let mut zweites =
                std::pin::pin!(s.erwerben(2, "markierungskonflikte.xml", Duration::from_secs(1)));
            let mut drittes =
                std::pin::pin!(s.erwerben(3, "markierungskonflikte.xml", Duration::from_secs(1)));
            einreihen(zweites.as_mut()).await;
            einreihen(drittes.as_mut()).await;
            s.freigeben(1, &t).unwrap();
            let t2 = zweites.await.unwrap();
            assert!(s.wiederholung_uebernehmen(2, &t2).unwrap());
            // Der erste Wiederholungsversuch scheitert und lässt Bedarf sichtbar stehen.
            s.vorgang_aktion(2, &t2, &[], "fehler").unwrap();
            s.freigeben(2, &t2).unwrap();
            let t3 = drittes.await.unwrap();
            assert!(!s.wiederholung_uebernehmen(3, &t3).unwrap());
            assert!(s.zustand().unwrap().vollbedarf);
        });
    }

    #[test]
    fn verlorene_quelle_ist_bis_guardende_gesperrt_und_eroeffnet_nur_eine_runde() {
        tauri::async_runtime::block_on(async {
            let s = DateiSperren::default();
            let t = s
                .erwerben(1, "markierungskonflikte.xml", Duration::from_secs(1))
                .await
                .unwrap();
            let a = s.vorgang_registrieren(1, &t).unwrap();
            let guard = s
                .quell_operation(1, std::path::Path::new("gesetze/A.xml"), Some(&a))
                .unwrap()
                .unwrap();
            s.schliessen(1).unwrap();
            assert!(s.wiederholung_uebernehmen(1, &t).is_err());
            let t = s
                .erwerben(2, "markierungskonflikte.xml", Duration::from_secs(1))
                .await
                .unwrap();
            assert!(s.wiederholung_uebernehmen(2, &t).is_err());
            drop(guard);
            assert!(s.wiederholung_uebernehmen(2, &t).unwrap());
            s.schliessen(1).unwrap();
            s.vorgang_aktion(2, &t, &[], "fehler").unwrap();
            assert!(!s.wiederholung_uebernehmen(2, &t).unwrap());
            s.vorgang_aktion(2, &t, &[], "voll").unwrap();
            assert_eq!(s.zustand().unwrap().stand().offene_pruefungen, 0);
        });
    }

    #[test]
    fn hilfsquellen_und_fensterverlust_erneuern_keine_verbrauchte_runde() {
        tauri::async_runtime::block_on(async {
            let s = DateiSperren::default();
            let t = s
                .erwerben(1, "markierungskonflikte.xml", Duration::from_secs(1))
                .await
                .unwrap();
            s.vorgang_aktion(1, &t, &[], "fehler").unwrap();
            assert!(s.wiederholung_uebernehmen(1, &t).unwrap());
            let a = s.vorgang_registrieren(1, &t).unwrap();
            drop(
                s.quell_operation(1, std::path::Path::new("gesetze/A.xml"), Some(&a))
                    .unwrap(),
            );
            assert!(!s.wiederholung_uebernehmen(1, &t).unwrap());
            s.vorgang_registrieren(1, &t).unwrap();
            s.schliessen(1).unwrap();
            let t = s
                .erwerben(2, "markierungskonflikte.xml", Duration::from_secs(1))
                .await
                .unwrap();
            assert!(!s.wiederholung_uebernehmen(2, &t).unwrap());
        });
    }

    #[test]
    fn quellen_benoetigen_auch_ohne_dateitoken_einen_vorgang() {
        let s = DateiSperren::default();
        for ordner in ["gesetze", "markierungen", "nichtamtliche-titel"] {
            for endung in ["xml", "XML", "Xml", "xMl"] {
                let pfad = std::path::PathBuf::from(format!("{ordner}/BGB.{endung}"));
                assert!(s.quell_operation(1, &pfad, None).is_err());
            }
        }
        assert!(s
            .quell_operation(1, std::path::Path::new("favoriten/BGB.XML"), None)
            .unwrap()
            .is_none());
    }

    #[test]
    fn quelltyperkennung_nutzt_native_pfadkomponenten_ohne_neue_berechtigung() {
        tauri::async_runtime::block_on(async {
            let s = DateiSperren::default();
            let t = s
                .erwerben(1, "markierungskonflikte.xml", Duration::from_secs(1))
                .await
                .unwrap();
            let v = s.vorgang_registrieren(1, &t).unwrap();
            let alter_pfad = format!("nichtamtliche{}titel/BGB.xml", ' ');
            assert!(s
                .quell_operation(1, std::path::Path::new(&alter_pfad), Some(&v))
                .is_err());
            for ordner in ["gesetze", "markierungen", "nichtamtliche-titel"] {
                let name = format!("{ordner}{}BGB.XML", std::path::MAIN_SEPARATOR);
                let mut guard = s
                    .quell_operation(1, std::path::Path::new(&name), Some(&v))
                    .unwrap()
                    .unwrap();
                guard.erfolgreich();
            }
            assert!(s
                .quell_operation(
                    1,
                    std::path::Path::new("gesetze/unterordner/BGB.xml"),
                    Some(&v)
                )
                .is_err());
            assert!(s
                .quell_operation(1, std::path::Path::new("gesetze/BGB.json"), Some(&v))
                .is_err());
            assert!(s
                .quell_operation(1, std::path::Path::new("favoriten/BGB.xml"), None)
                .unwrap()
                .is_none());
            let fremd = s
                .erwerben(1, "fremd.xml", Duration::from_secs(1))
                .await
                .unwrap();
            assert!(s.vorgang_registrieren(1, &fremd).is_err());
        });
    }
    #[test]
    fn lebenszyklus_sperrt_fremde_und_fruehe_abschluesse_und_behaelt_fehler() {
        tauri::async_runtime::block_on(async {
            let s = DateiSperren::default();
            let t = s
                .erwerben(1, "markierungskonflikte.xml", Duration::from_secs(1))
                .await
                .unwrap();
            let a = s.vorgang_registrieren(1, &t).unwrap();
            let b = s.vorgang_registrieren(1, &t).unwrap();
            let ids = [a.clone()];
            assert!(s.vorgang_aktion(2, &t, &ids, "quelle").is_err());
            assert!(s.vorgang_aktion(1, &t, &ids, "teil").is_err());
            let mut guard = s
                .quell_operation(1, std::path::Path::new("gesetze/BGB.xml"), Some(&a))
                .unwrap()
                .unwrap();
            assert!(s.vorgang_aktion(1, &t, &ids, "quelle").is_err());
            assert!(s.vorgang_aktion(1, &t, &ids, "abbrechen").is_err());
            assert!(s
                .quell_operation(2, std::path::Path::new("gesetze/BGB.xml"), Some(&a))
                .is_err());
            assert!(s
                .quell_operation(1, std::path::Path::new("favoriten/BGB.xml"), Some(&a))
                .is_err());
            guard.erfolgreich();
            drop(guard);
            s.vorgang_aktion(1, &t, &ids, "quelle").unwrap();
            assert!(s
                .quell_operation(1, std::path::Path::new("gesetze/BGB.xml"), Some(&a))
                .is_err());
            s.vorgang_aktion(1, &t, &[b], "fehler").unwrap();
            let stand = s.vorgang_aktion(1, &t, &ids, "teil").unwrap();
            assert!(stand.vollbedarf);
            s.vorgang_aktion(1, &t, &ids, "teil").unwrap();
            s.vorgang_aktion(1, &t, &[], "voll").unwrap();
            assert!(!s.vorgang_aktion(1, &t, &ids, "fehler").unwrap().vollbedarf);
            let neu = s.vorgang_registrieren(1, &t).unwrap();
            assert_ne!(neu, a);
            assert_eq!(
                s.vorgang_aktion(1, &t, &ids, "quelle")
                    .unwrap()
                    .offene_quellen,
                1
            );
            s.vorgang_aktion(1, &t, &[neu], "abbrechen").unwrap();
            assert_eq!(s.zustand().unwrap().vorgaenge.len(), 0);
        });
    }
    #[test]
    fn mehrere_guards_fensterverlust_und_tokenloses_warten() {
        tauri::async_runtime::block_on(async {
            let s = DateiSperren::default();
            let t = s
                .erwerben(1, "markierungskonflikte.xml", Duration::from_secs(1))
                .await
                .unwrap();
            let a = s.vorgang_registrieren(1, &t).unwrap();
            let g1 = s
                .quell_operation(1, std::path::Path::new("gesetze/BGB.xml"), Some(&a))
                .unwrap();
            let mut g2 = s
                .quell_operation(1, std::path::Path::new("markierungen/BGB.xml"), Some(&a))
                .unwrap()
                .unwrap();
            s.schliessen(1).unwrap();
            assert!(s
                .quell_operation(1, std::path::Path::new("gesetze/BGB.xml"), Some(&a))
                .is_err());
            let mut warten = Box::pin(s.quellen_abwarten(2));
            einreihen(warten.as_mut()).await;
            let t2 = s
                .erwerben(2, "markierungskonflikte.xml", Duration::from_secs(1))
                .await
                .unwrap();
            assert!(s.vorgang_aktion(2, &t2, &[], "voll").is_err());
            drop(g1); // Fehlgeschlagener erster Zugriff darf zweiten Guard nicht übergehen.
            einreihen(warten.as_mut()).await;
            g2.erfolgreich();
            drop(g2);
            warten.await.unwrap();
            let stand = s.vorgang_aktion(2, &t2, &[], "stand").unwrap();
            assert_eq!(stand.offene_quellen, 0);
            assert_eq!(stand.offene_pruefungen, 1);
            assert!(stand.vollbedarf);
            let stand = s.vorgang_aktion(2, &t2, &[], "voll").unwrap();
            assert_eq!(stand.offene_pruefungen, 0);
            assert!(!stand.vollbedarf);
        });
    }
    #[test]
    fn fensterverlust_vor_io_und_unbegonnener_abbruch_lassen_keine_quelle_offen() {
        tauri::async_runtime::block_on(async {
            let s = DateiSperren::default();
            let t = s
                .erwerben(1, "markierungskonflikte.xml", Duration::from_secs(1))
                .await
                .unwrap();
            let a = s.vorgang_registrieren(1, &t).unwrap();
            s.vorgang_aktion(1, &t, &[a], "abbrechen").unwrap();
            assert!(!s.zustand().unwrap().vollbedarf);
            let b = s.vorgang_registrieren(1, &t).unwrap();
            s.schliessen(1).unwrap();
            assert!(s
                .quell_operation(1, std::path::Path::new("gesetze/BGB.xml"), Some(&b))
                .is_err());
            s.quellen_abwarten(2).await.unwrap();
            assert!(s.zustand().unwrap().vollbedarf);
        });
    }
    #[test]
    fn parallele_tasks_und_mehrere_fristablaeufe_erzeugen_keinen_zweiten_halter() {
        tauri::async_runtime::block_on(async {
            let s = DateiSperren::default();
            let aktiv = Arc::new(std::sync::atomic::AtomicUsize::new(0));
            let erster = s
                .erwerben(1, "a.xml", Duration::from_secs(1))
                .await
                .unwrap();
            aktiv.fetch_add(1, Ordering::SeqCst);
            let mut tasks = Vec::new();
            for id in 2..6 {
                let s = s.clone();
                let aktiv = aktiv.clone();
                tasks.push(tauri::async_runtime::spawn(async move {
                    let ergebnis = s.erwerben(id, "a.xml", Duration::from_millis(20)).await;
                    assert_eq!(aktiv.load(Ordering::SeqCst), 1);
                    assert_eq!(ergebnis.unwrap_err(), "wartefrist");
                }));
            }
            for t in tasks {
                t.await.unwrap();
            }
            aktiv.fetch_sub(1, Ordering::SeqCst);
            s.freigeben(1, &erster).unwrap();
            let mut tasks = Vec::new();
            for id in 6..14 {
                let s = s.clone();
                let aktiv = aktiv.clone();
                tasks.push(tauri::async_runtime::spawn(async move {
                    let token = s
                        .erwerben(id, "a.xml", Duration::from_secs(1))
                        .await
                        .unwrap();
                    assert_eq!(aktiv.fetch_add(1, Ordering::SeqCst), 0);
                    tokio::time::sleep(Duration::from_millis(1)).await;
                    assert_eq!(aktiv.fetch_sub(1, Ordering::SeqCst), 1);
                    s.freigeben(id, &token).unwrap();
                }));
            }
            for t in tasks {
                t.await.unwrap();
            }
        });
    }
    #[test]
    fn unterbrochene_sperre_gibt_frei_und_sperrt_den_eigenen_token() {
        tauri::async_runtime::block_on(async {
            let s = DateiSperren::default();
            let t = s
                .erwerben(1, KONFLIKTDATEI, Duration::from_secs(1))
                .await
                .unwrap();
            assert!(s.unterbrechen(2, &t).is_err());
            s.unterbrechen(1, &t).unwrap();
            assert!(s.unterbrechen(1, &t).is_err());
            // Ohne gehaltene Sperre: weder Schreiben noch Prüfvorgangsaktionen.
            assert!(s.operation(1, KONFLIKTDATEI, &t).is_err());
            assert!(s.vorgang_registrieren(1, &t).is_err());
            assert!(s.vorgang_aktion(1, &t, &[], "stand").is_err());
            let fremd = s
                .erwerben(2, KONFLIKTDATEI, Duration::from_millis(20))
                .await
                .unwrap();
            assert_eq!(
                s.fortsetzen(1, &t, Duration::from_millis(20))
                    .await
                    .unwrap_err(),
                "wartefrist"
            );
            // Lesender fremder Halter ohne Änderung.
            s.vorgang_aktion(2, &fremd, &[], "stand").unwrap();
            s.freigeben(2, &fremd).unwrap();
            assert!(s.fortsetzen(1, &t, Duration::from_secs(1)).await.unwrap());
            assert!(s.fortsetzen(1, &t, Duration::from_secs(1)).await.is_err());
            assert!(s.operation(1, KONFLIKTDATEI, &t).is_ok());
        });
    }
    #[test]
    fn fortsetzen_meldet_fremde_vorgangs_und_konfliktdateiaenderungen() {
        tauri::async_runtime::block_on(async {
            let s = DateiSperren::default();
            let t = s
                .erwerben(1, KONFLIKTDATEI, Duration::from_secs(1))
                .await
                .unwrap();
            let a = s.vorgang_registrieren(1, &t).unwrap();
            // Registrierung durch anderen Halter.
            s.unterbrechen(1, &t).unwrap();
            let f = s
                .erwerben(2, KONFLIKTDATEI, Duration::from_secs(1))
                .await
                .unwrap();
            s.vorgang_registrieren(2, &f).unwrap();
            s.freigeben(2, &f).unwrap();
            assert!(!s.fortsetzen(1, &t, Duration::from_secs(1)).await.unwrap());
            // Schreibender Zugriff auf die Konfliktdatei.
            s.unterbrechen(1, &t).unwrap();
            let f = s
                .erwerben(2, KONFLIKTDATEI, Duration::from_secs(1))
                .await
                .unwrap();
            drop(s.operation(2, KONFLIKTDATEI, &f).unwrap());
            s.freigeben(2, &f).unwrap();
            assert!(!s.fortsetzen(1, &t, Duration::from_secs(1)).await.unwrap());
            // Abgeschlossener Quellzugriff ohne Konfliktsperre.
            s.unterbrechen(1, &t).unwrap();
            drop(
                s.quell_operation(1, std::path::Path::new("gesetze/A.xml"), Some(&a))
                    .unwrap(),
            );
            assert!(!s.fortsetzen(1, &t, Duration::from_secs(1)).await.unwrap());
            // Andere Dateien zählen nicht.
            s.unterbrechen(1, &t).unwrap();
            let b = s
                .erwerben(2, "favoriten.xml", Duration::from_secs(1))
                .await
                .unwrap();
            drop(s.operation(2, "favoriten.xml", &b).unwrap());
            assert!(s.fortsetzen(1, &t, Duration::from_secs(1)).await.unwrap());
        });
    }
    #[test]
    fn unterbrechen_verlangt_ruhende_zugriffe_und_offenes_fenster() {
        tauri::async_runtime::block_on(async {
            let s = DateiSperren::default();
            let t = s
                .erwerben(1, KONFLIKTDATEI, Duration::from_secs(1))
                .await
                .unwrap();
            let op = s.operation(1, KONFLIKTDATEI, &t).unwrap();
            assert!(s.unterbrechen(1, &t).is_err());
            drop(op);
            s.unterbrechen(1, &t).unwrap();
            s.schliessen(1).unwrap();
            assert!(s.fortsetzen(1, &t, Duration::from_secs(1)).await.is_err());
            assert!(s
                .erwerben(2, KONFLIKTDATEI, Duration::from_millis(20))
                .await
                .is_ok());
        });
    }
    #[test]
    fn wartende_erwerben_fifo_ohne_ueberlappung() {
        tauri::async_runtime::block_on(async {
            let s = DateiSperren::default();
            let t = s
                .erwerben(1, "a.xml", Duration::from_secs(1))
                .await
                .unwrap();
            let mut a = Box::pin(s.erwerben(2, "a.xml", Duration::from_secs(1)));
            let mut b = Box::pin(s.erwerben(3, "a.xml", Duration::from_secs(1)));
            einreihen(a.as_mut()).await;
            einreihen(b.as_mut()).await;
            s.freigeben(1, &t).unwrap();
            let erster = a.await.unwrap();
            einreihen(b.as_mut()).await;
            s.freigeben(2, &erster).unwrap();
            let zweiter = b.await.unwrap();
            s.freigeben(3, &zweiter).unwrap();
        });
    }
    #[test]
    fn geschlossenes_wartendes_fenster_erhaelt_keinen_token() {
        tauri::async_runtime::block_on(async {
            let s = DateiSperren::default();
            let t = s
                .erwerben(1, "a.xml", Duration::from_secs(1))
                .await
                .unwrap();
            let mut wartend = Box::pin(s.erwerben(2, "a.xml", Duration::from_secs(1)));
            einreihen(wartend.as_mut()).await;
            s.schliessen(2).unwrap();
            s.freigeben(1, &t).unwrap();
            assert!(wartend.await.is_err());
            assert!(s
                .erwerben(2, "b.xml", Duration::from_secs(1))
                .await
                .is_err());
            assert!(s.erwerben(3, "a.xml", Duration::from_secs(1)).await.is_ok());
        });
    }
    #[test]
    fn token_prueft_sitzung_pfad_und_normale_freigabe_laufender_operation() {
        tauri::async_runtime::block_on(async {
            let s = DateiSperren::default();
            s.freigeben(1, "unbekannt").unwrap();
            let t = s
                .erwerben(1, "a.xml", Duration::from_secs(1))
                .await
                .unwrap();
            assert!(s.operation(2, "a.xml", &t).is_err());
            assert!(s.operation(1, "b.xml", &t).is_err());
            assert!(s.freigeben(2, &t).is_err());
            let op = s.operation(1, "a.xml", &t).unwrap();
            s.freigeben(1, &t).unwrap();
            s.freigeben(1, &t).unwrap();
            assert!(s.operation(1, "a.xml", &t).is_err());
            assert_eq!(
                s.erwerben(2, "a.xml", Duration::from_millis(20))
                    .await
                    .unwrap_err(),
                "wartefrist"
            );
            drop(op);
            let neu = s
                .erwerben(2, "a.xml", Duration::from_secs(1))
                .await
                .unwrap();
            s.schliessen(1).unwrap();
            s.freigeben(1, &t).unwrap();
            assert!(s.operation(2, "A.xml", &neu).is_ok());
        });
    }
    #[test]
    fn vergiftete_verwaltung_liefert_fehler() {
        let s = DateiSperren::default();
        let andere = s.clone();
        let _ = std::thread::spawn(move || {
            let _z = andere.0.lock().unwrap();
            panic!("gezielte Vergiftung");
        })
        .join();
        assert!(s.freigeben(1, "unbekannt").is_err());
        assert!(s.schliessen(1).is_err());
        tauri::async_runtime::block_on(async {
            assert!(s
                .erwerben(1, "a.xml", Duration::from_secs(1))
                .await
                .is_err());
        });
    }
    #[test]
    fn frist_gibt_halter_nicht_frei_und_pfade_sind_unabhaengig() {
        tauri::async_runtime::block_on(async {
            let s = DateiSperren::default();
            let t = s
                .erwerben(1, "A.xml", Duration::from_millis(20))
                .await
                .unwrap();
            assert_eq!(
                s.erwerben(2, "a.xml", Duration::from_millis(20))
                    .await
                    .unwrap_err(),
                "wartefrist"
            );
            let b = s
                .erwerben(2, "b.xml", Duration::from_millis(20))
                .await
                .unwrap();
            s.freigeben(2, &b).unwrap();
            s.freigeben(1, &t).unwrap();
            assert!(s
                .erwerben(2, "a.xml", Duration::from_millis(20))
                .await
                .is_ok());
        });
    }
    #[test]
    fn schliessen_haelt_laufende_operation_und_invalidiert_token() {
        tauri::async_runtime::block_on(async {
            let s = DateiSperren::default();
            let t = s
                .erwerben(1, "a.xml", Duration::from_millis(20))
                .await
                .unwrap();
            let op = s.operation(1, "a.xml", &t).unwrap();
            s.schliessen(1).unwrap();
            assert!(s.operation(1, "a.xml", &t).is_err());
            assert_eq!(
                s.erwerben(2, "a.xml", Duration::from_millis(20))
                    .await
                    .unwrap_err(),
                "wartefrist"
            );
            drop(op);
            let neu = s
                .erwerben(2, "a.xml", Duration::from_millis(20))
                .await
                .unwrap();
            s.freigeben(1, &t).unwrap();
            assert!(s.operation(2, "a.xml", &neu).is_ok());
        });
    }
}

#[cfg(test)]
mod native_vertrag_tests {
    use super::*;
    #[test]
    fn pruefstand_command_entnimmt_die_tatsaechlichen_argumente() {
        let daten: serde_json::Value = serde_json::from_str(include_str!(
            "../../../src/test/plattform/native-vertraege.json"
        ))
        .unwrap();
        let app = tauri::test::mock_builder()
            .manage(DateiSperren::default())
            .invoke_handler(tauri::generate_handler![pruefvorgang_abfragen])
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let main = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        let sitzung = fenster_sitzung(&main.as_ref().window()).unwrap();
        let sperren = app.state::<DateiSperren>();
        let token = tauri::async_runtime::block_on(sperren.erwerben(
            sitzung,
            "markierungskonflikte.xml",
            std::time::Duration::from_secs(1),
        ))
        .unwrap();
        {
            let mut verwaltung = sperren.zustand().unwrap();
            verwaltung.vollbedarf = true;
            for (name, quelle) in [
                ("quelle-eins", true),
                ("quelle-zwei", true),
                ("pruefung", false),
            ] {
                verwaltung.vorgaenge.insert(
                    name.into(),
                    Vorgang {
                        sitzung,
                        quelle,
                        guards: 0,
                        begonnen: false,
                        fehler: false,
                    },
                );
            }
        }
        let aufruf = |body| {
            tauri::test::get_ipc_response(
                &main,
                tauri::webview::InvokeRequest {
                    cmd: daten["pruefvorgang"]["command"].as_str().unwrap().into(),
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
        };
        let mut argumente = daten["pruefvorgang"]["argumente"].clone();
        argumente["konfliktToken"] = token.into();
        let antwort = aufruf(argumente.clone())
            .unwrap()
            .deserialize::<serde_json::Value>()
            .unwrap();
        assert_eq!(antwort, daten["pruefvorgang"]["stand"]);
        for falsch in [
            serde_json::json!({"konflikt_token": argumente["konfliktToken"], "vorgaenge": []}),
            serde_json::json!({"konfliktToken": argumente["konfliktToken"]}),
            serde_json::json!({"konfliktToken": argumente["konfliktToken"], "vorgaenge": "falsch"}),
        ] {
            assert!(aufruf(falsch).is_err());
        }
    }
    #[test]
    fn pruefvorgangsstand_serialisiert_feldnamen_und_typen() {
        let daten: serde_json::Value = serde_json::from_str(include_str!(
            "../../../src/test/plattform/native-vertraege.json"
        ))
        .unwrap();
        let stand = VorgangsStand {
            offene_quellen: 2,
            offene_pruefungen: 1,
            vollbedarf: true,
        };
        assert_eq!(
            serde_json::to_value(stand).unwrap(),
            daten["pruefvorgang"]["stand"]
        );
        let command = daten["pruefvorgang"]["command"].as_str().unwrap();
        assert_eq!(
            include_str!("../lib.rs")
                .matches(&format!("commands::datei_sperre::{command},"))
                .count(),
            2
        );
    }
}
