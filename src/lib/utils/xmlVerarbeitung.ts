// xmlVerarbeitung.ts
//
// Gemeinsame XML-Escape/Unescape-Helfer, vorher dupliziert in
// markierungsXML.ts (nur &/</> – dort ausschließlich für
// Element-Textinhalte gebraucht, nie für Attributwerte) und
// importindexErstellung.ts (zusätzlich "/' – dort auch für Attributwerte wie
// duplikatVon/kurztitelBwZusatz gebraucht). Die 5-Entity-Variante ist ein
// sicherer Superset für BEIDE Anwendungsfälle (zusätzliches Escapen von "/'
// in reinem Elementtext ist gültiges, unnötiges aber harmloses XML) – daher
// hier einmal zentral, statt zwei potenziell auseinanderlaufender Kopien.
//
// IO-freie XML-Konvertierung und direkte DOM-Kindzugriffe, ohne Bezug zu
// einem bestimmten Dateiformat; gemeinsam für Persistenz und Import.

export function escapeXML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const istHohesSurrogat = (code: number) => code >= 0xd800 && code <= 0xdbff;
const istNiedrigesSurrogat = (code: number) => code >= 0xdc00 && code <= 0xdfff;

/** Ersatz für eine in XML 1.0 unzulässige UTF-16-Einheit; undefined, wenn sie
 * zulässig ist. Surrogate gelten hier als unzulässig (Paare prüft der Aufrufer). */
function ersatzFuer(code: number): string | undefined {
  if (code === 0x0b || code === 0x0c) return '\n';
  if (istHohesSurrogat(code) || istNiedrigesSurrogat(code)) return '\uFFFD';
  if (code === 0x09 || code === 0x0a || code === 0x0d) return undefined;
  return code < 0x20 || code === 0xfffe || code === 0xffff ? ' ' : undefined;
}

/** Ersetzt in XML 1.0 unzulässige Zeichen 1:1 (Länge in UTF-16-Einheiten
 * bleibt gleich): vertikaler Tabulator (U+000B) und Seitenvorschub (U+000C) → Zeilenumbruch, ungepaarte
 * Surrogate → U+FFFD, übrige → Leerzeichen. Rein und idempotent; Text ohne
 * unzulässige Zeichen wird unverändert zurückgegeben. */
export function ersetzeUnzulaessigeXmlZeichen(text: string): string {
  let ergebnis: string | undefined;
  let uebernommenBis = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (istHohesSurrogat(code) && istNiedrigesSurrogat(text.charCodeAt(i + 1))) {
      i++;
      continue;
    }
    const ersatz = ersatzFuer(code);
    if (ersatz === undefined) continue;
    ergebnis = (ergebnis ?? '') + text.slice(uebernommenBis, i) + ersatz;
    uebernommenBis = i + 1;
  }
  return ergebnis === undefined ? text : ergebnis + text.slice(uebernommenBis);
}

/** Serialisiert ein optionales XML-Attribut einschließlich führendem
 * Leerzeichen. Attributwerte werden ausnahmslos maskiert. */
export function optionaleXmlAttribut(name: string, value: string | undefined): string {
  return value === undefined ? '' : ` ${name}="${escapeXML(value)}"`;
}

/** Reihenfolge bewusst: &amp; zuletzt, damit durch die anderen Ersetzungen
 *  neu entstandene "&" nicht versehentlich nochmals als Entity gelesen werden. */
export function unescapeXML(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Verarbeitungszeitpunkt in UTC, sekundengenau und mit expliziter Zeitzone. */
export function isoZeitstempel(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Vollständige ISO-Datum-Uhrzeit; zonenlose Altdaten werden als UTC gelesen.
 * Fachliche Datumsangaben und lokale Datumsformate sind keine Zeitstempel. */
export function liesVerarbeitungszeitstempel(wert: string | undefined): Date | undefined {
  if (!wert) return undefined;
  const treffer =
    /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d+)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)?$/.exec(
      wert,
    );
  if (!treffer) return undefined;
  // Date normalisiert z. B. den 30. Februar still; vor dem Lesen zurückweisen.
  const datum = new Date(`${treffer[1]}-${treffer[2]}-${treffer[3]}T00:00:00Z`);
  if (!Number.isFinite(datum.getTime()) || datum.toISOString().slice(0, 10) !== wert.slice(0, 10)) {
    return undefined;
  }
  const zeitpunkt = new Date(treffer[7] ? wert : `${wert}Z`);
  return Number.isFinite(zeitpunkt.getTime()) ? zeitpunkt : undefined;
}

/** Liest wohlgeformtes XML; Fehler werden vor einer Übernahme gemeldet. */
export function liesXmlWurzel(xml: string, erwartet?: string): Element {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const root = doc.documentElement;
  if (!root || doc.querySelector('parsererror') || (erwartet && root.tagName !== erwartet)) {
    throw new Error('Datei ungültig: XML ist nicht wohlgeformt oder hat die falsche Wurzel.');
  }
  return root;
}

/** Bekannte Angaben zählen ausschließlich als direkte Kinder ihres Containers. */
export function xmlKinder(el: Element | undefined | null, tag: string): Element[] {
  return el ? Array.from(el.children).filter((kind) => kind.tagName === tag) : [];
}

export function xmlKind(el: Element | undefined | null, tag: string): Element | undefined {
  return xmlKinder(el, tag)[0];
}

export function xmlText(el: Element | undefined | null, tag: string): string | undefined {
  return xmlKind(el, tag)?.textContent ?? undefined;
}
