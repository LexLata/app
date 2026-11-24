// importindexErstellung.ts
// Gemeinsame Helper für die Importindex-Erstellung (Bund und BW): Sortierung,
// Duplikat-Markierung und XML-Serialisierung. Beide Quellen (Bund, BW)
// liefern strukturell identische ImportindexEintrag-Listen; die Weiterverarbeitung
// bis zum fertigen Importindex-XML ist daher hier gebündelt statt in
// importindexErstellungBund.ts bzw. importindexErstellungBW.ts dupliziert.
//
// Die Duplikat-Erkennung (siehe bearbeiteGruppe) unterscheidet sich
// zwischen den Quellen (Parameter `permalinkEindeutig` in
// sortiereUndMarkiereDuplikate): bei Bund führt ein Permalink IMMER zu
// genau einem Gesetz, bei BW kann ein Permalink zu mehreren gültigen
// Fassungen eines Gesetzes führen (siehe Absprache) – Duplikate werden dort
// daher nur markiert, nie gelöscht.

import { NORMGEBER_DE_BUND, NORMGEBER_DE_BW, NORMGEBER_EU } from '@/lib/domain/normgeber';
import type { ImportindexKategorie } from './importindexVertrag.types';
import { isoZeitstempel } from '@/lib/utils/xmlVerarbeitung';
import { escapeXML, optionaleXmlAttribut } from '@/lib/utils/xmlVerarbeitung';
import { messeSync } from '@/lib/utils/perfMessung';

export { speichereImportindexAktualisierung } from '@/lib/import/importindex/importindexErstellung.persistenz';

type DuplikatArt = 'eg' | 'unaufgeloest';

export interface ImportindexEintrag {
  typ?: string;
  kurztitel: string;
  langtitel: string;
  abrufkennung: string;
  /** Kurztitel des verworfenen bzw. (bei `unaufgeloest`) des ersten
   *  Eintrags mit identischem `abrufkennung`, falls dieser Eintrag ein Duplikat
   *  ist (gleiches Gesetz, unterschiedlicher Kurztitel). */
  duplikatVon?: string;
  /** Welche Regel das Duplikat erkannt hat – bestimmt das Attribut beim
   *  Serialisieren (`duplikatArt` / `duplikatVon`). */
  duplikatArt?: DuplikatArt;
  /** Klassifizierung "unrunder" Kurztitel, die schlecht auffindbar sind
   *  (siehe `klassifiziereKurztitel`) – rein informativ, wird aktuell nicht
   *  ausgewertet, nur im Importindex-XML mitgeführt. */
  kurztitelArt?: KurztitelArt;
  /** Abgetrennter "BW <Zahl>[/<Zahl>]"-Zusatz eines ursprünglich auf dieses
   *  Muster passenden Kurztitels (siehe `trenneBwZusatz`) – `kurztitel`
   *  selbst enthält dann nur noch den Teil davor. `undefined`, wenn kein
   *  Zusatz abgetrennt wurde. */
  kurztitelBwZusatz?: string;
  /** `abrufkennung` eines anderen Eintrags mit identischem (nach Abtrennung von
   *  `kurztitelBwZusatz` gekürztem) Kurztitel, falls der gekürzte Kurztitel
   *  mit einem bereits bestehenden Eintrag kollidiert (siehe
   *  `markiereKurztitelKollisionen`). Nur bei Einträgen mit
   *  `kurztitelBwZusatz` relevant. */
  kurztitelDuplikat?: string;
  /** Ursprünglicher (unkorrigierter) Kurztitel, falls `kurztitelKorrektur`
   *  (Parameter von `sortiereUndMarkiereDuplikate`) diesen Eintrag ersetzt
   *  hat – `kurztitel` selbst enthält dann bereits den korrigierten Wert.
   *  `undefined`, wenn keine Korrektur angewendet wurde. */
  kurztitelOriginal?: string;
  /** Nur für den BW-Abgleichslauf: gesetzt auf 'schlecht', wenn das
   *  Nachladen des "guten" Permalinks (perma?j=..., siehe
   *  importindexErstellungBW.ts: leseGuterPermalink) fehlgeschlagen ist – `abrufkennung`
   *  enthält dann weiterhin den ursprünglichen "schlechten" Permalink
   *  (perma?d=...) als Fallback. Fehlt das Attribut, war die Extraktion
   *  erfolgreich (`abrufkennung` ist dann bereits der gute Permalink). */
  permalinkArt?: 'schlecht';
}

