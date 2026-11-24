// Gleicht BW-Kandidaten mit dem Importindex ab, ersetzt und markiert Einträge.
// Sortierung und Leerzeichenkorrektur liegen in importindexErstellungBW.nachbearbeitung.ts.
//
// Kernprinzip des Abgleichs (siehe Absprache, "Prinzip 4.4"): ein
// bestehender Eintrag wird nur dann ERSETZT (umbenannt), wenn sein
// bisheriger Kurz- UND Langtitel auf den aktuell gescrapten Seiten
// NIRGENDS mehr auftaucht. Taucht er dort weiterhin auf, ist er weiterhin
// gültig – ein neuer Kandidat mit demselben Permalink wird dann als
// ZUSÄTZLICHER Eintrag ERGÄNZT statt etwas zu ersetzen (landesrecht-bw.de:
// ein Permalink kann zu mehreren gültigen Fassungen führen, siehe
// importindexErstellung.ts). Es wird nie mehr ersetzt/hinzugefügt, als auf den
// Seiten tatsächlich neu bzw. geändert ist.

import { type ImportindexEintrag } from '@/lib/import/importindex/importindex.index';
import { escapeXML, optionaleXmlAttribut, unescapeXML } from '@/lib/utils/xmlVerarbeitung';

/** Case-insensitiver Vergleich unter Entfernung JEGLICHEN Whitespace (nicht
 *  nur Mehrfach-Whitespace wie normalisiereWS) – juris.de liefert
 *  gelegentlich einzelne Fehl-Leerzeichen mitten im Wort (z.B.
 *  "Zust ändigkeit"), die sonst fälschlich als abweichend gewertet würden.
 *  Gemeinsam für alle Funktionen dieser Datei. */
export function gleich(a: string, b: string): boolean {
  return a.replace(/\s+/g, '').toLowerCase() === b.replace(/\s+/g, '').toLowerCase();
}

/** Normalisierter Schlüssel aus Kurz- UND Langtitel gemeinsam (siehe
 *  erstelleAbgleichsplan/markiereMoeglicherweiseEntfernt: "kommt dieser
 *  Eintrag noch irgendwo in der frischen Kandidatenliste vor?"). Kurztitel
 *  ALLEIN reicht nicht: bei den "BW <Jahr>"-Jahresverordnungen (z.B.
 *  BBetVertV 2013..2024) ist der Kurztitel nach Abtrennung des
 *  Jahres-Zusatzes bei allen Jahrgängen identisch, nur der Langtitel
 *  unterscheidet sie. */
function normSchluessel(kurztitel: string, langtitel: string): string {
  const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();
  return `${norm(kurztitel)}\u0000${norm(langtitel)}`;
}

export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Baut den Regex-Quelltext eines vollständigen `<gesetz>`-Blocks aus den
 * drei Innenzeilen (langtitel/kurztitel/abrufkennung), die der Aufrufer bereits
 * fertig als Tag-Fragment übergibt (inkl. eigener Attribut-Erfassungsgruppen
 * und Inhalt – exakt oder Wildcard, je nach Anwendungsfall). Zentral, damit
 * die Block-STRUKTUR selbst (Einrückung, Tag-Reihenfolge – siehe
 * baueGesetzBlock/serialisiereImportindex) nur an einer Stelle gepflegt wird:
 * findeGesetzBlock (exakter Abgleich, unten) und GESETZ_BLOCK_MUSTER
 * (Wildcard-Suche für die Neusortierung, siehe Schritt 6 weiter unten)
 * kannten sie vorher unabhängig voneinander – bei einer künftigen
 * Format-Änderung hätte das leicht auseinanderlaufen können.
 */
export function blockMusterQuelltext(
  langtitelZeile: string,
  kurztitelZeile: string,
  abrufkennungZeile: string,
): string {
  return (
    `<gesetz([^>]*)>\\n` +
    `            ${langtitelZeile}\\n` +
    `            ${kurztitelZeile}\\n` +
    `            ${abrufkennungZeile}\\n` +
    `        </gesetz>`
  );
}

