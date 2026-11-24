// Baut LexLata, Ablage, Fenster und Hilfe.
use super::icons::icon;
use tauri::menu::{IconMenuItem, PredefinedMenuItem, Submenu};

pub(super) fn lexlata(
    handle: &tauri::AppHandle,
    dunkel: bool,
    menu_item_registry: &mut std::collections::HashMap<&'static str, IconMenuItem<tauri::Wry>>,
) -> tauri::Result<Submenu<tauri::Wry>> {
    // Für die PredefinedMenuItems, deren Label sonst aus der macOS-System-
    // lokalisierung kommt (About/Ausblenden/Andere ausblenden/Alle
    // einblenden/Beenden) – bei einer auf Deutsch entwickelten App, aber
    // englischem System-Locale, zeigte macOS hier sonst z.B. "About LexLata"
    // an, während der Rest der Menüleiste deutsch ist. Die vier genannten
    // sowie "Beenden" akzeptieren einen Text-Override als zweiten Parameter;
    // die übrigen PredefinedMenuItems (Minimieren/Zoomen/Vollbild,
    // Rückgängig/Wiederholen/Ausschneiden/Kopieren/Einfügen/Alles auswählen)
    // haben denselben Override-Parameter und werden aus Konsistenzgründen
    // ebenfalls gesetzt.
    let einstellungen_item = IconMenuItem::with_id(
        handle,
        "einstellungen",
        "Einstellungen…",
        true,
        Some(icon("einstellungen", dunkel, true)),
        crate::tastenkuerzel::accelerator("einstellungen"),
    )?;
    // „Über LexLata“ öffnet die eigene Über-Ansicht statt des Systemfensters.
    // Unter macOS nur hier (nicht zusätzlich im Hilfe-Menü), damit der Titel
    // im nativen Menü eindeutig bleibt. Ohne Icon wie die übrigen Systempunkte
    // (siehe icons.rs::ICONLOSE_IDS), aber in der Registry, damit er ohne
    // Hauptfenster ausgegraut wird.
    let ueber_item = IconMenuItem::with_id(
        handle,
        "ueber",
        "Über LexLata",
        true,
        None::<tauri::image::Image<'static>>,
        None::<&str>,
    )?;
    // Manuelle Updateprüfung direkt unter „Über LexLata“, mit Icon.
    let nach_updates_suchen_item = IconMenuItem::with_id(
        handle,
        "nach-updates-suchen",
        "Nach Updates suchen…",
        true,
        Some(icon("nach-updates-suchen", dunkel, true)),
        None::<&str>,
    )?;
    let lexlata_menu = Submenu::with_items(
        handle,
        "LexLata",
        true,
        &[
            &ueber_item,
            &nach_updates_suchen_item,
            &PredefinedMenuItem::separator(handle)?,
            &einstellungen_item,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::services(handle, Some("Dienste"))?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::hide(handle, Some("LexLata ausblenden"))?,
            &PredefinedMenuItem::hide_others(handle, Some("Andere ausblenden"))?,
            &PredefinedMenuItem::show_all(handle, Some("Alle einblenden"))?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::quit(handle, Some("LexLata beenden"))?,
        ],
    )?;

    menu_item_registry.insert("einstellungen", einstellungen_item);
    menu_item_registry.insert("ueber", ueber_item);
    menu_item_registry.insert("nach-updates-suchen", nach_updates_suchen_item);
    Ok(lexlata_menu)
}

