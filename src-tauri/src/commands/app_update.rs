// Prozessweiter App-Update-Zustand für alle Hauptfenster. Plugin-Aufrufe
// laufen über AppUpdateQuelle. Die Installation wartet auf die Beenden-Anfrage.
// Hauptfenster zeigen den zuletzt gemeldeten Stand. Während `herunterladen`
// oder `bereit` blendet die Updateprüfung das Angebot wieder ein.
use crate::fenster::beenden_anfrage::{
    BeendenAnfrage, BeendenErgebnis, BeendenFenster, BeendenFrist,
};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime};

mod plugin;
mod update_befehle;
pub use plugin::einrichten;
pub use update_befehle::*;

/// Abstand automatischer Prüfungen; die Frontends fragen stündlich, Rust entscheidet.
const AUTOMATISCH_ABSTAND: Duration = Duration::from_secs(24 * 60 * 60);
/// Abstand nach einer fehlgeschlagenen automatischen Prüfung.
const AUTOMATISCH_ABSTAND_NACH_FEHLER: Duration = Duration::from_secs(60 * 60);

/// Verständlicher Grund eines Fehlers; das technische Detail steht daneben.
#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Fehlergrund {
    KeineVerbindung,
    Signatur,
    Sonstiges,
}

#[derive(Clone, Debug, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase", tag = "art")]
pub enum AppUpdateZustand {
    #[default]
    Ruhe,
    Pruefung,
    Verfuegbar {
        version: String,
        installierbar: bool,
        ausgeblendet: bool,
    },
    Herunterladen {
        version: String,
        prozent: Option<u8>,
        ausgeblendet: bool,
    },
    Bereit {
        version: String,
        ausgeblendet: bool,
    },
    Fehler {
        version: Option<String>,
        grund: Fehlergrund,
        detail: String,
        ausgeblendet: bool,
    },
}

impl AppUpdateZustand {
    /// Ausblendbar ist jedes Angebot, gleich in welcher Stufe.
    fn ausgeblendet_mut(&mut self) -> Option<&mut bool> {
        match self {
            Self::Verfuegbar { ausgeblendet, .. }
            | Self::Herunterladen { ausgeblendet, .. }
            | Self::Bereit { ausgeblendet, .. }
            | Self::Fehler { ausgeblendet, .. } => Some(ausgeblendet),
            Self::Ruhe | Self::Pruefung => None,
        }
    }
}

/// Ordnet Zustandsereignisse und Zustandsabfragen desselben Prozesses.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
pub struct AppUpdateMeldung {
    folge: u64,
    #[serde(flatten)]
    zustand: AppUpdateZustand,
}

/// Anlass einer Updateprüfung. Nur die automatische Prüfung unterliegt der Fälligkeit.
#[derive(Clone, Copy, Debug, PartialEq, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Anlass {
    Automatisch,
    Manuell,
}

#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Ergebnisart {
    Gefunden,
    Aktuell,
    NichtFaellig,
    LaeuftBereits,
    Fehler,
}

#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
enum LaufenderVorgang {
    Pruefung,
    Herunterladen,
}

/// Ergebnis der konkreten Prüfung, zusätzlich zum gemeldeten Zustand.
/// Bei `fehler`: `grund` für die Anzeige, `detail` (englisch) nur für die Konsole.
#[derive(Clone, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Pruefergebnis {
    ergebnis: Ergebnisart,
    #[serde(skip_serializing_if = "Option::is_none")]
    laufender_vorgang: Option<LaufenderVorgang>,
    #[serde(skip_serializing_if = "Option::is_none")]
    grund: Option<Fehlergrund>,
    #[serde(skip_serializing_if = "Option::is_none")]
    detail: Option<String>,
}

impl Pruefergebnis {
    fn nur(ergebnis: Ergebnisart) -> Self {
        Self {
            ergebnis,
            laufender_vorgang: None,
            grund: None,
            detail: None,
        }
    }
    fn laeuft_bereits(vorgang: LaufenderVorgang) -> Self {
        Self {
            laufender_vorgang: Some(vorgang),
            ..Self::nur(Ergebnisart::LaeuftBereits)
        }
    }
}

/// Fehler der Plugin-Schicht, bereits eingeordnet.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct AppUpdateFehler {
    pub(crate) grund: Fehlergrund,
    pub(crate) detail: String,
}

