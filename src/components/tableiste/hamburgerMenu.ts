// hamburgerMenu.ts
//
// Baut aus menuStruktur.ts ein natives Popup-Menü (Tauri Menu API,
// @tauri-apps/api/menu) und öffnet es unter dem ☰-Button in Tableiste.tsx –
// analog zum bereits bestehenden Rechtsklick-Menü in
// kontextMenu.tsx (nativer Look auf allen drei Plattformen,
// automatisches Schließen bei Außenklick/Escape, Submenüs mit ">"-Chevron
// alles vom OS übernommen, kein eigenes HTML).
//
// Klick-Handling: löst für die meisten Einträge exakt dasselbe Tauri-Event
// gezielt an dieses Fenster aus, das auch menu.rs (native Mac-Menübar) auslöst –
// useMenueEvents.ts hört bereits darauf, die komplette bestehende
// Handler-Kette (inkl. Einführungs-
// Sperre) läuft daher unverändert mit. Für die wenigen IDs ohne Event
// (menu.rs ruft dort eine Rust-Funktion/einen Command direkt auf, siehe
// "befehl" in menuStruktur.ts) wird stattdessen rufeBefehl() genutzt.
//
// Tastenkürzel-Anzeige: nativer Tauri-`accelerator`-String (siehe menuStruktur.ts
// für die Risikoabwägung zur Kollision mit der echten macOS-Menübar – dort
// auch der Grund, warum das Risiko bewusst in Kauf genommen wird).
//
// Icons: dieselben PNGs wie die native Menübar (siehe menuIcons.ts). Anders
// als menu.rs (dort lebendes Menü, das per setze_menu_item_status
// nachträglich umgegraut werden muss) wird das Dropdown hier bei JEDEM
// ☰-Klick komplett neu gebaut – die passende Icon-Variante (hell/dunkel ×
// aktiv/inaktiv) wird deshalb einfach einmalig beim Bau anhand von
// istAktiv()/aktuellDunkel() gewählt, kein Live-Update nötig.
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';

import { geschlosseneTabsMenuStatusSynchronisieren } from '@/lib/persistenz/fenster/fenster.index';
import { HAMBURGER_MENU_STRUKTUR, type MenuKnoten } from '@/lib/plattform/menu/menu.index';
import { sendeAnFenster } from '@/lib/plattform/fensterkommunikation/fensterkommunikation.index';
import { istAktiv, menuText } from '@/lib/plattform/menu/menu.index';
import { menuIconPfad, aktuellDunkel } from '@/lib/plattform/menu/menu.index';

import {
  nativeMenuEintrag,
  nativeIconMenuEintrag,
  nativeUntermenue,
} from '@/lib/plattform/tauriHelpers';

async function baueKnoten(
  knoten: MenuKnoten,
  dunkel: boolean,
  PredefinedMenuItem: typeof import('@tauri-apps/api/menu').PredefinedMenuItem,
): Promise<
  | Awaited<ReturnType<typeof nativeMenuEintrag>>
  | Awaited<ReturnType<typeof nativeIconMenuEintrag>>
  | Awaited<ReturnType<typeof nativeUntermenue>>
  | Awaited<ReturnType<typeof PredefinedMenuItem.new>>
> {
  if (knoten.trennstrich) {
    return PredefinedMenuItem.new({ item: 'Separator' });
  }
  if (knoten.kinder) {
    const kinder = await Promise.all(
      knoten.kinder.map((kind) => baueKnoten(kind, dunkel, PredefinedMenuItem)),
    );
    const icon = await menuIconPfad(knoten.id, dunkel, true);
    return nativeUntermenue({
      id: knoten.id,
      text: knoten.label,
      items: kinder,
      ...(icon ? { icon } : {}),
    });
  }
  const aktiv = istAktiv(knoten.id);
  const icon = await menuIconPfad(knoten.id, dunkel, aktiv);
  const basis = {
    id: knoten.id,
    // Muda verwendet & als Zugriffstastenmarkierung; && zeigt ein wörtliches &.
    text: (menuText(knoten.id) ?? knoten.label).replaceAll('&', '&&'),
    accelerator: knoten.accelerator,
    enabled: aktiv,
    action: () => void ausloesen(knoten),
  };
  return icon ? nativeIconMenuEintrag({ ...basis, icon }) : nativeMenuEintrag(basis);
}

async function ausloesen(knoten: MenuKnoten): Promise<void> {
  if (knoten.trennstrich || knoten.kinder) return;
  try {
    if (knoten.befehl) {
      // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Keine Textanzeige: ausloesen übergibt ausschließlich den Aktionsbefehl des Menüknotens ohne Textdaten; hamburgerMenu.test.ts prüft Menüressourcen und Befehle.
      await rufeBefehl(knoten.befehl);
    } else if (knoten.ereignis) {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await sendeAnFenster(getCurrentWindow().label, knoten.ereignis, undefined);
    }
  } catch (fehler) {
    console.error(`Hamburger-Menü: Aktion für "${knoten.id}" fehlgeschlagen:`, fehler);
  }
}

/** Öffnet das Hamburger-Dropdown-Menü unter dem übergebenen Button-Element. */
export async function zeigeHamburgerMenu(buttonElement: HTMLElement): Promise<void> {
  const { Menu, PredefinedMenuItem } = await import('@tauri-apps/api/menu');
  const { LogicalPosition } = await import('@tauri-apps/api/dpi');
  geschlosseneTabsMenuStatusSynchronisieren();
  const dunkel = aktuellDunkel();

  const items = await Promise.all(
    HAMBURGER_MENU_STRUKTUR.map((knoten) => baueKnoten(knoten, dunkel, PredefinedMenuItem)),
  );
  // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Keine Textanzeige: zeigeHamburgerMenu übergibt Ressourcen aus baueKnoten und geschützten Menühelfern; hamburgerMenu.test.ts prüft den echten Menüaufbau.
  const menu = await Menu.new({ items });

  // Direkt unter dem Button, linksbündig zu ihm – rect ist bereits in
  // logischen (CSS-)Pixeln, passend zu LogicalPosition. popup() ohne
  // explizite Position würde stattdessen an der Mauszeigerposition öffnen,
  // was bei Tastatur-/Screenreader-Bedienung des Buttons falsch läge.
  const rect = buttonElement.getBoundingClientRect();
  await menu.popup(new LogicalPosition(rect.left, rect.bottom));
}
