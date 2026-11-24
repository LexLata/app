// Baut Navigation und Markierungen samt ihren Registry-Einträgen.
use super::icons::icon;
use tauri::menu::{IconMenuItem, PredefinedMenuItem, Submenu};

pub(super) fn navigation(
    handle: &tauri::AppHandle,
    dunkel: bool,
    menu_item_registry: &mut std::collections::HashMap<&'static str, IconMenuItem<tauri::Wry>>,
) -> tauri::Result<Submenu<tauri::Wry>> {
    // Grau, wenn es keine Lesezeichen gibt – TS-seitig synchronisiert über
    // useLesezeichenUndFavoriten.ts (lesezeichen-State-Länge).
    let alle_lesezeichen_entfernen_item = IconMenuItem::with_id(
        handle,
        "alle-lesezeichen-entfernen",
        "Alle Lesezeichen löschen",
        true,
        Some(icon("alle-lesezeichen-entfernen", dunkel, true)),
        crate::tastenkuerzel::accelerator("alle-lesezeichen-entfernen"),
    )?;

    // Grau, wenn im aktiven Tab kein Gesetz offen ist – TS-seitig
    // synchronisiert über menueZustandSync.ts (inkl. Fokuswechsel-Sync,
    // siehe dort für den Grund).
    let volltext_suche_item = IconMenuItem::with_id(
        handle,
        "volltext-suche",
        "Suche im geöffneten Gesetz",
        true,
        Some(icon("volltext-suche", dunkel, true)),
        crate::tastenkuerzel::accelerator("volltext-suche"),
    )?;
    let verlauf_anzeigen_item = IconMenuItem::with_id(
        handle,
        "verlauf-anzeigen",
        "Verlauf anzeigen",
        true,
        Some(icon("verlauf-anzeigen", dunkel, true)),
        crate::tastenkuerzel::accelerator("verlauf-anzeigen"),
    )?;
    // Ebenfalls grau, wenn kein Gesetz offen ist (Absprache): ohne offenes
    // Gesetz gibt es keine Norm, die als Favorit/Lesezeichen gespeichert
    // werden könnte. Die feinere Unterscheidung "Norm vs. Überschrift
    // ausgewählt" bleibt bewusst NUR eine Fehlermeldung (siehe
    // useLesezeichenUndFavoriten.ts) statt eines zweiten Ausgrau-Zustands.
    let favorit_speichern_item = IconMenuItem::with_id(
        handle,
        "favorit-speichern",
        crate::fenster::norm_menu_text("favorit-speichern", &Default::default()),
        true,
        Some(icon("favorit-speichern", dunkel, true)),
        crate::tastenkuerzel::accelerator("favorit-speichern"),
    )?;
    let favoriten_hinzufuegen_item = IconMenuItem::with_id(
        handle,
        "favoriten-hinzufuegen",
        "Mehrere Favoriten hinzufügen",
        true,
        Some(icon("favoriten-hinzufuegen", dunkel, true)),
        None::<&str>,
    )?;
    let lesezeichen_speichern_item = IconMenuItem::with_id(
        handle,
        "lesezeichen-speichern",
        crate::fenster::norm_menu_text("lesezeichen-speichern", &Default::default()),
        true,
        Some(icon("lesezeichen-speichern", dunkel, true)),
        crate::tastenkuerzel::accelerator("lesezeichen-speichern"),
    )?;

    // War kurzzeitig "Gesetz" – nach Rückmeldung wieder "Navigation": Suche
    // und Info navigieren zwar selbst nicht, aber "Navigation" ist der
    // etabliertere, abstraktere Oberbegriff für "sich innerhalb/zwischen
    // Gesetzen zurechtfinden" (Suche, Verlauf, Favoriten/Lesezeichen als
    // Sprungziele). "Informationen zum geöffneten Gesetz" ist dafür jetzt
    // (siehe oben) bei "Gesetze verwalten" in Ablage einsortiert, da es
    // inhaltlich näher an der Gesetzesverwaltung als an der Navigation ist.
    let oeffnen_item = IconMenuItem::with_id(
        handle,
        "oeffnen",
        "Gesetz oder Norm öffnen",
        true,
        Some(icon("oeffnen", dunkel, true)),
        crate::tastenkuerzel::accelerator("oeffnen"),
    )?;
    let volltext_alle_item = IconMenuItem::with_id(
        handle,
        "volltext-alle",
        "Suche in allen Gesetzen",
        true,
        Some(icon("volltext-alle", dunkel, true)),
        crate::tastenkuerzel::accelerator("volltext-alle"),
    )?;
    let navigation_menu = Submenu::with_items(
        handle,
        "Navigation",
        true,
        &[
            &oeffnen_item,
            &volltext_suche_item,
            &volltext_alle_item,
            &verlauf_anzeigen_item,
            &PredefinedMenuItem::separator(handle)?,
            &favorit_speichern_item,
            &favoriten_hinzufuegen_item,
            &lesezeichen_speichern_item,
            &alle_lesezeichen_entfernen_item,
        ],
    )?;

    menu_item_registry.insert(
        "alle-lesezeichen-entfernen",
        alle_lesezeichen_entfernen_item,
    );
    menu_item_registry.insert("volltext-suche", volltext_suche_item);
    menu_item_registry.insert("verlauf-anzeigen", verlauf_anzeigen_item);
    menu_item_registry.insert("favorit-speichern", favorit_speichern_item);
    menu_item_registry.insert("favoriten-hinzufuegen", favoriten_hinzufuegen_item);
    menu_item_registry.insert("lesezeichen-speichern", lesezeichen_speichern_item);
    menu_item_registry.insert("oeffnen", oeffnen_item);
    menu_item_registry.insert("volltext-alle", volltext_alle_item);
    Ok(navigation_menu)
}

