// useScrollEreignisse.ts
// Bündelt Scrollereignisse pro Frame und erhält die Herkunft eigener Positionskorrekturen.
import { useEffect, useEffectEvent, type RefObject } from 'react';
import { elementScroll, type Virtualizer } from '@tanstack/react-virtual';

/** Nach dem Schreiben den tatsächlichen (ggf. begrenzten) Wert merken. Die
 * Kennung endet beim nächsten Scrollereignis; sie ist kein aktives Element. */
export function eigeneScrollFunktion(position: RefObject<number | null>) {
  return (
    offset: number,
    optionen: { adjustments?: number; behavior?: ScrollBehavior },
    instanz: Virtualizer<HTMLDivElement, Element>,
  ) => {
    elementScroll(offset, optionen, instanz);
    position.current = instanz.scrollElement?.scrollTop ?? null;
  };
}

export function useScrollEreignisse(optionen: {
  containerRef: RefObject<HTMLDivElement | null>;
  sichtbareElemente: unknown;
  eigenePosition: RefObject<number | null>;
  istGesperrt(): boolean;
  leseBedienung(): number;
  onBenutzerscrollen(): void;
  onScrollAbsicht?(): void;
  meldeStand(benutzerscrollen?: boolean): void;
  fuehreAnkerNach(indexwechsel: boolean): void;
}) {
  const { containerRef, sichtbareElemente } = optionen;
  const aktuell = useEffectEvent(() => optionen);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let beendet = false;
    let scrollFrame: number | null = null;
    let benutzerscrollen = false;
    let bedienung = aktuell().leseBedienung();
    const onScroll = () => {
      if (aktuell().istGesperrt()) return;
      if (bedienung !== aktuell().leseBedienung()) benutzerscrollen = false;
      bedienung = aktuell().leseBedienung();
      const eigenesEreignis = aktuell().eigenePosition.current === container.scrollTop;
      aktuell().eigenePosition.current = null;
      if (!eigenesEreignis) aktuell().onBenutzerscrollen();
      aktuell().fuehreAnkerNach(!eigenesEreignis);
      benutzerscrollen ||= !eigenesEreignis;
      if (scrollFrame !== null) return;
      scrollFrame = requestAnimationFrame(() => {
        scrollFrame = null;
        if (beendet) return;
        if (!aktuell().istGesperrt())
          aktuell().meldeStand(benutzerscrollen && bedienung === aktuell().leseBedienung());
        benutzerscrollen = false;
      });
    };
    const absicht = () => aktuell().onScrollAbsicht?.();
    const taste = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        !container.contains(document.activeElement) ||
        !(event.target instanceof window.Element) ||
        !container.contains(event.target) ||
        event.target.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
        ) ||
        (event.key === ' ' && event.target.closest('button, summary, a[href], [role="button"]'))
      )
        return;
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key))
        absicht();
    };
    container.addEventListener('wheel', absicht, { passive: true });
    container.addEventListener('touchstart', absicht, { passive: true });
    container.addEventListener('pointerdown', absicht, { passive: true });
    window.addEventListener('keydown', taste);
    container.addEventListener('scroll', onScroll, { passive: true });
    aktuell().meldeStand();
    return () => {
      beendet = true;
      container.removeEventListener('wheel', absicht);
      container.removeEventListener('touchstart', absicht);
      container.removeEventListener('pointerdown', absicht);
      window.removeEventListener('keydown', taste);
      container.removeEventListener('scroll', onScroll);
      if (scrollFrame !== null) cancelAnimationFrame(scrollFrame);
    };
  }, [containerRef, sichtbareElemente]);
}