type KurztitelArt = 'nummeriert';

/**
 * Erkennt das generische Muster "<Präfix> <Zahl>[/<Zahl>]" schlecht
 * auffindbarer Kurztitel, z.B. "PolG 2009" (nutzt dieselbe Regel wie
 * `zerlegeVersion`, das dieses Muster bereits für die Duplikat-Erkennung
 * braucht). Wird nur auf den bereits von `trenneBwZusatz` gekürzten
 * Kurztitel angewandt (siehe `sortiereUndMarkiereDuplikate`).
 */
function klassifiziereKurztitel(kurztitel: string): KurztitelArt | undefined {
  if (zerlegeVersion(kurztitel)) return 'nummeriert';
  return undefined;
}

/**
 * Trennt einen "<Kürzel> BW <Zahl>[/<Zahl>]"-Zusatz ab, z.B.
 * "VwG BW 2008" -> { basis: "VwG", zusatz: "BW 2008" }. Gibt `null` zurück,
 * wenn der Kurztitel nicht auf dieses Muster passt.
 */
function trenneBwZusatz(kurztitel: string): { basis: string; zusatz: string } | null {
  const match = kurztitel.match(/^(.+?)\s+(BW\s+\d+(?:\/\d+)?)$/);
  if (!match) return null;
  return { basis: match[1]!.trim(), zusatz: match[2]! };
}

/**
 * Sortiert primär nach `abrufkennung` (damit Duplikate mit identischer Abrufkennung
 * benachbart stehen), sekundär nach `kurztitel` (damit die Liste für
 * Menschen weiterhin alphabetisch lesbar bleibt). Wendet anschließend pro
 * Abrufkennungsgruppe die Konfliktregeln an (siehe `bearbeiteGruppe`) und markiert
 * verbleibende, durch keine Regel erfasste Duplikate mit `duplikatVon` =
 * Kurztitel des JEWEILS ERSTEN Eintrags dieser Abrufkennungsgruppe.
 *
 * `permalinkEindeutig` unterscheidet die beiden Quellen (siehe Absprache):
 * bei gesetze-im-internet.de (Bund) führt ein Permalink IMMER zu genau
 * einem Gesetz – jede Gruppierung mit identischer Abrufkennung ist daher zwingend
 * ein Scraping-Artefakt (`true`, Standard). Bei landesrecht-bw.de (BW)
 * kann ein Permalink hingegen zu mehreren gültigen Fassungen führen –
 * Regel 2 wird dort übersprungen (siehe `bearbeiteGruppe`), damit
 * unterschiedliche Fassungen nicht fälschlich als Duplikat verworfen
 * werden.
 */
