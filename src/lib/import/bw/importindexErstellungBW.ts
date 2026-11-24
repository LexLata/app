// importindexErstellungBW.ts
// Gleicht den bestehenden Importindex aller über landesrecht-bw.de verfügbaren
// Gesetze/Verordnungen des Landesrechts gegen die neun "Systematische Übersicht"-
// Seiten des Abschnitts "5 Verteidigung" (jlr-BWFFNAbsch1 bis
// jlr-BWFFNAbsch9) ab, die dafür über ein Hintergrund-WebView geladen und
// geparst werden. Anders als beim früheren Zwischenschritt ("Importindex
// Landesrecht BW neu.xml" zur manuellen Sichtung) wird der bestehende
// Importindex jetzt DIREKT aktualisiert (siehe erstelleLandesrechtBWImportindexNeu()
// unten) – ein automatischer voller Neuaufbau ist seit der
// Format-Umstellung von juris.de (Sommer 2026) weiterhin nicht möglich
// (siehe Kommentar bei leseGuterPermalink in importindexErstellungBW.parsing.ts),
// aber der inkrementelle Abgleich kommt seit der Umstellung auf Prinzip 4.4
// (siehe erstelleAbgleichsplan in importindexErstellungBW.abgleich.ts) ohne
// manuelle Sichtungsdatei mehr aus: ein bestehender Eintrag wird nur
// ersetzt, wenn er auf den frisch gescrapten Seiten nirgends mehr
// auftaucht (sonst wird ergänzt, nie überschrieben) – landesrecht-bw.de
// kann pro Permalink mehrere gültige Fassungen führen, ein Löschen wäre
// dort nie gerechtfertigt.
//
// HTML-Parsing siehe importindexErstellungBW.parsing.ts, Abgleich gegen den
// bestehenden Importindex siehe importindexErstellungBW.abgleich.ts – beide ausgelagert,
// damit diese Datei die 500-Zeilen-Richtgröße nicht überschreitet.
//
// Bewusst getrennt von HTMLImporterBW.ts (Import einzelner Gesetze in unser
// GesetzesXML) und von bund/importindexErstellungBund.ts (analoges
// Vorbild für Bundesrecht, aber strukturell anderes Quell-HTML sowie
// eindeutiger Permalink, siehe importindexErstellung.ts): hier geht es um einen
// reinen Meta-Importindex zum Auffinden von Gesetzen, nicht um deren
// Normtext.
import { NORMGEBER_DE_BW } from '@/lib/domain/normgeber';
import { rufeBefehl } from '@/lib/plattform/tauri-befehle/tauri-befehle.index';

import {
  korrigiereLeerzeichenFehler,
  sortiereImportindex,
} from './importindexErstellungBW.nachbearbeitung';
import {
  type ImportindexEintrag,
  type ImportindexKategorie,
  type ImportindexErstellungErgebnis,
  sortiereUndMarkiereDuplikate,
  pruefeNichtLeer,
  speichereImportindexAktualisierung,
  leseImportindexAbgleichsSnapshot,
  parseImportindex,
  mitImportindexVorgang,
  type ProzessBanner,
} from '@/lib/import/importindex/importindex.index';
import {
  pruefeErreichbarkeit,
  berechneVerzoegerungMs,
  warte,
} from '@/lib/import/basis/basis.index';
import {
  LANDESRECHT_BW_URL,
  leseUebersichtsseiteSchlechteLinks,
  leseGuterPermalink,
} from '@/lib/import/bw/importindexErstellungBW.parsing';
import {
  ermittleNeueEintraege,
  erstelleAbgleichsplan,
  wendeErsetzungenAn,
  fuegeNeueEintraegeEin,
  markiereMoeglicherweiseEntfernt,
} from '@/lib/import/bw/importindexErstellungBW.abgleich';

const KATEGORIE: ImportindexKategorie = NORMGEBER_DE_BW;

