// textpfad.ts
//
// Kern: der Textpfad-Typ selbst sowie die Umwandlung einer browserseitigen
// DOM-Selektion (window.getSelection()) in eine strukturelle Text-Position
// innerhalb einer Norm (Textpfad). Die übrigen, ursprünglich hier
// mitgeführten Funktionsgruppen sind in eigene Dateien ausgelagert (Datei
// war über 780 Zeilen gewachsen, deutlich über dem 500-Zeilen-Richtwert):
//   - textpfad.vergleich.ts: Mehrfachauswahl/GGT-Bildung
//     (ermittleMehrfachAuswahl) sowie Pfad-Vergleich (vergleicheTextpfad,
//     pfadGleich).
//   - textpfad.rueckwaerts.ts: Textpfad → aktueller Text ohne DOM
//     (textAnTextpfad, aktuellerTextAnPfad).
// Die Darstellung von Markierungssegmenten liegt davon getrennt in
// lib/darstellung/textSegmentierung.ts. Die gemeinsamen Typen liegen in textpfadTypes.ts; diese Datei
// enthält ihre DOM-bezogene Auswertung.
//
// Grundprinzip: Jedes "Blatt" (der unmittelbare Text-Container von Satz-Text,
// Satz-Fortsetzung, Eintrag-Text oder Eintrag-Fortsetzung, sowie der Titel einer Norm/
// Überschrift) trägt beim Rendern die Attribute data-leaf (Marker) sowie
// optional data-absatz/data-satz/data-eintraege/data-bereich sowie data-zeichen-versatz (siehe Textpfad/versatz
// weiter unten – nötig, weil
// Satz-/Eintrag-Text und ihre jeweilige Fortsetzung denselben Textpfad teilen,
// aber zwei getrennte Blätter mit fortlaufender statt neu bei 0 beginnender
// Zeichenzählung sind). Der nächstgelegene Vorfahre mit data-xml-id liefert die
// Norm-Zuordnung. Damit lässt sich aus einer Selektion die Position
// rekonstruieren, ohne erneut die Gesetzes-XML zu parsen.
//
// Wichtige Einschränkung (v1, siehe Absprache): Eine Selektion, die mehr als
// ein Blatt überspannt (z.B. von einem Satz in eine nachfolgende
// Aufzählungsziffer hinein), wird abgelehnt – es entsteht kein Markierungs-
// Eintrag. Sätze innerhalb von Aufzählungseinträgen werden über
// satzInEintrag adressiert; auch dort gilt die Beschränkung auf ein Blatt.

import type {
  TextpfadEintrag,
  Eintragskette,
  Textpfad,
  Textstelle,
  NormtextBasis,
} from '@/lib/domain/textpfadTypes';
export type { Eintragskette, Textpfad, Textstelle } from '@/lib/domain/textpfadTypes';

/** Prüft fremde Eintragsdaten, ohne deren Struktur zu behaupten. */
export function liesTextpfadEintraege(roh: unknown): Eintragskette | undefined {
  if (!Array.isArray(roh) || roh.length === 0) return undefined;
  const eintraege: TextpfadEintrag[] = [];
  for (const wert of roh) {
    const schritt: unknown = wert;
    if (
      typeof schritt !== 'object' ||
      schritt === null ||
      !('ebene' in schritt) ||
      (schritt.ebene !== 'nummer' && schritt.ebene !== 'litera') ||
      !('bezeichnung' in schritt) ||
      typeof schritt.bezeichnung !== 'string' ||
      ('wiederholung' in schritt &&
        schritt.wiederholung !== undefined &&
        (typeof schritt.wiederholung !== 'number' ||
          !Number.isSafeInteger(schritt.wiederholung) ||
          schritt.wiederholung < 0))
    )
      return undefined;
    eintraege.push({
      ebene: schritt.ebene,
      bezeichnung: schritt.bezeichnung,
      ...('wiederholung' in schritt && typeof schritt.wiederholung === 'number'
        ? { wiederholung: schritt.wiederholung }
        : {}),
    });
  }
  const [erster, ...rest] = eintraege;
  return erster ? [erster, ...rest] : undefined;
}

