// Einziger Schreibweg für Markierungsdateien: prüft den Inhalt, bevor er gesichert oder geschrieben wird.
import { nutzerdatenSchreiben } from '@/lib/persistenz/kern/kern.index';
import { ersetzeUnzulaessigeXmlZeichen, liesXmlWurzel } from '@/lib/utils/xmlVerarbeitung';

/** Schreibt eine Markierungsdatei nur, wenn ihr Inhalt keine unzulässigen
 * XML-Zeichen enthält und als wohlgeformtes XML mit der Wurzel `markierungen`
 * lesbar ist. Sonst wird weder gesichert noch geschrieben; der Fehler nennt
 * keinen Nutzertext. Den Pfad ermittelt der Aufrufer. */
export async function schreibeMarkierungsXML(
  relativerPfad: string,
  inhalt: string,
  token?: string,
  vorgang?: string,
): Promise<void> {
  if (!istWohlgeformtesMarkierungsXML(inhalt))
    throw new Error(
      `Die Markierungsdatei ‚${relativerPfad}' wurde nicht gespeichert: Der Inhalt ist kein wohlgeformtes MarkierungsXML.`,
    );
  await nutzerdatenSchreiben(relativerPfad, inhalt, token, vorgang);
}

/** Zeichenprüfung unabhängig von der Strenge des XML-Parsers der Plattform. */
function istWohlgeformtesMarkierungsXML(inhalt: string): boolean {
  if (ersetzeUnzulaessigeXmlZeichen(inhalt) !== inhalt) return false;
  try {
    liesXmlWurzel(inhalt, 'markierungen');
    return true;
  } catch {
    return false;
  }
}
