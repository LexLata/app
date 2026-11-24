// normAufloesung.ts
// Zwei klar getrennte Schichten:
//
//   1. Auflösung: bezeichnung ↔ xmlId
//      Bezeichnung-Strings (z.B. „433", „229 3") werden in die stabilen xmlId-
//      Bezeichner aus den Bundesjustizamt-XML-Daten aufgelöst; umgekehrt
//      liefert elementSuchBezeichnung das passende Feld für die Persistenz in
//      aktivierungSpeicher.ts.
//
//   2. Navigation: xmlId → Sprungziel
//      xmlIdZuSprungZiel ermittelt für springeZuIndex (Gesetzestextansicht.tsx) den
//      Index und die ids aller aufzuklappenden Vorfahren.
//
// Was hier NICHT steht:
//   – Kurzformen und Aktivierungsbezeichnungen → normKurzform.ts
//   – Aktivierungs-Persistenz → aktivierungSpeicher.ts
//   – Tab-Management → useAppTabs.ts
//   – Gesetz-Level-Öffnen → App.tsx (elementOeffnen)
//
// Ersetzt ElementOeffnen.ts (Schichten 1+2 davon); Schicht 3 lebt nun
// vollständig in aktivierungSpeicher.ts.

import type {
  GesetzDarstellung,
  DarstellungsElement,
  NormDarstellung,
} from '@/lib/domain/gesetzTypes';
import { elementSuchBezeichnung } from '@/lib/domain/gesetzDarstellungAuswertung';
import { normPraefixQuelle } from '@/lib/domain/basis/normPraefixe';

import { findeUebergeordnetenArtikel } from '@/lib/domain/norm/normStrukturPruefung';
export { findeUebergeordnetenArtikel } from '@/lib/domain/norm/normStrukturPruefung';
import { loeseNormEindeutigAuf } from '@/lib/domain/norm/verweisAufloesung';
export { loeseNormEindeutigAuf } from '@/lib/domain/norm/verweisAufloesung';

// ---------------------------------------------------------------------------
// Schicht 1: Bezeichnung ↔ xmlId (Präfixe und eindeutige Normauflösung)
// Konkrete Verweisziele verwenden verweisZuXmlId in verweisAufloesung.ts.
// ---------------------------------------------------------------------------

// Erkennt, ob eine Norm-Bezeichnung (z.B. "Art. 1", "Artikel 1", "§ 1")
// einen Artikel meint statt eines Paragraphen. WICHTIG: dies ist unabhängig
// von gliederungsEbene – das Feld wird nur bei Gliederungsartikel-Gesetzen
// (z.B. EGBGB, über <gliederung>-Tags) gesetzt. Bei reinen Artikel-Gesetzen
// wie dem GG sind es ganz normale <norm>-Tags OHNE gliederungsEbene, bei denen
// einzig der Bezeichnung-Text selbst "Art." trägt – daher muss hier direkt der
// Text geprüft werden, nicht die Struktur. Siehe formatiereZitat
// (textpfad.ts) bzw. die Präfix-Ermittlung in VerweismarkierungFenster.tsx.
export function istArtikelBezeichnung(bezeichnung: string): boolean {
  return /^art(\.|ikel)?\s/i.test(bezeichnung.trim());
}

// Interne Vorbereitung der Kurzform-/Präfixbildung: bekannte Normsymbole
// dürfen direkt an der Zahl stehen. Sonstige Kennungen (etwa E25) bleiben erhalten.
export function bezeichnungMitPraefixAbstand(bezeichnung: string): string {
  return bezeichnung
    .trim()
    .replace(new RegExp(`^(${normPraefixQuelle('abstand')})(?=\\d)`, 'i'), '$1 ');
}

// Extrahiert den wörtlichen Präfix-Text einer Norm-Bezeichnung (alles vor der
// letzten Zahl), z.B. "§" aus "§ 6", "Art." aus "Art. 229". Bewusst rein
// textuell und ohne Art/Paragraph als einzig angenommene Symbole hartkodiert,
// damit auch künftige, heute nicht vorkommende Präfix-Formen korrekt erfasst
// werden.

export function praefixVonBezeichnung(bezeichnung: string): string {
  return bezeichnungMitPraefixAbstand(bezeichnung).replace(/\S+$/, '').trim();
}

