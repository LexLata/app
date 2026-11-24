// Menübilder, Theme-Wechsel und native Sichtbarkeit der macOS-Menüicons.
use crate::fenster::MenuItemRegistry;
use tauri::image::Image;
use tauri::menu::IconMenuItem;
use tauri::Manager;

// Icons für alle eigenen Menüpunkte (siehe src-tauri/icons/menu/light bzw.
// .../dark/), rasterisiert aus Lucide (ISC-lizenziert; die eigene
// React-Oberfläche verwendet Phosphor) statt selbst gezeichnet – siehe
// Absprache. Je zwei Varianten pro Icon (hell/dunkel), weil Tauri für eigene
// Bitmaps – anders als für die eingebauten NativeIcon-Symbole – kein
// Template-Image-Flag kennt, das AppKit automatisch invertieren würde
// (siehe menu_icons_theme_aktualisieren am Dateiende). Per include_bytes!
// zur Compile-Zeit eingebettet statt zur Laufzeit von der Platte gelesen
// (Image::from_path): funktioniert dadurch identisch in `tauri dev` und im
// gebauten Bundle, unabhängig vom Arbeitsverzeichnis.
// Liefert für die vier Kombinationen (hell/dunkel × aktiv/inaktiv) die
// eingebetteten Bytes einer einzelnen Icon-Datei – ersetzt die vormals 28
// einzelnen icon_xxx()-Funktionen, die sich nur im Dateinamen unterschieden.
macro_rules! menu_icon_bytes {
    ($dunkel:expr, $aktiv:expr, $datei:literal) => {
        match ($dunkel, $aktiv) {
            (false, true) => include_bytes!(concat!("../../icons/menu/light/", $datei)).as_slice(),
            (false, false) => {
                include_bytes!(concat!("../../icons/menu/light-disabled/", $datei)).as_slice()
            }
            (true, true) => include_bytes!(concat!("../../icons/menu/dark/", $datei)).as_slice(),
            (true, false) => {
                include_bytes!(concat!("../../icons/menu/dark-disabled/", $datei)).as_slice()
            }
        }
    };
}

/// Zentrale Icon-Auswahl nach ID – EINZIGE Stelle, die ID ↔ Icon-Datei
/// zuordnet (Single Source of Truth), genutzt sowohl beim Menüaufbau
/// (siehe icon() unten) als auch beim Theme-Wechsel
/// (menu_icons_theme_aktualisieren) als auch beim Grau-/Aktiv-Schalten
/// (siehe menu_item_status_setzen in fenster.rs).
fn icon_fuer(id: &str, dunkel: bool, aktiv: bool) -> Option<Image<'static>> {
    let bytes: &'static [u8] = match id {
        "alle-lesezeichen-entfernen" => {
            menu_icon_bytes!(dunkel, aktiv, "alle_lesezeichen_entfernen.png")
        }
        "tastenkuerzel" => menu_icon_bytes!(dunkel, aktiv, "tastenkuerzel.png"),
        "datenschutz" => menu_icon_bytes!(dunkel, aktiv, "datenschutz.png"),
        "dateien-importieren" => menu_icon_bytes!(dunkel, aktiv, "dateien_importieren.png"),
        "einfuehrung-neu-starten" => menu_icon_bytes!(dunkel, aktiv, "einfuehrung_neu_starten.png"),
        "einstellungen" => menu_icon_bytes!(dunkel, aktiv, "einstellungen.png"),
        "export" => menu_icon_bytes!(dunkel, aktiv, "export.png"),
        "favorit-speichern" => menu_icon_bytes!(dunkel, aktiv, "favorit_speichern.png"),
        "favoriten-hinzufuegen" => menu_icon_bytes!(dunkel, aktiv, "favoriten_hinzufuegen.png"),
        "fenster-schliessen" => menu_icon_bytes!(dunkel, aktiv, "fenster_schliessen.png"),
        "gesetz-info" => menu_icon_bytes!(dunkel, aktiv, "gesetz_info.png"),
        "gesetze-aktualisieren" => menu_icon_bytes!(dunkel, aktiv, "gesetze_aktualisieren.png"),
        "gesetzesindizes-aktualisieren" => {
            menu_icon_bytes!(dunkel, aktiv, "gesetzesindizes_aktualisieren.png")
        }
        "oeffnen" => menu_icon_bytes!(dunkel, aktiv, "oeffnen.png"),
        "gesetzesuebersicht" => menu_icon_bytes!(dunkel, aktiv, "gesetzesuebersicht.png"),
        "hervorheben" => menu_icon_bytes!(dunkel, aktiv, "hervorheben.png"),
        "kommentar" => menu_icon_bytes!(dunkel, aktiv, "kommentar.png"),
        "lesezeichen-speichern" => menu_icon_bytes!(dunkel, aktiv, "lesezeichen_speichern.png"),
        "letzter-tab" => menu_icon_bytes!(dunkel, aktiv, "letzter_tab.png"),
        "markierung-rueckgaengig" => menu_icon_bytes!(dunkel, aktiv, "markierung_rueckgaengig.png"),
        "markierung-wiederholen" => menu_icon_bytes!(dunkel, aktiv, "markierung_wiederholen.png"),
        "markierungskonflikte" => menu_icon_bytes!(dunkel, aktiv, "markierungskonflikte.png"),
        "nach-updates-suchen" => menu_icon_bytes!(dunkel, aktiv, "nach_updates_suchen.png"),
        "neuer-tab" => menu_icon_bytes!(dunkel, aktiv, "neuer_tab.png"),
        "neues-fenster" => menu_icon_bytes!(dunkel, aktiv, "neues_fenster.png"),
        "verweismarkierung" => menu_icon_bytes!(dunkel, aktiv, "verweismarkierung.png"),
        "schliessen-tab" => menu_icon_bytes!(dunkel, aktiv, "schliessen_tab.png"),
        "unterstreichen" => menu_icon_bytes!(dunkel, aktiv, "unterstreichen.png"),
        "verlauf-anzeigen" => menu_icon_bytes!(dunkel, aktiv, "verlauf_anzeigen.png"),
        "volltext-alle" => menu_icon_bytes!(dunkel, aktiv, "volltext_alle.png"),
        "volltext-suche" => menu_icon_bytes!(dunkel, aktiv, "volltext_suche.png"),
        _ => return None,
    };
    Some(Image::from_bytes(bytes).expect("Menü-Icon ungültig"))
}

