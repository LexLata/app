// textpfad.vergleich.ts
//
// Ausgelagert aus textpfad.ts (dort ursprünglich zusammen mit der
// DOM-Selektion, die Datei war über 780 Zeilen gewachsen – siehe dortiger
// Kopfkommentar für die vollständige Aufteilung). Zwei Themenblöcke, die
// beide auf reinem Textpfad-Vergleich beruhen und deshalb hier
// zusammenbleiben:
//   1. Mehrfachauswahl/GGT-Bildung (ermittleMehrfachAuswahl,
//      groessterGemeinsamerPfad) – für "Zitat kopieren" über mehrere
//      Blätter derselben Norm hinweg.
//   2. Struktureller Pfad-Vergleich (vergleicheTextpfad, pfadGleich) – für
//      Sortierung sowie die Identitätsprüfung "gehört dieser gespeicherte
//      Markierungs-Eintrag zu diesem Blatt".

import { satzNummer } from './textpfad.satz';
import type { Textpfad } from '@/lib/domain/textpfad/textpfad';
import {
  liesTextpfadEintraege,
  blattPfad,
  enthaeltNichtMarkierbarenText,
  enthaeltAusgewaehlteZeichen,
} from '@/lib/domain/textpfad/textpfad';
import type { TextpfadEintrag } from '@/lib/domain/gesetzTypes';

// ---------------------------------------------------------------------------
// Mehrfach-Auswahl (nur "Zitat kopieren" – siehe
// auswahlleiste.tsx/useZitatKopieren.ts):
// ANDERS als ermittleAuswahl (Markieren, textpfad.ts) wird eine
// über mehrere Blätter reichende Auswahl hier NICHT abgelehnt, solange alle
// berührten Blätter zur selben Norm/Überschrift (data-xml-id) gehören –
// stattdessen wird der größte gemeinsame Textpfad-Nenner gebildet (siehe
// groessterGemeinsamerPfad unten), z.B. "§ 433 Abs. 1 S. 1 Nr. 1" und
// "…Nr. 2" ausgewählt → gemeinsam nur bis "§ 433 Abs. 1 S. 1". Reicht die
// Auswahl dagegen über mehrere Normen/Überschriften, ist kein sinnvolles
// Zitat bildbar (Fehlerfall, analog zu ermittleAuswahl: 'ueberspannt-mehrere').
// ---------------------------------------------------------------------------

export type MehrfachAuswahlFehler = { fehler: 'leer' | 'ueberspannt-mehrere' };
export interface MehrfachAuswahlErgebnis {
  xmlId: string;
  pfad: Textpfad;
}

/**
 * Bildet den gemeinsamen strukturellen Zitierpfad der von der ersten Range
 * berührten Blätter. Erwartet Browser-Selection-/Range-APIs und gültige interne
 * data-leaf-Attribute; ungültige Pfadangaben werden abgelehnt. Fehlende Range oder leerer
 * Auswahltext liefern „leer“. Keine Blätter, fehlende XML-ID oder Blätter
 * verschiedener Normen/Überschriften liefern „ueberspannt-mehrere“.
 * Mehrere Blätter derselben XML-ID sind erlaubt, auch Sätze in Listeneinträgen.
 * Das Ergebnis enthält keinen Zeichenbereich; Wiederholungswerte entfallen
 * bewusst für die Zitierbildung und identifizieren damit kein einzelnes Blatt.
 */
