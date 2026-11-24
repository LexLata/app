// importindexErstellungBund.ts
// Erstellt einen Importindex aller über gesetze-im-internet.de verfügbaren
// Bundesgesetze/-verordnungen, indem die "Teilliste"-Übersichtsseiten
// (1–9, A–Z) heruntergeladen und geparst werden. Ergebnis wird als
// "de-bund.xml" in AppData/importindizes/ abgelegt (ersetzt eine evtl.
// bereits vorhandene Datei).
//
// Bewusst getrennt von gesetzSpeicher.ts (Import einzelner Gesetze in unser
// GesetzesXML) und von den Domänen-Importern unter
// lib/import/bund bzw. lib/import/bw: hier geht es um einen reinen
// Meta-Importindex zum Auffinden von Gesetzen, nicht um deren Normtext.

import { normalisiereWS } from '@/lib/utils/leerraum';
import { NORMGEBER_DE_BUND } from '@/lib/domain/normgeber';
import { fetch } from '@tauri-apps/plugin-http';
import {
  type ProzessBanner,
  type ImportindexEintrag,
  type ImportindexKategorie,
  type ImportindexErstellungErgebnis,
  sortiereUndMarkiereDuplikate,
  serialisiereImportindex,
  pruefeNichtLeer,
  speichereImportindexAktualisierung,
  mitImportindexVorgang,
} from '@/lib/import/importindex/importindex.index';
import {
  istVerbindungsFehler,
  timeoutSignal,
  formuliereVerbindungsFehler,
} from '@/lib/import/basis/basis.index';

const KATEGORIE: ImportindexKategorie = NORMGEBER_DE_BUND;

// Kurztitel, die gesetze-im-internet.de abweichend vom in der Praxis
// gebräuchlichen Kürzel führt (exakter Vergleich, kein Präfix-Match).
// Gegenstück zur Liste in importindexErstellungBW.ts.
const KURZTITEL_KORREKTUREN: Record<string, string> = {
  ZPOEG: 'EGZPO',
};

function korrigiereKurztitel(kurztitel: string): string {
  return KURZTITEL_KORREKTUREN[kurztitel] ?? kurztitel;
}

// Teillisten 1–9 sowie A–Z, wie auf gesetze-im-internet.de gegliedert.
const TEILLISTEN: string[] = [
  ...Array.from({ length: 9 }, (_, i) => String(i + 1)),
  ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
];

// Lädt und parst EINE Teilliste: HTTP-Status wird als Rückgabewert
// gemeldet (NICHT geworfen) – wichtig, weil istVerbindungsFehler() jeden
// `instanceof Error` als Verbindungsfehler einstuft; ein geworfener Fehler
// für einen simplen HTTP-Statuscode (z. B. 404) würde in erstelleBundesImportindex()
// sonst fälschlich als "keine Internetverbindung" gemeldet. Echte
// Netzwerk-/Timeout-Exceptions von fetch() propagieren dagegen weiterhin
// normal nach oben (dort landen sie im try/catch samt istVerbindungsFehler-
// Prüfung).
async function ladeTeilliste(
  teil: string,
): Promise<{ ok: true; eintraege: ImportindexEintrag[] } | { ok: false; fehler: string }> {
  const url = `https://www.gesetze-im-internet.de/Teilliste_${teil}.html`;
  const antwort = await fetch(url, { signal: timeoutSignal() });
  if (!antwort.ok) {
    return { ok: false, fehler: `Teilliste ${teil}: HTTP ${antwort.status}` };
  }
  // Seite ist windows-1252-kodiert (siehe <meta charset> der Quelle) –
  // ohne explizites Decoding würden Umlaute/Sonderzeichen falsch gelesen.
  const bytes = new Uint8Array(await antwort.arrayBuffer());
  const html = new TextDecoder('windows-1252').decode(bytes);
  return { ok: true, eintraege: leseTeilliste(html) };
}

// Schreibt das fertig sortierte Ergebnis als kanonisches Importindex-XML nach
// AppData und schließt den Fortschritts-Banner ab – ausgelagert aus
// erstelleBundesImportindex(), das dessen Nachverarbeitungs-Verzweigungen (Leer-
// Check, Schreibfehler) bislang inline enthielt.
async function schreibeImportindex(
  sortiert: ImportindexEintrag[],
  banner: ProzessBanner,
): Promise<ImportindexErstellungErgebnis> {
  const leerFehler = pruefeNichtLeer(sortiert, 'gesetze-im-internet.de');
  if (leerFehler) {
    banner.abschliessen(`Importindex-Aktualisierung fehlgeschlagen: ${leerFehler}`, 'fehler');
    return { erfolg: false, fehler: leerFehler };
  }

  const xml = serialisiereImportindex(sortiert, NORMGEBER_DE_BUND);

  let unveraendert: boolean;
  try {
    ({ unveraendert } = await speichereImportindexAktualisierung(NORMGEBER_DE_BUND, xml, {
      pruefeAbbruch: () => banner.pruefeAbbruch(),
      beginneSpeichern: () => banner.beginneSpeichern('Importindex Bundesrecht speichern …'),
    }));
  } catch (e) {
    if (banner.pruefeAbbruch()) return { erfolg: false, fehler: 'Abgebrochen.' };
    const fehler = `Schreiben fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`;
    banner.abschliessen(`Importindex-Aktualisierung fehlgeschlagen: ${fehler}`, 'fehler');
    return { erfolg: false, fehler };
  }

  banner.abschliessen(
    unveraendert
      ? 'Importindex Bundesrecht geprüft: keine Änderungen.'
      : 'Importindex Bundesrecht erfolgreich aktualisiert.',
  );
  return { erfolg: true, anzahl: sortiert.length };
}

