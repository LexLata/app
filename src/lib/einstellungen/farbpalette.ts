// farbpalette.ts
//
// Gemeinsame Auswahlpalette für die drei einstellbaren Farbtypen der App
// (siehe Absprache):
//   1. Gesetzestext-Akzentfarbe (useGesetzestextAkzentfarbe.ts, [data-gesetzestext-akzent])
//   2. Markierungsfarbe (useHervorhebungsfarbe.ts, [data-markierungsfarbe])
//   3. App-Akzentfarbe (useAppAkzentfarbe.ts, [data-app-akzent])
//
// Alle drei nutzen dieselben 8 Farbwerte (Basis: dasselbe Blau, abgeleitet
// von Apples Systemblau, siehe --c-blue/--h-blue in index.css) und denselben
// Options-Text für ihr jeweiliges Dropdown (FarbAuswahlDropdown.tsx) – daher
// hier zentral definiert statt an drei Stellen dupliziert.
//
// "blau" ist bei allen drei Typen der Standardwert und bleibt themenadaptiv
// (--l-accent/--l-pale in index.css, Absprache: Farben sollen sich zwischen
// Hell/Dunkel bewusst unterscheiden dürfen); alle anderen Farben sind fürs
// erste für Hell/Dunkel identisch (feste Lightness --l-palette, siehe dort).
// Einzige Ausnahme: Button-Hintergründe (buttonRollen.ts) nutzen für ALLE
// acht Farben inkl. Blau die zusätzliche, komplett theme-unabhängige
// --akzent-einheitlich (eigene feste Lightness --l-button) – damit der
// (fest weiße) Button-Text unabhängig von Theme/Farbwahl gut lesbar bleibt.

export type Farbwahl = 'blau' | 'lila' | 'pink' | 'rot' | 'orange' | 'gelb' | 'gruen' | 'grau';

export const FARBWAHL_OPTIONEN: { wert: Farbwahl; label: string }[] = [
  { wert: 'blau', label: 'Blau' },
  { wert: 'lila', label: 'Lila' },
  { wert: 'pink', label: 'Pink' },
  { wert: 'rot', label: 'Rot' },
  { wert: 'orange', label: 'Orange' },
  { wert: 'gelb', label: 'Gelb' },
  { wert: 'gruen', label: 'Grün' },
  { wert: 'grau', label: 'Grau' },
];

export const FARBWAHL_STANDARD: Farbwahl = 'blau';

/** Type Guard für aus localStorage gelesene Rohwerte (z.B. nach einem
 *  Import einer älteren Einstellungen.xml oder einer früher frei gewählten
 *  Hex-Farbe) – alles Unbekannte fällt auf FARBWAHL_STANDARD zurück. */
export function istFarbwahl(wert: string): wert is Farbwahl {
  return FARBWAHL_OPTIONEN.some((o) => o.wert === wert);
}
