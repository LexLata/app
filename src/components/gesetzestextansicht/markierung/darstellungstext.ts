// darstellungstext.ts
// Interner Darstellungsvertrag: Schutz der vollständigen Quelle vor jeder
// Teilung. Die Kennzeichnung ist nur durch diese Fabriken und geprüfte
// UTF-16-Teilungen erhältlich; Fachdaten und Verweisobjekte bleiben unverändert.
import {
  schuetzeLeerzeichen,
  schuetzeLeerzeichenZitat,
} from '@/lib/domain/basis/textNachbearbeitung';
import { segmentiere, type TextSegment } from '@/lib/darstellung/darstellung.index';

// Das private Instanzfeld erhält den nominalen Vertrag auch gegenüber
// Objektkopien per Spread mit einem ausgetauschten text-Feld.
class Darstellungstext {
  readonly #text: string;

  constructor(text: string) {
    this.#text = text;
  }

  get text(): string {
    return this.#text;
  }
}

export type GeschuetzterDarstellungstext = Darstellungstext;

export type GeschuetztesDarstellungssegment = Readonly<
  Omit<TextSegment, 'text' | 'getaggteVerweisTeile'> & {
    text: GeschuetzterDarstellungstext;
    getaggteVerweisTeile?: readonly Readonly<{
      text: GeschuetzterDarstellungstext;
      verweis?: TextSegment['getaggterVerweis'];
    }>[];
  }
>;

function kennzeichne(text: string): GeschuetzterDarstellungstext {
  const wert = new Darstellungstext(text);
  Object.freeze(wert);
  return wert;
}

/** Schützt das vollständige Blatt; erzeugt keinen persistenten Zustand. */
export function geschuetzterBlatttext(original: string): GeschuetzterDarstellungstext {
  return kennzeichne(schuetzeLeerzeichen(original));
}

/** Schützt das vollständige Zitat einschließlich verkürzter Normangaben. */
export function geschuetzterZitattext(original: string): GeschuetzterDarstellungstext {
  return kennzeichne(schuetzeLeerzeichenZitat(original));
}

/** Erhält Schutz und UTF-16-Positionen. Ungültige Grenzen werfen RangeError. */
export function teileDarstellungstext(
  text: GeschuetzterDarstellungstext,
  von: number,
  bis: number,
): GeschuetzterDarstellungstext {
  if (
    !Number.isInteger(von) ||
    !Number.isInteger(bis) ||
    von < 0 ||
    bis < von ||
    bis > text.text.length
  ) {
    throw new RangeError('Darstellungsbereich liegt nicht innerhalb des vollständigen Texts.');
  }
  return kennzeichne(text.text.slice(von, bis));
}

/** Segmentiert bereits geschützten Volltext; Ziele und Metadaten bleiben dieselben Objekte. */
export function segmentiereDarstellungstext(
  text: GeschuetzterDarstellungstext,
  bereiche: Parameters<typeof segmentiere>[1],
  erhalteEintragsgrenzen = false,
): GeschuetztesDarstellungssegment[] {
  let position = 0;
  return segmentiere(text.text, bereiche, erhalteEintragsgrenzen).map((segment) => {
    const anfang = position;
    position += segment.text.length;
    const segmenttext = teileDarstellungstext(text, anfang, position);
    let teilPosition = 0;
    return {
      ...segment,
      text: segmenttext,
      getaggteVerweisTeile: segment.getaggteVerweisTeile?.map((teil) => {
        const start = teilPosition;
        teilPosition += teil.text.length;
        return { ...teil, text: teileDarstellungstext(segmenttext, start, teilPosition) };
      }),
    };
  });
}

/** Teilt allein die Anzeige, einschließlich getaggter Klickbereiche; Metadaten bleiben erhalten. */
export function teileDarstellungssegment(
  segment: GeschuetztesDarstellungssegment,
  von: number,
  bis: number,
): GeschuetztesDarstellungssegment {
  const text = teileDarstellungstext(segment.text, von, bis);
  let position = 0;
  const getaggteVerweisTeile = segment.getaggteVerweisTeile?.flatMap((teil) => {
    const start = position;
    position += teil.text.text.length;
    const ende = Math.min(bis, position);
    const anfang = Math.max(von, start);
    return ende > anfang
      ? [{ ...teil, text: teileDarstellungstext(teil.text, anfang - start, ende - start) }]
      : [];
  });
  return { ...segment, text, getaggteVerweisTeile };
}
