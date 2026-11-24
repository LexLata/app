// klappChevron.tsx
// Hover-Chevron vor Überschriften-/Normzeilen (siehe UeberschriftZeile/
// NormBlock): zeigt per CSS-Hover (Klasse "gt-klapp-zeile", siehe index.css)
// an, dass die Zeile faltbar ist, und in welche Richtung. Bewusst reines
// CSS-Hover statt useState-Hover (wie in favoritenleiste.tsx): die Zeile
// steckt in einer virtualisierten Liste mit potenziell hunderten
// gemounteten Instanzen, ein State-Update pro Mausbewegung wäre unnötiger
// Overhead. Rotation per transform: 0° = zu (zeigt nach rechts), 90° = auf
// (zeigt nach unten).
//
// WICHTIG zur vertikalen Position: bewusst KEINE berechnete Fontgröße/
// Zeilenhöhe-Formel (das war der vorherige Ansatz und blieb bei
// Überschriften unterschiedlicher Ebenen ungenau, weil die tatsächliche
// Glyphen-Position innerhalb einer Zeile von echten Font-Metriken abhängt,
// die wir nicht exakt kennen). Stattdessen: das Chevron ist ein normales
// INLINE-Element direkt vor dem ersten Textzeichen der Zeile (kein
// position:absolute), das per negativem margin-left in die per paddingLeft
// reservierte Spalte hineingezogen wird. Die vertikale Ausrichtung
// übernimmt "vertical-align: middle" – der Browser kennt die echten
// Font-Metriken der umgebenden Zeile und zentriert relativ dazu, unabhängig
// von Schriftgröße/Zeilenhöhe. Dadurch entfällt jede Berechnung, und die
// Ausrichtung passt automatisch für jede Kombination aus fontSize/
// lineHeight, auch für künftige neue Überschriften-Ebenen.
//
// Erscheint dadurch automatisch nur in der ERSTEN Zeile (bei mehrzeiligem
// Titel), was auch gewünscht ist: die Folgezeilen sind über paddingLeft am
// Aufrufer bereits bündig eingerückt, brauchen aber kein eigenes Chevron.
//
// Anpassen:
// - Icon-Größe: CHEVRON_ICON_GROESSE (virtualizer.ts).
// - Abstand zum Text: CHEVRON_ABSTAND_ZUM_TEXT (virtualizer.ts).
// - Farbe: fest grau über "stroke: var(--text-sekundaer)" unten – bewusst
//   NICHT currentColor, damit das Chevron unabhängig von der (je nach
//   Aktiv-/Einklapp-Zustand wechselnden) Textfarbe der Zeile immer grau
//   bleibt.
// - Feinabstimmung der vertikalen Position: CHEVRON_VERTIKALE_FEINJUSTIERUNG_EM
//   (virtualizer.ts, in EM statt Pixel – siehe dort für den
//   Grund: die Differenz zwischen x-Höhe (was vertical-align:middle nutzt)
//   und Versalhöhe skaliert mit der Schriftgröße, ein fester Pixel-Wert
//   könnte das nicht für Normzeile UND alle Überschriften-Ebenen gleichzeitig
//   treffen).
//
// Ausgelagert aus markierungsAnzeige.tsx: das Ein-/Ausklappen
// ist Struktur (siehe struktur/-Ordner), keine Markierungs-Anzeige – anders
// als Verweis-/Kommentar-Superscripts, die weiterhin in
// markierung/markierungsAnzeige.tsx liegen.

import {
  CHEVRON_ABSTAND_ZUM_TEXT,
  CHEVRON_ICON_GROESSE,
  CHEVRON_VERTIKALE_FEINJUSTIERUNG_EM,
} from '@/components/gesetzestextansicht/Gesetzestextansicht.layout';

export function KlappChevron({ eingeklappt }: { eingeklappt: boolean }) {
  return (
    // WICHTIG: width MUSS der Icon-Breite entsprechen (nicht 0) und der
    // margin-left-Betrag muss durch marginRight wieder ausgeglichen werden
    // (Netto-Versatz = marginLeft + width + marginRight = 0) – sonst zieht
    // der negative margin-left nicht nur diese Box, sondern auch den
    // GESAMTEN nachfolgenden Text im Inline-Fluss nach links und hebt damit
    // das paddingLeft der Zeile (= die Einrückung) faktisch wieder auf.
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: CHEVRON_ICON_GROESSE,
        marginLeft: -(CHEVRON_ICON_GROESSE + CHEVRON_ABSTAND_ZUM_TEXT),
        marginRight: CHEVRON_ABSTAND_ZUM_TEXT,
      }}
    >
      <svg
        className="gt-chevron"
        width={CHEVRON_ICON_GROESSE}
        height={CHEVRON_ICON_GROESSE}
        viewBox="0 0 16 16"
        style={{
          verticalAlign: 'middle',
          position: 'relative',
          top: `${CHEVRON_VERTIKALE_FEINJUSTIERUNG_EM}em`,
          transform: eingeklappt ? 'rotate(0deg)' : 'rotate(90deg)',
          transition: 'transform 0.12s ease, opacity 0.12s ease',
        }}
      >
        <path
          d="M5 2 L11 8 L5 14"
          fill="none"
          stroke="var(--text-sekundaer)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
