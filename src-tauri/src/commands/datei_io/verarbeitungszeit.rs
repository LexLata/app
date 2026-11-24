// Prüft und schreibt ausschließlich Änderungen der Verarbeitungszeit.

use super::{atomar_in_basis_schreiben, pruefe_eltern_ohne_symbolische_links};
use std::fs;
use std::path::Path;

fn verarbeitungszeit_bereich(xml: &str) -> Result<std::ops::Range<usize>, String> {
    use quick_xml::events::Event;
    let fehler = || "Keine eindeutige Verarbeitungszeit unter gesetz/infos.".to_string();
    let mut reader = quick_xml::Reader::from_str(xml);
    let mut stapel: Vec<String> = Vec::new();
    let mut wurzeln = 0;
    let mut infos = 0;
    let mut zeit_start = None;
    let mut bereich = None;
    loop {
        let vorher = reader.buffer_position() as usize;
        let event = reader.read_event().map_err(|_| fehler())?;
        let in_zeit = stapel
            .last()
            .is_some_and(|name| name == "verarbeitungszeit");
        match event {
            Event::Start(ref e) | Event::Empty(ref e) => {
                if in_zeit {
                    return Err(fehler());
                }
                for attribut in e.attributes() {
                    attribut.map_err(|_| fehler())?;
                }
                let name = e.name().as_ref().to_string();
                if stapel.is_empty() {
                    wurzeln += 1;
                    if wurzeln != 1 || name != "gesetz" {
                        return Err(fehler());
                    }
                }
                if name == "infos" && stapel == ["gesetz".to_string()] {
                    infos += 1;
                }
                if name == "verarbeitungszeit" {
                    if stapel != ["gesetz".to_string(), "infos".to_string()]
                        || zeit_start.is_some()
                        || bereich.is_some()
                        || e.attributes().next().is_some()
                        || matches!(event, Event::Empty(_))
                    {
                        return Err(fehler());
                    }
                    zeit_start = Some(reader.buffer_position() as usize);
                }
                if matches!(event, Event::Start(_)) {
                    stapel.push(name);
                }
            }
            Event::End(e) => {
                if stapel.last().map(String::as_str) != Some(e.name().as_ref()) {
                    return Err(fehler());
                }
                if in_zeit {
                    bereich = Some(zeit_start.take().ok_or_else(fehler)?..vorher);
                }
                stapel.pop();
            }
            Event::Text(e) => {
                if stapel.is_empty() && !e.as_ref().bytes().all(|b| b.is_ascii_whitespace()) {
                    return Err(fehler());
                }
            }
            Event::Eof => break,
            Event::DocType(_) => return Err(fehler()),
            _ if in_zeit => return Err(fehler()),
            _ => {}
        }
    }
    if !stapel.is_empty() || wurzeln != 1 || infos != 1 {
        return Err(fehler());
    }
    bereich.ok_or_else(fehler)
}

fn ist_auffrischungs_zeitstempel(wert: &str) -> bool {
    let b = wert.as_bytes();
    if !matches!(b.len(), 20 | 24) {
        return false;
    }
    b.iter().enumerate().all(|(i, c)| match i {
        4 | 7 => *c == b'-',
        10 => *c == b'T',
        13 | 16 => *c == b':',
        19 if b.len() == 24 => *c == b'.',
        i if i == b.len() - 1 => *c == b'Z',
        _ => c.is_ascii_digit(),
    })
}

pub(super) fn auffrische_verarbeitungszeit_in_basis(
    basis: &Path,
    pfad: &Path,
    neu: &str,
) -> Result<(), String> {
    pruefe_eltern_ohne_symbolische_links(basis, pfad)?;
    let ziel = basis.join(pfad);
    let metadaten = fs::symlink_metadata(&ziel).map_err(|e| e.to_string())?;
    if !metadaten.is_file() || metadaten.file_type().is_symlink() {
        return Err("Auffrischung benötigt eine vorhandene reguläre Gesetzdatei.".into());
    }
    let alt = fs::read_to_string(ziel).map_err(|e| e.to_string())?;
    if alt == neu {
        return Ok(());
    }
    let alter_bereich = verarbeitungszeit_bereich(&alt)?;
    let neuer_bereich = verarbeitungszeit_bereich(neu)?;
    if !ist_auffrischungs_zeitstempel(&neu[neuer_bereich.clone()])
        || alt[..alter_bereich.start] != neu[..neuer_bereich.start]
        || alt[alter_bereich.end..] != neu[neuer_bereich.end..]
    {
        return Err("Auffrischung darf ausschließlich die Verarbeitungszeit ändern.".into());
    }
    atomar_in_basis_schreiben(basis, pfad, neu)
}

