// useScrollNachfuehrung.ts
// Besitzt nur die vorübergehende 250-ms-Frist; das aktive Element bleibt im Strukturzustand.
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { aktivesElementNachfuehren, type ScrollStand } from './scrollen/scrollen.index';

export function useScrollNachfuehrung(optionen: {
  standLesen(): ScrollStand | null;
  bereit: boolean;
  gesperrt: boolean;
  aktivesElementId: string | null;
  aktivieren(id: string): void;
  vorlaeufigMelden?(id: string | null): void;
}) {
  const aktuell = useRef(optionen);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const entwerten = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    aktuell.current.vorlaeufigMelden?.(null);
  }, []);
  useLayoutEffect(() => {
    aktuell.current = optionen;
    if (optionen.gesperrt || !optionen.bereit) entwerten();
  });
  const fuehreFaelligeNach = useCallback((): boolean => {
    const opts = aktuell.current;
    if (!opts.bereit || opts.gesperrt) return false;
    const stand = opts.standLesen();
    if (!stand) return false;
    const id = aktivesElementNachfuehren(opts.aktivesElementId, stand.sichtbarkeitsliste);
    if (id === null || id === opts.aktivesElementId) return false;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    opts.aktivieren(id);
    opts.vorlaeufigMelden?.(null);
    return true;
  }, []);
  const vormerken = useCallback(
    (stand: ScrollStand) => {
      const opts = aktuell.current;
      if (!opts.bereit || opts.gesperrt) {
        entwerten();
        return;
      }
      // Reine Zwischenmessungen beenden keine laufende Benutzergeste.
      // Sprünge, Bedienung und Layoutwechsel entwerten ausdrücklich.
      if (!stand.benutzerscrollen) return;
      if (timer.current !== null) clearTimeout(timer.current);
      opts.vorlaeufigMelden?.(
        aktivesElementNachfuehren(opts.aktivesElementId, stand.sichtbarkeitsliste),
      );
      timer.current = setTimeout(() => {
        timer.current = null;
        fuehreFaelligeNach();
        aktuell.current.vorlaeufigMelden?.(null);
      }, 250);
    },
    [entwerten, fuehreFaelligeNach],
  );
  useEffect(() => entwerten, [entwerten]);
  return { entwerten, vormerken, fuehreFaelligeNach };
}
