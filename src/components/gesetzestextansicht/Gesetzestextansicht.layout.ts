// Gesetzestextansicht.layout.ts
// Gemeinsame Layoutwerte für Textbaum und interne Scrollmessung.
// Breite der Textspalte (siehe JSX in Gesetzestextansicht: maxWidth) –
// wird von schaetzeHoehe für die Zeilenumbruch-Schätzung verwendet.
import { LESBARE_ZEILENLAENGE_BREITE_WERTE } from '@/lib/stil/gesetzTextDarstellung';
export const TEXT_SPALTE_BREITE = LESBARE_ZEILENLAENGE_BREITE_WERTE.normal;

// Höhe/Breite des Chevron-Icons selbst (quadratisch) – siehe KlappChevron
// in baum/klappChevron.tsx. Anpassen: einfach diesen Wert ändern.
export const CHEVRON_ICON_GROESSE = 8;

// Abstand zwischen dem rechten Rand des Chevron-Icons und dem Textanfang.
// Anpassen: einfach diesen Wert ändern – unabhängig von CHEVRON_ICON_GROESSE.
export const CHEVRON_ABSTAND_ZUM_TEXT = 4;

// Breite der Hover-Chevron-Spalte vor Überschriften-/Normzeilen (siehe
// KlappChevron in baum/klappChevron.tsx): kompletter linker Einzug
// des Titel-/Normtextes (Titel UND darunterliegender Normtext werden um
// diesen Wert eingerückt, nicht nur die erste Zeile). Bewusst aus Icon-
// Größe + Abstand abgeleitet statt als eigener, separat zu pflegender Wert
// – so bleibt der reservierte Platz automatisch exakt so breit wie Icon +
// Abstand tatsächlich brauchen, ohne dass beide Werte manuell synchron
// gehalten werden müssen. Im Minimalistischen Modus entfällt die Spalte
// komplett, die Zeiger-Spalte bleibt erhalten.
const CHEVRON_SPALTE_BREITE = CHEVRON_ICON_GROESSE + CHEVRON_ABSTAND_ZUM_TEXT;

// Sichtbare Breite des Aktiv-Zeigers (siehe AktivZeiger in
// baum/aktivZeiger.tsx): schmales Rechteck links vom Titel.
//
// Skaliert linear mit der Gesetzestext-Schriftgröße (useTextDarstellung.ts),
// damit der Zeiger bei sehr kleiner Schrift nicht unverhältnismäßig dick und
// bei sehr großer Schrift nicht zu dünn wirkt. Referenzpunkt ist der
// Schriftgrößen-Default (15px → 4px). Nach unten gedeckelt (MIN=2), damit
// der Zeiger bei sehr kleiner Schrift nicht unsichtbar dünn wird; nach oben
// bewusst UNGEDECKELT, der Zeiger darf bei sehr großer Schrift proportional
// mitwachsen.
const ZEIGER_BREITE_REFERENZ_SCHRIFTGROESSE = 15;
const ZEIGER_BREITE_REFERENZ = 4;
const ZEIGER_BREITE_MIN = 2;

export function ermittleZeigerBreite(schriftgroesse: number): number {
  const roh = ZEIGER_BREITE_REFERENZ * (schriftgroesse / ZEIGER_BREITE_REFERENZ_SCHRIFTGROESSE);
  return Math.max(ZEIGER_BREITE_MIN, Math.round(roh));
}

// Abstand zwischen dem Zeiger und der (rechts davon liegenden) Chevron-Spalte.
const ZEIGER_ABSTAND_ZUM_CHEVRON = 5;

// Reservierte Gesamtbreite der Zeiger-Spalte, analog zu CHEVRON_SPALTE_BREITE
// aus Icon-Breite + Abstand abgeleitet, damit beide Werte nicht separat
// synchron gehalten werden müssen. Nimmt jetzt (wie ermittleZeigerBreite)
// die aktuelle Schriftgröße entgegen, damit die reservierte Spaltenbreite im
// Layout exakt zur tatsächlich gerenderten Zeiger-Breite passt – sonst würde
// der Zeiger bei sehr großer Schrift in den Chevron hineinragen.
function ermittleZeigerSpalteBreite(schriftgroesse: number): number {
  return ermittleZeigerBreite(schriftgroesse) + ZEIGER_ABSTAND_ZUM_CHEVRON;
}