// Ermittelt die vollständige praefix-Liste (Präfixdiagnose der Gesetzesstruktur) für
// eine aufgelöste Norm: bei §§ innerhalb eines Gliederungsartikels (z.B.
// EGBGB) wird zusätzlich der Präfix des übergeordneten Artikels vorangestellt
// (dieselbe gliederungsEbene-Prüfung wie in vollstaendigeBezeichnung oben),
// sonst nur der eigene Präfix.
export function praefixeVonNorm(gesetz: GesetzDarstellung, norm: NormDarstellung): string[] {
  const praefixe: string[] = [];
  // Stryker disable next-line ConditionalExpression: äquivalent – für die
  // xmlId eines Gliederungsartikels selbst liefert findeUebergeordnetenArtikel
  // (s.u.) strukturell IMMER null zurück (der Artikel matcht dort bereits den
  // ersten if-Zweig, nie den else-if), unabhängig von dieser Bedingung. Siehe
  // Mutation-Testing-Analyse im Chatverlauf (mutant 19).
  if (norm.art !== 'gliederungsartikel') {
    const artikel = findeUebergeordnetenArtikel(gesetz.elemente, norm.xmlId);
    if (artikel) praefixe.push(praefixVonBezeichnung(artikel.bezeichnung));
  }
  praefixe.push(praefixVonBezeichnung(norm.bezeichnung));
  return praefixe;
}

/** Liefert ausschließlich eine eindeutig passende Norm. */
export function findeEindeutigeNorm(
  gesetz: GesetzDarstellung,
  bezeichnung: string,
): NormDarstellung | undefined {
  return loeseNormEindeutigAuf(gesetz, bezeichnung).norm;
}

// ---------------------------------------------------------------------------
// Schicht 2: Navigation (xmlId → Sprungziel)
// ---------------------------------------------------------------------------

export interface SprungZiel {
  /** Index des Zielelements in der übergebenen elemente-Liste. */
  index: number;
  /**
   * ids (NICHT xmlId!) aller umschließenden Überschriften und
   * Gliederungsartikel, von außen nach innen. Werden in Gesetzestextansicht gegen
   * eingeklappteUeberschriften (Überschriften) und eingeklappteNormen
   * (Gliederungsartikel) geprüft, um ggf. nötige Aufklapp-Schritte zu
   * ermitteln.
   */
  vorfahrenIds: string[];
}

// Ermittelt für die gegebene xmlId den Index sowie die ids aller umschließenden
// Überschriften/Gliederungsartikel. Identische Logik wie vormals ermittleSprungZiel
// in ElementOeffnen.ts.
//
// Typischerweise zweimal aufgerufen: einmal über das volle, ungefilterte
// elemente (→ alle Vorfahren, unabhängig vom Einklapp-Zustand), dann nach dem
// Aufklappen erneut über sichtbareElemente (→ finaler Index für springeZuIndex).
type VorfahrenStack = { id: string; ebene: number }[];

// Poppt alle Stack-Einträge derselben oder tieferer Ebene, bevor der neue
// Eintrag aufgelegt wird – gemeinsame Grundlage für Überschriften UND
// Gliederungsartikel (beide verhalten sich für den Stack identisch).
function stackAktualisieren(stack: VorfahrenStack, id: string, ebene: number): void {
  while (stack.length > 0 && stack[stack.length - 1]!.ebene >= ebene) stack.pop();
  stack.push({ id, ebene });
}

