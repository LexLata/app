// Gemeinsame Hierarchie von Überschriften, Gliederungsartikeln und Normen.
import type { DarstellungsElement } from './gesetzTypes';

export function ermittleEbene(el: DarstellungsElement): number {
  if (el.typ === 'ueberschrift') return el.data.ebene;
  return el.data.art === 'gliederungsartikel' ? el.data.gliederungsEbene : Number.POSITIVE_INFINITY;
}

// Unmittelbarer Eltern-Index jedes Elements der vollen elemente-Liste
// ("Kapitel"-Zuordnung für ArrowRight/ArrowLeft auf einer Normzeile sowie
// Eltern-Suche für ArrowLeft/⇧+ArrowLeft) – dieselbe Stack-Logik wie
// berechneVisibleElemente, nur zur Bestimmung von "wer ist der unmittelbare
// Container von wem" statt von Sichtbarkeit.
// Exportiert: wird auch von useKlappstufenNavigation.ts (⌘→/←) für die
// Eltern-/Geschwister-Berechnungen der vier Klapp-Stufen wiederverwendet.
export function ermittleElternIndizes(elemente: DarstellungsElement[]): (number | null)[] {
  const elternIndizes: (number | null)[] = new Array<number | null>(elemente.length).fill(null);
  const stack: { index: number; ebene: number }[] = [];
  for (let i = 0; i < elemente.length; i++) {
    // elemente[i] beweisbar sicher durch die Schleifen-Invariante.
    const ebene = ermittleEbene(elemente[i]!);
    if (ebene !== Number.POSITIVE_INFINITY) {
      // stack[length-1] beweisbar sicher durch die length>0-Prüfung.
      while (stack.length > 0 && stack[stack.length - 1]!.ebene >= ebene) stack.pop();
    }
    elternIndizes[i] = stack.length > 0 ? stack[stack.length - 1]!.index : null;
    if (ebene !== Number.POSITIVE_INFINITY) stack.push({ index: i, ebene });
  }
  return elternIndizes;
}

/** Der nächste Gliederungsartikel in der Elternkette umfasst auch sich selbst. */
export function ermittleUmfassendenGliederungsartikel(
  elemente: DarstellungsElement[],
  aktivesElementId: string | null | undefined,
) {
  let index: number | null = elemente.findIndex((el) => el.data.id === aktivesElementId);
  if (index < 0) return null;
  const eltern = ermittleElternIndizes(elemente);
  while (index !== null) {
    const element = elemente[index];
    if (!element) return null;
    if (element.typ === 'norm' && element.data.art === 'gliederungsartikel') return element.data;
    index = eltern[index] ?? null;
  }
  return null;
}
