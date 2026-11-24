// tauriHelpers.ts
//
// Kleine, zustandslose Hilfsfunktionen für die Tauri-Plattform-Integration,
// die an mehreren Stellen benötigt werden (App.tsx, useMenueEvents.ts).
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';
import type { MenueNormstatus } from '@/lib/plattform/menu/menu.index';

import { schuetzeLeerzeichen } from '@/lib/domain/basis/textNachbearbeitung';
import type {
  ConfirmDialogOptions,
  MessageDialogOptions,
  MessageDialogResult,
  OpenDialogOptions,
  OpenDialogReturn,
  SaveDialogOptions,
} from '@tauri-apps/plugin-dialog';
import type { MenuItemOptions, IconMenuItemOptions, SubmenuOptions } from '@tauri-apps/api/menu';

// Native Anzeigen erhalten ausschließlich an dieser Grenze geschützte Texte.
// Technische Optionen und Rückgaben bleiben Originaldaten; Fehler werden wie
// bei den APIs an den Aufrufer weitergereicht. Keine eigene Ressourcenverwaltung.
function dialogAnzeigeOptionen<T extends ConfirmDialogOptions | MessageDialogOptions>(
  optionen?: string | T,
): string | T | undefined {
  if (typeof optionen === 'string') return schuetzeLeerzeichen(optionen);
  if (!optionen) return optionen;
  const anzeige = { ...optionen };
  for (const key of ['title', 'okLabel', 'cancelLabel'] as const) {
    if (key in anzeige)
      Object.assign(anzeige, {
        [key]: schuetzeLeerzeichen((anzeige as ConfirmDialogOptions)[key]),
      });
  }
  if ('buttons' in anzeige && typeof anzeige.buttons === 'object' && anzeige.buttons) {
    anzeige.buttons = { ...anzeige.buttons };
    for (const key of ['ok', 'cancel', 'yes', 'no'] as const) {
      if (key in anzeige.buttons) anzeige.buttons[key] = schuetzeLeerzeichen(anzeige.buttons[key]);
    }
  }
  return anzeige;
}

export async function nativeBestaetigung(
  meldung: string,
  optionen?: string | ConfirmDialogOptions,
): Promise<boolean> {
  const { confirm } = await import('@tauri-apps/plugin-dialog');
  // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: nativeBestaetigung schützt Meldung und Dialogtitel/Labels mit schuetzeLeerzeichen und dialogAnzeigeOptionen; tauriHelpers.nativeAnzeige.test.ts prüft die native Übergabe und Originaldaten.
  return confirm(schuetzeLeerzeichen(meldung), dialogAnzeigeOptionen(optionen));
}

export async function nativeMeldung(
  meldung: string,
  optionen?: string | MessageDialogOptions,
): Promise<MessageDialogResult> {
  const { message } = await import('@tauri-apps/plugin-dialog');
  // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: nativeMeldung schützt Meldung und alle Dialoglabels mit dialogAnzeigeOptionen; tauriHelpers.nativeAnzeige.test.ts prüft die native Übergabe und Originaldaten.
  const ergebnis = await message(schuetzeLeerzeichen(meldung), dialogAnzeigeOptionen(optionen));
  // Tauri liefert bei eigenen Buttons deren sichtbares Label als Aktion zurück.
  // Aufrufer vergleichen weiterhin ihre ursprünglichen Labels.
  if (optionen && typeof optionen !== 'string') {
    const labels: unknown[] =
      typeof optionen.buttons === 'object' && optionen.buttons
        ? Object.values(optionen.buttons)
        : !optionen.buttons && optionen.okLabel
          ? [optionen.okLabel]
          : [];
    for (const label of labels) {
      if (typeof label === 'string' && schuetzeLeerzeichen(label) === ergebnis) return label;
    }
  }
  return ergebnis;
}

function dateiDialogAnzeigeOptionen<T extends OpenDialogOptions | SaveDialogOptions>(
  optionen?: T,
): T | undefined {
  if (!optionen) return optionen;
  return {
    ...optionen,
    ...('title' in optionen ? { title: schuetzeLeerzeichen(optionen.title) } : {}),
    ...('filters' in optionen
      ? {
          filters: optionen.filters?.map((filter) => ({
            ...filter,
            name: schuetzeLeerzeichen(filter.name),
          })),
        }
      : {}),
  };
}

export async function nativeDateiOeffnen<T extends OpenDialogOptions>(
  optionen?: T,
): Promise<OpenDialogReturn<T>> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: nativeDateiOeffnen schützt Titel und Filternamen mit dateiDialogAnzeigeOptionen; tauriHelpers.nativeAnzeige.test.ts prüft die native Übergabe und Originaldaten.
  return open(dateiDialogAnzeigeOptionen(optionen));
}

