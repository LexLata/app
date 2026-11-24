// Zentrale Typografie-Rollen für die App-UI (Overlays, Seitenleiste, Tableiste,
// Menü-Reste im Web-Layer etc.) – NICHT für den Gesetzestext selbst, der hat
// mit useTextDarstellung.ts (Schriftgröße, -art, Zeilenabstand als
// Nutzereinstellung) ein eigenes, unabhängiges System.
//
// Hintergrund: Vor dieser Datei war fontSize/color/fontWeight an >200
// Stellen im Code einzeln inline vergeben, ohne erkennbares System (u.a.
// ein häufig dupliziertes Overlay-Kopfzeilen-Muster aus Großbuchstaben +
// Buchstabenabstand + grauer Farbe). Diese Datei benennt die tatsächlich
// vorkommenden Funktionen als Rollen, damit UI-Text app-weit konsistent
// aussieht und an einer Stelle änderbar ist.
//
// Jede Rolle ist entweder ein vollständiges, eigenständiges Style-Objekt,
// oder – wenn sie sich selbst als "Rolle X, aber …" beschreiben lässt –
// eine Ableitung einer anderen Rolle per Spread (z.B. standardtextBetont =
// standardtext + fontWeight 600). Ableitung passiert NUR hier, an dieser
// einen zentralen Stelle, nicht an den Verwendungsstellen im restlichen
// Code – so bleibt die Beziehung zwischen den Rollen sichtbar und
// beabsichtigt, statt an 20 Stellen verstreut und unsichtbar dupliziert zu
// sein (Grundsatz: explizite, grep-bare Muster statt
// cleverer Indirektion). Rollen ohne "X, aber …"-Beziehung (hinweistext,
// mikrotext) bleiben eigenständig definiert, auch wenn sie zufällig
// ähnliche Werte wie eine andere Rolle haben.
//
// Verwendung: `style={textRollen.standardtext}` bzw. bei zusätzlichen,
// lokalen Eigenschaften (z.B. margin) `style={{ ...textRollen.standardtext,
// marginTop: 8 }}` – Rollen dürfen an der VERWENDUNGSSTELLE mit Layout-
// Eigenschaften ergänzt werden, nicht aber inhaltlich (Größe/Gewicht/Farbe)
// überschrieben werden; wer eine andere Kombination aus Größe/Gewicht/Farbe
// braucht, soll eine neue Rolle hier ergänzen statt lokal zu überschreiben.
import type { CSSProperties } from 'react';

// Kopfzeile eines Overlays (z.B. "Einstellungen", "Dateien importieren").
// Ersetzt das bisherige Großbuchstaben/Grau-Muster: hebt sich jetzt über
// Größe und Gewicht ab, nicht über Textumwandlung + Buchstabenabstand.
const overlayUeberschrift: CSSProperties = {
  fontSize: 17,
  fontWeight: 600,
  color: 'var(--text-primaer)',
  lineHeight: 1.2,
};

// Normaler Fließ-/Label-/Button-Text – die mit Abstand häufigste Rolle.
const standardtext: CSSProperties = {
  fontSize: 13,
  fontWeight: 400,
  color: 'var(--text-primaer)',
  lineHeight: 1.4,
};

// Kleiner, gut lesbarer Sekundärtext für Erklärungen und Meta-Infos.
const hinweistext: CSSProperties = {
  fontSize: 11,
  fontWeight: 400,
  color: 'var(--text-sekundaer)',
  lineHeight: 1.4,
};