/// Kleine Schnittstelle zum Updater-Plugin. `Fund` ist das gefundene Update,
/// `Paket` die heruntergeladenen und gegen den öffentlichen Schlüssel
/// geprüften Bytes.
pub(crate) trait AppUpdateQuelle {
    type Fund: Clone;
    type Paket;
    /// Version und Fund eines neueren Updates, `None` ohne neuere Version.
    async fn suchen(&self) -> Result<Option<(String, Self::Fund)>, AppUpdateFehler>;
    /// Lädt herunter und prüft die Signatur; meldet je Block (Länge, Gesamtgröße).
    async fn herunterladen(
        &self,
        fund: &Self::Fund,
        fortschritt: impl FnMut(usize, Option<u64>),
    ) -> Result<Self::Paket, AppUpdateFehler>;
    /// Installiert und startet neu; kehrt nur im Fehlerfall zurück.
    fn installieren(&self, fund: &Self::Fund, paket: &Self::Paket) -> Result<(), AppUpdateFehler>;
}

#[derive(Clone, Copy, Debug, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Installationsergebnis {
    BeendenLaeuftBereits,
    Abbruch,
    InstallationAufgerufen,
}

/// Ganze Prozent aus geladenen Bytes; ohne bekannte Gesamtgröße keine Angabe.
fn prozent(geladen: u64, gesamt: Option<u64>) -> Option<u8> {
    let gesamt = gesamt.filter(|gesamt| *gesamt > 0)?;
    Some((geladen.saturating_mul(100) / gesamt).min(100) as u8)
}

struct Stand<F, P> {
    zustand: AppUpdateZustand,
    folge: u64,
    /// Ab wann die nächste automatische Prüfung fällig ist; `None` vor der ersten.
    naechste_automatische: Option<SystemTime>,
    /// Gefundenes Update: bleibt für Download und erneuten Versuch.
    fund: Option<F>,
    /// Geladene, geprüfte Bytes im Zustand `bereit`; erst die Installation verbraucht sie.
    paket: Option<Arc<P>>,
    /// Installation einschließlich Beenden-Anfrage läuft.
    installation_laeuft: bool,
}

impl<F, P> Stand<F, P> {
    fn meldung(&self) -> AppUpdateMeldung {
        AppUpdateMeldung {
            folge: self.folge,
            zustand: self.zustand.clone(),
        }
    }

    // Noch unter derselben Sperre wie die Änderung aufrufen. Der Versand
    // kann später erfolgen; das Hauptfenster kennt die Reihenfolge.
    fn zustandsaenderung(&mut self) -> AppUpdateMeldung {
        self.folge += 1;
        self.meldung()
    }

    /// Die erste automatische Prüfung des Prozesses ist immer fällig, jede
    /// weitere 24 h nach Beginn der vorigen, nach einem Fehlschlag schon nach
    /// 1 h. Manuelle Prüfungen zählen nicht mit.
    fn automatisch_faellig(&self, jetzt: SystemTime) -> bool {
        self.naechste_automatische.is_none_or(|naechste| {
            jetzt >= naechste
                || naechste
                    .duration_since(jetzt)
                    .is_ok_and(|abstand| abstand > AUTOMATISCH_ABSTAND)
        })
    }
}

pub struct AppUpdate<F, P>(Mutex<Stand<F, P>>);

struct Installationswache<'a, F, P> {
    stand: &'a Mutex<Stand<F, P>>,
}

impl<F, P> Drop for Installationswache<'_, F, P> {
    fn drop(&mut self) {
        crate::sperren::sperren(self.stand).installation_laeuft = false;
    }
}

impl<F, P> Default for AppUpdate<F, P> {
    fn default() -> Self {
        Self(Mutex::new(Stand {
            zustand: AppUpdateZustand::Ruhe,
            folge: 0,
            naechste_automatische: None,
            fund: None,
            paket: None,
            installation_laeuft: false,
        }))
    }
}

impl<F: Clone, P> AppUpdate<F, P> {
    fn meldung(&self) -> AppUpdateMeldung {
        crate::sperren::sperren(&self.0).meldung()
    }

    fn setzen(&self, neu: AppUpdateZustand, melden: &impl Fn(&AppUpdateMeldung)) {
        let meldung = {
            let mut stand = crate::sperren::sperren(&self.0);
            stand.zustand = neu;
            stand.zustandsaenderung()
        };
        melden(&meldung);
    }

