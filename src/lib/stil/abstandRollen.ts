// abstandRollen.ts
//
// Skalierte Flex-Abstände (gap) für Overlays/Fenster/Leisten, analog zu
// paddingRollen.ts/radiusRollen.ts – in einer eigenen Datei, weil Flex-Gap
// eine eigene Achse ist (Kind-Abstand innerhalb eines Containers), nicht
// Container-/Element-Padding.
//
// Hintergrund: `gap: 8` kam vor dieser Datei an 30 Stellen als unskaliertes
// Roh-Literal vor, `gap: 6` an 10, außerdem `gap: 10/12/14/16` an
// zusammengenommen 18 weiteren Stellen ohne erkennbaren inhaltlichen
// Unterschied (organisch gewachsene Varianz, keine bewusste Abstufung –
// siehe Rückfrage im Chat). Bewusst nur DREI Rollen statt einer Rolle pro
// vorgefundenem Zahlenwert:
//   kompakt  (6): kompakte Hilfsfenster-/Formular-Layouts (Eingabefeld-Zeilen,
//                 Checkbox-Zeilen, Trefferzeilen)
//   standard (8): häufigster Fall, praktisch jedes Overlay-Layout
//   gross   (12): Top-Level-Container größerer Overlays – vereinheitlicht
//                 aus den vormals 10/12/14/16 (siehe Verwendungsstellen)
//
// WICHTIG: wie bei paddingRollen.ts erwarten alle Rollen den UNSKALIERTEN
// Rohwert intern – faktor kommt direkt aus useUiSkalierungsFaktor() der
// aufrufenden Komponente.
import { pxSkaliert } from '@/lib/stil/paddingRollen';

const KOMPAKT_ROH = 6;
const STANDARD_ROH = 8;
const GROSS_ROH = 12;

export function erzeugeAbstandRollen(faktor: number) {
  return {
    kompakt: pxSkaliert(KOMPAKT_ROH, faktor),
    standard: pxSkaliert(STANDARD_ROH, faktor),
    gross: pxSkaliert(GROSS_ROH, faktor),
  };
}

export type AbstandRollen = ReturnType<typeof erzeugeAbstandRollen>;