/// Registrierte Menüpunkte, die bewusst kein Icon tragen (macOS-App-Menü wie
/// die übrigen Systempunkte). Bild- und Sichtbarkeitsanpassung lassen sie aus,
/// statt sie als fehlend zu melden; Aus-/Eingrauen läuft trotzdem über die Registry.
const ICONLOSE_IDS: &[&str] = &["ueber"];

fn traegt_icon(id: &str) -> bool {
    !ICONLOSE_IDS.contains(&id)
}

/// Kurzform für den Menüaufbau (einrichten() unten): dort ist die ID immer
/// eine zur Compile-Zeit feste Konstante aus obiger Tabelle – ein Tippfehler
/// soll deshalb sofort beim Start auffallen (panic) statt zu einem Menüpunkt
/// ohne Icon zu führen. icon_fuer() selbst bleibt für die Laufzeit-Fälle
/// (Theme-Wechsel/Grau-Schalten) tolerant und liefert dort None.
pub(super) fn icon(id: &str, dunkel: bool, aktiv: bool) -> Image<'static> {
    icon_fuer(id, dunkel, aktiv).unwrap_or_else(|| panic!("unbekannte Menü-Icon-ID: {id}"))
}

/// Bildwechsel und Sichtbarkeitspräferenz bleiben bei derselben Menü-Zuständigkeit.
/// Auch Theme-/Statuswechsel setzen die Präferenz am tatsächlich eingesetzten Item.
pub fn menu_icon_aktualisieren(
    app: &tauri::AppHandle,
    id: &str,
    item: &IconMenuItem<tauri::Wry>,
    dunkel: bool,
    aktiv: bool,
) {
    if !traegt_icon(id) {
        return;
    }
    let Some(icon) = icon_fuer(id, dunkel, aktiv) else {
        eprintln!("Menüicon: Keine Iconzuordnung für {id}.");
        return;
    };
    if let Err(fehler) = item.set_icon(Some(icon)) {
        eprintln!("Menüicon: Bild für {id} konnte nicht gesetzt werden: {fehler}");
        return;
    }
    menu_icons_sichtbar_machen(app, [(id, item)]);
}