export interface AuswahlErgebnis {
  xmlId: string;
  textstelle: Textstelle;
  bezugstext: string;
}

export type AuswahlFehler = { fehler: 'leer' | 'ueberspannt-mehrere' };

/** Fehlende Zahl ist undefined, eine vorhandene ungültige Zahl ist null. */
function liesDomZahl(blatt: Element, attribut: string): number | null | undefined {
  const roh = blatt.getAttribute(attribut);
  if (roh === null) return undefined;
  const zahl = Number(roh);
  return /^\d+$/.test(roh) && Number.isSafeInteger(zahl) ? zahl : null;
}

function liesDomNormtext(blatt: Element): Textpfad | undefined {
  const absatzWiederholung = liesDomZahl(blatt, 'data-absatz-wiederholung');
  const satz = liesDomZahl(blatt, 'data-satz');
  const satzInEintrag = liesDomZahl(blatt, 'data-satz-in-eintrag');
  if (absatzWiederholung === null || satz === null || satzInEintrag === null) return undefined;
  const basis: NormtextBasis = { typ: 'normtext' };
  const absatz = blatt.getAttribute('data-absatz');
  if (absatz) basis.absatz = absatz;
  const unterabsatz = blatt.getAttribute('data-unterabsatz');
  if (unterabsatz) basis.unterabsatz = unterabsatz;
  if (absatzWiederholung) basis.absatzWiederholung = absatzWiederholung;
  if (satz !== undefined) basis.satz = satz;
  const roh = blatt.getAttribute('data-eintraege');
  if (roh === null) return satzInEintrag === undefined ? basis : undefined;
  let kette: Eintragskette | undefined;
  try {
    kette = liesTextpfadEintraege(JSON.parse(roh));
  } catch {
    return undefined;
  }
  if (!kette) return undefined;
  return { ...basis, eintraege: kette, ...(satzInEintrag !== undefined ? { satzInEintrag } : {}) };
}

/** Liest die Blattattribute; ungültige vorhandene Pfadangaben ergeben keinen Pfad. */
export function blattPfad(blatt: Element): Textpfad | undefined {
  const bereich = blatt.getAttribute('data-bereich');
  if (bereich === null) return liesDomNormtext(blatt);
  if (
    bereich !== 'amtlicherTitel' &&
    bereich !== 'nichtamtlicherTitel' &&
    bereich !== 'bezeichnung'
  )
    return undefined;
  const normtextAttribute = [
    'absatz',
    'absatz-wiederholung',
    'unterabsatz',
    'satz',
    'satz-in-eintrag',
    'eintraege',
  ];
  if (normtextAttribute.some((name) => blatt.hasAttribute(`data-${name}`))) return undefined;
  return { typ: 'bereich', bereich };
}

/**
 * Ermittelt XML-ID, Textpfad, Zeichenbereich und Bezugstext aus der ersten
 * Range einer Browser-Selektion im gerenderten Gesetzestext. Erwartet die
 * Browser-Selection-/Range-APIs und gültige interne data-leaf-Attribute mit
 * einem zugeordneten data-xml-id-Vorfahren; ungültige Pfadangaben werden abgelehnt.
 * Fehlende Range oder leerer Auswahltext liefern „leer“. Kein eindeutig
 * berührtes Blatt, mehrere Blätter oder fehlende XML-ID liefern
 * „ueberspannt-mehrere“. Sätze in Listeneinträgen sind eigene Blätter.
 * Zeichenpositionen berücksichtigen den Fortsetzungsversatz des Blatts.
 */
