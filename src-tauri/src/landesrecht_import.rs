// Landesrecht-Import (landesrecht-bw.de) – vorerst nur HTML-Download.
//
// Hintergrund: landesrecht-bw.de ist eine vollständige React-SPA. Das vom
// Server gelieferte HTML ist nur eine leere Hülle (Lade-Spinner); der
// eigentliche Inhalt inkl. des Tab-Links "Aktuelle Gesamtausgabe" wird erst
// clientseitig gerendert. Ein reiner fetch() kann diesen Inhalt daher
// grundsätzlich nicht liefern – stattdessen wird hier ein echtes (vorerst
// sichtbares) WebView-Fenster verwendet, das die Seite lädt, per
// injiziertem JS auf den Link klickt und anschließend das gerenderte DOM
// ausliest.
//
// WICHTIG – warum kein invoke() UND kein Formular-Submit aus dem
// injizierten Skript:
// Zwei Versuche, das ausgelesene HTML aus dem Kontext der Fremd-Seite
// zurückzugeben, sind nachweislich gescheitert: landesrecht-bw.de sendet
// eine eigene Content-Security-Policy, deren `connect-src`-Direktive JEDEN
// invoke()-Aufruf blockiert (`ipc://`), UND deren `form-action`-Direktive
// JEDE Formular-Navigation blockiert (das zuvor genutzte
// "landesimport://"-URI-Schema). Beide Wege können von unserer Seite aus
// nicht umgangen werden – bitte nicht erneut versuchen.
//
// Stattdessen wird das gerenderte DOM per nativem, plattformspezifischem
// "JS auswerten und Ergebnis zurückgeben" ausgelesen (siehe
// javascript_auswerten in landesrecht_import_{mac,linux,windows}.rs) –
// analog zu "Seite speichern unter" in Firefox: kein von der Seite selbst
// initiierter Vorgang, daher CSP-immun.
//
// Timing: es gibt kein bekanntes, site-spezifisches DOM-Merkmal, an dem sich
// "fertig gerendert" erkennen ließe – daher wird stattdessen per Polling auf
// zwei generische Signale gewartet: (1) Existenz des Tab-Links, (2) Stabilität
// der sichtbaren Textlänge nach dem Klick (siehe warte_bis_vorhanden /
// warte_bis_inhalt_stabil unten). Das reagiert sofort bei schneller
// Verbindung und wartet bei langsamer Verbindung entsprechend länger, bis zu
// den jeweiligen MAX_WARTEZEIT_*-Obergrenzen.

use std::time::Duration;
use tauri::{Url, WebviewUrl, WebviewWindowBuilder};

#[cfg(all(desktop, target_os = "linux"))]
mod linux;
#[cfg(all(desktop, target_os = "macos"))]
mod mac;
#[cfg(all(desktop, target_os = "windows"))]
mod windows;

#[cfg(target_os = "linux")]
use linux::javascript_auswerten;
#[cfg(target_os = "macos")]
use mac::javascript_auswerten;
#[cfg(target_os = "windows")]
use windows::javascript_auswerten;

const POLL_INTERVALL: Duration = Duration::from_millis(200);
const MAX_WARTEZEIT_LINK: Duration = Duration::from_secs(10);
const MAX_WARTEZEIT_INHALT: Duration = Duration::from_secs(10);
/// Wartezeit für das Erscheinen mindestens eines Gesetzes-Links auf den
/// Absch-Übersichtsseiten (lade_landesrecht_uebersichtsseite) – großzügiger
/// als MAX_WARTEZEIT_LINK, da manche dieser Seiten (z. B. Absch2) deutlich
/// länger zum vollständigen Laden brauchen als ein einzelnes Gesetz.
const MAX_WARTEZEIT_UEBERSICHT: Duration = Duration::from_secs(25);
/// Anzahl aufeinanderfolgender gleicher Textlängen-Messungen, bevor der
/// Inhalt als "fertig gerendert" gilt (siehe warte_bis_inhalt_stabil).
const STABILITAETS_SCHWELLE: u32 = 3;

