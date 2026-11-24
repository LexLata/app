// buttonRollen.ts
//
// Zentrale Stil-Rollen für Aktions-Buttons (primär/sekundär), analog zu
// textRollen.ts, aber bewusst in einer eigenen Datei: textRollen.ts deckt
// ausschließlich Typografie/Icon-Größe ab, Buttons brauchen zusätzlich
// Hintergrund/Rahmen/Padding – eine andere Konzern-Achse, die textRollen.ts
// nicht aufweichen soll.
//
// Hintergrund: Vor dieser Datei war das Primär/Sekundär-Muster an >8
// Stellen im Code einzeln dupliziert (teils wortgleich, teils mit leicht
// abweichendem Padding zwischen 5–7px vertikal / 10–16px horizontal). Diese
// Datei vereinheitlicht das Aussehen an einer Stelle.
//
// Wie standardOderBetont() in textRollen.ts sind primaer()/sekundaer() als
// Funktionen (nicht als statische Objekte) modelliert, weil der
// deaktiviert-Zustand den Stil verändert (Hintergrund/Text/Cursor) – das
// entspricht bereits vorhandenen Mustern im Code (z. B. ImportindexOverlay.ts
// knopfStyle(), EinfuehrungsOverlay.tsx knopfStil()).
//
// Verwendung: `const buttonRollen = useButtonRollen();` am Anfang der
// Komponente, dann `style={buttonRollen.primaer(deaktiviert)}` bzw.
// `style={{ ...buttonRollen.sekundaer(deaktiviert), marginLeft: 8 }}` – wie
// bei textRollen dürfen an der Verwendungsstelle LAYOUT-Eigenschaften
// ergänzt/überschrieben werden (z. B. flex, marginLeft, borderRadius),
// nicht aber die Kernaussage der Rolle (Hintergrund-/Textfarbe im
// aktivierten vs. deaktivierten Zustand). Padding-Overrides NICHT als feste
// Pixelzahl schreiben (skaliert dann nicht mit der UI-Größe mit) – dafür
// paddingFaktor()/paddingFaktorKompakt() nutzen (siehe deren Kommentar
// unten) – AUSSER an benannten, bewusst visuell abweichenden Einzelfällen,
// die das im Code direkt kommentieren:
// - LinuxTitelleistenAbfrage.tsx: zwei große, gleichwertige Auswahl-Buttons
//   (keine Primär/Sekundär-Hierarchie, daher auch Hintergrund/Gewicht lokal
//   überschrieben)
// - EinfuehrungsOverlay.tsx: Sprechblasen-Button auf dunklerem
//   Eingabefeld-Hintergrund (daher `sekundaerKompakt` lokal mit
//   `background: var(--bg-eingabe)` überschrieben)
// Jede weitere Abweichung dieser Art bitte ebenso an der Verwendungsstelle
// kurz begründen, statt sie hier zentral nachzupflegen – sonst veraltet
// diese Liste unbemerkt.
//
// primaerKompakt()/sekundaerKompakt(): Abwandlung für kleinere Container
// (Hilfsfenster, Sprechblasen, Tabellenzeilen), bei denen die volle
// Dialog-Fußzeilen-Größe unproportioniert wirkt – analog zur Beziehung
// standardtext -> standardtextBetont in textRollen.ts (per Spread
// abgeleitet, nur das abweichende Merkmal wird überschrieben). Padding ist
// hier bewusst der einzige Unterschied zu primaer()/sekundaer(); Farblogik,
// Textrolle und Sperr-Verhalten bleiben identisch, damit ein Button mit
// gleichem Zustand (z. B. deaktiviert) in jeder Größe gleich aussieht.
import type { CSSProperties } from 'react';
import type { TextRolle } from '@/lib/stil/textRollen';
import type { RadiusRollen } from '@/lib/stil/radiusRollen';

// Rohe (unskalierte) Padding-Basiswerte – EINZIGE Quelle, aus der sowohl
// BASIS/BASIS_KOMPAKT selbst als auch die Faktor-Overrides (paddingFaktor/
// paddingFaktorKompakt, siehe unten) rechnen. Wichtig: NIEMALS von einem
// bereits mit uiFaktor multiplizierten/gerundeten Zwischenwert weiterrechnen
// (Doppelrundung) – jede Verwendungsstelle multipliziert direkt aus diesen
// zwei Rohwerten heraus, in einem einzigen Schritt.
const BASIS_ROH = { vertikal: 6, horizontal: 16 };
const BASIS_KOMPAKT_ROH = { vertikal: 5, horizontal: 14 };

function paddingString(roh: { vertikal: number; horizontal: number }, faktor: number): string {
  return `${Math.round(roh.vertikal * faktor)}px ${Math.round(roh.horizontal * faktor)}px`;
}

