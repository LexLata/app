// useFensterSichtbarMachen.ts
//
// Macht DIESES Tauri-Fenster nach dem ersten React-Render sichtbar. Setzt
// voraus, dass der jeweilige Rust-Builder das Fenster mit .visible(false)
// erzeugt (siehe einstellungen_fenster_oeffnen, hilfsfenster_oeffnen in
// fenster/hilfsfenster.rs sowie markierungskonflikte_fenster_oeffnen in
// fenster/menu_sync.rs) – sonst zeigt sich kurz der weiße
// background_color-Fallback aus dem Builder, bevor React den ersten Frame
// mit dem korrekten Farbschema/Layout gemalt hat ("weißes Aufblitzen").
//
// Vierter echter Anwendungsfall (Einstellungen-, Verweismarkierung-, Kommentar-,
// Markierungskonflikte-Fenster) rechtfertigt diesen eigenen Hook statt vier
// fast identischer Kopien desselben Effekts.
//
// Analog zu fensterAnzeigen()/decorationsAnwenden() in useFensterRestore.ts,
// dort aber zusätzlich mit Tabs-/Geometrie-Wiederherstellung – für diese
// schlanken Hilfsfenster reicht "einmal nach dem ersten Commit
// anzeigen" ohne weitere Vorbereitung.
//
// Kein abgebrochen-Guard nötig (anders als bei Listenern, siehe
// useVerweismarkierungUndKommentarHilfsfenster.ts): show() ist idempotent, ein
// doppelter Aufruf durch React StrictMode ist folgenlos.
//
// Nach show() zusätzlich fenster_menu_status_aktualisieren aufgerufen –
// exakt dasselbe Muster wie in useFensterRestore.ts::fensterAnzeigen()
// (siehe dortiger Kommentar): Tauris WindowEvent-Enum kennt kein "Shown",
// daher deckt der WindowEvent-Handler in lib.rs::run dieses erste
// Sichtbarwerden nicht ab. effektiv_keine_fenster_offen() (commands.rs)
// zählt ALLE webview_windows(), also auch dieses Fenster – ohne den
// Aufruf blieben z. B. "Fenster schließen" & Co. (macOS-Menüleiste) grau,
// wenn dieses Fenster als einziges sichtbares Fenster geöffnet wird (z. B.
// Einstellungen über ⌘, bei keinem offenen Hauptfenster).
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';

import { useEffect, useRef } from 'react';

export function useFensterSichtbarMachen(startgroesse?: { breite: number; hoehe: number }): void {
  // Nur die Größe beim Mount zählt; spätere Einstellungsänderungen verschieben kein offenes Fenster.
  const anfangsgroesse = useRef(startgroesse);
  useEffect(() => {
    void (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const fenster = getCurrentWindow();
        const groesse = anfangsgroesse.current;
        if (groesse) {
          try {
            const { currentMonitor, LogicalSize } = await import('@tauri-apps/api/window');
            const monitor = await currentMonitor();
            // Platz für Fensterrahmen und Systemleisten lassen, auch bei hoher UI-Größe.
            const flaeche = monitor?.workArea.size.toLogical(monitor.scaleFactor);
            const breite = Math.min(groesse.breite, flaeche ? flaeche.width - 24 : groesse.breite);
            const hoehe = Math.min(groesse.hoehe, flaeche ? flaeche.height - 48 : groesse.hoehe);
            await fenster.setSize(new LogicalSize(breite, hoehe));
            await fenster.center();
          } catch (fehler) {
            console.warn('Startgröße des Hilfsfensters konnte nicht gesetzt werden:', fehler);
          }
        }
        await fenster.show();
        await rufeBefehl('fenster_menu_status_aktualisieren');
      } catch {
        /* nicht in Tauri-Umgebung (z. B. Browser-Dev-Modus) */
      }
    })();
  }, []);
}