export async function nativeDateiSpeichern(optionen?: SaveDialogOptions): Promise<string | null> {
  const { save } = await import('@tauri-apps/plugin-dialog');
  // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: nativeDateiSpeichern schützt Titel und Filternamen mit dateiDialogAnzeigeOptionen; tauriHelpers.nativeAnzeige.test.ts prüft die native Übergabe und Originaldaten.
  return save(dateiDialogAnzeigeOptionen(optionen));
}

export async function nativeMenuEintrag(optionen: MenuItemOptions) {
  const { MenuItem } = await import('@tauri-apps/api/menu');
  // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: nativeMenuEintrag schützt den sichtbaren Menütext mit schuetzeLeerzeichen; tauriHelpers.nativeAnzeige.test.ts prüft die native Übergabe und Originaldaten.
  return MenuItem.new({ ...optionen, text: schuetzeLeerzeichen(optionen.text) });
}

export async function nativeIconMenuEintrag(optionen: IconMenuItemOptions) {
  const { IconMenuItem } = await import('@tauri-apps/api/menu');
  // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: nativeIconMenuEintrag schützt den sichtbaren Menütext mit schuetzeLeerzeichen; tauriHelpers.nativeAnzeige.test.ts prüft die native Übergabe und Originaldaten.
  return IconMenuItem.new({ ...optionen, text: schuetzeLeerzeichen(optionen.text) });
}

export async function nativeUntermenue(optionen: SubmenuOptions) {
  const { Submenu } = await import('@tauri-apps/api/menu');
  // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: nativeUntermenue schützt den sichtbaren Menütext mit schuetzeLeerzeichen; tauriHelpers.nativeAnzeige.test.ts prüft die native Übergabe und Originaldaten.
  return Submenu.new({ ...optionen, text: schuetzeLeerzeichen(optionen.text) });
}

export async function nativesMarkierungsfensterOeffnen(
  befehl: 'kommentar_fenster_oeffnen' | 'verweismarkierung_fenster_oeffnen',
  daten: { label: string; titel: string; hoehe: number },
): Promise<void> {
  // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: nativesMarkierungsfensterOeffnen schützt den Fenstertitel mit schuetzeLeerzeichen; tauriHelpers.nativeAnzeige.test.ts prüft die native Übergabe und Originaldaten.
  await rufeBefehl(befehl, { ...daten, titel: schuetzeLeerzeichen(daten.titel) });
}

export async function nativenFenstertitelSetzen(titel: string): Promise<void> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Bereits geschützt: nativenFenstertitelSetzen schützt den Fenstertitel mit schuetzeLeerzeichen; tauriHelpers.nativeAnzeige.test.ts prüft die native Übergabe und Originaldaten.
  await getCurrentWindow().setTitle(schuetzeLeerzeichen(titel));
}

/** Öffnet das Einstellungen-Fenster (siehe fenster/hilfsfenster.rs:
 *  einstellungen_fenster_oeffnen). Singleton auf Rust-Seite: existiert das
 *  Fenster schon, wird es nur fokussiert. Genutzt von useTastenkuerzel.ts
 *  (⌘,-Fallback) sowie – über den 'einstellungen-oeffnen'-Listener in
 *  useMenueEvents.ts – vom Windows/Linux-Hamburger-Menü (hamburgerMenu.ts
 *  emittiert dieses Event client-seitig, siehe menuStruktur.ts). Das
 *  native macOS-Menü (menu.rs) ruft das Rust-seitige Pendant dagegen
 *  inzwischen direkt auf, ohne diesen JS-Umweg. */
export async function einstellungenFensterOeffnen(): Promise<void> {
  try {
    await rufeBefehl('einstellungen_fenster_oeffnen');
  } catch (fehler) {
    console.error('Einstellungen-Fenster konnte nicht geöffnet werden:', fehler);
  }
}

// Fragt beim Start jedes Fensters einmalig ab, ob dieses Fenster als Reaktion
// auf ⇧⌘T ohne vorher offenes Fenster erzeugt wurde (siehe
// LetzterTabAnfrage/letzter_tab_anfrage_lesen in commands.rs bzw. den
// "letzter-tab"-Zweig in menu.rs). Liefert false außerhalb von Tauri sowie
// auf Plattformen ohne natives Menü (Windows/Linux setzen das Flag nie).
export async function letzterTabAnfrageLesen(): Promise<boolean> {
  try {
    return await rufeBefehl('letzter_tab_anfrage_lesen');
  } catch {
    return false;
  }
}

/** Graut den nativen Menüpunkt mit der übergebenen ID (siehe menu.rs für
 *  die vergebenen IDs) je nach `aktiv` ein oder aus – siehe
 *  MenuItemRegistry/menu_item_aktivieren in fenster/menu_sync.rs. Tauri ordnet
 *  den tatsächlichen Sender zu; lokale Werte gelten nur für das fokussierte
 *  Hauptfenster, der gemeinsame Stapel geschlossener Tabs bleibt unabhängig. Tut außerhalb von
 *  Tauri sowie auf Plattformen ohne native Menüleiste (Windows/Linux)
 *  bewusst nichts. */
