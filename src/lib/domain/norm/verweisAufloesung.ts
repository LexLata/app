// Ordnet konkrete Verweisziele eindeutig zu, ohne die tolerante Suche zu verändern.
// Artikelkontext stammt aus dem Gesetzesmodell; Kandidaten bleiben unverändert.

import type { GesetzDarstellung, NormDarstellung } from '@/lib/domain/gesetzTypes';
import { normSammelbereichAufloesbar } from '@/lib/domain/gesetzDarstellungAuswertung';
import { findeUebergeordnetenArtikel } from '@/lib/domain/norm/normStrukturPruefung';
import {
  familieVonText,
  kanonischesPraefix,
  normPraefixQuelle,
} from '@/lib/domain/basis/normPraefixe';

type Ziel = { zahlen: string[]; praefixe: string[] };
const nummer = '\\d+[a-z]*(?:p\\d+)?';
const praefixMuster = `(?:${normPraefixQuelle('aufloesung')}|Anhang|Anlage)`;

/** Bestehende Präfixäquivalenzen für numerische Verweis- und Ausgangskennungen. */
export function normalisierePraefix(text: string): string | null {
  const wert = text.trim().toLowerCase();
  if (wert === '') return '';
  const familie = new RegExp(`^${normPraefixQuelle('aufloesung')}$`, 'i').test(wert)
    ? familieVonText(wert)
    : undefined;
  if (familie === 'artikel') return 'art';
  if (familie === 'canon') return kanonischesPraefix(familie).toLowerCase();
  if (/^(?:§|anhang|anlage)$/.test(wert)) return wert;
  return null;
}

/** Gemeinsame Erkennung gespeicherter Erwägungsgrund-Bezeichnungen. */
export function istErwaegungsgrundBezeichnung(text: string): boolean {
  return /^e\d+$/i.test(text.trim());
}

function parseZiel(text: string): Ziel | null {
  const wert = text.trim().toLowerCase();
  if (istErwaegungsgrundBezeichnung(wert)) return { zahlen: [wert.slice(1)], praefixe: ['e'] };
  if (new RegExp(`^${nummer}(?:\\s+${nummer})?$`).test(wert)) {
    return { zahlen: wert.split(/\s+/), praefixe: [] };
  }
  const muster = new RegExp(
    `^(${praefixMuster})\\s*(${nummer})(?:(?:\\s*(${praefixMuster})\\s*|\\s+)(${nummer}))?$`,
    'i',
  );
  const treffer = wert.match(muster);
  if (!treffer) return null;
  const erster = normalisierePraefix(treffer[1]!);
  if (!erster) return null;
  if (treffer[4] === undefined) return { zahlen: [treffer[2]!], praefixe: [erster] };
  const zweiter = treffer[3] === undefined ? '' : normalisierePraefix(treffer[3]);
  if (erster !== 'art' || (zweiter !== '§' && zweiter !== '')) return null;
  return { zahlen: [treffer[2]!, treffer[4]!], praefixe: [erster, zweiter] };
}

/** Vergleicht gespeicherte volle Bezeichnungen ohne die Präfixtoleranz loser Ziele. */
export function gleicheNormBezeichnung(a: string, b: string): boolean {
  const links = parseZiel(a);
  const rechts = parseZiel(b);
  if (links && rechts)
    return (
      links.zahlen.length === rechts.zahlen.length &&
      links.zahlen.every((zahl, i) => zahl === rechts.zahlen[i]) &&
      links.praefixe.length === rechts.praefixe.length &&
      links.praefixe.every((praefix, i) => praefix === rechts.praefixe[i])
    );
  const sammelLinks = normalisiereSammelbezeichnung(a);
  const sammelRechts = normalisiereSammelbezeichnung(b);
  if (sammelLinks !== null && sammelRechts !== null) return sammelLinks === sammelRechts;
  return a.trim().replace(/\s+/g, ' ') === b.trim().replace(/\s+/g, ' ');
}

function mitArtikel(gesetz: GesetzDarstellung, norm: NormDarstellung, ziel: Ziel): Ziel | null {
  if (norm.art === 'gliederungsartikel' || norm.art === 'erwaegungsgrund') return ziel;
  const artikel = findeUebergeordnetenArtikel(gesetz.elemente, norm);
  if (!artikel) return ziel;
  const kontext = parseZiel(artikel.bezeichnung);
  if (!kontext || kontext.praefixe[0] !== 'art' || kontext.zahlen.length !== 1) return null;
  if (ziel.zahlen.length === 2) {
    return ziel.zahlen[0] === kontext.zahlen[0] ? ziel : null;
  }
  return {
    zahlen: [...kontext.zahlen, ...ziel.zahlen],
    praefixe: [...kontext.praefixe, ...ziel.praefixe],
  };
}

function passt(ziel: Ziel, kandidat: Ziel): boolean {
  return (
    (ziel.praefixe[0] === 'e') === (kandidat.praefixe[0] === 'e') &&
    ziel.zahlen.length === kandidat.zahlen.length &&
    ziel.zahlen.every((wert, i) => wert === kandidat.zahlen[i]) &&
    (!ziel.praefixe.length ||
      ziel.praefixe.every((wert, i) => wert === (kandidat.praefixe[i] ?? '')))
  );
}