export function ermittleMehrfachAuswahl(
  selection: Selection | null,
): MehrfachAuswahlErgebnis | MehrfachAuswahlFehler {
  if (!selection || selection.rangeCount === 0) return { fehler: 'leer' };
  if (!selection.toString()) return { fehler: 'leer' };

  const range = selection.getRangeAt(0);
  if (enthaeltNichtMarkierbarenText(range)) return { fehler: 'ueberspannt-mehrere' };
  const commonAncestor = range.commonAncestorContainer;
  const wurzel =
    commonAncestor.nodeType === Node.ELEMENT_NODE
      ? (commonAncestor as Element)
      : commonAncestor.parentElement;
  if (!wurzel) return { fehler: 'ueberspannt-mehrere' };

  // Gleicher Fast-Path wie ermittleBlatt (textpfad.ts): liegt der
  // gemeinsame Vorfahre bereits in einem einzigen Blatt, berührt die Auswahl
  // zwangsläufig nur dieses eine – sonst alle berührten Blätter in
  // Dokumentreihenfolge sammeln (querySelectorAll liefert Dokumentreihenfolge,
  // wichtig für die GGT-Bildung unten, die auf "erstes vs. übrige" vergleicht).
  const eigenesBlatt = wurzel.closest('[data-leaf]');
  const blaetter = eigenesBlatt
    ? [eigenesBlatt]
    : Array.from(wurzel.querySelectorAll('[data-leaf]')).filter((el) =>
        enthaeltAusgewaehlteZeichen(range, el),
      );
  if (blaetter.length === 0) return { fehler: 'ueberspannt-mehrere' };

  const xmlIds = new Set(
    blaetter.map((b) => b.closest('[data-xml-id]')?.getAttribute('data-xml-id')),
  );
  if (xmlIds.size !== 1) return { fehler: 'ueberspannt-mehrere' }; // fehlende oder uneinheitliche xmlId
  const [xmlId] = xmlIds;
  if (!xmlId) return { fehler: 'ueberspannt-mehrere' };

  const pfade: Textpfad[] = [];
  for (const blatt of blaetter) {
    const pfad = blattPfad(blatt);
    if (!pfad) return { fehler: 'ueberspannt-mehrere' };
    pfade.push(pfad);
  }
  return { xmlId, pfad: groessterGemeinsamerPfad(pfade) };
}

// Zwei Kettenschritte gelten als gleich, wenn Ebene UND Bezeichnung
// übereinstimmen – `wiederholung` bewusst ausgenommen (siehe
// groessterGemeinsamerPfad-Kommentar unten: für die reine Zitat-Bildung
// ohne Aussagekraft).
function eintragSchrittGleich(a: TextpfadEintrag, b: TextpfadEintrag): boolean {
  return a.ebene === b.ebene && a.bezeichnung === b.bezeichnung;
}

// Größter gemeinsamer PRÄFIX mehrerer Eintrags-Ketten (z.B. "Nr. 1 a)" und
// "Nr. 1 b)" gemeinsam bis "Nr. 1") – anders als die übrigen Felder in
// groessterGemeinsamerPfad (die entweder ganz übereinstimmen oder ganz
// entfallen) kann hier ein ECHTER Teil-Präfix übrigbleiben, da eine Kette
// aus mehreren unabhängigen Schritten besteht. `undefined` = kein
// gemeinsamer Schritt (auch nicht der erste).
function gemeinsamerEintragPraefix(
  ketten: (readonly TextpfadEintrag[] | undefined)[],
): TextpfadEintrag[] | undefined {
  const erste = ketten[0] ?? [];
  const praefix: TextpfadEintrag[] = [];
  for (let i = 0; i < erste.length; i++) {
    const schritt = erste[i];
    // Durch die Schleifen-Invariante (i < erste.length) beweisbar sicher.
    if (schritt === undefined) break;
    const alleGleich = ketten.every((k) => {
      const kSchritt = k?.[i];
      return kSchritt !== undefined && eintragSchrittGleich(kSchritt, schritt);
    });
    if (!alleGleich) break;
    praefix.push({ ebene: schritt.ebene, bezeichnung: schritt.bezeichnung });
  }
  return praefix.length > 0 ? praefix : undefined;
}

// Prüft eine Verfeinerungsstufe von groessterGemeinsamerPfad: `alleGleich`
// ist das Ergebnis des jeweiligen Feld-Vergleichs (siehe dort), `wert` der
// Wert von `erster` für dieses Feld. Bei Übereinstimmung wird `wert` (falls
// vorhanden) über `setzen` in den GGT übernommen und true zurückgegeben
// (Verfeinerung geht weiter); bei Uneinigkeit false (Aufrufer bricht mit dem
// bisherigen GGT ab). Als eigene Funktion statt vier Kopien derselben
// if/if-Struktur in groessterGemeinsamerPfad (absatz/unterabsatz/satz/
// satzInEintrag – alle vier identisch geformt, nur Feld und Typ wechseln).
function pruefeUndSetze<T>(
  alleGleich: boolean,
  wert: T | undefined,
  setzen: (wert: T) => void,
): boolean {
  if (!alleGleich) return false;
  if (wert !== undefined) setzen(wert);
  return true;
}