/** Findet den `<gesetz>`-Block eines Eintrags im rohen XML-Text anhand von
 *  Kurz- UND Langtitel UND Abrufkennung gemeinsam (macht die Suche auch bei den
 *  BW-typischen Mehrfach-Abrufkennungen eindeutig, siehe importindexErstellung.ts). Gibt
 *  bei mehrdeutigem oder fehlendem Treffer `null` zurück – Aufrufer
 *  überspringen den Eintrag dann sicherheitshalber, statt zu raten.
 *  Gemeinsam für wendeErsetzungenAn und markiereMoeglicherweiseEntfernt. */
function findeGesetzBlock(xml: string, eintrag: ImportindexEintrag): RegExpMatchArray | null {
  const muster = new RegExp(
    blockMusterQuelltext(
      `<langtitel([^>]*)>${escapeRegExp(escapeXML(eintrag.langtitel))}</langtitel>`,
      `<kurztitel([^>]*)>${escapeRegExp(escapeXML(eintrag.kurztitel))}</kurztitel>`,
      `<abrufkennung>${escapeRegExp(escapeXML(eintrag.abrufkennung))}</abrufkennung>`,
    ),
    'g',
  );
  const treffer = Array.from(xml.matchAll(muster));
  return treffer.length === 1 ? treffer[0]! : null;
}

// ---------------------------------------------------------------------------
// Schritt 1: neue/abweichende Kandidaten ermitteln
// ---------------------------------------------------------------------------

/** Vergleicht `kandidaten` (frisch von den Übersichtsseiten gelesen, mit
 *  "schlechten" Links) gegen `bestehende` (aktueller Importindex-Inhalt): exakte
 *  Übereinstimmung in Kurz- UND Langtitel (whitespace-/case-insensitiv) ->
 *  Kandidat wird ausgeschlossen (schon bekannt, unverändert). Alle
 *  übrigen Kandidaten weichen in mindestens einem der beiden Titel ab und
 *  werden zurückgegeben – die endgültige Entscheidung (ersetzen oder
 *  ergänzen) trifft erst `erstelleAbgleichsplan`, NACHDEM der gute
 *  Permalink für diese Kandidaten nachgeladen wurde (siehe
 *  importindexErstellungBW.ts). */
export function ermittleNeueEintraege(
  kandidaten: ImportindexEintrag[],
  bestehende: ImportindexEintrag[],
): ImportindexEintrag[] {
  return kandidaten.filter(
    (kandidat) =>
      !bestehende.some(
        (b) => gleich(b.kurztitel, kandidat.kurztitel) && gleich(b.langtitel, kandidat.langtitel),
      ),
  );
}

// ---------------------------------------------------------------------------
// Schritt 2 (nach dem Permalink-Nachladen): Ersetzen-/Ergänzen-Plan
// ---------------------------------------------------------------------------

export interface Ersetzung {
  alt: ImportindexEintrag;
  neu: ImportindexEintrag;
}

export interface AbgleichsPlan {
  ersetzen: Ersetzung[];
  ergaenzen: ImportindexEintrag[];
}

/**
 * Entscheidet für jeden Kandidaten mit erfolgreich geladenem (gutem)
 * Permalink, ob er einen bestehenden Eintrag ERSETZT oder als
 * zusätzlicher Eintrag ERGÄNZT wird (Prinzip 4.4, siehe Dateikopf).
 *
 * Ablauf pro Abrufkennungsgruppe (alle `kandidaten`, die auf denselben Permalink
 * verweisen, zusammen mit den `bestehende`-Einträgen mit demselben `abrufkennung`):
 * 1. Von den bestehenden Treffern werden die "verschwundenen" ermittelt –
 *    ihr Kurz- UND Langtitel kommt nirgends mehr in `sortiert` vor (der
 *    VOLLSTÄNDIGEN frischen Kandidatenliste aller Übersichtsseiten, nicht
 *    nur der abweichenden).
 * 2. Verschwundene und neue Kandidaten werden paarweise (stabil nach
 *    Kurztitel sortiert) einander zugeordnet – jeweils
 *    min(Anzahl verschwunden, Anzahl neu) Paare werden ERSETZT.
 * 3. Unpaarige neue Kandidaten werden ERGÄNZT. Unpaarige verschwundene
 *    Alteinträge bleiben hier unangetastet (siehe
 *    markiereMoeglicherweiseEntfernt für deren separate Behandlung).
 * Kandidaten ohne bestehenden Treffer (Abrufkennung vollständig neu) werden immer
 * ergänzt.
 */
