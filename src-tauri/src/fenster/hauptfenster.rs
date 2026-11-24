// Hauptfenster erzeugen und wiederherstellen: Geometrie, unsichtbarer Start und Kaskade.
use super::{fenster_collection_behavior_setzen, menu_sync, navigation};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

// Größe/Position eines Fensters, wie sie aus fensterSpeicher.ts (TypeScript-
// Pendant: FensterGeometrie) über fenster_oeffnen_mit_label hereinkommt, bzw.
// wie sie vom "Neues Fenster"-Menüpunkt aus dem aktuell fokussierten Fenster
// übernommen wird.
#[derive(serde::Deserialize, Clone)]
pub struct FensterGeometrie {
    pub breite: u32,
    pub hoehe: u32,
    #[cfg(target_os = "macos")]
    pub x: i32,
    #[cfg(target_os = "macos")]
    pub y: i32,
    pub maximiert: bool,
}

// Liest die zuletzt von einem Hauptfenster gespeicherte Geometrie aus
// letzte-fenster-geometrie.json (siehe LETZTE_GEOMETRIE_DATEI in
// fensterGeometrieSpeicher.ts) – Fallback, wenn an anderer Stelle keine
// spezifischere Geometrie vorliegt: in neues_fenster() (kein fokussiertes
// Fenster zum Übernehmen, weil gerade keines offen ist) und beim
// synchronen main-Setup in lib.rs (main hat noch keinen eigenen gespeicherten
// Zustand).
pub fn letzte_fenster_geometrie_lesen<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Option<FensterGeometrie> {
    let pfad = crate::app_daten_basis_pfad(app).ok()?;
    // Liegt seit der Einstellungen-Export/-Import-Umstellung im gemeinsamen
    // "einstellungen"-Unterordner (Gegenstück: EINSTELLUNGEN_ORDNER in
    // appDatenZugriff.ts) statt im AppData-Root.
    let inhalt = std::fs::read_to_string(
        pfad.join("einstellungen")
            .join("letzte-fenster-geometrie.json"),
    )
    .ok()?;
    serde_json::from_str(&inhalt).ok()
}

// Öffnet ein neues Fenster. Mit `label = None` wird ein zufälliges, eindeutiges
// Label erzeugt (Menü "Neues Fenster", bisher nur macOS); mit explizitem Label
// wird genau dieses verwendet – so kann App.tsx beim Start zuvor offene
// Fenster (siehe fensterSpeicher.ts) mit demselben Label wiederherstellen,
// das sie beim Beenden hatten, und jedes Fenster findet darüber seinen
// eigenen gespeicherten Tab-Zustand wieder.
//
// `geometrie`: bei Wiederherstellung die zuletzt gespeicherte Größe/Position
// dieses Labels; beim "Neues Fenster"-Menüpunkt die Größe des aktuell
// fokussierten Fensters (siehe Menü-Handler in menu.rs). Liegt hier `None`
// vor (z. B. weil gerade kein Fenster offen bzw. fokussiert ist), greift
// weiter unten ein Fallback auf letzte_fenster_geometrie_lesen(). Das
// Fenster wird bewusst UNSICHTBAR erzeugt (.visible(false)) –
// useFensterRestore.ts auf der JS-Seite wendet Tabs an und ruft danach
// show() auf, damit das Fenster nie erst in falscher Größe aufblitzt und
// sich dann sichtbar "korrigiert".
pub fn neues_fenster<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    label: Option<String>,
    geometrie: Option<FensterGeometrie>,
) -> Result<(), String> {
    let label = label.unwrap_or_else(|| {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        format!("fenster-{:x}", nanos)
    });

    // Falls schon ein Fenster mit diesem Label existiert (z. B. doppelter
    // Wiederherstellungs-Aufruf), nicht erneut erstellen.
    if app.get_webview_window(&label).is_some() {
        return Ok(());
    }

    // Keine spezifischere Geometrie übergeben – dann die zuletzt von
    // einem Hauptfenster gespeicherte Geometrie als Fallback verwenden,
    // statt das Fenster auf der Platzhalter-Startgröße unten zu belassen.
    let geometrie = geometrie.or_else(|| letzte_fenster_geometrie_lesen(app));

    // Platzhalter-Startgröße für den Builder, der WebviewWindowBuilder::inner_size
    // zufolge LOGISCHE Pixel erwartet. Ist `geometrie` vorhanden, wird die Größe
    // direkt im Anschluss per set_size (siehe unten) in PHYSISCHEN Pixeln exakt
    // gesetzt – der Platzhalter ist dann nur eine nie sichtbare Zwischengröße
    // (Fenster ist bis fensterAnzeigen() in useFensterRestore.ts unsichtbar).
    let interner_start = app
        .try_state::<navigation::Navigation>()
        .is_some_and(|n| n.ist_interner_start(&label));
    let builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("LexLata")
        .focused(!interner_start)
        .inner_size(1000.0, 700.0)
        .visible(false)
        // Gegen weißes Aufblitzen, bevor die Webview ihr eigenes CSS geladen
        // hat (siehe index.html für den entsprechenden Inline-Style, der
        // bei main über "backgroundColor" in tauri.conf.json gesetzt wird).
        .background_color(tauri::webview::Color(255, 255, 255, 255));

    // Überlappende Titelleiste ist ein macOS-spezifisches Konzept – die
    // Builder-Methoden dafür existieren im Tauri-Crate selbst nur dort.
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);

    {
        let fenster = builder.build().map_err(|e| e.to_string())?;
        if let Some(g) = geometrie {
            // Größe explizit als Size::Physical setzen statt über den Builder:
            // unsere Geometrie (aus der JS-seitigen innerSize()) liegt in
            // PHYSISCHEN Pixeln vor, WebviewWindowBuilder::inner_size erwartet
            // aber LOGISCHE Pixel – auf einem Retina-Display (Skalierungsfaktor
            // 2) würde das Fenster sonst doppelt so groß wie beabsichtigt
            // erzeugt (und vom Betriebssystem auf Bildschirmgröße gestutzt).
            // Mit Physical(...) ist die Einheit explizit, keine Verwechslung
            // möglich – analog zu set_position direkt darunter.
            let _ = fenster.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                width: g.breite,
                height: g.hoehe,
            }));
            // Position nur auf macOS setzen: dort übernehmen wir bewusst die
            // exakte vorherige Position bzw. die Kaskade beim "Neues Fenster"-
            // Menüpunkt. Auf Windows/Linux überlassen wir die Platzierung dem
            // jeweiligen Fenstermanager/Betriebssystem.
            #[cfg(target_os = "macos")]
            {
                let _ = fenster.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                    x: g.x,
                    y: g.y,
                }));
            }
            if g.maximiert {
                let _ = fenster.maximize();
            }
        }

        fenster_collection_behavior_setzen(&fenster);
    }
    Ok(())
}

