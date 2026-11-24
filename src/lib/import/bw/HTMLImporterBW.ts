// Importiert BW-HTML; Eingabelesen liegt in HTMLImporterBW.lesen.ts.
// Landesrecht Baden-Württemberg (landesrecht-bw.de) → unser GesetzesXML.
// Quelle ist die "Gesamtausgabe"-HTML-Seite (juris.de-Portal),
// nicht das BJA-Schema – daher ein eigener Importer statt Wiederverwendung
// von bund/XMLImporterBund.ts. Serialisierung (gesetzesXMLBauer.ts,
// xmlSerialisierung.ts inkl. Satztokenizer) wird unverändert mitgenutzt,
// ebenso das ImpEintrag/ImpElement-Datenmodell aus importTextstruktur.ts (dieselbe
// Struktur, die auch der Bund-Importer für <DL>/<DT>/<DD>-Listen nutzt).
//
// Verwendet den browser-nativen DOMParser (in Tauri WebView verfügbar),
// exakt wie der Bund-Importer.
//
// Gliederungstiefe ist NICHT fix: manche Gesetze haben Teil+Abschnitt+§
// (3 Heading-Ebenen: h4/h5/h6), andere nur Abschnitt+§ (2 Ebenen: h4/h5,
// kein h6). Die Zuordnung Tag→Rolle wird daher pro Dokument ermittelt
// (ermittleNormTagUndGliederungsEbenen): das tiefste tatsächlich verwendete
// Heading-Tag ist immer die Norm-Ebene (§), alle darüber liegenden Tags sind
// Gliederungsebenen in Erscheinungsreihenfolge.
// ANNAHME (unverifiziert, da bisher nur an einem Gesetz mit 2 Ebenen
// getestet): Diese Tiefste-Tag-ist-§-Regel gilt auch bei 3 Ebenen. Falls ein
// BW-Gesetz auffällt, bei dem das nicht stimmt, bitte mit Beispiel-HTML
// melden.
//
// Aufzählungslisten (<dl><dt>...</dt><dd><p>...</p></dd></dl>, ggf. mit
// verschachtelten <dl> innerhalb eines <dd>) werden strukturell erkannt und
// in ImpEintrag[] überführt (leseDLBW/leseDDBW) – nicht mehr als einzelne,
// unabhängige Absätze über eine flache querySelectorAll('p')-Suche.
//
// Bekannte Einschränkung (v1): Tabellen innerhalb des Gesetzestexts (z. B.
// Gebührenverzeichnisse in Anlagen) werden bewusst nicht aufgelöst – alle
// Elemente innerhalb eines <table> werden übersprungen. Das betrifft in der
// Praxis nur einzelne Anlagen, nicht den eigentlichen Normtext.

import { normalisiereWS } from '@/lib/utils/leerraum';
import { GliederungskennzahlVergabe } from '@/lib/domain/gliederungskennzahl';
import { NORMGEBER_DE_BW } from '@/lib/domain/normgeber';
import {
  istInhaltsUeberschrift,
  istNormUeberschrift,
  ermittleGliederungsTags,
  leseHeadingSegmente,
  lesePText,
  istReinerPermalinkAbsatz,
  baueAbsatzAusText,
  leseDLBW,
  sammleBloecke,
  type Block,
} from './HTMLImporterBW.lesen';
import type { GesetzInfosFuerXML } from '@/lib/domain/gesetzInfos';

import {
  type ImpAbsatz,
  normalisiereBezeichnung,
  baueGesetzesXML,
  type GesammelteNorm,
  type ImportErgebnis,
} from '@/lib/import/basis/basis.index';

// ---------------------------------------------------------------------------
// Öffentliche Schnittstelle
// ---------------------------------------------------------------------------

/** Anzeigename der digitalen Datenquelle im GesetzesXML; die Zuordnung zum
 *  Normgeber erfolgt unabhängig davon. Hier für die Import-Aufrufer re-exportiert. */
export { LANDESRECHT_BW_QUELLE } from '@/lib/persistenz/gesetz/gesetz.index';
import { LANDESRECHT_BW_QUELLE } from '@/lib/persistenz/gesetz/gesetz.index';

