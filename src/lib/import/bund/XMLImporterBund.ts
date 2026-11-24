// XMLImporterBund.ts
// Schritt 1: Bundesjustizamt-XML → unser GesetzesXML.
// Kein Zwischenmodell – direkt DOM-Traversal → XML-String.
// Übersetzung von GesetzesXMLImporter.swift
//
// Verwendet den browser-nativen DOMParser (in Tauri WebView verfügbar).

import { NORMGEBER_DE_BUND } from '@/lib/domain/normgeber';
import type { GesetzInfosFuerXML } from '@/lib/domain/gesetzInfos';

import {
  GliederungsebenenErmittler,
  ebeneAusGliederungskennzahl,
  type ImpAbsatz,
  normalisiereBezeichnung,
  baueGesetzesXML,
  type GesammelteNorm,
  type ImportErgebnis,
} from '@/lib/import/basis/basis.index';
import { parseP } from '@/lib/import/bund/parseP';

// ---------------------------------------------------------------------------
// Öffentliche Schnittstelle
// ---------------------------------------------------------------------------

/**
 * Importiert eine Bundesjustizamt-XML-Datei und gibt unser GesetzesXML zurück.
 * @param xmlString  Inhalt der heruntergeladenen XML-Datei als String
 * @param datenquellenname     Optionaler Anzeigename der Datenquelle
 * @param kurztitelOverride  Falls gesetzt, wird dieser Wert statt des aus der
 *   Quelle abgeleiteten Kurztitels (jurabk) verwendet – z.B. der exakt
 *   geschriebene Kurztitel aus "de-bund.xml" beim Internet-Import
 *   (siehe importindexSuche.ts).
 */
export function importiereBundXML(
  xmlString: string,
  datenquellenname?: string,
  kurztitelOverride?: string,
): ImportErgebnis {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');

  // Defensiver Guard: ein echter Browser-DOMParser liefert bei fehlerhaftem
  // XML laut Spezifikation immer ein <parsererror>-Element statt null
  // (siehe unten), aber bei einer wirklich leeren/abgeschnittenen Datei
  // (z.B. durch einen fehlgeschlagenen Download) ist documentElement===null
  // nicht auszuschließen – ohne diesen Guard würde importiere() dort mit
  // einer unklaren TypeError abstürzen statt einer verständlichen Meldung.
  if (!doc.documentElement) {
    return { fehler: 'XML-Fehler: leeres oder ungültiges Dokument' };
  }

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    return { fehler: `XML-Fehler: ${parseError.textContent?.trim()}` };
  }

  return new XMLImporterBund().importiere(doc, datenquellenname, kurztitelOverride);
}

// ---------------------------------------------------------------------------
// Haupt-Importer-Klasse
// ---------------------------------------------------------------------------

function datenquelleMitName(name: string | undefined): GesetzInfosFuerXML['datenquelle'] {
  return name === undefined ? undefined : { name };
}

