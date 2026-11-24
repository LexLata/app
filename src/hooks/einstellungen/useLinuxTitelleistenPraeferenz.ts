// useLinuxTitelleistenPraeferenz.ts
//
// Verwaltet, ob unter Linux die native Fenstertitelleiste ('nativ') oder die
// App-eigene, plattformübergreifend einheitliche Titelleiste ('eigene')
// verwendet wird (siehe Tableiste.tsx, Tableiste.fensterButtons.tsx).
// `null` bedeutet: noch keine Entscheidung getroffen – in diesem Fall zeigt
// App.tsx beim Start unter echtem Linux einmalig LinuxTitelleistenAbfrage.tsx
// an. Kann danach jederzeit über Einstellungen.tsx geändert werden.
//
// Grund für 'nativ' als sicheren Fallback (nicht 'eigene'): decorations:false
// ist unter Linux (X11/Wayland, je nach Compositor) nicht durchgängig
// zuverlässig getestet – siehe fensterAnzeigen() in useFensterRestore.ts, wo
// der eigentliche setDecorations()-Aufruf stattfindet.
//
// linuxTitelleistenPraeferenzLesen() ist der Nicht-Hook-Zugriff auf denselben
// localStorage-Key, für Verwendung außerhalb von React-Komponenten (siehe
// useFensterRestore.ts::fensterAnzeigen für den Fenster-Start sowie
// linuxTitelleistenPraeferenzSofortAnwenden() unten für die
// sofortige Anwendung bei Laufzeit-Änderung). Single Source of Truth: alle drei
// greifen auf denselben PRAEFERENZ_KEY zu, keine doppelte Persistenz-Logik.

import { LINUX_TITELLEISTEN_KEY as PRAEFERENZ_KEY } from '@/lib/einstellungen/einstellungen.index';
import { useLocalStorageState } from '@/hooks/einstellungen/useLocalStorageState';
import { holePlattform } from '@/lib/plattform/tauriHelpers';

export type LinuxTitelleistenPraeferenz = 'nativ' | 'eigene' | null;

function parse(roh: string): LinuxTitelleistenPraeferenz {
  return roh === 'eigene' ? 'eigene' : roh === 'nativ' ? 'nativ' : null;
}

function serialisiere(wert: LinuxTitelleistenPraeferenz): string {
  return wert ?? '';
}

export function useLinuxTitelleistenPraeferenz() {
  const [linuxTitelleistenPraeferenz, setLinuxTitelleistenPraeferenz] =
    useLocalStorageState<LinuxTitelleistenPraeferenz>(PRAEFERENZ_KEY, null, {
      parse,
      serialisiere,
    });

  return { linuxTitelleistenPraeferenz, setLinuxTitelleistenPraeferenz };
}

/** Nicht-Hook-Zugriff für useFensterRestore.ts (kein React-Kontext dort). */
export function linuxTitelleistenPraeferenzLesen(): LinuxTitelleistenPraeferenz {
  try {
    const roh = localStorage.getItem(PRAEFERENZ_KEY);
    return roh === null ? null : parse(roh);
  } catch {
    return null;
  }
}

/**
 * Wendet eine geänderte Linux-Titelleisten-Präferenz SOFORT auf DIESES Fenster an,
 * statt erst beim nächsten Fenster-Start (siehe decorationsAnwenden() in useFensterRestore.ts,
 * das nur beim Start jedes Fensters läuft). Aufgerufen aus App.tsx, direkt NACHDEM
 * setLinuxTitelleistenPraeferenz() (schreibt synchron in localStorage) den neuen Wert
 * übernommen hat – linuxTitelleistenPraeferenzLesen() liest hier also bereits den
 * aktuellen Stand.
 *
 * Bewusst mit EIGENER Plattformprüfung (plattform !== 'linux' → No-op), nicht einfach
 * bedingungslos setDecorations() aufgerufen: die Einstellung ist über
 * plattformfremdeUiAnzeigen auch auf macOS/Windows zur Vorschau sichtbar (siehe
 * Einstellungen.tsx), dort aber laut UI-Text "wirkungslos". Ein ungeprüfter Aufruf
 * würde unter macOS versehentlich die native Ampel entfernen (TableisteFensterButtons
 * springt dort nie ein, siehe Tableiste.tsx – das Fenster wäre dann ohne jede
 * Schließen-Möglichkeit) bzw. unter Windows die dort fest vorgeschriebene custom
 * Titelleiste wieder in native Decorations umschalten können.
 *
 * Deckt nur DIESES Fenster ab: andere bereits offene Fenster (Mehrfenster-Betrieb)
 * lesen ihre Präferenz weiterhin nur beim eigenen Start (decorationsAnwenden()) – seit
 * der Umstellung von Einstellungen auf ein eigenes Fenster (EinstellungenFenster.tsx)
 * gilt das jetzt AUCH für das Hauptfenster, wenn die Präferenz aus dem
 * Einstellungen-Fenster heraus geändert wird (dort wird bewusst NUR
 * setLinuxTitelleistenPraeferenz aufgerufen, nicht diese Funktion – "dieses Fenster"
 * wäre dort ja das Einstellungen-Fenster selbst, nicht das Hauptfenster). Bewusst
 * hingenommenes Restlimit, siehe Hinweistext in ErweitertAbschnitt.tsx.
 */
export async function linuxTitelleistenPraeferenzSofortAnwenden() {
  try {
    const plattform = await holePlattform();
    if (plattform !== 'linux') return;
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().setDecorations(linuxTitelleistenPraeferenzLesen() !== 'eigene');
  } catch {
    /* nicht in Tauri-Umgebung, oder Plattform nicht ermittelbar */
  }
}
