// main.tsx
//
// Einstiegspunkt: Tauri lädt für jedes Fenster dieselbe index.html. Bekannte
// Hilfsfenster behalten auch bei einem Importfehler ihre vorgesehene Identität.
// Nur unbekannte Labels und die Browser-Vorschau nutzen die Desktop-/Mobile-Weiche.

import {
  initialisiereMarkierungen,
  bereiteMarkierungsStartPruefungVor,
} from '@/lib/markierungen/markierungen.index';
import { messeAsync } from '@/lib/utils/perfMessung';
import { richteMesskonsoleEin } from '@/lib/utils/speicherMessung';
import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  FensterStartFehler,
  ladeHilfsfensterWurzel,
} from '@/components/hilfsfenster/hilfsfenster.index';
import '@/index.css';
import { registriereSchriften } from '@/lib/stil/schriften';
import { initialisiereFensterFarbschema } from '@/hooks/einstellungen/farbschemaAnwendung';
import { SCHEMAVERSION_EREIGNIS } from '@/lib/persistenz/kern/kern.index';
import { stelleEinstellungenAusBackupWiederHer } from '@/lib/einstellungen/einstellungen.index';
import {
  zeigeEinstellungenBackupBannerEinmal,
  zeigeSchemaversionBannerEinmal,
} from '@/lib/banner/banner.index';

async function meldeSchemaversionListenerAn(): Promise<void> {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    if (getCurrentWindow().label !== 'main') return;
    const { listen } = await import('@tauri-apps/api/event');
    await listen(SCHEMAVERSION_EREIGNIS, zeigeSchemaversionBannerEinmal);
  } catch (fehler) {
    console.error('Schemaversion-Listener konnte nicht angemeldet werden:', fehler);
  }
}

async function starteFenster() {
  // Messmodus: speicherbericht(), bereithaltungsbudget(n), lexlataScrollMesslauf() und lexlataScrollAufzeichnung() in der Konsole des Web-Inspectors.
  richteMesskonsoleEin();
  registriereSchriften();
  // holePlattform() so früh wie möglich anstoßen und abwarten – nicht nur
  // für die MobileApp/App-Weiche weiter unten nötig, sondern damit
  // usePlattform() (siehe dort) in JEDEM Fenster, auch in Hilfsfenstern
  // wie Einstellungen, beim allerersten Render bereits den synchron
  // bekannten Wert nutzen kann (plattformFallsBekannt()) statt erst nach
  // einem Zwischenzustand nachzuladen. Vorher wurde das nur im
  // App/MobileApp-Zweig gemacht – im Einstellungen-Fenster (Label
  // "einstellungen", siehe Zweig unten) blieb dadurch sichtbares
  // Flackern (z. B. der Fenstertitelleisten-Abschnitt poppt erst nach
  // Sekundenbruchteilen auf, weil istLinux zunächst fälschlich false
  // startet), da dessen main.tsx-Zweig bisher return, bevor
  // istMobilePlattform() je aufgerufen wurde.
  const { holePlattform } = await import('@/lib/plattform/tauriHelpers');
  const plattform = await holePlattform();

  let label: string | undefined;
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    label = getCurrentWindow().label;
  } catch {
    // Keine Tauri-Umgebung: Browser-Vorschau verwendet die normale Weiche.
  }

  // Nur das native Desktop-Hauptfenster darf den leeren Bestand zurückspielen.
  if (label === 'main' && ['macos', 'windows', 'linux'].includes(plattform)) {
    if ((await stelleEinstellungenAusBackupWiederHer()) === 'wiederhergestellt') {
      zeigeEinstellungenBackupBannerEinmal();
    }
  }
  await initialisiereFensterFarbschema();

  const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
  function renderWurzel(Wurzel: React.ComponentType) {
    root.render(
      <React.StrictMode>
        <Wurzel />
      </React.StrictMode>,
    );
  }
  let laeuft = false;
  let abgeschlossen = false;
  let letzterFehler: unknown;
  async function ladeFenster(): Promise<boolean> {
    if (laeuft || abgeschlossen || label === undefined) return false;
    laeuft = true;
    try {
      const Wurzel = await ladeHilfsfensterWurzel(label);
      if (!Wurzel) return false;
      abgeschlossen = true;
      renderWurzel(Wurzel);
      return true;
    } catch (fehler) {
      console.error('Hilfsfenster konnte nicht geladen werden:', fehler);
      // Modul-Auswertungsfehler werden vom JavaScript-Modullader mit derselben
      // Fehlerinstanz zwischengespeichert. Nur dieses WebView neu laden; dabei
      // bleibt das native Fenster samt Label und bereitgelegtem Kontext erhalten.
      if (letzterFehler !== undefined && letzterFehler === fehler) {
        abgeschlossen = true;
        window.location.reload();
        return true;
      }
      letzterFehler = fehler;
      root.render(
        <React.StrictMode>
          <FensterStartFehler erneutVersuchen={ladeFenster} />
        </React.StrictMode>,
      );
      return true;
    } finally {
      laeuft = false;
    }
  }
  if (await ladeFenster()) return;

  // Mobile-Weiche: eigenständige Wurzelkomponente ohne Tab-/Fenster-Konzept
  // (siehe src/mobile/MobileApp.tsx). Hilfsfenster-Labels oben greifen auf
  // iOS/Android ohnehin nie (dort gibt es kein Mehrfenster-Feature), daher
  // ist die Reihenfolge unkritisch.
  const { istMobilePlattform } = await import('@/lib/plattform/tauriHelpers');
  if (await istMobilePlattform()) {
    const { default: MobileApp } = await import('@/mobile/MobileApp');
    renderWurzel(MobileApp);
    return;
  }

  const { default: App } = await import('@/App');
  renderWurzel(App);
}

async function starte() {
  // Entwicklerlauf nur im Entwicklungsbau; der Produktionsbau enthält weder
  // Startabfrage noch den nachgeladenen Code.
  if (import.meta.env.DEV) {
    const { holePraefixlaufAuftrag } = await import('@/lib/plattform/praefixlaufAuftrag');
    const auftrag = await holePraefixlaufAuftrag();
    if (auftrag) {
      const { startePraefixlauf } = await import('@/lib/import/import.index');
      await startePraefixlauf(auftrag);
      return;
    }
  }
  initialisiereMarkierungen();
  await messeAsync('Markierungs-Startvorbereitung', bereiteMarkierungsStartPruefungVor).catch(
    (fehler: unknown) => {
      console.error('Markierungs-Startvorbereitung fehlgeschlagen:', fehler);
    },
  );
  await Promise.all([starteFenster(), meldeSchemaversionListenerAn()]);
}
void starte().catch(console.error);