export function xmlIdZuSprungZiel(
  elemente: DarstellungsElement[],
  xmlId: string,
): SprungZiel | null {
  const stack: VorfahrenStack = [];
  // Stryker disable next-line EqualityOperator: äquivalent – i <= length
  // würde nur einen zusätzlichen Durchlauf mit el === undefined erzeugen, der
  // durch den folgenden Guard sofort übersprungen wird (mutant 221).
  for (let i = 0; i < elemente.length; i++) {
    const el = elemente[i];
    // Durch die Schleifen-Invariante (i < elemente.length) beweisbar sicher –
    // die Prüfung dient nur der Typ-Absicherung unter noUncheckedIndexedAccess.
    // Stryker disable next-line ConditionalExpression: äquivalent, s.o. –
    // el kann bei unveränderter Schleifengrenze nie undefined sein
    // (mutant 226).
    if (el === undefined) continue;
    if (el.typ === 'ueberschrift') {
      if (el.data.xmlId === xmlId) return { index: i, vorfahrenIds: stack.map((s) => s.id) };
      stackAktualisieren(stack, el.data.id, el.data.ebene);
      // Stryker disable next-line ConditionalExpression: äquivalent –
      // DarstellungsElement ist eine Union aus genau 'ueberschrift' | 'norm';
      // der ueberschrift-Zweig ist hier bereits ausgeschlossen, also bleibt
      // nur 'norm' übrig (mutant 242).
    } else if (el.typ === 'norm' && el.data.art === 'gliederungsartikel') {
      if (el.data.xmlId === xmlId) return { index: i, vorfahrenIds: stack.map((s) => s.id) };
      stackAktualisieren(stack, el.data.id, el.data.gliederungsEbene);
    } else if (el.data.xmlId === xmlId) {
      return { index: i, vorfahrenIds: stack.map((s) => s.id) };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Schicht 3: Anzeige – vollständige Bezeichnung inkl. Gliederungsartikel
// ---------------------------------------------------------------------------

// Findet den zuletzt gesehenen Gliederungsartikel vor der Norm mit der
// angegebenen xmlId in der flachen elemente-Liste. Einfacher Vorwärts-Scan,
// der Überschriften ignoriert (statt an ihnen abzubrechen) – dadurch auch
// korrekt, wenn zwischen Gliederungsartikel und Norm eine Unterüberschrift
// liegt (z.B. Art. 248 EGBGB). Gemeinsame Grundlage für xmlIdZuBezeichnung/
// bezeichnungFuerAktivierung (normKurzform.ts) und vollstaendigeBezeichnung
// (unten).
// Stellt bei §§ innerhalb eines Gliederungsartikels (z.B. EGBGB) den
// übergeordneten Artikel voran ("Art. 229 § 3" statt nur "§ 3") – gemeinsame
// Grundlage für vollstaendigeBezeichnung (unten) UND normBezeichnungFuerZitat
// (useZitatKopieren.ts, auswahlleiste.tsx), beide
// bilden aus einer bereits ermittelten "eigenen" Bezeichnung dieselbe
// Artikel-Präfix-Form. NICHT für praefixeVonNorm (oben) geeignet – die baut
// eine Liste einzelner Präfix-TEXTE (für Suche/Vergleich), keinen
// zusammengesetzten Anzeige-String.
export function mitArtikelPraefix(
  gesetz: GesetzDarstellung,
  zielangabe: string | DarstellungsElement,
  eigeneBezeichnung: string,
): string {
  const ziel =
    typeof zielangabe === 'string'
      ? gesetz.elemente.find((el) => el.data.xmlId === zielangabe)
      : zielangabe;
  // Stryker disable next-line ConditionalExpression: äquivalent (mutant 285
  // für den gesamten Ausdruck, mutant 292 für den zweiten Teil allein) –
  // findeUebergeordnetenArtikel liefert strukturell NUR dann non-null, wenn
  // ziel exakt diese Bedingung erfüllt (eine echte Norm mit
  // gliederungsEbene === undefined, hinter einem gesehenen Gliederungsartikel);
  // der Guard hier dupliziert also nur eine bereits in
  // findeUebergeordnetenArtikel erzwungene Voraussetzung.
  if (ziel?.typ === 'norm' && ziel.data.art !== 'gliederungsartikel') {
    const artikel = findeUebergeordnetenArtikel(gesetz.elemente, ziel.data);
    if (artikel) return `${artikel.bezeichnung} ${eigeneBezeichnung}`;
  }
  return eigeneBezeichnung;
}

// Anzeige-Bezeichnung einer Norm für Listen außerhalb von Gesetzestextansicht
// (z.B. VerlaufOverlay): bei §§ in Gliederungsartikel-Gesetzen (z.B. EGBGB)
// wird der übergeordnete Artikel vorangestellt ("Art. 229 § 3" statt nur
// "§ 3"), analog zur Tab-Titel-Bildung in Gesetzestextansicht.tsx – dort
// Index-basiert auf der gefilterten sichtbareElemente-Liste während des
// Renderns, hier xmlId-basiert auf der vollen, ungefilterten elemente-Liste,
// da hier kein Render-Kontext vorliegt.
export function vollstaendigeBezeichnung(
  gesetz: GesetzDarstellung,
  zielangabe: string | DarstellungsElement,
): string | null {
  const ziel =
    typeof zielangabe === 'string'
      ? gesetz.elemente.find((el) => el.data.xmlId === zielangabe)
      : zielangabe;
  if (!ziel) return null;
  const eigeneBezeichnung = elementSuchBezeichnung(ziel);
  if (!eigeneBezeichnung) return null;
  return mitArtikelPraefix(gesetz, ziel, eigeneBezeichnung);
}