/**
 * Importiert die HTML-Gesamtausgabe eines BW-Gesetzes und gibt unser
 * GesetzesXML zurück.
 * @param htmlString  Inhalt der heruntergeladenen/ausgewählten HTML-Datei
 * @param datenquellenname      Optionaler Anzeigename der Datenquelle
 * @param satztokenisierungAktiv  Nur zu Diagnosezwecken: bei `false` wird die
 *   Satztokenisierung übersprungen (jeder Absatz/Listeneintrag bleibt als ein
 *   einziger Text erhalten), um den Rohimport ohne Tokenizer-Einfluss zu
 *   prüfen. Default `true` (Normalbetrieb).
 * @param kurztitelOverride  Falls gesetzt, wird dieser Wert statt des aus dem
 *   Seitentitel abgeleiteten Kurztitels verwendet – z.B. der exakt
 *   geschriebene Kurztitel aus "de-bw.xml" beim
 *   Internet-Import (siehe importindexSuche.ts).
 */
export function importiereGesetzHTMLBW(
  htmlString: string,
  datenquellenname?: string,
  satztokenisierungAktiv: boolean = true,
  kurztitelOverride?: string,
): ImportErgebnis {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  const infos = leseGesetzInfosBW(doc);
  if (!infos) return { fehler: 'Konnte Gesetz-Metadaten (Titel) nicht lesen.' };

  const container = doc.querySelector('.docLayoutText');
  if (!container) return { fehler: 'Konnte den Inhaltsbereich (.docLayoutText) nicht finden.' };

  const gesammelteNormen = leseNormen(container, infos.kurztitel, satztokenisierungAktiv);
  if (gesammelteNormen.length === 0) {
    return { fehler: 'Keine Normen im Dokument gefunden.' };
  }

  const finalerKurztitel = kurztitelOverride ?? infos.kurztitel;

  const xmlString = baueGesetzesXML(
    {
      kurztitel: finalerKurztitel,
      langtitel: infos.langtitel,
      ausfertigung: infos.ausfertigung,
      aenderungsvermerk: infos.aenderungsvermerk,
      datenquelle: { name: datenquellenname ?? LANDESRECHT_BW_QUELLE },
      normgeber: NORMGEBER_DE_BW,
    },
    gesammelteNormen,
  );

  return {
    xmlString,
    kurztitel: finalerKurztitel,
    langtitel: infos.langtitel,
    aenderungsvermerk: infos.aenderungsvermerk,
  };
}

// ---------------------------------------------------------------------------
// GesetzInfos (aus <title> und der Standangaben-Tabelle)
// ---------------------------------------------------------------------------

/**
 * Der <title>-Tag folgt bei landesrecht-bw.de einem festen Schema:
 * "Landesrecht BW -   {Kürzel} | Landesnorm Baden-Württemberg |
 *  Gesamtausgabe | {Langtitel} (Kürzel) vom {Datum} | gültig ab: {Datum}"
 * Das ist deutlich zuverlässiger als die sichtbare Kopftabelle zu parsen.
 */
function leseGesetzInfosBW(doc: Document): Omit<GesetzInfosFuerXML, 'normgeber'> | null {
  const titelText = doc.querySelector('title')?.textContent ?? '';
  const segmente = titelText
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean);
  if (segmente.length < 4) return null;

  const kurztitel = segmente[0]!.replace(/^Landesrecht BW\s*-\s*/i, '').trim();
  if (!kurztitel) return null;

  // segmente[3] z.B. "Gesetz zur Ausführung der Verwaltungsgerichtsordnung (AGVwGO) vom 14. Oktober 2008"
  let langUndDatum = segmente[3]!;
  let ausfertigung: string | undefined;
  const datumMatch = langUndDatum.match(/^(.*)\svom\s+(.+)$/i);
  if (datumMatch) {
    langUndDatum = datumMatch[1]!.trim();
    ausfertigung = datumMatch[2]!.trim();
  }
  // Bei manchen Gesetzen (z.B. GemO) steht die amtliche Abkürzung nicht am
  // Ende, sondern mittendrin, gefolgt von "in der Fassung vom {Datum}".
  // Nach dem Abtrennen von "vom {Datum}" bleibt dann "... in der Fassung"
  // übrig, das ebenfalls nicht zum Langtitel gehört.
  langUndDatum = langUndDatum.replace(/\sin der Fassung\s*$/i, '').trim();

  // Amtliche Abkürzung in Klammern wird nur zum Abtrennen vom Langtitel
  // benötigt, aber nicht mehr separat zurückgegeben (siehe kurztitel,
  // das bereits das maßgebliche Kürzel ist – keine Dopplung).
  const abkMatch = langUndDatum.match(/\(([^()]+)\)\s*$/);
  let langtitel = langUndDatum;
  if (abkMatch) {
    langtitel = langUndDatum.slice(0, abkMatch.index).trim();
  }

  // Stand-Text aus der Standangaben-Tabelle (falls vorhanden)
  let aenderungsvermerk: string | undefined;
  const standZelle = Array.from(doc.querySelectorAll('td.StandangabeStand'));
  for (const zelle of standZelle) {
    const wert = zelle.nextElementSibling?.textContent?.trim();
    if (wert) {
      aenderungsvermerk = normalisiereWS(wert).replace(/^letzte berücksichtigte Änderung:\s*/i, '');
      break;
    }
  }

  return { kurztitel, langtitel, ausfertigung, aenderungsvermerk };
}