    /// Eine laufende Prüfung wird nie verdoppelt. Eine nicht fällige
    /// automatische Prüfung greift nicht aufs Netz zu. Ein Fehler stellt den
    /// vorherigen Zustand wieder her und erscheint nur im Ergebnis. Während
    /// `herunterladen`/`bereit` wird nicht geprüft; das Angebot erscheint wieder.
    /// `jetzt` ist die Uhr, damit Tests die Fälligkeit prüfen können.
    async fn pruefen<Q: AppUpdateQuelle<Fund = F, Paket = P>>(
        &self,
        anlass: Anlass,
        jetzt: SystemTime,
        quelle: &Q,
        installierbar: bool,
        melden: impl Fn(&AppUpdateMeldung),
    ) -> Pruefergebnis {
        let (vorher, pruefung) = {
            let mut stand = crate::sperren::sperren(&self.0);
            if stand.zustand == AppUpdateZustand::Pruefung {
                return Pruefergebnis::laeuft_bereits(LaufenderVorgang::Pruefung);
            }
            if anlass == Anlass::Automatisch {
                if !stand.automatisch_faellig(jetzt) {
                    return Pruefergebnis::nur(Ergebnisart::NichtFaellig);
                }
                stand.naechste_automatische = Some(jetzt + AUTOMATISCH_ABSTAND);
            }
            let ergebnis = match stand.zustand {
                AppUpdateZustand::Herunterladen { .. } => Some(Pruefergebnis::laeuft_bereits(
                    LaufenderVorgang::Herunterladen,
                )),
                AppUpdateZustand::Bereit { .. } => Some(Pruefergebnis::nur(Ergebnisart::Gefunden)),
                _ => None,
            };
            if let Some(ergebnis) = ergebnis {
                let wieder_zeigen = stand
                    .zustand
                    .ausgeblendet_mut()
                    .map(|ausgeblendet| std::mem::replace(ausgeblendet, false))
                    .unwrap_or(false);
                let meldung = wieder_zeigen.then(|| stand.zustandsaenderung());
                drop(stand);
                if let Some(meldung) = meldung {
                    melden(&meldung);
                }
                return ergebnis;
            }
            let vorher = std::mem::replace(&mut stand.zustand, AppUpdateZustand::Pruefung);
            (vorher, stand.zustandsaenderung())
        };
        melden(&pruefung);
        match quelle.suchen().await {
            Ok(Some((version, fund))) => {
                crate::sperren::sperren(&self.0).fund = Some(fund);
                self.setzen(
                    AppUpdateZustand::Verfuegbar {
                        version,
                        installierbar,
                        ausgeblendet: false,
                    },
                    &melden,
                );
                Pruefergebnis::nur(Ergebnisart::Gefunden)
            }
            Ok(None) => {
                crate::sperren::sperren(&self.0).fund = None;
                self.setzen(AppUpdateZustand::Ruhe, &melden);
                Pruefergebnis::nur(Ergebnisart::Aktuell)
            }
            Err(AppUpdateFehler { grund, detail }) => {
                if anlass == Anlass::Automatisch {
                    crate::sperren::sperren(&self.0).naechste_automatische =
                        Some(jetzt + AUTOMATISCH_ABSTAND_NACH_FEHLER);
                }
                self.setzen(vorher, &melden);
                Pruefergebnis {
                    ergebnis: Ergebnisart::Fehler,
                    laufender_vorgang: None,
                    grund: Some(grund),
                    detail: Some(detail),
                }
            }
        }
    }

    /// Blendet ein angebotenes Update in allen Hauptfenstern aus.
    fn ausblenden(&self, melden: impl Fn(&AppUpdateMeldung)) {
        let neu = {
            let mut stand = crate::sperren::sperren(&self.0);
            let Some(ausgeblendet) = stand.zustand.ausgeblendet_mut() else {
                return;
            };
            *ausgeblendet = true;
            stand.zustandsaenderung()
        };
        melden(&neu);
    }

