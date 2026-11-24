// GesetzesXML-Kopfangaben gezielt angleichen, ohne übriges XML neu zu serialisieren.
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { escapeXML } from '@/lib/utils/xmlVerarbeitung';

/** Nur direkte Kopfangaben ersetzen; Kommentare, CDATA und der übrige Text
 * bleiben ohne Neu-Serialisierung bytegetreu erhalten. Die Eingabe ist GesetzesXML. */
export function mitGesetzesXMLReferenz(xml: string, referenz: Gesetzesreferenz): string {
  const pfad: string[] = [];
  const ersetzungen: { von: number; bis: number; text: string }[] = [];
  let kopfangabe: { name: 'kurztitel' | 'normgeber'; inhalt: number } | undefined;
  // XML-Tokens samt Kommentaren/CDATA und maskierten Attributwerten erfassen.
  const tokens =
    /<(?:!--[\s\S]*?--|!\[CDATA\[[\s\S]*?\]\]|\?[\s\S]*?\?|(?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  for (const treffer of xml.matchAll(tokens)) {
    const token = treffer[0];
    const name = /^<\/?([\w:.-]+)/.exec(token)?.[1];
    if (!name) continue;
    if (token.startsWith('</')) {
      if (kopfangabe && pfad.length === 3 && name === kopfangabe.name) {
        ersetzungen.push({
          von: kopfangabe.inhalt,
          bis: treffer.index,
          text: escapeXML(referenz[kopfangabe.name] ?? ''),
        });
        kopfangabe = undefined;
      }
      pfad.pop();
      continue;
    }
    if (token.endsWith('/>')) continue;
    if (pfad.join('/') === 'gesetz/infos' && (name === 'kurztitel' || name === 'normgeber')) {
      kopfangabe = { name, inhalt: treffer.index + token.length };
    }
    pfad.push(name);
  }
  for (const { von, bis, text } of ersetzungen.reverse()) {
    xml = xml.slice(0, von) + text + xml.slice(bis);
  }
  return xml;
}
