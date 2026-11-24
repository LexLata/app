// Sortiert den BW-Importindex und korrigiert zusätzliche Leerzeichen in Langtiteln.
import type { ImportindexEintrag } from '@/lib/import/importindex/importindex.index';
import { escapeXML, unescapeXML } from '@/lib/utils/xmlVerarbeitung';
import { gleich, escapeRegExp, blockMusterQuelltext } from './importindexErstellungBW.abgleich';
// ---------------------------------------------------------------------------
// Schritt 5: vollständige Neusortierung (abrufkennung -> kurztitel -> bwZusatz -> langtitel)
// ---------------------------------------------------------------------------

const GESETZ_BLOCK_MUSTER = new RegExp(
  ` {8}${blockMusterQuelltext(
    '<langtitel[^>]*>([^<]*)</langtitel>',
    '<kurztitel([^>]*)>([^<]*)</kurztitel>',
    '<abrufkennung>([^<]*)</abrufkennung>',
  )}`,
  'g',
);

/**
 * Sortiert alle `<gesetz>`-Blöcke im rohen XML-Text nach `abrufkennung`, bei
 * Gleichstand nach `kurztitel`, bei erneutem Gleichstand nach dem
 * `bwZusatz`-Attribut (z.B. "BW 2013" vs. "BW 2014" – funktioniert als
 * simpler Stringvergleich, weil alle Jahreszahlen 4-stellig sind, siehe
 * Absprache) und zuletzt nach `langtitel` (deckt die seltenen Fälle ab, in
 * denen auch `bwZusatz` gleich oder bei beiden nicht gesetzt ist). Fehlt
 * `bwZusatz`, zählt das wie ein leerer String (sortiert vor jedem
 * tatsächlichen Wert).
 *
 * Arbeitet rein block-weise auf dem ROH-XML-Text – jeder `<gesetz>`-Block
 * wird als Ganzes verschoben, nie neu aufgebaut. Alle Attribute und die
 * exakte Formatierung jedes einzelnen Blocks bleiben dadurch unangetastet,
 * unabhängig davon, ob `bestehende` (aus `leseGesamtenImportindex`) sie überhaupt
 * kennt – anders als eine Neuserialisierung über `serialisiereImportindex`, die
 * unbekannte Attribute verlieren würde (siehe importindexErstellung.ts).
 *
 * Läuft unabhängig davon, ob in diesem Lauf sonst irgendetwas geändert
 * wurde (siehe Absprache: Reihenfolge soll auch bei einem Lauf ohne
 * inhaltliche Änderungen korrigiert werden). Gibt `geaendert: false`
 * zurück, wenn die Datei bereits korrekt sortiert war.
 */
export function sortiereImportindex(rawXml: string): { xml: string; geaendert: boolean } {
  const treffer = Array.from(rawXml.matchAll(GESETZ_BLOCK_MUSTER));
  if (treffer.length === 0) return { xml: rawXml, geaendert: false };

  const mitSortierschluessel = treffer.map((t) => {
    // Alle Capture-Gruppen im Muster (blockMusterQuelltext) sind
    // nicht-optional – bei einem Treffer daher immer definiert.
    const [block, , langtitelText, kurztitelAttrs, kurztitelText, abrufkennungText] =
      t as unknown as [string, string, string, string, string, string];
    const bwZusatzMatch = kurztitelAttrs.match(/bwZusatz="([^"]*)"/);
    return {
      block,
      abrufkennung: unescapeXML(abrufkennungText),
      kurztitel: unescapeXML(kurztitelText),
      bwZusatz: bwZusatzMatch ? unescapeXML(bwZusatzMatch[1]!) : '',
      langtitel: unescapeXML(langtitelText),
    };
  });

  const sortiert = [...mitSortierschluessel].sort(
    (a, b) =>
      a.abrufkennung.localeCompare(b.abrufkennung, 'de') ||
      a.kurztitel.localeCompare(b.kurztitel, 'de') ||
      a.bwZusatz.localeCompare(b.bwZusatz, 'de') ||
      a.langtitel.localeCompare(b.langtitel, 'de'),
  );

  const unveraendert = sortiert.every((e, i) => e.block === mitSortierschluessel[i]!.block);
  if (unveraendert) return { xml: rawXml, geaendert: false };

  let i = 0;
  // Dieselbe Regex läuft hier erneut über dasselbe xml und trifft daher
  // exakt so oft wie beim ersten Durchlauf oben (sortiert.length Treffer).
  const xml = rawXml.replace(GESETZ_BLOCK_MUSTER, () => sortiert[i++]!.block);
  return { xml, geaendert: true };
}

// ---------------------------------------------------------------------------
// Leerzeichen-Korrektur – wird vom Aufrufer (erstelleLandesrechtBWImportindexNeu)
// bewusst NACH wendeErsetzungenAn/fuegeNeueEintraegeEin/
// markiereMoeglicherweiseEntfernt ausgeführt (nicht davor, wie in einer
// früheren Fassung): die dortigen Funktionen suchen Blöcke über
// findeGesetzBlock anhand des in `bestehende` gespeicherten (ggf. noch
// fehlerhaften) Langtitels. Würde diese Korrektur vorher laufen, hätte `xml`
// an dieser Stelle bereits einen abweichenden Text, den findeGesetzBlock für
// denselben Eintrag dann nicht mehr fände (verpasste Entmarkierung in
// seltenen Fällen). Da hier korrigierte Kandidaten wegen des
// whitespace-unabhängigen Abgleichs (siehe `gleich`) ohnehin nie unter den
// von jenen Funktionen bearbeiteten Blöcken sind, ist die Reihenfolge in
// dieser Richtung gefahrlos.
// ---------------------------------------------------------------------------