    /// Lädt das angebotene Update (aus `verfuegbar` mit `installierbar` oder
    /// erneut aus `fehler`). Ein Aufruf während des Downloads startet keinen
    /// zweiten. Fortschritt nur bei Wechsel der ganzen Prozentzahl.
    async fn herunterladen<Q: AppUpdateQuelle<Fund = F, Paket = P>>(
        &self,
        quelle: &Q,
        melden: impl Fn(&AppUpdateMeldung),
    ) -> Result<(), String> {
        let (version, fund, start) = {
            let mut stand = crate::sperren::sperren(&self.0);
            let version = match &stand.zustand {
                AppUpdateZustand::Herunterladen { .. } => return Ok(()),
                AppUpdateZustand::Verfuegbar {
                    version,
                    installierbar: true,
                    ..
                }
                | AppUpdateZustand::Fehler {
                    version: Some(version),
                    ..
                } => version.clone(),
                _ => return Err("Kein herunterladbares App-Update.".into()),
            };
            let fund = stand
                .fund
                .clone()
                .ok_or_else(|| String::from("Kein herunterladbares App-Update."))?;
            stand.zustand = AppUpdateZustand::Herunterladen {
                version: version.clone(),
                prozent: None,
                ausgeblendet: false,
            };
            (version, fund, stand.zustandsaenderung())
        };
        melden(&start);

        let mut geladen = 0u64;
        let mut gemeldet = None;
        let ergebnis = quelle
            .herunterladen(&fund, |laenge, gesamt| {
                geladen = geladen.saturating_add(laenge as u64);
                let neu = prozent(geladen, gesamt);
                if neu.is_none() || neu == gemeldet {
                    return;
                }
                gemeldet = neu;
                let meldung = {
                    let mut stand = crate::sperren::sperren(&self.0);
                    if let AppUpdateZustand::Herunterladen { prozent, .. } = &mut stand.zustand {
                        *prozent = neu;
                    }
                    stand.zustandsaenderung()
                };
                melden(&meldung);
            })
            .await;

        let neu = {
            let mut stand = crate::sperren::sperren(&self.0);
            stand.zustand = match ergebnis {
                Ok(paket) => {
                    stand.paket = Some(Arc::new(paket));
                    AppUpdateZustand::Bereit {
                        version,
                        ausgeblendet: false,
                    }
                }
                Err(AppUpdateFehler { grund, detail }) => {
                    eprintln!("App-Update: Download fehlgeschlagen: {detail}");
                    AppUpdateZustand::Fehler {
                        version: Some(version),
                        grund,
                        detail,
                        ausgeblendet: false,
                    }
                }
            };
            stand.zustandsaenderung()
        };
        melden(&neu);
        Ok(())
    }

    /// Nur aus `bereit`: erst die Beenden-Anfrage, dann Installation und Neustart.
    async fn installieren<Q: AppUpdateQuelle<Fund = F, Paket = P>>(
        &self,
        quelle: &Q,
        anfrage: &BeendenAnfrage,
        fenster: &impl BeendenFenster,
        frist: &impl BeendenFrist,
        melden: impl Fn(&AppUpdateMeldung),
    ) -> Result<Installationsergebnis, String> {
        let _wache = {
            let mut stand = crate::sperren::sperren(&self.0);
            if stand.installation_laeuft {
                return Ok(Installationsergebnis::BeendenLaeuftBereits);
            }
            let bereit = matches!(stand.zustand, AppUpdateZustand::Bereit { .. })
                && stand.paket.is_some()
                && stand.fund.is_some();
            if !bereit {
                return Err("Kein installationsbereites App-Update.".into());
            }
            stand.installation_laeuft = true;
            Installationswache { stand: &self.0 }
        };
        let vorbereitet = match anfrage.anfragen(fenster, frist).await {
            BeendenErgebnis::AlleBereit(vorbereitet) => vorbereitet,
            BeendenErgebnis::Abbruch => return Ok(Installationsergebnis::Abbruch),
            BeendenErgebnis::LaeuftBereits => {
                return Ok(Installationsergebnis::BeendenLaeuftBereits)
            }
        };

        let (version, fund, paket) = {
            let stand = crate::sperren::sperren(&self.0);
            match (&stand.zustand, &stand.fund, &stand.paket) {
                (AppUpdateZustand::Bereit { version, .. }, Some(fund), Some(paket)) => {
                    (version.clone(), fund.clone(), Arc::clone(paket))
                }
                _ => return Err("Kein installationsbereites App-Update.".into()),
            }
        };

        // In der App kehrt die Installation nur im Fehlerfall zurück.
        let ergebnis = quelle.installieren(&fund, &paket);
        crate::sperren::sperren(&self.0).paket = None;
        match ergebnis {
            Ok(()) => vorbereitet.abschliessen(),
            Err(AppUpdateFehler { grund, detail }) => {
                eprintln!("App-Update: Installation fehlgeschlagen: {detail}");
                self.setzen(
                    AppUpdateZustand::Fehler {
                        version: Some(version),
                        grund,
                        detail,
                        ausgeblendet: false,
                    },
                    &melden,
                );
            }
        }
        Ok(Installationsergebnis::InstallationAufgerufen)
    }
}

#[cfg(test)]
mod tests;