class XMLImporterBund {
  /** Liest die Gesetz-Metadaten aus der "ersten Norm" (deren doknr dem
   *  Root-doknr entspricht). datenquellennameParam hat Vorrang vor dem <quelle>-Tag
   *  der Quell-XML (nur wenn datenquellennameParam undefined ist, wird das Tag
   *  gelesen – ein leerer datenquellennameParam-String bleibt bewusst erhalten). */
  private leseGesetzInfosBund(
    meta: Element,
    datenquellennameParam?: string,
  ): Omit<GesetzInfosFuerXML, 'normgeber'> {
    const kurz = meta.querySelector('jurabk')?.textContent?.trim() ?? '';
    const lang = meta.querySelector('langue')?.textContent?.trim() ?? '';

    const periodikum = meta.querySelector('periodikum')?.textContent?.trim() ?? '';
    const zitstelle = meta.querySelector('zitstelle')?.textContent?.trim() ?? '';
    const fundstelle = [periodikum, zitstelle].filter(Boolean).join(' ');

    const ausfertigung = meta.querySelector('ausfertigung-datum')?.textContent?.trim() ?? '';

    let aenderungsvermerk = '';
    let neugefasst = '';
    for (const standEl of Array.from(meta.querySelectorAll('standangabe'))) {
      const typ = standEl.querySelector('standtyp')?.textContent?.trim() ?? '';
      const kommentar = standEl.querySelector('standkommentar')?.textContent?.trim() ?? '';
      if (typ === 'Stand') aenderungsvermerk = kommentar;
      else if (typ === 'Neuf') neugefasst = kommentar;
    }

    let datenquellenname = datenquellennameParam;
    if (datenquellenname === undefined) {
      const q = meta.querySelector('quelle')?.textContent?.trim();
      if (q) datenquellenname = q;
    }

    // Liest das <importtime>-Tag der Bundesjustizamt-Quell-XML (deren
    // Schema, nicht umbenannt) – unser eigenes kanonisches Tag heißt
    // <verarbeitungszeit> (siehe gesetzesXMLBauer.ts).
    let verarbeitungszeit: Date | undefined;
    const importtimeText = meta.querySelector('importtime')?.textContent?.trim();
    if (importtimeText) verarbeitungszeit = new Date(importtimeText);

    return {
      kurztitel: kurz,
      langtitel: lang,
      fundstelle,
      ausfertigung,
      aenderungsvermerk,
      neugefasst,
      datenquelle: datenquelleMitName(datenquellenname),
      verarbeitungszeit,
    };
  }

  private leseGliederungseinheit(meta: Element): {
    gliederungskennzahl: string;
    bez: string;
    titel: string;
  } {
    const gliederungseinheit = meta.querySelector('gliederungseinheit');
    if (!gliederungseinheit) return { gliederungskennzahl: '', bez: '', titel: '' };
    return {
      gliederungskennzahl:
        gliederungseinheit.querySelector('gliederungskennzahl')?.textContent?.trim() ?? '',
      bez: gliederungseinheit.querySelector('gliederungsbez')?.textContent?.trim() ?? '',
      titel: gliederungseinheit.querySelector('gliederungstitel')?.textContent?.trim() ?? '',
    };
  }

  /** Ermittelt Bezeichnung/Titel einer Norm inkl. Gliederungsartikel-
   *  Erkennung (z.B. Art. 1 im GG): nur relevant, wenn die Norm KEINE eigene
   *  Bezeichnung (enbez) hat – sonst ist es ein Paragraph innerhalb eines
   *  Gliederungsartikels (z.B. §§ innerhalb von Art. im EGBGB). */
  private ermittleBezeichnungUndTitel(
    meta: Element,
    gliederungsbez: string,
    gliederungstitel: string,
  ): { bezeichnung: string; titel: string; istGliederungsartikel: boolean } {
    // 'enbez' hier ist das Tag der Bundesjustizamt-Quell-XML (externes
    // Format, nicht umbenannt) – intern heißt der Wert ab hier bezeichnung.
    let bezeichnung = normalisiereBezeichnung(
      meta.querySelector('enbez')?.textContent?.trim() ?? '',
    );
    let titel = meta.querySelector('titel')?.textContent?.trim() ?? '';
    let istGliederungsartikel = false;

    if (gliederungsbez && !bezeichnung) {
      const bez = normalisiereBezeichnung(gliederungsbez);
      if (bez.startsWith('Art.') || bez.startsWith('§')) {
        bezeichnung = bez;
        titel = gliederungstitel;
        istGliederungsartikel = true;
      }
    }

    return { bezeichnung, titel, istGliederungsartikel };
  }

  private parseAbsaetze(normEl: Element): ImpAbsatz[] {
    // Fußnoten enthalten ebenfalls Content, sind aber kein Regelungstext.
    const contentEl =
      normEl.querySelector('textdaten > text > Content') ??
      normEl.querySelector(':scope > Content');
    const absaetze: ImpAbsatz[] = [];
    if (!contentEl) return absaetze;

    for (const child of Array.from(contentEl.childNodes)) {
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const el = child as Element;
      const tag = el.tagName.toUpperCase();
      // noindex-Elemente überspringen (wie in Swift)
      if (tag === 'NOINDEX') continue;
      if (tag === 'P') {
        const abs = parseP(el);
        if (abs) absaetze.push(abs);
      }
    }
    return absaetze;
  }