// Nur ausdrücklich ausgeschriebene reine Zahlen; „bis“ erzeugt kein Intervall.
function zusammenfassung(text: string): Ziel[] {
  const treffer = text
    .trim()
    .match(
      /^(?:(Art(?:ikel)?\.?)\s*(\d+[a-z]*)\s*)?(§§|Art(?:ikel)?\.?|Anhang|Anlage)\s*(\d+(?:(?:\s*(?:,|und|bis|–|-)\s*)\d+)+)$/i,
    );
  if (!treffer) return [];
  const praefix = treffer[3] === '§§' ? '§' : normalisierePraefix(treffer[3]!);
  if (!praefix) return [];
  return (treffer[4]!.match(/\d+/g) ?? []).map((zahl) => ({
    zahlen: treffer[2] ? [treffer[2].toLowerCase(), zahl] : [zahl],
    praefixe: treffer[2] ? ['art', praefix] : [praefix],
  }));
}

/** Bestehende Normalisierung ausschließlich erkannter numerischer Sammelbezeichnungen. */
function normalisiereSammelbezeichnung(text: string): string | null {
  if (!zusammenfassung(text).length) return null;
  return text
    .toLowerCase()
    .replace(/artikel|art\.?/g, 'art')
    .replace(/\s+/g, '')
    .trim();
}

function sammelBezeichnung(gesetz: GesetzDarstellung, norm: NormDarstellung): string | null {
  const erster = zusammenfassung(norm.bezeichnung)[0];
  if (!erster || !mitArtikel(gesetz, norm, erster)) return null;
  const artikel =
    norm.art !== 'gliederungsartikel' ? findeUebergeordnetenArtikel(gesetz.elemente, norm) : null;
  if (artikel && !/^art(?:ikel)?\.?/i.test(norm.bezeichnung.trim()))
    return `${artikel.bezeichnung} ${norm.bezeichnung}`;
  return norm.bezeichnung;
}

function einzelPasst(gesetz: GesetzDarstellung, norm: NormDarstellung, ziel: Ziel): boolean {
  const kandidat = parseZiel(norm.bezeichnung);
  if (!kandidat || (kandidat.praefixe[0] === 'e') !== (norm.art === 'erwaegungsgrund'))
    return false;
  const voll = mitArtikel(gesetz, norm, kandidat);
  return voll !== null && passt(ziel, voll);
}

// Eine ausgeschriebene Sammelbezeichnung adressiert die gesamte Sammelnorm.
function ausgeschriebeneZusammenfassung(
  gesetz: GesetzDarstellung,
  bezeichnung: string,
): NormDarstellung[] | undefined {
  const text = bezeichnung.trim();
  if (!zusammenfassung(text).length) return undefined;
  const treffer: NormDarstellung[] = [];
  for (const element of gesetz.elemente) {
    if (element.typ !== 'norm' || !normSammelbereichAufloesbar(element.data)) continue;
    const norm = element.data;
    const voll = sammelBezeichnung(gesetz, norm);
    if (
      voll !== null &&
      normalisiereSammelbezeichnung(voll) === normalisiereSammelbezeichnung(text)
    )
      treffer.push(norm);
  }
  return treffer;
}

/**
 * Kandidatenprüfung für Verweise und gespeicherte Verweisziele.
 * Liefert die eindeutige Norm sowie die Anzahl gleichrangiger Kandidaten.
 * Bezeichnung und Artikelkontext müssen passen; fehlende, widersprüchliche und
 * mehrdeutige Ziele erhalten keine Norm. E-Ziele benötigen das Erwägungsgrund-Flag.
 * Einzelziele haben Vorrang vor ausdrücklich genannten Zahlen weggefallener oder
 * textloser Zusammenfassungen. Keine Teilstringsuche, Intervallergänzung oder Seiteneffekte.
 */
export function loeseNormEindeutigAuf(
  gesetz: GesetzDarstellung,
  bezeichnung: string,
): { norm?: NormDarstellung; anzahlTreffer: number } {
  const sammelziel = ausgeschriebeneZusammenfassung(gesetz, bezeichnung);
  const treffer = sammelziel ?? einzelUndSammelkandidaten(gesetz, bezeichnung);
  return { norm: treffer.length === 1 ? treffer[0] : undefined, anzahlTreffer: treffer.length };
}

function einzelUndSammelkandidaten(
  gesetz: GesetzDarstellung,
  bezeichnung: string,
): NormDarstellung[] {
  const ziel = parseZiel(bezeichnung);
  if (!ziel) return [];
  const einzel: NormDarstellung[] = [];
  const gesammelt: NormDarstellung[] = [];
  for (const element of gesetz.elemente) {
    if (element.typ !== 'norm') continue;
    const norm = element.data;
    if (einzelPasst(gesetz, norm, ziel)) einzel.push(norm);
    if (!normSammelbereichAufloesbar(norm)) continue;
    if (
      zusammenfassung(norm.bezeichnung).some((teil) => {
        const voll = mitArtikel(gesetz, norm, teil);
        return voll !== null && passt(ziel, voll);
      })
    )
      gesammelt.push(norm);
  }
  return einzel.length ? einzel : gesammelt;
}

/** XML-ID nach demselben eindeutigen Maßstab wie gespeicherte Elementstände. */
export function verweisZuXmlId(gesetz: GesetzDarstellung, bezeichnung: string): string | null {
  return loeseNormEindeutigAuf(gesetz, bezeichnung).norm?.xmlId ?? null;
}
