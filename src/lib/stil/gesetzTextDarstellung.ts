// gesetzTextDarstellung.ts
// Reine Texttypen, Defaults und Ableitungen; ohne Ansicht oder Speicherung.

/** Zusätzliche Zeilenhöhen zwischen Absätzen sowie zwischen Normzeile und Normtext. */
export const GESETZESTEXT_ABSATZABSTAND = 0.35;

export type LesbareZeilenlaengeBreite = 'schmal' | 'normal' | 'breit';
// Breiten bei Standardschriftgröße 15; die Ansicht skaliert proportional zur Schriftgröße.
export const LESBARE_ZEILENLAENGE_BREITE_WERTE: Record<LesbareZeilenlaengeBreite, number> = {
  schmal: 500,
  normal: 600,
  breit: 750,
};

export type Randbreite = 'schmal' | 'normal' | 'breit';
export const RANDBREITE_WERTE: Record<Randbreite, number> = { schmal: 24, normal: 52, breit: 88 };

export type Skalierungsstufe = 'klein' | 'normal' | 'gross';
export const STRUKTURKONTEXTLEISTE_GROESSE_WERTE: Record<Skalierungsstufe, number> = {
  klein: 0.7,
  normal: 0.85,
  gross: 1,
};

// ISO-639-1-Codes, für die wir Silbentrennungs-Regeln als sinnvoll genug
// erachten, um sie anzubieten (Trennregeln kommen vom Browser/WebView selbst,
// nicht von uns – wir entscheiden hier nur, für welche Sprachen wir
// hyphens:auto überhaupt aktivieren). Erweiterbar durch einfaches Ergänzen
// eines Codes, ohne dass sich am XML-Schema (GesetzDarstellung.sprache,
// gesetzesXMLParser.ts) etwas ändern muss.
const SILBENTRENNUNG_UNTERSTUETZTE_SPRACHEN: ReadonlySet<string> = new Set([
  'de',
  'en',
  'es',
  'fr',
]);

/** Ermittelt lang-Attribut und hyphens-CSS-Wert für ein konkretes Gesetz
 *  (GesetzDarstellung.sprache, Default 'de' wenn nicht gesetzt) unter
 *  Berücksichtigung der globalen Silbentrennung-Einstellung. Pro-Tab
 *  oder Vorschau aufgerufen; jede Ansicht wendet die Werte lokal an. */
export function ermittleSpracheUndTrennung(
  gesetzSprache: string | undefined,
  silbentrennungAktiviert: boolean,
): { lang: string; hyphens: 'auto' | 'none' } {
  const lang = gesetzSprache ?? 'de';
  const hyphens =
    silbentrennungAktiviert && SILBENTRENNUNG_UNTERSTUETZTE_SPRACHEN.has(lang) ? 'auto' : 'none';
  return { lang, hyphens };
}

export type Schriftart = 'sans' | 'serif';

/** Konkrete Font-Stacks je Schriftart-Auswahl.
 *  'sans' referenziert BEWUSST direkt var(--schrift) statt einer eigenen
 *  Stack-Kopie: es soll exakt die sonst app-weit verwendete UI-Schrift sein
 *  Der lokale Darstellungsrahmen löst den Token für CSS und Canvas auf.
 *  Die Serifenschrift (Source Serif 4) wird mit der App ausgeliefert
 *  (lib/stil/schriften.ts), damit sie auf allen Plattformen gleich aussieht. */
export const SCHRIFTART_STACKS: Record<Schriftart, string> = {
  sans: 'var(--schrift)',
  serif: "'Source Serif 4', serif",
};

/** Schriftgröße der hochgestellten Satznummer und deren Hochstellung.
 *  Die mitgelieferte Serifenschrift hat echte Hochziffern; sie werden in voller Schriftgröße
 *  angefordert. Die Standardschrift ist eine Systemschrift ohne garantierte Hochziffern;
 *  dort sind es um 40 Prozent verkleinerte, hochgestellte Ziffern. */
export const SATZNUMMER_VERKLEINERUNG = 0.6;
export function satzNummerSchriftStil(
  schriftart: Schriftart,
  schrift: number,
):
  | { fontSize: number; fontVariantPosition: 'super'; verticalAlign: 'baseline' }
  | { fontSize: number } {
  return schriftart === 'sans'
    ? { fontSize: schrift * SATZNUMMER_VERKLEINERUNG }
    : { fontSize: schrift, fontVariantPosition: 'super', verticalAlign: 'baseline' };
}

// Default-Werte – EINZIGE Quelle. Werden vom Einstellungshook für die
// localStorage-Standardwerte als auch als Prop-Defaults in
// Gesetzestextansicht.tsx (Gesetzestextansicht.types.ts) verwendet, damit
// beide Stellen nicht unabhängig voneinander gepflegt werden müssen
// und nicht auseinanderlaufen können (siehe dortiger Kommentar).
export const UI_SCHRIFT_FALLBACK =
  "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
export const SCHRIFTGROESSE_DEFAULT = 15;
export const LEISTEN_SCHRIFT_DEFAULT = 13;
export const SCHRIFTART_DEFAULT: Schriftart = 'sans';
export const ZEILENABSTAND_DEFAULT = 1.2;
export const SILBENTRENNUNG_DEFAULT = true;
export const BLOCKSATZ_DEFAULT = true;
/** Einstellung „Neue Zeile für jeden Satz“; ausgeschaltet laufen Sätze fortlaufend. */
export const SATZ_NEU_ZEILE_DEFAULT = true;
export const RANDBREITE_DEFAULT: Randbreite = 'normal';
export const STRUKTURKONTEXTLEISTE_GROESSE_DEFAULT: Skalierungsstufe = 'normal';
export const LESBARE_ZEILENLAENGE_DEFAULT = true;
export const LESBARE_ZEILENLAENGE_BREITE_DEFAULT: LesbareZeilenlaengeBreite = 'normal';