/// Wartet per Polling, bis das übergebene Prüf-Skript im WebView den
/// String "true" zurückgibt (statt einer festen Wartezeit). Ersetzt die
/// vorherige feste WARTEZEIT_INITIAL – reagiert damit sofort, sobald der
/// Link tatsächlich im DOM steht, statt immer die volle Zeit zu warten.
async fn warte_bis_vorhanden(
    fenster: &tauri::WebviewWindow,
    pruef_skript: &str,
    max_wartezeit: Duration,
) -> Result<(), String> {
    let start = std::time::Instant::now();
    loop {
        let ergebnis = javascript_auswerten(fenster, pruef_skript).await?;
        if ergebnis.trim() == "true" {
            return Ok(());
        }
        if start.elapsed() >= max_wartezeit {
            return Err("Zeitüberschreitung beim Warten auf den Tab-Link.".to_string());
        }
        tokio::time::sleep(POLL_INTERVALL).await;
    }
}

/// Wartet per Polling, bis sich die Textlänge des Inhalts (document.body
/// .innerText.length) über STABILITAETS_SCHWELLE aufeinanderfolgende Messungen
/// nicht mehr ändert – als günstiger Stellvertreter für "fertig gerendert",
/// ohne dass ein site-spezifisches DOM-Merkmal bekannt sein muss. Ersetzt
/// die vorherige feste WARTEZEIT_NACH_KLICK.
async fn warte_bis_inhalt_stabil(
    fenster: &tauri::WebviewWindow,
    max_wartezeit: Duration,
) -> Result<(), String> {
    const LAENGEN_SKRIPT: &str = "document.body.innerText.length.toString();";

    let start = std::time::Instant::now();
    let mut letzte_laenge: Option<String> = None;
    let mut gleich_in_folge: u32 = 0;

    loop {
        let laenge = javascript_auswerten(fenster, LAENGEN_SKRIPT).await?;
        if Some(&laenge) == letzte_laenge.as_ref() {
            gleich_in_folge += 1;
            if gleich_in_folge >= STABILITAETS_SCHWELLE {
                return Ok(());
            }
        } else {
            gleich_in_folge = 1;
            letzte_laenge = Some(laenge);
        }

        if start.elapsed() >= max_wartezeit {
            // Kein Fehler: nach Zeitüberschreitung trotzdem mit dem
            // aktuellen (evtl. noch nicht ganz stabilen) Stand fortfahren,
            // statt den gesamten Import abzubrechen – die anschließende
            // finale JS-Auswertung liest ohnehin den dann aktuellen DOM-Stand.
            return Ok(());
        }
        tokio::time::sleep(POLL_INTERVALL).await;
    }
}

/// Wartet per Polling, bis `.docLayoutText` im DOM vorhanden ist – als
/// inhaltliche Ergänzung zu warte_bis_inhalt_stabil. Nötig, weil der Klick
/// auf "Aktuelle Gesamtausgabe" tatsächlich eine echte Seiten-Navigation
/// auslöst (siehe URL-Wechsel im Diagnose-Log), nicht nur einen SPA-Tab-
/// Wechsel. Nach einer echten Navigation kann die Textlänge des Grundgerüsts
/// (Header etc.) kurzzeitig zufällig stabil bleiben, während der eigentliche
/// Dokumentinhalt – besonders bei langsamer Verbindung – noch nachlädt.
/// warte_bis_inhalt_stabil würde diesen Zwischenzustand fälschlich als
/// "fertig" durchgehen lassen. Gibt bei Zeitüberschreitung keinen Fehler
/// zurück (kein Err), da die anschließende finale Auswertung ohnehin den
/// dann aktuellen Stand liest und eine aussagekräftigere Fehlermeldung
/// liefert, falls docLayoutText tatsächlich dauerhaft fehlt.
async fn warte_bis_doclayout_vorhanden(fenster: &tauri::WebviewWindow, max_wartezeit: Duration) {
    const PRUEF_SKRIPT: &str = "document.querySelector('.docLayoutText') ? 'true' : 'false';";
    let start = std::time::Instant::now();
    loop {
        match javascript_auswerten(fenster, PRUEF_SKRIPT).await {
            Ok(ergebnis) if ergebnis.trim() == "true" => return,
            _ => {}
        }
        if start.elapsed() >= max_wartezeit {
            return;
        }
        tokio::time::sleep(POLL_INTERVALL).await;
    }
}