// Zeiger bleibt in beiden Modi sichtbar; nur die Chevron-Spalte entfällt minimalistisch.
export function berechneTitelEinzug(
  minimalistischerModus: boolean,
  schriftgroesse: number,
): number {
  return (
    ermittleZeigerSpalteBreite(schriftgroesse) + (minimalistischerModus ? 0 : CHEVRON_SPALTE_BREITE)
  );
}

// Näherung für die Höhe des reinen Schriftbilds (Versalhöhe bis Unterlänge,
// z. B. inkl. des unteren Teils vom "g") relativ zur Schriftgröße – wie sie
// z. B. der Browser für einen Hintergrund auf einem *unstyled* Inline-Element
// (siehe die Markierungs-Hervorhebung, `background` auf einem <span> in
// textBlatt.tsx) automatisch anwendet, OHNE dass dafür die
// tatsächlichen Font-Metriken des Systemfonts ausgelesen werden müssten.
// Empirisch justiert (wie CHEVRON_VERTIKALE_FEINJUSTIERUNG_EM oben) – bei
// Bedarf hier anpassen, nicht pro Aufrufer.
export const ZEIGER_FONT_METRIK_FAKTOR = 1;

// Das reine line-height-Leading verteilt sich zwar rechnerisch symmetrisch
// oben/unten, der optische Leerraum über der Versalhöhe ist bei den meisten
// Fonts aber größer als der unter der Unterlänge (Fonts reservieren oben
// zusätzlichen Platz z. B. für Akzente). Deshalb zusätzlicher, NUR oben
// angewandter Korrekturwert in em (bezogen auf die jeweilige Schriftgröße,
// dadurch für alle Schriftgrößen einheitlich) – empirisch justiert, analog
// zu ZEIGER_FONT_METRIK_FAKTOR.
export const ZEIGER_OBEN_ZUSATZ_EM = 0.06;

// Berechnet Position/Höhe des AktivZeigers (siehe AktivZeiger in
// aktivZeiger.tsx) aus der per ResizeObserver
// gemessenen VOLLEN Zeilenhöhe (useZeigerHoehe.ts). Reduziert das per
// line-height entstehende Leading (siehe ZEIGER_FONT_METRIK_FAKTOR) sowie
// zusätzlich oben den Korrekturwert ZEIGER_OBEN_ZUSATZ_EM, damit der Zeiger
// unabhängig von Schriftgröße und Zeilenumbruch immer gleichmäßig auf die
// Schriftbild-Höhe schrumpft, statt die volle (großzügigere) Zeilenhöhe
// abzudecken. Bei mehrzeiligem Umbruch bleibt der Zeiger EIN durchgehendes
// Rechteck: das Leading zwischen den Zeilen wird bewusst mit "aufgefressen",
// nur an Anfang und Ende wird reduziert.
export function berechneZeigerMasse(
  gemesseneZeilenHoehe: number | null,
  topPad: number,
  paddingBottom: number,
  fontSize: number,
  lineHeight: number,
): { top: number; hoehe: number } {
  const halbesLeading = (fontSize * (lineHeight - ZEIGER_FONT_METRIK_FAKTOR)) / 2;
  const obenZusatz = fontSize * ZEIGER_OBEN_ZUSATZ_EM;
  const top = topPad + halbesLeading + obenZusatz;
  const inhaltsHoehe =
    gemesseneZeilenHoehe != null ? gemesseneZeilenHoehe - topPad - paddingBottom : 0;
  const hoehe = inhaltsHoehe - 2 * halbesLeading - obenZusatz;
  return { top, hoehe };
}

// Kleine vertikale Korrektur zusätzlich zu "vertical-align: middle" (siehe
// KlappChevron in baum/klappChevron.tsx) – in EM, nicht Pixel! Grund:
// "vertical-align: middle" zentriert laut CSS-Spezifikation an
// "Baseline + halbe x-Höhe des Elternelements", nicht an der optischen Mitte
// der Versalhöhe (Großbuchstaben/Ziffern) – die x-Höhe ist typischerweise
// kleiner als die Versalhöhe, die Differenz zwischen beiden ist aber
// proportional zur Schriftgröße. Ein fester PIXEL-Wert kann das daher nie
// für alle Schriftgrößen gleichzeitig ausgleichen (bei kleiner Schrift zu
// groß, bei großer Schrift zu klein – das war der Bug: Normzeile und
// Überschriften unterschiedlicher Ebenen brauchten unterschiedliche
// Fixwerte). In EM angegeben, skaliert die Korrektur automatisch mit der
// tatsächlichen (per CSS vererbten) Schriftgröße der jeweiligen Zeile –
// keine JS-Berechnung nötig. Negativ = Chevron wandert nach oben.
// Anpassen: einfach diesen Wert ändern.
export const CHEVRON_VERTIKALE_FEINJUSTIERUNG_EM = -0.06;

