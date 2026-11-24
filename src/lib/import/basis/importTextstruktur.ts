// importTextstruktur.ts
// Import-Zwischenmodell, XML-Escaping und Normalisierungsfunktionen
// für die Importpipelines von Bund, BW und EU.

import { escapeXML } from '@/lib/utils/xmlVerarbeitung';

// ---------------------------------------------------------------------------
// Interne Typen
// ---------------------------------------------------------------------------

export interface ImpAbsatz {
  /** Bewahrt unnummerierte Präambelabsätze; wird nicht als XML-Attribut geschrieben. */
  absatzgrenzeErhalten?: boolean;
  zwischenueberschrift?: boolean;
  nummer?: string;
  elemente: ImpElement[];
}

export type ImpElement =
  | { type: 'texte'; saetze: string[] }
  | { type: 'liste'; eintraege: ImpEintrag[] }
  // Nur vom EU-Recht-Import (eu/formexParser.ts) erzeugt: markiert die Grenze
  // zwischen zwei Unterabsätzen innerhalb eines nummerierten Absatzes (z.B.
  // Art. 6 Abs. 1 EUV hat drei Unterabsätze). Anders als ein reiner
  // Zeilenumbruch im Fließtext ist das eine echte Struktur-Grenze, die die
  // Darstellungspipeline später gezielt erkennen können soll, ohne den Text
  // zu parsen. Bei Bund/BW nie erzeugt, daher ohne Auswirkung auf deren
  // Ausgabe.
  | { type: 'unterabsatz' };

export interface ImpEintrag {
  bezeichnung: string;
  texteVor: string[];
  untereintraege: ImpEintrag[];
  unterlistenTyp: string;
  texteNach: string[];
}

export interface SatzXML {
  text: string;
  eintraege?: ImpEintrag[];
  fortsetzung?: string;
  /** Wird gesetzt, wenn dieser Eintrag aus einem 'unterabsatz'-ImpElement
   *  stammt (siehe dort) – rendert dann als eigenständiges <unterabsatz/>
   *  statt als <satz>, siehe xmlSerialisierung.ts. */
  istUnterabsatzMarker?: boolean;
}

export interface ListenZustand {
  typ: string;
  eintraege: ImpEintrag[];
  currentDT: string;
  currentLATexteVor: string[];
  currentLATexteNach: string[];
  currentUntereintraege: ImpEintrag[];
  currentUnterlistenTyp: string;
  hatInneresDL: boolean;
}

// ---------------------------------------------------------------------------
// XML-Escaping
// ---------------------------------------------------------------------------

export const esc = escapeXML;

/** Escaped Text und ersetzt \n durch <zeilenumbruch/> */
export function escSatz(s: string): string {
  return s.split('\n').map(esc).join('<zeilenumbruch/>');
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

export function extrahiereAbsatznummer(text: string): [string, string] | null {
  const match = text.match(/^\((\d+[a-z]?)\)\s*/);
  if (!match) return null;
  return [`(${match[1]})`, text.slice(match[0].length)];
}

/** Bestimmt ob ein Listeneintrag <nummer> oder <litera> wird.
 *  Regel: Beginnt die Bezeichnung mit einer Ziffer → nummer (z. B. "1.", "4a)").
 *         Beginnt sie mit einem Buchstaben → litera (z. B. "a)", "b)"). */
export function tagUndAttr(bez: string): [string, string] {
  return /^\d/.test(bez.trim()) ? ['nummer', 'zahl'] : ['litera', 'buchstabe'];
}

export function normalisiereBezeichnung(text: string): string {
  let t = text.trim();
  // "(XXXX)"-Prefix entfernen
  if (t.startsWith('(XXXX)')) t = t.slice('(XXXX)'.length).trim();
  // "Art " → "Art. "
  t = t.replace(/\bArt /, 'Art. ');
  return t;
}