/// Einzig erlaubter Host für Landesrecht-BW-Hintergrundfenster. Alle drei
/// Commands (lade_gesetz_html_bw, lade_landesrecht_uebersichtsseite,
/// lade_landesrecht_dokumentseite) laufen durch hintergrund_fenster_erzeugen
/// – die Prüfung dort statt einzeln in jedem Command deckt daher auch
/// lade_landesrecht_dokumentseite ab, dessen `url`-Parameter (anders als
/// `kuerzel`/`dok_id` bei den anderen beiden) unverändert von der TS-Seite
/// übernommen wird. Defense in Depth: verhindert, dass ein kompromittierter
/// oder fehlerhaft geparster Link (siehe indexErstellungBW.ts) ein
/// WebView-Fenster mit beliebiger URL samt nativer JS-Auswertung öffnet.
const ERLAUBTER_LANDESRECHT_HOST: &str = "www.landesrecht-bw.de";

/// Prüft Anfangsadresse und spätere Hauptseiten-Navigation nach demselben Vertrag.
fn ist_landesrecht_navigation_erlaubt(ziel: &Url) -> bool {
    ziel.host_str() == Some(ERLAUBTER_LANDESRECHT_HOST)
        && ziel.scheme() == "https"
        && ziel.port_or_known_default() == Some(443)
        && ziel.username().is_empty()
        && ziel.password().is_none()
}

/// Schließt nach jedem regulären Arbeitsabschluss, einschließlich Fehler/Timeout.
async fn mit_fensterbereinigung<T, S: std::future::Future<Output = Result<(), String>>>(
    arbeit: impl std::future::Future<Output = Result<T, String>>,
    schliessen: impl FnOnce() -> S,
) -> Result<T, String> {
    let ergebnis = arbeit.await;
    match (ergebnis, schliessen().await) {
        (ergebnis, Ok(())) => ergebnis,
        (Ok(_), Err(bereinigungsfehler)) => Err(bereinigungsfehler),
        (Err(arbeitsfehler), Err(bereinigungsfehler)) => {
            Err(format!("{arbeitsfehler} Zusätzlich: {bereinigungsfehler}"))
        }
    }
}

/// Bestätigung ist das native Destroyed-Ereignis, nicht nur der Schließauftrag.
/// Keine synchrone Fensterverwaltungsabfrage innerhalb der asynchronen Frist.
async fn warte_auf_fensterabschluss(
    bestaetigung: impl std::future::Future<Output = ()>,
    frist: Duration,
    label: &str,
) -> Result<(), String> {
    tokio::time::timeout(frist, bestaetigung).await.map_err(|_| format!(
        "Zeitüberschreitung beim Schließen des Landesrecht-Import-Fensters „{label}“; native Abschlussbestätigung fehlt."
    ))
}

