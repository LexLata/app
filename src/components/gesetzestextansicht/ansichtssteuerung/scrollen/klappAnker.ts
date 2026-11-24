// klappAnker.ts
// Erfasst den flüchtigen Klappanker und bildet den Auftrag ohne eigenen Zustand.
import type { DarstellungsElement } from '@/lib/domain/gesetzTypes';
import type { KlappAnker, ScrollAnker, ScrollAuftrag, ScrollStand } from './ScrollSteuerung.types';
import { messeScrollStand } from './messeScrollStand';
import { SCROLL_MARGIN } from './virtualizer';

export function erfasseKlappAnker(
  container: HTMLDivElement | null,
  zeilen: ScrollStand['zeilen'],
  elemente: readonly DarstellungsElement[],
  leisteHoehe: number,
  aktivesId: string | null,
  richtung: 'auf' | 'zu',
  rueckfall: () => ScrollAnker | null,
  laufenderAuftrag?: ScrollAuftrag,
): KlappAnker | null {
  if (laufenderAuftrag?.elementId === aktivesId) {
    if (laufenderAuftrag.art === 'anker-halten' && !laufenderAuftrag.anker.istFallback)
      return {
        ...laufenderAuftrag.anker,
        elementId: laufenderAuftrag.elementId,
        haltung: 'stelle',
      };
    if (laufenderAuftrag.art === 'sichtbar-machen')
      return {
        elementId: laufenderAuftrag.elementId,
        bildschirmTop: 0,
        offsetInItem: 0,
        istFallback: false,
        haltung: 'sichtbar-machen',
        ausrichtung: laufenderAuftrag.ausrichtung,
        animieren: laufenderAuftrag.animieren,
      };
  }
  const fallback = () => {
    const anker = rueckfall();
    return anker ? { ...anker, haltung: 'stelle' as const } : null;
  };
  if (!container) return fallback();
  const index = elemente.findIndex((element) => element.data.id === aktivesId);
  if (index < 0 || !aktivesId) return fallback();
  const stand = messeScrollStand(
    container,
    zeilen.filter((zeile) => zeile.index === index),
    { sichtbareElemente: elemente, leisteHoehe },
    false,
  );
  const sichtbar = stand.sichtbarkeitsliste.find((element) => element.id === aktivesId);
  const block = container.querySelector<HTMLElement>(`[data-index="${index}"]`);
  const zeile = zeilen.find((element) => element.index === index);
  if (!sichtbar || !block || !zeile) return fallback();
  const bildschirmTop = block.getBoundingClientRect().top;
  const zeilenTop = block.querySelector('.gt-klapp-zeile')?.getBoundingClientRect().top;
  const leisteUnten =
    container.getBoundingClientRect().top + container.clientTop + Math.max(0, leisteHoehe);
  if (
    richtung === 'zu' &&
    (!sichtbar.titelSichtbar || zeilenTop == null || zeilenTop < leisteUnten + 2)
  )
    return {
      elementId: aktivesId,
      bildschirmTop,
      offsetInItem: 0,
      istFallback: false,
      haltung: 'sichtbar-machen',
      ausrichtung: 'oben',
      animieren: false,
    };
  return {
    elementId: aktivesId,
    bildschirmTop,
    offsetInItem: sichtbar.titelSichtbar
      ? 0
      : Math.max(0, container.scrollTop - SCROLL_MARGIN + Math.max(0, leisteHoehe) - zeile.start),
    istFallback: false,
    haltung: 'stelle',
  };
}

export function erstelleKlappAuftrag(
  anker: KlappAnker,
  ziel: { zielId?: string | null; offsetInItem?: number },
  _richtung: 'auf' | 'zu',
): ScrollAuftrag {
  if (anker.haltung === 'sichtbar-machen')
    return {
      art: 'sichtbar-machen',
      elementId: ziel.zielId ?? anker.elementId,
      ausrichtung: anker.ausrichtung,
      animieren: anker.animieren,
    };
  return {
    art: 'anker-halten',
    elementId: ziel.zielId ?? anker.elementId,
    anker: {
      ...anker,
      offsetInItem: ziel.zielId === anker.elementId ? anker.offsetInItem : (ziel.offsetInItem ?? 0),
    },
  };
}