export function sortiereUndMarkiereDuplikate(
  eintraege: ImportindexEintrag[],
  kurztitelKorrektur?: (kurztitel: string) => string,
  permalinkEindeutig = true,
): ImportindexEintrag[] {
  const mitQuellIndex: ImportindexEintrag[] = eintraege.map((e) => {
    const bwZusatz = trenneBwZusatz(e.kurztitel);
    const gekuerzt = bwZusatz ? bwZusatz.basis : e.kurztitel;
    // Korrektur wirkt NACH der BW-Zusatz-Abtrennung, auf den kompletten
    // (ggf. bereits gekürzten) Kurztitel – siehe Absprache: "VwG BW 2008"
    // wird erst zu "VwG" gekürzt, dann erst gegen die Korrekturtabelle
    // geprüft (exakter Vergleich, kein Präfix-Match).
    const korrigiert = kurztitelKorrektur?.(gekuerzt) ?? gekuerzt;
    return {
      ...e,
      kurztitel: korrigiert,
      kurztitelBwZusatz: bwZusatz?.zusatz,
      kurztitelArt: bwZusatz ? undefined : klassifiziereKurztitel(korrigiert),
      kurztitelOriginal: korrigiert !== gekuerzt ? gekuerzt : undefined,
    };
  });

  mitQuellIndex.sort((a, b) => {
    const abrufkennungVergleich = a.abrufkennung.localeCompare(b.abrufkennung, 'de');
    if (abrufkennungVergleich !== 0) return abrufkennungVergleich;
    return a.kurztitel.localeCompare(b.kurztitel, 'de');
  });

  const ergebnis: ImportindexEintrag[] = [];
  let i = 0;
  while (i < mitQuellIndex.length) {
    let j = i + 1;
    while (
      j < mitQuellIndex.length &&
      mitQuellIndex[j]!.abrufkennung === mitQuellIndex[i]!.abrufkennung
    )
      j++;
    ergebnis.push(...bearbeiteGruppe(mitQuellIndex.slice(i, j), permalinkEindeutig));
    i = j;
  }

  messeSync(
    'kurztitelKollisionen',
    () => markiereKurztitelKollisionen(ergebnis),
    () => `${ergebnis.length} Einträge`,
  );

  return ergebnis;
}

/**
 * Prüft für alle Einträge mit abgetrenntem `kurztitelBwZusatz` (also
 * gekürztem Kurztitel), ob ein ANDERER Eintrag (anderer `abrufkennung`) denselben
 * gekürzten Kurztitel trägt – das kann durch das Kürzen erst entstehen, war
 * vorher durch den Zusatz eindeutig. Bei Kollision wird `kurztitelDuplikat`
 * auf den `abrufkennung` des kollidierenden Eintrags gesetzt (case-insensitiv
 * verglichen, damit z.B. "vwg" vs. "VwG" auch erkannt wird). Mutiert die
 * übergebene Liste in-place.
 */
function markiereKurztitelKollisionen(eintraege: ImportindexEintrag[]): void {
  type ErsteKandidaten = {
    erster: ImportindexEintrag;
    ersterMitAndererAbrufkennung?: ImportindexEintrag;
  };
  const nachKurztitel = new Map<string, ErsteKandidaten>();
  for (const e of eintraege) {
    const k = e.kurztitel.toLowerCase();
    const kandidaten = nachKurztitel.get(k);
    if (!kandidaten) nachKurztitel.set(k, { erster: e });
    else if (
      !kandidaten.ersterMitAndererAbrufkennung &&
      e.abrufkennung !== kandidaten.erster.abrufkennung
    ) {
      kandidaten.ersterMitAndererAbrufkennung = e;
    }
  }
  for (const eintrag of eintraege) {
    if (eintrag.kurztitelBwZusatz === undefined) continue;
    const kandidaten = nachKurztitel.get(eintrag.kurztitel.toLowerCase());
    if (!kandidaten) continue;
    const kollision =
      kandidaten.erster.abrufkennung !== eintrag.abrufkennung
        ? kandidaten.erster
        : kandidaten.ersterMitAndererAbrufkennung;
    if (kollision) eintrag.kurztitelDuplikat = kollision.abrufkennung;
  }
}

// ---------------------------------------------------------------------------
// Konfliktregeln innerhalb einer Abrufkennungsgruppe (identische `abrufkennung`)
// ---------------------------------------------------------------------------

