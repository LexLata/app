// fenster/ziehvorschau/zustand.rs – Kennungen und Abschlussgrenzen laufender Ziehvorschauen.
use std::collections::HashMap;

#[derive(Clone, Debug, PartialEq, Eq)]
pub(super) struct Zug {
    pub quelle: String,
    pub kennung: u64,
}

#[derive(Default)]
pub(super) struct ZugZustand {
    pub aktiv: Option<Zug>,
    beendet: HashMap<String, u64>,
}

impl ZugZustand {
    pub fn oeffnen(&mut self, zug: &Zug) -> bool {
        if self.aktiv.is_some()
            || zug.kennung == 0
            || self
                .beendet
                .get(&zug.quelle)
                .is_some_and(|ende| zug.kennung <= *ende)
        {
            return false;
        }
        self.aktiv = Some(zug.clone());
        true
    }
    pub fn passt(&self, zug: &Zug) -> bool {
        self.aktiv.as_ref() == Some(zug)
    }
    pub fn schliessen(&mut self, zug: &Zug) {
        let ende = self.beendet.entry(zug.quelle.clone()).or_default();
        *ende = (*ende).max(zug.kennung);
        if self.passt(zug) {
            self.aktiv = None;
        }
    }
    pub fn quelle_schliessen(&mut self, quelle: &str) {
        if let Some(zug) = self.aktiv.clone().filter(|zug| zug.quelle == quelle) {
            self.schliessen(&zug);
        }
        // Auch noch nicht verarbeitete Öffnungsaufrufe dieser zerstörten
        // Quelle dürfen keinen Zug mehr beginnen. Quelllabels sind je Prozess eindeutig.
        self.beendet.insert(quelle.to_owned(), u64::MAX);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn zug(quelle: &str, kennung: u64) -> Zug {
        Zug {
            quelle: quelle.into(),
            kennung,
        }
    }
    #[test]
    fn zerstoerte_quelle_darf_auch_mit_verspaetetem_oeffnen_keinen_zug_beginnen() {
        let mut z = ZugZustand::default();
        z.quelle_schliessen("main");
        assert!(!z.oeffnen(&zug("main", 1)));
        assert!(!z.oeffnen(&zug("main", 1000)));
        assert!(z.oeffnen(&zug("andere-quelle", 1)));
    }
    #[test]
    fn laufender_zug_verhindert_weiteres_oeffnen() {
        let mut z = ZugZustand::default();
        assert!(z.oeffnen(&zug("main", 1)));
        assert!(!z.oeffnen(&zug("main", 2)));
        assert!(!z.oeffnen(&zug("anders", 1)));
        assert!(z.passt(&zug("main", 1)));
    }
    #[test]
    fn schliessen_vor_oeffnen_oder_dessen_fertigstellung_beendet_dauerhaft() {
        let mut z = ZugZustand::default();
        let a = zug("main", 1);
        z.schliessen(&a);
        z.schliessen(&a);
        assert!(!z.oeffnen(&a));
        assert!(z.aktiv.is_none());
        let b = zug("main", 2);
        assert!(z.oeffnen(&b));
        z.schliessen(&b);
        assert!(!z.passt(&b));
        assert!(!z.oeffnen(&b));
    }
    #[test]
    fn ohne_zug_ist_keine_fensteroperation_zulaessig() {
        let z = ZugZustand::default();
        assert!(!z.passt(&zug("main", 1)));
    }
    #[test]
    fn alte_fertigstellung_und_alte_befehle_lassen_folgezug_unberuehrt() {
        let mut z = ZugZustand::default();
        let a = zug("main", 1);
        let b = zug("main", 2);
        assert!(z.oeffnen(&a));
        z.schliessen(&a);
        assert!(z.oeffnen(&b));
        assert!(!z.passt(&a));
        z.schliessen(&a);
        assert!(!z.passt(&a));
        assert!(z.passt(&b));
        assert_eq!(z.aktiv, Some(b));
    }
    #[test]
    fn quellfenster_schliessen_beendet_nur_dessen_zug() {
        let mut z = ZugZustand::default();
        let a = zug("main", 1);
        assert!(z.oeffnen(&a));
        z.quelle_schliessen("anders");
        assert!(z.passt(&a));
        z.quelle_schliessen("main");
        assert!(z.aktiv.is_none());
        assert!(!z.oeffnen(&a));
    }
    #[test]
    fn abschlussgrenze_braucht_nur_einen_eintrag_je_quelle() {
        let mut z = ZugZustand::default();
        for kennung in 1..1000 {
            let a = zug("main", kennung);
            assert!(z.oeffnen(&a));
            z.schliessen(&a);
        }
        assert_eq!(z.beendet.len(), 1);
        for kennung in 1..1000 {
            assert!(!z.oeffnen(&zug("main", kennung)));
        }
        assert!(z.oeffnen(&zug("anders", 1)));
    }
}
