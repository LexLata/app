// Unterbrechen und Fortsetzen einer gehaltenen Dateisperre mit gleichem Token.
use super::DateiSperren;
use std::time::Duration;

impl DateiSperren {
    // Gibt die gehaltene Sperre vorübergehend frei; der Token bleibt dem Halter,
    // erlaubt aber bis zum Fortsetzen weder Dateizugriffe noch Prüfvorgangsaktionen.
    pub(crate) fn unterbrechen(&self, sitzung: u64, token: &str) -> Result<(), String> {
        let mut z = self.zustand()?;
        let geschlossen = z.geschlossen.contains(&sitzung);
        let stand = z.aenderungen;
        let h = z.tokens.get_mut(token).ok_or("Sperrtoken ist ungültig.")?;
        if geschlossen || !h.gueltig || h.sitzung != sitzung || h._guard.is_none() {
            return Err("Sperrtoken kann nicht unterbrochen werden.".into());
        }
        if h.operationen > 0 {
            return Err("Dateizugriffe laufen noch.".into());
        }
        h._guard = None;
        h.unterbrochen_bei = Some(stand);
        Ok(())
    }
    // Übernimmt die Sperre in der gewöhnlichen Warteschlange wieder. true: seit
    // dem Unterbrechen keine Prüfvorgangsänderung und kein Konfliktdatei-Schreiben.
    pub(crate) async fn fortsetzen(
        &self,
        sitzung: u64,
        token: &str,
        frist: Duration,
    ) -> Result<bool, String> {
        let mutex = {
            let z = self.zustand()?;
            let h = z.tokens.get(token).ok_or("Sperrtoken ist ungültig.")?;
            if z.geschlossen.contains(&sitzung)
                || !h.gueltig
                || h.sitzung != sitzung
                || h._guard.is_some()
            {
                return Err("Sperrtoken kann nicht fortgesetzt werden.".into());
            }
            z.dateien
                .get(&h.pfad)
                .cloned()
                .ok_or("Sperrtoken ist ungültig.")?
        };
        let guard = tokio::time::timeout(frist, mutex.lock_owned())
            .await
            .map_err(|_| "wartefrist".to_string())?;
        let mut z = self.zustand()?;
        let geschlossen = z.geschlossen.contains(&sitzung);
        let stand = z.aenderungen;
        let h = z.tokens.get_mut(token).ok_or("Sperrtoken ist ungültig.")?;
        if geschlossen || !h.gueltig || h.sitzung != sitzung {
            return Err("Sperrtoken kann nicht fortgesetzt werden.".into());
        }
        h._guard = Some(guard);
        Ok(h.unterbrochen_bei.take() == Some(stand))
    }
}