  private ermittleQuellIdBasis(
    istDokumentkopf: boolean,
    quellId: string,
    ersatzNummer: number,
  ): string | undefined {
    return istDokumentkopf ? undefined : quellId.trim() || `bund-text-${ersatzNummer}`;
  }

  /** Klassifiziert eine Norm in einen der drei Zweige (Gliederungsartikel /
   *  normale Norm / reine Gliederung) und baut den passenden GesammelteNorm-
   *  Eintrag. ebenenErmittler.ermittleEbene() ist zustandsbehaftet (interner
   *  Stack über die gesamte Iteration) – wird hier wie im Original NUR in
   *  Zweig 1 und Zweig 3 aufgerufen, nie in Zweig 2 (normale Norm). */
  private klassifiziereNorm(p: {
    istGliederungsartikel: boolean;
    bezeichnung: string;
    quellIdBasis?: string;
    titel: string;
    gliederungsbez: string;
    gliederungskennzahl: string;
    gliederungstitel: string;
    istInhaltsUebersicht: boolean;
    absaetze: ImpAbsatz[];
    fussnoten?: string;
    ebenenErmittler: GliederungsebenenErmittler;
  }): { norm: GesammelteNorm | null; istGliederungsartikel: boolean } {
    const idBasis =
      !p.bezeichnung && !p.gliederungsbez && p.absaetze.length > 0 ? p.quellIdBasis : undefined;
    if (p.istGliederungsartikel && p.bezeichnung) {
      const ebene = p.gliederungskennzahl
        ? ebeneAusGliederungskennzahl(p.gliederungskennzahl)
        : p.ebenenErmittler.ermittleEbene(p.gliederungsbez);
      return {
        istGliederungsartikel: true,
        norm: {
          type: 'gliederung',
          bez: p.gliederungsbez,
          titel: p.titel || undefined,
          ebene,
          gliederungskennzahl: p.gliederungskennzahl,
          normBezeichnung: p.bezeichnung,
          absaetze: p.absaetze,
          fussnoten: p.fussnoten,
        },
      };
    }
    if ((p.bezeichnung || idBasis) && !p.istInhaltsUebersicht) {
      return {
        istGliederungsartikel: false,
        norm: {
          type: 'paragraph',
          bez: '',
          titel: p.titel || undefined,
          ebene: 0,
          gliederungskennzahl: '',
          normBezeichnung: p.bezeichnung,
          idBasis,
          absaetze: p.absaetze,
          fussnoten: p.fussnoten,
        },
      };
    }
    if (p.gliederungsbez) {
      const ebene = p.gliederungskennzahl
        ? ebeneAusGliederungskennzahl(p.gliederungskennzahl)
        : p.ebenenErmittler.ermittleEbene(p.gliederungsbez);
      return {
        istGliederungsartikel: false,
        norm: {
          type: 'gliederung',
          bez: p.gliederungsbez,
          titel: p.gliederungstitel || undefined,
          ebene,
          gliederungskennzahl: p.gliederungskennzahl,
          normBezeichnung: undefined,
          absaetze: [],
          fussnoten: p.fussnoten,
        },
      };
    }
    return { norm: null, istGliederungsartikel: false };
  }

