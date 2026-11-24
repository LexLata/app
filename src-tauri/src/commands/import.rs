// commands/import.rs
// Koordiniert Import- und Aktualisierungsvorgänge fensterübergreifend.
// Enthält die Vorgangsregistrierung und die Sperre je Gesetz.

// Fensterübergreifender Lock für laufende Import-/Aktualisierungsvorgänge
// (Internet-Import neuer Gesetze, Aktualisierung bestehender Gesetze, sowohl
// manuell – AktualisierenOverlay.tsx, OeffnenOverlay.tsx,
// OeffnenOverlay.tsx, VerweismarkierungFenster.tsx, useGesetzOeffnen.ts – als
// auch automatisch, siehe useHintergrundAktualisierung.ts). Ursprünglich nur
// für die automatische Hintergrund-Aktualisierung gedacht (mehrere Fenster
// können beim App-Start nahezu gleichzeitig mounten und ohne Koordination
// gleichzeitig dieselben Gesetze herunterladen/vergleichen), auf Wunsch
// erweitert: JEDER der genannten Vorgänge setzt den Lock beim Start und gibt
// ihn beim Ende frei; nur die automatische Aktualisierung PRÜFT ihn und
// weicht zurück, falls gerade ein anderer Vorgang läuft – die manuellen
// Vorgänge blockieren sich untereinander bewusst NICHT gegenseitig (siehe
// Absprache), sie setzen das Flag nur, damit der Auto-Updater es sehen kann.
//
// Anders als bei LetzterTabAnfrage (reines bool) wird hier zusätzlich der
// Startzeitpunkt gehalten: stürzt ein Fenster mitten in seinem Vorgang ab,
// würde ein reines bool für den Rest der Sitzung blockiert bleiben – ein als
// "veraltet" geltender Lock (älter als STALE_SCHWELLE_MS) darf daher von
// einem anderen Fenster übernommen werden. Zeitstempel als Millisekunden
// seit UNIX_EPOCH, damit kein zusätzlicher Trait/Serde-Typ für SystemTime
// nötig ist.
const IMPORT_AKTUALISIERUNG_STALE_SCHWELLE_MS: u128 = 60 * 60 * 1000; // 1 Stunde

#[derive(Default)]
pub struct ImportAktualisierungVorgaenge(
    pub std::sync::Mutex<std::collections::HashMap<String, u128>>,
);

static IMPORT_VORGANG_NUMMER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

fn jetzt_ms() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn entferne_veraltete_import_vorgaenge(
    vorgaenge: &mut std::collections::HashMap<String, u128>,
    jetzt: u128,
) {
    vorgaenge.retain(|_, gestartet| {
        jetzt.saturating_sub(*gestartet) <= IMPORT_AKTUALISIERUNG_STALE_SCHWELLE_MS
    });
}

fn neue_import_vorgangskennung(jetzt: u128) -> String {
    let nummer = IMPORT_VORGANG_NUMMER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    format!("{jetzt}-{nummer}")
}

fn registriere_import_vorgang(
    vorgaenge: &mut std::collections::HashMap<String, u128>,
    jetzt: u128,
) -> String {
    entferne_veraltete_import_vorgaenge(vorgaenge, jetzt);
    let kennung = neue_import_vorgangskennung(jetzt);
    vorgaenge.insert(kennung.clone(), jetzt);
    kennung
}

fn registriere_automatischen_import_vorgang(
    vorgaenge: &mut std::collections::HashMap<String, u128>,
    jetzt: u128,
) -> Option<String> {
    entferne_veraltete_import_vorgaenge(vorgaenge, jetzt);
    if !vorgaenge.is_empty() {
        return None;
    }
    Some(registriere_import_vorgang(vorgaenge, jetzt))
}

/// Registriert einen manuellen Import-/Aktualisierungsvorgang. Manuelle
/// Vorgänge dürfen parallel laufen; die Kennung sorgt dafür, dass das Ende
/// nur die eigene Registrierung entfernt.
#[tauri::command]
pub fn import_aktualisierung_starten(state: tauri::State<ImportAktualisierungVorgaenge>) -> String {
    let mut vorgaenge = crate::sperren::sperren(&state.0);
    let jetzt = jetzt_ms();
    registriere_import_vorgang(&mut vorgaenge, jetzt)
}