export const textRollen = {
  overlayUeberschrift,
  standardtext,
  hinweistext,

  // overlayUeberschrift, nur kleiner: Unterüberschrift, die einen Bereich
  // INNERHALB eines Overlays/Panels einleitet (z.B. "Darstellung",
  // "Tastenkürzel"). Teilt Gewicht/Farbe/Zeilenhöhe mit overlayUeberschrift,
  // unterscheidet sich nur über die Größe (17 vs. 13) – und von
  // standardtext über das Gewicht (600 vs. 400).
  abschnittsUeberschrift: {
    ...overlayUeberschrift,
    fontSize: 15,
  },

  // standardtext, aber betont (aktiver Tab, ausgewählter Listeneintrag,
  // Overlay-Kopfzeilen-Titel) – hebt sich nur über das Gewicht ab, nicht
  // zusätzlich über eine dritte Farbe, damit nicht zwei Signale (Gewicht +
  // Farbe) dieselbe Aussage treffen.
  standardtextBetont: {
    ...standardtext,
    fontWeight: 600,
  },

  // Fehlermeldungen und fehlgeschlagene Status (Validierung, fehlgeschlagene
  // Imports/Aktualisierungen). AUSSCHLIESSLICH für echte Fehler/Fehlschläge
  // gedacht, nicht für neutrale Status- oder Erfolgsmeldungen (Erfolg hat
  // im Projekt keine eigene Text-Rolle, sondern wird direkt mit
  // var(--text-sekundaer) dargestellt, siehe
  // Konfliktseitenleiste.tsx).
  fehlertext: {
    ...standardtext,
    color: 'var(--akzent-warnung)',
  },

  // standardtext, aber eingerückt: Gruppe unter einer Kategorieüberschrift in
  // gegliederten Berichten und Bannern (MeldungsgliederungAnzeige). Der
  // Einzug in em wächst mit der Schriftgröße.
  berichtGruppe: {
    ...standardtext,
    paddingLeft: '1.5em',
  },

  // Badges/Chips/Zähler (z.B. Kurzbefehl-Kästchen, Quellen-Kennzeichnung).
  // Gewicht bewusst leicht angehoben (500 statt 400): bei 10px wirkt
  // Normalgewicht schnell verwaschen.
  mikrotext: {
    fontSize: 10,
    fontWeight: 500,
    color: 'var(--text-sekundaer)',
    lineHeight: 1.2,
  },

  // Zentrierter Platzhaltertext, wenn eine Liste/Suche leer ist ("Kein
  // Treffer", "Noch keine Gesetze auf dem Gerät", "Noch keine Normen im
  // Verlauf …") – eigenständig statt "hinweistext, aber …", da hinweistext
  // bewusst 11px für Zusatzinformationen verwendet, dieser Fall aber eine
  // ganze (leere) Ansicht füllt und daher etwas mehr Präsenz braucht.
  leererZustandText: {
    fontSize: 14,
    fontWeight: 400,
    color: 'var(--text-sekundaer)',
    lineHeight: 1.4,
  },

  // Kompakte Werteanzeige direkt neben einem Schieberegler (z.B. "13 pt",
  // "1.4"). standardtext, aber sekundaer statt primaer – der aktuelle Wert
  // ist Kontext zum Regler, kein gleichrangiger Fließtext.
  reglerWert: {
    fontSize: 13,
    fontWeight: 400,
    color: 'var(--text-sekundaer)',
    lineHeight: 1.4,
  },

  // standardtext, aber größer: Freitext-Eingabefelder, deren Inhalt der
  // eigentliche Hauptinhalt des Fensters ist (Kommentar-/Verweismarkierung-
  // Fenster, Favoriten-Kurzform-Eingabe) – dort
  // soll der Eingabetext selbst mehr Präsenz haben als der umgebende
  // Fließtext/die Buttons. Verwendungsstellen: VerweismarkierungFormular,
  // KommentarFormular, FavoritenHinzufuegen-
  // Overlay.
  eingabetext: {
    fontSize: 14,
    fontWeight: 400,
    color: 'var(--text-primaer)',
    lineHeight: 1.4,
  },
} as const satisfies Record<string, CSSProperties>;

export type TextRolle = keyof typeof textRollen;

// Kleiner Helfer für den wiederkehrenden Fall "Text ist normal, außer in
// einem bestimmten Zustand (aktiv/ausgewählt), dann betont ihn" – z.B. aktiver
// Tab, ausgewählte Zeile. Verändert NICHT die Definition von standardtext
// oder standardtextBetont (beide bleiben unabhängig änderbar), sondern
// wählt nur zwischen den beiden fertigen Rollen.
//
// NIMMT die Rollen-Sammlung als Parameter entgegen (statt intern auf die
// statische textRollen-Konstante oben zuzugreifen) – der Aufrufer übergibt
// dafür sein bereits vorhandenes `const textRollen = useTextRollen();`.
// Wichtig: greift diese Funktion stattdessen auf die unskalierte
// Modul-Konstante zu, skaliert das Ergebnis NICHT mit der UI-Größe (das war
// ursprünglich ein Bug – siehe TabBeschriftung.tsx/
// KonfliktListe.tsx, die alle bereits den Hook aufrufen).
export function standardOderBetont(
  bedingung: boolean,
  rollen: Record<TextRolle, CSSProperties>,
): CSSProperties {
  return bedingung ? rollen.standardtextBetont : rollen.standardtext;
}

