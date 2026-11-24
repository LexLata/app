// gesetzesXMLBauer.ts
// Baut aus der gesammelten Normen-/Gliederungsliste den finalen GesetzesXML-String (<gesetz>/<infos>/<inhalt>). Extrahiert aus XMLImporterBund.ts,
// weil HTMLImporterBW.ts (Landesrecht BW) exakt dieselbe Ausgabestruktur
// braucht – zwei echte Aufrufer rechtfertigen die gemeinsame Stelle, damit
// das GesetzesXML-Schema nicht an zwei Stellen gepflegt werden muss.
//
// Format v2 (Formatüberarbeitung): gliederungskennzahl als Attribut statt
// eigener Tag; content→inhalt; lit→litera; absatz[name]→absatz[zahl];
// enbez→bezeichnung (XML-Tag); doknr→id, jetzt aus der bezeichnung/
// normBezeichnung berechnet (siehe bezeichnungZuId.ts); unbezeichnete Texte
// verwenden stattdessen eine interne idBasis. Ansonsten nicht von der Quelle
// übernommen – dadurch braucht auch der BW-HTML-Import (HTMLImporterBW.ts)
// keine künstlichen ids mehr zu erfinden. Gliederungsartikel (z.B. EGBGB)
// werden jetzt wie Normen serialisiert (<norm id="..."
// gliederungskennzahl="...">) statt als <gliederung>-Sonderfall.
//
// GesammelteNorm.normBezeichnung (Norm-/Artikel-Bezeichnung, ehem. enbez) ist
// bewusst anders benannt als GesammelteNorm.bez (Überschriften-Bezeichnung),
// obwohl beide letztlich im <bezeichnung>-Tag landen – die Unterscheidung
// macht klar, für welche Art Element das Feld gilt.

import { normalisiereAusfertigungsdatum } from './ausfertigungsdatum';
import type { GesetzInfosFuerXML } from '@/lib/domain/gesetzInfos';
import { isoZeitstempel } from '@/lib/utils/xmlVerarbeitung';
import { type ImpAbsatz, esc } from '@/lib/import/basis/importTextstruktur';
import { baueText } from '@/lib/import/basis/xmlSerialisierung';
import { IdVergabe } from '@/lib/domain/norm/norm.index';
import { GliederungskennzahlVergabe } from '@/lib/domain/gliederungskennzahl';

export interface GesammelteNorm {
  type: 'gliederung' | 'paragraph';
  bez: string;
  titel?: string;
  ebene: number;
  gliederungskennzahl: string;
  normBezeichnung?: string;
  /** Interne ID-Basis für Quelltexte ohne amtliche Bezeichnung; bleibt unsichtbar. */
  idBasis?: string;
  absaetze: ImpAbsatz[];
  fussnoten?: string;
  /** Nur für EU-Rechtsimport (eu/formexParser.ts): kennzeichnet einen
   *  Erwägungsgrund, der wie eine Norm serialisiert wird (bezeichnung
   *  "E1" usw.), aber mit zusätzlichem typ-Attribut, damit die
   *  Darstellungspipeline ihn später ohne String-Parsing der bezeichnung
   *  unterscheiden kann. Bei Bund/BW immer undefined, daher ohne
   *  Auswirkung auf deren Ausgabe. */
  istErwaegungsgrund?: boolean;
  vorgaenger?: string;
}

function baueFassung(fassung: GesetzInfosFuerXML['fassung']): string[] {
  if (!fassung) return [];
  const { art, stichtag, erwaegungsgruendeErgaenzt } = fassung;
  return [
    `    <fassung art="${art}"${stichtag ? ` stichtag="${esc(stichtag)}"` : ''}${erwaegungsgruendeErgaenzt ? ' erwaegungsgruendeErgaenzt="true"' : ''}/>`,
  ];
}

/** Baut die <infos>-Zeilen aus den GesetzInfos (optionale Felder erscheinen nur,
 *  wenn gesetzt – falsy-Check, nicht nur undefined-Check). Ausgelagert aus
 *  baueGesetzesXML(), um dessen Verzweigungstiefe gering zu halten. */
function baueInfosZeilen(
  infos: GesetzInfosFuerXML,
  isoNow: string,
  isoLetzteNeuerung: string,
): string[] {
  const lines: string[] = [];
  lines.push('  <infos>');
  if (infos.langtitel) lines.push(`    <langtitel>${esc(infos.langtitel)}</langtitel>`);
  if (infos.kurztitel) lines.push(`    <kurztitel>${esc(infos.kurztitel)}</kurztitel>`);
  if (infos.fundstelle) lines.push(`    <fundstelle>${esc(infos.fundstelle)}</fundstelle>`);
  const ausfertigung = normalisiereAusfertigungsdatum(infos.ausfertigung ?? '');
  if (ausfertigung) lines.push(`    <ausfertigung>${esc(ausfertigung)}</ausfertigung>`);
  if (infos.aenderungsvermerk || infos.neugefasst) {
    lines.push('    <stand>');
    if (infos.neugefasst) lines.push(`      <neugefasst>${esc(infos.neugefasst)}</neugefasst>`);
    if (infos.aenderungsvermerk)
      lines.push(`      <aenderungsvermerk>${esc(infos.aenderungsvermerk)}</aenderungsvermerk>`);
    lines.push('    </stand>');
  }
  lines.push(...baueFassung(infos.fassung));
  const datenquelle = infos.datenquelle ?? { name: 'Gesetze im Internet' };
  const name = datenquelle.name !== undefined ? ` name="${esc(datenquelle.name)}"` : '';
  const url = datenquelle.url !== undefined ? ` url="${esc(datenquelle.url)}"` : '';
  lines.push(`    <datenquelle${name}${url}/>`);
  lines.push(`    <normgeber>${infos.normgeber}</normgeber>`);
  lines.push(`    <verarbeitungszeit>${isoNow}</verarbeitungszeit>`);
  lines.push(`    <letzteNeuerung>${isoLetzteNeuerung}</letzteNeuerung>`);
  lines.push('  </infos>');
  return lines;
}

