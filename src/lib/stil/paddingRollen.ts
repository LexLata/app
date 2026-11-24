// paddingRollen.ts
//
// Skalierungs-Helfer für Container-/Element-Padding, analog zu
// iconGroesseSkaliert() in textRollen.ts – in einer eigenen Datei, weil
// Padding eine eigene Achse ist (Hintergrund/Rahmen-Kontext), die
// textRollen.ts laut dessen eigenem Grundsatz nicht mit aufweichen soll.
//
// pxSkaliert() ist die Basis-Grundoperation: unskalierter Rohwert × Faktor,
// einmal gerundet. Alle benannten Rollen darunter sind dünne Wrapper darum.
//
// ZWEI GRUPPEN (siehe Absprache – bewusste Vereinfachung eines zuvor
// zufällig gewachsenen Systems mit zu vielen, zu fein unterschiedenen
// Rollen):
//
// CONTAINER-PADDING: der Innenabstand einer Box, deren Rand mit dem Rand
// des übergeordneten Fensters/Overlays zusammenfällt (bzw. die eine
// randlose Trennlinie tragen soll, z. B. borderBottom einer Kopfzeile).
//
// ELEMENT-PADDING: der Innenabstand eines einzelnen Bedienelements selbst
// (Zeile, Badge, Eingabefeld, Dropdown) – unabhängig davon, was drumherum
// liegt. KEIN Verschachtelungs-Versprechen ("liegt immer in einem
// Container"): Zeilen z. B. liegen oft direkt in einem ungepolsterten
// Scroll-Container, Badges oft innerhalb einer Zeile.
//
// Innerhalb beider Gruppen gilt: wo ein Rohwert zufällig mit einer anderen
// Rolle übereinstimmt, wird er von dort wiederverwendet (eine einzige
// Quelle), statt dupliziert zu werden – wo Werte nur ÄHNLICH, aber
// bewusst unterschiedlich sind (z. B. Overlay- vs. Fenster-Außenrand),
// bleiben es bewusst getrennte Rohwerte.
//
// WICHTIG: alle Rollen erwarten den UNSKALIERTEN Rohwert intern – faktor
// kommt direkt aus useUiSkalierungsFaktor() der aufrufenden Komponente,
// keine Verkettung mit einem bereits skalierten/gerundeten Zwischenwert.
export function pxSkaliert(px: number, faktor: number): number {
  return Math.round(px * faktor);
}

// ===========================================================================
// CONTAINER-PADDING
// ===========================================================================

// ---------------------------------------------------------------------------
// Overlay-Außenrand: allseitig gleicher Innenabstand des Hauptbereichs eines
// Overlays (unter der Kopfzeile). Verwendungsstellen: FavoritenHinzufuegen-
// Overlay, ExportOverlay, EinstellungenFenster.
// Mehrere weitere Stellen (GesetzInfoOverlay, ImportindexOverlay, DateiImport-
// Overlay, LinuxTitelleistenAbfrage, Gesetzesuebersicht) übernehmen nur den
// Rohwert für die Seite, die inhaltlich übereinstimmt (lokaler Override,
// siehe jeweilige Verwendungsstelle) – nur die tatsächlich abweichenden
// Zahlen bleiben dort eigene Literale.
// ---------------------------------------------------------------------------
export const OVERLAY_AUSSEN_ROH = 20;

export function overlayAussenPadding(faktor: number): number {
  return pxSkaliert(OVERLAY_AUSSEN_ROH, faktor);
}

// ---------------------------------------------------------------------------
// Overlay-Kopfzeile: Titel-/Such-Zeile am oberen Rand eines Overlays, mit
// randloser Trennlinie darunter (borderBottom auf derselben Box). Horizontal
// bewusst identisch mit overlayAussenPadding (Kopf und Inhalt liegen bündig
// übereinander) – nur der vertikale Wert ist eigen (kompaktere einzeilige
// Kopfzeile). Verwendungsstellen: FavoritenHinzufuegenOverlay, ExportOverlay,
// GesetzInfoOverlay, ImportindexOverlay, AktualisierenOverlay,
// OeffnenOverlay, VolltextSucheOverlay, EinfuehrungsOverlay, VerlaufOverlay.
// ---------------------------------------------------------------------------
export const OVERLAY_KOPF_VERTIKAL_ROH = 14;

export function overlayKopfPadding(faktor: number): string {
  return `${pxSkaliert(OVERLAY_KOPF_VERTIKAL_ROH, faktor)}px ${pxSkaliert(OVERLAY_AUSSEN_ROH, faktor)}px`;
}

