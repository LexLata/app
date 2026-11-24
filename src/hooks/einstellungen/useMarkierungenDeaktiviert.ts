// useMarkierungenDeaktiviert.ts
//
// Verwaltet die Einstellung "Markierungen deaktivieren" (Einstellungen.tsx)
// inkl. localStorage-Persistenz über useLocalStorageState.ts. Bei
// deaktiviert: Unterstreichungen, Hervorhebungen, Verweise und
// Kommentare werden weder angezeigt (siehe Gesetzestextansicht.tsx →
// useMarkierungenAnzeige.ts: liefert dann eine leere Map, OHNE die
// gespeicherten Einträge zu löschen) noch können neue hinzugefügt werden
// (siehe useMarkierungen.ts: markieren/handleVerweismarkierungAnfrage/
// handleKommentarAnfrage).
//
// Der Ref-Spiegel (markierungenDeaktiviertRef) wird von useMarkierungen.ts
// gebraucht, da dessen Handler (⌘U etc.) über den etablierten
// Ref-Spiegel-Zugriff auf aktuelle Werte zugreifen (siehe tabsRef/
// aktiverTabIdRef, gleiches Prinzip gegen stale closures bei einmalig
// registrierten Listenern).

import { MARKIERUNGEN_DEAKTIVIERT_KEY as DEAKTIVIERT_KEY } from '@/lib/einstellungen/einstellungen.index';
import { useLocalStorageState } from '@/hooks/einstellungen/useLocalStorageState';

export function useMarkierungenDeaktiviert() {
  const [markierungenDeaktiviert, setMarkierungenDeaktiviert, markierungenDeaktiviertRef] =
    useLocalStorageState<boolean>(DEAKTIVIERT_KEY, false, {
      parse: (roh) => roh === 'true',
    });

  return { markierungenDeaktiviert, markierungenDeaktiviertRef, setMarkierungenDeaktiviert };
}

/** Banner-Hinweis, wenn ein Markierungs-Feature (⌘U/⇧⌘U/⌘K/⇧⌘K bzw. die
 *  jeweiligen Menüpunkte) trotz deaktivierter Markierungen versucht wird –
 *  gemeinsam genutzt von useMarkierungen.ts (Unterstreichen/Hervorheben)
 *  und useVerweismarkierungUndKommentarHilfsfenster.ts (Verweismarkierung/Kommentar), damit
 *  Text und Konfiguration (Typ, Auto-Dismiss) an nur einer Stelle gepflegt
 *  werden. Jeder Aufrufer entscheidet selbst, WANN er ruft (siehe dortige
 *  Kommentare) – z.B. nicht bei jedem Tastendruck ohne erkennbaren
 *  Nutzer-Vorsatz, um nicht bei versehentlichen Tastenkombinationen zu
 *  nerven. */
export async function zeigeMarkierungenDeaktiviertBanner(): Promise<void> {
  const { zeigeBanner } = await import('@/lib/banner/banner.index');
  zeigeBanner({
    art: 'bedienhinweis',
    text: 'Markierungen sind deaktiviert. Aktiviere sie in den Einstellungen, um Text zu markieren.',
    typ: 'warnung',
  });
}