// ---------------------------------------------------------------------------
// Heading-Tag → Rolle (Norm vs. Gliederungsebene N)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Normen/Gliederung aus dem Inhaltsbereich lesen
// ---------------------------------------------------------------------------

// Erzeugt eine neue Norm (§, Artikel, Anhang oder Anlage – siehe
// istNormUeberschrift) aus einer bereits als Norm erkannten Heading-Bezeichnung.
function baueNormAusHeading(bez: string, titel: string | undefined): GesammelteNorm {
  const normBezeichnung = normalisiereBezeichnung(bez.replace(/\u00A0/g, ' '));
  return {
    type: 'paragraph',
    bez: '',
    titel,
    ebene: 0,
    gliederungskennzahl: '',
    normBezeichnung,
    absaetze: [],
    // Keine xmlId mehr nötig – id wird zentral in gesetzesXMLBauer.ts aus
    // normBezeichnung berechnet (siehe bezeichnungZuId.ts). Vorher wurde hier
    // eine künstliche "BW_..."-xmlId fabriziert, weil juris.de keine liefert.
  };
}

// Erzeugt eine neue Gliederungsebene (Teil/Abschnitt/...) – Ebene ergibt sich
// aus der Position des Heading-Tags innerhalb der erkannten Gliederungs-Tags,
// die laufende Gliederungskennzahl wird dabei fortgeschrieben (mutiert die Vergabe).
function baueGliederungAusHeading(
  block: Block,
  bez: string,
  titel: string | undefined,
  gliederungsTags: string[],
  vergabe: GliederungskennzahlVergabe,
): GesammelteNorm {
  // block.tag erfüllt hier (istInhaltsUeberschrift && !istNormUeberschrift,
  // beides bereits in verarbeiteHeadingBlock geprüft) exakt das Filterkriterium
  // von ermittleGliederungsTags – der Tag ist daher garantiert enthalten.
  const ebeneIdx = gliederungsTags.indexOf(block.tag!);
  const ebene = ebeneIdx + 1;
  const gliederungskennzahl = vergabe.vergib(ebene);

  return {
    type: 'gliederung',
    bez,
    titel,
    ebene,
    gliederungskennzahl,
    absaetze: [],
    // Keine xmlId mehr nötig – Überschriften werden über ihre
    // gliederungskennzahl identifiziert (siehe gesetzesXMLBauer.ts).
  };
}

// Verarbeitet einen Heading-Block zu einer neuen Norm/Gliederungsebene.
// Gibt null zurück, wenn es sich um keinen echten Inhalts-Heading handelt
// (z.B. "Nichtamtliches Inhaltsverzeichnis") – der Aufrufer behandelt das wie
// bisher als reines Überspringen (aktuelleNorm/offenerAbsatz bleiben unverändert).
function verarbeiteHeadingBlock(
  block: Block,
  gliederungsTags: string[],
  vergabe: GliederungskennzahlVergabe,
): GesammelteNorm | null {
  if (!istInhaltsUeberschrift(block.el)) return null;

  const segmente = leseHeadingSegmente(block.el);
  const bez = segmente[0] ?? '';
  const titel = segmente.slice(1).join(' ') || undefined;

  // Die Rolle wird bewusst am Text entschieden, nicht am Heading-Tag:
  // dasselbe Tag kann im selben Dokument mal Gliederung, mal Norm sein
  // (z.B. h5 = Abschnitt in einem Teil, h5 = § in einem anderen, wenn
  // dort kein Abschnitt dazwischenliegt – siehe GemO §§ 117 ff.).
  if (istNormUeberschrift(bez)) return baueNormAusHeading(bez, titel);
  return baueGliederungAusHeading(block, bez, titel, gliederungsTags, vergabe);
}