export function erstelleAbgleichsplan(
  kandidaten: ImportindexEintrag[],
  bestehende: ImportindexEintrag[],
  sortiert: ImportindexEintrag[],
): AbgleichsPlan {
  const nochVorhanden = new Set(sortiert.map((e) => normSchluessel(e.kurztitel, e.langtitel)));

  const kandidatenNachAbrufkennung = new Map<string, ImportindexEintrag[]>();
  for (const kandidat of kandidaten) {
    const liste = kandidatenNachAbrufkennung.get(kandidat.abrufkennung) ?? [];
    liste.push(kandidat);
    kandidatenNachAbrufkennung.set(kandidat.abrufkennung, liste);
  }

  const ersetzen: Ersetzung[] = [];
  const ergaenzen: ImportindexEintrag[] = [];

  for (const [abrufkennung, kandidatenDieserAbrufkennung] of kandidatenNachAbrufkennung) {
    const verschwundene = bestehende
      .filter(
        (b) =>
          b.abrufkennung === abrufkennung &&
          !nochVorhanden.has(normSchluessel(b.kurztitel, b.langtitel)),
      )
      .sort((a, b) => a.kurztitel.localeCompare(b.kurztitel, 'de'));

    const neueSortiert = [...kandidatenDieserAbrufkennung].sort((a, b) =>
      a.kurztitel.localeCompare(b.kurztitel, 'de'),
    );

    const anzahlPaare = Math.min(verschwundene.length, neueSortiert.length);
    for (let i = 0; i < anzahlPaare; i++) {
      ersetzen.push({ alt: verschwundene[i]!, neu: neueSortiert[i]! });
    }
    for (let i = anzahlPaare; i < neueSortiert.length; i++) {
      ergaenzen.push(neueSortiert[i]!);
    }
  }

  return { ersetzen, ergaenzen };
}

// ---------------------------------------------------------------------------
// Schritt 3a: Ersetzungen im rohen XML anwenden
// ---------------------------------------------------------------------------

function setzeAktualisierungAttribut(attrs: string, wert: string): string {
  if (/\saktualisierung="[^"]*"/.test(attrs)) {
    return attrs.replace(/\saktualisierung="[^"]*"/, ` aktualisierung="${wert}"`);
  }
  return `${attrs} aktualisierung="${wert}"`;
}

/** Ermittelt aus den beiden Geändert-Flags, welches der beiden Titelfelder
 *  (bzw. beide) das `aktualisierung`-Attribut bekommen soll – ausgelagert
 *  aus wendeErsetzungenAn, damit die verschachtelte Fallunterscheidung
 *  nicht in der Schleife selbst steht. */
function ermittleAktualisierungsArt(
  kurztitelGeaendert: boolean,
  langtitelGeaendert: boolean,
): 'kurztitel' | 'langtitel' | 'beide' {
  if (kurztitelGeaendert && langtitelGeaendert) return 'beide';
  return kurztitelGeaendert ? 'kurztitel' : 'langtitel';
}

/** Wendet `setzeAktualisierungAttribut` nur auf das/die tatsächlich
 *  geänderte(n) Feld(er) an (siehe `art`) – das jeweils unveränderte Feld
 *  bleibt unangetastet. Ausgelagert aus wendeErsetzungenAn aus demselben
 *  Grund wie ermittleAktualisierungsArt. */
