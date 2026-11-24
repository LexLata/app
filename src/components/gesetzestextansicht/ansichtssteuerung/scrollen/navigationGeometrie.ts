// Örtliche Navigationsgeometrie und Renderbereich; keine dauerhafte Positionsquelle.
import type { Range } from '@tanstack/react-virtual';
export function textGrenzen(element: Element): { top: number; bottom: number } {
  const range = element.ownerDocument.createRange?.();
  if (range && typeof range.getBoundingClientRect === 'function') {
    range.selectNodeContents(element);
    const rect = range.getBoundingClientRect();
    if (rect.bottom > rect.top) return rect;
  }
  return element.getBoundingClientRect();
}

export function elementGrenzen(container: HTMLDivElement, index: number) {
  const block = container.querySelector(`[data-index="${index}"]`);
  const titel = block?.querySelector('.gt-klapp-zeile');
  if (!titel) return null;
  const koerper = block?.querySelector('[data-scroll-koerper]');
  const basis = container.scrollTop - container.getBoundingClientRect().top - container.clientTop;
  return {
    oben: basis + textGrenzen(titel).top,
    unten: basis + textGrenzen(koerper ?? titel).bottom,
  };
}

/** Unterkante des vollständigen Titels (Text von .gt-klapp-zeile) in scrollTop-Koordinaten;
 * null, wenn das Element nicht gerendert ist. */
export function titelUnten(container: HTMLDivElement, index: number): number | null {
  const titel = container.querySelector(`[data-index="${index}"] .gt-klapp-zeile`);
  if (!titel) return null;
  const basis = container.scrollTop - container.getBoundingClientRect().top - container.clientTop;
  return basis + textGrenzen(titel).bottom;
}

export function vollstaendigSichtbar(container: HTMLDivElement, index: number, leiste: number) {
  const grenzen = elementGrenzen(container, index);
  return (
    !!grenzen &&
    grenzen.oben >= container.scrollTop + leiste &&
    grenzen.unten <= container.scrollTop + container.clientHeight
  );
}

/** Bekannte Lagen der Bibliothek (gemessen oder geschätzt) und der sichtbare Bereich. */
export interface RenderGeometrie {
  readonly lagen: ArrayLike<{ readonly start: number; readonly end: number }>;
  readonly scrollOffset: number;
  readonly sichtHoehe: number;
}

/** Renderbereich mit Vorlauf in Pixeln: Ober- und unterhalb des sichtbaren Bereichs kommen ganze
 * Elemente hinzu, bis je Seite etwa eine Sichthöhe erreicht ist, mindestens eines je Seite. Ein
 * Sprungziel erhält denselben Vorlauf, als stünde es oben im sichtbaren Bereich (Lage nach der
 * Landung). Ohne Geometrie oder bei Sichthöhe 0 (Startphase) je Seite genau ein Element. */
export function renderbereichMitZiel(
  bereich: Range,
  index: number | null,
  geometrie: RenderGeometrie | null,
) {
  const sicht = geometrie?.sichtHoehe ?? 0;
  const indices = umfeld(bereich.startIndex, bereich.endIndex, geometrie?.scrollOffset ?? 0);
  if (index === null) return indices;
  const zielOben = geometrie?.lagen[index]?.start ?? 0;
  const ziel = umfeld(index, index, zielOben);
  return [...new Set([...indices, ...ziel])].sort((a, b) => a - b);

  function umfeld(von: number, bis: number, oben: number) {
    const lagen = geometrie?.lagen;
    const vorlauf = lagen && sicht > 0 ? sicht : 0;
    if (von > 0) von--;
    while (von > 0 && (lagen?.[von - 1]?.end ?? -Infinity) > oben - vorlauf) von--;
    if (bis < bereich.count - 1) bis++;
    while (
      bis < bereich.count - 1 &&
      (lagen?.[bis + 1]?.start ?? Infinity) < oben + sicht + vorlauf
    )
      bis++;
    return Array.from({ length: bis - von + 1 }, (_, i) => von + i);
  }
}