async fn hintergrund_fenster_schliessen(fenster: &tauri::WebviewWindow) -> Result<(), String> {
    let abschluss = std::sync::Arc::new(tokio::sync::Notify::new());
    let bestaetigung = abschluss.clone();
    // Vor dem Auftrag registrieren: auch sofortiges Destroyed darf nicht verloren gehen.
    fenster.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Destroyed) {
            bestaetigung.notify_one();
        }
    });
    fenster.close().map_err(|e| {
        format!(
            "Landesrecht-Import-Fenster „{}“ konnte nicht geschlossen werden: {e}",
            fenster.label()
        )
    })?;
    warte_auf_fensterabschluss(
        abschluss.notified(),
        Duration::from_secs(5),
        fenster.label(),
    )
    .await
}

/// Erzeugt ein unsichtbares WebView-Hintergrundfenster für die übergebene
/// URL. Alle drei Abrufarten verwenden privaten Browserkomponentenspeicher,
/// dieselbe Navigationsgrenze und die Ablehnung sämtlicher neuer Fenster.
/// Portal-Seitenwechsel bleiben möglich; nachgeladene Ressourcen werden nicht
/// gefiltert. Anfangsadresse und Navigation erlauben nur Portal-HTTPS auf Port
/// 443 ohne Benutzerinfo.
fn hintergrund_fenster_erzeugen(
    app: &tauri::AppHandle,
    label_praefix: &str,
    url: &str,
) -> Result<tauri::WebviewWindow, String> {
    let label = format!(
        "{label_praefix}-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| format!("Zeitstempel konnte nicht erzeugt werden: {e}"))?
            .as_nanos()
    );
    let ziel: Url = url
        .parse()
        .map_err(|e| format!("Ungültige URL „{url}“: {e}"))?;

    if !ist_landesrecht_navigation_erlaubt(&ziel) {
        return Err(format!(
            "URL „{url}“ zeigt nicht auf https://{ERLAUBTER_LANDESRECHT_HOST}/ – Landesrecht-Import-Fenster wird nicht geöffnet."
        ));
    }

    WebviewWindowBuilder::new(app, label.as_str(), WebviewUrl::External(ziel))
        .title("Landesrecht-Import (Hintergrund)")
        .inner_size(1000.0, 800.0)
        .visible(false)
        .incognito(true)
        .on_navigation(ist_landesrecht_navigation_erlaubt)
        .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
        .build()
        .map_err(|e| format!("WebView-Fenster konnte nicht erzeugt werden: {e}"))
}