function ermittleAktualisierteAttrs(
  art: 'kurztitel' | 'langtitel' | 'beide',
  langtitelAttrs: string,
  kurztitelAttrs: string,
): { langtitelAttrs: string; kurztitelAttrs: string } {
  return {
    langtitelAttrs:
      art === 'kurztitel' ? langtitelAttrs : setzeAktualisierungAttribut(langtitelAttrs, art),
    kurztitelAttrs:
      art === 'langtitel' ? kurztitelAttrs : setzeAktualisierungAttribut(kurztitelAttrs, art),
  };
}

/**
 * Schreibt für jede Ersetzung Kurz-/Langtitel direkt im rohen XML-Text um
 * (wie korrigiereLeerzeichenFehler: alle übrigen Attribute bleiben
 * erhalten, da `bestehende` sie nicht mitführt und ein Neuserialisieren sie
 * verlieren würde). Markiert die geänderten Felder mit
 * `aktualisierung="kurztitel"|"langtitel"|"beide"` auf dem jeweils
 * geänderten Tag (dieselbe Systematik wie bisher `neu`, siehe Absprache) –
 * ein bereits vorhandenes `aktualisierung`-Attribut wird ersetzt statt
 * verdoppelt. Ersetzungen, deren `alt`-Eintrag nicht GENAU EINMAL im
 * Roh-XML gefunden wird (identifiziert über Kurztitel + Langtitel + Abrufkennung
 * gemeinsam), werden sicherheitshalber übersprungen statt geraten.
 *
 * Ein evtl. vom alten Block geerbtes `moeglicherweiseEntfernt`-Attribut wird
 * dabei IMMER entfernt (siehe entferneMoeglicherweiseEntfernt unten): dass
 * ein Kandidat hier überhaupt als Ersetzung gepaart wurde, ist bereits der
 * direkte Beleg dafür, dass das Gesetz unter derselben Abrufkennung weiterhin existiert
 * (nur umbenannt) – eine evtl. aus einem früheren Lauf stammende
 * "möglicherweise entfernt"-Markierung wäre in diesem Moment schlicht
 * überholt. Ersetzte Einträge werden von der separaten Prüfung in
 * markiereMoeglicherweiseEntfernt bewusst ausgenommen (siehe `ausgenommen`
 * in erstelleLandesrechtBWImportindexNeu), diese Funktion muss die Bereinigung
 * also selbst übernehmen.
 */
export function wendeErsetzungenAn(
  rawXml: string,
  ersetzungen: Ersetzung[],
): { xml: string; anzahl: number } {
  let xml = rawXml;
  let anzahl = 0;

  for (const { alt, neu } of ersetzungen) {
    const kurztitelGeaendert = !gleich(alt.kurztitel, neu.kurztitel);
    const langtitelGeaendert = !gleich(alt.langtitel, neu.langtitel);
    if (!kurztitelGeaendert && !langtitelGeaendert) continue; // nichts zu tun

    const art = ermittleAktualisierungsArt(kurztitelGeaendert, langtitelGeaendert);

    const treffer = findeGesetzBlock(xml, alt);
    if (!treffer) continue; // mehrdeutig oder nicht gefunden -> überspringen

    // Alle 4 Capture-Gruppen im Muster (blockMusterQuelltext) sind
    // nicht-optional – bei einem Treffer daher immer definiert.
    const [ganzerBlock, gesetzAttrs, langtitelAttrs, kurztitelAttrs] = treffer as [
      string,
      string,
      string,
      string,
    ];
    const neueAttrs = ermittleAktualisierteAttrs(art, langtitelAttrs, kurztitelAttrs);

    const ersatzBlock =
      `<gesetz${entferneMoeglicherweiseEntfernt(gesetzAttrs)}>\n` +
      `            <langtitel${neueAttrs.langtitelAttrs}>${escapeXML(neu.langtitel)}</langtitel>\n` +
      `            <kurztitel${neueAttrs.kurztitelAttrs}>${escapeXML(neu.kurztitel)}</kurztitel>\n` +
      `            <abrufkennung>${escapeXML(alt.abrufkennung)}</abrufkennung>\n` +
      `        </gesetz>`;

    xml = xml.replace(ganzerBlock, () => ersatzBlock);
    anzahl++;
  }

  return { xml, anzahl };
}

