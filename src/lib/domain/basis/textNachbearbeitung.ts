// textNachbearbeitung.ts
//
// Reine, React-freie Texttransformation für sichtbare Normangaben. Allgemeine
// Anzeigen und Normzitate verwenden dieselben Grundregeln. Nur der Zitatweg
// schützt zusätzlich die bisherigen römischen Kurzformen I/V/X vor Zahlen.
// Keine Rückschreibung in Fachdaten, Formularzustände oder GesetzesXML.
// Die Rückwärtsidentifikation verwendet dieselbe Transformation wie die
// Gesetzestextdarstellung: ausschließlich 1:1-Leerzeichenersetzung, damit
// Zeichenpositionen und die Zeichenzählung der Markierungen erhalten bleiben.

import { normPraefixQuelle } from './normPraefixe';

// Die bisherigen Zitatpräfixe mit ihren Wortgrenzen und Schreibweisen mit/ohne
// Punkt gelten auch im allgemeinen Text. Nur gewöhnliche und bereits geschützte
// Leerzeichen bilden einen Abstand; Tabs und gesetzte Zeilenumbrüche bleiben.
const LEERZEICHEN_VOR_ZAHL =
  /(§§?|\b(?:Art(?:ikel|\.)?|Abs(?:atz|ätze|\.)?|Satz|S\.?|Nummern?|Nr\.?|Ziffern?|Ziff\.?|lit\.?|Abschnitt|Gruppe|Gr\.?|Variante|Var\.?|Halbsatz|Hs\.?|Alternative|Alt\.?|UAbs\.?|Unterabsatz|Erwägungsgrund))([ \u00a0]+)(\d)/g;
// Canon-Schreibweisen aus der bestehenden Tabelle, wie dort unabhängig von
// Groß-/Kleinschreibung. Kein neuer Erkennungsumfang für andere Tabellenverbraucher.
const LEERZEICHEN_VOR_CANONZAHL = new RegExp(
  `(\\b${normPraefixQuelle('abstand', 'canon')})([ \\u00a0]+)(\\d)`,
  'gi',
);
const LEERZEICHEN_VOR_BUCHSTABE = /(\bBuchstaben?\b|\bBuchst\.|\blit\.?)([ \u00a0]+)([a-z]\b)/g;
const LEERZEICHEN_VOR_ROEMISCHEM_ABSATZ =
  /(\bAbs(?:atz|ätze)\b|\bAbs\.?)([ \u00a0]+)([IVXLCDM]+\b)/g;
const LEERZEICHEN_VOR_ZAHL_ZITAT = /(\bI\b|\bV\b|\bX\b)([ \u00a0]+)(\d)/g;
// Eigenständige bisherige Zusatzregel: nur das erste gewöhnliche Leerzeichen
// unmittelbar nach Ziffern mit Punkt ersetzen, keine Erweiterung der Erkennung.
const LEERZEICHEN_NACH_NUMMER = /(\d+\.) /g;

function schuetzeAbstand(_treffer: string, praefix: string, abstand: string, wert: string): string {
  return praefix + abstand.replaceAll(' ', '\u00a0') + wert;
}

function schuetzeGemeinsameLeerzeichen(text: string): string {
  return text
    .replace(LEERZEICHEN_VOR_ZAHL, schuetzeAbstand)
    .replace(LEERZEICHEN_VOR_CANONZAHL, schuetzeAbstand)
    .replace(LEERZEICHEN_VOR_BUCHSTABE, schuetzeAbstand)
    .replace(LEERZEICHEN_VOR_ROEMISCHEM_ABSATZ, schuetzeAbstand)
    .replace(LEERZEICHEN_NACH_NUMMER, '$1\u00a0');
}

/** Allgemeiner Umbruchschutz für sichtbaren Text; Länge und Positionen bleiben erhalten. */
export function schuetzeLeerzeichen(text: string): string;
export function schuetzeLeerzeichen(text: string | undefined): string | undefined;
export function schuetzeLeerzeichen(text: string | undefined): string | undefined {
  if (text == null) return text;
  return schuetzeGemeinsameLeerzeichen(text);
}

/** Normzitate: gemeinsame Regeln plus die bisherigen Kurzformen I/V/X vor Zahlen. */
export function schuetzeLeerzeichenZitat(text: string): string;
export function schuetzeLeerzeichenZitat(text: string | undefined): string | undefined;
export function schuetzeLeerzeichenZitat(text: string | undefined): string | undefined {
  if (text == null) return text;
  return schuetzeGemeinsameLeerzeichen(text).replace(LEERZEICHEN_VOR_ZAHL_ZITAT, schuetzeAbstand);
}
