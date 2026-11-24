// aktivZeiger.tsx
// Aktiv-Zeiger vor Überschriften-/Normzeilen zeigt an,
// welches Element gerade aktiv ist – ein schmales, abgerundetes vertikales
// Rechteck links vom Chevron, in einer eigenen reservierten Spalte (siehe
// berechneTitelEinzug in virtualizer.ts).
//
// Positionierung: absolut innerhalb der (position: relative gesetzten)
// Titel-Zeile, links bündig an deren Rand (left: 0 bezieht sich auf die
// Padding-Kante, also exakt den Anfang der reservierten Zeiger-Spalte).
// "top" und "hoehe" werden vom Aufrufer übergeben (siehe UeberschriftZeile/
// NormBlock): top = tatsächliches paddingTop dieser Zeile, hoehe = per
// ResizeObserver gemessene volle Zeilenhöhe abzüglich padding (siehe
// useZeigerHoehe.ts) – volle line-height, bewusst ohne Versalhöhen-Korrektur
// (einfacher, siehe Absprache).
//
// Farbe: wird vom Aufrufer übergeben (dieselbe --aktiv-element[-blass]-
// Logik wie für die Textfarbe der Überschrift/der Normzeile selbst, siehe
// UeberschriftZeile/NormBlock) – bewusst NICHT fest, sonst entsteht ein
// Kontrastbruch, wenn ein zugeklapptes (blasses) Element aktiv ist: ein
// kräftig blauer Zeiger neben blassblauem Text wirkt uneinheitlich. Der
// Zeiger markiert "aktiv" allein durch seine Anwesenheit (er existiert
// ohnehin für maximal ein Element im gesamten Dokument), nicht zusätzlich
// durch einen eigenen, vom Klappzustand unabhängigen Farbton.
//
// "schriftgroesse": aktuelle Gesetzestext-Schriftgröße (useTextDarstellung.ts),
// bestimmt über ermittleZeigerBreite() die Dicke des Zeigers – siehe dortiger
// Kommentar. Muss dieselbe Schriftgröße sein, die auch berechneTitelEinzug()
// (virtualizer.ts) für die reservierte Spaltenbreite erhält,
// sonst ragt der Zeiger in den Chevron hinein bzw. es entsteht Leerraum.
//
// Ausgelagert aus markierungsAnzeige.tsx: der Aktiv-Zeiger
// ist keine Markierungs-Anzeige, sondern der Kern-Baustein für den
// Aktiv-Zustand einer Zeile (siehe UeberschriftZeile/NormBlock) und gehört
// daher, anders als Verweis-/Kommentar-Superscripts, nicht in den
// markierung/-Ordner.

import { ermittleZeigerBreite } from '@/components/gesetzestextansicht/Gesetzestextansicht.layout';

export function AktivZeiger({
  top,
  hoehe,
  farbe,
  schriftgroesse,
}: {
  top: number;
  hoehe: number;
  farbe: string;
  schriftgroesse: number;
}) {
  if (hoehe <= 0) return null;
  const breite = ermittleZeigerBreite(schriftgroesse);
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: 0,
        top,
        width: breite,
        height: hoehe,
        borderRadius: breite / 2,
        background: farbe,
        pointerEvents: 'none',
      }}
    />
  );
}
