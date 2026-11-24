// Liest Inline-Text, Fortsetzungen und getaggte Verweise für die Strukturpipeline.

import { liesNormgeber } from '@/lib/domain/gesetzesreferenz';
import type { Gesetzesreferenz, GetaggterVerweis } from '@/lib/domain/gesetzTypes';

import type { TextpfadEintrag } from '@/lib/domain/gesetzTypes';
import { liesTextpfadEintraege, type Textpfad } from '@/lib/domain/textpfad/textpfad.index';

/** Zwischenstand beim rekursiven Aufbau eines Normtextpfads. */
export interface VerweisPfad {
  absatz?: string;
  absatzWiederholung?: number;
  unterabsatz?: string;
  satz?: number;
  eintraege?: TextpfadEintrag[];
  satzInEintrag?: number;
}

// ---------------------------------------------------------------------------
// Gemeinsame Inline-Verarbeitung (Text/Fortsetzung/<verweis>) – von parseSatz
// und parseListenEintrag genutzt, um die <verweis>-Erfassung nicht zweimal zu
// duplizieren (siehe Absprache: getaggte Verweise wie Verweismarkierung-
// Markierungen darstellen und klickbar machen).
// ---------------------------------------------------------------------------

interface RohVerweis {
  teil: 'text' | 'fortsetzung';
  start: number;
  ende: number;
  zielBezeichnung?: string;
  zielgesetz?: Gesetzesreferenz;
}

interface RohInlineErgebnis {
  text: string;
  fortsetzung: string;
  /** <nummer>/<litera>-Kindelemente in Dokumentreihenfolge (noch nicht geparst). */
  listenKinder: Element[];
  /** Zeichen-Bereiche im normalisierten Text bzw. lokal in der Fortsetzung. */
  verweiseRoh: RohVerweis[];
}

// Laufender Zwischenstand von verarbeiteInlineKinder – vor/nach dem ersten
// <nummer>/<litera>-Kind wird derselbe angehängte Text in text bzw.
// fortsetzung gesammelt (siehe hatKinder-Feld).
interface InlineZustand {
  text: string;
  fortsetzung: string;
  /** Ab dem ersten <nummer>/<litera>-Kind true – ab dann geht neuer Text in fortsetzung statt text. */
  hatKinder: boolean;
  /** Noch nicht ausgegebener gewöhnlicher Leerraum; entfällt am Blattrand/Umbruch. */
  leerraumAusstehend: boolean;
}

/** Glättet gewöhnlichen Leerraum über Inline-Grenzen hinweg beim Textaufbau. */
function anhaengen(zustand: InlineZustand, wert: string, umbruch = false): void {
  const teil = zustand.hatKinder ? 'fortsetzung' : 'text';
  if (umbruch) {
    zustand.leerraumAusstehend = false;
    if (zustand[teil]) zustand[teil] += '\n';
    return;
  }
  for (const zeichen of wert) {
    if (/[ \t\r\n]/.test(zeichen)) {
      zustand.leerraumAusstehend = true;
    } else {
      if (zustand.leerraumAusstehend && zustand[teil] && !zustand[teil].endsWith('\n')) {
        zustand[teil] += ' ';
      }
      zustand.leerraumAusstehend = false;
      zustand[teil] += zeichen;
    }
  }
}

// Getaggter Verweismarkierung (siehe verweisTagger.ts) – Zeichen-Bereich erfassen,
// Text und ausdrückliche Umbrüche im gemeinsamen Inline-Zustand übernehmen.
function verweisErfassen(
  childEl: Element,
  zustand: InlineZustand,
  verweiseRoh: RohVerweis[],
): void {
  const teil = zustand.hatKinder ? 'fortsetzung' : 'text';
  const vorher = zustand[teil].length;
  verarbeiteInlineTextKinder(childEl, zustand);
  // Ein ausgegebenes Trennleerzeichen gehört zum Wortzwischenraum, nicht
  // zum Bezugstext. Ausstehender Rand-Leerraum wurde noch nicht ausgegeben.
  const start = vorher + (zustand[teil][vorher] === ' ' ? 1 : 0);
  const ende = zustand[teil].length;
  const normgeber = liesNormgeber(childEl.getAttribute('normgeber') ?? undefined);
  if (childEl.hasAttribute('gesetz') && normgeber === undefined) return;
  verweiseRoh.push({
    teil,
    start,
    ende,
    zielBezeichnung: childEl.getAttribute('norm') ?? undefined,
    zielgesetz:
      childEl.hasAttribute('gesetz') && normgeber !== undefined
        ? {
            kurztitel: childEl.getAttribute('gesetz')!,
            normgeber,
          }
        : undefined,
  });
}

