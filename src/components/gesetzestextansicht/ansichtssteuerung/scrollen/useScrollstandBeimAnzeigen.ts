// Setzt den Scrollstand beim ersten Aufbau auf die geschätzte Startposition und
// dient als Scrollmerker der Tab-Bereithaltung: Beim Verdecken wird der Stand gemerkt
// und bei der Aktivierung vor dem ersten Bild zurückgesetzt, falls er verloren ging.
import { schreibeScrollPosition } from '@/lib/utils/scrollAufzeichnungDiagnose';
import { useLayoutEffect, useRef, type RefObject } from 'react';

export function useScrollstandBeimAnzeigen(
  containerRef: RefObject<HTMLElement | null>,
  initialOffset: number | null,
) {
  const startRef = useRef(initialOffset);
  const gemerktRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const container = containerRef.current;
    // Nur beim Aufbau; Activity führt den Effekt bei jeder Aktivierung erneut aus.
    if (!container || startRef.current === null) return;
    if (startRef.current) schreibeScrollPosition(container, startRef.current, 'startposition');
    startRef.current = null;
  }, [containerRef]);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const gemerkt = gemerktRef.current;
    gemerktRef.current = null;
    // Nur einen tatsächlich verlorenen Stand zurückschreiben; StrictMode-Wiederholungen
    // und unveränderte Stände erzeugen so keine Schreibzugriffe.
    if (gemerkt !== null && container.scrollTop !== gemerkt)
      schreibeScrollPosition(container, gemerkt, 'tab-anzeigen');
    return () => {
      gemerktRef.current = container.scrollTop;
    };
  }, [containerRef]);
}