export function ermittleAuswahl(selection: Selection | null): AuswahlErgebnis | AuswahlFehler {
  if (!selection || selection.rangeCount === 0) return { fehler: 'leer' };
  const bezugstext = selection.toString();
  if (!bezugstext) return { fehler: 'leer' };

  const range = selection.getRangeAt(0);

  if (enthaeltNichtMarkierbarenText(range)) return { fehler: 'ueberspannt-mehrere' };

  const blatt = ermittleBlatt(range);
  if (!blatt) return { fehler: 'ueberspannt-mehrere' };

  const xmlId = blatt.closest('[data-xml-id]')?.getAttribute('data-xml-id');
  if (!xmlId) return { fehler: 'ueberspannt-mehrere' };

  const pfad = blattPfad(blatt);
  if (!pfad) return { fehler: 'ueberspannt-mehrere' };

  // Versatz: siehe TextBlatt in textBlatt.tsx – wenn
  // dieses Blatt die Fortsetzung eines Satzes/Eintrags nach einer
  // eingeschobenen Aufzählung ist, zählen die Zeichen dort NICHT wieder bei 0,
  // sondern setzen die Zählung des vorangehenden Teils fort (beide teilen
  // sich denselben Textpfad, da es sich um denselben Satz/Eintrag handelt).
  const versatz = Number(blatt.getAttribute('data-zeichen-versatz') ?? '0');

  // Die tatsächliche DOM-Auswahl auf die Grenzen des Blatts klemmen: An
  // Übergängen zwischen einem Text-Geschwister (z.B. dem Trenner ": " vor
  // einem Überschriften-Titel) und dem Blatt selbst liefert der Browser als
  // Start-/Ende-Container gelegentlich den GESCHWISTER-Knoten (mit einem
  // Offset, der position ell exakt der Blattgrenze entspricht) statt eines
  // Knotens innerhalb des Blatts – sichtbar markiert ist dabei trotzdem
  // nichts vom Geschwister-Text. Ohne Klemmung würde absoluterOffsetImBlatt
  // dafür einen Fehler werfen bzw. einen Knoten außerhalb des Blatts zählen.
  const auswahlRange = auswahlImBlatt(range, blatt);

  return {
    xmlId,
    textstelle: {
      pfad,
      zeichenbereichStart:
        versatz +
        absoluterOffsetImBlatt(blatt, auswahlRange.startContainer, auswahlRange.startOffset),
      zeichenbereichEnde:
        versatz + absoluterOffsetImBlatt(blatt, auswahlRange.endContainer, auswahlRange.endOffset),
    },
    bezugstext,
  };
}

/** Tatsächliche Zeichen zählen; leere Grenzberührungen bleiben erlaubt. */
export function enthaeltNichtMarkierbarenText(range: Range): boolean {
  const vorfahr = range.commonAncestorContainer;
  const wurzel = vorfahr instanceof Element ? vorfahr : vorfahr.parentElement;
  if (!wurzel) return false;
  if (wurzel.closest('[data-nicht-markierbar]')) return range.toString().length > 0;
  return Array.from(wurzel.querySelectorAll('[data-nicht-markierbar]')).some((el) =>
    enthaeltAusgewaehlteZeichen(range, el),
  );
}

/** Prüft die Schnittmenge anhand ihrer Zeichen statt nur ihrer Elementhüllen. */
export function enthaeltAusgewaehlteZeichen(range: Range, element: Element): boolean {
  return (
    range.intersectsNode(element) &&
    (auswahlImBlatt(range, element).cloneContents().textContent?.length ?? 0) > 0
  );
}

// Dieselbe Schnittmenge für Blatt-Erkennung und Zeichenpositionen verwenden.
// Nur die Kopie verändern; die sichtbare Browser-Auswahl bleibt unverändert.
function auswahlImBlatt(range: Range, blatt: Element): Range {
  const inhalt = document.createRange();
  inhalt.selectNodeContents(blatt);
  const schnitt = range.cloneRange();
  if (schnitt.compareBoundaryPoints(Range.START_TO_START, inhalt) < 0) {
    schnitt.setStart(inhalt.startContainer, inhalt.startOffset);
  }
  if (schnitt.compareBoundaryPoints(Range.END_TO_END, inhalt) > 0) {
    schnitt.setEnd(inhalt.endContainer, inhalt.endOffset);
  }
  return schnitt;
}

