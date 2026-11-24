// Tableiste.hoehe.ts
//
// Berechnet die Höhe einer Tableistenzeile faktor-bewusst – ersetzt die
// vorher feste LEISTEN_HOEHE=38-Konstante (Padding-Vereinheitlichung, siehe
// Absprache). Rechnet aus GENAU DENSELBEN Rohwerten, die TabBeschriftung.tsx
// für den Titel-/Untertitel-Textblock (TAB_TITEL_FONTSIZE_ROH/
// TAB_TITEL_LINEHOEHE/TAB_UNTERTITEL_LINEHOEHE, textRollen.hinweistext) und
// tableisteStil.ts für das vertikale Tab-Padding (TAB_PADDING_VERTIKAL_ROH)
// bereits verwenden – keine zweite Kopie dieser Zahlen hier, sonst könnten
// Text und reservierte Zeilenhöhe wieder auseinanderlaufen (genau der Bug,
// den diese Datei behebt).
//
// Reserviert immer für den WORST CASE (Titel + Untertitel gleichzeitig), da
// die Zeilenhöhe für alle Tabs einer Leiste gemeinsam gilt – manche Tabs
// haben keinen Untertitel, die Zeile darf dafür aber nicht pro Tab
// unterschiedlich hoch werden.
//
// Als Hook (nicht Modul-Konstante wie vorher) exportiert, weil die Höhe
// jetzt vom UI-Skalierungsfaktor abhängt. BannerHost.tsx braucht dieselbe
// Höhe für die Banner-Positionierung und liegt (wie Tableiste.tsx selbst)
// im selben UiGroesseProvider-Baum (siehe App.tsx) – kann den Hook also
// direkt aufrufen, ganz ohne Props-Weiterreichung.
import { textRollen as TEXT_ROLLEN_ROH } from '@/lib/stil/textRollen';
import { useUiSkalierungsFaktor } from '@/hooks/einstellungen/useUiGroesse';
import { pxSkaliert } from '@/lib/stil/paddingRollen';
import {
  TAB_TITEL_FONTSIZE_ROH,
  TAB_TITEL_LINEHOEHE,
  TAB_UNTERTITEL_LINEHOEHE,
} from '@/components/tableiste/TabBeschriftung';
import { TAB_PADDING_VERTIKAL_ROH } from '@/components/tableiste/tableisteStil';

/** Höhe der Trennlinie unter der Tableiste – reine Optik, unabhängig von
 *  der UI-Größe (kein Text-/Icon-Bezug), bleibt daher eine feste Zahl. */
export const LINIE_HOEHE = 1;

export interface TableisteHoehe {
  /** Höhe der eigentlichen Tab-Zeile (ohne Trennlinie) – für die Zeile
   *  selbst sowie den Drag-Klon in Tableiste.tsx. */
  zeile: number;
  /** zeile + Trennlinie – für Elemente, die sich unterhalb der GESAMTEN
   *  Tableiste positionieren (aktuell: BannerHost.tsx). */
  gesamt: number;
}

export function useTableisteHoehe(): TableisteHoehe {
  const faktor = useUiSkalierungsFaktor();
  const titelHoehe = Math.round(pxSkaliert(TAB_TITEL_FONTSIZE_ROH, faktor) * TAB_TITEL_LINEHOEHE);
  const untertitelHoehe = Math.round(
    pxSkaliert(TEXT_ROLLEN_ROH.hinweistext.fontSize as number, faktor) * TAB_UNTERTITEL_LINEHOEHE,
  );
  const padding = pxSkaliert(TAB_PADDING_VERTIKAL_ROH, faktor) * 2;
  const zeile = titelHoehe + untertitelHoehe + padding;
  return { zeile, gesamt: zeile + LINIE_HOEHE };
}
