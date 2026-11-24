// fenster/ziehvorschau/fensterplatz.rs – Besitz des einzigen nativen Vorschaufensters.
use super::zustand::{Zug, ZugZustand};
use std::sync::Mutex;

pub(super) struct Fensterplatz<F> {
    pub fenster: Option<(Zug, F)>,
}
impl<F> Default for Fensterplatz<F> {
    fn default() -> Self {
        Self { fenster: None }
    }
}
impl<F> Fensterplatz<F> {
    pub fn gehoert(&self, zug: &Zug) -> bool {
        self.fenster
            .as_ref()
            .is_some_and(|(eigner, _)| eigner == zug)
    }
    pub fn aufraeumen(
        &mut self,
        entfernen: impl FnOnce(&F) -> Result<(), String>,
    ) -> Result<(), String> {
        if let Some((_, fenster)) = self.fenster.as_ref() {
            entfernen(fenster)?;
        }
        self.fenster = None;
        Ok(())
    }
    pub fn aufbauen(
        &mut self,
        zug: &Zug,
        zustand: &Mutex<ZugZustand>,
        bauen: impl FnOnce() -> Result<F, String>,
        konfigurieren: impl FnOnce(&F) -> Result<(), String>,
        mut entfernen: impl FnMut(&F) -> Result<(), String>,
    ) -> Result<(), String> {
        if !crate::sperren::sperren(zustand).passt(zug) {
            return Ok(());
        }
        let ergebnis = (|| {
            // Das alte Handle muss vollständig entfernt sein, bevor bauen das
            // feste Label wieder belegen darf; auch bei überlappenden Zügen.
            self.aufraeumen(&mut entfernen)?;
            self.fenster = Some((zug.clone(), bauen()?));
            konfigurieren(&self.fenster.as_ref().unwrap().1)?;
            if !crate::sperren::sperren(zustand).passt(zug) {
                self.aufraeumen(&mut entfernen)?;
            }
            Ok(())
        })();
        if ergebnis.is_err() {
            crate::sperren::sperren(zustand).schliessen(zug);
            // Bei fehlgeschlagenem Entfernen behalten wir das Handle und
            // verhindern eine neue Belegung des Labels bis zum nächsten Versuch.
            let _ = self.aufraeumen(entfernen);
        }
        ergebnis
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    fn zug(kennung: u64) -> Zug {
        Zug {
            quelle: "main".into(),
            kennung,
        }
    }
    #[test]
    fn ueberlappende_aufbauten_belegen_das_feste_label_nie_gleichzeitig() {
        use std::sync::{mpsc, Arc};
        let z = Arc::new(Mutex::new(ZugZustand::default()));
        let platz = Arc::new(Mutex::new(Fensterplatz::default()));
        let nativ = Arc::new(Mutex::new(None));
        let protokoll = Arc::new(Mutex::new(Vec::new()));
        let (begonnen, empfang) = mpsc::channel();
        let (freigabe, warten) = mpsc::channel();
        assert!(z.lock().unwrap().oeffnen(&zug(1)));
        let a = {
            let z = z.clone();
            let platz = platz.clone();
            let nativ = nativ.clone();
            let protokoll = protokoll.clone();
            std::thread::spawn(move || {
                platz
                    .lock()
                    .unwrap()
                    .aufbauen(
                        &zug(1),
                        &z,
                        || {
                            assert!(nativ.lock().unwrap().replace(11).is_none());
                            protokoll.lock().unwrap().push(("gebaut", 11));
                            begonnen.send(()).unwrap();
                            warten.recv().unwrap();
                            Ok(11)
                        },
                        |_| Ok(()),
                        |f| {
                            assert_eq!(nativ.lock().unwrap().take(), Some(*f));
                            protokoll.lock().unwrap().push(("entfernt", *f));
                            Ok(())
                        },
                    )
                    .unwrap()
            })
        };
        empfang.recv().unwrap();
        z.lock().unwrap().schliessen(&zug(1));
        assert!(z.lock().unwrap().oeffnen(&zug(2)));
        assert!(platz.try_lock().is_err());
        let b = {
            let z = z.clone();
            let platz = platz.clone();
            let nativ = nativ.clone();
            let protokoll = protokoll.clone();
            std::thread::spawn(move || {
                platz
                    .lock()
                    .unwrap()
                    .aufbauen(
                        &zug(2),
                        &z,
                        || {
                            assert!(nativ.lock().unwrap().replace(22).is_none());
                            protokoll.lock().unwrap().push(("gebaut", 22));
                            Ok(22)
                        },
                        |_| Ok(()),
                        |f| {
                            assert_eq!(nativ.lock().unwrap().take(), Some(*f));
                            Ok(())
                        },
                    )
                    .unwrap()
            })
        };
        freigabe.send(()).unwrap();
        a.join().unwrap();
        b.join().unwrap();
        assert!(platz.lock().unwrap().gehoert(&zug(2)));
        assert_eq!(*nativ.lock().unwrap(), Some(22));
        assert_eq!(
            *protokoll.lock().unwrap(),
            vec![("gebaut", 11), ("entfernt", 11), ("gebaut", 22)]
        );
    }
    #[test]
    fn spaete_fertigstellung_entfernt_nur_ihr_eigenes_handle_vor_dem_folgeaufbau() {
        let z = Mutex::new(ZugZustand::default());
        let mut platz = Fensterplatz::default();
        let nativ = RefCell::new(None);
        let entfernt = RefCell::new(Vec::new());
        let a = zug(1);
        let b = zug(2);
        assert!(z.lock().unwrap().oeffnen(&a));
        let entfernen = |handle: &u64| {
            assert_eq!(*nativ.borrow(), Some(*handle));
            entfernt.borrow_mut().push(*handle);
            *nativ.borrow_mut() = None;
            Ok(())
        };
        platz
            .aufbauen(
                &a,
                &z,
                || {
                    assert!(nativ.borrow().is_none());
                    *nativ.borrow_mut() = Some(11);
                    // Native Erstellung von A endet erst nach lokalem Zugwechsel.
                    let mut z = z.lock().unwrap();
                    z.schliessen(&a);
                    assert!(z.oeffnen(&b));
                    Ok(11)
                },
                |_| Ok(()),
                entfernen,
            )
            .unwrap();
        assert!(platz.fenster.is_none());
        assert!(z.lock().unwrap().passt(&b));
        platz
            .aufbauen(
                &b,
                &z,
                || {
                    assert!(nativ.borrow().is_none());
                    *nativ.borrow_mut() = Some(22);
                    Ok(22)
                },
                |_| Ok(()),
                entfernen,
            )
            .unwrap();
        assert!(!platz.gehoert(&a));
        // Ein verspäteter Öffnungsabschluss aus A baut nichts und räumt B nicht auf.
        platz
            .aufbauen(
                &a,
                &z,
                || panic!("A darf kein Fenster mehr bauen"),
                |_| panic!("A darf B nicht konfigurieren"),
                |_| panic!("A darf B nicht schließen"),
            )
            .unwrap();
        z.lock().unwrap().schliessen(&a);
        assert!(platz.gehoert(&b));
        assert_eq!(*nativ.borrow(), Some(22));
        assert_eq!(*entfernt.borrow(), vec![11]);
    }
    #[test]
    fn schliessen_beim_aufbau_hinterlaesst_weder_zug_noch_fenster() {
        let z = Mutex::new(ZugZustand::default());
        let a = zug(1);
        assert!(z.lock().unwrap().oeffnen(&a));
        let mut platz = Fensterplatz::default();
        let mut entfernt = Vec::new();
        platz
            .aufbauen(
                &a,
                &z,
                || {
                    z.lock().unwrap().schliessen(&a);
                    Ok(11)
                },
                |_| Ok(()),
                |f| {
                    entfernt.push(*f);
                    Ok(())
                },
            )
            .unwrap();
        assert!(platz.fenster.is_none());
        assert!(z.lock().unwrap().aktiv.is_none());
        assert_eq!(entfernt, vec![11]);
    }
    #[test]
    fn fehlgeschlagenes_entfernen_verhindert_labelkonflikt_und_behaelt_das_alte_handle() {
        let z = Mutex::new(ZugZustand::default());
        let a = zug(1);
        let b = zug(2);
        assert!(z.lock().unwrap().oeffnen(&a));
        let mut platz = Fensterplatz::default();
        platz
            .aufbauen(&a, &z, || Ok(11), |_| Ok(()), |_| Ok(()))
            .unwrap();
        z.lock().unwrap().schliessen(&a);
        assert!(z.lock().unwrap().oeffnen(&b));
        assert!(platz
            .aufbauen(
                &b,
                &z,
                || panic!("Label noch belegt"),
                |_| Ok(()),
                |_| Err("natives Entfernen fehlgeschlagen".into())
            )
            .is_err());
        assert!(platz.gehoert(&a));
        assert!(z.lock().unwrap().aktiv.is_none());
        assert!(!z.lock().unwrap().oeffnen(&b));
    }
}