/// Registriert einen automatischen Vorgang nur dann, wenn nach Bereinigung
/// veralteter Einträge kein anderer Vorgang läuft. Prüfung und Eintragung
/// erfolgen unter demselben Mutex.
#[tauri::command]
pub fn import_aktualisierung_automatisch_starten(
    state: tauri::State<ImportAktualisierungVorgaenge>,
) -> Option<String> {
    let mut vorgaenge = crate::sperren::sperren(&state.0);
    registriere_automatischen_import_vorgang(&mut vorgaenge, jetzt_ms())
}

/// Entfernt ausschließlich die übergebene Registrierung. Doppelte oder
/// verspätete Freigaben bleiben ohne Wirkung.
#[tauri::command]
pub fn import_aktualisierung_beenden(
    state: tauri::State<ImportAktualisierungVorgaenge>,
    vorgangskennung: String,
) {
    crate::sperren::sperren(&state.0).remove(&vorgangskennung);
}

// ---------------------------------------------------------------------------
// Gesetz-Import-/Aktualisierungs-Sperre (pro Kurztitel)
// ---------------------------------------------------------------------------
//
// Ergänzung zu den ImportAktualisierungVorgaengen oben: deren Registrierungen
// halten nur automatische Vorgänge zurück und blockieren manuelle Vorgänge
// nicht. Diese Sperre hier BLOCKIERT tatsächlich, aber nur pro einzelnem
// Gesetz (Kurztitel, case-insensitiv): verhindert, dass dasselbe Gesetz
// gleichzeitig zweimal importiert bzw. aktualisiert wird – egal ob beide
// Versuche aus demselben Fenster stammen (z.B. Hintergrund-Aktualisierung
// + manueller Aufruf aus dem Verweismarkierungfenster) oder aus verschiedenen
// Fenstern. Siehe gesetzImportDispatch.ts/gesetzAktualisierungDispatch.ts.

#[derive(Default)]
pub struct GesetzImportSperre(pub std::sync::Mutex<std::collections::HashMap<String, u128>>);

/// Versucht, die Sperre für einen einzelnen Kurztitel zu erhalten. Liefert
/// true (und trägt den aktuellen Zeitpunkt ein), wenn für diesen Kurztitel
/// keine Sperre besteht oder eine bestehende veraltet ist (gleiche
/// Stale-Schwelle wie beim Batch-Lock oben, z.B. nach einem Absturz mitten
/// im Vorgang), sonst false.
#[tauri::command]
pub fn gesetz_import_sperre_versuchen_zu_erhalten(
    state: tauri::State<GesetzImportSperre>,
    kurztitel: String,
) -> bool {
    let schluessel = kurztitel.to_lowercase();
    let mut sperren = crate::sperren::sperren(&state.0);
    let jetzt = jetzt_ms();
    let frei = match sperren.get(&schluessel) {
        None => true,
        Some(&gestartet) => {
            jetzt.saturating_sub(gestartet) > IMPORT_AKTUALISIERUNG_STALE_SCHWELLE_MS
        }
    };
    if frei {
        sperren.insert(schluessel, jetzt);
    }
    frei
}

