// normKurzform.ts
// Reine Kurzformen, Ausgangskennungen und Rundlaufprüfung ohne Persistenz.

// ---------------------------------------------------------------------------
// Kurzform ermitteln (xmlId → Kurzform für Anzeige und Rundlaufprüfung)
// ---------------------------------------------------------------------------

// Letztes Leerzeichen-getrenntes Token einer Bezeichnung.
// „Art. 229" → „229", „§ 3" → „3", „229a" → „229a".

import type { DarstellungsElement, GesetzDarstellung } from '@/lib/domain/gesetzTypes';
import { loeseNormEindeutigAuf, normalisierePraefix } from './verweisAufloesung';
import {
  bezeichnungMitPraefixAbstand,
  findeUebergeordnetenArtikel,
  vollstaendigeBezeichnung,
  praefixeVonNorm,
} from './normAufloesung';
import type { Ausgangsstelle } from '@/lib/domain/ausgangsstelle';
import { bildeAusgangskennung } from './normAusgangsstelle';

function letztesToken(bezeichnung: string): string {
  // Stryker disable next-line Regex: äquivalent – durch das vorangehende
  // .trim() kann der String nie mit Whitespace enden, daher liefert .at(-1)
  // für /\s+/ und /\s/ immer denselben letzten (nicht-leeren) Token, egal ob
  // dazwischen einfache oder mehrfache Leerzeichen stehen (mutant 19).
  return bezeichnungMitPraefixAbstand(bezeichnung).split(/\s+/).at(-1) ?? bezeichnung.trim();
}

// Findet den zuletzt gesehenen Gliederungsartikel vor der Norm mit der
// angegebenen xmlId – siehe findeUebergeordnetenArtikel in normAufloesung.ts
// (dort auch von vollstaendigeBezeichnung genutzt, daher zentral dort).

// Baut für eine §-Norm in einem Gliederungsartikel-Gesetz (z.B. EGBGB) das
// Zwei-Token-Format „229 3" (Artikel-Token + Norm-Token). Gibt null zurück,
// wenn das Element kein solcher Fall ist (kein Gliederungsartikel-Gesetz,
// das Element selbst ein Artikel, kein übergeordneter Artikel gefunden, oder
// einer der Tokens nicht mit einer Ziffer beginnt). Gemeinsame Grundlage für
// xmlIdZuBezeichnung und speichereAktivierung.
function gliederungsartikelToken(
  gesetz: GesetzDarstellung,
  el: DarstellungsElement,
): string | null {
  if (
    !gesetz.hatGliederungsartikel ||
    // Stryker disable next-line ConditionalExpression: äquivalent – wäre el
    // keine Norm, würde findeUebergeordnetenArtikel unten (das nur
    // el.typ==='norm'-Einträge als Treffer zählt) für el.data.xmlId ohnehin
    // nie zurückkehren, da keine eigene Norm mit dieser xmlId existiert;
    // "artikel" bliebe also so oder so null (mutant 30).
    el.typ !== 'norm' ||
    // Stryker disable next-line ConditionalExpression: äquivalent – ist el
    // selbst der Gliederungsartikel (gliederungsEbene gesetzt), trifft in
    // findeUebergeordnetenArtikel für genau dieses Element IMMER der
    // "setze letzterArtikel"-Zweig statt des Rückgabe-Zweigs (beide Zweige
    // schließen sich für dieselbe Norm gegenseitig aus) – "artikel" bliebe
    // also so oder so null (mutant 33).
    el.data.art === 'gliederungsartikel'
  ) {
    return null;
  }
  const artikel = findeUebergeordnetenArtikel(gesetz.elemente, el.data.xmlId);
  if (!artikel) return null;
  const artToken = letztesToken(artikel.bezeichnung);
  const normToken = letztesToken(el.data.bezeichnung);
  if (!/^\d/.test(artToken) || !/^\d/.test(normToken)) return null;
  return `${artToken} ${normToken}`;
}