  importiere(doc: Document, datenquellenname?: string, kurztitelOverride?: string): ImportErgebnis {
    const docEl = doc.documentElement;
    const docDoknr = docEl.getAttribute('doknr') ?? '';

    const ebenenErmittler = new GliederungsebenenErmittler();
    const gesammelteNormen: GesammelteNorm[] = [];

    let gesetzKurz = '';
    let gesetzLang = '';
    let gesetzFundstelle = '';
    let gesetzAusfertigung = '';
    let gesetzAenderungsvermerk = '';
    let gesetzNeugefasst = '';
    let gesetzDatenquelle: GesetzInfosFuerXML['datenquelle'] = datenquelleMitName(datenquellenname);
    let gesetzVerarbeitungszeit: Date | undefined;
    let hatGliederungsartikel = false;

    const normen = Array.from(doc.querySelectorAll('norm'));

    for (const normEl of normen) {
      const normDoknr = normEl.getAttribute('doknr') ?? '';
      const istErsteNorm = normDoknr === docDoknr;

      const meta = normEl.querySelector('metadaten');
      if (!meta) continue;

      // --- Gesetz-Metadaten (nur aus der ersten Norm) ---
      if (istErsteNorm) {
        const infos = this.leseGesetzInfosBund(meta, datenquellenname);
        gesetzKurz = infos.kurztitel;
        gesetzLang = infos.langtitel;
        if (infos.fundstelle) gesetzFundstelle = infos.fundstelle;
        gesetzAusfertigung = infos.ausfertigung ?? '';
        gesetzAenderungsvermerk = infos.aenderungsvermerk ?? '';
        gesetzNeugefasst = infos.neugefasst ?? '';
        gesetzDatenquelle = infos.datenquelle;
        gesetzVerarbeitungszeit = infos.verarbeitungszeit;
      }

      // --- Gliederungseinheit ---
      const gliederung = this.leseGliederungseinheit(meta);

      // --- Bezeichnung/Titel inkl. Gliederungsartikel-Erkennung ---
      const {
        bezeichnung: currentBezeichnung,
        titel: currentTitel,
        istGliederungsartikel: currentIstGliederungsartikel,
      } = this.ermittleBezeichnungUndTitel(meta, gliederung.bez, gliederung.titel);

      // --- Content parsen ---
      const absaetze = this.parseAbsaetze(normEl);

      // --- Fußnoten ---
      const fussnotenEl = normEl.querySelector('fussnoten');
      const fussnoten = fussnotenEl?.textContent?.trim() || undefined;

      // --- Inhaltsübersicht überspringen ---
      const istInhaltsUebersicht = currentBezeichnung.trim().toLowerCase() === 'inhaltsübersicht';

      // --- Norm klassifizieren ---
      const klassifiziert = this.klassifiziereNorm({
        istGliederungsartikel: currentIstGliederungsartikel,
        bezeichnung: currentBezeichnung,
        // Ein alleiniger Dokumentkopf darf auch Regelungstext tragen. Weitere Textträger dürfen
        // auch nach dem Entfernen des Quellplatzhalters (XXXX) erhalten bleiben.
        quellIdBasis: this.ermittleQuellIdBasis(
          istErsteNorm && normen.length !== 1,
          normDoknr,
          gesammelteNormen.length + 1,
        ),
        titel: currentTitel,
        gliederungsbez: gliederung.bez,
        gliederungskennzahl: gliederung.gliederungskennzahl,
        gliederungstitel: gliederung.titel,
        istInhaltsUebersicht,
        absaetze,
        fussnoten,
        ebenenErmittler,
      });
      if (klassifiziert.istGliederungsartikel) hatGliederungsartikel = true;
      if (klassifiziert.norm) gesammelteNormen.push(klassifiziert.norm);
    }

    if (!gesetzKurz && !gesetzLang) {
      return { fehler: 'Keine Gesetz-Metadaten gefunden' };
    }

    const finalerKurztitel = kurztitelOverride ?? gesetzKurz;

    // --- XML aufbauen (gemeinsame Serialisierung, siehe gesetzesXMLBauer.ts) ---
    const xmlString = baueGesetzesXML(
      {
        kurztitel: finalerKurztitel,
        langtitel: gesetzLang,
        fundstelle: gesetzFundstelle || undefined,
        ausfertigung: gesetzAusfertigung || undefined,
        aenderungsvermerk: gesetzAenderungsvermerk || undefined,
        neugefasst: gesetzNeugefasst || undefined,
        datenquelle: gesetzDatenquelle,
        normgeber: NORMGEBER_DE_BUND,
        verarbeitungszeit: gesetzVerarbeitungszeit,
        hatGliederungsartikel,
      },
      gesammelteNormen,
    );

    return {
      xmlString,
      kurztitel: finalerKurztitel,
      langtitel: gesetzLang,
      aenderungsvermerk: gesetzAenderungsvermerk || undefined,
    };
  }
}