/// Lädt die aktuelle Gesamtausgabe eines Gesetzes (Baden-Württemberg)
/// über ein echtes WebView-Fenster und liefert das gerenderte HTML zurück.
/// `kuerzel` wird unverändert (case-sensitiv) in die URL eingesetzt.
#[tauri::command]
pub async fn lade_gesetz_html_bw(app: tauri::AppHandle, kuerzel: String) -> Result<String, String> {
    // Schrittdiagnose gibt es nur für den Entwicklerlauf im Entwicklungsbau.
    #[cfg(debug_assertions)]
    let diagnose = crate::commands::praefixlauf::beobachte_bw(&kuerzel);
    let melde = |_schritt: &str| {
        #[cfg(debug_assertions)]
        if let Some(d) = &diagnose {
            d.schritt(_schritt);
        }
    };
    melde("Hintergrundfenster anlegen");
    let start_url = format!("https://www.landesrecht-bw.de/perma?j={kuerzel}_BW");
    let fenster = hintergrund_fenster_erzeugen(&app, "landesimport", &start_url)?;

    mit_fensterbereinigung(
        async {
            // Sucht den Tab-Link über seinen sichtbaren Text, nicht über eine feste
            // CSS-Klasse – robuster gegenüber kleineren Markup-Änderungen als ein
            // Klassenname wie "docview__tabentry". Reiner DOM-Klick, kein invoke()
            // nötig, daher von der CSP der Fremd-Seite nicht betroffen.
            let vorhanden_skript = r#"
(function () {
  var spans = Array.from(document.querySelectorAll('span'));
  var ziel = spans.find(function (s) {
    return s.textContent.trim() === 'Aktuelle Gesamtausgabe';
  });
  return ziel ? 'true' : 'false';
})();
"#;
            melde("Warte auf Aktuelle Gesamtausgabe");
            warte_bis_vorhanden(&fenster, vorhanden_skript, MAX_WARTEZEIT_LINK).await?;

            let klick_skript = r#"
(function () {
  var spans = Array.from(document.querySelectorAll('span'));
  var ziel = spans.find(function (s) {
    return s.textContent.trim() === 'Aktuelle Gesamtausgabe';
  });
  if (ziel) {
    var link = ziel.closest('a');
    if (link) { link.click(); return 'geklickt: ' + link.outerHTML.slice(0, 200); }
    return 'kein <a> um den span gefunden';
  }
  return 'span verschwunden';
})();
"#;
            melde("Gesamtausgabe öffnen");
            let _klick_ergebnis = javascript_auswerten(&fenster, klick_skript).await?;

            melde("Warte auf stabilen Seiteninhalt");
            warte_bis_inhalt_stabil(&fenster, MAX_WARTEZEIT_INHALT).await?;

            // Zusätzliche, inhaltliche Wartestufe: der Klick löst eine echte
            // Navigation aus (nicht nur einen SPA-Tab-Wechsel), daher kann die grobe
            // Textlängen-Stabilität oben ein Zwischenstadium (Grundgerüst geladen,
            // Dokumentinhalt noch nicht) fälschlich als "fertig" durchgehen lassen –
            // siehe Kommentar an warte_bis_doclayout_vorhanden.
            melde("Warte auf Gesetzesinhalt");
            warte_bis_doclayout_vorhanden(&fenster, MAX_WARTEZEIT_INHALT).await;

            // Auslesen des gerenderten DOM per nativer JS-Auswertung statt Formular-
            // Submit – siehe Kommentar am Dateianfang.
            melde("Gesetzesinhalt auslesen");
            javascript_auswerten(&fenster, "document.documentElement.outerHTML").await
        },
        || async {
            melde("Hintergrundfenster schließen");
            let ergebnis = hintergrund_fenster_schliessen(&fenster).await;
            match &ergebnis {
                Ok(()) => melde("Hintergrundfenster geschlossen; Abruf wird zurückgegeben"),
                Err(_) => melde("Fensterabschluss fehlgeschlagen; Abruffehler wird zurückgegeben"),
            }
            ergebnis
        },
    )
    .await
}