/**
 * Baut aus `alt` eine korrigierte Version, indem NUR Whitespace-Zeichen
 * entfernt werden, die in `neu` an der entsprechenden Stelle fehlen (siehe
 * Absprache: es soll nicht pauschal `neu` übernommen werden, weil die
 * frische Quelle an anderer Stelle eigene Whitespace-Fehler enthalten
 * könnte – nur das konkret erkannte Fehl-Leerzeichen wird entfernt).
 * Voraussetzung (vom Aufrufer sichergestellt): `alt` und `neu` sind nach
 * Entfernen jeglichen Whitespace identisch. Gibt `null` zurück, wenn beim
 * zeichenweisen Abgleich doch ein echter (Nicht-Whitespace-)Unterschied
 * auftaucht – reiner Sicherheits-Fallback, sollte bei erfüllter
 * Voraussetzung nicht vorkommen.
 */
function repariereEinzelneLeerzeichen(alt: string, neu: string): string | null {
  let i = 0;
  let j = 0;
  let ergebnis = '';

  while (i < alt.length) {
    // Schleifen-Invariante: i < alt.length – altZeichen ist daher immer definiert.
    const altZeichen = alt[i]!;
    if (/\s/.test(altZeichen)) {
      if (j < neu.length && /\s/.test(neu[j]!)) {
        // Auch im neuen Text an dieser Stelle Whitespace -> echtes
        // Trennzeichen, bleibt erhalten.
        ergebnis += altZeichen;
        i++;
        j++;
      } else {
        // Im neuen Text steht an dieser Stelle kein Whitespace -> Fehl-
        // Leerzeichen, wird entfernt.
        i++;
      }
      continue;
    }

    // alt[i] ist kein Whitespace: evtl. im neuen Text vorhandenen
    // (in alt fehlenden) Whitespace nur überspringen, ohne ihn nach `alt`
    // zu übernehmen (nur Entfernen, nie Hinzufügen, siehe Absprache).
    while (j < neu.length && /\s/.test(neu[j]!)) j++;
    // j < neu.length durch die vorangehende Kurzschluss-Bedingung (||)
    // sichergestellt, bevor neu[j] hier gelesen wird.
    if (j >= neu.length || neu[j]!.toLowerCase() !== altZeichen.toLowerCase()) {
      return null;
    }
    ergebnis += altZeichen;
    i++;
    j++;
  }

  return ergebnis;
}

/**
 * Korrigiert im ROHEN XML-Text des bestehenden Importindex einzelne Fehl-
 * Leerzeichen in Langtiteln (siehe Bugreport), ohne die Datei ansonsten neu
 * zu serialisieren – alle übrigen Attribute (`kurztitelArt`, `bwZusatz`,
 * ...) und die Formatierung bleiben exakt erhalten, weil `bestehende` (aus
 * `leseGesamtenImportindex`) diese ohnehin nicht mitführt und ein
 * Neuserialisieren sie daher verlieren würde.
 *
 * Ein Kandidat wird nur korrigiert, wenn (a) Kurztitel exakt (whitespace-
 * unabhängig, case-insensitiv) übereinstimmt, (b) Langtitel nach Entfernen
 * jeglichen Whitespace übereinstimmt, aber wörtlich abweicht, und (c) der
 * betroffene Kurztitel GENAU EINMAL im Roh-XML vorkommt (mehrdeutige
 * Treffer werden sicherheitshalber übersprungen statt geraten).
 */
export function korrigiereLeerzeichenFehler(
  kandidaten: ImportindexEintrag[],
  bestehende: ImportindexEintrag[],
  rawXml: string,
): { xml: string; anzahl: number } {
  let xml = rawXml;
  let anzahl = 0;

  for (const kandidat of kandidaten) {
    const treffer = bestehende.find(
      (b) =>
        gleich(b.kurztitel, kandidat.kurztitel) &&
        gleich(b.langtitel, kandidat.langtitel) &&
        b.langtitel !== kandidat.langtitel,
    );
    if (!treffer) continue;

    const korrigiert = repariereEinzelneLeerzeichen(treffer.langtitel, kandidat.langtitel);
    if (korrigiert === null || korrigiert === treffer.langtitel) continue;

    const kurztitelMuster = new RegExp(
      `<kurztitel[^>]*>${escapeRegExp(escapeXML(treffer.kurztitel))}</kurztitel>`,
      'g',
    );
    if (Array.from(xml.matchAll(kurztitelMuster)).length !== 1) continue; // mehrdeutig -> überspringen

    // <langtitel> steht in der von serialisiereImportindex erzeugten Struktur
    // immer unmittelbar vor <kurztitel> im selben Block. Das optionale
    // bestehende `aktualisierung`-Attribut wird mit erfasst (idempotent:
    // ein bereits einmal korrigierter Eintrag bekommt bei einer erneuten
    // Korrektur NICHT ein zweites Attribut, sondern behält genau eines) –
    // es bleibt dauerhaft als Debug-Spur stehen (kein automatischer
    // Rückbau), damit bei manueller Durchsicht erkennbar ist, welche
    // Langtitel durch diesen Mechanismus verändert wurden.
    const langtitelMuster = new RegExp(
      `<langtitel(?: aktualisierung="[^"]*")?>${escapeRegExp(escapeXML(treffer.langtitel))}</langtitel>\\n            <kurztitel`,
      'g',
    );
    if (Array.from(xml.matchAll(langtitelMuster)).length !== 1) continue; // mehrdeutig -> überspringen

    const korrigierteZeile = `<langtitel aktualisierung="leerzeichen-entfernt">${escapeXML(korrigiert)}</langtitel>\n            <kurztitel`;
    xml = xml.replace(langtitelMuster, () => korrigierteZeile);
    anzahl++;
  }

  return { xml, anzahl };
}