/** Entfernt ein evtl. vorhandenes `moeglicherweiseEntfernt`-Attribut aus den
 *  Attributen eines `<gesetz>`-Tags (siehe wendeErsetzungenAn oben). */
function entferneMoeglicherweiseEntfernt(gesetzAttrs: string): string {
  return gesetzAttrs.replace(/\smoeglicherweiseEntfernt="[^"]*"/, '');
}

// ---------------------------------------------------------------------------
// Schritt 3b: Ergänzungen ins rohe XML einfügen
// ---------------------------------------------------------------------------

function baueGesetzBlock(e: ImportindexEintrag): string {
  const kurztitelArtAttr = optionaleXmlAttribut('kurztitelArt', e.kurztitelArt);
  const permalinkArtAttr = optionaleXmlAttribut('permalinkArt', e.permalinkArt);
  const bwZusatzAttr = optionaleXmlAttribut('bwZusatz', e.kurztitelBwZusatz);
  const kurztitelDuplikatAttr = optionaleXmlAttribut('kurztitelDuplikat', e.kurztitelDuplikat);
  const kurztitelOriginalAttr = optionaleXmlAttribut('kurztitelOriginal', e.kurztitelOriginal);
  return (
    `        <gesetz aktualisierung="neu"${kurztitelArtAttr}${permalinkArtAttr}>\n` +
    `            <langtitel>${escapeXML(e.langtitel)}</langtitel>\n` +
    `            <kurztitel${bwZusatzAttr}${kurztitelDuplikatAttr}${kurztitelOriginalAttr}>${escapeXML(e.kurztitel)}</kurztitel>\n` +
    `            <abrufkennung>${escapeXML(e.abrufkennung)}</abrufkennung>\n` +
    `        </gesetz>`
  );
}

/**
 * Fügt für jeden zu ergänzenden Kandidaten einen neuen
 * `<gesetz aktualisierung="neu">`-Block ins rohe XML ein. Die Einfügeposition
 * selbst ist bewusst beliebig (hier: immer unmittelbar vor `</inhalt>`) –
 * eine nach `abrufkennung` sortierte Position wäre unnötiger Aufwand, da Schritt 6
 * (sortiereImportindex) die komplette Datei am Ende dieses Laufs ohnehin IMMER
 * final nach `abrufkennung` -> `kurztitel` -> `bwZusatz` -> `langtitel` neu sortiert
 * (siehe dort), unabhängig davon, wo neue Blöcke zwischenzeitlich standen.
 * Kein `</inhalt>` gefunden -> unerwartetes Format, Datei bleibt unangetastet.
 */
export function fuegeNeueEintraegeEin(
  rawXml: string,
  ergaenzen: ImportindexEintrag[],
): { xml: string; anzahl: number } {
  if (ergaenzen.length === 0) return { xml: rawXml, anzahl: 0 };

  const inhaltEnde = rawXml.indexOf('    </inhalt>');
  if (inhaltEnde === -1) return { xml: rawXml, anzahl: 0 };

  const neueBloecke = ergaenzen.map(baueGesetzBlock).join('\n');
  const xml = `${rawXml.slice(0, inhaltEnde)}${neueBloecke}\n${rawXml.slice(inhaltEnde)}`;
  return { xml, anzahl: ergaenzen.length };
}

// ---------------------------------------------------------------------------
// Schritt 4: "möglicherweise entfernt" markieren/entmarkieren
// ---------------------------------------------------------------------------

/** Billiger EINMALIGER Vorab-Scan über das gesamte Roh-XML: liefert die
 *  Menge der Einträge (als normSchluessel), die schon `moeglicherweiseEntfernt`
 *  tragen. Vermeidet, dass markiereMoeglicherweiseEntfernt für JEDEN der
 *  ~1600 bestehenden Einträge einzeln eine Block-Regex über das komplette
 *  XML laufen lassen muss, nur um den aktuellen Markierungsstatus zu
 *  erfahren – der teure findeGesetzBlock-Aufruf dort ist dadurch auf die
 *  tatsächlich betroffenen Einträge beschränkt. */
