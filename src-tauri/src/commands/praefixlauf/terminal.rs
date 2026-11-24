// commands/praefixlauf/terminal.rs
// Gemeinsame Terminaldarstellung für Laufmeldungen und native Diagnosen.
use super::Ausgabeart;
use std::io::{self, IsTerminal, Write};
use std::sync::{Mutex, OnceLock};

#[derive(Default)]
struct Terminal {
    status: String,
    debug: bool,
}
impl Terminal {
    fn ausgeben(
        &mut self,
        ziel: &mut impl Write,
        tty: bool,
        breite: usize,
        art: Ausgabeart,
        text: &str,
    ) -> io::Result<()> {
        if art == Ausgabeart::Detail && !self.debug {
            return Ok(());
        }
        if tty && !self.status.is_empty() {
            write!(ziel, "\r\x1b[2K")?;
        }
        if art == Ausgabeart::Status {
            self.status = text.replace(['\r', '\n'], " ");
            if !tty {
                writeln!(ziel, "{}", self.status)?;
            }
        } else {
            for zeile in text.lines() {
                writeln!(
                    ziel,
                    "{}{zeile}",
                    if art == Ausgabeart::Detail { "  " } else { "" }
                )?;
            }
        }
        if tty {
            // Eine Spalte frei lassen, damit die Statuszeile nicht umbricht.
            write!(
                ziel,
                "{}",
                self.status
                    .chars()
                    .take(breite.saturating_sub(1))
                    .collect::<String>()
            )?;
        }
        ziel.flush()
    }
    fn beenden(&mut self, ziel: &mut impl Write, tty: bool) -> io::Result<()> {
        if tty && !self.status.is_empty() {
            writeln!(ziel)?;
        }
        self.status.clear();
        ziel.flush()
    }
}
fn terminal() -> &'static Mutex<Terminal> {
    static TERMINAL: OnceLock<Mutex<Terminal>> = OnceLock::new();
    TERMINAL.get_or_init(|| Mutex::new(Terminal::default()))
}
fn ist_terminal(stdout: &io::Stdout) -> bool {
    stdout.is_terminal() && std::env::var("TERM").as_deref() != Ok("dumb") && cursorsteuerung()
}
#[cfg(not(windows))]
fn cursorsteuerung() -> bool {
    true
}
#[cfg(windows)]
fn cursorsteuerung() -> bool {
    use windows::Win32::System::Console::{
        GetConsoleMode, GetStdHandle, SetConsoleMode, CONSOLE_MODE,
        ENABLE_VIRTUAL_TERMINAL_PROCESSING, STD_OUTPUT_HANDLE,
    };
    // SAFETY: Der Standard-Ausgabehandle gehört dem Prozess; Modus wird nur nach
    // erfolgreichem Lesen ergänzt. Bei fehlender Konsolenunterstützung bleibt Textausgabe.
    unsafe {
        let Ok(handle) = GetStdHandle(STD_OUTPUT_HANDLE) else {
            return false;
        };
        let mut modus = CONSOLE_MODE::default();
        GetConsoleMode(handle, &mut modus).is_ok()
            && SetConsoleMode(handle, modus | ENABLE_VIRTUAL_TERMINAL_PROCESSING).is_ok()
    }
}
pub(super) fn ausgeben(art: Ausgabeart, text: &str) -> Result<(), String> {
    let auftrag = super::aktueller_auftrag()?;
    let stdout = io::stdout();
    let tty = ist_terminal(&stdout);
    let breite = terminal_size::terminal_size().map_or(80, |(breite, _)| usize::from(breite.0));
    let mut terminal = crate::sperren::sperren(terminal());
    terminal.debug = auftrag.debug == Some(true);
    terminal
        .ausgeben(&mut stdout.lock(), tty, breite, art, text)
        .map_err(|e| e.to_string())
}
pub(super) fn diagnose(text: &str) {
    if let Err(fehler) = ausgeben(Ausgabeart::Detail, text) {
        eprintln!("Präfixlauf-Ausgabe fehlgeschlagen: {fehler}");
    }
}
pub(super) fn beenden() -> Result<(), String> {
    let stdout = io::stdout();
    crate::sperren::sperren(terminal())
        .beenden(&mut stdout.lock(), ist_terminal(&stdout))
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ausgabearten_werden_im_vereinbarten_format_gelesen_und_unbekannte_abgewiesen() {
        for (text, art) in [
            ("\"detail\"", Ausgabeart::Detail),
            ("\"ergebnis\"", Ausgabeart::Ergebnis),
            ("\"status\"", Ausgabeart::Status),
        ] {
            assert_eq!(serde_json::from_str::<Ausgabeart>(text).unwrap(), art);
        }
        assert!(serde_json::from_str::<Ausgabeart>("\"unbekannt\"").is_err());
        assert!(serde_json::from_str::<Ausgabeart>("1").is_err());
    }
    #[test]
    fn terminal_erneuert_status_nach_mehrzeiligen_details_und_beendet_mit_zeilenumbruch() {
        let mut terminal = Terminal {
            debug: true,
            ..Terminal::default()
        };
        let mut ausgabe = Vec::new();
        terminal
            .ausgeben(
                &mut ausgabe,
                true,
                80,
                Ausgabeart::Status,
                "Abgearbeitet: 2",
            )
            .unwrap();
        terminal
            .ausgeben(
                &mut ausgabe,
                true,
                80,
                Ausgabeart::Detail,
                "A: lesen\nA: fertig",
            )
            .unwrap();
        terminal
            .ausgeben(
                &mut ausgabe,
                true,
                80,
                Ausgabeart::Ergebnis,
                "A: gespeichert",
            )
            .unwrap();
        terminal.beenden(&mut ausgabe, true).unwrap();
        assert_eq!(String::from_utf8(ausgabe).unwrap(), "Abgearbeitet: 2\r\x1b[2K  A: lesen\n  A: fertig\nAbgearbeitet: 2\r\x1b[2KA: gespeichert\nAbgearbeitet: 2\n");
    }
    #[test]
    fn kompakter_lauf_behaelt_ergebnisse_und_verbirgt_details() {
        let mut terminal = Terminal::default();
        let mut ausgabe = Vec::new();
        terminal
            .ausgeben(
                &mut ausgabe,
                false,
                80,
                Ausgabeart::Detail,
                "Datei lesen: Beginn",
            )
            .unwrap();
        terminal
            .ausgeben(
                &mut ausgabe,
                false,
                80,
                Ausgabeart::Ergebnis,
                "A: Teilerfolg – Original fehlt",
            )
            .unwrap();
        assert_eq!(
            String::from_utf8(ausgabe).unwrap(),
            "A: Teilerfolg – Original fehlt\n"
        );
    }
    #[test]
    fn umleitung_enthaelt_lesbare_zeilen_ohne_cursorsteuerung() {
        let mut terminal = Terminal::default();
        let mut ausgabe = Vec::new();
        terminal
            .ausgeben(
                &mut ausgabe,
                false,
                80,
                Ausgabeart::Status,
                "Vorbereitung …",
            )
            .unwrap();
        terminal
            .ausgeben(
                &mut ausgabe,
                false,
                80,
                Ausgabeart::Ergebnis,
                "B: fehlgeschlagen",
            )
            .unwrap();
        terminal.beenden(&mut ausgabe, false).unwrap();
        assert_eq!(
            String::from_utf8(ausgabe).unwrap(),
            "Vorbereitung …\nB: fehlgeschlagen\n"
        );
    }
    #[test]
    fn status_bleibt_auch_in_schmalen_fenstern_einzeilig() {
        let mut terminal = Terminal::default();
        let mut ausgabe = Vec::new();
        terminal
            .ausgeben(
                &mut ausgabe,
                true,
                8,
                Ausgabeart::Status,
                "Vorbereitung\nläuft",
            )
            .unwrap();
        assert_eq!(String::from_utf8(ausgabe).unwrap(), "Vorbere");
    }
}
