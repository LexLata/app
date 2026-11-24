// formatErkennung.ts
// Erkennt, welches der unterstützten Formate eine über "Dateien
// importieren" gewählte oder abgelegte Datei hat, bevor der eigentliche Importpfad
// für Bund, BW oder GesetzesXML angestoßen wird. EUR-Lex-HTML hat kein eigenes
// Format mehr und ergibt „unbekannt“.

import { erkenneGesetzDateiFormat, istHtmlDatei } from '@/lib/import/import.index';
//
// Erkennungsreihenfolge: zuerst Dateiendung (zuverlässig für HTML, da wir
// den Dialog-Filter selbst setzen), danach Root-Tag-Sniffing für die beiden
// XML-Varianten. Reines Endungs-Vertrauen würde bei falsch benannten .xml-
// Dateien versagen, reines Root-Tag-Sniffing bräuchte einen vollständigen
// XML-Parse-Versuch auch für HTML – daher die Kombination.
//
// Innerhalb von HTML schließt erkenneGesetzDateiFormat EUR-Lex-Markup aus,
// damit es nicht als Landesrecht BW behandelt wird.

export type DateiFormat =
  | 'bja-xml'
  | 'kanonisch-xml'
  | 'html-bw'
  | 'index-xml'
  | 'favoriten-xml'
  | 'lesezeichen-xml'
  | 'gesetzeskurzbefehle-xml'
  | 'markierung-xml'
  | 'nichtamtlicheTitel-xml'
  | 'einstellungen-xml'
  | 'zip'
  | 'unbekannt';

/** Root-Tag (bereits kleingeschrieben) -> erkanntes Format, für die
 *  eindeutigen 1:1-Fälle in erkenneDateiFormat. bja-xml hat bewusst KEINEN
 *  Eintrag hier (kein fester Root-Tag, siehe Fallback am Ende der
 *  Funktion). Root-Tag ist bei nichtamtlicheTitel-xml exakt
 *  "nichtamtlicheTitel" (camelCase im Format, siehe
 *  nichtamtlicheTitelSpeicher.ts), hier aber als Schlüssel kleingeschrieben
 *  (siehe .toLowerCase() beim Aufruf). */
const ROOT_TAG_ZU_FORMAT: Record<string, DateiFormat> = {
  importindex: 'index-xml',
  favoriten: 'favoriten-xml',
  lesezeichen: 'lesezeichen-xml',
  gesetzeskurzbefehle: 'gesetzeskurzbefehle-xml',
  markierungen: 'markierung-xml',
  nichtamtlichetitel: 'nichtamtlicheTitel-xml',
  einstellungen: 'einstellungen-xml',
};

/**
 * @param inhalt    Vollständiger Dateiinhalt als Text
 * @param dateiPfad Ausgewählter Pfad (für die Endung)
 */
export function erkenneDateiFormat(inhalt: string, dateiPfad: string): DateiFormat {
  const endung = dateiPfad.toLowerCase().split('.').pop() ?? '';

  // --- ZIP-Archiv (Sammel-Export, siehe exportSpeicher.ts) ---
  // Nur über die Endung erkannt (Inhalt ist Binärdaten, kein Text) – diese
  // Datei wird vom Aufrufer VOR dem Textlesen bereits per Endung erkannt und
  // nie mit Inhalt als Text hierher gereicht; die Prüfung hier dient nur als
  // zusätzliche Absicherung für den Fall, dass sie doch als Text übergeben
  // wird (z.B. versehentlich als leerer String bei binärem Lesefehler).
  if (endung === 'zip') return 'zip';

  const gesetzFormat = erkenneGesetzDateiFormat(inhalt, dateiPfad);
  if (gesetzFormat) return gesetzFormat;

  // --- HTML ohne unterstütztes Gesetzformat ---
  // Endung entscheidet primär; zusätzlich ein Inhalts-Sniff als Absicherung
  // gegen falsch benannte Dateien. EUR-Lex-Exporte beginnen mit einer
  // XML-Deklaration gefolgt von <!DOCTYPE html ...> (xhtml-strict), daher
  // wird die Deklaration hier zusätzlich toleriert.
  //
  // Wird eine EUR-Lex-Seite stattdessen über den Browser gespeichert
  // ("Speichern unter → Webseite, HTML"), wandelt der Browser-HTML-Parser
  // die ungültige XML-Processing-Instruction beim Serialisieren in einen
  // Kommentar um: aus "<?xml version="1.0" encoding="UTF-8"?>" wird
  // "<!--?xml version="1.0" encoding="UTF-8"?-->". Dieser eine, konkrete
  // Kommentar wird hier zusätzlich toleriert – bewusst NICHT beliebige
  // Kommentare an beliebiger Stelle, um das Fehlerkennungsrisiko für andere
  // Formate nicht zu erhöhen.
  if (istHtmlDatei(inhalt, dateiPfad)) return 'unbekannt';

  // --- XML: Root-Tag bestimmen ---
  const getrimmt = inhalt.trimStart();
  // Kommentare und die XML-Deklaration überspringen, dann das erste Tag lesen.
  const ohneKommentare = getrimmt.replace(/<!--[\s\S]*?-->/g, '').trimStart();
  const ohneDeklaration = ohneKommentare
    .replace(/^<\?xml[^>]*\?>/i, '')
    .trimStart()
    // Bundesjustizamt-XML hat vor dem Root-Tag eine DOCTYPE-Deklaration
    // (z.B. <!DOCTYPE dokumente SYSTEM "...gii-norm.dtd">), die hier
    // ebenfalls übersprungen werden muss – sonst beginnt der verbleibende
    // Text mit "<!" statt mit dem Root-Tag und das Sniffing schlägt fehl.
    .replace(/^<!DOCTYPE[^>[\]]*(\[[\s\S]*?\])?\s*>/i, '')
    .trimStart();
  const rootMatch = ohneDeklaration.match(/^<([A-Za-z][\w:-]*)/);
  if (!rootMatch) return 'unbekannt';

  const rootTag = rootMatch[1]!.toLowerCase();
  const format = ROOT_TAG_ZU_FORMAT[rootTag];
  if (format) return format;
  return 'unbekannt';
}