pub(super) fn ablage(
    handle: &tauri::AppHandle,
    dunkel: bool,
    menu_item_registry: &mut std::collections::HashMap<&'static str, IconMenuItem<tauri::Wry>>,
) -> tauri::Result<Submenu<tauri::Wry>> {
    // "Schließen" (⌘W, schließt Tab bzw. bei letztem Tab das Fenster) und
    // "Fenster schließen" (⇧⌘W, schließt IMMER das ganze Fenster) werden in
    // Variablen gehalten, weil sie unten zusätzlich in die MenuItemRegistry
    // aufgenommen werden – beide sollen grau sein, wenn es kein sichtbares
    // Fenster gibt (siehe fenster_abhaengige_menu_items_synchronisieren).
    let schliessen_tab_item = IconMenuItem::with_id(
        handle,
        "schliessen-tab",
        "Tab schließen",
        true,
        Some(icon("schliessen-tab", dunkel, true)),
        crate::tastenkuerzel::accelerator("schliessen-tab"),
    )?;
    let fenster_schliessen_item = IconMenuItem::with_id(
        handle,
        "fenster-schliessen",
        "Fenster schließen",
        true,
        Some(icon("fenster-schliessen", dunkel, true)),
        crate::tastenkuerzel::accelerator("fenster-schliessen"),
    )?;
    // Analog: "Zuletzt geschlossenen Tab öffnen" soll grau sein, wenn der
    // Stapel geschlossener Tabs leer ist – dann würde ein Klick nur den
    // Leer-Tab-Fallback öffnen (siehe geschlosseneTabsSpeicher.ts). Der
    // Tastaturkürzel-Pfad (⇧⌘T) bleibt davon unabhängig aktiv, siehe
    // useTastenkuerzel.ts.
    let letzter_tab_item = IconMenuItem::with_id(
        handle,
        "letzter-tab",
        "Zuletzt geschlossenen Tab öffnen",
        true,
        Some(icon("letzter-tab", dunkel, true)),
        crate::tastenkuerzel::accelerator("letzter-tab"),
    )?;
    // Grau, wenn (noch) keine Gesetze importiert sind – dann gäbe es nichts
    // zu aktualisieren. TS-seitig synchronisiert über useGesetzVerwaltung.ts
    // (gesetze-State-Länge).
    let gesetze_aktualisieren_item = IconMenuItem::with_id(
        handle,
        "gesetze-aktualisieren",
        "Gesetze aktualisieren",
        true,
        Some(icon("gesetze-aktualisieren", dunkel, true)),
        crate::tastenkuerzel::accelerator("gesetze-aktualisieren"),
    )?;

    // Gemeinsam mit letzter_tab_item/schliessen_tab_item/fenster_schliessen_item
    // Variablen, weil sie unten in die MenuItemRegistry aufgenommen werden –
    // grau, wenn kein Fenster offen ist (Ausnahme siehe Absprache: Neues
    // Fenster/Neuer Tab/Zuletzt geschlossenen Tab öffnen funktionieren
    // GERADE OHNE Fenster, bleiben also immer aktiv).
    let gesetzesuebersicht_item = IconMenuItem::with_id(
        handle,
        "gesetzesuebersicht",
        "Gesetze verwalten",
        true,
        Some(icon("gesetzesuebersicht", dunkel, true)),
        crate::tastenkuerzel::accelerator("gesetzesuebersicht"),
    )?;
    // Bewusst HIER (statt im Navigation-Menü) – siehe Absprache: "Suche im
    // geöffneten Gesetz" navigiert selbst nicht, "Informationen zum
    // Gesetz" erst recht nicht; hier direkt bei "Gesetze verwalten"
    // passt inhaltlich besser als im navigationslastigen Menü.
    let gesetz_info_item = IconMenuItem::with_id(
        handle,
        "gesetz-info",
        "Informationen zum geöffneten Gesetz",
        true,
        Some(icon("gesetz-info", dunkel, true)),
        crate::tastenkuerzel::accelerator("gesetz-info"),
    )?;
    let dateien_importieren_item = IconMenuItem::with_id(
        handle,
        "dateien-importieren",
        "Dateien importieren…",
        true,
        Some(icon("dateien-importieren", dunkel, true)),
        crate::tastenkuerzel::accelerator("dateien-importieren"),
    )?;
    let importindizes_aktualisieren_item = IconMenuItem::with_id(
        handle,
        "gesetzesindizes-aktualisieren",
        "Importindizes aktualisieren",
        true,
        Some(icon("gesetzesindizes-aktualisieren", dunkel, true)),
        None::<&str>,
    )?;
    let export_item = IconMenuItem::with_id(
        handle,
        "export",
        "Export",
        true,
        Some(icon("export", dunkel, true)),
        crate::tastenkuerzel::accelerator("export"),
    )?;

    let neues_fenster_item = IconMenuItem::with_id(
        handle,
        "neues-fenster",
        "Neues Fenster",
        true,
        Some(icon("neues-fenster", dunkel, true)),
        crate::tastenkuerzel::accelerator("neues-fenster"),
    )?;
    let neuer_tab_item = IconMenuItem::with_id(
        handle,
        "neuer-tab",
        "Neuer Tab",
        true,
        Some(icon("neuer-tab", dunkel, true)),
        crate::tastenkuerzel::accelerator("neuer-tab"),
    )?;
    let ablage_menu = Submenu::with_items(
        handle,
        "Ablage",
        true,
        &[
            &neues_fenster_item,
            &neuer_tab_item,
            &letzter_tab_item,
            &PredefinedMenuItem::separator(handle)?,
            &schliessen_tab_item,
            &fenster_schliessen_item,
            &PredefinedMenuItem::separator(handle)?,
            &gesetzesuebersicht_item,
            &gesetz_info_item,
            &dateien_importieren_item,
            &gesetze_aktualisieren_item,
            &importindizes_aktualisieren_item,
            &export_item,
        ],
    )?;

    menu_item_registry.insert("schliessen-tab", schliessen_tab_item);
    menu_item_registry.insert("fenster-schliessen", fenster_schliessen_item);
    menu_item_registry.insert("letzter-tab", letzter_tab_item);
    menu_item_registry.insert("gesetze-aktualisieren", gesetze_aktualisieren_item);
    menu_item_registry.insert("gesetzesuebersicht", gesetzesuebersicht_item);
    menu_item_registry.insert("gesetz-info", gesetz_info_item);
    menu_item_registry.insert("dateien-importieren", dateien_importieren_item);
    menu_item_registry.insert(
        "gesetzesindizes-aktualisieren",
        importindizes_aktualisieren_item,
    );
    menu_item_registry.insert("export", export_item);
    menu_item_registry.insert("neues-fenster", neues_fenster_item);
    menu_item_registry.insert("neuer-tab", neuer_tab_item);
    Ok(ablage_menu)
}

