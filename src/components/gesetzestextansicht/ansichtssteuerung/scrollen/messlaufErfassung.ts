// messlaufErfassung.ts
// Rekorder je Gesetzestextansicht für den Messlauf Stufe 2: erfasst Rohdaten der
// Virtualisierung, nur im Entwicklungsbetrieb. Im Produktionsbau entsteht kein Rekorder; jede
// Anbindung reicht dann unverändert durch. Die Rohdaten sind reine Diagnose, nie Grundlage für
// Darstellung oder Bedienung und nicht im React-Zustand.
//
// Begriffe (Plan „Scrollen in langen Gesetzen“, Grundlagen):
// - Höhenschätzung: angenommene Höhe eines noch nicht gemessenen Elements; Gegenstück: gemessene
//   Höhe. Erfasst wird je Element (nach Element-ID) das Paar aus Schätzung und erster Messung.
//   Spätere Messungen desselben Elements (Zuklappen, Aufklappen, Breiten- oder Schriftwechsel)
//   zählen nicht als Erstmessung; die Aufzeichnungsdiagnose erfasst sie getrennt.
// - Höhenkorrektur: vom Programm geschriebene Änderung der Scrollposition, wenn ein Element
//   oberhalb des Sichtbereichs seine Höhe ändert. Erfasst an der Scrollfunktion der Bibliothek,
//   soweit sie mit Korrekturbetrag schreibt; Navigation schreibt ohne und zählt nicht.
// - Gesamthöhe: Länge der virtuellen Liste (Scrollbalken), erfasst bei jeder Änderung.
// - Aufrufe: wie oft die Bibliothek Schlüssel- und Schätzfunktion aufruft (vor dem
//   Schätzwert-Speicher, also jede Anfrage der Bibliothek).
// - Messlauf: Messung von Stocken und Textsprüngen in Zahlen; Stufe 2 im Entwicklungsbetrieb.
import { meldeScrollDiagnose } from '@/lib/utils/scrollAufzeichnungDiagnose';
import type { Virtualizer } from '@tanstack/react-virtual';
import {
  werteMesslaufAus,
  type Hoehenpaar,
  type MesslaufBildreihen,
  type MesslaufRohdaten,
} from '@/lib/utils/messlaufKennzahlen';

type TextVirtualizer = Virtualizer<HTMLDivElement, Element>;
type Messfunktion = (
  element: Element,
  eintrag: ResizeObserverEntry | undefined,
  instanz: TextVirtualizer,
) => number;
type Scrollfunktion = (
  offset: number,
  optionen: { adjustments?: number; behavior?: ScrollBehavior },
  instanz: TextVirtualizer,
) => void;

interface ErfassteRohdaten extends MesslaufRohdaten {
  readonly hoehen: readonly (Hoehenpaar & { elementId: string; zeitpunkt: number })[];
}

/** Längste ausgegebene Bezeichnung; längere Überschriftentexte werden gekürzt. */
const BEZEICHNUNG_HOECHSTLAENGE = 60;

function kuerze(text: string) {
  return text.length > BEZEICHNUNG_HOECHSTLAENGE
    ? `${text.slice(0, BEZEICHNUNG_HOECHSTLAENGE - 1)}…`
    : text;
}

/** Lesezugriff für den Messlauf. */
export interface MesslaufRekorder {
  rohdaten(): ErfassteRohdaten;
  auswerten(
    optionen: { zeilenhoehe: number },
    bildreihen?: MesslaufBildreihen,
  ): ReturnType<typeof werteMesslaufAus>;
  /** Verwirft alle Rohdaten; bereits gemessene Elemente gelten weiter als gemessen. */
  zuruecksetzen(): void;
  /** Verwirft alle gemessenen Höhen der Bibliothek (ungemessener Zustand); die nächste Messung
   * je Element gilt wieder als erste. Der Virtualizer selbst bleibt privat. */
  messungenVerwerfen(): void;
}

/** Angaben der Ansicht zu einem Index, ohne die Zählung der Bibliotheksaufrufe zu berühren. */
interface Elementangaben {
  elementId: string;
  /** XML-ID und lesbare Bezeichnung (Normbezeichnung bzw. Überschriftentext): Die Element-ID
   * entsteht beim Parsen zufällig und ist im XML nicht auffindbar. */
  xmlId: string;
  bezeichnung: string;
  art: string;
  schluessel: string;
  schaetzung: number;
}