/// Gibt die Sperre für einen Kurztitel wieder frei. Wird vom aufrufenden
/// Vorgang in einem finally-Block aufgerufen, sobald er (erfolgreich oder
/// nicht) abgeschlossen ist.
#[tauri::command]
pub fn gesetz_import_sperre_freigeben(state: tauri::State<GesetzImportSperre>, kurztitel: String) {
    crate::sperren::sperren(&state.0).remove(&kurztitel.to_lowercase());
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn manuelle_import_vorgaenge_beenden_nur_eigene_registrierung() {
        let mut vorgaenge = std::collections::HashMap::new();
        let a = registriere_import_vorgang(&mut vorgaenge, 100);
        let b = registriere_import_vorgang(&mut vorgaenge, 101);

        vorgaenge.remove(&b);
        assert!(vorgaenge.contains_key(&a));
        assert!(registriere_automatischen_import_vorgang(&mut vorgaenge, 102).is_none());

        vorgaenge.remove(&a);
        assert!(registriere_automatischen_import_vorgang(&mut vorgaenge, 103).is_some());
    }

    #[test]
    fn doppelte_und_verspaetete_freigabe_entfernen_keinen_fremden_vorgang() {
        let mut vorgaenge = std::collections::HashMap::new();
        let alt = registriere_import_vorgang(&mut vorgaenge, 100);
        vorgaenge.remove(&alt);
        let neu = registriere_import_vorgang(&mut vorgaenge, 101);

        vorgaenge.remove(&alt);
        vorgaenge.remove(&alt);
        assert!(vorgaenge.contains_key(&neu));
    }

    #[test]
    fn automatischer_start_bereinigt_veraltete_registrierungen() {
        let mut vorgaenge = std::collections::HashMap::from([("veraltet".to_string(), 1)]);
        let jetzt = IMPORT_AKTUALISIERUNG_STALE_SCHWELLE_MS + 2;

        let kennung = registriere_automatischen_import_vorgang(&mut vorgaenge, jetzt);
        assert!(kennung.is_some());
        assert!(!vorgaenge.contains_key("veraltet"));
        assert_eq!(vorgaenge.len(), 1);
    }

    #[test]
    fn konkurrierende_automatische_starts_registrieren_genau_einen_vorgang() {
        let vorgaenge =
            std::sync::Arc::new(std::sync::Mutex::new(std::collections::HashMap::new()));
        let barrier = std::sync::Arc::new(std::sync::Barrier::new(3));
        let threads: Vec<_> = (0..2)
            .map(|_| {
                let vorgaenge = vorgaenge.clone();
                let barrier = barrier.clone();
                std::thread::spawn(move || {
                    barrier.wait();
                    registriere_automatischen_import_vorgang(&mut vorgaenge.lock().unwrap(), 100)
                        .is_some()
                })
            })
            .collect();
        barrier.wait();
        let gestartet = threads
            .into_iter()
            .map(|thread| thread.join().unwrap())
            .filter(|gestartet| *gestartet)
            .count();
        assert_eq!(gestartet, 1);
        assert_eq!(vorgaenge.lock().unwrap().len(), 1);
    }

    #[test]
    fn manueller_und_automatischer_start_behalten_ihre_unterschiedlichen_regeln() {
        use std::sync::{mpsc, Arc, Mutex};

        // Ein laufender manueller Vorgang verhindert einen automatischen Start.
        let vorgaenge = Arc::new(Mutex::new(std::collections::HashMap::new()));
        let (manuell_gestartet, start_empfangen) = mpsc::channel();
        let (manuell_beenden, ende_empfangen) = mpsc::channel();
        let manuelle_vorgaenge = Arc::clone(&vorgaenge);
        let manuell = std::thread::spawn(move || {
            let kennung = registriere_import_vorgang(&mut manuelle_vorgaenge.lock().unwrap(), 100);
            manuell_gestartet.send(kennung.clone()).unwrap();
            ende_empfangen.recv().unwrap();
            manuelle_vorgaenge.lock().unwrap().remove(&kennung);
        });
        let manuelle_kennung = start_empfangen.recv().unwrap();
        let automatische_vorgaenge = Arc::clone(&vorgaenge);
        let automatisch = std::thread::spawn(move || {
            registriere_automatischen_import_vorgang(
                &mut automatische_vorgaenge.lock().unwrap(),
                101,
            )
        });
        assert!(automatisch.join().unwrap().is_none());
        assert!(vorgaenge.lock().unwrap().contains_key(&manuelle_kennung));
        manuell_beenden.send(()).unwrap();
        manuell.join().unwrap();

        // Ein laufender automatischer Vorgang hindert manuelle Starts nicht.
        let automatische_kennung =
            registriere_automatischen_import_vorgang(&mut vorgaenge.lock().unwrap(), 102).unwrap();
        let manuelle_vorgaenge = Arc::clone(&vorgaenge);
        let manuell = std::thread::spawn(move || {
            registriere_import_vorgang(&mut manuelle_vorgaenge.lock().unwrap(), 103)
        });
        let manuelle_kennung = manuell.join().unwrap();
        let registrierungen = vorgaenge.lock().unwrap();
        assert!(registrierungen.contains_key(&automatische_kennung));
        assert!(registrierungen.contains_key(&manuelle_kennung));
        assert_eq!(registrierungen.len(), 2);
    }
}