// Sicherung des bestehenden Importindex unmittelbar vor jeder Direktschreibung
// (siehe erstelleLandesrechtBWImportindexNeu unten) – bewusst nur EIN Schritt
// zurück (überschrieben je Lauf), keine volle Historie: dafür gibt es
// aktuell nur diesen einen Anwendungsfall, eine tiefere Historie wäre
// unbegründete Komplexität. Für die gebündelte Standarddatei
// (src-tauri/resources/importindizes/) übernimmt git diese Rolle, hier geht es
// nur um die AppData-Kopie, die dieser Lauf tatsächlich überschreibt.
// Die neun Abschnitts-Übersichtsseiten von "5 Verteidigung" auf
// landesrecht-bw.de. Anders als beim Bundesrecht-Vorbild gibt es hier keine
// zusätzlichen A–Z-Seiten (bestätigt).
const DOK_IDS: string[] = Array.from({ length: 9 }, (_, i) => `jlr-BWFFNAbsch${i + 1}`);

// juris verwendet für manche Gesetze ein Kürzel, das sich von dem in
// der Praxis (Rechtsprechung, Literatur) gebräuchlichen unterscheidet – z.B.
// "VwG" statt des üblichen "LVG" für das Landesverwaltungsgesetz. Greift erst
// NACH der BW-Zusatz-Abtrennung in sortiereUndMarkiereDuplikate (exakter
// Vergleich, kein Präfix-Match), damit sowohl "VwG" als auch "VwG BW 2008"
// (nach Kürzung zu "VwG") erkannt werden.
const KURZTITEL_KORREKTUREN: Record<string, string> = {
  VwG: 'LVG',
};

function korrigiereKurztitel(kurztitel: string): string {
  return KURZTITEL_KORREKTUREN[kurztitel] ?? kurztitel;
}

// Der weitergereichte native Zugang behält den zentralen Befehlsvertrag.
type Befehlsaufruf = typeof rufeBefehl;

// ---------------------------------------------------------------------------
// Abgleichslauf: direkte Aktualisierung von "de-bw.xml"
// ---------------------------------------------------------------------------

