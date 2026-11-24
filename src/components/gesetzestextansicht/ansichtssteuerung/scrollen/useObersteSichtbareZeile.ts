// useObersteSichtbareZeile.ts
// Liefert on-demand (per Callback, nicht reaktiv) die oberste TATSÄCHLICH
// sichtbare Titel-/Überschriftzeile + Offset darin – für
// useKlappstufenNavigation.ts (⌘→/⌘←, "Scroll-Anker statt aktivesElementId").
//
// WICHTIG: NICHT zu verwechseln mit onFirstVisible/ankerRef (siehe
// useStrukturKontext.ts) – das ist für den Breadcrumb gebaut und nutzt
// absichtlich effektiveHoehe (inkl. "Polster"/Anticipation-Logik zur
// Flacker-Unterdrückung). Es kann bereits aus dem sichtbaren Bereich
// herausgescrollte Elemente liefern und taugt deshalb nicht als Scroll-Anker
// für Klapp-Operationen.
//
// WICHTIG (siehe Rückfrage/Antwort in der Entstehungsgeschichte): ein Item
// vereint TITEL und KOMPLETTEN Fließtext einer Norm in einem einzigen
// virtualisierten Block (ElementBlock rendert beides zusammen). "Wir befinden
// uns inhaltlich noch in diesem Item" (Item-Ende liegt hinter contentOffset)
// bedeutet deshalb NICHT automatisch, dass die TITEL-ZEILE selbst sichtbar
// ist – bei einer langen Norm kann der Titel längst nach oben aus dem Fenster
// gescrollt sein, während weiter unten im Fenster noch ihr Fließtext zu sehen
// ist. Relevant ist ausdrücklich die Titel-/Überschriftzeile selbst, daher
// wird zusätzlich geprüft, ob deren Bildschirmposition (titelScreenTop)
// tatsächlich zwischen Leistenunterkante und Fensterunterkante liegt.
//
// Fallback (keine Normzeile/keine Überschrift sichtbar, weil eine einzelne
// Norm den ganzen Viewport füllt): die NÄCHSTE Normzeile/Überschrift weiter
// unten im Dokument wird als Ziel verwendet (istFallback=true) –
// useKlappstufenNavigation.ts positioniert sie dann mit kleinem
// Sicherheitsabstand an der FENSTERUNTERKANTE statt an einer alten
// Pixel-Position (die es in diesem Fall ja nicht gibt).

import { useCallback } from 'react';
import type { RefObject } from 'react';
import type { Virtualizer } from '@tanstack/react-virtual';
import type { DarstellungsElement } from '@/lib/domain/gesetzTypes';
import { SCROLL_MARGIN } from './virtualizer';

export interface ObersteSichtbareZeile {
  index: number;
  offsetInItem: number;
  istFallback: boolean;
}

export interface ObersteSichtbareZeileOptionen {
  containerRef: RefObject<HTMLDivElement | null>;
  virtualizer: Virtualizer<HTMLDivElement, Element>;
  sichtbareElemente: readonly DarstellungsElement[];
  leisteHoeheRef: RefObject<number>;
}

export function useObersteSichtbareZeile({
  containerRef,
  virtualizer,
  sichtbareElemente,
  leisteHoeheRef,
}: ObersteSichtbareZeileOptionen) {
  return useCallback((): ObersteSichtbareZeile | null => {
    const container = containerRef.current;
    if (!container) return null;
    const items = virtualizer.getVirtualItems();
    if (items.length === 0) return null;
    const echteHoehe = Math.max(0, leisteHoeheRef.current);
    const contentOffset = Math.max(0, container.scrollTop - SCROLL_MARGIN + echteHoehe);
    const RUNDUNGSTOLERANZ = 2;

    // WICHTIG: das per contentOffset gefundene "aktuelle" Item (dessen Ende
    // erst hinter contentOffset liegt) hat per Definition IMMER start <=
    // contentOffset – seine eigene Titel-Zeile ist also nur GENAU DANN
    // sichtbar, wenn offsetInItem praktisch 0 ist. Sonst kann trotzdem schon
    // die NÄCHSTE Titel-Zeile normal sichtbar sein (z. B. wenn man sich dem
    // Ende einer Norm nähert). Deshalb hier ab dem aktuellen Item vorwärts
    // durch die weiteren gerenderten Items gehen, bis eines gefunden wird,
    // dessen Start wirklich im sichtbaren Fenster (zwischen Leistenunterkante
    // und Fensterunterkante) liegt.
    let aktuellesItem = items[0]!;
    for (const item of items) {
      if (item.start + item.size <= contentOffset) continue; // schon komplett vorbeigescrollt
      aktuellesItem = item;
      const titelScreenTop = SCROLL_MARGIN + item.start - container.scrollTop;
      if (
        titelScreenTop >= echteHoehe - RUNDUNGSTOLERANZ &&
        titelScreenTop <= container.clientHeight
      ) {
        return {
          index: item.index,
          offsetInItem: Math.max(0, contentOffset - item.start),
          istFallback: false,
        };
      }
      if (titelScreenTop > container.clientHeight) break; // weiter unten wird es nur noch schlimmer
    }

    const naechsterIndex = aktuellesItem.index + 1;
    if (naechsterIndex >= sichtbareElemente.length) return null; // Dokumentende erreicht
    return { index: naechsterIndex, offsetInItem: 0, istFallback: true };
  }, [sichtbareElemente, containerRef, leisteHoeheRef, virtualizer]);
}

/** Bildschirmposition des für Klappoperationen gewählten sichtbaren Titels. */
export function erfasseScrollAnker(
  container: HTMLDivElement | null,
  zeile: ObersteSichtbareZeile | null,
  elemente: readonly DarstellungsElement[],
): import('./ScrollSteuerung.types').ScrollAnker | null {
  const element = zeile && elemente[zeile.index];
  if (!zeile || !container || !element) return null;
  const dom = container.querySelector<HTMLElement>(`[data-index="${zeile.index}"]`);
  const bildschirmTop = zeile.istFallback
    ? container.getBoundingClientRect().bottom - 8
    : dom?.getBoundingClientRect().top;
  return bildschirmTop == null
    ? null
    : {
        elementId: element.data.id,
        offsetInItem: zeile.offsetInItem,
        bildschirmTop,
        istFallback: zeile.istFallback,
      };
}
