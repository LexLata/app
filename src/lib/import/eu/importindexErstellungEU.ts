// importindexErstellungEU.ts
// Erstellt den unkuratierten EU-Importindex aus seitenweisen deutschen Cellar-Metadaten.
import { NORMGEBER_EU } from '@/lib/domain/normgeber';
import { fetch } from '@tauri-apps/plugin-http';
import {
  type ImportindexEintrag,
  type ImportindexErstellungErgebnis,
  mitImportindexVorgang,
  pruefeNichtLeer,
  serialisiereImportindex,
  speichereImportindexAktualisierung,
} from '@/lib/import/importindex/importindex.index';
import {
  istVerbindungsFehler,
  formuliereVerbindungsFehler,
  timeoutSignal,
} from '@/lib/import/basis/basis.index';
import { entferneEWRHinweis } from './euGemeinsam';
import { EU_TYPEN, leiteKurztitelAb } from './kurztitelEU';

const ENDPOINT = 'https://publications.europa.eu/webapi/rdf/sparql';
const SEITENGROESSE = 5000;
interface Zeile {
  celex?: { value?: string };
  typ?: { value?: string };
  titel?: { value?: string };
}

/** Eine Zeile je CELEX: lexikalisch kleinster Typ/Titel macht Mehrfachtreffer
 * deterministisch. CELEX-Anker vermeidet Virtuosos Grenze von 10.000 Sortierzeilen.
 * Der Anker stammt ausschließlich aus zuvor geprüften Basis-CELEX-Werten. */
function baueIndexAbfrage(nachCelex: string): string {
  const typen = Object.keys(EU_TYPEN)
    .map((t) => `<http://publications.europa.eu/resource/authority/resource-type/${t}>`)
    .join(',');
  return `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
SELECT ?celex (MIN(STR(?typRoh)) AS ?typ) (MIN(STR(?titelRoh)) AS ?titel) WHERE {
?w cdm:resource_legal_id_celex ?celex ;
 cdm:resource_legal_in-force "true"^^xsd:boolean ;
 cdm:resource_legal_id_sector "3"^^xsd:string ;
 cdm:work_has_resource-type ?typRoh .
FILTER(?typRoh IN (${typen}))
FILTER(REGEX(STR(?celex), "^3[0-9]{4}[RL][0-9]{4,5}$"))
?e cdm:expression_belongs_to_work ?w ;
 cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/DEU> ;
 cdm:expression_title ?titelRoh .
${nachCelex ? `FILTER(STR(?celex) > "${nachCelex}")` : ''}
} GROUP BY ?celex ORDER BY ?celex LIMIT ${SEITENGROESSE}`;
}

/** Entfernt Mehrfachtreffer und kennzeichnet sämtliche gleichnamigen Basisakte. */
export function bereiteIndexVor(zeilen: Zeile[]): ImportindexEintrag[] {
  const eindeutig = new Map<string, ImportindexEintrag>();
  for (const z of zeilen) {
    const celex = z.celex?.value;
    const art = Object.entries(EU_TYPEN).find(
      ([key]) =>
        z.typ?.value === `http://publications.europa.eu/resource/authority/resource-type/${key}`,
    )?.[1];
    if (!celex || !/^3\d{4}[RL]\d{4,5}$/.test(celex) || !art || !z.titel?.value?.trim()) continue;
    if (!eindeutig.has(celex))
      eindeutig.set(celex, {
        abrufkennung: celex,
        typ: art[0],
        kurztitel: leiteKurztitelAb(celex, art[0]),
        langtitel: entferneEWRHinweis(z.titel.value).trim(),
      });
  }
  const eintraege = [...eindeutig.values()];
  const haeufigkeit = new Map<string, number>();
  for (const e of eintraege) haeufigkeit.set(e.kurztitel, (haeufigkeit.get(e.kurztitel) ?? 0) + 1);
  for (const e of eintraege)
    if (haeufigkeit.get(e.kurztitel)! > 1) e.kurztitel += ` (${e.abrufkennung})`;
  return eintraege.sort((a, b) => a.kurztitel.localeCompare(b.kurztitel, 'de'));
}

