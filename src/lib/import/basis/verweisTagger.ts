// verweisTagger.ts
// Durchsucht den <text>-Bereich des GesetzesXML und
// umschließt alle Verweise mit <verweis>-Tags.
//
// Muss nach importiereBundXML() und vor parseGesetzesXML() aufgerufen werden.
//
// taggeVerweise() ist idempotent: Ein erneuter Aufruf auf bereits (ggf. auch
// mehrfach/verschachtelt) getaggtem XML entfernt zunächst alle vorhandenen
// <verweis>-Tags (siehe entferneBestehendeVerweise()) und taggt danach neu –
// das Ergebnis ist identisch zu einem einmaligen Aufruf auf dem
// ursprünglichen, unvertaggten XML. Das ist insbesondere dann relevant, wenn
// die Tagging-Logik nachträglich verbessert wird und bereits importierte
// Gesetze erneut durchlaufen werden sollen.

import { kurztitelVergleichsform } from '@/lib/domain/kurztitelVergleich';
import { NORMGEBER_DE_BUND, NORMGEBER_DE_BW, NORMGEBER_EU } from '@/lib/domain/normgeber';
import type { NormPraefixFamilie } from '@/lib/domain/basis/normPraefixe';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { escapeXML } from '@/lib/utils/xmlVerarbeitung';
import {
  NORM_RE,
  CANON_NORM_RE,
  extrahiereNorm,
  zerlegeNormkette,
} from './verweisTagger.normkette';
import {
  baueGesetzLookup,
  erkenneLaw,
  type GesetzLookup,
  type GesetzesreferenzMitLangtitel,
} from './verweisTagger.gesetzerkennung';
export type { GesetzesreferenzMitLangtitel } from './verweisTagger.gesetzerkennung';

function verweisGesetzAttribute(
  gefundenesGesetz: string | null,
  aktuellesGesetz: Gesetzesreferenz,
  lookup: GesetzLookup,
): string {
  const ziel =
    gefundenesGesetz &&
    kurztitelVergleichsform(gefundenesGesetz) !== kurztitelVergleichsform(aktuellesGesetz.kurztitel)
      ? (lookup.referenzen.get(kurztitelVergleichsform(gefundenesGesetz)) ?? aktuellesGesetz)
      : aktuellesGesetz;
  if (ziel === aktuellesGesetz) return '';
  return ` gesetz="${escapeXML(ziel.kurztitel)}" normgeber="${escapeXML(ziel.normgeber)}"`;
}

function ersetzeVerweise(
  textNode: string,
  aktuellesGesetz: Gesetzesreferenz,
  lookup: GesetzLookup,
  canonProfil: boolean,
): string {
  let ergebnis = '';
  let letzterIndex = 0;

  for (const match of textNode.matchAll(canonProfil ? CANON_NORM_RE : NORM_RE)) {
    const matchText = match[0];
    const matchStart = match.index!;
    const matchEnde = matchStart + matchText.length;

    // Gesetzesnamen im unmittelbar folgenden Text suchen – gilt für die
    // GESAMTE Kette (bei einer Normkette steht ein etwaiger Gesetzesname
    // hinter der letzten Zahl, nicht zwischen den Kettengliedern), daher
    // einmalig pro Match statt pro Kettenglied ermittelt.
    const gefundenesGesetz = erkenneLaw(textNode.slice(matchEnde), lookup);
    // Im Canon-Gesetz ist ein alleinstehendes Paragraphenzeichen ein Absatz.
    // Nur ein über den bestehenden Referenzweg erkannter Gesetzesname erlaubt
    // hier weiterhin einen eigenständigen Paragraphenverweis.
    if (canonProfil && matchText.startsWith('§') && !gefundenesGesetz) continue;
    const gesetzAttr = verweisGesetzAttribute(gefundenesGesetz, aktuellesGesetz, lookup);

    ergebnis += textNode.slice(letzterIndex, matchStart);

    const kette = zerlegeNormkette(matchText);
    if (kette) {
      for (const glied of kette) {
        ergebnis += `<verweis${gesetzAttr} norm="${glied.norm}">${glied.text}</verweis>`;
      }
    } else {
      const norm = extrahiereNorm(matchText);
      ergebnis += `<verweis${gesetzAttr} norm="${norm}">${matchText}</verweis>`;
    }

    letzterIndex = matchEnde;
  }

  return ergebnis + textNode.slice(letzterIndex);
}

