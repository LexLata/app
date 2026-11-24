// cellar.ts
// Cellar-Konsolidierungen und deutsche Formex-Archive mit getrennten HTTP-Fehlerfällen.
import { fetch } from '@tauri-apps/plugin-http';
import type { ImportFehler } from '@/lib/import/importVertrag.types';
import {
  istVerbindungsFehler,
  formuliereVerbindungsFehler,
  timeoutSignal,
} from '@/lib/import/basis/basis.index';

export const EUR_LEX_QUELLE = 'EUR-Lex';
const CELLAR = 'https://publications.europa.eu';
const EU_SPRACHE = 'deu';
class CellarAntwortFehler extends Error {}
export interface Konsolidierung {
  celex: string;
  datum: string;
}

/** Bestimmt unabhängig von Serverreihenfolge und Dubletten die neueste gültige Fassung. */
export function waehleKonsolidierung(
  zeilen: Konsolidierung[],
  heute: string,
): Konsolidierung | undefined {
  const eindeutig = new Map(zeilen.map((z) => [z.celex, z]));
  return [...eindeutig.values()]
    .filter((z) => /^\d{4}-\d{2}-\d{2}$/.test(z.datum) && z.datum <= heute)
    .sort((a, b) => b.datum.localeCompare(a.datum) || a.celex.localeCompare(b.celex))[0];
}
function netzfehler(e: unknown, url: string): ImportFehler {
  return !(e instanceof CellarAntwortFehler) && istVerbindungsFehler(e)
    ? { grund: 'keineVerbindung', meldung: formuliereVerbindungsFehler(url) }
    : { grund: 'download', meldung: String(e) };
}

/** Liest JSON-SPARQL; ein Abfragefehler ist keine leere Trefferliste. */
export async function ladeKonsolidierungen(
  celex: string,
): Promise<Konsolidierung[] | { fehler: ImportFehler }> {
  if (!/^[13]\d{4}[A-Z]\d*(?:\/TXT)?$/.test(celex))
    return { fehler: { grund: 'format', meldung: 'Ungültige Basis-CELEX.' } };
  const query = `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT ?kons ?datum WHERE {
?b cdm:resource_legal_id_celex "${celex}"^^xsd:string .
?k cdm:act_consolidated_based_on_resource_legal ?b ; cdm:resource_legal_id_celex ?kons .
OPTIONAL { ?k cdm:act_consolidated_date ?datum }
}`;
  const url = `${CELLAR}/webapi/rdf/sparql?query=${encodeURIComponent(query)}`;
  try {
    const antwort = await fetch(url, {
      headers: { Accept: 'application/sparql-results+json' },
      signal: timeoutSignal(60_000),
    });
    if (!antwort.ok)
      return { fehler: { grund: 'download', meldung: `Cellar-Abfrage: HTTP ${antwort.status}.` } };
    const json: unknown = await antwort.json();
    const bindings = (json as { results?: { bindings?: unknown } }).results?.bindings;
    if (!Array.isArray(bindings))
      return { fehler: { grund: 'format', meldung: 'Ungültige Cellar-JSON-Antwort.' } };
    return bindings.flatMap((zeile: { kons?: { value?: string }; datum?: { value?: string } }) => {
      const celex = zeile.kons?.value;
      const datum =
        zeile.datum?.value?.slice(0, 10) ??
        celex
          ?.match(/-(\d{4})(\d{2})(\d{2})$/)
          ?.slice(1)
          .join('-');
      return celex && datum ? [{ celex, datum }] : [];
    });
  } catch (e) {
    return { fehler: netzfehler(e, url) };
  }
}

/** 404 und 406 bedeuten fehlende Verfügbarkeit der angefragten Fassung oder des Formats. */
export async function ladeFormex(
  celex: string,
): Promise<{ zip: Uint8Array } | { fehlt: true } | { fehler: ImportFehler }> {
  const url = `${CELLAR}/resource/celex/${encodeURIComponent(celex)}`;
  try {
    const antwort = await ladeMitHttpsWeiterleitungen(url);
    if (antwort.status === 404 || antwort.status === 406) return { fehlt: true };
    if (
      !antwort.ok ||
      !antwort.headers.get('content-type')?.toLowerCase().startsWith('application/zip')
    )
      return {
        fehler: {
          grund: 'download',
          meldung: `Formex-Download: HTTP ${antwort.status}, kein ZIP-Archiv.`,
        },
      };
    return { zip: new Uint8Array(await antwort.arrayBuffer()) };
  } catch (e) {
    return { fehler: netzfehler(e, url) };
  }
}

/** Cellar liefert teilweise HTTP-Locations: vor jedem Abruf auf HTTPS normalisieren.
 * Automatische Weiterleitungen bleiben ausgeschaltet; fremde Hosts werden abgewiesen.
 */
async function ladeMitHttpsWeiterleitungen(start: string): Promise<Response> {
  let url = start;
  const signal = timeoutSignal();
  for (let schritt = 0; schritt < 10; schritt++) {
    const antwort = await fetch(url, {
      headers: { Accept: 'application/zip;mtype=fmx4', 'Accept-Language': EU_SPRACHE },
      maxRedirections: 0,
      signal,
    });
    if (![301, 302, 303, 307, 308].includes(antwort.status)) return antwort;
    const location = antwort.headers.get('location');
    if (!location) return antwort;
    const ziel = new URL(location, url);
    if (
      !['http:', 'https:'].includes(ziel.protocol) ||
      ziel.hostname !== 'publications.europa.eu' ||
      ziel.port ||
      ziel.username ||
      ziel.password
    )
      throw new CellarAntwortFehler('Nicht erlaubtes Cellar-Weiterleitungsziel.');
    ziel.protocol = 'https:';
    url = ziel.href;
  }
  throw new CellarAntwortFehler('Zu viele Cellar-Weiterleitungen.');
}