export function erzeugeButtonRollen(
  faktor: number,
  textRollen: Record<TextRolle, CSSProperties>,
  radiusRollen: RadiusRollen,
) {
  const BASIS: CSSProperties = {
    padding: paddingString(BASIS_ROH, faktor),
    borderRadius: radiusRollen.standard,
    whiteSpace: 'nowrap',
  };
  const BASIS_KOMPAKT: CSSProperties = {
    ...BASIS,
    padding: paddingString(BASIS_KOMPAKT_ROH, faktor),
  };

  /** Gefüllter Aktions-Button (Akzentfarbe) – für die primäre Aktion eines
   *  Dialogs (Speichern, Exportieren, Importieren, Fertig …). Im
   *  deaktivierten Zustand bewusst NICHT nur abgedunkelt (opacity), sondern
   *  mit eigener Hintergrund-/Textfarbe – dieselbe Kombination, die vorher
   *  schon an den meisten Fundstellen verwendet wurde (var(--rahmen) /
   *  var(--text-sekundaer)), jetzt aber überall inklusive Kommentar-/
   *  Verweismarkierung-Fenster, wo der deaktivierte Zustand vorher visuell gar
   *  nicht erkennbar war (Button blieb blau anklickbar aussehend). */
  function primaer(deaktiviert = false): CSSProperties {
    return {
      ...textRollen.standardtextBetont,
      ...BASIS,
      border: 'none',
      cursor: deaktiviert ? 'not-allowed' : 'pointer',
      background: deaktiviert ? 'var(--rahmen)' : 'var(--akzent-einheitlich)',
      color: deaktiviert ? 'var(--text-sekundaer)' : '#fff',
      transition: 'background 0.15s',
    };
  }

  /** Umrandeter, transparenter Button – für die sekundäre Aktion eines
   *  Dialogs (Abbrechen, Schließen). Hover-Hintergrund (var(--hover)) bleibt
   *  weiterhin lokal an der Verwendungsstelle per onMouseEnter/onMouseLeave
   *  gesetzt (imperative DOM-Manipulation, kein Style-Objekt-Fall). */
  function sekundaer(deaktiviert = false): CSSProperties {
    return {
      ...textRollen.standardtext,
      ...BASIS,
      border: '1px solid var(--rahmen)',
      background: 'transparent',
      cursor: deaktiviert ? 'not-allowed' : 'pointer',
      opacity: deaktiviert ? 0.4 : 1,
    };
  }

  /** Kompakte Variante von primaer() – gleiche Farb-/Sperr-Logik, kleineres
   *  Padding. Für Kommentar-/Verweismarkierung-Fenster, Einführungs-Sprechblase,
   *  Tabellenzeilen-Aktionen. */
  function primaerKompakt(deaktiviert = false): CSSProperties {
    return { ...primaer(deaktiviert), ...BASIS_KOMPAKT };
  }

  /** Kompakte Variante von sekundaer() – siehe primaerKompakt(). */
  function sekundaerKompakt(deaktiviert = false): CSSProperties {
    return { ...sekundaer(deaktiviert), ...BASIS_KOMPAKT };
  }

  /** Für die benannten Padding-Overrides (siehe Kommentar oben,
   *  "AUSSER an benannten..."): Verhältnis zum jeweiligen BASIS-Padding
   *  statt einer festen Zielgröße bei faktor=1 – bleibt dadurch dauerhaft
   *  proportional korrekt, auch falls sich BASIS_ROH später ändert.
   *  vertikalFaktor/horizontalFaktor als Bruch relativ zur Basis angeben,
   *  z.B. paddingFaktor(10/6, 12/16) für einen Override, der bei faktor=1
   *  exakt "10px 12px" ergibt (10/6 von 6px vertikal, 12/16 von 16px
   *  horizontal). EINE Multiplikation/Rundung, direkt aus BASIS_ROH –
   *  keine Verkettung mit dem bereits gerundeten BASIS-Padding oben. */
  function paddingFaktor(vertikalFaktor: number, horizontalFaktor: number): string {
    return (
      `${Math.round(BASIS_ROH.vertikal * vertikalFaktor * faktor)}px ` +
      `${Math.round(BASIS_ROH.horizontal * horizontalFaktor * faktor)}px`
    );
  }

  /** Wie paddingFaktor(), aber relativ zu BASIS_KOMPAKT_ROH. */
  function paddingFaktorKompakt(vertikalFaktor: number, horizontalFaktor: number): string {
    return (
      `${Math.round(BASIS_KOMPAKT_ROH.vertikal * vertikalFaktor * faktor)}px ` +
      `${Math.round(BASIS_KOMPAKT_ROH.horizontal * horizontalFaktor * faktor)}px`
    );
  }

  return {
    primaer,
    sekundaer,
    primaerKompakt,
    sekundaerKompakt,
    paddingFaktor,
    paddingFaktorKompakt,
  };
}

export type ButtonRollen = ReturnType<typeof erzeugeButtonRollen>;
