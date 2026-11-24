// Erfasst lokale Anzeigewechsel; leere Zwischenzustände erhalten das letzte Gesetz.
import { useEffect, useEffectEvent, useRef } from 'react';
import type { Gesetzesreferenz } from '@/lib/domain/gesetzTypes';
import { gesetzesreferenzSchluessel } from '@/lib/domain/gesetzesreferenz';
import { merkeAnzeige } from '@/lib/persistenz/nutzerdaten/zuletztAngezeigtSpeicher';

export function useZuletztAngezeigt(gesetz: Gesetzesreferenz | null): void {
  const schluessel = gesetz ? gesetzesreferenzSchluessel(gesetz) : null;
  const letzterSchluessel = useRef<string | null>(null);
  const erfasseAnzeige = useEffectEvent(() => {
    if (gesetz) merkeAnzeige(gesetz);
  });
  useEffect(() => {
    if (!schluessel || schluessel === letzterSchluessel.current) return;
    erfasseAnzeige();
    letzterSchluessel.current = schluessel;
  }, [schluessel]);
}