/**
 * Verarbeitet eine Gruppe von Einträgen mit identischem `abrufkennung` in zwei
 * Schritten:
 *
 * Regel 1: Sind kurztitel UND langtitel identisch, wird der neue Eintrag
 *          ersatzlos verworfen (kein Attribut nötig) – reines
 *          Scraping-Artefakt (dieselbe Zeile mehrfach gelesen), kein
 *          Informationsverlust. Gilt unabhängig von `permalinkEindeutig`.
 * Regel 2: NUR wenn `permalinkEindeutig` (Bund): Ist der langtitel
 *          identisch und einer der beiden Kurztitel beginnt mit "EG",
 *          während der andere mit "EG" endet (z.B. "EGBGB" vs. "BGBEG"),
 *          bleibt nur die "EG..."-Variante erhalten; sie erhält
 *          `duplikatArt: 'eg'` -> Attributpaar `duplikatArt`/`duplikatVon`. Bei BW
 *          übersprungen: dort kann ein Permalink mehrere gültige
 *          Fassungen haben, ein Löschen wäre dort nicht gerechtfertigt.
 *
 * (Die frühere Regel 3 – Zahlen-Muster wie "PolG 2009"/"PolG 2010", nur
 * höchste Fassung behalten – wurde entfernt: sie war ausschließlich für BW
 * relevant, siehe Auswertung der bestehenden Importindexdateien, 0 Treffer bei
 * Bund. Der BW-Abgleichslauf in importindexErstellungBW.ts deckt Versionsfolgen
 * jetzt allgemeiner ab, siehe erstelleAbgleichsplan dort.)
 *
 * Alle übrigen Mehrfacheinträge einer Gruppe (durch keine Regel erfasst –
 * bei BW praktisch alle nicht-exakten Duplikate) bleiben unverändert
 * erhalten und werden am Ende pauschal mit `duplikatArt: 'unaufgeloest'`
 * -> Attribut `duplikat` markiert, bezogen auf den Kurztitel des ersten
 * Eintrags der Gruppe.
 */
function bearbeiteGruppe(
  gruppe: ImportindexEintrag[],
  permalinkEindeutig: boolean,
): ImportindexEintrag[] {
  // Regel 1: exakte Duplikate (kurztitel + langtitel identisch) entfernen,
  // jeweils den ersten behalten.
  const ohneExakteDuplikate = entferneExakteDuplikate(gruppe);

  // Regel 2: EG-Kombination (z.B. EGBGB / BGBEG), nur bei eindeutigem
  // Permalink (Bund).
  const ergebnis = permalinkEindeutig
    ? wendeEGKombiRegelAn(ohneExakteDuplikate)
    : ohneExakteDuplikate;

  // Fallback: verbleibende, durch keine Regel erfasste Mehrfacheinträge
  // pauschal auf den ersten Eintrag der Gruppe beziehen. Zur lesbaren,
  // stabilen Ausgabe wird zuvor nach kurztitel sortiert.
  return markiereUnaufgeloesteDuplikate(ergebnis);
}

function entferneExakteDuplikate(gruppe: ImportindexEintrag[]): ImportindexEintrag[] {
  const ohneExakteDuplikate: ImportindexEintrag[] = [];
  for (const eintrag of gruppe) {
    const bereitsVorhanden = ohneExakteDuplikate.some(
      (v) => v.kurztitel === eintrag.kurztitel && v.langtitel === eintrag.langtitel,
    );
    if (!bereitsVorhanden) ohneExakteDuplikate.push(eintrag);
  }
  return ohneExakteDuplikate;
}

function wendeEGKombiRegelAn(eintraege: ImportindexEintrag[]): ImportindexEintrag[] {
  const ergebnis: ImportindexEintrag[] = [];
  for (const eintrag of eintraege) {
    const verworfen = versucheEGKombiMitVorhandenen(eintrag, ergebnis);
    if (!verworfen) ergebnis.push(eintrag);
  }
  return ergebnis;
}

/**
 * Prüft `eintrag` gegen alle bereits akzeptierten `ergebnis`-Einträge auf
 * eine EG-Kombination (siehe pruefeEGKombi) und mutiert `ergebnis`
 * entsprechend (Ersatz bzw. duplikatVon/duplikatArt am vorhandenen Eintrag) –
 * Rückgabe: wurde `eintrag` dadurch verworfen (nicht separat einzufügen)?
 */