export async function menuItemAktivieren(id: string, aktiv: boolean): Promise<void> {
  try {
    await rufeBefehl('menu_item_aktivieren', { id, aktiv });
  } catch {
    /* nicht in Tauri-Umgebung */
  }
}

/** Bildschirm-Rechteck eines offenen Fensters – siehe fenster_alle_positionen
 *  in fenster.rs. Physische Pixel, passend zu e.screenX/screenY. */
export interface FensterPosition {
  label: string;
  x: number;
  y: number;
  breite: number;
  hoehe: number;
}

// Snapshot aller sichtbaren Fenster (Label + Bildschirm-Rechteck), einmalig
// beim Start eines Tab-Herausziehens abgefragt (siehe Tableiste.tsx), damit
// beim Loslassen rein lokal geprüft werden kann, ob der Cursor über einem
// ANDEREN Fenster liegt – ohne Cross-Window-Kommunikation während des
// gesamten Drags. Liefert ein leeres Array außerhalb von Tauri.
export async function alleFensterPositionenLesen(): Promise<FensterPosition[]> {
  try {
    return await rufeBefehl('fenster_alle_positionen');
  } catch {
    return [];
  }
}

// Holt ein bestimmtes Fenster (per Label) in den Vordergrund – wird nach
// einem Cross-Window-Tab-Drop aufgerufen (siehe App.tsx:
// handleTabInFensterAufnehmen), damit das aufnehmende Fenster sichtbar wird.
export async function fensterVordergrundHolen(label: string): Promise<void> {
  try {
    await rufeBefehl('fenster_vordergrund_holen', { label });
  } catch {
    /* nicht in Tauri-Umgebung */
  }
}

// Ermittelt einmalig die Betriebssystem-Plattform und cached das Ergebnis
// (die Plattform ändert sich zur Laufzeit nie). Genutzt u. a. in
// Tableiste.tsx (macOS-spezifisches Tab-Layout) und gesetzeskurzbefehlSpeicher.ts
// (Übersetzung meta/ctrl ↔ primaer/sekundaer beim Lesen/Schreiben der
// Gesetzeskurzbefehlsdatei, siehe dort). Liefert 'unbekannt' außerhalb von Tauri
// (z. B. Browser-Dev-Modus) statt einen Fehler zu werfen.
type PlattformName = 'macos' | 'windows' | 'linux' | 'ios' | 'android' | 'unbekannt';

let _plattformCache: Promise<PlattformName> | null = null;
// Synchroner Spiegel desselben Werts, sobald _plattformCache aufgelöst hat –
// keine zweite Quelle, nur ein synchron lesbarer Schnappschuss davon (siehe
// plattformFallsBekannt()). Bleibt null, solange holePlattform() in diesem
// Fenster noch nie aufgerufen bzw. noch nicht aufgelöst wurde.
let _plattformAufgeloest: PlattformName | null = null;

export function holePlattform(): Promise<PlattformName> {
  if (!_plattformCache) {
    _plattformCache = import('@tauri-apps/plugin-os')
      .then((m) => {
        const p = m.platform();
        const ergebnis: PlattformName =
          p === 'macos' || p === 'windows' || p === 'linux' || p === 'ios' || p === 'android'
            ? p
            : 'unbekannt';
        _plattformAufgeloest = ergebnis;
        return ergebnis;
      })
      .catch((): PlattformName => {
        _plattformAufgeloest = 'unbekannt';
        return 'unbekannt';
      });
  }
  return _plattformCache;
}

/** Synchron bereits bekannter Plattformwert – gefüllt, sobald holePlattform()
 *  in diesem Fenster (von IRGENDEINER Stelle, meist main.tsx:
 *  ermittleWurzelKomponente) einmal aufgelöst hat, sonst null. Für Stellen
 *  wie usePlattform.ts, die den anfänglichen Render mit dem bereits
 *  bekannten Wert statt einem vorläufigen Default starten wollen, ohne
 *  selbst eine zweite Cache-Quelle zu pflegen. */
export function plattformFallsBekannt(): PlattformName | null {
  return _plattformAufgeloest;
}

/** Kurzform für main.tsx (Root-Komponenten-Weiche MobileApp vs. App) und
 *  jede andere Stelle, die nur "mobil ja/nein" braucht, statt der konkreten
 *  Plattform – vermeidet, dass dieser Vergleich an mehreren Stellen
 *  dupliziert wird. */
export async function istMobilePlattform(): Promise<boolean> {
  const p = await holePlattform();
  return p === 'ios' || p === 'android';
}

/** Meldet den flüchtigen Normstatus; Tauri bestimmt das absendende Fenster. */
export async function menuNormstatusMelden(status: MenueNormstatus): Promise<void> {
  try {
    await rufeBefehl('menu_normstatus_melden', { status });
  } catch {
    /* außerhalb Tauri */
  }
}