// ---------------------------------------------------------------------------
// Idempotenz: bereits vorhandene <verweis>-Tags vor dem (Neu-)Taggen entfernen
// ---------------------------------------------------------------------------

const VERWEIS_OEFFNEND_RE = /<verweis\b[^>]*>/gi;
const VERWEIS_SCHLIESSEND_RE = /<\/verweis\s*>/gi;

/**
 * Entfernt bereits vorhandene <verweis>-Tags (nur die Tags selbst – ihr
 * Textinhalt bleibt erhalten) per einfachem Text-Ersetzen. Auch
 * verschachtelte <verweis>-Tags (z.B. aus einem früheren, fehlerhaften
 * Doppel-Tagging-Lauf) werden dabei vollständig aufgelöst, da jedes
 * öffnende/schließende Tag für sich genommen entfernt wird, unabhängig von
 * der Verschachtelungstiefe.
 *
 * Bewusst OHNE Kommentar-/PI-bewussten Scan (anders als die Haupt-Schleife
 * in taggeVerweise() selbst, die neue Treffer nicht innerhalb von
 * Kommentaren sucht): <verweis>-Tags werden ausschließlich von
 * taggeVerweise() selbst erzeugt, und unsere eigene GesetzesXML-Erzeugung
 * schreibt nirgends XML-Kommentare – ein literaler "<verweis"-Text
 * innerhalb eines Kommentars ist daher kein real vorkommender Fall, für den
 * sich ein aufwändigerer Scan lohnen würde.
 */
export function entferneBestehendeVerweise(xmlString: string): string {
  return xmlString.replace(VERWEIS_OEFFNEND_RE, '').replace(VERWEIS_SCHLIESSEND_RE, '');
}

// ---------------------------------------------------------------------------
// Öffentliche Hauptfunktion
// ---------------------------------------------------------------------------

// Überspringt einen Spezialblock, der mit startMarker beginnt und mit
// endMarker endet (XML-Deklaration/PI: "<?"/"?>" – oder Kommentar:
// "<!--"/"-->"), unverändert ins Ergebnis übernommen. Fehlt der Endmarker
// (unvollständiges Dokument), wird der Rest des Strings übernommen.
function ueberspringeSpezialblock(
  bereinigt: string,
  i: number,
  startMarker: string,
  endMarker: string,
): { stueck: string; naechstesI: number } | null {
  if (!bereinigt.startsWith(startMarker, i)) return null;
  const markerEnde = bereinigt.indexOf(endMarker, i);
  const ende = markerEnde === -1 ? bereinigt.length : markerEnde + endMarker.length;
  return { stueck: bereinigt.slice(i, ende), naechstesI: ende };
}