// Verarbeitet einen <p>-Block innerhalb der aktuellen Norm; liefert den neuen
// offenerAbsatz (unverändert, falls der Block ignoriert wurde oder an den
// bestehenden Absatz angehängt wurde).
function verarbeitePBlock(
  el: Element,
  satztokenisierungAktiv: boolean,
  aktuelleNorm: GesammelteNorm,
  offenerAbsatz: ImpAbsatz | null,
): ImpAbsatz | null {
  // "Zur Einzelansicht §N"-Permalink-Absätze überspringen: juris.de fügt
  // nach jeder Norm einen eigenen <p> mit ausschließlich einem
  // <a class="doclink">-Link ein. Echte Querverweise im Normtext sind in
  // diesem Format reiner Text, keine Links – daher ist "p besteht nur aus
  // einem a.doclink" ein verlässliches, generelles Filterkriterium.
  if (istReinerPermalinkAbsatz(el)) return offenerAbsatz;

  const text = lesePText(el);
  if (!text) return offenerAbsatz;
  const absatz = baueAbsatzAusText(text, satztokenisierungAktiv);
  if (!absatz) return offenerAbsatz;

  if (absatz.nummer || !offenerAbsatz) {
    // Neuer Absatz: explizite Absatznummer "(n)" ODER noch kein anhängbarer
    // Absatz vorhanden (erster Inhalt der Norm).
    aktuelleNorm.absaetze.push(absatz);
    return absatz;
  }
  // Fortsetzungstext ohne eigene Absatznummer (z.B. Satz nach einer Liste,
  // "zuwiderhandelt." in § 13) – an offenen Absatz anhängen, statt einen
  // neuen (nummernlosen) Absatz zu erzeugen.
  offenerAbsatz.elemente.push(...absatz.elemente);
  return offenerAbsatz;
}

// Verarbeitet einen <dl>-Block innerhalb der aktuellen Norm; liefert den
// neuen offenerAbsatz analog zu verarbeitePBlock.
function verarbeiteDlBlock(
  el: Element,
  aktuelleNorm: GesammelteNorm,
  offenerAbsatz: ImpAbsatz | null,
): ImpAbsatz | null {
  const eintraege = leseDLBW(el);
  if (eintraege.length === 0) return offenerAbsatz;

  if (!offenerAbsatz) {
    // Liste ohne vorangehenden Text (z.B. Liste direkt am Norm-Anfang)
    const neuerAbsatz: ImpAbsatz = { elemente: [{ type: 'liste', eintraege }] };
    aktuelleNorm.absaetze.push(neuerAbsatz);
    return neuerAbsatz;
  }
  offenerAbsatz.elemente.push({ type: 'liste', eintraege });
  return offenerAbsatz;
}

function leseNormen(
  container: Element,
  // Nicht mehr für die id genutzt (siehe gesetzesXMLBauer.ts/bezeichnungZuId.ts,
  // wo die id jetzt zentral aus der bezeichnung berechnet wird) – Parameter
  // bewusst als _kuerzel belassen statt Aufrufer anzupassen, um den Diff
  // klein zu halten; kann bei nächster Gelegenheit ganz entfernt werden.
  _kuerzel: string,
  satztokenisierungAktiv: boolean,
): GesammelteNorm[] {
  const gliederungsTags = ermittleGliederungsTags(container);
  const bloecke = sammleBloecke(container);
  const ergebnis: GesammelteNorm[] = [];

  const vergabe = new GliederungskennzahlVergabe();

  let aktuelleNorm: GesammelteNorm | null = null;
  // Der zuletzt erzeugte Absatz der aktuellen Norm, an den nachfolgende
  // <p>/<dl>-Blöcke ohne eigene "(n)"-Absatznummer angehängt werden (z.B.
  // Listen-Einleitungssatz → <dl> → Fortsetzungssatz nach der Liste, alles
  // Teil desselben Absatzes – siehe § 13 Abs. 1 im FeiertG).
  let offenerAbsatz: ImpAbsatz | null = null;

  for (const block of bloecke) {
    if (block.kind === 'heading') {
      const neueNorm = verarbeiteHeadingBlock(block, gliederungsTags, vergabe);
      if (neueNorm) {
        aktuelleNorm = neueNorm;
        ergebnis.push(neueNorm);
        offenerAbsatz = null;
      }
      continue;
    }

    if (!aktuelleNorm) continue; // <p>/<dl> außerhalb jeder Norm (z.B. Kopfbereich) ignorieren

    if (block.kind === 'p') {
      offenerAbsatz = verarbeitePBlock(
        block.el,
        satztokenisierungAktiv,
        aktuelleNorm,
        offenerAbsatz,
      );
    } else if (block.kind === 'dl') {
      offenerAbsatz = verarbeiteDlBlock(block.el, aktuelleNorm, offenerAbsatz);
    }
  }

  return ergebnis;
}