// Faktor für die vertikale Chevron-Zentrierung (fontSize * dieser Faktor =
// angenommene Zeilenhöhe, siehe KlappChevron in baum/klappChevron.tsx,
// Prop zeilenHoehePx). Bewusst EIN gemeinsamer, empirisch aus den Normzeilen
// bestätigter Wert für Überschriften UND Normzeilen – unabhängig vom
// Horizontaler Seitenrand links/rechts der Textspalte (siehe randInline in
// VirtualisierteListe/Gesetzestextansicht/StrukturKontextLeiste). Etwas kleiner
// als früher (60), um den zusätzlichen Einzug durch die Chevron-Spalte
// optisch auszugleichen. Anpassen: einfach diesen Wert ändern – wirkt nur
// auf Desktop (Mobile übergibt randInline explizit, siehe MobileApp.tsx/
// GesetzTextScreen.tsx).
export const STANDARD_RAND_INLINE = 52;

// Abstand Container-Oberkante → Anfang der virtuellen Liste (= paddingBlock: 40).
// item.start liegt in virtuellen Koordinaten ohne dieses Padding – muss bei
// allen scrollTop-Berechnungen addiert werden.
export const SCROLL_MARGIN = 40;

// topPad je Gliederungsebene, unabhängig vom Einklappzustand.
// Ebenen über 3 (bzw. jede unbekannte Ebene) fallen auf
// den Wert für "sonstige/tiefere Ebenen" zurück (18).
//
// Rohwerte (bei schriftFaktor=1, d.h. schrift===SCHRIFTGROESSE_DEFAULT) –
// werden über schriftFaktor mit der Schriftgröße skaliert, siehe
// ermittleUeberschriftTopPad()/ermittleUeberschriftPaddingBottom() unten.
const TOP_PAD_AUFGEKLAPPT_ROH: Record<number, number> = { 1: 44, 2: 32, 3: 24 };
const TOP_PAD_UNTERGEORDNET_ROH = 16;
const TOP_PAD_SONSTIGE_AUFGEKLAPPT_ROH = 18;

// paddingBottom derselben Überschriftszeile (siehe ueberschriftZeile.tsx)
// – bewusst hier neben den TOP_PAD-Konstanten
// definiert, damit beide Seiten der Zeile über denselben schriftFaktor
// skalieren und nicht auseinanderlaufen können. Wird außerdem von
// schaetzeHoehe() in virtualizer.ts für die Höhenschätzung
// verwendet (dort vorher als unbenanntes "+ 10" dupliziert).
const UEBERSCHRIFT_PADDING_BOTTOM_ROH = 10;

/** schriftFaktor = schrift / SCHRIFTGROESSE_DEFAULT – von den Aufrufern
 *  (ueberschriftZeile.tsx, virtualizer.ts)
 *  berechnet und übergeben. */
export function ermittleUeberschriftTopPad(params: {
  ebene: number;
  istUntergeordnet: boolean;
  schriftFaktor: number;
}): number {
  const { ebene, istUntergeordnet, schriftFaktor } = params;
  // Untergeordnete Überschriften nutzen immer denselben Rohwert wie Normzeilen.
  if (istUntergeordnet) return Math.round(TOP_PAD_UNTERGEORDNET_ROH * schriftFaktor);
  const roh = TOP_PAD_AUFGEKLAPPT_ROH[ebene] ?? TOP_PAD_SONSTIGE_AUFGEKLAPPT_ROH;
  return Math.round(roh * schriftFaktor);
}

/** Siehe Kommentar bei UEBERSCHRIFT_PADDING_BOTTOM_ROH oben. */
export function ermittleUeberschriftPaddingBottom(schriftFaktor: number): number {
  return Math.round(UEBERSCHRIFT_PADDING_BOTTOM_ROH * schriftFaktor);
}

/** Trenner zwischen Bezeichnung und Titel einer Überschrift: Leerzeichen nach `.`, `:` oder `)`. */
export function ueberschriftTrenner(bezeichnung: string): string {
  return /[.:)]$/.test(bezeichnung.trim()) ? ' ' : ': ';
}

/** Feste Wortlücke (marginRight) zwischen Normbezeichnung und Titel, siehe normBlock.tsx. */
export const NORM_BEZEICHNUNG_ABSTAND = 6;