// Bildet den größten gemeinsamen Textpfad-Nenner mehrerer Blatt-Pfade
// derselben Norm: verfeinert Feld für Feld (bereich → absatz
// → unterabsatz → satz → eintraege (als Präfix, siehe
// gemeinsamerEintragPraefix) → satzInEintrag – dieselbe Hierarchie wie
// VERFEINERUNGS_EBENE in zitatParser.helpers.ts), bricht bei den
// Einzelfeldern beim ersten Feld ab, in dem sich die Blätter unterscheiden.
// Listen-`wiederholung` fließt bewusst NICHT ein – für die reine Zitat-Bildung
// (einziger Verwendungszweck dieser Funktion) ist die interne Dedup-Ziffer
// ohne Aussagekraft. Absatzwiederholungen begrenzen dagegen den gemeinsamen
// Absatz: verschiedene Vorkommen haben nur die ganze Norm gemeinsam.
function groessterGemeinsamerPfad(pfade: Textpfad[]): Textpfad {
  // erster beweisbar sicher: der einzige Aufrufer (ermittleMehrfachAuswahl)
  // gibt vorher zurück, falls blaetter/pfade leer wäre.
  const erster = pfade[0]!;
  const alleGleich = <K extends keyof Textpfad>(feld: K): boolean =>
    pfade.every((p) => (p[feld] ?? undefined) === (erster[feld] ?? undefined));

  // Unterschiedliche Bereiche haben nur die ganze Norm gemeinsam.
  // Ein Titel oder eine Bezeichnung ist jeweils ein unteilbares Blatt.
  if (!alleGleich('bereich')) return { typ: 'normtext' };
  if (erster.bereich) return { typ: 'bereich', bereich: erster.bereich };

  const ggt: Textpfad = { typ: 'normtext' };
  if (!pruefeUndSetze(alleGleich('absatz'), erster.absatz, (w) => (ggt.absatz = w))) return ggt;
  if (!pfade.every((p) => (p.absatzWiederholung ?? 0) === (erster.absatzWiederholung ?? 0)))
    return { typ: 'normtext' };
  if (erster.absatzWiederholung) ggt.absatzWiederholung = erster.absatzWiederholung;
  if (!pruefeUndSetze(alleGleich('unterabsatz'), erster.unterabsatz, (w) => (ggt.unterabsatz = w)))
    return ggt;
  if (
    !pruefeUndSetze(
      pfade.every((p) => satzNummer(p.satz) === satzNummer(erster.satz)),
      erster.satz,
      (w) => (ggt.satz = w),
    )
  )
    return ggt;

  const eintraegePraefix = gemeinsamerEintragPraefix(pfade.map((p) => p.eintraege));
  const kette = liesTextpfadEintraege(eintraegePraefix);
  if (!kette) return ggt;
  const mitEintrag: Textpfad = { ...ggt, eintraege: kette };
  // Nur wenn der Präfix die VOLLE Kette aller Blätter abdeckt (nicht nur
  // einen Teil), macht eine weitere Verfeinerung über satzInEintrag noch
  // Sinn – sonst unterscheiden sich die Blätter bereits innerhalb der
  // Eintrags-Kette, und der GGT bricht hier ab (analog zu den einfachen
  // alleGleich-Feldern oben).
  const volleLaenge = eintraegePraefix?.length === (erster.eintraege?.length ?? 0);
  if (!volleLaenge) return mitEintrag;

  pruefeUndSetze(
    pfade.every((p) => satzNummer(p.satzInEintrag) === satzNummer(erster.satzInEintrag)),
    erster.satzInEintrag,
    (w) => (mitEintrag.satzInEintrag = w),
  );
  return mitEintrag;
}

// ---------------------------------------------------------------------------
// Struktureller Pfad-Vergleich
// ---------------------------------------------------------------------------

/**
 * Vergleicht zwei Textpfade strukturell (Position innerhalb derselben Norm):
 * absatz → unterabsatz → satz → eintraege (schrittweise, siehe
 * vergleicheEintraege) → satzInEintrag, jeweils numerisch wo möglich. Dient
 * als Sekundärkriterium bei gleicher bezeichnung (siehe markierungSpeicher.ts).
 */