// Findet das eine Blatt, das von der Auswahl (mit-)berührt wird.
//
// Warum nicht einfach closest() vom Start-/Ende-Container aus? Beginnt (oder
// endet) eine Auswahl exakt an der Grenze zwischen einem Blatt und einem
// Text-Geschwister davor/danach (z.B. dem Trenner ": " vor einem
// Überschriften-Titel), liefert der Browser als Container oft den
// GESCHWISTER-Knoten – kein Nachfahre des Blatts, closest() würde also nichts
// finden, obwohl visuell nur Zeichen innerhalb des Blatts markiert sind
// (Bug: erstes Zeichen eines Blatts nicht markierbar). Der robuste Weg ist
// daher, vom gemeinsamen Vorfahren der Auswahl aus alle Blätter zu suchen,
// die tatsächlich ausgewählte Zeichen enthalten. Selbst eine strukturelle
// Überlappung der Inhaltsgrenzen kann nur eine leere Elementhülle enthalten,
// etwa vom Ende des Bezeichnungstextes bis zum Ende seines umgebenden span.
function ermittleBlatt(range: Range): Element | null {
  // Ein Zusatztext hat absichtlich kein Textblatt. Echte Zeichen daraus dürfen
  // bei einer gemischten Auswahl nicht still auf das benachbarte Blatt gekürzt
  // werden. Leere, nur an der Auswahlgrenze berührte Hüllen bleiben erlaubt.
  const zusatztexte = range.cloneContents().querySelectorAll('[data-zusatztext]');
  if (Array.from(zusatztexte).some((el) => (el.textContent?.length ?? 0) > 0)) return null;
  const commonAncestor = range.commonAncestorContainer;
  const wurzel =
    commonAncestor.nodeType === Node.ELEMENT_NODE
      ? (commonAncestor as Element)
      : commonAncestor.parentElement;
  if (!wurzel) return null;

  // Häufigster Fall: gemeinsamer Vorfahre liegt bereits innerhalb (oder ist)
  // eines Blatts – dann berührt die Auswahl zwangsläufig nur dieses eine.
  const eigenesBlatt = wurzel.closest('[data-leaf]');
  if (eigenesBlatt) return eigenesBlatt;

  const kandidaten = Array.from(wurzel.querySelectorAll('[data-leaf]')).filter((el) =>
    enthaeltAusgewaehlteZeichen(range, el),
  );
  // kandidaten[0] beweisbar sicher durch length === 1 direkt davor.
  return kandidaten.length === 1 ? kandidaten[0]! : null;
}

// Zählt die Zeichen von Blatt-Anfang bis zur angegebenen Position (Knoten +
// Offset innerhalb dieses Knotens). Nötig, weil range.startOffset/endOffset
// nur relativ zum jeweiligen Text-Knoten zählen – bei bereits vorhandenen
// Unterstreichungen ist das Blatt aber in mehrere Segmente (Kind-Knoten)
// aufgeteilt, deren jeweils eigene Zeichen davor sonst nicht mitgezählt würden.
//
// Zitatanhänge (ZitatText, data-zitatanhang – der an einen Verweis mit
// Textbezug angehängte Normzitat-Text, z.B. "Art. 1 GG" in "Würde Art. 1 GG")
// sitzen als Geschwister-Text INNERHALB desselben Blatts, gehören aber nicht
// zum eigentlichen Gesetzestext. Sie werden daher aus dem geklonten Fragment
// entfernt, bevor gezählt wird – sonst würden ihre Zeichen bei jeder Selektion
// NACH einem Verweis fälschlich mitgezählt und die Markierung zu weit hinten
// gespeichert.
function absoluterOffsetImBlatt(blatt: Element, knoten: Node, offset: number): number {
  const hilfsRange = document.createRange();
  hilfsRange.selectNodeContents(blatt);
  hilfsRange.setEnd(knoten, offset);
  const fragment = hilfsRange.cloneContents();
  fragment.querySelectorAll('[data-zitatanhang]').forEach((el) => el.remove());
  return fragment.textContent?.length ?? 0;
}