/**
 * Ermittelt die Kurzform eines Elements für Anzeige und Rundlaufprüfung.
 *
 * Rückgabeformat:
 * - Normale §-Norm:                           „433" (letztes Token)
 * - § in Gliederungsartikel-Gesetz (EGBGB):  „229 3" (Artikel-Token + Norm-Token)
 * - Nicht-Norm (Überschrift) o. unbekannt:   null
 */
export function xmlIdZuBezeichnung(
  gesetz: GesetzDarstellung,
  el: DarstellungsElement,
): string | null {
  if (el.typ !== 'norm') return null;
  return gliederungsartikelToken(gesetz, el) ?? letztesToken(el.data.bezeichnung);
}

/** Kurzform und Präfix der Ausgangsstelle einer Markierung. */
export function ausgangsnormKennung(
  gesetz: GesetzDarstellung,
  el: DarstellungsElement,
): Ausgangsstelle | null {
  return bildeAusgangskennung(gesetz, el);
}

export type KurzformPruefung =
  | { ok: true; bezeichnung: string }
  | { ok: false; grund: 'anderes-element'; bezeichnung: string; zielBezeichnung: string }
  | { ok: false; grund: 'nicht-aufloesbar' | 'mehrdeutig'; bezeichnung: string };

/** Lesezeichen und Favoriten bevorzugen bei bloßen Nummern §§ und Artikel.
 * Gleichrangige Treffer bleiben mehrdeutig; Artikelkontext bleibt erhalten. */
export function loeseLesezeichenOderFavoritAuf(gesetz: GesetzDarstellung, bezeichnung: string) {
  const ergebnis = loeseNormEindeutigAuf(gesetz, bezeichnung);
  if (ergebnis.anzahlTreffer < 2 || !/^\d+[a-z]*(?:\s+\d+[a-z]*)?$/i.test(bezeichnung.trim()))
    return ergebnis;
  const vorrangig = loeseNormEindeutigAuf(
    {
      ...gesetz,
      elemente: gesetz.elemente.filter((el) => {
        if (el.typ !== 'norm') return true;
        const praefix = normalisierePraefix(praefixeVonNorm(gesetz, el.data).at(-1) ?? '');
        return praefix === '§' || praefix === 'art';
      }),
    },
    bezeichnung,
  );
  return vorrangig.anzahlTreffer > 0 ? vorrangig : ergebnis;
}

/** Prüft als Oberflächenregel, ob die Kurzform wieder zur selben Norm führt. */
export function pruefeKurzform(
  gesetz: GesetzDarstellung,
  el: DarstellungsElement,
): KurzformPruefung | null {
  const bezeichnung = xmlIdZuBezeichnung(gesetz, el);
  if (bezeichnung === null) return null;
  const { norm, anzahlTreffer } = loeseLesezeichenOderFavoritAuf(gesetz, bezeichnung);
  if (!norm)
    return {
      ok: false,
      grund: anzahlTreffer > 1 ? 'mehrdeutig' : 'nicht-aufloesbar',
      bezeichnung,
    };
  const xmlId = norm.xmlId;
  if (xmlId !== el.data.xmlId) {
    return {
      ok: false,
      grund: 'anderes-element',
      bezeichnung,
      zielBezeichnung: vollstaendigeBezeichnung(gesetz, xmlId) ?? bezeichnung,
    };
  }
  return { ok: true, bezeichnung };
}

/** Vollständiges Aktivierungsformat; Überschriften speichern ihre Gliederungskennzahl separat. */
export function bezeichnungFuerAktivierung(
  gesetz: GesetzDarstellung,
  el: DarstellungsElement,
): string | null {
  if (el.typ !== 'norm') return null;
  return gliederungsartikelToken(gesetz, el) ?? el.data.bezeichnung;
}

/** Kurzform einer gespeicherten vollen Bezeichnung für die Seitenleisten. */
export function kurzformAusBezeichnung(bezeichnung: string): string {
  const artikelUndNorm = /^(Art\.?|Artikel)\s*(\d+\w*)\s+§\s*(\S+)$/i.exec(bezeichnung.trim());
  if (artikelUndNorm) return `${artikelUndNorm[2]} ${artikelUndNorm[3]}`;
  return letztesToken(bezeichnung);
}
