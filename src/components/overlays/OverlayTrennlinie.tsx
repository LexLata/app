// OverlayTrennlinie.tsx
//
// Randlose 1px-Trennlinie, wie sie in Overlays zwischen Kopfzeile/Inhalt,
// zwischen Ergebniszeilen und vor/nach Status-Hinweisboxen auftritt. Vorher
// an vielen Stellen einzeln als `<div style={{height:1, background:
// 'var(--rahmen)'}} />` dupliziert – dabei hatte sich an einer Stelle
// (OeffnenOverlay, Trennlinie zwischen Trefferzeilen) ein `marginLeft`
// eingeschlichen, das die Linie nur noch auf Höhe des Texts statt randständig
// beginnen ließ (Bugreport). Als eigene Komponente ohne Margin-Prop ist diese
// Abweichung künftig nicht mehr "aus Versehen" möglich – eine gewünschte
// Einrückung müsste explizit über `style` übergeben werden und wäre damit im
// Diff sichtbar.
//
// `style` erlaubt an der Verwendungsstelle NUR echte Layout-Ergänzungen
// (z. B. marginTop, siehe GesetzInfoOverlay.tsx) – height/background bleiben
// hier fest verankert.

import type { CSSProperties } from 'react';

interface OverlayTrennlinieProps {
  style?: CSSProperties;
}

export function OverlayTrennlinie({ style }: OverlayTrennlinieProps) {
  return (
    <div
      style={{
        // 1px-Haarlinie, bewusst nicht skaliert (siehe Lesezeichenleiste.tsx/
        // Favoritenleiste.tsx für dieselbe Entscheidung bei den
        // dort noch separat duplizierten Trennlinien).
        // eslint-disable-next-line lexlata/keine-unskalierten-px -- Feste 1-CSS-Pixel-Haarlinie trennt Flächen; UI-Skalierung würde die Trennlinie unterschiedlich dick zeichnen.
        height: 1,
        background: 'var(--rahmen)',
        ...style,
      }}
    />
  );
}
