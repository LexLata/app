// useViewportBreite.ts
//
// Liefert die aktuelle Viewport-Breite reaktiv (per matchMedia-Listener,
// nicht per Resize-Polling) sowie daraus abgeleitete Breakpoint-Flags.
// Bewusst generisch gehalten (Breite als Zahl + Grenzwert als Konstante),
// nicht als hartcodiertes "istHandy"-Bool, damit sich eine spätere
// Tablet-Ansicht als zusätzlicher Breakpoint einfügen lässt, statt diesen
// Hook nachträglich umbauen zu müssen (siehe Mobile-Plan, Abschnitt 3c).
//
// v1 nutzt nur `istTablet` nicht aktiv (Tablet-Layout ist explizit nicht
// Teil von v1), aber MobileSeitenleiste.tsx und MobileApp.tsx sollen ohne
// Umbau darauf zugreifen können, sobald die Tablet-Ansicht kommt.

import { useEffect, useState } from 'react';

/** Kleinste Breite (in CSS-px), ab der ein Gerät als Tablet gilt – deckt
 *  sich bewusst mit der Android-Size-Qualifier-Schwelle sw600dp aus dem
 *  Mobile-Plan (Info.plist/AndroidManifest-Anpassungen). */
const TABLET_BREAKPOINT_PX = 600;

export interface ViewportBreite {
  breite: number;
  istTablet: boolean;
}

function leseBreite(): number {
  return typeof window === 'undefined' ? 0 : window.innerWidth;
}

export function useViewportBreite(): ViewportBreite {
  const [breite, setBreite] = useState(leseBreite);

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${TABLET_BREAKPOINT_PX}px)`);
    const aktualisieren = () => setBreite(leseBreite());
    mql.addEventListener('change', aktualisieren);
    window.addEventListener('orientationchange', aktualisieren);
    return () => {
      mql.removeEventListener('change', aktualisieren);
      window.removeEventListener('orientationchange', aktualisieren);
    };
  }, []);

  return { breite, istTablet: breite >= TABLET_BREAKPOINT_PX };
}
