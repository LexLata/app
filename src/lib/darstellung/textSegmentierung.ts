// textSegmentierung.ts
//
// Ausgelagert aus textpfad.ts (siehe dortiger Kopfkommentar für die
// vollständige Aufteilung). Zerlegt Blatt-Text anhand von (Markierungs-)
// Zeichen-Bereichen in Segmente für die Darstellung (segmentiere) sowie das
// Formatieren getaggter Zitate (formatiereGetaggtesZitat).

import type { GetaggterVerweis } from '@/lib/domain/gesetzTypes';
import type { Textauszeichnung } from './textauszeichnung';
import type { MarkierungsTyp } from '@/lib/markierungen/markierungen.index';
import type { VerweisInhalt } from '@/lib/markierungen/markierungen.index';

export interface TextSegment {
  text: string;
  /** Klickziel eines getaggten Verweises unter einer Nutzermarkierung. */
  getaggterVerweis?: GetaggterVerweis;
  /** Verweis-Teilbereiche innerhalb einer ungeteilten Hervorhebung/eines Kommentars. */
  getaggteVerweisTeile?: { text: string; verweis?: GetaggterVerweis }[];
  /** null = keine Markierung an dieser Stelle. */
  typ: MarkierungsTyp | 'getaggterVerweis' | null;
  /** Nur bei typ 'verweismarkierung' gesetzt: Verweisinhalt (Rohtext + Zielnormen) für
   *  die Inline-Anzeige (siehe VerweisAnzeige in textBlatt.tsx). */
  verweisinhalt?: VerweisInhalt;
  /** Nur bei typ 'kommentar' gesetzt: der eigentliche Kommentartext (siehe
   *  MarkierungsEintrag.kommentarText, markierungSpeicher.ts) – wird von der
   *  Darstellung selbst nicht angezeigt (nur das Infosymbol, siehe
   *  KommentarSymbol in textBlatt.tsx), muss aber bis dorthin
   *  durchgereicht werden, um beim Klick das Hilfsfenster zum Bearbeiten vorauszufüllen. */
  kommentarText?: string;
}

// Gruppierungsschlüssel für das Zusammenführen angrenzender Bereiche (siehe
// segmentiere unten): bei 'unterstreichung'/'hervorhebung' reicht der Typ selbst, bei
// 'verweismarkierung' müssen zusätzlich ZWEI Verweise auf dieselbe Zielnorm vorliegen,
// bei 'kommentar' zwei Kommentare mit identischem Text – sonst würden zwei
// inhaltlich verschiedene, nur zufällig direkt aneinandergrenzende Verweise/
// Kommentare fälschlich zu einem Segment verschmelzen.
function zielSchluessel(b: {
  typ: MarkierungsTyp | 'getaggterVerweis';
  verweisinhalt?: VerweisInhalt;
  kommentarText?: string;
  markierungIndex?: number;
  verweis?: GetaggterVerweis;
}): string {
  // Die interaktive Anzeige muss die Grenzen gespeicherter Einträge erhalten,
  // damit ein Rechtsklick weiterhin genau einen Eintrag bearbeiten kann.
  if (b.markierungIndex !== undefined) return `markierung:${b.markierungIndex}`;
  if (b.typ === 'getaggterVerweis')
    return `getaggt:${formatiereGetaggtesZitat(b.verweis?.zielBezeichnung ?? '', b.verweis?.zielgesetz?.kurztitel)}`;
  if (b.typ === 'verweismarkierung') {
    // Zwei angrenzende Verweis-Bereiche gelten nur als „derselbe" Verweis,
    // wenn ihr kompletter Rohtext identisch ist – ausreichend robust, da zwei
    // inhaltlich verschiedene Verweise praktisch nie denselben verweistext haben.
    return `verweis:${b.verweisinhalt?.verweistext ?? ''}`;
  }
  if (b.typ === 'kommentar') {
    return `kommentar:${b.kommentarText ?? ''}`;
  }
  return b.typ;
}

/**
 * Formatiert die volle Zielbezeichnung aus dem <verweis norm="…">-Attribut
 * (GetaggterVerweis.zielBezeichnung), ergänzt um das optionale Zielgesetz.
 * Der Text wird nicht gerendert: Er dient als Zusammenführungsschlüssel
 * `getaggt:${verweistext}` in segmentiere. Angezeigt wird
 * der Wortlaut der Quelle; Quellenverweise erhalten keinen Zitatanhang.
 * Manuelle Verweismarkierungen verwenden dagegen den eingegebenen
 * verweistext für die Anzeige.
 */