/** Nur der vollständige, geklammerte Wortlaut bezeichnet eine weggefallene Norm. */
export function istWeggefallenWortlaut(wert: string | undefined): boolean {
  return /^\((?:weggefallen|gegenstandslos|aufgehoben|entfallen)\)$/i.test(wert?.trim() ?? '');
}

/** Übernimmt einen ausschließlich aus dem Statuswortlaut bestehenden Text als Titel. */
function normMitStatus(norm: GesammelteNorm): { norm: GesammelteNorm; statusAttr: string } {
  const elemente = norm.absaetze.flatMap((absatz) => absatz.elemente);
  const nurText = elemente.every((element) => element.type === 'texte');
  const wortlaut = nurText
    ? elemente
        .flatMap((element) => (element.type === 'texte' ? element.saetze : []))
        .join(' ')
        .trim()
    : undefined;
  const titelAusText = !norm.titel?.trim() && istWeggefallenWortlaut(wortlaut);
  return {
    norm: titelAusText ? { ...norm, titel: wortlaut, absaetze: [] } : norm,
    statusAttr:
      istWeggefallenWortlaut(norm.titel) || istWeggefallenWortlaut(wortlaut)
        ? ' status="weggefallen"'
        : '',
  };
}

/** Serialisiert eine reine Überschrift (kein normBezeichnung): die
 *  gliederungskennzahl reicht als eindeutiger Identifikator, keine eigene id. */
function baueUeberschriftZeilen(norm: GesammelteNorm, kz: string): string[] {
  const lines: string[] = [];
  lines.push(`    <gliederung gliederungskennzahl="${esc(kz)}">`);
  lines.push(`      <bezeichnung>${esc(norm.bez)}</bezeichnung>`);
  if (norm.titel) lines.push(`      <titel>${esc(norm.titel)}</titel>`);
  if (norm.absaetze.length > 0) lines.push(...baueText(norm.absaetze, '      '));
  if (norm.fussnoten) lines.push(`      <fussnoten>${esc(norm.fussnoten)}</fussnoten>`);
  lines.push('    </gliederung>');
  return lines;
}

/** Serialisiert normale Normen und Gliederungsartikel mit denselben Text-/Statusregeln. */
function baueNormZeilen(
  eingabe: GesammelteNorm,
  id: string,
  gliederungskennzahl?: string,
): string[] {
  const { norm, statusAttr } = normMitStatus(eingabe);
  const lines: string[] = [];
  const gliederungskennzahlAttr = gliederungskennzahl
    ? ` gliederungskennzahl="${esc(gliederungskennzahl)}"`
    : '';
  const typAttr = norm.istErwaegungsgrund ? ' typ="erwaegungsgrund"' : '';
  const vorgaengerAttr =
    norm.vorgaenger !== undefined ? ` vorgaenger="${esc(norm.vorgaenger)}"` : '';
  lines.push(
    `    <norm id="${esc(id)}"${gliederungskennzahlAttr}${typAttr}${vorgaengerAttr}${statusAttr}>`,
  );
  lines.push(`      <bezeichnung>${esc(norm.normBezeichnung!)}</bezeichnung>`);
  if (norm.titel) lines.push(`      <titel>${esc(norm.titel)}</titel>`);
  lines.push(...baueText(norm.absaetze, '      '));
  if (norm.fussnoten) lines.push(`      <fussnoten>${esc(norm.fussnoten)}</fussnoten>`);
  lines.push('    </norm>');
  return lines;
}

/** Baut den vollständigen GesetzesXML-String aus GesetzInfos + Normenliste. */
export function baueGesetzesXML(infos: GesetzInfosFuerXML, normen: GesammelteNorm[]): string {
  const now = infos.verarbeitungszeit ?? new Date();
  const isoNow = isoZeitstempel(now);

  const lines: string[] = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push('<gesetz version="1">');
  lines.push(...baueInfosZeilen(infos, isoNow, isoZeitstempel(infos.letzteNeuerung ?? new Date())));
  lines.push('  <inhalt>');

  const idVergabe = new IdVergabe();
  const vergabe = new GliederungskennzahlVergabe(
    normen.map((norm) => norm.gliederungskennzahl).filter(Boolean),
  );
  // id des zuletzt gesehenen Gliederungsartikels – nur für §§ innerhalb von
  // Gliederungsartikel-Gesetzen (z.B. EGBGB) relevant, siehe bezeichnungZuId.ts.
  // Bleibt bei Gesetzen ohne Gliederungsartikel dauerhaft undefined, daher
  // greift die Verkettung dort nie.
  let currentArtikelId: string | undefined;

  for (const norm of normen) {
    if (norm.type === 'gliederung') {
      const kz = vergabe.vergib(Math.max(1, norm.ebene), norm.gliederungskennzahl);
      if (norm.normBezeichnung) {
        const id = idVergabe.vergib(norm.normBezeichnung);
        currentArtikelId = id;
        lines.push(...baueNormZeilen(norm, id, kz));
      } else {
        lines.push(...baueUeberschriftZeilen(norm, kz));
      }
    } else {
      const id = idVergabe.vergib(norm.idBasis ?? norm.normBezeichnung!, currentArtikelId);
      lines.push(...baueNormZeilen(norm, id));
    }
  }

  lines.push('  </inhalt>');
  lines.push('</gesetz>');

  return lines.join('\n');
}
