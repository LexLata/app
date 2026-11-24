// markierungs-xml.index.ts
//
// Interface des Submoduls markierungs-xml: alleiniger Besitzer der Formate
// MarkierungsXML (<Gesetz>.xml unter markierungen/) und MarkierungskonflikteXML
// (markierungskonflikte.xml). Nur hier werden diese Formate gelesen und
// geschrieben; nach außen gehen nur fachliche Werte, keine XML-Bausteine
// (Tags, Gesetzesblöcke, Textstellen-Zeilen, Escaping). Ohne Datei-I/O; der
// Wortlaut gelesener Gesetzesblöcke wird nur intern zum unveränderten
// Zurückschreiben vorgehalten.
//
// Formatbeschreibung: docs/doku/xml-formate/markierungen.md.

// MarkierungsXML
export { baueXML, parseEintraege } from './markierungsXML';
export type { MarkierungsBefund } from './markierungsXML';
export { eintraegeSindGleich, uebernehmeZeitstempel } from './markierungZeitstempel';
export {
  istMarkierungsXML,
  liesMarkierungsGesetz,
  liesVerweiszielGesetze,
} from './markierungsXML.pruefung';

// MarkierungskonflikteXML: ganze Datei lesen und bauen, Gesetzeskonflikte
// erstellen und gezielt aktualisieren
export {
  aktualisiereEinzelneMarkierung,
  aktualisiereZielkonflikte,
  baueMarkierungskonflikteXML,
  erstelleGespeicherteGesetzKonflikte,
  liesMarkierungskonflikteXML,
  sindGleicheGespeicherteGesetzKonflikte,
} from './markierungskonflikteXML.datei';
export type {
  GespeicherteGesetzKonflikte,
  KonfliktdateiErweiterungen,
  MarkierungskonfliktPruefstatus,
} from './markierungskonflikteXML.datei';
export type { GeparsterKonfliktEintrag } from './markierungskonflikteXML';
