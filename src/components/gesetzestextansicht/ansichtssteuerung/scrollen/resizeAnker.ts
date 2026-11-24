// resizeAnker.ts
// Hält die feste Bildschirmkoordinate am oberen Textbereichsrand über Layoutänderungen.
import { schreibeScrollPosition } from '@/lib/utils/scrollAufzeichnungDiagnose';
import type { DarstellungsElement } from '@/lib/domain/gesetzTypes';
import type { ScrollVorgang } from './ScrollVorgang';
import { SCROLL_MARGIN } from './virtualizer';
interface ResizeAnker {
  index: number;
  elementId: string;
  top: number;
  scrollTop: number;
  breite: number;
}
interface ResizeMessgrundlage {
  container: HTMLDivElement | null;
  zeilen: readonly { index: number; start: number; size: number }[];
  elemente: readonly DarstellungsElement[];
  messKorrektur: boolean;
  gesperrt: boolean;
  eigeneScrollPosition: number | null;
  offsetFuerIndex: (index: number) => number | undefined;
  eigenePosition: (position: number) => void;
}
function istBrowserBegrenzung(
  container: HTMLDivElement,
  referenz: ResizeAnker,
  indexwechsel: boolean,
  messKorrektur: boolean,
) {
  if (!indexwechsel || !messKorrektur) return false;
  const maximum = Math.max(0, container.scrollHeight - container.clientHeight);
  return referenz.scrollTop > maximum && Math.abs(container.scrollTop - maximum) <= 0.5;
}
export function erstelleResizeAnker(grundlage: () => ResizeMessgrundlage) {
  const anker: {
    current: ResizeAnker | null;
    nachfuehren: typeof fuehreResizeAnkerNach;
    korrigiereGeste: typeof korrigiereGeste;
    starteKorrektur: typeof starteKorrektur;
  } = {
    current: null,
    nachfuehren: fuehreResizeAnkerNach,
    korrigiereGeste,
    starteKorrektur,
  };
  function fuehreResizeAnkerNach(indexwechsel = false, stabilisieren = false): number | undefined {
    const { container, zeilen, elemente, messKorrektur } = grundlage();
    if (!container) return;
    const offset = Math.max(0, container.scrollTop - SCROLL_MARGIN);
    const index = zeilen.find((zeile) => zeile.start + zeile.size > offset)?.index;
    const referenz = anker.current;
    if (
      !referenz ||
      (stabilisieren &&
        !indexwechsel &&
        !messKorrektur &&
        referenz.breite === container.clientWidth)
    ) {
      const dom =
        index == null ? null : container.querySelector<HTMLElement>(`[data-index="${index}"]`);
      if (dom && index != null)
        anker.current = {
          index,
          elementId: elemente[index]!.data.id,
          top: dom.getBoundingClientRect().top,
          scrollTop: container.scrollTop,
          breite: container.clientWidth,
        };
      return index;
    }
    // Beim Schrumpfen der Liste begrenzt der Browser die bisherige Position auf
    // das neue Scrollmaximum. Das ist keine Bedienung: Bezugstelle und ihr
    // Renderindex müssen während der Layoutkorrektur zusammen erhalten bleiben.
    if (istBrowserBegrenzung(container, referenz, indexwechsel, messKorrektur)) {
      referenz.scrollTop = container.scrollTop;
      return referenz.index;
    }
    if (indexwechsel) referenz.top -= container.scrollTop - referenz.scrollTop;
    referenz.scrollTop = container.scrollTop;
    if (!indexwechsel || index == null || index === referenz.index) return referenz.index;
    const dom = container.querySelector<HTMLElement>(`[data-index="${index}"]`);
    const vorherigesDom = container.querySelector<HTMLElement>(`[data-index="${referenz.index}"]`);
    if (!vorherigesDom && messKorrektur) return referenz.index;
    const ausstehendesDelta = vorherigesDom
      ? vorherigesDom.getBoundingClientRect().top - referenz.top
      : 0;
    anker.current = dom
      ? {
          index,
          elementId: elemente[index]!.data.id,
          top: dom.getBoundingClientRect().top - ausstehendesDelta,
          scrollTop: container.scrollTop,
          breite: container.clientWidth,
        }
      : null;
    return index;
  }
  function rueckeAnkerInRenderbereich(
    container: HTMLDivElement,
    index: number,
    referenz: ResizeAnker,
  ) {
    const offset = grundlage().offsetFuerIndex(index);
    if (offset == null) return;
    schreibeScrollPosition(
      container,
      Math.max(0, offset + SCROLL_MARGIN + container.getBoundingClientRect().top - referenz.top),
      'resize-renderbereich',
    );
    referenz.scrollTop = container.scrollTop;
    grundlage().eigenePosition(container.scrollTop);
  }
  function korrigiereGeste() {
    const { container, elemente, gesperrt, eigenePosition } = grundlage();
    if (!container || gesperrt) return;
    uebernehmeAusstehendeBewegung();
    const index = fuehreResizeAnkerNach();
    if (index == null) return;
    const dom = container.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (!dom) return;
    const top = dom.getBoundingClientRect().top;
    const referenz = anker.current;
    if (!referenz || referenz.index !== index) {
      anker.current = {
        index,
        elementId: elemente[index]!.data.id,
        top,
        scrollTop: container.scrollTop,
        breite: container.clientWidth,
      };
    } else if (Math.abs(top - referenz.top) > 0.5) {
      schreibeScrollPosition(container, container.scrollTop + (top - referenz.top), 'resize-geste');
      referenz.scrollTop = container.scrollTop;
      eigenePosition(container.scrollTop);
    }
  }
  function uebernehmeAusstehendeBewegung() {
    const { container, eigeneScrollPosition } = grundlage();
    if (
      container &&
      anker.current &&
      container.scrollTop !== anker.current.scrollTop &&
      container.scrollTop !== eigeneScrollPosition
    )
      fuehreResizeAnkerNach(true);
  }
  function gleicheAnkerAus(): boolean {
    const { container, elemente, eigenePosition } = grundlage();
    const referenz = anker.current;
    if (!referenz || !container) return true;
    const index = elemente.findIndex((el) => el.data.id === referenz.elementId);
    const dom = index >= 0 ? container.querySelector<HTMLElement>(`[data-index="${index}"]`) : null;
    if (!dom) {
      if (index >= 0) rueckeAnkerInRenderbereich(container, index, referenz);
      return false;
    }
    const delta = dom.getBoundingClientRect().top - referenz.top;
    if (Math.abs(delta) <= 0.5) return true;
    schreibeScrollPosition(container, container.scrollTop + delta, 'resize-anker');
    referenz.scrollTop = container.scrollTop;
    eigenePosition(container.scrollTop);
    return false;
  }
  function starteKorrektur(
    vorgang: ScrollVorgang,
    optionen: { messeZeilen: () => void; abgeschlossen: (stabil: boolean) => void },
  ) {
    let versuche = 0;
    let stabileFrames = 0;
    let frameAusstehend = false;
    const korrigieren = (bild = false) => {
      if (!vorgang.istGueltig()) return;
      const { container, gesperrt } = grundlage();
      if (!container || gesperrt) return;
      versuche++;
      uebernehmeAusstehendeBewegung();
      optionen.messeZeilen();
      if (!gleicheAnkerAus()) stabileFrames = 0;
      else if (bild) stabileFrames++;
      if (versuche < 20 && stabileFrames < 2) {
        if (!frameAusstehend) {
          frameAusstehend = true;
          vorgang.frame(() => {
            frameAusstehend = false;
            korrigieren(true);
          });
        }
      } else {
        optionen.abgeschlossen(stabileFrames >= 2);
        vorgang.beenden();
      }
    };
    return () => korrigieren();
  }
  return anker;
}
