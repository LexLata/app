// radiusRollen.ts
//
// Skalierte Eckenradien für Overlays/Fenster/Leisten, analog zu
// paddingRollen.ts/abstandRollen.ts – in einer eigenen Datei, weil
// Eckenradius eine eigene, kleine Achse ist (nur zwei wiederkehrende Werte
// im Bestand), nicht Teil von Padding/Abstand.
//
// Hintergrund: `borderRadius: 6` kam vor dieser Datei an 17 Stellen als
// unskaliertes Roh-Literal vor, `borderRadius: 4` an 6 weiteren – beides klar
// über der Schwelle "Abstraktion erst beim zweiten echten Anwendungsfall".
// Andere, abweichende borderRadius-Werte (z. B. 3, 8, 10 an
// einzelnen Stellen) bleiben bewusst lokale pxSkaliert()-Aufrufe – siehe
// jeweilige Verwendungsstelle.
//
// WICHTIG: wie bei paddingRollen.ts erwarten beide Rollen den UNSKALIERTEN
// Rohwert intern – faktor kommt direkt aus useUiSkalierungsFaktor() der
// aufrufenden Komponente.
import { pxSkaliert } from '@/lib/stil/paddingRollen';

// Meistgenutzter Eckenradius: Buttons (siehe buttonRollen.ts), Overlay-/
// Fenster-Kästen, Dropdown, Badges/Chips größerer Bauart.
const STANDARD_ROH = 6;

// Kleinerer Eckenradius: Mini-Badges/Chips, kompakte Zeilen-Highlights.
const KLEIN_ROH = 4;

// Reiner Erzeuger für die React-Anbindung in hooks/stil/useRadiusRollen.ts.
export function erzeugeRadiusRollen(faktor: number) {
  return {
    standard: pxSkaliert(STANDARD_ROH, faktor),
    klein: pxSkaliert(KLEIN_ROH, faktor),
  };
}

export type RadiusRollen = ReturnType<typeof erzeugeRadiusRollen>;
