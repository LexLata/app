// kontextMenu.tsx
//
// Natives Rechtsklick-Menü für Markierungen (Unterstreichung, Hervorhebung,
// Verweismarkierung, Kommentar) über die Tauri v2 Menu-API (@tauri-apps/api/menu)
// – rendert als echtes, plattform-natives Popup-Menü (macOS/Windows/Linux
// jeweils im System-Look), NICHT als eigenes HTML. Menu.popup() poppt ohne
// explizite Position automatisch an der aktuellen Mauszeigerposition auf,
// ein x/y-Handling ist daher nicht nötig.
//
// Generisch über eine Item-Liste (statt eines fest verdrahteten Eintrags):
// erster Anwendungsfall war "Verweis bearbeiten" allein, zweiter
// Anwendungsfall "Markierung löschen" (für ALLE Markierungstypen) – die
// konkrete Zusammenstellung der Einträge (z.B. nur "Löschen" bei
// Unterstreichung/Hervorhebung/Kommentar, "Bearbeiten" + "Löschen" bei
// Verweismarkierung) entscheidet der Aufrufer (siehe Gesetzestextansicht.tsx:
// markierungValue.onMarkierungRechtsklick).
//
// Benötigte Permissions: menu:allow-new, menu:allow-append, menu:allow-popup
// (siehe src-tauri/capabilities/default.json).

import { nativeMenuEintrag } from '@/lib/plattform/tauriHelpers';
import type { Resource } from '@tauri-apps/api/core';

// Native Ressourcen, kein Anwendungszustand: popup() kehrt auf manchen
// Plattformen zurück, bevor die Auswahl erfolgt. Deshalb erst beim nächsten
// Aufruf freigeben; beim Schließen des Fensters räumt Tauri selbst auf.
let letztesMenue: Resource[] = [];

async function schliesseRessourcen(ressourcen: Resource[]): Promise<void> {
  const ergebnisse = await Promise.allSettled(ressourcen.map((ressource) => ressource.close()));
  for (const ergebnis of ergebnisse) {
    if (ergebnis.status === 'rejected') {
      console.error('Kontextmenü-Ressource konnte nicht freigegeben werden:', ergebnis.reason);
    }
  }
}

export interface KontextMenuEintrag {
  text: string;
  action: () => void;
}

export async function zeigeMarkierungKontextMenu(items: KontextMenuEintrag[]): Promise<void> {
  if (items.length === 0) return;
  const { Menu } = await import('@tauri-apps/api/menu');
  const ressourcen: Resource[] = [];
  try {
    const eintraege = [];
    for (const item of items) {
      // Inline-Objekte in Menu.new verlieren in Tauri 2.12 ihren Aktionskanal,
      // sobald der native Builder seine temporären Eintrags-Wrapper freigibt.
      const eintrag = await nativeMenuEintrag({ ...item });
      eintraege.push(eintrag);
      ressourcen.push(eintrag);
    }
    // eslint-disable-next-line lexlata/textanzeige-verbindlich -- Keine Textanzeige: zeigeKontextMenu übergibt nur Ressourcen aus nativeMenuEintrag; kontextMenu.test.ts prüft Aufbau und Lebensdauer.
    const menu = await Menu.new({ items: eintraege });
    ressourcen.push(menu);
    const vorherige = letztesMenue;
    letztesMenue = ressourcen;
    await schliesseRessourcen(vorherige);
    // Ein schneller weiterer Rechtsklick kann diesen Aufruf bereits überholt haben.
    if (letztesMenue === ressourcen) await menu.popup();
  } catch (fehler) {
    if (letztesMenue === ressourcen) letztesMenue = [];
    await schliesseRessourcen(ressourcen);
    throw fehler;
  }
}