pub(super) fn pruefe_auffrischungs_zugriff(
    pfad: &Path,
    token: Option<&str>,
    vorgang: Option<&str>,
) -> Result<(), String> {
    let segmente: Vec<_> = pfad.iter().collect();
    if segmente.len() != 2
        || segmente[0] != "gesetze"
        || !pfad
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| e.eq_ignore_ascii_case("xml"))
        || token.is_none()
        || vorgang.is_some()
    {
        return Err("Verarbeitungszeit-Auffrischung benötigt ausschließlich eine Gesetzdatei und ihren Dateisperrtoken.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::super::tests::TestOrdner;
    use super::*;
    #[test]
    fn auffrischung_vergleicht_tatsaechlichen_bestand_und_nur_infos_timestamp() {
        let ordner = TestOrdner::neu();
        fs::create_dir(ordner.0.join("gesetze")).unwrap();
        let pfad = Path::new("gesetze/BGB.XML");
        let alt = "<gesetz><infos><kurztitel>BGB</kurztitel><verarbeitungszeit>2025-01-01T00:00:00.000Z</verarbeitungszeit></infos><inhalt>Text</inhalt></gesetz>";
        let neu = alt.replace("2025-01-01", "2026-01-01");
        fs::write(ordner.0.join(pfad), alt).unwrap();
        auffrische_verarbeitungszeit_in_basis(&ordner.0, pfad, &neu).unwrap();
        assert_eq!(fs::read_to_string(ordner.0.join(pfad)).unwrap(), neu);
        auffrische_verarbeitungszeit_in_basis(&ordner.0, pfad, &neu).unwrap();
        for falsch in [
            neu.replace("Text", "Anderer Text"),
            neu.replace("BGB", "ZPO"),
            neu.replace(
                "</infos>",
                "<verarbeitungszeit>2026-01-01T00:00:00.000Z</verarbeitungszeit></infos>",
            ),
        ] {
            assert!(auffrische_verarbeitungszeit_in_basis(&ordner.0, pfad, &falsch).is_err());
            assert_eq!(fs::read_to_string(ordner.0.join(pfad)).unwrap(), neu);
        }
        // Ein unter der Sperre inzwischen neuer Fachbestand darf nicht überstimmt werden.
        fs::write(ordner.0.join(pfad), neu.replace("Text", "Neuer Bestand")).unwrap();
        assert!(auffrische_verarbeitungszeit_in_basis(&ordner.0, pfad, alt).is_err());
        assert!(auffrische_verarbeitungszeit_in_basis(
            &ordner.0,
            Path::new("gesetze/fehlt.xml"),
            &neu
        )
        .is_err());
        for falsch in [
            "<gesetz><infos><!--<verarbeitungszeit>2025-01-01T00:00:00.000Z</verarbeitungszeit>--></infos></gesetz>",
            "<gesetz><infos><![CDATA[<verarbeitungszeit>2025-01-01T00:00:00.000Z</verarbeitungszeit>]]></infos></gesetz>",
            "<gesetz><infos/><inhalt><verarbeitungszeit>2025-01-01T00:00:00.000Z</verarbeitungszeit></inhalt></gesetz>",
            "<gesetz><infos><verarbeitungszeit>2025-01-01T00:00:00.000Z</verarbeitungszeit><verarbeitungszeit>2025-01-01T00:00:00.000Z</verarbeitungszeit></infos></gesetz>",
        ] {
            fs::write(ordner.0.join(pfad), falsch).unwrap();
            assert!(auffrische_verarbeitungszeit_in_basis(&ordner.0, pfad, &falsch.replace("2025", "2026")).is_err());
            assert_eq!(fs::read_to_string(ordner.0.join(pfad)).unwrap(), falsch);
        }
    }
}