/// Lädt eine "Systematische Übersicht"-Seite des Landesrechts BW (z. B. die
/// Abschnitts-Übersicht "5 Verteidigung") über ein echtes WebView-Fenster und
/// liefert das gerenderte HTML zurück. Anders als bei
/// `lade_gesetz_html_bw` ist hier kein Klick auf einen Tab-Link nötig –
/// der gesuchte Inhalt (Tabelle mit Gesetzes-Links) steht bereits direkt nach
/// dem Laden im DOM.
/// `dok_id` wird unverändert (case-sensitiv) in die URL eingesetzt, z. B.
/// "jlr-BWFFNAbsch5".
#[tauri::command]
pub async fn lade_landesrecht_uebersichtsseite(
    app: tauri::AppHandle,
    dok_id: String,
) -> Result<String, String> {
    let start_url = format!("https://www.landesrecht-bw.de/perma?d={dok_id}");
    let fenster = hintergrund_fenster_erzeugen(&app, "landesrecht-uebersicht", &start_url)?;

    mit_fensterbereinigung(
        async {
            // Die reine Textlängen-Stabilität (warte_bis_inhalt_stabil) hat sich bei
            // diesen tabellenlastigen Übersichtsseiten als zu schwach erwiesen: bei
            // sehr langen Tabellen kann die Textlänge zwischenzeitlich für mehrere
            // Polling-Zyklen gleich bleiben, obwohl die Seite noch nicht fertig
            // gerendert ist. Ein zunächst versuchter Footer-Check (".footerBs") war
            // ebenfalls untauglich: der Footer existiert BEREITS auf der
            // Zwischen-/Startseite (Bürgerservice-Suche), auf der das WebView bei
            // besonders langen Zielseiten (z. B. Absch2) noch hängt, während die
            // eigentliche Weiterleitung zum Dokument noch läuft – das Signal feuerte
            // dort also fälschlich zu früh.
            // Stattdessen wird auf das Vorhandensein mindestens eines
            // "a[data-juris-link]"-Elements gewartet – das existiert ausschließlich
            // auf der tatsächlichen Dokumentseite, nie auf der Zwischenseite.
            // MAX_WARTEZEIT_UEBERSICHT ist bewusst großzügiger als
            // MAX_WARTEZEIT_LINK (dort: Tab-Klick bei bereits geladenem
            // Einzelgesetz), da diese Übersichtsseiten teils deutlich länger zum
            // vollständigen Laden brauchen.
            const DATA_JURIS_LINK_VORHANDEN_SKRIPT: &str =
                "document.querySelectorAll('a[data-juris-link]').length > 0 ? 'true' : 'false';";
            warte_bis_vorhanden(
                &fenster,
                DATA_JURIS_LINK_VORHANDEN_SKRIPT,
                MAX_WARTEZEIT_UEBERSICHT,
            )
            .await?;

            warte_bis_inhalt_stabil(&fenster, MAX_WARTEZEIT_INHALT).await?;

            javascript_auswerten(&fenster, "document.documentElement.outerHTML").await
        },
        || hintergrund_fenster_schliessen(&fenster),
    )
    .await
}

