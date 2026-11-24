// gesetzVergleich.ts
// Entfernt veränderliche Metadaten für den Vergleich von Gesetzes-XML.

import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { mitGesetzesXMLReferenz } from '@/lib/domain/gesetzesXMLReferenz';

/** Nach Bestandsauflösung beide XMLs auf dieselbe Referenzschreibweise beziehen. */
export function gesetzesXMLOhneVeraenderlicheFelder(
  xml: string,
  referenz?: Gesetzesreferenz,
): string {
  if (referenz) xml = mitGesetzesXMLReferenz(xml, referenz);
  return xml
    .replace(/<verarbeitungszeit>[^<]*<\/verarbeitungszeit>/, '')
    .replace(/<letzteNeuerung>[^<]*<\/letzteNeuerung>/, '')
    .replace(/<gesetz\b[^>]*>/, (wurzel) => wurzel.replace(/\s+id="[^"]*"/, ''));
}