// Icon-Größen, jeweils an die Text-Rolle angelehnt, mit der das Icon
// typischerweise zusammen auftritt – so bleiben Text und Icon optisch im
// Gleichgewicht. Bewusst getrennt von textRollen (Icons haben keine
// Farbe/Gewicht/Zeilenhöhe, sondern nur eine Kantenlänge in px).
export const iconGroessen = {
  // Kleines Symbol in einem kompakten runden Knopf (z.B. Schließen-Kreuz
  // am Banner).
  klein: 11,
  // Icon neben standardtext/in Buttons (z.B. Menü-Icons, Listen-Icons).
  standard: 16,
  // Eigenständiger Icon-Button ohne begleitenden Text (Schließen-Button
  // einer Overlay-Kopfzeile, Übersicht-/Verlaufs-/Neuer-Tab-Button in der
  // Tableiste).
  iconButton: 18,
  // Alleinstehendes Status-/Warnsymbol in einer Liste (z.B. Konfliktzeile
  // im Markierungskonflikte-Fenster) – bewusst größer als iconButton, damit
  // es als eigenständiges Signal auch ohne begleitenden Text auffällt.
  status: 20,
} as const;

// Für Icons, die zu keiner der obigen Standardgrößen exakt passen, aber
// erkennbar "kleiner/größer als X" sein sollen (z.B. der Tab-Schließen-×,
// der in einen kleinen runden Hit-Bereich passen muss): Größe relativ zu
// einer der iconGroessen-Konstanten ausdrücken statt einen weiteren
// eigenständigen Pixelwert zu erfinden. Rundet auf ganze Pixel (wichtig für
// scharfe SVG-Darstellung).
//
// KOMBINATION MIT DEM UI-SKALIERUNGSFAKTOR (useUiSkalierungsFaktor()): basis
// MUSS der unskalierte Rohwert aus iconGroessen sein (NICHT der bereits
// skalierte Wert aus useIconGroessen()!), und uiFaktor wird VOR dem Aufruf
// mit dem lokalen Faktor multipliziert, z.B.
// `iconGroesseSkaliert(iconGroessen.standard, 0.875 * uiFaktor)`. So bleibt
// es bei EINER Multiplikation/Rundung, statt den bereits gerundeten,
// UI-skalierten Wert ein zweites Mal zu runden (würde bei manchen
// Faktor-Kombinationen zu einem 1px-Fehler führen). Siehe Tableiste.tsx.
export function iconGroesseSkaliert(basis: number, faktor: number): number {
  return Math.round(basis * faktor);
}

// Skalierte Varianten von textRollen/iconGroessen für die UI-Größe-
// Einstellung (siehe useUiGroesse.tsx). Rechnen IMMER direkt aus den obigen
// unskalierten Rohwerten (textRollen/iconGroessen bleiben unverändert die
// eine Quelle für Basiswerte UND Ableitungsbeziehungen) – keine Kette aus
// mehreren Rundungsschritten, jede Zahl wird genau einmal mit dem Faktor
// multipliziert und gerundet.
//
// Betrifft ausschließlich UI-Chrome (Overlays, Fenster, Leisten) – NICHT
// den Gesetzestext, der über useTextDarstellung.ts skaliert.
function skaliereFontSize(rolle: CSSProperties, faktor: number): CSSProperties {
  return { ...rolle, fontSize: Math.round((rolle.fontSize as number) * faktor) };
}

export function erzeugeTextRollen(faktor: number): Record<TextRolle, CSSProperties> {
  const ergebnis = {} as Record<TextRolle, CSSProperties>;
  for (const rolle of Object.keys(textRollen) as TextRolle[]) {
    ergebnis[rolle] = skaliereFontSize(textRollen[rolle], faktor);
  }
  return ergebnis;
}

export function erzeugeIconGroessen(faktor: number): Record<keyof typeof iconGroessen, number> {
  const ergebnis = {} as Record<keyof typeof iconGroessen, number>;
  for (const groesse of Object.keys(iconGroessen) as (keyof typeof iconGroessen)[]) {
    ergebnis[groesse] = iconGroesseSkaliert(iconGroessen[groesse], faktor);
  }
  return ergebnis;
}