export function vergleicheTextpfad(a: Textpfad, b: Textpfad): number {
  const textVergleich = (x?: string, y?: string) =>
    (x ?? '').localeCompare(y ?? '', 'de', { numeric: true });
  return (
    textVergleich(a.absatz, b.absatz) ||
    (a.absatzWiederholung ?? 0) - (b.absatzWiederholung ?? 0) ||
    textVergleich(a.unterabsatz, b.unterabsatz) ||
    satzNummer(a.satz) - satzNummer(b.satz) ||
    vergleicheEintraege(a.eintraege, b.eintraege) ||
    satzNummer(a.satzInEintrag) - satzNummer(b.satzInEintrag)
  );
}

// Vergleicht zwei Eintrags-Ketten schrittweise (ebene → bezeichnung →
// wiederholung je Schritt), bricht beim ersten unterschiedlichen Schritt ab;
// bei gemeinsamer Präfix-Übereinstimmung entscheidet die kürzere Kette
// (analog zu String-Präfix-Vergleich).
function vergleicheEintraege(
  a?: readonly TextpfadEintrag[],
  b?: readonly TextpfadEintrag[],
): number {
  const ae = a ?? [];
  const be = b ?? [];
  const laenge = Math.min(ae.length, be.length);
  for (let i = 0; i < laenge; i++) {
    // ae[i]/be[i] beweisbar sicher: i < laenge = min(ae.length, be.length).
    const aEintrag = ae[i]!;
    const bEintrag = be[i]!;
    const ebeneVergleich = aEintrag.ebene.localeCompare(bEintrag.ebene);
    if (ebeneVergleich !== 0) return ebeneVergleich;
    const bezVergleich = aEintrag.bezeichnung.localeCompare(bEintrag.bezeichnung, 'de', {
      numeric: true,
    });
    if (bezVergleich !== 0) return bezVergleich;
    const wiederholungVergleich = (aEintrag.wiederholung ?? 0) - (bEintrag.wiederholung ?? 0);
    if (wiederholungVergleich !== 0) return wiederholungVergleich;
  }
  return ae.length - be.length;
}

/**
 * Prüft, ob ein gespeicherter Markierungs-Eintrag (Unterstreichung ODER
 * Hervorhebung – siehe MarkierungsEintrag in markierungSpeicher.ts) genau zu
 * diesem Textpfad (Blatt) gehört. undefined/undefined gilt als gleich (z.B.
 * unnummerierter Absatz). Bewusst unabhängig vom Markierungs-`typ` – die
 * Pfad-Identität ist typneutral (siehe auch ueberlapptAnderenTyp in
 * markierungSpeicher.ts, die genau deshalb dieselbe Funktion nutzt).
 */
// Zwei Eintrags-Ketten sind gleich, wenn `vergleicheEintraege` 0 liefert –
// das prüft bereits exakt Länge UND jeden Schritt (inkl. wiederholung), eine
// separate Gleichheitsfunktion wäre eine unnötige Dopplung derselben Logik
// (anders als eintragSchrittGleich oben, das bewusst NUR ebene+bezeichnung
// für einen Teil-Präfix-Vergleich prüft, siehe gemeinsamerEintragPraefix).

export function pfadGleich(a: Textpfad, b: Textpfad): boolean {
  return (
    (a.absatz ?? undefined) === (b.absatz ?? undefined) &&
    (a.absatzWiederholung ?? 0) === (b.absatzWiederholung ?? 0) &&
    (a.unterabsatz ?? undefined) === (b.unterabsatz ?? undefined) &&
    satzNummer(a.satz) === satzNummer(b.satz) &&
    vergleicheEintraege(a.eintraege, b.eintraege) === 0 &&
    satzNummer(a.satzInEintrag) === satzNummer(b.satzInEintrag) &&
    a.bereich === b.bereich
  );
}

/** Kanonische interne Pfadkennung; fehlende Wiederholungsindizes entsprechen 0, Sätze 1. */
export function textpfadSchluessel(pfad: Textpfad): string {
  return JSON.stringify([
    pfad.bereich ?? null,
    pfad.absatz ?? null,
    pfad.absatzWiederholung ?? 0,
    pfad.unterabsatz ?? null,
    satzNummer(pfad.satz),
    (pfad.eintraege ?? []).map((e) => [e.ebene, e.bezeichnung, e.wiederholung ?? 0]),
    satzNummer(pfad.satzInEintrag),
  ]);
}
