// scrollHoehenAusgleich.ts
// Verbindet die DOM-Messhistorie mit dem Ausgleich von Höhenänderungen oberhalb der Lesestelle.
import { measureElement, type VirtualItem, type Virtualizer } from '@tanstack/react-virtual';
import { SCROLL_MARGIN } from './virtualizer';

type TextVirtualizer = Virtualizer<HTMLDivElement, Element>;

export function erstelleScrollHoehenAusgleich(
  leseZustand: () => { gesperrt: boolean; leisteHoehe: number },
) {
  const gemesseneElemente = new WeakSet<Element>();
  // TanStack ruft Messung und anschließenden Höhenausgleich synchron auf.
  // Sein Höhencache allein genügt nicht: Bei zutreffender Schätzung bleibt er leer.
  let istErstmessung = true;
  return {
    messeGerenderteZeilen(container: HTMLElement | null, instanz: TextVirtualizer) {
      // Erst alle echten Höhen lesen; Scrollstatus und Cache dürfen sie nicht ersetzen.
      const hoehen = [...(container?.querySelectorAll<HTMLElement>('[data-index]') ?? [])].map(
        (dom) => ({ index: instanz.indexFromElement(dom), hoehe: dom.offsetHeight }),
      );
      hoehen.forEach(({ index, hoehe }) => instanz.resizeItem(index, hoehe));
    },
    messeElement(
      this: void,
      element: Element,
      eintrag: ResizeObserverEntry | undefined,
      instanz: TextVirtualizer,
    ) {
      istErstmessung = !gemesseneElemente.has(element);
      gemesseneElemente.add(element);
      return measureElement(element, eintrag, instanz);
    },
    sollteAusgleichen(this: void, zeile: VirtualItem, _delta: number, instanz: TextVirtualizer) {
      const { gesperrt, leisteHoehe } = leseZustand();
      const sichtbarerBeginn = (instanz.scrollOffset ?? 0) - SCROLL_MARGIN + leisteHoehe;
      return (
        !gesperrt &&
        (istErstmessung && !instanz.itemSizeCache.has(zeile.key)
          ? zeile.start < sichtbarerBeginn
          : zeile.end <= sichtbarerBeginn && instanz.scrollDirection !== 'backward')
      );
    },
  };
}
