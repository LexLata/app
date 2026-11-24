/**
 * Öffentliche Schnittstelle für strukturelle Textpositionen:
 * Auswahl, Vergleich und Rekonstruktion.
 */

export type {
  AuswahlErgebnis,
  AuswahlFehler,
  Textpfad,
  Textstelle,
} from '@/lib/domain/textpfad/textpfad';

/**
 * Auswahl aus dem gerenderten Gesetzestext; liefert eine Position mit Zeichenbereich
 * oder einen benannten Fehler. Der vollständige Vertrag steht an der Implementierung.
 */
export { ermittleAuswahl, liesTextpfadEintraege } from '@/lib/domain/textpfad/textpfad';

/**
 * Bewusste Integrationsoperation für die Gesetzestextdarstellung und deren Tests.
 * Erwartet ein von der Darstellung erzeugtes data-leaf-Element mit gültigen Attributen;
 * liest seinen Textpfad ohne XML-ID und Zeichenbereich. Keine DOM-Veränderung.
 * Ungültige vorhandene data-eintraege ergeben keinen Pfad. Die Attribute bleiben ein interner
 * Vertrag von Darstellung und Textpfad, kein Format für fremde DOM-Daten.
 */
export { blattPfad } from '@/lib/domain/textpfad/textpfad';

export type {
  MehrfachAuswahlErgebnis,
  MehrfachAuswahlFehler,
} from '@/lib/domain/textpfad/textpfad.vergleich';
export {
  ermittleMehrfachAuswahl,
  vergleicheTextpfad,
  pfadGleich,
  textpfadSchluessel,
} from '@/lib/domain/textpfad/textpfad.vergleich';

/**
 * Rekonstruiert den aktuellen Text zum gespeicherten Pfad und Zeichenbereich.
 * Die Eintragsart gehört zur Pfadidentität; nicht mehr auflösbare Pfade liefern undefined.
 */
export { textAnTextpfad, aktuellerTextAnPfad } from '@/lib/domain/textpfad/textpfad.rueckwaerts';