pub(super) fn fenster(handle: &tauri::AppHandle) -> tauri::Result<Submenu<tauri::Wry>> {
    let fenster_menu = Submenu::with_items(
        handle,
        "Fenster",
        true,
        &[
            &PredefinedMenuItem::minimize(handle, Some("Minimieren"))?,
            &PredefinedMenuItem::maximize(handle, Some("Zoomen"))?,
            &PredefinedMenuItem::separator(handle)?,
            &PredefinedMenuItem::fullscreen(handle, Some("Vollbild"))?,
        ],
    )?;

    Ok(fenster_menu)
}

pub(super) fn hilfe(
    handle: &tauri::AppHandle,
    dunkel: bool,
    menu_item_registry: &mut std::collections::HashMap<&'static str, IconMenuItem<tauri::Wry>>,
) -> tauri::Result<Submenu<tauri::Wry>> {
    let einfuehrung_neu_starten_item = IconMenuItem::with_id(
        handle,
        "einfuehrung-neu-starten",
        "Einführung erneut durchführen",
        true,
        Some(icon("einfuehrung-neu-starten", dunkel, true)),
        None::<&str>,
    )?;
    let tastenkuerzel_item = IconMenuItem::with_id(
        handle,
        "tastenkuerzel",
        "Tastenkürzel",
        true,
        Some(icon("tastenkuerzel", dunkel, true)),
        None::<&str>,
    )?;
    let datenschutz_item = IconMenuItem::with_id(
        handle,
        "datenschutz",
        "Datenschutz",
        true,
        Some(icon("datenschutz", dunkel, true)),
        None::<&str>,
    )?;
    let hilfe_menu = Submenu::with_items(
        handle,
        "Hilfe",
        true,
        &[
            &einfuehrung_neu_starten_item,
            &tastenkuerzel_item,
            &datenschutz_item,
        ],
    )?;

    menu_item_registry.insert("einfuehrung-neu-starten", einfuehrung_neu_starten_item);
    menu_item_registry.insert("tastenkuerzel", tastenkuerzel_item);
    menu_item_registry.insert("datenschutz", datenschutz_item);
    Ok(hilfe_menu)
}