interface MesslaufErfassung extends MesslaufRekorder {
  zaehle<T>(art: 'getItemKey' | 'estimateSize', fn: (index: number) => T): (index: number) => T;
  umhuelleMessung(messen: Messfunktion, angaben: (index: number) => Elementangaben): Messfunktion;
  umhuelleScrollfunktion(scrollen: Scrollfunktion): Scrollfunktion;
  erfasseGesamthoehe(hoehe: number): void;
  /** Hinterlegt, wie die Bibliothek ihre gemessenen Höhen verwirft. */
  verbindeVerwerfen(verwerfen: () => void): void;
}

/** Im Produktionsbau undefined: kein Rekorder, kein Zustand. */
export function erstelleMesslaufErfassung(): MesslaufErfassung | undefined {
  if (!import.meta.env.DEV) return undefined;
  const gemessen = new Set<string>();
  let hoehen: (Hoehenpaar & { elementId: string; zeitpunkt: number })[] = [];
  let korrekturen: { betrag: number; zeitpunkt: number }[] = [];
  let gesamthoehen: { zeitpunkt: number; hoehe: number }[] = [];
  const aufrufe = { getItemKey: 0, estimateSize: 0 };
  let verwerfen = () => {};
  const rohdaten = () => ({ hoehen, korrekturen, gesamthoehen, aufrufe: { ...aufrufe } });
  return {
    rohdaten,
    auswerten: (optionen, bildreihen) => werteMesslaufAus(rohdaten(), optionen, bildreihen),
    zuruecksetzen() {
      hoehen = [];
      korrekturen = [];
      gesamthoehen = [];
      aufrufe.getItemKey = 0;
      aufrufe.estimateSize = 0;
    },
    messungenVerwerfen() {
      gemessen.clear();
      verwerfen();
    },
    verbindeVerwerfen(fn) {
      verwerfen = fn;
    },
    zaehle(art, fn) {
      return (index: number) => {
        aufrufe[art]++;
        return fn(index);
      };
    },
    umhuelleMessung(messen, angaben) {
      return (element, eintrag, instanz) => {
        const index = instanz.indexFromElement(element);
        const angabe = index >= 0 && index < instanz.options.count ? angaben(index) : undefined;
        const erstmessung = !!angabe && !gemessen.has(angabe.elementId);
        const geschaetzt = erstmessung && !instanz.itemSizeCache.has(angabe.schluessel);
        const vorher = angabe ? instanz.itemSizeCache.get(angabe.schluessel) : undefined;
        const hoehe = messen(element, eintrag, instanz);
        if (angabe && vorher !== hoehe)
          meldeScrollDiagnose(
            {
              art: 'element-gemessen',
              xmlId: angabe.xmlId,
              erstmessung,
              vorher: vorher ?? null,
              hoehe,
              breite: eintrag?.borderBoxSize?.[0]?.inlineSize ?? null,
            },
            instanz.scrollElement,
          );
        if (!angabe || !erstmessung) return hoehe;
        gemessen.add(angabe.elementId);
        if (geschaetzt)
          hoehen.push({
            elementId: angabe.elementId,
            xmlId: angabe.xmlId,
            bezeichnung: kuerze(angabe.bezeichnung),
            art: angabe.art,
            geschaetzt: angabe.schaetzung,
            gemessen: hoehe,
            zeitpunkt: performance.now(),
          });
        return hoehe;
      };
    },
    umhuelleScrollfunktion(scrollen) {
      return (offset, optionen, instanz) => {
        const vorher = instanz.scrollElement?.scrollTop ?? null;
        scrollen(offset, optionen, instanz);
        meldeScrollDiagnose(
          {
            art: 'scroll-schreiben',
            anlass: optionen.adjustments ? 'virtualizer-hoehenkorrektur' : 'virtualizer',
            vorher,
            angefordert: offset + (optionen.adjustments ?? 0),
            offset,
            korrektur: optionen.adjustments ?? 0,
            erreicht: instanz.scrollElement?.scrollTop ?? null,
            verhalten: optionen.behavior ?? 'auto',
          },
          instanz.scrollElement,
        );
        if (optionen.adjustments)
          korrekturen.push({ betrag: optionen.adjustments, zeitpunkt: performance.now() });
      };
    },
    erfasseGesamthoehe(hoehe) {
      if (gesamthoehen.at(-1)?.hoehe === hoehe) return;
      gesamthoehen.push({ zeitpunkt: performance.now(), hoehe });
    },
  };
}