export function formatiereGetaggtesZitat(bezeichnung: string, gesetz?: string): string {
  return gesetz ? `${bezeichnung} ${gesetz}` : bezeichnung;
}

/**
 * Zerlegt `text` anhand der übergebenen (bereits auf dieses eine Blatt
 * gefilterten) Zeichen-Bereiche in Segmente. Überlappende Bereiche gleichen
 * Typs (bei 'verweismarkierung': gleichen Ziels, siehe zielSchluessel) werden
 * zusammengeführt. Bereiche, die außerhalb der Textlänge liegen (z.B. weil
 * sich der Norminhalt seit dem Markieren geändert hat), werden geclippt statt
 * einen Fehler zu werfen.
 *
 * Unterstreichung, Hervorhebung und (textbezogener) Verweismarkierung schließen
 * sich an derselben Stelle gegenseitig aus (siehe Konkurrenz-Regeln in
 * markierungSpeicher.ts, dort beim Speichern durchgesetzt) – überlappen zwei
 * Bereiche hier dennoch ECHT (nicht nur aneinandergrenzend) mit
 * unterschiedlichem Typ/Ziel (z.B. durch manuell bearbeitete XML), gewinnt
 * der nach Start-Position zuerst sortierte Bereich. Reines Aneinandergrenzen
 * (ein Bereich endet exakt dort, wo der nächste beginnt) ist dagegen der
 * NORMALFALL bei zwei unmittelbar benachbarten Markierungen unterschiedlichen
 * Typs (z.B. eine Hervorhebung direkt gefolgt von einem Verweismarkierung ohne
 * Lücke dazwischen) und wird NICHT als Konflikt behandelt – beide Bereiche
 * bleiben als eigene Segmente erhalten.
 * Getaggte Verweise bilden eine Ausnahme: Nutzermarkierungen gewinnen nur
 * im überlappenden Teil; das getaggte Klickziel bleibt dabei erhalten.
 * Bereiche außerhalb der Nutzermarkierung bleiben als Verweis sichtbar.
 * Nur bei GLEICHEM Ziel wird
 * aneinandergrenzend weiterhin nahtlos zusammengeführt (siehe zielSchluessel).
 */
interface ZeichenBereich {
  zeichenbereichStart: number;
  zeichenbereichEnde: number;
  typ: MarkierungsTyp | 'getaggterVerweis';
  verweisinhalt?: VerweisInhalt;
  verweis?: GetaggterVerweis;
  kommentarText?: string;
  markierungIndex?: number;
}

/** Führt die beiden fachlichen Quellen erschöpfend in die Segmentierung. */
function zeichenBereich(
  auszeichnung: Textauszeichnung,
  index: number | undefined,
): ZeichenBereich | undefined {
  switch (auszeichnung.typ) {
    case 'getaggterVerweis':
      return {
        ...auszeichnung.verweis.textstelle,
        typ: 'getaggterVerweis',
        verweis: auszeichnung.verweis,
      };
    case 'markierung': {
      const markierung = auszeichnung.markierung;
      if (markierung.bezug.typ !== 'bezugstext') return undefined;
      return {
        ...markierung.bezug.textstelle,
        typ: markierung.typ,
        verweisinhalt: markierung.verweisinhalt,
        kommentarText: markierung.kommentarText,
        markierungIndex: index,
      };
    }
  }
}

export function segmentiere(
  text: string,
  auszeichnungen: Textauszeichnung[],
  erhalteEintragsgrenzen = false,
): TextSegment[] {
  const bereiche = auszeichnungen.flatMap((a, i) => {
    const bereich = zeichenBereich(a, erhalteEintragsgrenzen ? i : undefined);
    return bereich ? [bereich] : [];
  });
  if (bereiche.length === 0) return [{ text, typ: null }];
  const getaggte = bereiche.filter((b) => b.typ === 'getaggterVerweis');
  if (getaggte.length > 0 && bereiche.some((b) => b.typ !== 'getaggterVerweis')) {
    const nutzerSegmente = segmentiereOhneUeberlagerung(
      text,
      bereiche.filter((b) => b.typ !== 'getaggterVerweis'),
    );
    return ueberlagereGetaggteVerweise(nutzerSegmente, getaggte);
  }
  return segmentiereOhneUeberlagerung(text, bereiche);
}