/** Trennt Netzwerk-/HTTP-/Antwortfehler von einer gültigen leeren Schlussseite. */
async function ladeSeite(nachCelex: string): Promise<{ zeilen: Zeile[] } | { fehler: string }> {
  try {
    const antwort = await fetch(
      `${ENDPOINT}?query=${encodeURIComponent(baueIndexAbfrage(nachCelex))}`,
      {
        headers: { Accept: 'application/sparql-results+json' },
        signal: timeoutSignal(60_000),
      },
    );
    if (!antwort.ok) return { fehler: `Cellar-Abfrage: HTTP ${antwort.status}.` };
    const json: unknown = await antwort.json();
    const bindings: unknown = (json as { results?: { bindings?: unknown } } | null)?.results
      ?.bindings;
    if (!Array.isArray(bindings) || !bindings.every(istZeile))
      return { fehler: 'Ungültige Cellar-JSON-Antwort.' };
    return { zeilen: bindings };
  } catch (e) {
    return { fehler: istVerbindungsFehler(e) ? formuliereVerbindungsFehler(ENDPOINT) : String(e) };
  }
}
function istZeile(wert: unknown): wert is Zeile {
  if (typeof wert !== 'object' || wert === null) return false;
  return ['celex', 'typ', 'titel'].every((key) => {
    const feld: unknown = (wert as Record<string, unknown>)[key];
    return (
      typeof feld === 'object' &&
      feld !== null &&
      typeof (feld as { value?: unknown }).value === 'string'
    );
  });
}

function erfolgsMeldung(unveraendert: boolean): string {
  return unveraendert
    ? 'Importindex Europarecht geprüft: keine Änderungen.'
    : 'Importindex Europarecht erfolgreich aktualisiert.';
}

function istFolgeSeite(zeilen: Zeile[], letzteCelex: string, nachCelex: string): boolean {
  return (
    zeilen.length === 0 || (/^3\d{4}[RL]\d{4,5}$/.test(letzteCelex) && letzteCelex > nachCelex)
  );
}

/** Lädt alle Seiten, prüft Plausibilität und speichert atomar über die Indexpersistenz.
 * Liefert Anzahl oder Fehlertext; Abbruch bis Speicherbeginn erhält den Bestand.
 * Netzwerk-, HTTP-, Format- und Speicherfehler schließen den Prozessbanner ab.
 */
export async function erstelleEuImportindex(): Promise<ImportindexErstellungErgebnis> {
  return mitImportindexVorgang(
    NORMGEBER_EU,
    'Importindex Europarecht aktualisieren …',
    async (banner) => {
      const fehlschlag = (fehler: string): ImportindexErstellungErgebnis => {
        banner.abschliessen(`Importindex-Aktualisierung fehlgeschlagen: ${fehler}`, 'fehler');
        return { erfolg: false, fehler };
      };
      const zeilen: Zeile[] = [];
      let nachCelex = '';
      for (let seiteNr = 1; ; seiteNr++) {
        if (banner.pruefeAbbruch()) return { erfolg: false, fehler: 'Abgebrochen.' };
        banner.fortschritt(`Importindex Europarecht: Seite ${seiteNr} laden …`);
        const seite = await ladeSeite(nachCelex);
        if ('fehler' in seite) return fehlschlag(seite.fehler);
        const letzteCelex = seite.zeilen.at(-1)?.celex?.value ?? '';
        if (!istFolgeSeite(seite.zeilen, letzteCelex, nachCelex))
          return fehlschlag('Ungültige Cellar-Seitenfolge.');
        zeilen.push(...seite.zeilen);
        nachCelex = letzteCelex;
        if (seite.zeilen.length < SEITENGROESSE) break;
      }
      if (banner.pruefeAbbruch()) return { erfolg: false, fehler: 'Abgebrochen.' };
      const eintraege = bereiteIndexVor(zeilen);
      const leer = pruefeNichtLeer(eintraege, 'eur-lex.europa.eu');
      if (leer) return fehlschlag(leer);
      if (eintraege.length < 1000)
        return fehlschlag(
          `Unplausibler Importindex: nur ${eintraege.length} Einträge (mindestens 1.000 erwartet).`,
        );
      try {
        const { unveraendert } = await speichereImportindexAktualisierung(
          NORMGEBER_EU,
          serialisiereImportindex(eintraege, NORMGEBER_EU),
          {
            pruefeAbbruch: () => banner.pruefeAbbruch(),
            beginneSpeichern: () => banner.beginneSpeichern('Importindex Europarecht speichern …'),
          },
        );
        banner.abschliessen(erfolgsMeldung(unveraendert));
        return { erfolg: true, anzahl: eintraege.length };
      } catch (e) {
        if (banner.pruefeAbbruch()) return { erfolg: false, fehler: 'Abgebrochen.' };
        return fehlschlag(`Schreiben fehlgeschlagen: ${String(e)}`);
      }
    },
  );
}