pub(super) fn markierungen(
    handle: &tauri::AppHandle,
    dunkel: bool,
    menu_item_registry: &mut std::collections::HashMap<&'static str, IconMenuItem<tauri::Wry>>,
) -> tauri::Result<Submenu<tauri::Wry>> {
    // Eigene Variable statt inline im werkzeuge_menu-Array unten gebaut: wird
    // weiter unten zusätzlich in menu_item_registry aufgenommen (siehe dort),
    // damit der Themewechsel auch dieses dauerhaft aktive Icon aktualisiert.
    let markierungskonflikte_item = IconMenuItem::with_id(
        handle,
        "markierungskonflikte",
        "Markierungskonflikte verwalten",
        // Dauerhaft aktiv, auch ohne offenes Fenster. Die Einführungssperre
        // wirkt über das gesamte Submenü Markierungen.
        true,
        Some(icon("markierungskonflikte", dunkel, true)),
        None::<&str>,
    )?;

    // Grau, wenn keine Textauswahl besteht – TS-seitig synchronisiert über
    // menueZustandSync.ts (useTextauswahl.ts, inkl. Fokuswechsel-Sync).
    let unterstreichen_item = IconMenuItem::with_id(
        handle,
        "unterstreichen",
        "Unterstreichen",
        true,
        Some(icon("unterstreichen", dunkel, true)),
        crate::tastenkuerzel::accelerator("unterstreichen"),
    )?;
    let hervorheben_item = IconMenuItem::with_id(
        handle,
        "hervorheben",
        "Hervorheben",
        true,
        Some(icon("hervorheben", dunkel, true)),
        crate::tastenkuerzel::accelerator("hervorheben"),
    )?;
    let verweismarkierung_item = IconMenuItem::with_id(
        handle,
        "verweismarkierung",
        "Verweis",
        true,
        Some(icon("verweismarkierung", dunkel, true)),
        crate::tastenkuerzel::accelerator("verweismarkierung"),
    )?;
    let kommentar_item = IconMenuItem::with_id(
        handle,
        "kommentar",
        "Kommentar",
        true,
        Some(icon("kommentar", dunkel, true)),
        crate::tastenkuerzel::accelerator("kommentar"),
    )?;
    // Grau, wenn der Undo-/Redo-Stack leer ist – TS-seitig synchronisiert
    // über useMarkierungen.ts (syncUndoRedoMenuStatus).
    let markierung_rueckgaengig_item = IconMenuItem::with_id(
        handle,
        "markierung-rueckgaengig",
        "Markierung rückgängig",
        true,
        Some(icon("markierung-rueckgaengig", dunkel, true)),
        None::<&str>,
    )?;
    let markierung_wiederholen_item = IconMenuItem::with_id(
        handle,
        "markierung-wiederholen",
        "Markierung wiederholen",
        true,
        Some(icon("markierung-wiederholen", dunkel, true)),
        None::<&str>,
    )?;

    let markierungen_menu = Submenu::with_items(
        handle,
        "Markierungen",
        true,
        &[
            &unterstreichen_item,
            &hervorheben_item,
            &verweismarkierung_item,
            &kommentar_item,
            &PredefinedMenuItem::separator(handle)?,
            // Bewusst OHNE accelerator: ⌘Z/⇧⌘Z sind bereits im
            // Bearbeiten-Menü an PredefinedMenuItem::undo/redo (natives
            // Textfeld-Undo) gebunden – ein zweiter Menüeintrag mit
            // demselben Tastenkürzel würde zu einer Kollision im nativen
            // macOS-Menü führen. ⌘Z/⇧⌘Z funktionieren für Markierungen
            // trotzdem, nur rein JS-seitig (siehe useTastenkuerzel.ts).
            &markierung_rueckgaengig_item,
            &markierung_wiederholen_item,
            &PredefinedMenuItem::separator(handle)?,
            &markierungskonflikte_item,
        ],
    )?;

    menu_item_registry.insert("markierungskonflikte", markierungskonflikte_item);
    menu_item_registry.insert("unterstreichen", unterstreichen_item);
    menu_item_registry.insert("hervorheben", hervorheben_item);
    menu_item_registry.insert("verweismarkierung", verweismarkierung_item);
    menu_item_registry.insert("kommentar", kommentar_item);
    menu_item_registry.insert("markierung-rueckgaengig", markierung_rueckgaengig_item);
    menu_item_registry.insert("markierung-wiederholen", markierung_wiederholen_item);
    Ok(markierungen_menu)
}
