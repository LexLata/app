// Begrenzte Vorschau bekannter Kurztitel auf unverändertem Eingabetext, ohne I/O.
import { normalisiereKurztitelSuchform } from '@/lib/domain/kurztitelVergleich';

export type Kurztitelbestand = readonly Readonly<{ kurztitel: string }>[];

/** Nur für einen Analyselauf: Bestand einmal lesen, Suchformen und Vorschaugrenze vorbereiten. */
export function bereiteKurztitelsucheVor(bestand: Kurztitelbestand) {
  const suchformen = new Set<string>();
  let maximaleLaenge = 0;
  for (const kandidat of bestand) {
    const suchform = normalisiereKurztitelSuchform(kandidat.kurztitel);
    suchformen.add(suchform);
    maximaleLaenge = Math.max(maximaleLaenge, suchform.length);
  }

  return (text: string, start: number): number | undefined => {
    let trefferEnde: number | undefined;
    for (let ende = start + 1; ende <= text.length; ende++) {
      const letztesZeichen = text.charAt(ende - 1);
      if (/[,;]/.test(letztesZeichen)) break;
      if (/\s/.test(letztesZeichen)) continue;
      // Normalisierung des vollständigen Präfixes erhält auch kontextabhängige
      // Kleinschreibung (etwa griechisches Sigma) und beliebig langen Leerraum.
      const suchform = normalisiereKurztitelSuchform(text.slice(start, ende));
      // Der Schlusspunktfallback erlaubt auch Leerraum vor dem Punkt;
      // normalisiert sind das höchstens ein Leerzeichen und ein Punkt zusätzlich.
      if (suchform.length > maximaleLaenge + 2) break;
      if (/[\p{L}\p{N}_–—-]/u.test(text.charAt(ende))) continue;
      if (
        suchformen.has(suchform) ||
        (letztesZeichen === '.' &&
          suchformen.has(normalisiereKurztitelSuchform(text.slice(start, ende - 1))))
      )
        trefferEnde = ende;
    }
    return trefferEnde;
  };
}