// ---------------------------------------------------------------------------
// Fenster-Außenrand: allseitig gleicher Innenabstand eines eigenständigen
// Hilfsfensters (kleiner als ein Overlay über dem Content). Verwendungs-
// stellen: KommentarFormular, VerweismarkierungFormular,
// Konfliktseitenleiste. Bewusst von overlayAussenPadding
// getrennt (unterschiedliche Fenstertyp-Klasse, kein Zufallswert).
// ---------------------------------------------------------------------------
export const FENSTER_AUSSEN_ROH = 16;

export function fensterAussenPadding(faktor: number): number {
  return pxSkaliert(FENSTER_AUSSEN_ROH, faktor);
}

// ===========================================================================
// ELEMENT-PADDING
// ===========================================================================

// ---------------------------------------------------------------------------
// Eingabefeld: Text-/Textarea-Eingaben in Hilfsfensterformularen und -Overlays.
// Verwendungsstellen: KommentarFormular, VerweismarkierungFormular,
// FavoritenHinzufuegenOverlay, Gesetzesuebersicht.
// ---------------------------------------------------------------------------
const EINGABEFELD_VERTIKAL_ROH = 6;
const EINGABEFELD_HORIZONTAL_ROH = 8;

export function eingabefeldPadding(faktor: number): string {
  return `${pxSkaliert(EINGABEFELD_VERTIKAL_ROH, faktor)}px ${pxSkaliert(EINGABEFELD_HORIZONTAL_ROH, faktor)}px`;
}

// ---------------------------------------------------------------------------
// Dropdown: Padding der <select>-Steuerelemente, u. a. in den Einstellungen-
// Abschnitten.
// ---------------------------------------------------------------------------
const DROPDOWN_VERTIKAL_ROH = 4;
const DROPDOWN_HORIZONTAL_ROH = 8;

export function dropdownPadding(faktor: number): string {
  return `${pxSkaliert(DROPDOWN_VERTIKAL_ROH, faktor)}px ${pxSkaliert(DROPDOWN_HORIZONTAL_ROH, faktor)}px`;
}

// ---------------------------------------------------------------------------
// Zeile: klickbare/scrollbare Zeile in einer Ergebnis- oder Verwaltungsliste
// (Such-/Verlaufs-Trefferzeile, Gesetzesübersicht, Aktualisieren-Kandidaten,
// jeweilige Fußzeilen). Horizontal wiederverwendet von overlayAussenPadding.
// Bewusst EIN einheitlicher Wert für vormals mehrere, nur zufällig leicht
// abweichende Varianten (9–10px vertikal, 14–20px horizontal) – siehe
// Absprache "volle Übernahme statt Fein-Justierung".
// ---------------------------------------------------------------------------
const ZEILE_VERTIKAL_ROH = 10;

export function zeilePadding(faktor: number): string {
  return `${pxSkaliert(ZEILE_VERTIKAL_ROH, faktor)}px ${pxSkaliert(OVERLAY_AUSSEN_ROH, faktor)}px`;
}

// ---------------------------------------------------------------------------
// Badge: kleine Kurzbefehl-/Tastenkürzel-Chips (Kbd-Komponenten). Verwendungs-
// stellen: Gesetzesuebersicht (Kbd), OeffnenTrefferZeile (Kbd,
// QuelleKasten), Willkommensansicht (Kbd), Gesetzesuebersicht.kurzbefehlChip.
// ---------------------------------------------------------------------------
const BADGE_VERTIKAL_ROH = 2;
const BADGE_HORIZONTAL_ROH = 5;

export function badgePadding(faktor: number): string {
  return `${pxSkaliert(BADGE_VERTIKAL_ROH, faktor)}px ${pxSkaliert(BADGE_HORIZONTAL_ROH, faktor)}px`;
}

// ---------------------------------------------------------------------------
// Hinweisbox: schwebende Status-/Ladehinweis-Box innerhalb eines Overlays
// (z. B. "Wird importiert …", "Wird geladen …"). Verwendungsstellen:
// OeffnenOverlay, MarkierungskonfliktFenster. Aktuell derselbe Rohwert
// wie fensterAussenPadding – das ist bewusst NICHT dieselbe Rolle (eine ist
// Container-, die andere Element-Padding), nur zufällig derselbe Zahlenwert;
// beide dürfen sich künftig unabhängig voneinander ändern.
// ---------------------------------------------------------------------------
const HINWEISBOX_ROH = 16;

export function hinweisboxPadding(faktor: number): number {
  return pxSkaliert(HINWEISBOX_ROH, faktor);
}

// ---------------------------------------------------------------------------
// Leerer Zustand: zentrierter "Kein Ergebnis"-Block mit Icon in Such-
// Overlays. Verwendungsstellen: VolltextSucheOverlay, OeffnenOverlay.
// ---------------------------------------------------------------------------
const LEERER_ZUSTAND_VERTIKAL_ROH = 28;

export function leererZustandPadding(faktor: number): string {
  return `${pxSkaliert(LEERER_ZUSTAND_VERTIKAL_ROH, faktor)}px 0`;
}