function versucheEGKombiMitVorhandenen(
  eintrag: ImportindexEintrag,
  ergebnis: ImportindexEintrag[],
): boolean {
  for (let i = 0; i < ergebnis.length; i++) {
    // Schleifen-Invariante: i < ergebnis.length – vorhandener ist daher immer definiert.
    const vorhandener = ergebnis[i]!;
    if (eintrag.langtitel !== vorhandener.langtitel) continue;
    const egKombi = pruefeEGKombi(vorhandener.kurztitel, eintrag.kurztitel);
    if (!egKombi) continue;
    if (egKombi.keeper === 'b') {
      ergebnis[i] = { ...eintrag, duplikatVon: egKombi.duplikatVon, duplikatArt: 'eg' };
    } else {
      vorhandener.duplikatVon = egKombi.duplikatVon;
      vorhandener.duplikatArt = 'eg';
    }
    return true;
  }
  return false;
}

function markiereUnaufgeloesteDuplikate(eintraege: ImportindexEintrag[]): ImportindexEintrag[] {
  eintraege.sort((a, b) => a.kurztitel.localeCompare(b.kurztitel, 'de'));
  for (let i = 1; i < eintraege.length; i++) {
    // Schleifen-Invariante: 1 <= i < eintraege.length – Zugriffe sicher.
    // eintraege[0] existiert, da bearbeiteGruppe nur mit nicht-leeren
    // Gruppen aufgerufen wird (siehe sortiereUndMarkiereDuplikate: Gruppen
    // entstehen aus mitQuellIndex.slice(i, j) mit j > i).
    if (eintraege[i]!.duplikatVon === undefined) {
      eintraege[i]!.duplikatVon = eintraege[0]!.kurztitel;
      eintraege[i]!.duplikatArt = 'unaufgeloest';
    }
  }
  return eintraege;
}

interface KombiErgebnis {
  keeper: 'a' | 'b';
  duplikatVon: string;
}

function pruefeEGKombi(kurztitelA: string, kurztitelB: string): KombiErgebnis | null {
  if (kurztitelA === kurztitelB) return null;
  if (kurztitelA.startsWith('EG') && kurztitelB.endsWith('EG')) {
    return { keeper: 'a', duplikatVon: kurztitelB };
  }
  if (kurztitelB.startsWith('EG') && kurztitelA.endsWith('EG')) {
    return { keeper: 'b', duplikatVon: kurztitelA };
  }
  return null;
}

/**
 * Zerlegt einen Kurztitel in Präfix, Startzahl und Endzahl, z.B.
 * "BVAnp-ÄG 2022" -> { praefix: "BVAnp-ÄG", startzahl: 2022, endzahl: 2022 }
 * oder "HNtragG BW 2010/2011" -> { praefix: "HNtragG BW", startzahl: 2010,
 * endzahl: 2011 }. Gibt `null` zurück, wenn der Kurztitel nicht auf
 * "<Präfix> <Zahl>[/<Zahl>]" passt.
 */
function zerlegeVersion(
  kurztitel: string,
): { praefix: string; startzahl: number; endzahl: number } | null {
  const match = kurztitel.match(/^(.+?)\s+(\d+)(?:\/(\d+))?$/);
  if (!match) return null;
  const startzahl = parseInt(match[2]!, 10);
  const endzahl = match[3] !== undefined ? parseInt(match[3], 10) : startzahl;
  return { praefix: match[1]!.trim(), startzahl, endzahl };
}

// ---------------------------------------------------------------------------
// Leer-Schutz (siehe Bugreport: Format-Änderung der Quellseite führte dazu,
// dass 0 Einträge geparst wurden, wodurch die vorher gültige Importindexdatei
// stillschweigend durch eine leere ersetzt worden wäre)
// ---------------------------------------------------------------------------

