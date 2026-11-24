// tableisteStil.ts
//
// Gemeinsame Grundmaße/-optik einer Tab-Box – von echten Tabs (Tableiste.tsx)
// UND vom Fremd-Vorschau-Platzhalter (FremdTabPlatzhalter.tsx) genutzt, damit
// die Lücke beim Live-"Platz machen" optisch exakt wie ein normaler,
// inaktiver Tab aussieht (siehe useTabDragUeberFenster.ts).
//
// PADDING-VEREINHEITLICHUNG (siehe Absprache): alle Stile hier sind
// Funktionen, die den UI-Skalierungsfaktor entgegennehmen, statt fixer
// CSSProperties-Objekte – Padding skaliert dadurch mit useUiSkalierungsFaktor()
// mit, genau wie textRollen/iconGroessen. Rohwerte bleiben als benannte
// Konstanten sichtbar (u.a. von Tableiste.hoehe.ts wiederverwendet, damit
// Zeilenhöhe und tatsächliches Padding aus DERSELBEN Quelle stammen).

import type { CSSProperties } from 'react';
import { pxSkaliert } from '@/lib/stil/paddingRollen';
import { erzeugeAbstandRollen } from '@/lib/stil/abstandRollen';

/** Stil für schmale Icon-Buttons am Rand der Leiste (Übersicht-Button,
 *  Verlaufs-Pfeile, "Neuer Tab"-Button) – disabled-Zustand über den
 *  Aufrufer (opacity/cursor). WebkitAppearance/appearance zurückgesetzt,
 *  da macOS' WebView <button> sonst mit nativer System-Chrome rendert
 *  (unsichtbares Zusatz-Padding), das bei diesen schmalen Icon-Buttons zu
 *  optisch nicht zentrierten Icons führt. Keine fontSize: die Icons hier
 *  bekommen ihre Größe immer explizit über iconGroessen als size-Prop,
 *  nicht über em-Vererbung von der Button-Schrift.
 *
 *  horizontalRoh: unskalierter Rohwert für das horizontale Padding –
 *  Default deckt die meisten Buttons ab (Übersicht-/Neuer-Tab-Button),
 *  einzelne Buttons weichen bewusst ab (Verlaufs-Pfeile: 10, Hamburger: 16,
 *  siehe Tableiste.tsx) und übergeben ihren eigenen Rohwert. */
const LEISTEN_BUTTON_HORIZONTAL_ROH = 12;

export function leistenButtonStil(
  faktor: number,
  horizontalRoh: number = LEISTEN_BUTTON_HORIZONTAL_ROH,
): CSSProperties {
  return {
    padding: `0 ${pxSkaliert(horizontalRoh, faktor)}px`,
    background: 'transparent',
    border: 'none',
    WebkitAppearance: 'none',
    appearance: 'none',
    boxSizing: 'border-box',
    color: 'var(--text-sekundaer)',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.1s',
  };
}

/** Angenommene Breite des "Neuer Tab"-Buttons (Icon-Button mit
 *  leistenButtonStil()-Padding, Standard-Rohwert) – wird in
 *  useTableisteScrollFades genutzt, um zu bestimmen, ob der Button noch
 *  inline hinter die Tabs passt, ohne dafür den Button selbst rendern und
 *  messen zu müssen (vermeidet Zirkularität zwischen Button-Präsenz und
 *  Breitenmessung). iconButtonGroesse MUSS der bereits skalierte Wert aus
 *  useIconGroessen().iconButton sein (nicht der rohe) – nur das Padding
 *  wird hier zusätzlich selbst skaliert, damit beide Anteile aus derselben
 *  Faktor-Anwendung stammen. */
export function neuerTabButtonBreite(faktor: number, iconButtonGroesse: number): number {
  return pxSkaliert(LEISTEN_BUTTON_HORIZONTAL_ROH, faktor) * 2 + iconButtonGroesse;
}

/** Rohe (unskalierte) Padding-Basiswerte einer Tab-Box – EINZIGE Quelle,
 *  aus der sowohl basisTabStil() selbst als auch Tableiste.hoehe.ts (für
 *  die Zeilenhöhen-Berechnung) rechnen. Vertikales Padding ist neu (vorher
 *  0, Zentrierung nur über die feste LEISTEN_HOEHE-Zeile) – Teil der
 *  Padding-Vereinheitlichung: die Zeile wächst jetzt mit dem Inhalt
 *  (Titel+Untertitel) statt der Inhalt in eine fixe Zeilenhöhe gequetscht
 *  zu werden. Horizontal bewusst asymmetrisch (mehr Platz links, wo kein
 *  Trennstrich zum Nachbar-Tab optisch "Luft" schafft). */
export const TAB_PADDING_VERTIKAL_ROH = 5;
const TAB_PADDING_RECHTS_ROH = 12;
const TAB_PADDING_LINKS_ROH = 14;

export function basisTabStil(faktor: number): CSSProperties {
  const abstandRollen = erzeugeAbstandRollen(faktor);
  return {
    display: 'flex',
    alignItems: 'center',
    gap: abstandRollen.standard,
    // Bugfix: bewusst einzelne Langform-Properties statt der `padding`-
    // Kurzform als EIN String. Grund: Tableiste.tsx überschreibt für den
    // aktiven Tab paddingBottom separat (Unterstrich-Reserve) – wenn die
    // Kurzform hier als unveränderlicher String gesetzt wird UND daneben in
    // einem bedingten Zweig paddingBottom als eigener Key auftaucht/
    // verschwindet, überspringt Reacts Style-Diffing das erneute Setzen der
    // (textuell unveränderten) Kurzform beim Wechsel aktiv→inaktiv, wodurch
    // padding-bottom im DOM komplett verwaist (weder alter noch neuer Wert –
    // schlicht leer). Mit lauter Langform-Properties liefert JEDER Render
    // explizit einen paddingBottom-Wert, React kann zuverlässig diffen.
    paddingTop: pxSkaliert(TAB_PADDING_VERTIKAL_ROH, faktor),
    paddingRight: pxSkaliert(TAB_PADDING_RECHTS_ROH, faktor),
    paddingBottom: pxSkaliert(TAB_PADDING_VERTIKAL_ROH, faktor),
    paddingLeft: pxSkaliert(TAB_PADDING_LINKS_ROH, faktor),
    minWidth: pxSkaliert(120, faktor),
    maxWidth: pxSkaliert(220, faktor),
    flexShrink: 0,
    boxSizing: 'border-box',
    borderRight: '1px solid var(--rahmen)',
  };
}
