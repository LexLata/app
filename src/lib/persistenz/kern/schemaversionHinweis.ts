// Erkennt Schemaversionen am Wurzel-Tag für Lesehinweis und Schreibsicherung.
// Beim Import bleibt das Roh-XML bis auf die eigene Wurzelversion erhalten.
import type { AktionsMeldungEmpfaenger } from '@/lib/domain/app/aktionsMeldung';
import { emitTo } from '@tauri-apps/api/event';

export const SCHEMAVERSION_EREIGNIS = 'schemaversion-abweichend';

const wurzeln = new Set([
  'gesetz',
  'markierungen',
  'favoriten',
  'gesetzeskurzbefehle',
  'lesezeichen',
  'markierungskonflikte',
  'einstellungen',
  'importindex',
  'nichtamtlichetitel',
]);

function endeDoctype(text: string, start: number): number {
  let subsetTiefe = 0;
  let zitat = '';
  for (let i = start; i < text.length; i++) {
    const zeichen = text[i];
    if (zitat) {
      if (zeichen === zitat) zitat = '';
    } else if (text.startsWith('<!--', i)) {
      const kommentarEnde = text.indexOf('-->', i + 4);
      if (kommentarEnde < 0) return -1;
      i = kommentarEnde + 2;
    } else if (zeichen === '"' || zeichen === "'") zitat = zeichen;
    else if (zeichen === '[') subsetTiefe++;
    else if (zeichen === ']') subsetTiefe--;
    else if (zeichen === '>' && subsetTiefe === 0) return i + 1;
  }
  return -1;
}

function nachLeerraum(text: string, start: number): number {
  let i = start;
  while (i < text.length && /\s/.test(text[i]!)) i++;
  return i;
}

function nachMarkierung(text: string, markierung: string, start: number): number {
  const ende = text.indexOf(markierung, start);
  return ende < 0 ? -1 : ende + markierung.length;
}

function nachVorspann(text: string): number {
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  while (i >= 0 && i < text.length) {
    i = nachLeerraum(text, i);
    if (text.startsWith('<?xml', i)) {
      i = nachMarkierung(text, '?>', i + 5);
    } else if (text.startsWith('<!--', i)) {
      i = nachMarkierung(text, '-->', i + 4);
    } else if (/^<!DOCTYPE\s/i.test(text.slice(i, i + 10))) {
      i = endeDoctype(text, i + 9);
      if (i < 0) return -1;
    } else return i;
  }
  return i;
}

function liesAttribut(
  text: string,
  start: number,
): { name: string; wert: string; ende: number } | null {
  const name = /^[A-Za-z_:][\w:.-]*/.exec(text.slice(start, start + 100))?.[0];
  if (!name) return null;
  let i = nachLeerraum(text, start + name.length);
  if (text[i] !== '=') return null;
  i = nachLeerraum(text, i + 1);
  const quote = text[i];
  if (quote !== '"' && quote !== "'") return null;
  const ende = text.indexOf(quote, i + 1);
  if (ende < 0) return null;
  return { name, wert: text.slice(i + 1, ende), ende: ende + 1 };
}

type WurzelVersion = { version: string; start: number; ende: number };

function wurzelVersion(text: string): WurzelVersion | null {
  let i = nachVorspann(text);
  if (i < 0 || text[i] !== '<') return null;
  const name = /^<([A-Za-z][\w:.-]*)/.exec(text.slice(i, i + 80));
  if (!name || !wurzeln.has(name[1]!.toLowerCase())) return null;
  i += name[0].length;
  let version: WurzelVersion | null = null;
  while (i < text.length) {
    i = nachLeerraum(text, i);
    if (text[i] === '>' || (text[i] === '/' && text[i + 1] === '>')) return version;
    const attribut = liesAttribut(text, i);
    if (!attribut) return null;
    if (attribut.name === 'version')
      version = {
        version: attribut.wert,
        start: attribut.ende - attribut.wert.length - 1,
        ende: attribut.ende - 1,
      };
    i = attribut.ende;
  }
  return null;
}

/** Gemeinsame Versionsregel für Lesehinweis und Sicherung vor dem Schreiben. */
export function abweichendeSchemaversion(inhalt: string): string | null {
  const version = wurzelVersion(inhalt)?.version;
  return version !== undefined && version !== '1' ? version : null;
}

/** Erhält das Roh-XML einschließlich unbekannter Angaben; nur die erkannte
 * Wurzelversion wird beim Schreiben durch die eigene Schemaversion ersetzt. */
export function mitEigenerSchemaversion(inhalt: string): string {
  const version = wurzelVersion(inhalt);
  return version === null || version.version === '1'
    ? inhalt
    : inhalt.slice(0, version.start) + '1' + inhalt.slice(version.ende);
}

/** Im Dateiimport sammelt der Aufrufer den Befund mit seiner Dateiherkunft.
 * Andere Lesepfade behalten das bisherige Hauptfensterereignis. */
export async function pruefeSchemaversion(
  inhalt: string,
  meldungEmpfangen?: AktionsMeldungEmpfaenger,
): Promise<void> {
  try {
    const version = abweichendeSchemaversion(inhalt);
    if (version !== null) {
      if (meldungEmpfangen) {
        meldungEmpfangen({
          text: `Abweichende Schemaversion „${version}“; erwartet wird Version „1“.`,
          grund: 'schemaversionAbweichend',
          detail: `Schemaversion „${version}“, erwartet „1“`,
          typ: 'warnung',
          art: 'hinweis',
          anlass: 'lesen',
          aenderungsstand: 'keine',
        });
      } else await emitTo('main', SCHEMAVERSION_EREIGNIS);
    }
  } catch (fehler) {
    console.error('Schemaversion-Hinweis konnte nicht gesendet werden:', fehler);
  }
}