/// Lädt eine einzelne Gesetzesdokumentseite des Landesrechts BW über ein
/// echtes WebView-Fenster und liefert das gerenderte HTML zurück. Dient dem
/// Nachladen des "guten" Permalinks (perma?j=..., siehe TS-seitiges
/// leseGuterPermalink in indexErstellungBW.ts) für einzelne Gesetze, für die
/// nur der "schlechte" Permalink (perma?d=...) bekannt ist – auf den
/// Systematik-Übersichtsseiten ist der gute Permalink seit einer
/// Format-Umstellung von juris.de nicht mehr enthalten (siehe Bugreport),
/// wohl aber auf der Dokumentseite selbst, in einem Span mit id-Präfix
/// "permaElgf_". Anders als bei lade_gesetz_html_bw ist hier laut Test
/// KEIN Klick auf einen Tab-Link nötig – der Permalink-Block steht bereits
/// direkt nach dem Laden im DOM.
/// `url` wird unverändert übernommen (i. d. R. der bereits bekannte
/// "schlechte" perma?d=...-Link).
#[tauri::command]
pub async fn lade_landesrecht_dokumentseite(
    app: tauri::AppHandle,
    url: String,
) -> Result<String, String> {
    let fenster = hintergrund_fenster_erzeugen(&app, "landesrecht-dokument", &url)?;

    mit_fensterbereinigung(
        async {
            const PERMALINK_VORHANDEN_SKRIPT: &str =
                "document.querySelector('span[id^=\"permaElgf_\"]') ? 'true' : 'false';";
            warte_bis_vorhanden(&fenster, PERMALINK_VORHANDEN_SKRIPT, MAX_WARTEZEIT_LINK).await?;

            warte_bis_inhalt_stabil(&fenster, MAX_WARTEZEIT_INHALT).await?;

            javascript_auswerten(&fenster, "document.documentElement.outerHTML").await
        },
        || hintergrund_fenster_schliessen(&fenster),
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn portal_navigation_bleibt_moeglich() {
        for url in [
            "https://www.landesrecht-bw.de/perma?j=BauO_BW",
            "https://www.landesrecht-bw.de/bsbw/document/jlr-BauOBW2010V7P1",
            "https://www.landesrecht-bw.de:443/bsbw/search#inhalt",
        ] {
            assert!(
                ist_landesrecht_navigation_erlaubt(&url.parse().unwrap()),
                "{url}"
            );
        }
    }

    #[test]
    fn fremde_navigation_und_hosttaeuschung_werden_abgelehnt() {
        for url in [
            "https://example.org/",
            "https://sub.www.landesrecht-bw.de/",
            "https://landesrecht-bw.de/",
            "http://www.landesrecht-bw.de/",
            "ftp://www.landesrecht-bw.de/",
            "javascript:alert(1)",
            "file:///tmp/portal.html",
            "about:blank",
            "https://www.landesrecht-bw.de:444/",
            "https://www.landesrecht-bw.de:80/",
            "https://name@www.landesrecht-bw.de/",
            "https://name:passwort@www.landesrecht-bw.de/",
            "https://www.landesrecht-bw.de@example.org/",
            "https://www.landesrecht-bw.de.example.org/",
            "https://www.landesrecht-bw.de./",
        ] {
            assert!(
                !ist_landesrecht_navigation_erlaubt(&url.parse().unwrap()),
                "{url}"
            );
        }
    }

    #[tokio::test]
    async fn erfolg_fehler_und_timeout_schliessen_genau_einmal() {
        for arbeit in [Ok("HTML"), Err("Arbeitsfehler"), Err("Zeitüberschreitung")] {
            let aufrufe = Cell::new(0);
            let ergebnis =
                mit_fensterbereinigung(async { arbeit.map_err(str::to_string) }, || async {
                    aufrufe.set(aufrufe.get() + 1);
                    Ok(())
                })
                .await;
            assert_eq!(aufrufe.get(), 1);
            assert_eq!(ergebnis, arbeit.map_err(str::to_string));
        }
    }

    #[tokio::test]
    async fn bereinigungsfehler_verhindert_erfolg_und_erhaelt_arbeitsfehler() {
        let erfolg = mit_fensterbereinigung(async { Ok("HTML") }, || async {
            Err("Schließfehler".into())
        })
        .await;
        assert!(erfolg.unwrap_err().contains("Schließfehler"));
        let fehler = mit_fensterbereinigung(
            async { Err::<(), _>("Ursprünglicher Arbeitsfehler".into()) },
            || async { Err("Schließfehler".into()) },
        )
        .await
        .unwrap_err();
        assert!(fehler.starts_with("Ursprünglicher Arbeitsfehler"));
        assert!(fehler.contains("Schließfehler"));
    }
    #[tokio::test]
    async fn fensterabschluss_erhaelt_bestaetigung_vor_dem_warten() {
        let signal = tokio::sync::Notify::new();
        signal.notify_one();
        assert!(
            warte_auf_fensterabschluss(signal.notified(), Duration::from_millis(50), "Test")
                .await
                .is_ok()
        );
    }

    #[tokio::test]
    async fn html_rueckgabe_wartet_auf_native_abschlussbestaetigung() {
        let signal = tokio::sync::Notify::new();
        let ergebnis = mit_fensterbereinigung(async { Ok("HTML") }, || {
            warte_auf_fensterabschluss(signal.notified(), Duration::from_secs(1), "Test")
        });
        tokio::pin!(ergebnis);
        assert!(
            tokio::time::timeout(Duration::from_millis(1), &mut ergebnis)
                .await
                .is_err()
        );
        signal.notify_one();
        assert_eq!(ergebnis.await.unwrap(), "HTML");
    }

    #[tokio::test]
    async fn fehlende_native_abschlussbestaetigung_liefert_fehler_statt_html() {
        let fehler = mit_fensterbereinigung(async { Ok("HTML") }, || {
            warte_auf_fensterabschluss(std::future::pending(), Duration::from_millis(1), "Test")
        })
        .await
        .unwrap_err();
        assert!(fehler.contains("native Abschlussbestätigung fehlt"));
    }
}