/** Konkurrenzregeln der gespeicherten Markierungen und reine Quellenverweise. */
function segmentiereOhneUeberlagerung(text: string, bereiche: ZeichenBereich[]): TextSegment[] {
  const geclippt = bereiche
    .map((b) => ({
      start: Math.max(0, Math.min(b.zeichenbereichStart, text.length)),
      ende: Math.max(0, Math.min(b.zeichenbereichEnde, text.length)),
      typ: b.typ,
      verweisinhalt: b.verweisinhalt,
      verweis: b.verweis,
      kommentarText: b.kommentarText,
      markierungIndex: b.markierungIndex,
    }))
    .filter((b) => b.ende > b.start)
    .sort((a, b) => a.start - b.start);

  // Echte Überlappung (b.start < letzter.ende) bei gleichem Ziel
  // zusammenführen, bei anderem Ziel verwerfen (erster gewinnt). Reines
  // Aneinandergrenzen (b.start === letzter.ende) dagegen nur bei GLEICHEM
  // Ziel zusammenführen – bei unterschiedlichem Ziel ist es kein Konflikt,
  // beide Bereiche bleiben als eigene Segmente bestehen (siehe
  // Funktionskommentar oben).
  const zusammengefuehrt: {
    start: number;
    ende: number;
    typ: MarkierungsTyp | 'getaggterVerweis';
    verweisinhalt?: VerweisInhalt;
    verweis?: GetaggterVerweis;
    kommentarText?: string;
    markierungIndex?: number;
  }[] = [];
  for (const b of geclippt) {
    const letzter = zusammengefuehrt.at(-1);
    if (letzter && b.start < letzter.ende) {
      if (zielSchluessel(b) === zielSchluessel(letzter))
        letzter.ende = Math.max(letzter.ende, b.ende);
      continue;
    }
    if (letzter && b.start === letzter.ende && zielSchluessel(b) === zielSchluessel(letzter)) {
      letzter.ende = Math.max(letzter.ende, b.ende);
      continue;
    }
    zusammengefuehrt.push({ ...b });
  }

  const segmente: TextSegment[] = [];
  let position = 0;
  for (const b of zusammengefuehrt) {
    if (b.start > position) segmente.push({ text: text.slice(position, b.start), typ: null });
    segmente.push({
      text: text.slice(b.start, b.ende),
      typ: b.typ,
      verweisinhalt: b.verweisinhalt,
      getaggterVerweis: b.verweis,
      kommentarText: b.kommentarText,
    });
    position = b.ende;
  }
  if (position < text.length) segmente.push({ text: text.slice(position), typ: null });
  return segmente;
}

/** Teilt nur die Darstellung; gespeicherte Markierungsbereiche bleiben erhalten. */
function ueberlagereGetaggteVerweise(
  segmente: TextSegment[],
  getaggte: ZeichenBereich[],
): TextSegment[] {
  let position = 0;
  return segmente.flatMap((segment) => {
    const start = position;
    const ende = start + segment.text.length;
    position = ende;
    if (segment.typ === 'verweismarkierung') return [segment];
    const grenzen = [
      ...new Set([
        start,
        ende,
        ...getaggte.flatMap((b) => [
          Math.max(start, Math.min(ende, b.zeichenbereichStart)),
          Math.max(start, Math.min(ende, b.zeichenbereichEnde)),
        ]),
      ]),
    ].sort((a, b) => a - b);
    const teile: TextSegment[] = grenzen.slice(0, -1).map((von, i) => {
      const bis = grenzen[i + 1]!;
      const verweis = getaggte.find(
        (b) => b.zeichenbereichStart <= von && b.zeichenbereichEnde >= bis,
      );
      const teil = { ...segment, text: segment.text.slice(von - start, bis - start) };
      if (!verweis) return teil;
      if (segment.typ !== null) return { ...teil, getaggterVerweis: verweis.verweis };
      return {
        ...teil,
        typ: verweis.typ,
        getaggterVerweis: verweis.verweis,
      };
    });
    return erhalteMarkierungsBereich(segment, teile);
  });
}

/** Ein Hintergrund und ein Kommentarsymbol gehören zum ganzen Nutzerbereich. */
function erhalteMarkierungsBereich(segment: TextSegment, teile: TextSegment[]): TextSegment[] {
  if (segment.typ !== 'hervorhebung' && segment.typ !== 'kommentar') return teile;
  if (!teile.some((teil) => teil.getaggterVerweis)) return [segment];
  return [
    {
      ...segment,
      getaggteVerweisTeile: teile.map((teil) => ({
        text: teil.text,
        verweis: teil.getaggterVerweis,
      })),
    },
  ];
}
