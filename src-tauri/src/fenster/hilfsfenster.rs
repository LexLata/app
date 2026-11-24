// fenster/hilfsfenster.rs
//
// Verweismarkierung-/Kommentar-Hilfsfenster (eigenständiges, kleines
// Utility-Fenster statt Overlay im Hauptfenster – siehe VerweismarkierungKontext/
// KommentarKontext in appTypes.ts: der Nutzer soll währenddessen frei im
// Hauptfenster weiternavigieren können). Ausgelagert aus fenster.rs (siehe
// dort für Fenster-Erstellung/-Lebenszyklus allgemein) – dieses Modul ist
// bewusst auf genau diese zwei Hilfsfenstertypen beschränkt.

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

// Gemeinsame Implementierung für verweismarkierung_fenster_oeffnen und
// kommentar_fenster_oeffnen unten (vorher zwei bis auf den Namen identische
// Funktionen) – feste kompakte Größe, nicht skalierbar, ohne die
// Fullscreen-/Space-Sonderbehandlung von neues_fenster() (reines
// Utility-Fenster, nimmt nicht am normalen Fenster-Zyklus mit mehreren Tabs
// teil, siehe fenster.rs). Unsichtbar erzeugt (siehe .visible(false) unten)
// und erst nach dem ersten React-Render sichtbar gemacht (siehe
// useFensterSichtbarMachen.ts), da hier keine gespeicherte Geometrie/kein
// Tab-Zustand angewendet wird, die das ohnehin verzögern würden.
// `aufrufer_name` wird nur für die Fehlermeldung gebraucht, um bei einem
// Build-Fehler weiterhin zu sehen, von welchem Command er kam.
fn hilfsfenster_oeffnen(
    app: &tauri::AppHandle,
    label: &str,
    titel: &str,
    hoehe: f64,
    aufrufer_name: &str,
) {
    if app.get_webview_window(label).is_some() {
        return;
    }
    let anfrage = app.state::<super::beenden_anfrage::BeendenAnfrage>();
    let Some(erstellung) = anfrage.hilfsfenster_vormerken() else {
        return;
    };

    #[allow(unused_mut)]
    let mut builder = WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title(titel)
        .inner_size(420.0, hoehe)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .center()
        // Unsichtbar starten (gleiches Muster wie neues_fenster() in
        // fenster.rs bzw. einstellungen_fenster_oeffnen unten): sonst zeigt
        // sich kurz der weiße background_color-Fallback, bevor React den
        // ersten Frame gemalt hat ("weißes Aufblitzen"). JS-seitig macht
        // useFensterSichtbarMachen.ts (VerweismarkierungFenster.tsx/
        // KommentarFenster.tsx) das Fenster nach dem ersten Render sichtbar.
        .visible(false)
        .background_color(tauri::webview::Color(255, 255, 255, 255));

    #[cfg(target_os = "macos")]
    {
        builder = builder.title_bar_style(tauri::TitleBarStyle::Visible);
    }

    match builder.build() {
        Ok(_) => erstellung.geoeffnet(),
        Err(e) => eprintln!("{aufrufer_name}: Fenstererstellung fehlgeschlagen: {e}"),
    }
}

/// Öffnet das kleine, NICHT skalierbare Verweismarkierung-Hilfsfenster mit dem
/// gegebenen Label. Die eigentlichen Startdaten (Ausgangsgesetz/-norm,
/// Auswahl) liegen zu diesem Zeitpunkt bereits über
/// verweismarkierung_kontext_ablegen bereit (siehe useMarkierungen.ts:
/// handleVerweismarkierungAnfrage) – main.tsx erkennt anhand des Label-Präfixes
/// "verweismarkierung-", dass VerweismarkierungFenster.tsx statt der normalen App
/// gerendert werden muss, und holt sich den Kontext darüber selbst ab.
#[tauri::command]
pub fn verweismarkierung_fenster_oeffnen(
    app: tauri::AppHandle,
    label: String,
    titel: String,
    hoehe: f64,
) {
    hilfsfenster_oeffnen(
        &app,
        &label,
        &titel,
        hoehe,
        "verweismarkierung_fenster_oeffnen",
    );
}

/// Pendant zu verweismarkierung_fenster_oeffnen für das Kommentar-Hilfsfenster
/// (siehe KommentarKontext in appTypes.ts) – identisches Fenster-Verhalten,
/// nur mit eigenem Label-Präfix "kommentar-" (siehe main.tsx) und eigenem
/// Kontext-Kanal (kommentar_kontext_ablegen/-abholen, commands.rs).
#[tauri::command]
pub fn kommentar_fenster_oeffnen(app: tauri::AppHandle, label: String, titel: String, hoehe: f64) {
    hilfsfenster_oeffnen(&app, &label, &titel, hoehe, "kommentar_fenster_oeffnen");
}

/// Öffnet das Einstellungen-Fenster (früher: Overlay im Hauptfenster, siehe
/// Einstellungen.tsx-Historie). main.tsx erkennt das Label "einstellungen"
/// und rendert EinstellungenFenster.tsx statt der normalen App. Anders als
/// hilfsfenster_oeffnen oben bewusst RESIZABLE MIT SCROLL statt fester
/// Größe (Nutzerentscheidung) – daher resizables_singleton_fenster_oeffnen()
/// (fenster.rs) statt hilfsfenster_oeffnen.
#[tauri::command]
pub fn einstellungen_fenster_oeffnen(app: tauri::AppHandle) {
    // Unsichtbar-starten/sichtbar-machen (siehe useFensterSichtbarMachen.ts)
    // steckt zentral in resizables_singleton_fenster_oeffnen (fenster.rs),
    // ebenso wie die "bereits offen → fokussieren"-Logik.
    super::resizables_singleton_fenster_oeffnen(
        &app,
        "einstellungen",
        "Einstellungen",
        (600.0, 680.0),
        (460.0, 420.0),
    );
}