// Formatierungshüllen erhalten den Fließtext mitsamt seinen Inline-Markern.
// Strukturkinder werden hier nicht als Absätze oder Listeneinträge interpretiert.
function verarbeiteInlineTextKinder(
  el: Element,
  zustand: InlineZustand,
  verweiseRoh?: RohVerweis[],
): void {
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE || child.nodeType === Node.CDATA_SECTION_NODE) {
      anhaengen(zustand, child.textContent ?? '');
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const element = child as Element;
      if (element.tagName === 'zeilenumbruch') anhaengen(zustand, '', true);
      else if (element.tagName === 'verweis' && verweiseRoh)
        verweisErfassen(element, zustand, verweiseRoh);
      else verarbeiteInlineTextKinder(element, zustand, verweiseRoh);
    }
  }
}

function verarbeiteInlineElementKind(
  childEl: Element,
  zustand: InlineZustand,
  listenKinder: Element[],
  verweiseRoh: RohVerweis[],
): void {
  const tag = childEl.tagName.toLowerCase();
  if (tag === 'nummer' || tag === 'litera') {
    if (!zustand.hatKinder) zustand.leerraumAusstehend = false;
    zustand.hatKinder = true;
    listenKinder.push(childEl);
  } else if (tag === 'zeilenumbruch') {
    anhaengen(zustand, '', true);
  } else if (tag === 'verweis') {
    verweisErfassen(childEl, zustand, verweiseRoh);
  } else {
    // Unbekannte Inline-Elemente: Textinhalt übernehmen
    verarbeiteInlineTextKinder(childEl, zustand, verweiseRoh);
  }
}

// Baut Text/Fortsetzung eines <satz>- oder Listeneintrag-Elements auf
// (identische Logik wie bisher: Zeilenumbrüche, Unbekannte Inline-Elemente
// per Textinhalt übernehmen) und erfasst zusätzlich <verweis>-Tags mit ihrem
// Zeichen-Bereich.
export function verarbeiteInlineKinder(el: Element): RohInlineErgebnis {
  const zustand: InlineZustand = {
    text: '',
    fortsetzung: '',
    hatKinder: false,
    leerraumAusstehend: false,
  };
  const listenKinder: Element[] = [];
  const verweiseRoh: RohVerweis[] = [];

  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      anhaengen(zustand, child.textContent ?? '');
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      verarbeiteInlineElementKind(child as Element, zustand, listenKinder, verweiseRoh);
    }
  }

  // Führende Umbrüche werden gar nicht angehängt; nachlaufende können erst
  // am Ende des jeweiligen Textblatts sicher entfernt werden. NBSP bleibt erhalten.
  return {
    text: zustand.text.replace(/\n+$/, ''),
    fortsetzung: zustand.fortsetzung.replace(/\n+$/, ''),
    listenKinder,
    verweiseRoh,
  };
}

// Die Bereiche stimmen bereits mit dem normalisierten Text überein.
// Fortsetzungen verwenden wie TextBlatt das durchgehende Koordinatensystem
// text + fortsetzung; ihre lokalen Bereiche erhalten deshalb die Textlänge.
export function uebernehmeVerweise(
  roh: RohInlineErgebnis,
  pfad: VerweisPfad,
  sammler: GetaggterVerweis[],
): void {
  if (roh.verweiseRoh.length === 0) return;
  for (const v of roh.verweiseRoh) {
    const delta = v.teil === 'text' ? 0 : roh.text.length;
    // Leere Verweise hinter entfernten Randumbrüchen liegen am neuen Blattrand.
    const laenge = v.teil === 'text' ? roh.text.length : roh.fortsetzung.length;
    const start = Math.min(v.start, laenge) + delta;
    const ende = Math.min(v.ende, laenge) + delta;
    // Randumbrüche entfallen erst nach dem vollständigen Aufbau des Blatts.
    // Auch Bezugstext und Ziel-Fallback müssen den gekürzten Bereich verwenden.
    const text = v.teil === 'text' ? roh.text : roh.fortsetzung;
    const bezugstext = text.slice(start - delta, ende - delta);
    const { eintraege, satzInEintrag, ...basis } = pfad;
    const kette = liesTextpfadEintraege(eintraege);
    const textpfad: Textpfad = kette
      ? { typ: 'normtext', ...basis, eintraege: kette, satzInEintrag }
      : { typ: 'normtext', ...basis };
    sammler.push({
      textstelle: { pfad: textpfad, zeichenbereichStart: start, zeichenbereichEnde: ende },
      bezugstext,
      zielBezeichnung: v.zielBezeichnung ?? bezugstext,
      zielgesetz: v.zielgesetz,
    });
  }
}