/// Tauri bietet kein natives Handle für IconMenuItem. Die laufende Registry
/// liefert deshalb ID und aktuellen Titel für die eindeutige native Zuordnung.
/// Keine zweite Liste; ein erneuter Aufbau läuft wieder durch diese Anpassung.
pub(super) fn menu_icons_sichtbar_machen<'a>(
    app: &tauri::AppHandle,
    items: impl IntoIterator<Item = (&'a str, &'a IconMenuItem<tauri::Wry>)>,
) {
    let mut zuordnungen = Vec::new();
    for (id, item) in items.into_iter().filter(|(id, _)| traegt_icon(id)) {
        match item.text() {
            Ok(titel) => zuordnungen.push((id.to_owned(), titel)),
            Err(fehler) => eprintln!("Menüicon: Titel für {id} nicht lesbar: {fehler}"),
        }
    }
    if objc2_foundation::MainThreadMarker::new().is_some() {
        native_menu_icons_sichtbar_machen(zuordnungen);
    } else if let Err(fehler) =
        app.run_on_main_thread(move || native_menu_icons_sichtbar_machen(zuordnungen))
    {
        eprintln!("Menüicon: Hauptthread-Anpassung konnte nicht gestartet werden: {fehler}");
    }
}

fn native_menu_icons_sichtbar_machen(zuordnungen: Vec<(String, String)>) {
    use objc2::{msg_send, rc::Retained, sel};
    use objc2_app_kit::{NSApplication, NSMenu, NSMenuItem};
    use objc2_foundation::MainThreadMarker;

    fn eintraege_sammeln(menue: &NSMenu, eintraege: &mut Vec<Retained<NSMenuItem>>) {
        for eintrag in menue.itemArray() {
            if let Some(untermenue) = eintrag.submenu() {
                eintraege_sammeln(&untermenue, eintraege);
            } else {
                eintraege.push(eintrag);
            }
        }
    }

    let Some(hauptthread) = MainThreadMarker::new() else {
        eprintln!("Menüicon: Native Anpassung ist nicht auf dem Hauptthread.");
        return;
    };
    let Some(menue) = NSApplication::sharedApplication(hauptthread).mainMenu() else {
        eprintln!("Menüicon: Kein natives Hauptmenü gefunden.");
        return;
    };
    let mut eintraege = Vec::new();
    eintraege_sammeln(&menue, &mut eintraege);
    let titel: Vec<_> = eintraege
        .iter()
        .map(|item| item.title().to_string())
        .collect();
    for (id, gesucht) in zuordnungen {
        let Some(position) = eindeutige_menu_item_position(&titel, &gesucht) else {
            eprintln!("Menüicon: {id} ({gesucht}) fehlt oder ist im nativen Menü mehrdeutig.");
            continue;
        };
        let eintrag = &eintraege[position];
        // muda 0.20.0 verbindet eigene Iconitems mit customAction:. Ein
        // gleichnamiges Systemitem darf bei einer falschen Zuordnung nie
        // angepasst werden (auch dann nicht, wenn es selbst ein Bild hat).
        if eintrag.action() != Some(sel!(customAction:)) {
            eprintln!("Menüicon: {id} ist kein natives eigenes Menüitem.");
            continue;
        }
        // SAFETY: Lebendes NSMenuItem auf dem Hauptthread; NSObject kennt respondsToSelector:.
        let setzbar: bool = unsafe {
            msg_send![&**eintrag, respondsToSelector: sel!(setPreferredImageVisibility:)]
        };
        // SAFETY: Dasselbe lebende NSMenuItem; respondsToSelector: liefert BOOL.
        let lesbar: bool =
            unsafe { msg_send![&**eintrag, respondsToSelector: sel!(preferredImageVisibility)] };
        if !setzbar && !lesbar {
            continue;
        }
        if !setzbar || !lesbar {
            eprintln!("Menüicon: Sichtbarkeits-API für {id} ist nur teilweise verfügbar.");
            continue;
        }
        if eintrag.image().is_none() {
            eprintln!("Menüicon: {id} hat im nativen Menü kein Bild.");
            continue;
        }
        const SICHTBAR: isize = 1;
        // SAFETY: Lebendes NSMenuItem am Hauptthread; Setter geprüft, 1 = NSMenuItemImageVisibilityVisible (NSInteger).
        let _: () = unsafe { msg_send![&**eintrag, setPreferredImageVisibility: SICHTBAR] };
        // SAFETY: Derselbe Empfänger; Getter oben geprüft, Rückgabetyp ist NSInteger.
        let sichtbarkeit: isize = unsafe { msg_send![&**eintrag, preferredImageVisibility] };
        if sichtbarkeit != SICHTBAR {
            eprintln!(
                "Menüicon: Sichtbarkeitspräferenz für {id} bleibt {sichtbarkeit}, erwartet 1."
            );
        }
    }
}