// Von App.tsx beim Start aufgerufen, um Fenster mit genau dem Label
// wiederherzustellen, das sie beim letzten Beenden hatten.
#[tauri::command]
pub fn fenster_oeffnen_mit_label(
    app: tauri::AppHandle,
    label: String,
    geometrie: Option<FensterGeometrie>,
) -> Result<(), String> {
    neues_fenster(&app, Some(label), geometrie)
}

// Erzeugt ein neues, kaskadiertes Fenster ausgehend vom aktuell fokussierten
// Fenster – die Kaskaden-Geometrie-Berechnung (Größe übernehmen, auf macOS
// zusätzlich mit Versatz, NICHT bei Vollbild/maximiert), die vorher NUR
// inline im "neues-fenster"-Zweig von menu.rs stand (dort einzige
// Aufrufstelle, da bislang nur über die native macOS-Menüleiste erreichbar).
// Jetzt als eigene, wiederverwendbare Funktion, weil ein zweiter echter
// Anwendungsfall hinzukam: das Hamburger-Dropdown-Menü unter Windows/Linux
// (siehe hamburgerMenu.ts) hat kein natives Rust-seitiges Menü-Event, ruft
// diesen Command daher direkt per invoke auf. menu.rs ruft ab jetzt
// ebenfalls diese Funktion statt der vorherigen Inline-Kopie (siehe dort) –
// Single Source of Truth für die Kaskaden-Logik.
#[tauri::command]
pub fn neues_fenster_anfordern(app: tauri::AppHandle) -> Result<(), String> {
    neues_fenster_kaskadiert(&app)
}

// Hilfsfenster liefern niemals die Geometrie eines neuen Hauptfensters.
fn ist_kaskaden_vorbild(label: &str, fokussiert: bool, vollbild: bool) -> bool {
    menu_sync::ist_hauptfenster(label) && fokussiert && !vollbild
}

pub fn neues_fenster_kaskadiert(app: &tauri::AppHandle) -> Result<(), String> {
    let geometrie = app
        .webview_windows()
        .values()
        .find(|fenster| {
            ist_kaskaden_vorbild(
                fenster.label(),
                fenster.is_focused().unwrap_or(false),
                fenster.is_fullscreen().unwrap_or(false),
            )
        })
        .and_then(|fenster| {
            let groesse = fenster.inner_size().ok()?;
            #[cfg(target_os = "macos")]
            let (x, y) = {
                let position = fenster.outer_position().ok()?;
                (position.x + 24, position.y + 24)
            };
            Some(FensterGeometrie {
                breite: groesse.width,
                hoehe: groesse.height,
                #[cfg(target_os = "macos")]
                x,
                #[cfg(target_os = "macos")]
                y,
                maximiert: false,
            })
        });
    neues_fenster(app, None, geometrie)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn nur_fokussierte_hauptfenster_ohne_vollbild_sind_kaskaden_vorbilder() {
        for label in ["main", "fenster-123"] {
            assert!(ist_kaskaden_vorbild(label, true, false));
            assert!(!ist_kaskaden_vorbild(label, false, false));
            assert!(!ist_kaskaden_vorbild(label, true, true));
        }
        for label in [
            "einstellungen",
            "markierungskonflikte",
            "verweismarkierung-123",
            "kommentar-123",
        ] {
            assert!(!ist_kaskaden_vorbild(label, true, false));
        }
    }
}