// Lädt und parst EINE der neun Absch-Übersichtsseiten (siehe DOK_IDS).
// Fehler werden als Rückgabewert gemeldet (nicht geworfen), analog zu
// ladeTeilliste in importindexErstellungBund.ts – ausgelagert aus
// erstelleLandesrechtBWImportindexNeu, um dessen Cognitive Complexity zu senken.
async function ladeUebersichtsseite(
  dokId: string,
  nativeBefehle: Befehlsaufruf,
): Promise<{ ok: true; eintraege: ImportindexEintrag[] } | { ok: false; fehler: string }> {
  try {
    const html = await nativeBefehle('lade_landesrecht_uebersichtsseite', { dokId });
    return { ok: true, eintraege: leseUebersichtsseiteSchlechteLinks(html) };
  } catch (e) {
    return { ok: false, fehler: `${dokId}: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// Lädt und parst ALLE neun Übersichtsseiten (siehe DOK_IDS), Fortschritts-
// meldung und Abbruchprüfung je Seite inklusive. Ausgelagert aus
// erstelleLandesrechtBWImportindexNeu, um dessen Cognitive Complexity zu senken –
// bündelt die komplette Schleife (nicht nur den Einzelschritt
// ladeUebersichtsseite), weil sonst Schleife+Abbruchprüfung+Fehlerzweig in
// der Hauptfunktion erhalten blieben.
async function ladeAlleUebersichtsseiten(
  banner: ProzessBanner,
  nativeBefehle: Befehlsaufruf,
): Promise<
  | { status: 'ok'; eintraege: ImportindexEintrag[] }
  | { status: 'fehler'; fehler: string }
  | { status: 'abgebrochen' }
> {
  if (banner.pruefeAbbruch()) return { status: 'abgebrochen' };
  const erreichbarkeit = await pruefeErreichbarkeit(LANDESRECHT_BW_URL);
  if (erreichbarkeit.fehler) return { status: 'fehler', fehler: erreichbarkeit.fehler };

  const eintraege: ImportindexEintrag[] = [];

  for (const [i, dokId] of DOK_IDS.entries()) {
    if (banner.pruefeAbbruch()) return { status: 'abgebrochen' };

    banner.fortschritt(
      `Importindex Landesrecht BW: Datei ${i + 1}/${DOK_IDS.length} analysieren …`,
    );

    const ergebnis = await ladeUebersichtsseite(dokId, nativeBefehle);
    if (!ergebnis.ok) return { status: 'fehler', fehler: ergebnis.fehler };
    eintraege.push(...ergebnis.eintraege);
  }

  return { status: 'ok', eintraege };
}

// Lädt den guten Permalink (perma?j=...) für EINEN Kandidaten nach und
// mutiert dessen abrufkennung/permalinkArt (siehe Kommentar zum Nachladen in
// erstelleLandesrechtBWImportindexNeu) – ausgelagert aus derselben, um deren
// Cognitive Complexity zu senken.
async function ladeGutenPermalinkFuerEintrag(
  eintrag: ImportindexEintrag,
  nativeBefehle: Befehlsaufruf,
): Promise<void> {
  try {
    const html = await nativeBefehle('lade_landesrecht_dokumentseite', {
      url: eintrag.abrufkennung,
    });
    const guterLink = leseGuterPermalink(html);
    if (guterLink) {
      eintrag.abrufkennung = guterLink;
    } else {
      eintrag.permalinkArt = 'schlecht';
    }
  } catch {
    eintrag.permalinkArt = 'schlecht';
  }
}

// Lädt den guten Permalink für ALLE `neueEintraege` nach (Drosselung siehe
// ladeDrosselung.ts), inklusive Fortschrittsmeldung und Abbruchprüfung je
// Eintrag. Ausgelagert aus erstelleLandesrechtBWImportindexNeu, um dessen
// Cognitive Complexity zu senken – mutiert `neueEintraege` in-place (wie
// zuvor inline), meldet nur noch zurück, ob abgebrochen wurde.
async function ladeAllePermalinks(
  neueEintraege: ImportindexEintrag[],
  banner: ProzessBanner,
  nativeBefehle: Befehlsaufruf,
): Promise<{ abgebrochen: boolean }> {
  for (const [i, eintrag] of neueEintraege.entries()) {
    if (banner.pruefeAbbruch()) return { abgebrochen: true };

    const n = i + 1;
    const verzoegerungMs = berechneVerzoegerungMs(n);
    if (verzoegerungMs > 0) {
      banner.fortschritt(
        `Importindex Landesrecht BW: Permalink ${n}/${neueEintraege.length} – kurze Pause (${(verzoegerungMs / 1000).toFixed(1)}s) …`,
      );
      await warte(verzoegerungMs);
      if (banner.pruefeAbbruch()) return { abgebrochen: true };
    }
    banner.fortschritt(
      `Importindex Landesrecht BW: Permalink ${n}/${neueEintraege.length} laden …`,
    );

    await ladeGutenPermalinkFuerEintrag(eintrag, nativeBefehle);
    if (banner.pruefeAbbruch()) return { abgebrochen: true };
  }

  return { abgebrochen: false };
}

// Wendet den Abgleichsplan sowie die Schritte 4-6 (siehe Doku-Kommentar bei
// erstelleLandesrechtBWImportindexNeu) auf das rohe XML an: Ersetzen/Ergänzen,
// "möglicherweise entfernt"-Markierung, Leerzeichen-Korrektur, Neusortierung.
// Reine Funktion (keine I/O) – ausgelagert, um die Cognitive Complexity von
// erstelleLandesrechtBWImportindexNeu zu senken; exportiert für den kolokierten
// Test.
interface AbgleichAufXmlErgebnis {
  xml: string;
  geaendert: boolean;
  ersetzt: { anzahl: number };
  ergaenzt: { anzahl: number };
  entfernungsMarkierung: { markiert: number; entmarkiert: number };
  leerzeichenKorrigiert: { anzahl: number };
  neuSortiert: { geaendert: boolean };
}

function wendeAbgleichAufXmlAn(
  xmlEingang: string,
  neueEintraege: ImportindexEintrag[],
  bestehende: ImportindexEintrag[],
  sortiert: ImportindexEintrag[],
  heute: string,
): AbgleichAufXmlErgebnis {
  let xml = xmlEingang;
  let geaendert = false;

  // Schritt 3: Ersetzen-/Ergänzen-Plan erstellen und anwenden. Nur
  // Kandidaten mit erfolgreich geladenem gutem Permalink einbeziehen –
  // ohne verlässlichen Link ist kein sicherer Abgleich möglich (siehe
  // Kommentar oben beim Permalink-Nachladen).
  const erfolgreicheKandidaten = neueEintraege.filter((e) => e.permalinkArt !== 'schlecht');
  const plan = erstelleAbgleichsplan(erfolgreicheKandidaten, bestehende, sortiert);

  const ersetzt = wendeErsetzungenAn(xml, plan.ersetzen);
  xml = ersetzt.xml;
  if (ersetzt.anzahl > 0) geaendert = true;

  const ergaenzt = fuegeNeueEintraegeEin(xml, plan.ergaenzen);
  xml = ergaenzt.xml;
  if (ergaenzt.anzahl > 0) geaendert = true;

  // Schritt 4: bestehende Einträge, die weder ersetzt noch anderweitig
  // bestätigt wurden und auf den Seiten nirgends mehr auftauchen, als
  // "möglicherweise entfernt" markieren (bzw. bei Wiederauftauchen
  // automatisch entmarkieren).
  const ausgenommen = new Set(plan.ersetzen.map((e) => e.alt));
  const entfernungsMarkierung = markiereMoeglicherweiseEntfernt(
    xml,
    bestehende,
    sortiert,
    ausgenommen,
    heute,
  );
  xml = entfernungsMarkierung.xml;
  if (entfernungsMarkierung.markiert > 0 || entfernungsMarkierung.entmarkiert > 0) geaendert = true;

  // Schritt 5: einzelne Fehl-Leerzeichen korrigieren – bewusst ERST HIER
  // (nach Schritt 3/4, siehe Kommentar bei korrigiereLeerzeichenFehler in
  // importindexErstellungBW.abgleich.ts).
  const leerzeichenKorrigiert = korrigiereLeerzeichenFehler(sortiert, bestehende, xml);
  if (leerzeichenKorrigiert.anzahl > 0) {
    xml = leerzeichenKorrigiert.xml;
    geaendert = true;
  }

  // Schritt 6: vollständige Neusortierung (abrufkennung -> kurztitel -> bwZusatz).
  // Läuft IMMER, auch wenn die Schritte 3/4/5 nichts geändert haben – neue
  // Einträge landeten bisher innerhalb einer Abrufkennungsgruppe nur in
  // Scraping-Reihenfolge (siehe fuegeNeueEintraegeEin), nicht nach
  // Kurztitel/bwZusatz sortiert.
  const neuSortiert = sortiereImportindex(xml);
  xml = neuSortiert.xml;
  if (neuSortiert.geaendert) geaendert = true;

  return {
    xml,
    geaendert,
    ersetzt,
    ergaenzt,
    entfernungsMarkierung,
    leerzeichenKorrigiert,
    neuSortiert,
  };
}

// Reine Zusammensetzung der Abschlussmeldung aus den Ergebniszahlen des
// Laufs (siehe Schritte 3-6 in erstelleLandesrechtBWImportindexNeu) – ausgelagert,
// um deren Cognitive Complexity zu senken; exportiert für den kolokierten
// Test.
export interface ErgebnistextParams {
  geaendert: boolean;
  ersetztAnzahl: number;
  ergaenztAnzahl: number;
  permalinkFehlgeschlagen: number;
  leerzeichenKorrigiertAnzahl: number;
  markiert: number;
  entmarkiert: number;
  reihenfolgeGeaendert: boolean;
}

export function formuliereErgebnistext(p: ErgebnistextParams): string {
  // Wirklich NICHTS zu berichten (weder inhaltliche Änderung noch ein
  // fehlgeschlagener Permalink) -> analog zu erstelleBundesImportindex knapp
  // "keine Änderungen" statt der sonst irreführenden Aufzählung aus
  // lauter Nullen ("0 Gesetze aktualisiert, 0 hinzugefügt, 0 Permalinks
  // fehlgeschlagen.", siehe Bugreport).
  if (!p.geaendert && p.permalinkFehlgeschlagen === 0) {
    return 'Importindex Landesrecht BW geprüft: keine Änderungen.';
  }

  const teile = [
    p.ersetztAnzahl === 1 ? '1 Gesetz aktualisiert' : `${p.ersetztAnzahl} Gesetze aktualisiert`,
    p.ergaenztAnzahl === 1 ? '1 hinzugefügt' : `${p.ergaenztAnzahl} hinzugefügt`,
    p.permalinkFehlgeschlagen === 1
      ? '1 Permalink fehlgeschlagen'
      : `${p.permalinkFehlgeschlagen} Permalinks fehlgeschlagen`,
  ];
  let text = `Importindex Landesrecht BW aktualisiert: ${teile.join(', ')}.`;

  if (p.leerzeichenKorrigiertAnzahl > 0) {
    text +=
      p.leerzeichenKorrigiertAnzahl === 1
        ? ' Ein Langtitel korrigiert.'
        : ` ${p.leerzeichenKorrigiertAnzahl} Langtitel korrigiert.`;
  }
  if (p.markiert > 0) {
    text +=
      p.markiert === 1
        ? ' 1 Eintrag als möglicherweise entfernt markiert.'
        : ` ${p.markiert} Einträge als möglicherweise entfernt markiert.`;
  }
  if (p.entmarkiert > 0) {
    text +=
      p.entmarkiert === 1
        ? ' 1 Markierung "möglicherweise entfernt" wieder aufgehoben.'
        : ` ${p.entmarkiert} Markierungen "möglicherweise entfernt" wieder aufgehoben.`;
  }
  if (p.reihenfolgeGeaendert) {
    text += ' Reihenfolge aktualisiert.';
  }
  return text;
}

/**
 * Lädt alle neun Absch-Übersichtsseiten (mit den "schlechten" Links,
 * perma?d=<docId>, siehe leseUebersichtsseiteSchlechteLinks) und gleicht
 * das Ergebnis gegen den bereits in AppData liegenden Importindex ("Importindex
 * Landesrecht BW.xml") ab. Ablauf:
 * 1. Kurz-/Langtitel-Abweichungen gegenüber dem bestehenden Importindex
 *    ermitteln (siehe ermittleNeueEintraege).
 * 2. Für die abweichenden Kandidaten den guten Permalink nachladen (siehe
 *    leseGuterPermalink).
 * 3. Abgleichsplan erstellen (siehe erstelleAbgleichsplan, Prinzip 4.4) und
 *    anwenden: bestehende Einträge, deren alter Titel auf den Seiten
 *    nirgends mehr auftaucht, werden ERSETZT; alles andere wird als
 *    zusätzlicher Eintrag ERGÄNZT.
 * 4. Bestehende Einträge, die in diesem Lauf nicht ersetzt wurden und
 *    deren Titel auf den Seiten nirgends mehr auftaucht, werden mit
 *    `moeglicherweiseEntfernt` markiert (bzw. bei Wiederauftauchen
 *    automatisch entmarkiert) – siehe markiereMoeglicherweiseEntfernt.
 * 5. Unwesentliche Langtitel-Abweichungen (einzelne Fehl-Leerzeichen)
 *    direkt im bestehenden Importindex korrigieren (siehe
 *    korrigiereLeerzeichenFehler) – bewusst ERST NACH Schritt 3/4: diese
 *    suchen Blöcke anhand des noch unkorrigierten Langtitels aus
 *    `bestehende`, eine vorherige Korrektur des Texts in `xml` könnte diese
 *    Suche sonst (in seltenen Fällen) ins Leere laufen lassen, siehe
 *    Kommentar bei korrigiereLeerzeichenFehler in
 *    importindexErstellungBW.abgleich.ts.
 * 6. Die komplette Datei wird nach `abrufkennung` -> `kurztitel` -> `bwZusatz`
 *    neu sortiert (siehe sortiereImportindex) – unabhängig davon, ob die
 *    Schritte 3/4/5 überhaupt etwas geändert haben, damit neu ergänzte
 *    Einträge nicht nur in Scraping-Reihenfolge am Ende ihrer Abrufkennungsgruppe
 *    landen.
 * Vor jeder inhaltlichen Änderung wird der bisherige Dateiinhalt als
 * BACKUP_DATEINAME gesichert. Geschrieben (zumindest der <verarbeitungszeit>-
 * Zeitstempel aufgefrischt, siehe speichereImportindexAktualisierung) wird IMMER,
 * auch wenn dieser Lauf inhaltlich nichts geändert hat – analog zu
 * erstelleBundesImportindex, damit "zuletzt geprüft am" im ImportindexOverlay auch bei
 * einem ergebnislosen Lauf stimmt.
 */
export async function erstelleLandesrechtBWImportindexNeu(): Promise<ImportindexErstellungErgebnis> {
  return mitImportindexVorgang(
    KATEGORIE,
    'Importindex Landesrecht BW aktualisieren …',
    async (banner) => {
      const uebersicht = await ladeAlleUebersichtsseiten(banner, rufeBefehl);
      if (uebersicht.status === 'abgebrochen') return { erfolg: false, fehler: 'Abgebrochen.' };
      if (uebersicht.status === 'fehler') {
        banner.abschliessen(
          `Importindex-Aktualisierung fehlgeschlagen: ${uebersicht.fehler}`,
          'fehler',
        );
        return { erfolg: false, fehler: uebersicht.fehler };
      }
      const eintraege = uebersicht.eintraege;

      // permalinkEindeutig=false: bei landesrecht-bw.de kann ein Permalink
      // mehrere gültige Fassungen haben (siehe importindexErstellung.ts) – nur
      // exakte Duplikate (Regel 1) werden hier bereinigt, alles andere bleibt
      // erhalten und wird ggf. weiter unten (Schritt 3/4) einzeln behandelt.
      const sortiert = sortiereUndMarkiereDuplikate(eintraege, korrigiereKurztitel, false);

      const fehlerLeer = pruefeNichtLeer(sortiert, 'landesrecht-bw.de');
      if (fehlerLeer) {
        banner.abschliessen(`Importindex-Aktualisierung fehlgeschlagen: ${fehlerLeer}`, 'fehler');
        return { erfolg: false, fehler: fehlerLeer };
      }

      const basis = await leseImportindexAbgleichsSnapshot(NORMGEBER_DE_BW);
      if (banner.pruefeAbbruch()) return { erfolg: false, fehler: 'Abgebrochen.' };
      const bestehende = parseImportindex(basis.xml);

      const neueEintraege = ermittleNeueEintraege(sortiert, bestehende);

      // Schritt 3: guten Permalink (perma?j=...) für jedes tatsächlich
      // neue/abweichende Gesetz nachladen (siehe leseGuterPermalink) – bewusst
      // erst HIER (nach dem Filtern), nicht für alle Kandidaten aus der
      // Übersicht: die weit überwiegende Mehrheit ist bereits bekannt und
      // würde sonst unnötig ein eigenes WebView-Fenster bekommen. Sequenziell
      // mit wachsender Pause (siehe ladeDrosselung.ts), um landesrecht-bw.de
      // bei größeren Läufen nicht zu überlasten. Schlägt das Nachladen für
      // ein Gesetz fehl (Timeout, Selector fehlt), bleibt der ursprüngliche
      // "schlechte" Permalink als Fallback erhalten, markiert mit
      // `permalinkArt: 'schlecht'` – dieser Kandidat wird dann in Schritt 3
      // nicht automatisch verarbeitet (kein verlässlicher Link zum
      // Abgleichen), bricht aber NICHT den gesamten Lauf ab.
      const permalinkLauf = await ladeAllePermalinks(neueEintraege, banner, rufeBefehl);
      if (permalinkLauf.abgebrochen) return { erfolg: false, fehler: 'Abgebrochen.' };

      if (banner.pruefeAbbruch()) return { erfolg: false, fehler: 'Abgebrochen.' };

      // Schritte 3-6 (Ersetzen/Ergänzen, "möglicherweise entfernt"-Markierung,
      // Leerzeichen-Korrektur, Neusortierung) – siehe wendeAbgleichAufXmlAn.
      const heute = new Date().toISOString().slice(0, 10);
      const {
        xml,
        geaendert,
        ersetzt,
        ergaenzt,
        entfernungsMarkierung,
        leerzeichenKorrigiert,
        neuSortiert,
      } = wendeAbgleichAufXmlAn(basis.xml, neueEintraege, bestehende, sortiert, heute);

      // Schreiben (bzw. bei inhaltlich unverändertem Lauf nur den
      // <verarbeitungszeit>-Zeitstempel auffrischen, siehe speichereImportindexAktualisierung)
      // läuft IMMER, analog zu erstelleBundesImportindex – damit "zuletzt geprüft
      // am" im ImportindexOverlay auch nach einem ergebnislosen Lauf stimmt. Eine
      // Sicherung als BACKUP_DATEINAME erfolgt dagegen nur bei tatsächlicher
      // inhaltlicher Änderung: ein reiner Zeitstempel-Refresh verändert den
      // gesicherten Inhalt nicht, eine Sicherung wäre dort ohne Nutzen.
      try {
        await speichereImportindexAktualisierung(NORMGEBER_DE_BW, xml, {
          sichereVorherigeVersion: geaendert,
          erwarteterBestand: basis.bestand,
          pruefeAbbruch: () => banner.pruefeAbbruch(),
          beginneSpeichern: () => banner.beginneSpeichern('Importindex Landesrecht BW speichern …'),
        });
      } catch (e) {
        if (banner.pruefeAbbruch()) return { erfolg: false, fehler: 'Abgebrochen.' };
        const fehler = `Schreiben fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`;
        banner.abschliessen(`Importindex-Aktualisierung fehlgeschlagen: ${fehler}`, 'fehler');
        return { erfolg: false, fehler };
      }

      const permalinkFehlgeschlagen = neueEintraege.filter(
        (e) => e.permalinkArt === 'schlecht',
      ).length;

      const text = formuliereErgebnistext({
        geaendert,
        ersetztAnzahl: ersetzt.anzahl,
        ergaenztAnzahl: ergaenzt.anzahl,
        permalinkFehlgeschlagen,
        leerzeichenKorrigiertAnzahl: leerzeichenKorrigiert.anzahl,
        markiert: entfernungsMarkierung.markiert,
        entmarkiert: entfernungsMarkierung.entmarkiert,
        reihenfolgeGeaendert: neuSortiert.geaendert,
      });
      banner.abschliessen(text);
      return { erfolg: true, anzahl: ersetzt.anzahl + ergaenzt.anzahl };
    },
  );
}
