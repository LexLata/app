// messeScrollStand.ts
// Misst Titel und Normkörper der virtualisierten Blöcke ohne Kontextleistenpolster.
import type { DarstellungsElement } from '@/lib/domain/gesetzTypes';
import type { ScrollStand, ScrollSteuerungOptionen } from './ScrollSteuerung.types';
import type { ElementSichtbarkeit } from './aktivesElementNachfuehren';
import { textGrenzen } from './navigationGeometrie';
import { SCROLL_MARGIN } from './virtualizer';

type MessStand = Pick<ScrollStand, 'scrollTop' | 'viewportHoehe' | 'zeilen'>;

function messeElementSichtbarkeit(
  stand: MessStand,
  elemente: readonly DarstellungsElement[],
  container: HTMLDivElement,
  leisteHoehe: number,
): ElementSichtbarkeit[] {
  const oben = Math.max(0, leisteHoehe);
  if (stand.viewportHoehe <= oben) return [];
  const containerTop = container.getBoundingClientRect().top + container.clientTop;
  const sichtbarkeitsliste: ElementSichtbarkeit[] = [];
  function istSichtbar(bereich: Element | null): boolean {
    if (!bereich) return false;
    const rect = textGrenzen(bereich);
    return (
      rect.bottom > rect.top &&
      rect.bottom > containerTop + oben &&
      rect.top < containerTop + stand.viewportHoehe
    );
  }
  for (const zeile of stand.zeilen) {
    // Overscan ist kein sichtbarer Inhalt. Die Virtualizer-Koordinaten sind
    // relativ zum Inhalt; die tatsächlich gerenderte Liste beginnt am Scrollmargin.
    const top = SCROLL_MARGIN + zeile.start - stand.scrollTop;
    if (top + zeile.size <= oben || top >= stand.viewportHoehe) continue;
    const element = elemente[zeile.index];
    if (!element) continue;
    const block = container.querySelector(`[data-index="${zeile.index}"]`);
    if (!block) continue;
    // DOM-Grenzen statt einer geschätzten Titelhöhe berücksichtigen auch
    // mehrzeilige Titel. Eingeklappte Normen rendern keinen Körper.
    const titelSichtbar = istSichtbar(block.querySelector('.gt-klapp-zeile'));
    const koerperSichtbar =
      element.typ === 'norm' && istSichtbar(block.querySelector('[data-scroll-koerper]'));
    if (titelSichtbar || koerperSichtbar) {
      sichtbarkeitsliste.push({ id: element.data.id, titelSichtbar, koerperSichtbar });
    }
  }
  return sichtbarkeitsliste;
}

/** Ein Messstand enthält ausschließlich abgeleitete Daten, keinen eigenen Zustand. */
export function messeScrollStand(
  container: HTMLDivElement,
  zeilen: ScrollStand['zeilen'],
  optionen: Pick<ScrollSteuerungOptionen, 'sichtbareElemente' | 'leisteHoehe'>,
  benutzerscrollen: boolean,
): ScrollStand {
  const stand = { scrollTop: container.scrollTop, viewportHoehe: container.clientHeight, zeilen };
  return {
    ...stand,
    benutzerscrollen,
    sichtbarkeitsliste: messeElementSichtbarkeit(
      stand,
      optionen.sichtbareElemente,
      container,
      optionen.leisteHoehe ?? 0,
    ),
  };
}