/**
 * Lädt alle Teillisten sequenziell (einmaliger Vorgang, kein Zeitdruck –
 * daher kein Parallel-Limit wie beim eigentlichen Bundesimport nötig),
 * extrahiert die Einträge und schreibt das Ergebnis als kanonisches
 * Importindex-XML nach AppData.
 */
export async function erstelleBundesImportindex(): Promise<ImportindexErstellungErgebnis> {
  return mitImportindexVorgang(
    KATEGORIE,
    'Importindex Bundesrecht aktualisieren …',
    async (banner) => {
      const eintraege: ImportindexEintrag[] = [];

      for (const [i, teil] of TEILLISTEN.entries()) {
        if (banner.pruefeAbbruch()) return { erfolg: false, fehler: 'Abgebrochen.' };

        banner.fortschritt(
          `Importindex Bundesrecht: Datei ${i + 1}/${TEILLISTEN.length} analysieren …`,
        );
        try {
          const ergebnis = await ladeTeilliste(teil);
          if (!ergebnis.ok) {
            banner.abschliessen(
              `Importindex-Aktualisierung fehlgeschlagen: ${ergebnis.fehler}`,
              'fehler',
            );
            return { erfolg: false, fehler: ergebnis.fehler };
          }
          eintraege.push(...ergebnis.eintraege);
        } catch (e) {
          // Verbindungsfehler (kein Internet/Zeitüberschreitung): sofort
          // abbrechen statt aller übrigen (bis zu 35) Teillisten – ohne
          // Verbindung würde jede einzelne davon ebenfalls scheitern, das
          // würde nur unnötig lange bis zur Meldung dauern (siehe Absprache).
          if (istVerbindungsFehler(e)) {
            const fehler = formuliereVerbindungsFehler('https://www.gesetze-im-internet.de/');
            banner.abschliessen(`Importindex-Aktualisierung fehlgeschlagen: ${fehler}`, 'fehler');
            return { erfolg: false, fehler };
          }
          const fehler = `Teilliste ${teil}: ${e instanceof Error ? e.message : String(e)}`;
          banner.abschliessen(`Importindex-Aktualisierung fehlgeschlagen: ${fehler}`, 'fehler');
          return { erfolg: false, fehler };
        }
      }

      if (banner.pruefeAbbruch()) return { erfolg: false, fehler: 'Abgebrochen.' };

      // permalinkEindeutig=true: bei gesetze-im-internet.de führt ein
      // Permalink immer zu genau einem Gesetz, jede Gruppierung mit
      // identischem Link ist also ein Scraping-Artefakt (siehe
      // importindexErstellung.ts) – anders als bei landesrecht-bw.de.
      const sortiert = sortiereUndMarkiereDuplikate(eintraege, korrigiereKurztitel, true);

      return await schreibeImportindex(sortiert, banner);
    },
  );
}

// ---------------------------------------------------------------------------
// HTML-Parsing einer einzelnen Teilliste
// ---------------------------------------------------------------------------

function leseTeilliste(html: string): ImportindexEintrag[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // #paddingLR12 ist die ID aus der Beispieldatei – als Fallback (falls die
  // echte, live abgerufene Seite strukturell abweicht, z.B. andere ID oder
  // gar keine solche Wrapper-div) wird notfalls im gesamten Dokument gesucht.
  const container: ParentNode = doc.querySelector('#paddingLR12') ?? doc;

  const eintraege: ImportindexEintrag[] = [];

  for (const p of Array.from(container.querySelectorAll('p'))) {
    // Erster Link im Absatz führt zur index.html des Gesetzes und enthält
    // das <abbr>-Element mit Kurztitel (Text) und Langtitel (title-Attribut).
    // Weitere Links im selben <p> (PDF-Download) werden ignoriert.
    const link = p.querySelector('a');
    const abbr = link?.querySelector('abbr');
    if (!link || !abbr) continue;

    const href = link.getAttribute('href') ?? '';
    // href-Form in der Praxis: relativ "./<element>/index.html" (Live-Seite)
    // oder absolut "https://www.gesetze-im-internet.de/<element>/index.html"
    // (z. B. in lokal gespeicherten Kopien) – beides abdecken.
    const match = href.match(/(?:^|gesetze-im-internet\.de\/)\.?\/?([^/]+)\/index\.html$/);
    if (!match) continue;

    const kurztitel = normalisiereWS(abbr.textContent ?? '');
    const langtitel = normalisiereWS(abbr.getAttribute('title') ?? '');
    if (!kurztitel || !langtitel) continue;

    eintraege.push({ kurztitel, langtitel, abrufkennung: match[1]! });
  }

  return eintraege;
}