// Verarbeitet ein einzelnes Tag ab Position i: bestimmt Tag-Typ/-Name,
// führt die text-Tiefe nach (siehe taggeVerweise) und gibt das Tag
// unverändert zur Übernahme ins Ergebnis zurück. istEndeOhneTagEnde zeigt an,
// dass kein schließendes '>' mehr gefunden wurde (ungültiges XML) – der
// Aufrufer übernimmt in dem Fall den Rest des Dokuments und bricht ab.
function verarbeiteTag(
  bereinigt: string,
  i: number,
  textTiefe: number,
): { stueck: string; naechstesI: number; neueTextTiefe: number; istEndeOhneTagEnde: boolean } {
  const tagEnde = bereinigt.indexOf('>', i);
  if (tagEnde === -1) {
    return {
      stueck: bereinigt.slice(i),
      naechstesI: bereinigt.length,
      neueTextTiefe: textTiefe,
      istEndeOhneTagEnde: true,
    };
  }
  const tag = bereinigt.slice(i, tagEnde + 1);

  const istSelbstschliessend = tag.endsWith('/>');
  const tagInnen = tag.slice(1, istSelbstschliessend ? -2 : -1).trim();
  const istSchliessend = tagInnen.startsWith('/');
  const tagName = tagInnen.replace(/^\//, '').split(/\s/)[0]!.toLowerCase();

  let neueTextTiefe = textTiefe;
  if (tagName === 'text') {
    if (istSchliessend) {
      neueTextTiefe = Math.max(0, textTiefe - 1);
    } else if (!istSelbstschliessend) {
      neueTextTiefe = textTiefe + 1;
    }
  }

  return { stueck: tag, naechstesI: tagEnde + 1, neueTextTiefe, istEndeOhneTagEnde: false };
}

// Verarbeitet einen Text-Node ab Position i bis zum nächsten '<' (oder
// Dokumentende): vertaggt Verweise nur innerhalb von <text> und bei
// nicht-leerem Text, sonst unverändert übernommen.
function verarbeiteTextNode(
  bereinigt: string,
  i: number,
  textTiefe: number,
  aktuellesGesetz: Gesetzesreferenz,
  lookup: GesetzLookup,
  canonProfil: boolean,
): { stueck: string; naechstesI: number } {
  const naechsterTag = bereinigt.indexOf('<', i);
  const ende = naechsterTag === -1 ? bereinigt.length : naechsterTag;
  const textNode = bereinigt.slice(i, ende);

  const stueck =
    textTiefe > 0 && textNode.trim().length > 0
      ? ersetzeVerweise(textNode, aktuellesGesetz, lookup, canonProfil)
      : textNode;

  return { stueck, naechstesI: ende };
}

/**
 * Durchsucht das GesetzesXML und umschließt alle Verweise
 * im <text>-Bereich mit <verweis>-Tags.
 *
 * @param xmlString        GesetzesXML (Ausgabe von importiereBundXML) –
 *                          darf bereits <verweis>-Tags enthalten (werden vor
 *                          dem Neu-Taggen entfernt, siehe Kommentar oben zur
 *                          Idempotenz).
 * @param aktuellesGesetz  Vollständige Referenz des gerade importierten Gesetzes
 * @param gesetze          Bekannte Gesetze (installiert + Indexe) für
 *                         Querverweis-Erkennung
 * @param profil           Nur die Canon-Familie aktiviert Canon-Eigenverweise.
 */
export function taggeVerweise(
  xmlString: string,
  aktuellesGesetz: Gesetzesreferenz,
  gesetze: GesetzesreferenzMitLangtitel[],
  profil?: { normpraefix?: NormPraefixFamilie },
): string {
  const bereinigt = entferneBestehendeVerweise(xmlString);

  // Lookup-Strukturen einmal pro Aufruf bauen statt pro Verweis-Treffer neu
  // über gesetze zu scannen (siehe baueGesetzLookup).
  const normgeber = aktuellesGesetz.normgeber;
  const lookup = baueGesetzLookup(
    normgeber === NORMGEBER_DE_BUND || normgeber === NORMGEBER_DE_BW || normgeber === NORMGEBER_EU
      ? gesetze
      : [],
  );

  let ergebnis = '';
  let i = 0;
  let textTiefe = 0; // Tiefe innerhalb von <text>-Elementen

  while (i < bereinigt.length) {
    const pi = ueberspringeSpezialblock(bereinigt, i, '<?', '?>');
    if (pi) {
      ergebnis += pi.stueck;
      i = pi.naechstesI;
      continue;
    }

    const kommentar = ueberspringeSpezialblock(bereinigt, i, '<!--', '-->');
    if (kommentar) {
      ergebnis += kommentar.stueck;
      i = kommentar.naechstesI;
      continue;
    }

    if (bereinigt[i] === '<') {
      const { stueck, naechstesI, neueTextTiefe, istEndeOhneTagEnde } = verarbeiteTag(
        bereinigt,
        i,
        textTiefe,
      );
      ergebnis += stueck;
      i = naechstesI;
      textTiefe = neueTextTiefe;
      if (istEndeOhneTagEnde) break;
    } else {
      const { stueck, naechstesI } = verarbeiteTextNode(
        bereinigt,
        i,
        textTiefe,
        aktuellesGesetz,
        lookup,
        profil?.normpraefix === 'canon',
      );
      ergebnis += stueck;
      i = naechstesI;
    }
  }

  return ergebnis;
}