/// Tauscht bei jeder Meldung eines neuen System-Erscheinungsbilds (siehe
/// fenster/menu_sync.rs::system_theme_melden, von useFarbschema.ts
/// aufgerufen) alle 30 eigenen Menü-Icons gegen ihre helle/
/// dunkle Variante aus – Tauri kennt für selbst mitgebrachte Bitmaps (anders
/// als für die eingebauten NativeIcon-Symbole) kein Template-Image-Flag, das
/// AppKit automatisch invertieren würde, siehe Absprache. Deshalb pflegen wir
/// beide Farbvarianten selbst (src-tauri/icons/menu/light|dark/) und tauschen
/// sie hier manuell aus (über icon_fuer() oben, Single Source of Truth).
pub fn menu_icons_theme_aktualisieren(app: &tauri::AppHandle, dunkel: bool) {
    let Some(state) = app.try_state::<MenuItemRegistry>() else {
        return;
    };
    // WICHTIG: den AKTUELLEN Aktiv-Zustand jedes Items abfragen und
    // beibehalten – ein Theme-Wechsel darf ausgegraute Items nicht
    // versehentlich reaktivieren (sichtbar am Icon, auch wenn set_enabled
    // hier nicht angefasst wird).
    for (id, item) in state.0.iter() {
        let aktiv = item.is_enabled().unwrap_or(true);
        menu_icon_aktualisieren(app, id, item, dunkel, aktiv);
    }
}

// Zuordnung am nativen Menü: Tauri stellt für IconMenuItem kein NSMenuItem-Handle bereit.
// Titel stammen zur Laufzeit aus der Registry; fehlende/mehrdeutige Treffer bleiben unberührt.
fn eindeutige_menu_item_position(titel: &[String], gesucht: &str) -> Option<usize> {
    let mut treffer = titel
        .iter()
        .enumerate()
        .filter(|(_, titel)| *titel == gesucht);
    let (position, _) = treffer.next()?;
    treffer.next().is_none().then_some(position)
}

#[cfg(test)]
mod icon_sichtbarkeit_tests {
    use super::{eindeutige_menu_item_position, icon_fuer, traegt_icon};

    #[test]
    fn ueber_ist_iconlos_und_wird_nicht_als_fehlend_gemeldet() {
        assert!(!traegt_icon("ueber"));
        assert!(icon_fuer("ueber", false, true).is_none());
        assert!(traegt_icon("datenschutz"));
        assert!(traegt_icon("nach-updates-suchen"));
    }

    #[test]
    fn jeder_registrierte_iconpunkt_hat_eine_iconzuordnung() {
        let quelle = include_str!("anwendung.rs").to_owned() + include_str!("navigationsmenue.rs");
        let ids: Vec<&str> = quelle
            .split("menu_item_registry.insert(\"")
            .skip(1)
            .map(|rest| rest.split('"').next().unwrap())
            .collect();
        assert!(ids.contains(&"ueber"));
        assert!(ids.contains(&"nach-updates-suchen"));
        for id in ids.into_iter().filter(|id| traegt_icon(id)) {
            assert!(icon_fuer(id, false, true).is_some(), "{id}");
        }
    }

    #[test]
    fn registrierter_titel_findet_genau_sein_natives_item() {
        let titel = vec!["Über LexLata".into(), "Datenschutz".into(), "Hilfe".into()];
        assert_eq!(
            eindeutige_menu_item_position(&titel, "Datenschutz"),
            Some(1)
        );
    }

    #[test]
    fn fehlender_oder_mehrdeutiger_titel_aendert_kein_item() {
        assert_eq!(eindeutige_menu_item_position(&[], "Datenschutz"), None);
        let titel = vec!["Datenschutz".into(), "Datenschutz".into()];
        assert_eq!(eindeutige_menu_item_position(&titel, "Datenschutz"), None);
        assert_eq!(eindeutige_menu_item_position(&titel, "Einstellungen"), None);
    }
}