function ermittleBereitsMarkierte(xml: string): Set<string> {
  const muster =
    /<gesetz[^>]*\smoeglicherweiseEntfernt="[^"]*"[^>]*>\n {12}<langtitel[^>]*>([^<]*)<\/langtitel>\n {12}<kurztitel[^>]*>([^<]*)<\/kurztitel>/g;
  const markiert = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = muster.exec(xml)) !== null) {
    markiert.add(normSchluessel(unescapeXML(m[2]!), unescapeXML(m[1]!)));
  }
  return markiert;
}

/**
 * Markiert bestehende Einträge, deren Kurz- UND Langtitel auf den aktuell
 * gescrapten Seiten (`sortiert`) nirgends mehr auftauchen, mit
 * `moeglicherweiseEntfernt="<Datum>"` am `<gesetz>`-Tag – taucht ein
 * bereits so markierter Eintrag wieder auf, wird das Attribut automatisch
 * wieder entfernt. Einträge, die in diesem Lauf bereits per
 * `wendeErsetzungenAn` ersetzt wurden (`ausgenommen`), werden hier nicht
 * geprüft – sie sind nicht "entfernt", sondern umbenannt.
 *
 * Idempotent: ein bereits markierter Eintrag wird nicht erneut mit einem
 * neuen Datum überschrieben – das Attribut zeigt weiterhin den Zeitpunkt
 * der ERSTEN Auffälligkeit, damit bei manueller Durchsicht erkennbar ist,
 * wie lange das schon so ist.
 */
export function markiereMoeglicherweiseEntfernt(
  rawXml: string,
  bestehende: ImportindexEintrag[],
  sortiert: ImportindexEintrag[],
  ausgenommen: Set<ImportindexEintrag>,
  heute: string,
): { xml: string; markiert: number; entmarkiert: number } {
  const nochVorhanden = new Set(sortiert.map((e) => normSchluessel(e.kurztitel, e.langtitel)));
  const bereitsMarkierteMenge = ermittleBereitsMarkierte(rawXml);

  let xml = rawXml;
  let markiert = 0;
  let entmarkiert = 0;

  for (const eintrag of bestehende) {
    if (ausgenommen.has(eintrag)) continue;

    const schluessel = normSchluessel(eintrag.kurztitel, eintrag.langtitel);
    const nochDa = nochVorhanden.has(schluessel);
    const bereitsMarkiert = bereitsMarkierteMenge.has(schluessel);

    // Zustand ist bereits konsistent (da + unmarkiert, die weit
    // überwiegende Mehrheit; oder verschwunden + schon markiert) -> nichts
    // zu tun, die teure Block-Suche im XML entfällt. Nur bei INKONSISTENTEM
    // Zustand (da + markiert -> entmarkieren; verschwunden + unmarkiert ->
    // markieren) wird weiterverarbeitet.
    if (nochDa !== bereitsMarkiert) continue;

    const treffer = findeGesetzBlock(xml, eintrag);
    if (!treffer) continue; // mehrdeutig oder nicht gefunden -> überspringen
    const [ganzerBlock, gesetzAttrs] = treffer as [string, string];

    if (!nochDa) {
      const neuerBlock = ganzerBlock.replace(
        `<gesetz${gesetzAttrs}>`,
        `<gesetz${gesetzAttrs} moeglicherweiseEntfernt="${heute}">`,
      );
      xml = xml.replace(ganzerBlock, () => neuerBlock);
      markiert++;
    } else {
      const neuerBlock = ganzerBlock.replace(
        `<gesetz${gesetzAttrs}>`,
        `<gesetz${entferneMoeglicherweiseEntfernt(gesetzAttrs)}>`,
      );
      xml = xml.replace(ganzerBlock, () => neuerBlock);
      entmarkiert++;
    }
  }

  return { xml, markiert, entmarkiert };
}