/** Gibt eine Fehlermeldung zurück, wenn `eintraege` leer ist (Aufrufer MUSS
 *  in diesem Fall das Schreiben abbrechen, statt die evtl. gute bestehende
 *  Datei zu überschreiben) – sonst `null`. Gemeinsam für Bund und
 *  Landesrecht BW (Abgleichslauf), da dieselbe Gefahr (Format-Änderung der
 *  Quellseite) strukturell überall gleich ist. */
export function pruefeNichtLeer(eintraege: ImportindexEintrag[], quelle: string): string | null {
  if (eintraege.length > 0) return null;
  return `Keine Gesetze gefunden – vermutlich hat sich das Seitenformat von ${quelle} geändert. Bestehende Datei wurde NICHT überschrieben.`;
}

/** Gemeinsames Rückgabeformat von erstelleBundesImportindex() (importindexErstellungBund.ts)
 *  und erstelleLandesrechtBWImportindexNeu() (importindexErstellungBW.ts) – identisch,
 *  da beide Live-Abruf-Vorgänge dieselbe Banner-/Fehlerbehandlung im
 *  jeweiligen Aufrufer (aktuell nur ImportindexOverlay.tsx) bedienen. */
export type { ImportindexErstellungErgebnis } from './importindexVertrag.types';

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// XML-Serialisierung (Format siehe IndexXML_Vorlage.xml)
// ---------------------------------------------------------------------------

export function serialisiereImportindex(
  eintraege: ImportindexEintrag[],
  normgeber: ImportindexKategorie,
  herkunft: 'nutzer' | 'standard' = 'nutzer',
): string {
  const datenquellenname = {
    [NORMGEBER_DE_BUND]: 'Gesetze im Internet',
    [NORMGEBER_DE_BW]: 'Landesrecht BW',
    [NORMGEBER_EU]: 'EUR-Lex',
  }[normgeber];
  const zeilen = eintraege.map((e) => {
    const duplikatAttr =
      e.duplikatVon !== undefined
        ? optionaleXmlAttribut('duplikatArt', e.duplikatArt ?? 'unaufgeloest') +
          optionaleXmlAttribut('duplikatVon', e.duplikatVon)
        : '';
    const kurztitelArtAttr = optionaleXmlAttribut('kurztitelArt', e.kurztitelArt);
    const bwZusatzAttr = optionaleXmlAttribut('bwZusatz', e.kurztitelBwZusatz);
    const kurztitelDuplikatAttr = optionaleXmlAttribut('kurztitelDuplikat', e.kurztitelDuplikat);
    const kurztitelOriginalAttr = optionaleXmlAttribut('kurztitelOriginal', e.kurztitelOriginal);
    const permalinkArtAttr = optionaleXmlAttribut('permalinkArt', e.permalinkArt);
    return (
      `        <gesetz${optionaleXmlAttribut('typ', e.typ)}${duplikatAttr}${kurztitelArtAttr}${permalinkArtAttr}>\n` +
      `            <langtitel>${escapeXML(e.langtitel)}</langtitel>\n` +
      `            <kurztitel${bwZusatzAttr}${kurztitelDuplikatAttr}${kurztitelOriginalAttr}>${escapeXML(e.kurztitel)}</kurztitel>\n` +
      `            <abrufkennung>${escapeXML(e.abrufkennung)}</abrufkennung>\n` +
      `        </gesetz>`
    );
  });

  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<importindex version="1">\n` +
    `    <infos>\n` +
    `        <verarbeitungszeit herkunft="${herkunft}">${isoZeitstempel(new Date())}</verarbeitungszeit>\n` +
    `        <normgeber>${escapeXML(normgeber)}</normgeber>\n` +
    `        <datenquelle name="${escapeXML(datenquellenname)}"/>\n` +
    `    </infos>\n` +
    `    <inhalt>\n` +
    zeilen.join('\n') +
    `\n    </inhalt>\n` +
    `</importindex>\n`
  );
}

// escapeXML: siehe Import oben (xmlVerarbeitung.ts) – vorher hier lokal dupliziert
// (identisch zur jetzt gemeinsamen 5-Entity-Variante).
